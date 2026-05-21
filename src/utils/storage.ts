/**
 * `localStorage` 기반 `UserProgress` save/load.
 * — 파싱 실패·스키마 불일치 시 `createDefaultUserProgress()`로 복구한다.
 * — 모든 `localStorage` 접근은 try/catch로 감싼다.
 */

import {
  DAILY_COIN_AMOUNT_MAX,
  DEFAULT_DAILY_COIN_AMOUNT,
  WORD_DAY_CLEAR_FIRST_COIN,
  WORD_DAY_CLEAR_FIRST_EXP,
  WORD_DAY_START_COIN_COST,
  WORD_STAGE_CLEAR_FIRST_COIN,
  WORD_STAGE_CLEAR_FIRST_EXP,
} from '../constants/economy'
import { STORAGE_KEY_USER_PROGRESS } from '../constants/storageKeys'
import {
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from './browserStorage'
import { createLocalId } from './id'
import {
  markConversationPersistHandled as markConversationPersistHandledCore,
  markWordStudyPersistHandled as markWordStudyPersistHandledCore,
} from './sessionPersistGuard'
import type {
  CompletedConversationDayRef,
  CompletedWordDayRef,
  DailyStudyCount,
  RecentStudySnapshot,
  RewardTransaction,
  RewardTransactionReason,
  SavedExpressionRef,
  SavedWordRef,
  UserProgress,
  WordReviewSource,
  WordReviewStatus,
  WordReviewWrongAttemptRef,
  WrongNoteAttemptRef,
  WrongNoteRef,
  WrongNoteType,
} from '../types/user-progress'

export type { SavedExpressionRef, SavedWordRef }
import {
  USER_PROGRESS_SCHEMA_VERSION,
  USER_PROGRESS_SCHEMA_VERSION_2,
  USER_PROGRESS_SCHEMA_VERSION_LEGACY,
  createDefaultUserProgress,
  formatLocalDateKey,
  DEFAULT_USER_EXP,
  DEFAULT_TOTAL_MEMORIZED_WORDS,
  DEFAULT_DAILY_WORD_GOAL,
} from '../types/user-progress'

/** 같은 탭에서 저장 후 상단 배지 등이 갱신되도록 알린다. */
export const HADES_USER_PROGRESS_EVENT = 'hadesvoca-user-progress-updated' as const

/** Word Day 1회 시작 비용. 완료/이탈 여부와 무관하게 시작 시 차감한다. */
export { WORD_DAY_START_COIN_COST }

/** Word Day 최초 완료 보상(코인). 같은 (stage, day) 에서는 단 1회만 지급된다(Phase 10-5). */
export { WORD_DAY_CLEAR_FIRST_COIN }

/** Word Day 최초 완료 보상(EXP). 같은 (stage, day) 에서는 단 1회만 지급된다(Phase 10-5). */
export { WORD_DAY_CLEAR_FIRST_EXP }

/** Word Stage 최초 완료 보상(코인). 같은 stageId 에서는 단 1회만 지급된다(Phase 10-6). */
export { WORD_STAGE_CLEAR_FIRST_COIN }

/** Word Stage 최초 완료 보상(EXP). 같은 stageId 에서는 단 1회만 지급된다(Phase 10-6). */
export { WORD_STAGE_CLEAR_FIRST_EXP }

/**
 * 로그인/서버 없이 쓰는 익명 로컬 `userId` 1회 발급용 유틸.
 *
 * 정책:
 * - `crypto.randomUUID()` 가용 환경에서는 표준 UUID v4 를 그대로 반환한다.
 * - 폴백 환경(아주 오래된 브라우저 / 비 secure context 등)에서는
 *   `local-<Date.now()>-<base36 랜덤>` 형식을 반환해 충돌 가능성을 낮춘다.
 *
 * 호출 정책(중요):
 * - 별도 `localStorage` 키를 만들지 않는다. 반환값은 `UserProgress.userId` 에
 *   넣어 기존 키(`STORAGE_KEY_USER_PROGRESS`) 안에 함께 직렬화되도록 둔다.
 * - 호출 진입점은 `createDefaultUserProgressWithLocalId` 한 곳이며,
 *   parse/sanitize 단계의 빈 `userId` 보정은 그 default 결과를 거쳐 흐른다.
 * - 외부 모듈에서 직접 부를 일이 없어 모듈 private 으로 둔다.
 */
function generateLocalUserId(): string {
  return createLocalId('local')
}

/**
 * 저장 계층 전용 기본 스냅샷 생성 진입점.
 *
 * `createDefaultUserProgress()`(types 파일·런타임 순수 유지) 결과를 그대로 받은 뒤,
 * 비어 있는 `userId` 슬롯만 `generateLocalUserId()` 로 1회 발급해 채워 준다.
 *
 * 이 함수를 두는 이유:
 * - `types/user-progress.ts` 가 `utils/storage.ts` 를 import 하면 순환 의존이 되므로,
 *   userId 발급은 저장 계층에서 한 번에 처리한다(타입 파일은 부수효과 없는 상태로 유지).
 * - 빈 userId 보정 진입점을 storage 내부 단일 함수로 모아 두면 후속 Phase(9-4 / 9-5)의
 *   parse / sanitize 단계와 정책이 어긋날 일이 없다.
 *
 * 정책상 기존 기본값(예: `rankTier=1`, `coins=0`, `dailyCoinAmount=30`)은 변경하지 않고,
 * 코인 지급·EXP 증가·누적 학습 단어 증가 같은 도메인 로직은 여전히 후속 Phase 의 책임이다.
 */
function createDefaultUserProgressWithLocalId(now: Date = new Date()): UserProgress {
  const base = createDefaultUserProgress(now)
  if (base.userId === '') {
    return { ...base, userId: generateLocalUserId() }
  }
  return base
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function readFiniteNumber(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined
}

function readNonNegativeInt(x: unknown, fallback: number): number {
  const n = readFiniteNumber(x)
  if (n === undefined || n < 0 || !Number.isFinite(n)) return fallback
  return Math.floor(n)
}

function readDateKeyField(x: unknown): string | null {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null
}

function addCalendarDaysToDateKey(dateKey: string, delta: number): string {
  const parts = dateKey.split('-').map((p) => Number.parseInt(p, 10))
  if (
    parts.length !== 3 ||
    parts.some((n) => !Number.isFinite(n))
  ) {
    return formatLocalDateKey(new Date())
  }
  const [y, m, d] = parts
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return formatLocalDateKey(dt)
}

function nextStreakAfterStudy(
  prev: UserProgress,
  dateKey: string,
): Readonly<{ streakDays: number; lastStudyDateKey: string }> {
  const last = prev.lastStudyDateKey
  if (last === dateKey) {
    return { streakDays: prev.streakDays, lastStudyDateKey: last }
  }
  const yest = addCalendarDaysToDateKey(dateKey, -1)
  let nextStreak: number
  if (last === '') {
    nextStreak = 1
  } else if (last === yest) {
    nextStreak = prev.streakDays + 1
  } else {
    nextStreak = 1
  }
  return { streakDays: nextStreak, lastStudyDateKey: dateKey }
}

/**
 * @deprecated Phase 10-7 부터 `rankTier` 는 `userExp` 기반으로 계산한다.
 * 새 호출은 `calculateRankTierFromExp` 를 사용한다. 사용처가 모두 교체되었지만
 * “이전 식(완료 Day 합계 / 3)” 을 기록으로 남기기 위해 export 형태로 보존한다.
 */
export function rankTierFromTotals(wordDone: number, convDone: number): number {
  const t = wordDone + convDone
  return Math.max(1, Math.min(99, 1 + Math.floor(t / 3)))
}

/**
 * `userExp` 를 기준으로 `rankTier` 를 산정한다(Phase 10-7).
 *
 * 식: `rankTier = 1 + floor(userExp / 100)`
 *
 * 정책:
 * - `userExp` 음수/NaN 은 0 으로 보정.
 * - 결과는 [1, 99] 로 클램프(기존 sanitize 범위 유지).
 * - 별도 `userGrade` 는 저장하지 않는다 — 표시용 라벨은 `deriveUserGradeLabel(rankTier)` 가 파생한다.
 */
export function calculateRankTierFromExp(userExp: number): number {
  const exp = Math.max(0, Math.floor(Number(userExp) || 0))
  return Math.max(1, Math.min(99, 1 + Math.floor(exp / 100)))
}

/**
 * 학습 세션 1건이 끝났을 때 streak·`rankTier` 만 다시 계산한다.
 *
 * - `streakDays` / `lastStudyDateKey` 는 학습 날짜 정합성으로 산정한다.
 * - `rankTier` 는 Phase 10-7 정책에 따라 `prev.userExp` 기반으로 산정한다.
 *   본 함수 호출 직후 `applyReward` 가 호출되면(=EXP 변동) `applyReward` 안에서
 *   다시 한 번 `rankTier` 가 갱신되므로 최종 progress 의 rankTier 는 항상 최신 EXP 기준이다.
 */
function mergeStreakAndRank(
  prev: UserProgress,
  dateKey: string,
): Pick<UserProgress, 'streakDays' | 'lastStudyDateKey' | 'rankTier'> {
  const { streakDays, lastStudyDateKey } = nextStreakAfterStudy(prev, dateKey)
  return {
    streakDays,
    lastStudyDateKey,
    rankTier: calculateRankTierFromExp(prev.userExp),
  }
}

function readString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}

const REWARD_TRANSACTION_REASONS = new Set<RewardTransactionReason>([
  'daily-grant',
  'word-day-cost',
  'word-day-clear-first',
  'word-stage-clear-first',
  'admin-correct',
  'import-reset',
])

/**
 * sanitize 단계 캡/디폴트.
 * - 실제 운영 정책(일일 코인 기본 30, 이력 캡 등)은 후속 Phase 에서 확정된다.
 * - 이 상수들은 "비정상 입력을 저장하지 않기" 위한 안전망이지 정책 선언이 아니다.
 */
const USER_ID_MAX_LENGTH = 128 as const
const REWARD_HISTORY_CAP = 2_000 as const
/**
 * `wordReviewStatuses` 무한 누적 방지 캡(Phase 11-3).
 * 콘텐츠 단어 총량(현재 Stage 1 21개) 대비 충분히 크게 둔다.
 */
const WORD_REVIEW_STATUS_CAP = 5_000 as const
/** `reviewLevel` 의 입력값을 가두는 안전 범위(정책 외 비정상 값 차단용). */
const WORD_REVIEW_LEVEL_MAX = 99 as const

const WORD_REVIEW_SOURCES = new Set<WordReviewSource>([
  'word-day',
  'wrong-note',
  'saved-word',
])

function parseRewardTransaction(x: unknown): RewardTransaction | null {
  if (!isRecord(x)) return null
  const id = readString(x.id)
  const reasonRaw = readString(x.reason)
  const refIdRaw = x.refId
  const expDelta = readFiniteNumber(x.expDelta)
  const coinDelta = readFiniteNumber(x.coinDelta)
  const createdAt = readString(x.createdAt)
  if (
    id === undefined ||
    reasonRaw === undefined ||
    !REWARD_TRANSACTION_REASONS.has(reasonRaw as RewardTransactionReason) ||
    (typeof refIdRaw !== 'string' && refIdRaw !== null) ||
    expDelta === undefined ||
    coinDelta === undefined ||
    createdAt === undefined
  ) {
    return null
  }
  return {
    id,
    reason: reasonRaw as RewardTransactionReason,
    refId: refIdRaw,
    expDelta,
    coinDelta,
    createdAt,
  }
}

// ----- Phase 10-1: 보상 단일 진입점 + 멱등 헬퍼 ---------------------------------

/**
 * 보상 거래 한 건의 의도 입력. delta 값은 양수/음수 모두 허용한다.
 * - `coinDelta < 0` 이면 차감(잔액 부족 시 reject).
 * - `expDelta < 0` 이면 EXP 보정(결과 EXP 는 0 으로 clamp).
 * - `refId === null` 이면 멱등 가드를 적용하지 않는다(예: `admin-correct`).
 */
export type ApplyRewardInput = Readonly<{
  reason: RewardTransactionReason
  refId: string | null
  expDelta: number
  coinDelta: number
}>

/**
 * `applyReward` 의 결과.
 * - `applied: true` 인 경우에만 history 에 한 줄이 새로 들어가고 coins/userExp 가 변한다.
 * - 중복(`(reason, refId)` 이미 있음), no-op(둘 다 0), 잔액 부족 시 `applied: false` 와 함께
 *   원래 `prev` 를 그대로 돌려준다(부분 적용 없음).
 */
export type ApplyRewardResult = Readonly<
  | { applied: true; next: UserProgress; transactionId: string }
  | { applied: false; next: UserProgress; transactionId: null }
>

/**
 * 보상 거래 1건의 id. UUID 가용 환경에서는 UUIDv4, 폴백 환경에서는 `tx-<ts>-<rand>` 형식.
 * `generateLocalUserId` 와 동일 정책. 별도 함수로 둔 이유는 의미(=거래 id)의 명확성.
 */
function generateRewardTransactionId(): string {
  return createLocalId('tx')
}

/**
 * `(reason, refId)` 조합으로 history 안에 이미 같은 거래가 있는지 검사한다.
 * `refId === null` 인 항목은 멱등 키가 없는 것으로 보고 항상 `false`.
 */
export function hasRewardTransaction(
  history: readonly RewardTransaction[],
  reason: RewardTransactionReason,
  refId: string | null,
): boolean {
  if (refId === null) return false
  for (const tx of history) {
    if (tx.reason === reason && tx.refId === refId) return true
  }
  return false
}

/**
 * 표준 refId 빌더. 후속 Phase 의 보상 호출자가 동일한 키 컨벤션을 쓰도록 강제한다.
 * 예) `buildRewardRefId('word-day-clear-first', { stage: 1, day: 3 })`
 *      → `'word-day-clear-first:day:3:stage:1'`
 *
 * 스코프 키는 알파벳 오름차순으로 정렬해 결정적 문자열을 만든다(호출 순서 영향 제거).
 */
export function buildRewardRefId(
  reason: RewardTransactionReason,
  scope: Readonly<Record<string, string | number>>,
): string {
  const keys = Object.keys(scope).sort()
  if (keys.length === 0) return reason
  const tail = keys.map((k) => `${k}:${String(scope[k])}`).join(':')
  return `${reason}:${tail}`
}

/**
 * 보상/코인 단일 진입점.
 *
 * 정책 요약:
 * 1) `refId !== null` 이고 `(reason, refId)` 가 history 에 이미 있으면 → 중복으로 보고
 *    `{ applied: false, next: prev }` 반환(부분 적용 없음).
 * 2) `expDelta === 0 && coinDelta === 0` → no-op 으로 보고 history 에 기록하지 않는다.
 * 3) `prev.coins + coinDelta < 0` → 잔액 부족(차감 reject). `{ applied: false }`.
 *    - 사전 검증(잔액 체크)은 호출자 책임이지만, 단일 진입점에서도 최종 방어를 둔다.
 * 4) `prev.userExp + expDelta < 0` → 결과 EXP 는 0 으로 clamp. 차감은 적용한다.
 *    - 이때 history 에 기록되는 `expDelta` 는 *실제로 변동된 양*(=`-prev.userExp`)으로 줄어든다.
 * 5) 성공 시 `rewardTransactionHistory` 끝에 거래 한 건을 append 하고 `REWARD_HISTORY_CAP` 으로
 *    슬라이스(가장 오래된 항목부터 떨어진다).
 * 6) `rankTier` 는 새 `userExp` 에 맞춰 `calculateRankTierFromExp` 로 재계산한다(Phase 10-7).
 *    EXP/coin 변동이 없는 분기에서는 본 함수에 진입하지 않으므로 rankTier 갱신도 호출되지 않는다.
 * 7) `updatedAt` 은 `now` 의 ISO 문자열로 갱신한다.
 */
export function applyReward(
  prev: UserProgress,
  input: ApplyRewardInput,
  now: Date = new Date(),
): ApplyRewardResult {
  if (hasRewardTransaction(prev.rewardTransactionHistory, input.reason, input.refId)) {
    return { applied: false, next: prev, transactionId: null }
  }
  if (input.expDelta === 0 && input.coinDelta === 0) {
    return { applied: false, next: prev, transactionId: null }
  }

  const nextCoinsRaw = prev.coins + input.coinDelta
  if (nextCoinsRaw < 0) {
    return { applied: false, next: prev, transactionId: null }
  }

  const nextUserExpRaw = prev.userExp + input.expDelta
  const nextUserExp = nextUserExpRaw < 0 ? 0 : nextUserExpRaw
  const effectiveExpDelta = nextUserExp - prev.userExp

  if (effectiveExpDelta === 0 && input.coinDelta === 0) {
    return { applied: false, next: prev, transactionId: null }
  }

  const tx: RewardTransaction = {
    id: generateRewardTransactionId(),
    reason: input.reason,
    refId: input.refId,
    expDelta: effectiveExpDelta,
    coinDelta: input.coinDelta,
    createdAt: now.toISOString(),
  }

  const appended: readonly RewardTransaction[] = [
    ...prev.rewardTransactionHistory,
    tx,
  ].slice(-REWARD_HISTORY_CAP)

  const next: UserProgress = {
    ...prev,
    coins: nextCoinsRaw,
    userExp: nextUserExp,
    rankTier: calculateRankTierFromExp(nextUserExp),
    rewardTransactionHistory: appended,
    updatedAt: now.toISOString(),
  }
  return { applied: true, next, transactionId: tx.id }
}

// ----- Phase 10-4: Word Day 시작 비용 -----------------------------------------

export type StartWordDayResult = Readonly<
  | {
      started: true
      next: UserProgress
      cost: number
      transactionId: string | null
    }
  | {
      started: false
      next: UserProgress
      cost: number
      coins: number
      reason: 'insufficient-coins'
    }
>

export function hasEnoughCoins(progress: UserProgress, cost: number): boolean {
  return progress.coins >= Math.max(0, Math.floor(cost))
}

export function startWordDayWithCoinCost(
  prev: UserProgress,
  stageId: number,
  dayId: number,
  attemptKey: string,
  now: Date = new Date(),
): StartWordDayResult {
  const cost = WORD_DAY_START_COIN_COST
  const refId = buildRewardRefId('word-day-cost', {
    attempt: attemptKey,
    day: dayId,
    stage: stageId,
  })

  if (hasRewardTransaction(prev.rewardTransactionHistory, 'word-day-cost', refId)) {
    return { started: true, next: prev, cost, transactionId: null }
  }

  if (!hasEnoughCoins(prev, cost)) {
    return {
      started: false,
      next: prev,
      cost,
      coins: prev.coins,
      reason: 'insufficient-coins',
    }
  }

  const rewardRes = applyReward(
    prev,
    {
      reason: 'word-day-cost',
      refId,
      expDelta: 0,
      coinDelta: -cost,
    },
    now,
  )

  if (!rewardRes.applied) {
    return {
      started: false,
      next: prev,
      cost,
      coins: prev.coins,
      reason: 'insufficient-coins',
    }
  }

  return {
    started: true,
    next: rewardRes.next,
    cost,
    transactionId: rewardRes.transactionId,
  }
}

// ----- Phase 10-3: 일일 코인 지급 ---------------------------------------------

/**
 * 일일 코인 지급 가능 여부.
 *
 * 정책:
 * - 오늘(로컬 달력) 키와 `lastDailyCoinGrantedDate` 가 같지 않을 때만 가능.
 * - `dailyCoinAmount` 가 0 이하면 항상 false(지급 금액이 없어 의미 없음).
 *
 * 이 함수는 pure check 이므로 UI/홈 카드 가시성 판정에 그대로 써도 된다.
 */
export function canGrantDailyCoin(
  progress: UserProgress,
  now: Date = new Date(),
): boolean {
  if (progress.dailyCoinAmount <= 0) return false
  const todayKey = formatLocalDateKey(now)
  return progress.lastDailyCoinGrantedDate !== todayKey
}

/**
 * `grantDailyCoin` 결과 형식.
 * - `granted: true`  → coins 가 증가하고 `rewardTransactionHistory` 에 한 줄이 들어간 새 progress.
 * - `granted: false` → 이미 받았거나, 금액 0, 또는 (드물게) `applyReward` 의 멱등 가드에 의해
 *   거부된 경우. 두 번째/세 번째 케이스에서도 `lastDailyCoinGrantedDate` 는 오늘 키로 맞춰 둔다(=다음 호출 차단).
 */
export type GrantDailyCoinResult = Readonly<
  | {
      granted: true
      next: UserProgress
      amount: number
      transactionId: string
    }
  | {
      granted: false
      next: UserProgress
      reason: 'already-granted' | 'amount-zero' | 'reward-rejected'
    }
>

/**
 * 일일 코인 지급(pure transform).
 *
 * 단계:
 * 1) 오늘 이미 받았으면 그대로 반환(`already-granted`).
 * 2) `dailyCoinAmount` 가 0 이하면 보상 지급 없이 `lastDailyCoinGrantedDate` 만 오늘로 표시(`amount-zero`).
 *    (수동으로 dailyCoinAmount 를 0 으로 둔 사용자도 "오늘 진입" 시점을 남겨 둔다.)
 * 3) 그 외에는 `applyReward({ reason: 'daily-grant', refId: 'daily-grant:date:{YYYY-MM-DD}:user:{userId}', coinDelta: amount })` 호출.
 *    - refId 에 userId 를 함께 두는 이유: import-export 후 다른 단말로 옮긴 직후라도 키 결정성을 보장하기 위함.
 *    - applyReward 가 멱등 가드로 거부하면 lastDailyCoinGrantedDate 만 갱신해 다음 호출에서 무한 시도되지 않게 한다.
 * 4) 성공 시 `next.lastDailyCoinGrantedDate = todayKey`, `next.updatedAt = now`.
 */
export function grantDailyCoin(
  prev: UserProgress,
  now: Date = new Date(),
): GrantDailyCoinResult {
  const todayKey = formatLocalDateKey(now)
  if (prev.lastDailyCoinGrantedDate === todayKey) {
    return { granted: false, next: prev, reason: 'already-granted' }
  }

  const amount = Math.max(0, Math.floor(prev.dailyCoinAmount))
  if (amount === 0) {
    const next: UserProgress = {
      ...prev,
      lastDailyCoinGrantedDate: todayKey,
      updatedAt: now.toISOString(),
    }
    return { granted: false, next, reason: 'amount-zero' }
  }

  const refId = buildRewardRefId('daily-grant', {
    date: todayKey,
    user: prev.userId === '' ? 'anonymous' : prev.userId,
  })
  const rewardRes = applyReward(
    prev,
    {
      reason: 'daily-grant',
      refId,
      expDelta: 0,
      coinDelta: amount,
    },
    now,
  )

  if (!rewardRes.applied) {
    const next: UserProgress = {
      ...prev,
      lastDailyCoinGrantedDate: todayKey,
      updatedAt: now.toISOString(),
    }
    return { granted: false, next, reason: 'reward-rejected' }
  }

  const next: UserProgress = {
    ...rewardRes.next,
    lastDailyCoinGrantedDate: todayKey,
    updatedAt: now.toISOString(),
  }
  return {
    granted: true,
    next,
    amount,
    transactionId: rewardRes.transactionId,
  }
}

function parseCompletedWordDay(x: unknown): CompletedWordDayRef | null {
  if (!isRecord(x)) return null
  const stageId = readFiniteNumber(x.stageId)
  const dayId = readFiniteNumber(x.dayId)
  const completedAt = readString(x.completedAt)
  if (
    stageId === undefined ||
    dayId === undefined ||
    completedAt === undefined
  ) {
    return null
  }
  return { stageId, dayId, completedAt }
}

function parseCompletedConversationDay(
  x: unknown,
): CompletedConversationDayRef | null {
  if (!isRecord(x)) return null
  const stageId = readFiniteNumber(x.stageId)
  const dayId = readFiniteNumber(x.dayId)
  const completedAt = readString(x.completedAt)
  if (
    stageId === undefined ||
    dayId === undefined ||
    completedAt === undefined
  ) {
    return null
  }
  return { stageId, dayId, completedAt }
}

function parseSavedWord(x: unknown): SavedWordRef | null {
  if (!isRecord(x)) return null
  const lemmaId = readString(x.lemmaId)
  const stageId = readFiniteNumber(x.stageId)
  const savedAt = readString(x.savedAt)
  if (lemmaId === undefined || stageId === undefined || savedAt === undefined) {
    return null
  }
  const dayIdRaw = readFiniteNumber(x.dayId)
  const out: SavedWordRef =
    dayIdRaw === undefined
      ? { lemmaId, stageId, savedAt }
      : { lemmaId, stageId, dayId: dayIdRaw, savedAt }
  return out
}

function parseSavedExpression(x: unknown): SavedExpressionRef | null {
  if (!isRecord(x)) return null
  const expressionId = readString(x.expressionId)
  const stageId = readFiniteNumber(x.stageId)
  const dayId = readFiniteNumber(x.dayId)
  const savedAt = readString(x.savedAt)
  if (
    expressionId === undefined ||
    stageId === undefined ||
    dayId === undefined ||
    savedAt === undefined
  ) {
    return null
  }
  return { expressionId, stageId, dayId, savedAt }
}

function clampWordReviewLevel(raw: number): number {
  const n = Math.floor(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > WORD_REVIEW_LEVEL_MAX) return WORD_REVIEW_LEVEL_MAX
  return n
}

function clampNonNegativeInt(raw: number, cap: number): number {
  const n = Math.floor(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > cap) return cap
  return n
}

function parseWordReviewStatus(x: unknown): WordReviewStatus | null {
  if (!isRecord(x)) return null
  const lemmaId = readString(x.lemmaId)
  const stageId = readFiniteNumber(x.stageId)
  const learnedDayId = readFiniteNumber(x.learnedDayId)
  const nextReviewDayId = readFiniteNumber(x.nextReviewDayId)
  const reviewLevel = readFiniteNumber(x.reviewLevel)
  const correctStreak = readFiniteNumber(x.correctStreak)
  const wrongCount = readFiniteNumber(x.wrongCount)
  const sourceRaw = readString(x.source)
  if (
    lemmaId === undefined ||
    lemmaId.trim() === '' ||
    stageId === undefined ||
    learnedDayId === undefined ||
    nextReviewDayId === undefined ||
    reviewLevel === undefined ||
    correctStreak === undefined ||
    wrongCount === undefined ||
    sourceRaw === undefined ||
    !WORD_REVIEW_SOURCES.has(sourceRaw as WordReviewSource)
  ) {
    return null
  }
  const lastReviewedDayIdRaw = readFiniteNumber(x.lastReviewedDayId)
  const base: WordReviewStatus = {
    lemmaId,
    stageId: Math.floor(stageId),
    learnedDayId: Math.max(0, Math.floor(learnedDayId)),
    nextReviewDayId: Math.max(0, Math.floor(nextReviewDayId)),
    reviewLevel: clampWordReviewLevel(reviewLevel),
    correctStreak: clampNonNegativeInt(correctStreak, 999_999),
    wrongCount: clampNonNegativeInt(wrongCount, 999_999),
    source: sourceRaw as WordReviewSource,
  }
  if (lastReviewedDayIdRaw === undefined) return base
  return {
    ...base,
    lastReviewedDayId: Math.max(0, Math.floor(lastReviewedDayIdRaw)),
  }
}

/**
 * 같은 `(stageId, lemmaId)` 쌍은 1건만 유지한다(뒤쪽 항목이 우선).
 * 누락/손상 항목은 `parseWordReviewStatus` 가 미리 걸러낸 상태로 들어온다.
 */
function dedupeWordReviewStatuses(
  list: readonly WordReviewStatus[],
): readonly WordReviewStatus[] {
  const byKey = new Map<string, WordReviewStatus>()
  for (const item of list) {
    byKey.set(`${item.stageId}:${item.lemmaId}`, item)
  }
  return [...byKey.values()]
}

/** v2 스키마: `WrongNoteRef` 풀 필드 */
function parseWrongNoteV2(x: unknown): WrongNoteRef | null {
  if (!isRecord(x)) return null
  const id = readString(x.id)
  const typeRaw = x.type
  if (typeRaw !== 'word' && typeRaw !== 'expression') return null
  const stageId = readFiniteNumber(x.stageId)
  const dayId = readFiniteNumber(x.dayId)
  const wrongCount = readFiniteNumber(x.wrongCount)
  const lastWrongAt = readString(x.lastWrongAt)
  const resolved = typeof x.resolved === 'boolean' ? x.resolved : null
  const createdAt = readString(x.createdAt)
  const updatedAt = readString(x.updatedAt)
  if (
    id === undefined ||
    stageId === undefined ||
    dayId === undefined ||
    wrongCount === undefined ||
    wrongCount < 1 ||
    lastWrongAt === undefined ||
    resolved === null ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    return null
  }
  const out: WrongNoteRef = {
    id,
    type: typeRaw,
    stageId,
    dayId,
    wrongCount,
    lastWrongAt,
    resolved,
    createdAt,
    updatedAt,
  }
  return out
}

/** v1: `kind` + `savedAt` 만 있던 레코드 */
function parseLegacyWrongNoteV1(x: unknown): WrongNoteRef | null {
  if (!isRecord(x)) return null
  const kindRaw = x.kind
  if (kindRaw !== 'word' && kindRaw !== 'conversation') return null
  const type: WrongNoteType = kindRaw === 'conversation' ? 'expression' : 'word'
  const id = readString(x.id)
  const stageId = readFiniteNumber(x.stageId)
  const dayId = readFiniteNumber(x.dayId)
  const savedAt = readString(x.savedAt)
  if (
    id === undefined ||
    stageId === undefined ||
    dayId === undefined ||
    savedAt === undefined
  ) {
    return null
  }
  return {
    id,
    type,
    stageId,
    dayId,
    wrongCount: 1,
    lastWrongAt: savedAt,
    resolved: false,
    createdAt: savedAt,
    updatedAt: savedAt,
  }
}

function parseRecentStudy(x: unknown): RecentStudySnapshot | null {
  if (!isRecord(x)) return null
  const typeRaw = x.type
  if (typeRaw !== 'word' && typeRaw !== 'conversation') return null
  const stageId = readFiniteNumber(x.stageId)
  const dayId = readFiniteNumber(x.dayId)
  const savedAt = readString(x.savedAt)
  if (
    stageId === undefined ||
    dayId === undefined ||
    savedAt === undefined
  ) {
    return null
  }
  return { type: typeRaw, stageId, dayId, savedAt }
}

function parseDailyStudyCount(
  x: unknown,
  fallback: DailyStudyCount,
): DailyStudyCount {
  if (!isRecord(x)) return fallback
  const dateKey = readString(x.dateKey)
  const count = readFiniteNumber(x.count)
  if (dateKey === undefined || count === undefined || count < 0) {
    return fallback
  }
  return { dateKey, count }
}

function parseArray<T>(
  raw: unknown,
  item: (el: unknown) => T | null,
): readonly T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const el of raw) {
    const v = item(el)
    if (v !== null) out.push(v)
  }
  return out
}

/**
 * 검증 가능한 필드만 채워 `UserProgress`로 만든다. 나머지는 기본값과 병합한다.
 * `version` 1 진행 저장은 읽어서 v2 `WrongNoteRef`로 마이그레이션한다(데이터 초기화 없음).
 */
export function parseStoredUserProgress(
  parsed: unknown,
  now: Date = new Date(),
): UserProgress {
  const defaults = createDefaultUserProgressWithLocalId(now)
  if (!isRecord(parsed)) return defaults
  const ver = readFiniteNumber(parsed.version)
  if (
    ver !== USER_PROGRESS_SCHEMA_VERSION &&
    ver !== USER_PROGRESS_SCHEMA_VERSION_2 &&
    ver !== USER_PROGRESS_SCHEMA_VERSION_LEGACY
  ) {
    return defaults
  }

  const nickname =
    typeof parsed.nickname === 'string'
      ? parsed.nickname.trim().slice(0, 32)
      : defaults.nickname

  const streakDays = readNonNegativeInt(parsed.streakDays, defaults.streakDays)
  const lastStudyDateKeyRaw = readDateKeyField(parsed.lastStudyDateKey)
  const lastStudyDateKey =
    lastStudyDateKeyRaw !== null ? lastStudyDateKeyRaw : defaults.lastStudyDateKey
  const coins = readNonNegativeInt(parsed.coins, defaults.coins)
  // rankTier 는 Phase 10-7 부터 저장값을 신뢰하지 않고 `userExp` 기반으로 재계산한다.
  // (저장된 값이 있더라도 EXP 와 어긋날 수 있으므로 항상 derive 한다.)

  // 아래 신규 필드 보정은 sanitize 와 동일 수준(범위·형식 clamp)으로 끌어올린다.
  // 디스크 저장 시 sanitize 가 한 번 더 정정해 주지만, load 직후의 UI 노출도
  // 비정상 값(음수 / NaN / 매우 큰 수 / 형식 오류 등)을 받지 않도록 1차 차단한다.

  // userId: string + trim 후 비어있지 않을 때만 유지, sanitize 와 동일한 길이 캡.
  const userIdRaw = parsed.userId
  const userId =
    typeof userIdRaw === 'string' && userIdRaw.trim() !== ''
      ? userIdRaw.slice(0, USER_ID_MAX_LENGTH)
      : defaults.userId

  // userExp: 0 이상 정수만 유지. sanitize 와 동일 상한 999_999_999.
  const userExp = (() => {
    const raw = readFiniteNumber(parsed.userExp)
    if (raw === undefined) return defaults.userExp
    const n = Math.floor(raw)
    if (n < 0) return defaults.userExp
    return Math.min(999_999_999, n)
  })()

  // dailyWordGoal: 1~366 정수만 유지(sanitize 와 동일 범위).
  const dailyWordGoal = (() => {
    const raw = readFiniteNumber(parsed.dailyWordGoal)
    if (raw === undefined) return defaults.dailyWordGoal
    const n = Math.floor(raw)
    if (n < 1 || n > 366) return defaults.dailyWordGoal
    return n
  })()

  // totalMemorizedWords: 0 이상 정수만 유지. sanitize 와 동일 상한 999_999.
  const totalMemorizedWords = (() => {
    const raw = readFiniteNumber(parsed.totalMemorizedWords)
    if (raw === undefined) return defaults.totalMemorizedWords
    const n = Math.floor(raw)
    if (n < 0) return defaults.totalMemorizedWords
    return Math.min(999_999, n)
  })()

  // dailyCoinAmount: 0 이상 정수만 유지. sanitize 와 동일 상한 DAILY_COIN_AMOUNT_MAX.
  const dailyCoinAmount = (() => {
    const raw = readFiniteNumber(parsed.dailyCoinAmount)
    if (raw === undefined) return defaults.dailyCoinAmount
    const n = Math.floor(raw)
    if (n < 0) return defaults.dailyCoinAmount
    return Math.min(DAILY_COIN_AMOUNT_MAX, n)
  })()

  // lastDailyCoinGrantedDate: null 그대로 / 'YYYY-MM-DD' 정규식 통과 string 만 유지.
  // (임의 문자열이 그대로 흘러들어가 도메인 비교에 쓰이는 일을 차단)
  const lastDailyCoinGrantedDateRaw = parsed.lastDailyCoinGrantedDate
  const lastDailyCoinGrantedDate =
    lastDailyCoinGrantedDateRaw === null
      ? null
      : (readDateKeyField(lastDailyCoinGrantedDateRaw) ??
        defaults.lastDailyCoinGrantedDate)
  const completedWordDays = parseArray(
    parsed.completedWordDays,
    parseCompletedWordDay,
  )
  const completedConversationDays = parseArray(
    parsed.completedConversationDays,
    parseCompletedConversationDay,
  )
  const savedWords = parseArray(parsed.savedWords, parseSavedWord)
  const savedExpressions = parseArray(
    parsed.savedExpressions,
    parseSavedExpression,
  )
  // wordReviewStatuses: 손상 항목은 drop, 같은 (stage, lemma) 는 1건만 유지, 캡 적용.
  // 누락된 구버전 v3 백업 파일은 빈 배열이 된다(=하위 호환, 데이터 초기화 없음).
  const wordReviewStatuses: readonly WordReviewStatus[] = dedupeWordReviewStatuses(
    parseArray(parsed.wordReviewStatuses, parseWordReviewStatus),
  ).slice(-WORD_REVIEW_STATUS_CAP)
  let wrongNotes: readonly WrongNoteRef[]
  if (ver === USER_PROGRESS_SCHEMA_VERSION_LEGACY) {
    wrongNotes = parseArray(parsed.wrongNotes, parseLegacyWrongNoteV1)
  } else {
    wrongNotes = parseArray(parsed.wrongNotes, parseWrongNoteV2)
  }
  // sanitize 와 동일한 REWARD_HISTORY_CAP 으로 캡. parseArray 가 readonly 배열을
  // 돌려주므로 일반 배열로 다시 받아 길이만 잘라낸다(시간 정렬은 후속 Phase 정책).
  const rewardTransactionHistory: readonly RewardTransaction[] = parseArray(
    parsed.rewardTransactionHistory,
    parseRewardTransaction,
  ).slice(-REWARD_HISTORY_CAP)
  const recentRaw = parsed.recentStudy
  let recentStudy: RecentStudySnapshot | null
  if (recentRaw === undefined) {
    recentStudy = defaults.recentStudy
  } else if (recentRaw === null) {
    recentStudy = null
  } else {
    const parsedRecent = parseRecentStudy(recentRaw)
    recentStudy = parsedRecent === null ? defaults.recentStudy : parsedRecent
  }
  const dailyStudyCount = parseDailyStudyCount(
    parsed.dailyStudyCount,
    defaults.dailyStudyCount,
  )
  const updatedAtRaw = readString(parsed.updatedAt)
  const updatedAt =
    updatedAtRaw === undefined ? defaults.updatedAt : updatedAtRaw
  return {
    version: USER_PROGRESS_SCHEMA_VERSION,
    nickname,
    userId,
    streakDays,
    lastStudyDateKey,
    coins,
    dailyCoinAmount,
    lastDailyCoinGrantedDate,
    rankTier: calculateRankTierFromExp(userExp),
    userExp,
    dailyWordGoal,
    totalMemorizedWords,
    completedWordDays,
    completedConversationDays,
    savedWords,
    savedExpressions,
    wrongNotes,
    wordReviewStatuses,
    rewardTransactionHistory,
    recentStudy,
    dailyStudyCount,
    updatedAt,
  }
}

function upsertCompletedWordDay(
  list: readonly CompletedWordDayRef[],
  next: CompletedWordDayRef,
): readonly CompletedWordDayRef[] {
  const tail = list.filter(
    (x) => !(x.stageId === next.stageId && x.dayId === next.dayId),
  )
  return [...tail, next]
}

function wrongNoteDedupeKey(w: WrongNoteRef | WrongNoteAttemptRef): string {
  return `${w.type}:${w.id}:${w.stageId}:${w.dayId}`
}

/**
 * 동일 `(type, id, stageId, dayId)` 가 이미 있으면 `wrongCount` 누적·`lastWrongAt`·`updatedAt` 갱신.
 * 없으면 `wrongCount`는 배치 내 동일 키 시도 횟수 합, `resolved` 는 false.
 */
function upsertWrongNoteAttempts(
  prev: readonly WrongNoteRef[],
  attempts: readonly WrongNoteAttemptRef[],
  now: Date,
): readonly WrongNoteRef[] {
  if (attempts.length === 0) return prev

  const iso = now.toISOString()
  const byKey = new Map<string, WrongNoteRef>()
  for (const w of prev) {
    byKey.set(wrongNoteDedupeKey(w), w)
  }

  const addCountByKey = new Map<string, number>()
  const sampleByKey = new Map<string, WrongNoteAttemptRef>()
  for (const a of attempts) {
    const k = wrongNoteDedupeKey(a)
    addCountByKey.set(k, (addCountByKey.get(k) ?? 0) + 1)
    sampleByKey.set(k, a)
  }

  for (const [k, addCount] of addCountByKey) {
    const a = sampleByKey.get(k)
    if (a === undefined) continue
    const existing = byKey.get(k)
    if (existing !== undefined) {
      byKey.set(k, {
        ...existing,
        wrongCount: existing.wrongCount + addCount,
        lastWrongAt: iso,
        updatedAt: iso,
      })
    } else {
      byKey.set(k, {
        id: a.id,
        type: a.type,
        stageId: a.stageId,
        dayId: a.dayId,
        wrongCount: addCount,
        lastWrongAt: iso,
        resolved: false,
        createdAt: iso,
        updatedAt: iso,
      })
    }
  }

  return [...byKey.values()]
}

function wordReviewStatusKey(w: WordReviewStatus | WordReviewWrongAttemptRef): string {
  return `${w.stageId}:${w.lemmaId}`
}

/**
 * 단어 오답을 Word Day 기반 복습 대상으로 등록한다(Phase 11-4).
 *
 * 정책:
 * - 같은 `(stageId, lemmaId)` 는 중복 생성하지 않고 갱신한다.
 * - 오답 발생 시 `reviewLevel=0`, `correctStreak=0`, `nextReviewDayId=current+1`.
 * - `wrongCount` 는 같은 세션 내 동일 단어 오답 횟수까지 합산한다.
 * - 기존 항목의 `learnedDayId` 는 유지하고, 없던 항목만 현재 Word Day 를 사용한다.
 */
function upsertWordReviewStatusesFromWrongAttempts(
  prev: readonly WordReviewStatus[],
  attempts: readonly WordReviewWrongAttemptRef[],
): readonly WordReviewStatus[] {
  if (attempts.length === 0) return prev

  const byKey = new Map<string, WordReviewStatus>()
  for (const item of prev) {
    byKey.set(wordReviewStatusKey(item), item)
  }

  const addCountByKey = new Map<string, number>()
  const sampleByKey = new Map<string, WordReviewWrongAttemptRef>()
  for (const attempt of attempts) {
    if (attempt.lemmaId.trim() === '') continue
    const key = wordReviewStatusKey(attempt)
    addCountByKey.set(key, (addCountByKey.get(key) ?? 0) + 1)
    sampleByKey.set(key, attempt)
  }

  for (const [key, addCount] of addCountByKey) {
    const attempt = sampleByKey.get(key)
    if (attempt === undefined) continue
    const dayId = Math.max(0, Math.floor(attempt.dayId))
    const existing = byKey.get(key)
    byKey.set(key, {
      lemmaId: attempt.lemmaId,
      stageId: Math.floor(attempt.stageId),
      learnedDayId: existing?.learnedDayId ?? dayId,
      lastReviewedDayId: existing?.lastReviewedDayId,
      nextReviewDayId: dayId + 1,
      reviewLevel: 0,
      correctStreak: 0,
      wrongCount: (existing?.wrongCount ?? 0) + addCount,
      source: 'wrong-note',
    })
  }

  return [...byKey.values()].slice(-WORD_REVIEW_STATUS_CAP)
}

/**
 * 현재 Word Day 기준으로 복습 대상 단어 목록을 반환한다(Phase 11-5).
 *
 * 정책:
 * - 기준은 **Word Day 번호**다. 실제 날짜를 사용하지 않는다.
 * - `nextReviewDayId <= currentWordDayId` 인 항목만 반환한다.
 * - 같은 `lemmaId` 가 여러 항목으로 들어와 있는 비정상 데이터는 한 건만 남긴다
 *   (=`nextReviewDayId` 가 더 작은 쪽, 동률이면 `learnedDayId` 가 더 작은 쪽).
 * - 필수 필드가 비정상(빈 lemmaId / NaN / 음수 등)이면 해당 항목은 제외한다.
 * - 출력은 `nextReviewDayId → learnedDayId → lemmaId` 순으로 결정적이다.
 *
 * 본 함수는 콘텐츠 본문을 join 하지 않는다. 표시용 텍스트(`word`, `meaning` 등)는
 * 호출 측에서 `contentJoin` 으로 별도 결합한다.
 */
export function getDueWordReviewStatuses(
  progress: UserProgress,
  currentWordDayId: number,
): readonly WordReviewStatus[] {
  const list = progress.wordReviewStatuses
  if (!Array.isArray(list) || list.length === 0) return []

  const dayCeiling = Math.floor(Number(currentWordDayId))
  if (!Number.isFinite(dayCeiling) || dayCeiling < 0) return []

  const byLemma = new Map<string, WordReviewStatus>()
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    if (typeof item.lemmaId !== 'string' || item.lemmaId.trim() === '') continue
    if (!Number.isFinite(item.stageId)) continue
    if (!Number.isFinite(item.nextReviewDayId)) continue
    if (!Number.isFinite(item.learnedDayId)) continue
    const next = Math.floor(item.nextReviewDayId)
    if (next < 0) continue
    if (next > dayCeiling) continue

    const existing = byLemma.get(item.lemmaId)
    if (existing === undefined) {
      byLemma.set(item.lemmaId, item)
      continue
    }
    const exNext = Math.floor(existing.nextReviewDayId)
    if (
      next < exNext ||
      (next === exNext &&
        Math.floor(item.learnedDayId) < Math.floor(existing.learnedDayId))
    ) {
      byLemma.set(item.lemmaId, item)
    }
  }

  return [...byLemma.values()].sort((a, b) => {
    const an = Math.floor(a.nextReviewDayId)
    const bn = Math.floor(b.nextReviewDayId)
    if (an !== bn) return an - bn
    const al = Math.floor(a.learnedDayId)
    const bl = Math.floor(b.learnedDayId)
    if (al !== bl) return al - bl
    return a.lemmaId.localeCompare(b.lemmaId)
  })
}

function wordReviewIntervalForLevel(reviewLevel: number): number {
  const level = clampWordReviewLevel(reviewLevel)
  if (level <= 0) return 1
  if (level === 1) return 3
  if (level === 2) return 7
  if (level === 3) return 14
  return 30
}

function uniqueNonEmptyStrings(list: readonly string[]): readonly string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const value = raw.trim()
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export type WordReviewSessionMergeResult = Readonly<{
  next: UserProgress
  reviewedLemmaCount: number
  correctLemmaCount: number
  wrongLemmaCount: number
  nextReviewDayId: number | null
}>

/**
 * 복습 세션 결과를 Word Day 기준 복습 상태에 반영한다(Phase 11-8).
 *
 * 정책:
 * - 결과는 lemma 단위로 집계한다. 한 lemma 의 여러 문제 중 하나라도 틀리면 해당 lemma 는 오답.
 * - 정답 lemma: `correctStreak + 1`, `reviewLevel + 1`, `lastReviewedDayId=current`,
 *   `nextReviewDayId=current + interval(previousReviewLevel)`.
 * - 오답 lemma: `wrongCount + 1`, `correctStreak=0`, `reviewLevel=0`,
 *   `lastReviewedDayId=current`, `nextReviewDayId=current + 1`.
 * - 복습 세션은 보상/코인/`completedWordDays` 를 변경하지 않는다.
 * - wrongNotes 는 기존 정책대로 오답 문항 참조만 반영한다.
 */
export function mergeUserProgressAfterWordReviewSession(
  prev: UserProgress,
  params: {
    readonly stageId: number
    readonly currentWordDayId: number
    readonly answeredLemmaIds: readonly string[]
    readonly wrongAttempts: readonly WrongNoteAttemptRef[]
    readonly wrongReviewAttempts: readonly WordReviewWrongAttemptRef[]
    readonly now: Date
  },
): WordReviewSessionMergeResult {
  const currentWordDayId = Math.max(
    0,
    Math.floor(Number(params.currentWordDayId) || 0),
  )
  const answeredLemmaIds = uniqueNonEmptyStrings(params.answeredLemmaIds)

  const wrongLemmaSet = new Set<string>()
  for (const attempt of params.wrongReviewAttempts) {
    const lemmaId = attempt.lemmaId.trim()
    if (lemmaId !== '') wrongLemmaSet.add(lemmaId)
  }

  const byKey = new Map<string, WordReviewStatus>()
  for (const item of prev.wordReviewStatuses) {
    byKey.set(wordReviewStatusKey(item), item)
  }

  const updatedNextReviewDays: number[] = []
  let correctLemmaCount = 0
  let wrongLemmaCount = 0

  for (const lemmaId of answeredLemmaIds) {
    const key = `${params.stageId}:${lemmaId}`
    const existing = byKey.get(key)
    const base: WordReviewStatus =
      existing ??
      ({
        lemmaId,
        stageId: Math.floor(params.stageId),
        learnedDayId: currentWordDayId,
        nextReviewDayId: currentWordDayId,
        reviewLevel: 0,
        correctStreak: 0,
        wrongCount: 0,
        source: 'word-day',
      } satisfies WordReviewStatus)

    if (wrongLemmaSet.has(lemmaId)) {
      const nextReviewDayId = currentWordDayId + 1
      byKey.set(key, {
        ...base,
        lastReviewedDayId: currentWordDayId,
        nextReviewDayId,
        reviewLevel: 0,
        correctStreak: 0,
        wrongCount: base.wrongCount + 1,
        source: existing?.source ?? 'wrong-note',
      })
      updatedNextReviewDays.push(nextReviewDayId)
      wrongLemmaCount += 1
      continue
    }

    const previousLevel = clampWordReviewLevel(base.reviewLevel)
    const nextReviewDayId =
      currentWordDayId + wordReviewIntervalForLevel(previousLevel)
    byKey.set(key, {
      ...base,
      lastReviewedDayId: currentWordDayId,
      nextReviewDayId,
      reviewLevel: clampWordReviewLevel(previousLevel + 1),
      correctStreak: base.correctStreak + 1,
    })
    updatedNextReviewDays.push(nextReviewDayId)
    correctLemmaCount += 1
  }

  const wrongNotes = upsertWrongNoteAttempts(
    prev.wrongNotes,
    params.wrongAttempts,
    params.now,
  )
  const wordReviewStatuses = [...byKey.values()].slice(-WORD_REVIEW_STATUS_CAP)
  const next: UserProgress = {
    ...prev,
    version: USER_PROGRESS_SCHEMA_VERSION,
    wrongNotes,
    wordReviewStatuses,
    updatedAt: params.now.toISOString(),
  }

  return {
    next,
    reviewedLemmaCount: answeredLemmaIds.length,
    correctLemmaCount,
    wrongLemmaCount,
    nextReviewDayId:
      updatedNextReviewDays.length === 0
        ? null
        : Math.min(...updatedNextReviewDays),
  }
}

/** sanitize 와 동일한 상한. 클램프는 sanitize 가 한 번 더 보장한다. */
const TOTAL_MEMORIZED_WORDS_CAP = 999_999

/**
 * `mergeUserProgressAfterWordStudyDay` 결과 형식.
 * - 결과 화면에서 “이번에 받은 보상” 을 표시하기 위한 정보 + 갱신된 `UserProgress` 를 함께 돌려준다.
 * - 반복 완료 시에는 `firstCompletion === false` 가 되어 Day 보상 값이 0 으로 떨어진다.
 * - Stage 보상은 별도 멱등성(`word-stage-clear-first` history)으로만 가드하므로, Day 보상이
 *   비최초여도 Stage 보상이 처음 들어오는 경우가 있을 수 있다(예: import 후 누락 데이터 복구).
 */
export type WordStudyDayMergeResult = Readonly<{
  next: UserProgress
  firstCompletion: boolean
  expGranted: number
  coinsGranted: number
  memorizedDelta: number
  stageFirstCompletion: boolean
  stageExpGranted: number
  stageCoinsGranted: number
}>

/**
 * Stage 안의 모든 Word Day 가 `completedWordDays` 에 들어가 있는지 검사한다.
 *
 * 정책:
 * - `stageDayIds` 가 비어 있으면 “Stage 완료” 로 보지 않는다(=콘텐츠 누락/구버전 state 방어).
 * - 음수/NaN 은 무시하고 유한 정수만 본다.
 * - `completedWordDays` 에는 같은 (stage, day) 가 1건만 있으므로 단순 set 포함 검사로 충분.
 */
export function isWordStageCompleted(
  progress: UserProgress,
  stageId: number,
  stageDayIds: readonly number[],
): boolean {
  if (!Array.isArray(stageDayIds) || stageDayIds.length === 0) return false
  const completed = new Set<number>()
  for (const d of progress.completedWordDays) {
    if (d.stageId === stageId) completed.add(d.dayId)
  }
  for (const dayId of stageDayIds) {
    if (!Number.isFinite(dayId)) return false
    if (!completed.has(dayId)) return false
  }
  return true
}

/**
 * 단어 Day 학습 세션 종료 후 `UserProgress`에 반영한다(참조·시간만 저장).
 *
 * 보상 지급 흐름(Phase 10-5):
 * - 기록(`completedWordDays` 등) + streak/`rankTier` 갱신을 먼저 적용한다.
 * - **최초 완료** 판단 = `completedWordDays` 에 (stage,day) 가 없음 AND
 *   `rewardTransactionHistory` 에 `(word-day-clear-first, refId)` 가 없음.
 *   두 기준 중 한쪽이라도 이미 있으면 보상은 지급하지 않는다(=비최초).
 * - 최초 완료일 때만 `applyReward({ reason: 'word-day-clear-first', expDelta: WORD_DAY_CLEAR_FIRST_EXP, coinDelta: WORD_DAY_CLEAR_FIRST_COIN })`
 *   을 단일 진입점으로 호출하고, `totalMemorizedWords` 에 `dayWordsCount` 를 더한다.
 * - 비최초(=재완료)일 때는 기록/스트릭/오답노트만 갱신하고 보상은 0.
 */
export function mergeUserProgressAfterWordStudyDay(
  prev: UserProgress,
  params: {
    readonly stageId: number
    readonly dayId: number
    readonly wrongAttempts: readonly WrongNoteAttemptRef[]
    readonly wrongReviewAttempts?: readonly WordReviewWrongAttemptRef[]
    /** 해당 Day 의 단어 수. 최초 완료 시 `totalMemorizedWords` 증분에 사용. 음수/NaN 은 0 으로 처리. */
    readonly dayWordsCount: number
    /**
     * 해당 Stage 가 포함하는 모든 Day id. Stage 최초 완료 판정에만 사용.
     * 빈 배열/누락 시 Stage 보상 처리를 skip 한다(구버전 state·콘텐츠 누락 방어).
     */
    readonly stageDayIds?: readonly number[]
    readonly now: Date
  },
): WordStudyDayMergeResult {
  const savedAt = params.now.toISOString()
  const dateKey = formatLocalDateKey(params.now)

  const refId = buildRewardRefId('word-day-clear-first', {
    stage: params.stageId,
    day: params.dayId,
  })
  const alreadyCompleted = isWordDayCompleted(prev, params.stageId, params.dayId)
  const alreadyRewarded = hasRewardTransaction(
    prev.rewardTransactionHistory,
    'word-day-clear-first',
    refId,
  )
  const firstCompletion = !alreadyCompleted && !alreadyRewarded

  const completedWordDays = upsertCompletedWordDay(prev.completedWordDays, {
    stageId: params.stageId,
    dayId: params.dayId,
    completedAt: savedAt,
  })
  const recentStudy: RecentStudySnapshot = {
    type: 'word',
    stageId: params.stageId,
    dayId: params.dayId,
    savedAt,
  }
  const prevDc = prev.dailyStudyCount
  const dailyStudyCount: DailyStudyCount = {
    dateKey,
    count: prevDc.dateKey === dateKey ? prevDc.count + 1 : 1,
  }
  const wrongNotes = upsertWrongNoteAttempts(
    prev.wrongNotes,
    params.wrongAttempts,
    params.now,
  )
  const wordReviewStatuses = upsertWordReviewStatusesFromWrongAttempts(
    prev.wordReviewStatuses,
    params.wrongReviewAttempts ?? [],
  )
  const sr = mergeStreakAndRank(prev, dateKey)

  const memorizedDelta = firstCompletion
    ? Math.max(0, Math.floor(Number(params.dayWordsCount) || 0))
    : 0
  const nextMemorized = Math.min(
    TOTAL_MEMORIZED_WORDS_CAP,
    prev.totalMemorizedWords + memorizedDelta,
  )

  const baseNext: UserProgress = {
    ...prev,
    version: USER_PROGRESS_SCHEMA_VERSION,
    completedWordDays,
    recentStudy,
    dailyStudyCount,
    wrongNotes,
    wordReviewStatuses,
    totalMemorizedWords: nextMemorized,
    updatedAt: savedAt,
    ...sr,
  }

  let progressAfterDay: UserProgress = baseNext
  let dayFirst = firstCompletion
  let dayExp = 0
  let dayCoin = 0
  let dayMemorizedDelta = 0

  if (firstCompletion) {
    const rewardRes = applyReward(
      baseNext,
      {
        reason: 'word-day-clear-first',
        refId,
        expDelta: WORD_DAY_CLEAR_FIRST_EXP,
        coinDelta: WORD_DAY_CLEAR_FIRST_COIN,
      },
      params.now,
    )
    if (rewardRes.applied) {
      progressAfterDay = rewardRes.next
      dayExp = WORD_DAY_CLEAR_FIRST_EXP
      dayCoin = WORD_DAY_CLEAR_FIRST_COIN
      dayMemorizedDelta = nextMemorized - prev.totalMemorizedWords
    } else {
      dayFirst = false
    }
  }

  const stageRewardRes = applyStageClearReward(
    progressAfterDay,
    params.stageId,
    params.stageDayIds ?? [],
    params.now,
  )

  return {
    next: stageRewardRes.next,
    firstCompletion: dayFirst,
    expGranted: dayExp,
    coinsGranted: dayCoin,
    memorizedDelta: dayMemorizedDelta,
    stageFirstCompletion: stageRewardRes.applied,
    stageExpGranted: stageRewardRes.applied ? WORD_STAGE_CLEAR_FIRST_EXP : 0,
    stageCoinsGranted: stageRewardRes.applied ? WORD_STAGE_CLEAR_FIRST_COIN : 0,
  }
}

/**
 * Word Stage 최초 완료 보상 적용(내부 헬퍼).
 *
 * 정책:
 * - `stageDayIds` 가 비어 있으면 stage 완료 판단 불가 → skip.
 * - `isWordStageCompleted` 가 false 면 skip.
 * - 이미 `(word-stage-clear-first, refId)` 가 history 에 있으면 skip.
 * - 위 조건을 모두 통과하면 `applyReward({ expDelta: 200, coinDelta: 50 })` 1회 적용.
 *
 * 반환값의 `applied === true` 가 “이번에 새로 들어간 stage 보상”을 의미한다.
 */
function applyStageClearReward(
  prev: UserProgress,
  stageId: number,
  stageDayIds: readonly number[],
  now: Date,
): Readonly<{ applied: boolean; next: UserProgress }> {
  if (stageDayIds.length === 0) {
    return { applied: false, next: prev }
  }
  if (!isWordStageCompleted(prev, stageId, stageDayIds)) {
    return { applied: false, next: prev }
  }
  const refId = buildRewardRefId('word-stage-clear-first', { stage: stageId })
  if (
    hasRewardTransaction(
      prev.rewardTransactionHistory,
      'word-stage-clear-first',
      refId,
    )
  ) {
    return { applied: false, next: prev }
  }
  const rewardRes = applyReward(
    prev,
    {
      reason: 'word-stage-clear-first',
      refId,
      expDelta: WORD_STAGE_CLEAR_FIRST_EXP,
      coinDelta: WORD_STAGE_CLEAR_FIRST_COIN,
    },
    now,
  )
  if (!rewardRes.applied) {
    return { applied: false, next: prev }
  }
  return { applied: true, next: rewardRes.next }
}

function upsertCompletedConversationDay(
  list: readonly CompletedConversationDayRef[],
  next: CompletedConversationDayRef,
): readonly CompletedConversationDayRef[] {
  const tail = list.filter(
    (x) => !(x.stageId === next.stageId && x.dayId === next.dayId),
  )
  return [...tail, next]
}

/**
 * 실전 회화 Day 완료 후 `UserProgress`에 반영(참조·시간만).
 * `dailyStudyCount`는 단어 완료와 동일하게 “당일 학습 세션 횟수” MVP 로 공유한다.
 *
 * 보상 정책(Phase 8-10 / 10-2):
 * - 회화 Day 완료는 **코인/EXP 보상 0**. 본 함수에서 `applyReward` 호출이 없다.
 * - `completedConversationDays` 기록, `recentStudy`, `dailyStudyCount` 증가,
 *   `streakDays`/`lastStudyDateKey`/`rankTier` 갱신은 유지한다(=학습 진행 추적).
 */
export function mergeUserProgressAfterConversationDay(
  prev: UserProgress,
  params: {
    readonly stageId: number
    readonly dayId: number
    readonly expressionWrongQuizIds: readonly string[]
    readonly now: Date
  },
): UserProgress {
  const savedAt = params.now.toISOString()
  const dateKey = formatLocalDateKey(params.now)
  const completedConversationDays = upsertCompletedConversationDay(
    prev.completedConversationDays,
    {
      stageId: params.stageId,
      dayId: params.dayId,
      completedAt: savedAt,
    },
  )
  const recentStudy: RecentStudySnapshot = {
    type: 'conversation',
    stageId: params.stageId,
    dayId: params.dayId,
    savedAt,
  }
  const prevDc = prev.dailyStudyCount
  const dailyStudyCount: DailyStudyCount = {
    dateKey,
    count: prevDc.dateKey === dateKey ? prevDc.count + 1 : 1,
  }
  const wrongAttempts: WrongNoteAttemptRef[] = params.expressionWrongQuizIds.map(
    (id) => ({
      type: 'expression',
      id,
      stageId: params.stageId,
      dayId: params.dayId,
    }),
  )
  const wrongNotes = upsertWrongNoteAttempts(
    prev.wrongNotes,
    wrongAttempts,
    params.now,
  )
  const sr = mergeStreakAndRank(prev, dateKey)
  return {
    ...prev,
    version: USER_PROGRESS_SCHEMA_VERSION,
    completedConversationDays,
    recentStudy,
    dailyStudyCount,
    wrongNotes,
    updatedAt: savedAt,
    ...sr,
  }
}

/** 회화 결과 화면 `localStorage` 저장 1회용 가드 */
export function markConversationPersistHandled(nonce: string): boolean {
  return markConversationPersistHandledCore(nonce)
}

/**
 * 단어 결과 화면에서 `localStorage` 반영이 연속 호출될 때 한 번만 허용한다.
 * @returns 저장을 진행하면 `true`, 건너뛰면 `false`
 */
export function markWordStudyPersistHandled(nonce: string): boolean {
  try {
    return markWordStudyPersistHandledCore(nonce)
  } catch {
    /* sessionStorage 막힌 환경: 중복 허용 vs 미저장 — 저장 시도 쪽 선택 */
    return true
  }
}

/**
 * `localStorage`에서 읽어 `UserProgress`로 복원한다. 오류 시 기본값.
 */
export function loadUserProgress(): UserProgress {
  try {
    const raw = readLocalStorageItem(STORAGE_KEY_USER_PROGRESS)
    if (raw === null || raw === '') return createDefaultUserProgressWithLocalId()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return createDefaultUserProgressWithLocalId()
    }
    return parseStoredUserProgress(parsed)
  } catch {
    return createDefaultUserProgressWithLocalId()
  }
}

/**
 * `localStorage`에 쓸 때 v3 필드가 항상 한 번에 들어가도록 정규화한다(부분 갱신 실수 방지).
 */
export function sanitizeUserProgressForStorage(input: UserProgress): UserProgress {
  const lastRaw = input.lastStudyDateKey
  const lastStudyDateKey =
    typeof lastRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastRaw)
      ? lastRaw
      : ''

  const updatedAtRaw = input.updatedAt
  const updatedAt =
    typeof updatedAtRaw === 'string' && updatedAtRaw.trim() !== ''
      ? updatedAtRaw
      : new Date().toISOString()

  const dg = Math.floor(Number(input.dailyWordGoal) || 0)
  const dailyWordGoal = dg >= 1 && dg <= 366 ? dg : DEFAULT_DAILY_WORD_GOAL

  // userId: 비어 있거나 비-문자열이면 1회 발급(저장 중 사일런트 손실 방지).
  // 길이는 임의 입력 대비 USER_ID_MAX_LENGTH 로 캡.
  const userIdRaw = input.userId
  const userId =
    typeof userIdRaw === 'string' && userIdRaw.trim() !== ''
      ? userIdRaw.slice(0, USER_ID_MAX_LENGTH)
      : generateLocalUserId()

  // dailyCoinAmount: 음수/NaN/비-숫자 차단, 비정상 큰 값은 캡으로 잘라 저장한다.
  const dailyCoinAmount = (() => {
    const raw = Number(input.dailyCoinAmount)
    const n = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_DAILY_COIN_AMOUNT
    return Math.max(0, Math.min(DAILY_COIN_AMOUNT_MAX, n))
  })()

  // lastDailyCoinGrantedDate: 'YYYY-MM-DD' 또는 null 만 통과시킨다.
  const lastDailyCoinGrantedDateRaw = input.lastDailyCoinGrantedDate
  const lastDailyCoinGrantedDate =
    typeof lastDailyCoinGrantedDateRaw === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(lastDailyCoinGrantedDateRaw)
      ? lastDailyCoinGrantedDateRaw
      : null

  // rewardTransactionHistory:
  // - 배열이 아니면 [] 로 안전화
  // - 각 항목을 parseRewardTransaction 으로 재검증해 손상 항목은 버린다
  // - 무한 누적 방지를 위해 끝(최근) REWARD_HISTORY_CAP 개만 유지한다
  //   (createdAt 기준 시간 정렬은 후속 Phase 에서 정책 확정 후 적용)
  const historyRaw = input.rewardTransactionHistory
  const rewardTransactionHistory: readonly RewardTransaction[] = Array.isArray(
    historyRaw,
  )
    ? historyRaw
        .map((it) => parseRewardTransaction(it))
        .filter((it): it is RewardTransaction => it !== null)
        .slice(-REWARD_HISTORY_CAP)
    : []

  // wordReviewStatuses:
  // - 배열이 아니면 [] 로 안전화
  // - 각 항목을 parseWordReviewStatus 로 재검증해 손상 항목은 버린다
  // - 같은 (stage, lemma) 는 1건만 유지(중복 레코드 차단)
  // - 무한 누적 방지를 위해 WORD_REVIEW_STATUS_CAP 으로 끝쪽을 자른다
  const wordReviewStatusesRaw = input.wordReviewStatuses
  const wordReviewStatuses: readonly WordReviewStatus[] = Array.isArray(
    wordReviewStatusesRaw,
  )
    ? dedupeWordReviewStatuses(
        wordReviewStatusesRaw
          .map((it) => parseWordReviewStatus(it))
          .filter((it): it is WordReviewStatus => it !== null),
      ).slice(-WORD_REVIEW_STATUS_CAP)
    : []

  // userExp 정규화 결과를 변수에 보관해 rankTier 산정에 재사용한다(Phase 10-7).
  const sanitizedUserExp = (() => {
    const raw = Number(input.userExp)
    const n = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_USER_EXP
    return Math.max(0, Math.min(999_999_999, n))
  })()

  return {
    version: USER_PROGRESS_SCHEMA_VERSION,
    nickname:
      typeof input.nickname === 'string'
        ? input.nickname.trim().slice(0, 32)
        : '',
    userId,
    streakDays: Math.max(0, Math.floor(Number(input.streakDays) || 0)),
    lastStudyDateKey,
    coins: Math.max(0, Math.floor(Number(input.coins) || 0)),
    dailyCoinAmount,
    lastDailyCoinGrantedDate,
    rankTier: calculateRankTierFromExp(sanitizedUserExp),
    userExp: sanitizedUserExp,
    dailyWordGoal,
    totalMemorizedWords: (() => {
      const raw = Number(input.totalMemorizedWords)
      const n = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_TOTAL_MEMORIZED_WORDS
      return Math.max(0, Math.min(999_999, n))
    })(),
    completedWordDays: input.completedWordDays,
    completedConversationDays: input.completedConversationDays,
    savedWords: input.savedWords,
    savedExpressions: input.savedExpressions,
    wrongNotes: input.wrongNotes,
    wordReviewStatuses,
    rewardTransactionHistory,
    recentStudy: input.recentStudy,
    dailyStudyCount: input.dailyStudyCount,
    updatedAt,
  }
}

/**
 * `UserProgress` 전체를 직렬화해 저장한다. 저장 실패 시 조용히 무시한다.
 */
export function saveUserProgress(next: UserProgress): void {
  try {
    const normalized = sanitizeUserProgressForStorage(next)
    const payload = JSON.stringify(normalized)
    if (writeLocalStorageItem(STORAGE_KEY_USER_PROGRESS, payload) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(HADES_USER_PROGRESS_EVENT))
    }
  } catch {
    /* quota / private mode 등 */
  }
}

/** 수동으로 한 번 더 디스크 반영(`updatedAt` 갱신). */
export function persistUserProgressManualTouch(): boolean {
  try {
    const prev = loadUserProgress()
    saveUserProgress({
      ...prev,
      version: USER_PROGRESS_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    })
    return true
  } catch {
    return false
  }
}

/** 닉네임만 갱신(최대 32자). */
export function persistNickname(nickname: string): void {
  const prev = loadUserProgress()
  const trimmed = nickname.trim().slice(0, 32)
  saveUserProgress({
    ...prev,
    nickname: trimmed,
    version: USER_PROGRESS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * 게스트 프로필이 온보딩(닉네임 설정)을 통과했는지 판단.
 *
 * 정책(Phase 12-0):
 * - localStorage 키가 비어 있거나 닉네임이 빈 문자열이면 false.
 * - `loadUserProgress` 가 메모리 default 로 폴백한 경우(아직 disk 에 한 번도 쓰인 적 없음)
 *   에도 닉네임은 default 인 '' 이므로 false 가 된다.
 * - 라우터 가드(`RequireOnboarding`) 와 온보딩 페이지 자동 redirect 의 단일 진입점이다.
 * - localStorage 키 / 스키마 버전은 변경하지 않는다.
 */
export function hasNicknameOnboardingCompleted(): boolean {
  try {
    const p = loadUserProgress()
    return p.nickname.trim() !== ''
  } catch {
    return false
  }
}

/**
 * 게스트 초기화(Phase 12-0-C) — localStorage 의 `UserProgress` 단일 키만 삭제한다.
 *
 * 정책:
 * - 서버 로그아웃이 아니다. JWT/세션 토큰은 없으며 호출하지도 않는다(=API 호출 없음).
 * - `localStorage.removeItem(STORAGE_KEY_USER_PROGRESS)` 만 수행한다(키 이름은 변경하지 않는다).
 * - 다른 `localStorage` 키나 sessionStorage / cookie 는 건드리지 않는다.
 * - 삭제 직후 `HADES_USER_PROGRESS_EVENT` 를 dispatch 해 화면이 즉시 default 로 재구독된다.
 *   - 다음 `loadUserProgress` 호출은 키가 없으므로 메모리 default 를 반환한다
 *     (닉네임이 비어 있어 `hasNicknameOnboardingCompleted` 가 false → 온보딩 화면으로 보냄).
 * - 삭제 실패(권한/quota/private mode 등) 시 조용히 false 를 돌려주고 던지지 않는다.
 * - schema version 은 변경하지 않는다.
 *
 * 반환:
 * - `true`  : 키가 있어 정상 삭제 또는 키가 없어 이미 초기 상태인 경우.
 * - `false` : `localStorage` 접근 자체가 실패한 경우.
 */
export function clearUserProgress(): boolean {
  try {
    if (!removeLocalStorageItem(STORAGE_KEY_USER_PROGRESS)) return false
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(HADES_USER_PROGRESS_EVENT))
    }
    return true
  } catch {
    return false
  }
}

/**
 * 일일 코인 지급을 (가능할 때) 시도하고 결과를 저장한다.
 *
 * 호출 정책:
 * - 호출자는 보통 `canGrantDailyCoin(loadUserProgress())` 로 카드 가시성을 판단한 뒤 이 함수를 호출한다.
 * - 본 함수도 내부에서 `grantDailyCoin` 의 멱등 검사가 다시 한 번 동작하므로, 호출 전 race condition 으로
 *   화면이 잠시 어긋난 경우라도 같은 날짜에 두 번 들어가지 않는다.
 * - `granted: false` 라도 `lastDailyCoinGrantedDate` 만 갱신되는 경우가 있어 save 는 항상 호출한다(노이즈 없게
 *   `next === prev` 일 때만 skip).
 */
export function persistGrantDailyCoinIfDue(
  now: Date = new Date(),
): GrantDailyCoinResult {
  const prev = loadUserProgress()
  const res = grantDailyCoin(prev, now)
  if (res.next !== prev) {
    saveUserProgress(res.next)
  }
  return res
}

export function persistStartWordDayWithCoinCost(
  stageId: number,
  dayId: number,
  attemptKey: string,
  now: Date = new Date(),
): StartWordDayResult {
  const prev = loadUserProgress()
  const res = startWordDayWithCoinCost(prev, stageId, dayId, attemptKey, now)
  if (res.next !== prev) {
    saveUserProgress(res.next)
  }
  return res
}

export function downloadUserProgressBackup(): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return
  const p = sanitizeUserProgressForStorage(loadUserProgress())
  const blob = new Blob([JSON.stringify(p, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hadesvoca-progress-v${p.version}.json`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * import 시 사용자 진행 파일의 최소 형상 가드.
 *
 * 목적: "JSON 문법은 valid 하지만 `UserProgress` 가 아닌" 파일(예: `{}`, 다른 앱의
 * 백업, 임의 객체)이 진입해 기존 진행 데이터가 `defaults` 로 사일런트하게
 * 덮어씌워지는 것을 막는다.
 *
 * 형상이 통과하면 안전하게 `parseStoredUserProgress` → `sanitize` 로 흘려보내고,
 * 통과하지 못하면 import 자체를 실패로 처리해 디스크는 손대지 않는다.
 *
 * 검증 항목은 도메인 의미가 분명한 필드만 골랐다(중첩 형상은 parse 단계가 책임).
 */
function looksLikeUserProgressShape(x: unknown): x is Record<string, unknown> {
  if (!isRecord(x)) return false
  if (typeof x.version !== 'number') return false
  if (typeof x.nickname !== 'string') return false
  if (!Array.isArray(x.completedWordDays)) return false
  if (!Array.isArray(x.completedConversationDays)) return false
  if (!Array.isArray(x.savedWords)) return false
  if (!Array.isArray(x.savedExpressions)) return false
  if (!Array.isArray(x.wrongNotes)) return false
  return true
}

export function importUserProgressFromJsonText(
  text: string,
): Readonly<{ ok: true } | { ok: false; message: string }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { ok: false, message: 'JSON을 해석할 수 없습니다.' }
  }
  // 최소 형상 가드: 통과 못 하면 saveUserProgress 를 호출하지 않아 기존 데이터를
  // defaults 로 덮어쓰지 않는다.
  if (!looksLikeUserProgressShape(parsed)) {
    return {
      ok: false,
      message:
        '하데스 보카 진행 파일이 아닙니다. 기존 데이터는 변경되지 않았습니다.',
    }
  }
  const next = parseStoredUserProgress(parsed)
  saveUserProgress(next)
  return { ok: true }
}

export function isWordDayCompleted(
  progress: UserProgress,
  stageId: number,
  dayId: number,
): boolean {
  return progress.completedWordDays.some(
    (d) => d.stageId === stageId && d.dayId === dayId,
  )
}

export function isConversationDayCompletedPersisted(
  progress: UserProgress,
  stageId: number,
  dayId: number,
): boolean {
  return progress.completedConversationDays.some(
    (d) => d.stageId === stageId && d.dayId === dayId,
  )
}

/** 동일 `lemmaId` 가 있으면 덮어쓰고, 없으서 추가한다(중복 레코드 없음). */
export function persistUpsertSavedWord(
  lemmaId: string,
  stageId: number,
  dayId: number,
): void {
  const prev = loadUserProgress()
  const nowIso = new Date().toISOString()
  const nextRef: SavedWordRef = { lemmaId, stageId, dayId, savedAt: nowIso }
  const savedWords = [
    ...prev.savedWords.filter((w) => w.lemmaId !== lemmaId),
    nextRef,
  ]
  saveUserProgress({ ...prev, savedWords, updatedAt: nowIso })
}

export function persistRemoveSavedWord(lemmaId: string): void {
  const prev = loadUserProgress()
  const nowIso = new Date().toISOString()
  saveUserProgress({
    ...prev,
    savedWords: prev.savedWords.filter((w) => w.lemmaId !== lemmaId),
    updatedAt: nowIso,
  })
}

/** 동일 `(expressionId, stageId, dayId)` 는 하나만 유지한다. */
export function persistUpsertSavedExpression(
  expressionId: string,
  stageId: number,
  dayId: number,
): void {
  const prev = loadUserProgress()
  const nowIso = new Date().toISOString()
  const nextRef: SavedExpressionRef = {
    expressionId,
    stageId,
    dayId,
    savedAt: nowIso,
  }
  const savedExpressions = [
    ...prev.savedExpressions.filter(
      (e) =>
        !(
          e.expressionId === expressionId &&
          e.stageId === stageId &&
          e.dayId === dayId
        ),
    ),
    nextRef,
  ]
  saveUserProgress({ ...prev, savedExpressions, updatedAt: nowIso })
}

export function persistRemoveSavedExpression(
  expressionId: string,
  stageId: number,
  dayId: number,
): void {
  const prev = loadUserProgress()
  const nowIso = new Date().toISOString()
  saveUserProgress({
    ...prev,
    savedExpressions: prev.savedExpressions.filter(
      (e) =>
        !(
          e.expressionId === expressionId &&
          e.stageId === stageId &&
          e.dayId === dayId
        ),
    ),
    updatedAt: nowIso,
  })
}
