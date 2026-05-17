import { createContext, useContext } from 'react'

/** 퀴즈 종료 후 `navigate(..., { state })`로만 전달 (직접 URL 진입 시 없음) */
export type ConversationDayResultLocationState = {
  readonly fromFlow: true
  readonly quizCorrect: number
  readonly quizTotal: number
  readonly skippedQuiz?: boolean
  /** 같은 스테이지 기준 다음 Day; 없으면 `null`(목록으로 유도) */
  readonly nextDayId: number | null
  /** `localStorage` 반영 한 번만 (Strict Mode용) — 표현 퀴즈 포함 세션 종료 시 항상 전달 */
  readonly persistNonce: string
  /**
   * 틀린 표현 객관식의 `quiz.id`(콘텐츠 JSON id). 오답노트 `WrongNoteRef.type === 'expression'`에만 씀.
   */
  readonly wrongQuizIds: readonly string[]
}

export type ConversationSessionValue = {
  readonly completedDayKeys: ReadonlySet<string>
  readonly recordDayCompletion: (stageId: number, dayId: number) => void
  readonly isDayComplete: (stageId: number, dayId: number) => boolean
}

export const ConversationSessionContext =
  createContext<ConversationSessionValue | null>(null)

export function useConversationSession(): ConversationSessionValue {
  const ctx = useContext(ConversationSessionContext)
  if (ctx === null) {
    throw new Error('useConversationSession must be used within ConversationSessionProvider')
  }
  return ctx
}
