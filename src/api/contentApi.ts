/**
 * `public/content/` ?뺤쟻 JSON ?꾩슜 濡쒕뜑 (fetch). ?ъ슜??吏꾪뻾쨌????곗씠?곗? 遺꾨━.
 */
import type { StageMetadataFile, StageWordsFile } from '../types/content'
import type { ConversationStage, ConversationStageIndex } from '../types/conversation'
import { fetchContentText, parseContentJson } from './contentFetch'

const STAGE_METADATA_REL = 'content/stage-metadata.json'
const CONTENT_SCHEMA_VERSION = '1'
const WORD_QUESTION_TYPES = new Set(['word-to-meaning', 'meaning-to-word', 'fill-blank'])
const CONVERSATION_DAY_DIFFICULTIES = new Set(['low', 'medium', 'high'])
const CONVERSATION_SCENE_IMAGE_KEYS = ['intro', 'dialogue', 'review'] as const
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

/** ?붾㈃?먯꽌 濡쒕뵫쨌?깃났쨌?ㅽ뙣瑜??섎닃 ???ъ슜 (?좏깮) */
export type RemoteContentState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

export function isContentFetchError(e: unknown): e is ContentFetchError {
  return e instanceof ContentFetchError
}

export function resolvePublicUrl(pathFromSiteRoot: string): string {
  const trimmed = pathFromSiteRoot.replace(/^\/+/, '')
  const baseRaw = import.meta.env.BASE_URL
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`
  return `${base}${trimmed}`
}

async function fetchText(url: string): Promise<string> {
  return fetchContentText(url)
}

function parseJson(url: string, text: string): unknown {
  return parseContentJson(url, text)
}

function assertStageMetadata(data: unknown, url: string): StageMetadataFile {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('stage-metadata: ?좏슚?섏? ?딆? ?곗씠?곗엯?덈떎.', url)
  }
  const o = data as Record<string, unknown>
  if (o.schemaVersion !== CONTENT_SCHEMA_VERSION || !Array.isArray(o.stages)) {
    throw new ContentFetchError('stage-metadata: ?덉긽 ?ㅽ궎留덉? 留욎? ?딆뒿?덈떎.', url)
  }
  return data as StageMetadataFile
}

function assertStageWords(data: unknown, url: string): StageWordsFile {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?좏슚?섏? ?딆? ?곗씠?곗엯?덈떎.', url)
  }
  const o = data as Record<string, unknown>
  if (
    o.schemaVersion !== CONTENT_SCHEMA_VERSION ||
    typeof o.stageId !== 'number' ||
    !Array.isArray(o.days)
  ) {
    throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?덉긽 ?ㅽ궎留덉? 留욎? ?딆뒿?덈떎.', url)
  }
  for (const day of o.days) {
    if (typeof day !== 'object' || day === null) {
      throw new ContentFetchError('?⑥뼱 ?⑦궎吏: Day ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
    }
    const d = day as Record<string, unknown>
    if (typeof d.dayId !== 'number' || typeof d.titleKo !== 'string') {
      throw new ContentFetchError('?⑥뼱 ?⑦궎吏: Day 湲곕낯 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
    }
    if (!Array.isArray(d.words)) {
      throw new ContentFetchError('?⑥뼱 ?⑦궎吏: Day ?⑥뼱 紐⑸줉???щ컮瑜댁? ?딆뒿?덈떎.', url)
    }
    for (const word of d.words) {
      if (typeof word !== 'object' || word === null) {
        throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?⑥뼱 ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
      }
      const w = word as Record<string, unknown>
      if (
        typeof w.id !== 'string' ||
        typeof w.word !== 'string' ||
        typeof w.meaning !== 'string'
      ) {
        throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?⑥뼱 湲곕낯 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
      }
      if (!Array.isArray(w.questions)) {
        throw new ContentFetchError('?⑥뼱 ?⑦궎吏: 臾몄젣 紐⑸줉???щ컮瑜댁? ?딆뒿?덈떎.', url)
      }
      for (const question of w.questions) {
        if (typeof question !== 'object' || question === null) {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: 臾몄젣 ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
        }
        const qItem = question as Record<string, unknown>
        if (
          typeof qItem.id !== 'string' ||
          typeof qItem.type !== 'string' ||
          !WORD_QUESTION_TYPES.has(qItem.type) ||
          typeof qItem.correctOptionId !== 'string'
        ) {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: 臾몄젣 湲곕낯 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
        }
        if (!Array.isArray(qItem.options) || qItem.options.length < 2) {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: 臾몄젣 ?좏깮吏媛 遺議깊빀?덈떎.', url)
        }
        const optionIds = new Set<string>()
        for (const opt of qItem.options) {
          if (typeof opt !== 'object' || opt === null) {
            throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?좏깮吏 ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
          }
          const op = opt as Record<string, unknown>
          if (typeof op.id !== 'string' || typeof op.text !== 'string') {
            throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?좏깮吏 湲곕낯 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
          }
          optionIds.add(op.id)
        }
        if (!optionIds.has(qItem.correctOptionId)) {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?뺣떟 ?좏깮吏瑜?李얠쓣 ???놁뒿?덈떎.', url)
        }
        if (qItem.type === 'word-to-meaning' && typeof qItem.promptEn !== 'string') {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ?곸뼱 ?⑥뼱 臾몄젣 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
        }
        if (qItem.type === 'meaning-to-word' && typeof qItem.promptKo !== 'string') {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: ??怨좊Ⅴ湲?臾몄젣 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
        }
        if (
          qItem.type === 'fill-blank' &&
          typeof qItem.templateEn !== 'string' &&
          typeof qItem.blankSentence !== 'string'
        ) {
          throw new ContentFetchError('?⑥뼱 ?⑦궎吏: 鍮덉뭏 臾몄젣 ?뺣낫媛 ?щ컮瑜댁? ?딆뒿?덈떎.', url)
        }
      }
    }
  }
  return data as StageWordsFile
}

function assertConversationSceneImages(data: unknown, url: string): void {
  if (data === undefined) return
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 Day sceneImages ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  const sceneImages = data as Record<string, unknown>
  for (const key of CONVERSATION_SCENE_IMAGE_KEYS) {
    const sceneImage = sceneImages[key]
    if (sceneImage === undefined) continue
    if (
      typeof sceneImage !== 'object' ||
      sceneImage === null ||
      Array.isArray(sceneImage)
    ) {
      throw new ContentFetchError(`?ㅼ쟾 ?뚰솕 Day sceneImages.${key} ?뺤떇 ?ㅻ쪟?낅땲??`, url)
    }
    const img = sceneImage as Record<string, unknown>
    if (typeof img.imagePath !== 'string' || img.imagePath.trim() === '') {
      throw new ContentFetchError(
        `?ㅼ쟾 ?뚰솕 Day sceneImages.${key}.imagePath ?뺤떇 ?ㅻ쪟?낅땲??`,
        url,
      )
    }
    if (img.altKo !== undefined && typeof img.altKo !== 'string') {
      throw new ContentFetchError(
        `?ㅼ쟾 ?뚰솕 Day sceneImages.${key}.altKo ?뺤떇 ?ㅻ쪟?낅땲??`,
        url,
      )
    }
  }
}

function assertConversationResponseQuiz(data: unknown, url: string): void {
  if (data === undefined) return
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  const quiz = data as Record<string, unknown>
  if (
    quiz.type !== 'next-line-choice' ||
    typeof quiz.promptKo !== 'string' ||
    typeof quiz.correctOptionId !== 'string'
  ) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz 湲곕낯 ?꾨뱶 ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  if (quiz.promptEn !== undefined && typeof quiz.promptEn !== 'string') {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz promptEn ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  if (quiz.explanationKo !== undefined && typeof quiz.explanationKo !== 'string') {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz explanationKo ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  if (quiz.explanationEn !== undefined && typeof quiz.explanationEn !== 'string') {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz explanationEn ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  if (!Array.isArray(quiz.options) || quiz.options.length === 0) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz options 媛 鍮꾩뿀?듬땲??', url)
  }
  const optionIds = new Set<string>()
  for (const opt of quiz.options) {
    if (typeof opt !== 'object' || opt === null) {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz ?좏깮吏 ?뺤떇 ?ㅻ쪟?낅땲??', url)
    }
    const option = opt as Record<string, unknown>
    if (typeof option.id !== 'string' || typeof option.text !== 'string') {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 dialogue responseQuiz ?좏깮吏 id/text ?뺤떇 ?ㅻ쪟?낅땲??', url)
    }
    optionIds.add(option.id)
  }
  if (!optionIds.has(quiz.correctOptionId)) {
    throw new ContentFetchError(
      '?ㅼ쟾 ?뚰솕 dialogue responseQuiz correctOptionId 媛 options 以??대뼡 id ????쇱튂?섏? ?딆뒿?덈떎.',
      url,
    )
  }
}

function assertConversationStage(data: unknown, url: string): ConversationStage {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: ?좏슚?섏? ?딆? ?곗씠?곗엯?덈떎.', url)
  }
  const o = data as Record<string, unknown>
  if (o.schemaVersion !== CONTENT_SCHEMA_VERSION || typeof o.stageId !== 'number') {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: ?덉긽 ?ㅽ궎留덉? 留욎? ?딆뒿?덈떎.', url)
  }
  if (!Array.isArray(o.days)) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: ?덉긽 ?ㅽ궎留덉? 留욎? ?딆뒿?덈떎.', url)
  }
  for (const day of o.days) {
    if (typeof day !== 'object' || day === null) {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: Day ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
    }
    const d = day as Record<string, unknown>
    if (typeof d.dayId !== 'number' || typeof d.titleKo !== 'string') {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: Day ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
    }
    if (
      d.difficulty !== undefined &&
      (typeof d.difficulty !== 'string' ||
        !CONVERSATION_DAY_DIFFICULTIES.has(d.difficulty))
    ) {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: Day difficulty ?뺤떇 ?ㅻ쪟?낅땲??', url)
    }
    assertConversationSceneImages(d.sceneImages, url)
    if (
      !Array.isArray(d.narrations) ||
      !Array.isArray(d.dialogue) ||
      !Array.isArray(d.keyExpressions) ||
      !Array.isArray(d.quiz)
    ) {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: Day narrations/dialogue/keyExpressions/quiz 諛곗뿴 ?뺤떇 ?ㅻ쪟?낅땲??', url)
    }
    for (const dialogueLine of d.dialogue) {
      if (typeof dialogueLine !== 'object' || dialogueLine === null) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: dialogue ??ぉ ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      const line = dialogueLine as Record<string, unknown>
      if (
        typeof line.id !== 'string' ||
        typeof line.textKo !== 'string' ||
        typeof line.textEn !== 'string'
      ) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: dialogue id/textKo/textEn ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      if (line.speakerId !== undefined && typeof line.speakerId !== 'string') {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: dialogue speakerId ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      if (
        line.speakerLabelKo !== undefined &&
        typeof line.speakerLabelKo !== 'string'
      ) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: dialogue speakerLabelKo ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      assertConversationResponseQuiz(line.responseQuiz, url)
    }
    for (const quiz of d.quiz) {
      if (typeof quiz !== 'object' || quiz === null) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: quiz ??ぉ ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      const qItem = quiz as Record<string, unknown>
      if (
        qItem.type !== 'multiple-choice' &&
        qItem.type !== 'next-line-choice' &&
        qItem.type !== 'pattern-fill-blank' &&
        qItem.type !== 'blank-bubble-fill'
      ) {
        throw new ContentFetchError(
          '?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: 吏?먰븯吏 ?딅뒗 quiz type ?낅땲??',
          url,
        )
      }
      if (
        typeof qItem.id !== 'string' ||
        typeof qItem.promptKo !== 'string' ||
        typeof qItem.correctOptionId !== 'string'
      ) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: quiz id/promptKo/correctOptionId ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      if (!Array.isArray(qItem.options) || qItem.options.length === 0) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: quiz options 媛 鍮꾩뿀?듬땲??', url)
      }
      if (
        qItem.expressionId !== undefined &&
        typeof qItem.expressionId !== 'string'
      ) {
        throw new ContentFetchError('??쇱읈 ??곗넅 ??쎈???: quiz expressionId ?類ㅻ뻼 ??살첒??낅빍??', url)
      }
      if (
        qItem.type === 'next-line-choice' &&
        typeof qItem.partnerLineEn !== 'string'
      ) {
        throw new ContentFetchError('??쇱읈 ??곗넅 ??쎈???: next-line-choice partnerLineEn ?類ㅻ뻼 ??살첒??낅빍??', url)
      }
      if (
        qItem.type === 'pattern-fill-blank' &&
        typeof qItem.templateEn !== 'string'
      ) {
        throw new ContentFetchError('??쇱읈 ??곗넅 ??쎈???: pattern-fill-blank templateEn ?類ㅻ뻼 ??살첒??낅빍??', url)
      }
      if (
        qItem.type === 'blank-bubble-fill' &&
        (typeof qItem.templateEn !== 'string' ||
          !qItem.templateEn.includes('{{blank}}'))
      ) {
        throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: blank-bubble-fill templateEn ?뺤떇 ?ㅻ쪟?낅땲??', url)
      }
      const optionIds = new Set<string>()
      for (const opt of qItem.options) {
        if (typeof opt !== 'object' || opt === null) {
          throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: quiz ?좏깮吏 ?뺤떇 ?ㅻ쪟?낅땲??', url)
        }
        const op = opt as Record<string, unknown>
        if (typeof op.id !== 'string' || typeof op.text !== 'string') {
          throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: quiz ?좏깮吏 id/text ?뺤떇 ?ㅻ쪟?낅땲??', url)
        }
        optionIds.add(op.id)
      }
      if (!optionIds.has(qItem.correctOptionId)) {
        throw new ContentFetchError(
          '?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁?: correctOptionId 媛 options 以??대뼡 id ????쇱튂?섏? ?딆뒿?덈떎.',
          url,
        )
      }
    }
  }
  return data as ConversationStage
}

function assertConversationStageIndex(
  data: unknown,
  url: string,
): ConversationStageIndex {
  if (typeof data !== 'object' || data === null) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index: ?좏슚?섏? ?딆? ?곗씠?곗엯?덈떎.', url)
  }
  const o = data as Record<string, unknown>
  if (
    o.schemaVersion !== CONTENT_SCHEMA_VERSION ||
    typeof o.stageId !== 'number' ||
    !Array.isArray(o.dayFiles)
  ) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index: ?덉긽 ?ㅽ궎留덉? 留욎? ?딆뒿?덈떎.', url)
  }
  if (o.dayFiles.length === 0) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index: dayFiles 媛 鍮꾩뿀?듬땲??', url)
  }
  for (const file of o.dayFiles) {
    if (typeof file !== 'string' || file.trim() === '') {
      throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index: dayFiles ??ぉ???щ컮瑜댁? ?딆뒿?덈떎.', url)
    }
  }
  if (
    o.stageTitleKo !== undefined &&
    typeof o.stageTitleKo !== 'string'
  ) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index: stageTitleKo ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  if (
    o.stageDescriptionKo !== undefined &&
    typeof o.stageDescriptionKo !== 'string'
  ) {
    throw new ContentFetchError('?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index: stageDescriptionKo ?뺤떇 ?ㅻ쪟?낅땲??', url)
  }
  return data as ConversationStageIndex
}

/**
 * `/content/stage-metadata.json` 濡쒕뱶
 */
export async function fetchStageMetadata(): Promise<StageMetadataFile> {
  const url = resolvePublicUrl(STAGE_METADATA_REL)
  const text = await fetchText(url)
  const raw = parseJson(url, text)
  return assertStageMetadata(raw, url)
}

/**
 * Stage ?⑥뼱 JSON 濡쒕뱶. `StageMetadataEntry.wordContentPath` 媛믪쓣 洹몃?濡??섍린硫???(?? `/content/words/stage-1.json`).
 */
export async function fetchStageWordsFile(wordContentPath: string): Promise<StageWordsFile> {
  const url = resolvePublicUrl(wordContentPath)
  const text = await fetchText(url)
  const raw = parseJson(url, text)
  return assertStageWords(raw, url)
}

/**
 * 愿濡 寃쎈줈 `/content/words/stage-{stageId}.json` 濡쒕뱶
 */
export async function fetchStageWordsByStageId(stageId: number): Promise<StageWordsFile> {
  return fetchStageWordsFile(`/content/words/stage-${stageId}.json`)
}

/**
 * `content/` 湲곗? ?곷? ?먮뒗 `/content/conversations/stage-{n}.json` ?뺥깭 寃쎈줈???뚰솕 ?⑦궎吏 濡쒕뱶
 */
export async function fetchConversationStageFile(conversationContentPath: string): Promise<ConversationStage> {
  const url = resolvePublicUrl(conversationContentPath)
  const text = await fetchText(url)
  const raw = parseJson(url, text)
  return assertConversationStage(raw, url)
}

async function fetchConversationStageIndexFile(
  conversationIndexPath: string,
): Promise<ConversationStageIndex> {
  const url = resolvePublicUrl(conversationIndexPath)
  let text: string
  try {
    text = await fetchText(url)
  } catch (cause) {
    throw new ContentFetchError(
      `?ㅼ쟾 ?뚰솕 ?ㅽ뀒?댁? index瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${conversationIndexPath}`,
      url,
      cause,
    )
  }
  const raw = parseJson(url, text)
  return assertConversationStageIndex(raw, url)
}

async function fetchConversationDayFile(dayPath: string): Promise<unknown> {
  const url = resolvePublicUrl(dayPath)
  let text: string
  try {
    text = await fetchText(url)
  } catch (cause) {
    throw new ContentFetchError(
      `?ㅼ쟾 ?뚰솕 Day ?뚯씪??遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${dayPath}`,
      url,
      cause,
    )
  }
  return parseJson(url, text)
}

/**
 * 愿濡 寃쎈줈 `/content/conversations/stage-{stageId}/index.json` ? Day ?뚯씪?ㅼ쓣 議곕┰??濡쒕뱶
 */
export async function getConversationStage(stageId: number): Promise<ConversationStage> {
  const stageDir = `/content/conversations/stage-${stageId}`
  const indexPath = `${stageDir}/index.json`
  const index = await fetchConversationStageIndexFile(indexPath)
  const days = await Promise.all(
    index.dayFiles.map((dayFile) =>
      fetchConversationDayFile(`${stageDir}/${dayFile}`),
    ),
  )
  const stage: ConversationStage = {
    schemaVersion: index.schemaVersion,
    stageId: index.stageId,
    stageTitleKo: index.stageTitleKo,
    stageDescriptionKo: index.stageDescriptionKo,
    days: days as ConversationStage['days'],
  }
  return assertConversationStage(stage, resolvePublicUrl(indexPath))
}
