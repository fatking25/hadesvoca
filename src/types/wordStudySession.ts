/** 결과 화면에 같이 표시하기 위한 간단 오답 스냅샷(JSON·저장 분리 유지용 순수 문자열만) */
export interface WordStudyWrongItemSummary {
  readonly questionId: string
  /** 복습 대상 등록용 단어 참조 ID. 구버전 navigate state 에서는 없을 수 있다. */
  readonly lemmaId?: string
  readonly wordHeadwordEn: string
  readonly meaningKo: string
  readonly questionTypeLabel: string
  /** 문제 유형별 짧은 제시 문자열 */
  readonly snapshotPrompt: string
}

/**
 * 단어 학습 세션의 종류(Phase 11-7).
 *
 * - `word-day`    : 일반 Word Day 학습. 결과 화면에서 보상/완료 처리를 한다(기존 흐름).
 * - `word-review` : Word Day 기반 복습 세션. 결과 화면에서 보상/완료/`completedWordDays` 변경을 하지 않는다.
 *   복습 결과 반영(레벨업/리셋 등)은 Phase 11-8 에서 추가된다.
 */
export type WordStudySessionMode = 'word-day' | 'word-review'

/** `navigate(..., { state })` 로 넘기는 학습 세션 요약 — 영속 저장 없음 */
export interface WordStudyQuizResultNavigateState {
  readonly correctCount: number
  readonly wrongCount: number
  /**
   * 실제 출제된 단어 참조 ID 목록. 복습 결과 저장 시 lemma 단위 정답/오답 집계에 사용한다.
   * 본문은 저장하지 않고 콘텐츠 참조 ID만 전달한다.
   */
  readonly answeredLemmaIds?: readonly string[]
  /** 학습 시작 시 고정 분량 (= finished 시 정답+오답). 구버전 state 없으면 `correct+wrong` 으로 보충 가능 */
  readonly totalQuestions?: number
  readonly wrongItems?: readonly WordStudyWrongItemSummary[]
  /** 결과 화면에서 `localStorage` 반영 한 번만 하기 위한 토큰(Strict Mode·재실행 방지용) */
  readonly persistNonce?: string
  /**
   * 해당 Day 의 단어 수. 결과 화면에서 최초 완료 보상의 `totalMemorizedWords` 증분에 사용.
   * 구버전 state 에서 누락되면 0 으로 간주(=암기 카운트 증가 없음, 보상은 그대로).
   */
  readonly dayWordsCount?: number
  /**
   * 해당 Stage 가 포함하는 모든 Day id. Stage 최초 완료 판정에만 사용.
   * 누락 시 결과 화면 단계에서 Stage 보상 처리를 skip 한다(=다음 Day 완료 때 다시 판정).
   */
  readonly stageDayIds?: readonly number[]
  /**
   * 세션 모드. 누락 시 `word-day` 로 해석한다(구버전 state 호환).
   * `word-review` 인 경우 결과 화면은 보상/완료/`completedWordDays` 갱신을 하지 않는다.
   */
  readonly mode?: WordStudySessionMode
  /**
   * 복습 세션 시작 시점의 현재 Word Day. 복습 스케줄은 실제 날짜가 아니라 이 Day 번호로 계산한다.
   */
  readonly reviewCurrentWordDayId?: number
}

function isWrongItemSummary(x: unknown): x is WordStudyWrongItemSummary {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.questionId === 'string' &&
    (o.lemmaId === undefined || typeof o.lemmaId === 'string') &&
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
  if (
    o.answeredLemmaIds !== undefined &&
    (!Array.isArray(o.answeredLemmaIds) ||
      !o.answeredLemmaIds.every((v) => typeof v === 'string'))
  ) {
    return false
  }
  if (o.persistNonce !== undefined && typeof o.persistNonce !== 'string') {
    return false
  }
  if (
    o.dayWordsCount !== undefined &&
    (typeof o.dayWordsCount !== 'number' || !Number.isFinite(o.dayWordsCount))
  ) {
    return false
  }
  if (
    o.stageDayIds !== undefined &&
    (!Array.isArray(o.stageDayIds) ||
      !o.stageDayIds.every(
        (v) => typeof v === 'number' && Number.isFinite(v),
      ))
  ) {
    return false
  }
  if (
    o.mode !== undefined &&
    o.mode !== 'word-day' &&
    o.mode !== 'word-review'
  ) {
    return false
  }
  if (
    o.reviewCurrentWordDayId !== undefined &&
    (typeof o.reviewCurrentWordDayId !== 'number' ||
      !Number.isFinite(o.reviewCurrentWordDayId))
  ) {
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
