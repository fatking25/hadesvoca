/** 결과 화면에 같이 표시하기 위한 간단 오답 스냅샷(JSON·저장 분리 유지용 순수 문자열만) */
export interface WordStudyWrongItemSummary {
  readonly questionId: string
  readonly wordHeadwordEn: string
  readonly meaningKo: string
  readonly questionTypeLabel: string
  /** 문제 유형별 짧은 제시 문자열 */
  readonly snapshotPrompt: string
}

/** `navigate(..., { state })` 로 넘기는 학습 세션 요약 — 영속 저장 없음 */
export interface WordStudyQuizResultNavigateState {
  readonly correctCount: number
  readonly wrongCount: number
  /** 학습 시작 시 고정 분량 (= finished 시 정답+오답). 구버전 state 없으면 `correct+wrong` 으로 보충 가능 */
  readonly totalQuestions?: number
  readonly wrongItems?: readonly WordStudyWrongItemSummary[]
  /** 결과 화면에서 `localStorage` 반영 한 번만 하기 위한 토큰(Strict Mode·재실행 방지용) */
  readonly persistNonce?: string
}

function isWrongItemSummary(x: unknown): x is WordStudyWrongItemSummary {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.questionId === 'string' &&
    typeof o.wordHeadwordEn === 'string' &&
    typeof o.meaningKo === 'string' &&
    typeof o.questionTypeLabel === 'string' &&
    typeof o.snapshotPrompt === 'string'
  )
}

export function isWordStudyQuizResultNavigateState(
  x: unknown
): x is WordStudyQuizResultNavigateState {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  if (typeof o.correctCount !== 'number' || !Number.isFinite(o.correctCount)) return false
  if (typeof o.wrongCount !== 'number' || !Number.isFinite(o.wrongCount)) return false
  const wi = o.wrongItems
  if (
    wi !== undefined &&
    (!Array.isArray(wi) || !wi.every((item) => isWrongItemSummary(item)))
  ) {
    return false
  }
  if (
    o.totalQuestions !== undefined &&
    (typeof o.totalQuestions !== 'number' || !Number.isFinite(o.totalQuestions))
  ) {
    return false
  }
  if (o.persistNonce !== undefined && typeof o.persistNonce !== 'string') {
    return false
  }
  return true
}

/** 결과 화면에서 쓸 정규화된 값 */
export function normalizeWordStudyResultState(
  s: WordStudyQuizResultNavigateState
): Required<Pick<WordStudyQuizResultNavigateState, 'totalQuestions' | 'wrongItems'>> &
  Pick<WordStudyQuizResultNavigateState, 'correctCount' | 'wrongCount'> {
  const inferredTotal = Math.max(
    0,
    typeof s.totalQuestions === 'number' && Number.isFinite(s.totalQuestions)
      ? s.totalQuestions
      : s.correctCount + s.wrongCount
  )
  const wrongItems = Array.isArray(s.wrongItems) ? s.wrongItems : []
  return {
    correctCount: s.correctCount,
    wrongCount: s.wrongCount,
    totalQuestions: inferredTotal,
    wrongItems,
  }
}
