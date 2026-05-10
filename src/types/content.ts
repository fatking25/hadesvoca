/**
 * `public/content/` Stage·Day 단어 학습 JSON과 1:1에 가깝게 대응하는 순수 데이터 타입.
 * (채점·저장 등 런타임 로직은 포함하지 않음)
 */

export type WordStudyContentSchemaVersion = '1'

// ----- public/content/stage-metadata.json -----

export interface StageMetadataEntry {
  readonly id: number
  readonly titleKo: string
  readonly descriptionKo?: string
  readonly wordContentPath: string
  readonly dayIds: readonly number[]
}

export interface StageMetadataFile {
  readonly schemaVersion: WordStudyContentSchemaVersion
  readonly stages: readonly StageMetadataEntry[]
}

// ----- public/content/words/stage-{n}.json -----

export type WordContentQuestionType =
  | 'word-to-meaning'
  | 'meaning-to-word'
  | 'fill-blank'

export interface WordContentOption {
  readonly id: string
  readonly text: string
}

interface WordContentQuestionBase {
  readonly id: string
  readonly options: readonly WordContentOption[]
  /** 4지선다 정답의 `options[].id`와 일치 */
  readonly correctOptionId: string
}

export interface WordContentQuestionWordToMeaning extends WordContentQuestionBase {
  readonly type: 'word-to-meaning'
  readonly promptEn: string
}

export interface WordContentQuestionMeaningToWord extends WordContentQuestionBase {
  readonly type: 'meaning-to-word'
  readonly promptKo: string
}

/**
 * 빈칸 문제. 문장 소스는 `blankSentence`(선택) → 없으면 `templateEn`.
 * 둘 다 `WORD_CONTENT_BLANK_TOKEN` 포함을 권장.
 */
export interface WordContentQuestionFillBlank extends WordContentQuestionBase {
  readonly type: 'fill-blank'
  readonly templateEn: string
  readonly blankSentence?: string
}

export type WordContentQuestion =
  | WordContentQuestionWordToMeaning
  | WordContentQuestionMeaningToWord
  | WordContentQuestionFillBlank

export interface WordContentEntry {
  readonly id: string
  readonly word: string
  readonly meaning: string
  readonly exampleSentence: string
  readonly exampleMeaning: string
  readonly explanation: string
  readonly questions: readonly WordContentQuestion[]
}

export interface StageWordsDaySection {
  readonly dayId: number
  readonly titleKo: string
  readonly descriptionKo?: string
  readonly words: readonly WordContentEntry[]
}

export interface StageWordsFile {
  readonly schemaVersion: WordStudyContentSchemaVersion
  readonly stageId: number
  readonly stageTitleKo?: string
  readonly stageDescriptionKo?: string
  readonly days: readonly StageWordsDaySection[]
}

/** 빈칸 토큰 — `WordContentQuestionFillBlank.templateEn`에서 사용 */
export const WORD_CONTENT_BLANK_TOKEN = '{{blank}}' as const
