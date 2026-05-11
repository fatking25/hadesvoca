/**
 * Phase 6-2: `UserProgress`와 (필요 시) 콘텐츠에서 가져온 Stage Day 수만으로 파생하는 학습 통계.
 * localStorage가 비었거나 필드가 비어 있어도 항상 유한한 값·null만 반환한다.
 */

import type {
  CompletedConversationDayRef,
  CompletedWordDayRef,
  UserProgress,
} from '../types/user-progress'
import { DEFAULT_DAILY_WORD_GOAL, formatLocalDateKey } from '../types/user-progress'

/** 오답 노트에 쌓인 “틀린 횟수” 합(정답 수와는 별개·참고용) */
export function sumWrongNoteAttempts(progress: UserProgress): number {
  let s = 0
  for (const w of progress.wrongNotes) {
    if (Number.isFinite(w.wrongCount) && w.wrongCount > 0) s += w.wrongCount
  }
  return s
}

/**
 * 정답·오답 개수로 비율을 구한다. 총합이 0이면 `null`(화면에서 “기록 없음” 등).
 * 반환은 0~1 사이 비율; 퍼센트는 호출 측에서 반올림한다.
 */
export function computeAnswerRateRatio(
  correct: number,
  wrong: number,
): number | null {
  if (!Number.isFinite(correct) || !Number.isFinite(wrong)) return null
  const c = Math.max(0, Math.floor(correct))
  const w = Math.max(0, Math.floor(wrong))
  const t = c + w
  if (t <= 0) return null
  return c / t
}

/**
 * 현재 스키마에는 세션별 정답 누적이 없어 “정답률” 자체는 저장만으로 산출할 수 없다.
 * 오답 이벤트 합만 함께 넘겨 추후 필드 추가·세션 state와 조합할 때 쓴다.
 */
export function getAnswerRateFromStoredProgress(
  progress: UserProgress,
): Readonly<{ rate: null; wrongEvents: number }> {
  return { rate: null, wrongEvents: sumWrongNoteAttempts(progress) }
}

/**
 * `dailyStudyCount`가 오늘 로컬 날짜와 같을 때만 count, 아니면 0.
 * (단어·회화 완료 저장 시 같이 올라가는 “당일 세션 횟수” MVP)
 */
export function getTodayStudySessionCount(
  progress: UserProgress,
  now: Date = new Date(),
): number {
  const today = formatLocalDateKey(now)
  const dc = progress.dailyStudyCount
  if (dc.dateKey !== today) return 0
  return Number.isFinite(dc.count) && dc.count > 0 ? dc.count : 0
}

/**
 * 누적 “학습” 수 — 저장된 필드가 없어 완료한 Day 건수로 대체한다.
 * - word: `completedWordDays` 길이
 * - conversation: `completedConversationDays` 길이
 */
export function getCumulativeStudyCounts(progress: UserProgress): Readonly<{
  totalStudiedWords: number
  totalStudiedExpressions: number
  total: number
}> {
  const w = progress.completedWordDays.length
  const c = progress.completedConversationDays.length
  return {
    totalStudiedWords: w,
    totalStudiedExpressions: c,
    total: w + c,
  }
}

function pickLatestByCompletedAt<T extends { readonly completedAt: string }>(
  items: readonly T[],
): T | null {
  let best: T | null = null
  let bestMs = -1
  for (const item of items) {
    const ms = Date.parse(item.completedAt)
    if (!Number.isFinite(ms)) continue
    if (ms > bestMs) {
      bestMs = ms
      best = item
    }
  }
  return best
}

/** 완료 기록 중 가장 최근 단어 Day (없으면 null) */
export function getLatestCompletedWordDay(
  progress: UserProgress,
): CompletedWordDayRef | null {
  return pickLatestByCompletedAt(progress.completedWordDays)
}

/** 완료 기록 중 가장 최근 회화 Day (없으면 null) */
export function getLatestCompletedConversationDay(
  progress: UserProgress,
): CompletedConversationDayRef | null {
  return pickLatestByCompletedAt(progress.completedConversationDays)
}

/**
 * 가장 마지막으로 의미 있는 학습이 찍힌 시각(ISO).
 * 완료 배열·recentStudy·`updatedAt` 후보 중 최댓값.
 */
export function getLastStudiedAtIso(progress: UserProgress): string | null {
  let bestMs = -1
  let bestIso: string | null = null

  const consider = (iso: string | undefined | null): void => {
    if (iso === undefined || iso === null || iso === '') return
    const ms = Date.parse(iso)
    if (!Number.isFinite(ms) || ms <= bestMs) return
    bestMs = ms
    bestIso = iso
  }

  consider(progress.recentStudy?.savedAt)
  for (const d of progress.completedWordDays) consider(d.completedAt)
  for (const d of progress.completedConversationDays) consider(d.completedAt)
  consider(progress.updatedAt)

  return bestIso
}

/**
 * 최근 학습 요약 — 화면은 `hasRecord`가 false일 때 “학습 기록 없음” 처리.
 */
export function getRecentStudySummary(progress: UserProgress): Readonly<{
  hasRecord: boolean
  lastStudiedAtIso: string | null
  lastStudiedLocalDateKey: string | null
  latestWordDay: CompletedWordDayRef | null
  latestConversationDay: CompletedConversationDayRef | null
}> {
  const lastIso = getLastStudiedAtIso(progress)
  const lastKey =
    lastIso !== null
      ? formatLocalDateKey(new Date(lastIso))
      : null
  const w = getLatestCompletedWordDay(progress)
  const c = getLatestCompletedConversationDay(progress)
  const hasRecord =
    lastIso !== null ||
    w !== null ||
    c !== null ||
    progress.recentStudy !== null

  return {
    hasRecord,
    lastStudiedAtIso: lastIso,
    lastStudiedLocalDateKey: lastKey,
    latestWordDay: w,
    latestConversationDay: c,
  }
}

/**
 * 연속 학습일 MVP: 일별 히스토리가 없으므로 “오늘 로컬 기준으로 세션이 1회 이상이면 1, 아니면 0”.
 */
export function computeStreakDaysMvp(
  progress: UserProgress,
  now: Date = new Date(),
): number {
  return getTodayStudySessionCount(progress, now) > 0 ? 1 : 0
}

/**
 * Stage 내 완료 Day 수(동일 stageId만 센다).
 */
export function countCompletedWordDaysForStage(
  progress: UserProgress,
  stageId: number,
): number {
  let n = 0
  for (const d of progress.completedWordDays) {
    if (d.stageId === stageId) n += 1
  }
  return n
}

export function countCompletedConversationDaysForStage(
  progress: UserProgress,
  stageId: number,
): number {
  let n = 0
  for (const d of progress.completedConversationDays) {
    if (d.stageId === stageId) n += 1
  }
  return n
}

/**
 * 완료 수 / Stage 총 Day 수. 총 Day가 0이면 0.
 * 총 Day 수는 콘텐츠 로딩 후 호출 측에서 넣는다.
 */
export function computeStageProgressRatio(
  completedCount: number,
  totalDaysInStage: number,
): number {
  if (!Number.isFinite(completedCount) || !Number.isFinite(totalDaysInStage)) {
    return 0
  }
  if (totalDaysInStage <= 0) return 0
  const c = Math.max(0, completedCount)
  return Math.min(1, c / totalDaysInStage)
}

/** MVP 표시 목표값 — `UserProgress.dailyWordGoal` 기본과 동일하게 둠 */
export const MVP_DAILY_WORD_LEARN_GOAL = DEFAULT_DAILY_WORD_GOAL

/**
 * 동일 로컬일자에 단어 학습 Day를 완료 처리한 건수.
 */
export function countCompletedWordDaysToday(
  progress: UserProgress,
  now: Date = new Date(),
): number {
  const today = formatLocalDateKey(now)
  let n = 0
  for (const d of progress.completedWordDays) {
    if (formatLocalDateKey(new Date(d.completedAt)) === today) n += 1
  }
  return n
}

/**
 * 완료 Day당 대략 이수 어휘 수(현재 Stage 1 콘텐츠 기준 표시 추정값).
 */
const MVP_WORDS_PER_COMPLETED_WORD_DAY = 3

/**
 * 저장 구조 변경 없이, 오늘 완료된 단어 Day 수로 학습량을 추정(표시 MVP).
 */
export function estimateTodayStudiedWordCountMvp(
  progress: UserProgress,
  now: Date = new Date(),
): number {
  return countCompletedWordDaysToday(progress, now) * MVP_WORDS_PER_COMPLETED_WORD_DAY
}

/** 단어장에 저장된 총 lemma 수 */
export function countSavedWordsTotal(progress: UserProgress): number {
  return progress.savedWords.length
}
