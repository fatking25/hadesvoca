/**
 * 실전 회화 스테이지·Day 정적 JSON에 대응하는 순수 타입 (로직 없음).
 */

export type ConversationContentSchemaVersion = '1'

/** 나레이션(상황 설명 등) 블록 */
export interface ConversationNarration {
  readonly id: string
  readonly textKo: string
  readonly textEn?: string
}

/** 대화 한 줄 */
export interface ConversationDialogueLine {
  readonly id: string
  readonly speakerId?: string
  readonly speakerLabelKo?: string
  readonly textKo: string
  readonly textEn: string
}

/** 핵심 표현 */
export interface ConversationKeyExpression {
  readonly id: string
  readonly expressionEn: string
  readonly expressionKo: string
  readonly tipKo?: string
}

export interface ConversationQuizOption {
  readonly id: string
  readonly text: string
}

export type ConversationQuizType = 'multiple-choice'

export interface ConversationQuiz {
  readonly type: ConversationQuizType
  readonly id: string
  readonly promptKo: string
  readonly promptEn?: string
  /** 정답 확인 후 표시(선택). JSON에는 표시 문구만 둠 */
  readonly explanationKo?: string
  readonly explanationEn?: string
  readonly options: readonly ConversationQuizOption[]
  readonly correctOptionId: string
}

/** 하루치 회화 콘텐츠 */
export interface ConversationDay {
  readonly dayId: number
  readonly titleKo: string
  readonly descriptionKo?: string
  /** 장면 한눈에 요약(컷씬·나레이션 중앙 문구). 없으면 `descriptionKo`로 대체 */
  readonly sceneDescriptionKo?: string
  /** 컷씬·배경 placeholder (실제 에셋 없을 때 경로만 보관) */
  readonly cutsceneImagePath?: string
  readonly narrations: readonly ConversationNarration[]
  readonly dialogue: readonly ConversationDialogueLine[]
  readonly keyExpressions: readonly ConversationKeyExpression[]
  readonly quiz: readonly ConversationQuiz[]
}

/**
 * `/content/conversations/stage-{n}.json` 루트
 * (파일 하나에 스테이지 전체 + 여러 Day)
 */
export interface ConversationStage {
  readonly schemaVersion: ConversationContentSchemaVersion
  readonly stageId: number
  readonly stageTitleKo?: string
  readonly stageDescriptionKo?: string
  readonly days: readonly ConversationDay[]
}
