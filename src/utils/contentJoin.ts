/**
 * 화면 표시 단계에서 사용자 저장 데이터(참조 id)와 `public/content/` 정적 JSON 본문을 join 하기 위한 헬퍼.
 *
 * 원칙:
 * - `UserProgress`(localStorage)에는 콘텐츠 본문을 저장하지 않는다.
 * - 콘텐츠는 표시 시점에만 stage 단위로 fetch 하고, 모듈 단위 메모리 캐시로 재진입 시 즉시 그린다.
 * - 캐시는 Promise 단위로 보관해 동시 요청도 한 번만 네트워크에 나간다.
 * - 실패한 Promise는 캐시에서 제거되어, 화면 재진입 시 재시도가 가능하다.
 */
import { fetchStageWordsByStageId, getConversationStage } from '../api/contentApi'
import type {
  StageWordsDaySection,
  StageWordsFile,
  WordContentEntry,
  WordContentQuestion,
} from '../types/content'
import type {
  ConversationDay,
  ConversationKeyExpression,
  ConversationQuiz,
  ConversationStage,
} from '../types/conversation'

const wordStageCache = new Map<number, Promise<StageWordsFile>>()
const conversationStageCache = new Map<number, Promise<ConversationStage>>()

export function stageIdKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',')
}

export function parseStageIdKey(key: string): readonly number[] {
  if (key === '') return []
  return key.split(',').map((s) => Number(s))
}

/** stage 단어 패키지를 캐시 우선으로 로드한다. 실패 Promise는 캐시에서 제거된다. */
export function loadStageWordsCached(stageId: number): Promise<StageWordsFile> {
  const cached = wordStageCache.get(stageId)
  if (cached !== undefined) return cached
  const p = fetchStageWordsByStageId(stageId)
  wordStageCache.set(stageId, p)
  p.catch(() => {
    wordStageCache.delete(stageId)
  })
  return p
}

/** stage 회화 패키지를 캐시 우선으로 로드한다. 실패 Promise는 캐시에서 제거된다. */
export function loadConversationStageCached(stageId: number): Promise<ConversationStage> {
  const cached = conversationStageCache.get(stageId)
  if (cached !== undefined) return cached
  const p = getConversationStage(stageId)
  conversationStageCache.set(stageId, p)
  p.catch(() => {
    conversationStageCache.delete(stageId)
  })
  return p
}

function findWordDaySection(
  pack: StageWordsFile,
  dayId: number | undefined,
): StageWordsDaySection | null {
  if (dayId === undefined) return null
  return pack.days.find((d) => d.dayId === dayId) ?? null
}

function findConversationDay(
  stage: ConversationStage,
  dayId: number,
): ConversationDay | null {
  return stage.days.find((d) => d.dayId === dayId) ?? null
}

/**
 * lemmaId 로 단어 본문 entry 를 찾는다.
 * `dayId` 가 주어지면 해당 Day 안에서, 없으면 stage 전체에서 탐색한다.
 */
export function findWordEntry(
  pack: StageWordsFile,
  dayId: number | undefined,
  lemmaId: string,
): WordContentEntry | null {
  if (dayId !== undefined) {
    const sec = findWordDaySection(pack, dayId)
    if (sec === null) return null
    return sec.words.find((w) => w.id === lemmaId) ?? null
  }
  for (const sec of pack.days) {
    const hit = sec.words.find((w) => w.id === lemmaId)
    if (hit !== undefined) return hit
  }
  return null
}

/** 단어 퀴즈 question.id 로 (소속 entry + question) 묶음을 찾는다. */
export function findWordQuestionWithEntry(
  pack: StageWordsFile,
  dayId: number,
  questionId: string,
): Readonly<{ entry: WordContentEntry; question: WordContentQuestion }> | null {
  const sec = findWordDaySection(pack, dayId)
  if (sec === null) return null
  for (const w of sec.words) {
    const q = w.questions.find((qq) => qq.id === questionId)
    if (q !== undefined) return { entry: w, question: q }
  }
  return null
}

/** 회화 표현 퀴즈 quiz.id 로 quiz 본문을 찾는다. */
export function findExpressionQuiz(
  stage: ConversationStage,
  dayId: number,
  quizId: string,
): ConversationQuiz | null {
  const d = findConversationDay(stage, dayId)
  if (d === null) return null
  return d.quiz.find((q) => q.id === quizId) ?? null
}

/** 회화 핵심 표현 expression.id 로 본문을 찾는다. */
export function findKeyExpression(
  stage: ConversationStage,
  dayId: number,
  expressionId: string,
): ConversationKeyExpression | null {
  const d = findConversationDay(stage, dayId)
  if (d === null) return null
  return d.keyExpressions.find((e) => e.id === expressionId) ?? null
}

/** 단어 퀴즈의 프롬프트 문자열(타입별 분기). UI 라벨링 없이 본문만 반환한다. */
export function getWordQuestionPrompt(q: WordContentQuestion): string {
  if (q.type === 'word-to-meaning') return q.promptEn
  if (q.type === 'meaning-to-word') return q.promptKo
  return q.blankSentence ?? q.templateEn
}

/** options 배열에서 correctOptionId 와 일치하는 텍스트를 안전하게 뽑는다. 없으면 빈 문자열. */
export function getCorrectOptionText(
  options: ReadonlyArray<{ readonly id: string; readonly text: string }>,
  correctOptionId: string,
): string {
  return options.find((o) => o.id === correctOptionId)?.text ?? ''
}
