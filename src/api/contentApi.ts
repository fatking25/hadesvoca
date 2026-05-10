/**
 * `public/content/` 정적 JSON 전용 로더 (fetch). 사용자 진행·저장 데이터와 분리.
 */
import type { StageMetadataFile, StageWordsFile } from '../types/content'
import type { ConversationStage } from '../types/conversation'

const STAGE_METADATA_REL = 'content/stage-metadata.json'

export class ContentFetchError extends Error {
  readonly url: string
  override readonly cause?: unknown

  constructor(message: string, url: string, cause?: unknown) {
    super(message)
    this.name = 'ContentFetchError'
    this.url = url
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

/** 화면에서 로딩·성공·실패를 나눌 때 사용 (선택) */
export type RemoteContentState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

export function isContentFetchError(e: unknown): e is ContentFetchError {
  return e instanceof ContentFetchError
}

function resolvePublicUrl(pathFromSiteRoot: string): string {
  const trimmed = pathFromSiteRoot.replace(/^\/+/, '')
  return `${import.meta.env.BASE_URL}${trimmed}`
}

async function fetchText(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (cause) {
    throw new ContentFetchError('네트워크 오류로 콘텐츠를 불러오지 못했습니다.', url, cause)
  }
  if (!res.ok) {
    throw new ContentFetchError(`콘텐츠 요청 실패 (HTTP ${res.status})`, url)
  }
  return res.text()
}

function parseJson(url: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new ContentFetchError('JSON 형식이 올바르지 않습니다.', url, cause)
  }
}

function assertStageMetadata(data: unknown, url: string): StageMetadataFile {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('stage-metadata: 유효하지 않은 데이터입니다.', url)
  }
  const o = data as Record<string, unknown>
  if (o.schemaVersion !== '1' || !Array.isArray(o.stages)) {
    throw new ContentFetchError('stage-metadata: 예상 스키마와 맞지 않습니다.', url)
  }
  return data as StageMetadataFile
}

function assertStageWords(data: unknown, url: string): StageWordsFile {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('단어 패키지: 유효하지 않은 데이터입니다.', url)
  }
  const o = data as Record<string, unknown>
  if (o.schemaVersion !== '1' || typeof o.stageId !== 'number' || !Array.isArray(o.days)) {
    throw new ContentFetchError('단어 패키지: 예상 스키마와 맞지 않습니다.', url)
  }
  return data as StageWordsFile
}

function assertConversationStage(data: unknown, url: string): ConversationStage {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('실전 회화 스테이지: 유효하지 않은 데이터입니다.', url)
  }
  const o = data as Record<string, unknown>
  if (o.schemaVersion !== '1' || typeof o.stageId !== 'number') {
    throw new ContentFetchError('실전 회화 스테이지: 예상 스키마와 맞지 않습니다.', url)
  }
  if (!Array.isArray(o.days)) {
    throw new ContentFetchError('실전 회화 스테이지: 예상 스키마와 맞지 않습니다.', url)
  }
  for (const day of o.days) {
    if (typeof day !== 'object' || day === null) {
      throw new ContentFetchError('실전 회화 스테이지: Day 항목이 올바르지 않습니다.', url)
    }
    const d = day as Record<string, unknown>
    if (typeof d.dayId !== 'number' || typeof d.titleKo !== 'string') {
      throw new ContentFetchError('실전 회화 스테이지: Day 항목이 올바르지 않습니다.', url)
    }
    if (
      !Array.isArray(d.narrations) ||
      !Array.isArray(d.dialogue) ||
      !Array.isArray(d.keyExpressions) ||
      !Array.isArray(d.quiz)
    ) {
      throw new ContentFetchError('실전 회화 스테이지: Day narrations/dialogue/keyExpressions/quiz 배열 형식 오류입니다.', url)
    }
    for (const quiz of d.quiz) {
      if (typeof quiz !== 'object' || quiz === null) {
        throw new ContentFetchError('실전 회화 스테이지: quiz 항목 형식 오류입니다.', url)
      }
      const qItem = quiz as Record<string, unknown>
      if (qItem.type !== 'multiple-choice') {
        throw new ContentFetchError(
          '실전 회화 스테이지: 퀴즈 type은 현재 multiple-choice 만 지원합니다.',
          url,
        )
      }
      if (
        typeof qItem.id !== 'string' ||
        typeof qItem.promptKo !== 'string' ||
        typeof qItem.correctOptionId !== 'string'
      ) {
        throw new ContentFetchError('실전 회화 스테이지: quiz id/promptKo/correctOptionId 형식 오류입니다.', url)
      }
      if (!Array.isArray(qItem.options) || qItem.options.length === 0) {
        throw new ContentFetchError('실전 회화 스테이지: quiz options 가 비었습니다.', url)
      }
      const optionIds = new Set<string>()
      for (const opt of qItem.options) {
        if (typeof opt !== 'object' || opt === null) {
          throw new ContentFetchError('실전 회화 스테이지: quiz 선택지 형식 오류입니다.', url)
        }
        const op = opt as Record<string, unknown>
        if (typeof op.id !== 'string' || typeof op.text !== 'string') {
          throw new ContentFetchError('실전 회화 스테이지: quiz 선택지 id/text 형식 오류입니다.', url)
        }
        optionIds.add(op.id)
      }
      if (!optionIds.has(qItem.correctOptionId)) {
        throw new ContentFetchError(
          '실전 회화 스테이지: correctOptionId 가 options 중 어떤 id 와도 일치하지 않습니다.',
          url,
        )
      }
    }
  }
  return data as ConversationStage
}

/**
 * `/content/stage-metadata.json` 로드
 */
export async function fetchStageMetadata(): Promise<StageMetadataFile> {
  const url = resolvePublicUrl(STAGE_METADATA_REL)
  const text = await fetchText(url)
  const raw = parseJson(url, text)
  return assertStageMetadata(raw, url)
}

/**
 * Stage 단어 JSON 로드. `StageMetadataEntry.wordContentPath` 값을 그대로 넘기면 됨 (예: `/content/words/stage-1.json`).
 */
export async function fetchStageWordsFile(wordContentPath: string): Promise<StageWordsFile> {
  const url = resolvePublicUrl(wordContentPath)
  const text = await fetchText(url)
  const raw = parseJson(url, text)
  return assertStageWords(raw, url)
}

/**
 * 관례 경로 `/content/words/stage-{stageId}.json` 로드
 */
export async function fetchStageWordsByStageId(stageId: number): Promise<StageWordsFile> {
  return fetchStageWordsFile(`/content/words/stage-${stageId}.json`)
}

/**
 * `content/` 기준 상대 또는 `/content/conversations/stage-{n}.json` 형태 경로의 회화 패키지 로드
 */
export async function fetchConversationStageFile(conversationContentPath: string): Promise<ConversationStage> {
  const url = resolvePublicUrl(conversationContentPath)
  const text = await fetchText(url)
  const raw = parseJson(url, text)
  return assertConversationStage(raw, url)
}

/**
 * 관례 경로 `/content/conversations/stage-{stageId}.json` 로드
 */
export async function getConversationStage(stageId: number): Promise<ConversationStage> {
  return fetchConversationStageFile(`/content/conversations/stage-${stageId}.json`)
}
