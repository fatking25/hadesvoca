/**
 * `localStorage` 기반 `UserProgress` save/load.
 * — 파싱 실패·스키마 불일치 시 `createDefaultUserProgress()`로 복구한다.
 * — 모든 `localStorage` 접근은 try/catch로 감싼다.
 */

import { STORAGE_KEY_USER_PROGRESS } from '../constants/storageKeys'
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
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  const ts = Date.now().toString()
  const rand = Math.random().toString(36).slice(2, 10)
  return `local-${ts}-${rand}`
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
 * 코인 지급·EXP 증가·암기 단어 증가 같은 도메인 로직은 여전히 후속 Phase 의 책임이다.
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

function readRankTierField(x: unknown): number | undefined {
  const n = readFiniteNumber(x)
  if (n === undefined || !Number.isFinite(n)) return undefined
  return Math.max(1, Math.min(99, Math.floor(n)))
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

function rankTierFromTotals(wordDone: number, convDone: number): number {
  const t = wordDone + convDone
  return Math.max(1, Math.min(99, 1 + Math.floor(t / 3)))
}

const COINS_PER_DAY_SESSION = 10

function mergeProgressGamification(
  prev: UserProgress,
  dateKey: string,
  nextWordLen: number,
  nextConvLen: number,
): Pick<UserProgress, 'streakDays' | 'lastStudyDateKey' | 'coins' | 'rankTier'> {
  const { streakDays, lastStudyDateKey } = nextStreakAfterStudy(prev, dateKey)
  return {
    streakDays,
    lastStudyDateKey,
    coins: prev.coins + COINS_PER_DAY_SESSION,
    rankTier: rankTierFromTotals(nextWordLen, nextConvLen),
  }
}

function readString(x: unknown): string | undefined {
  return typeof x === 'string' ? x : undefined
}

const REWARD_TRANSACTION_REASONS = new Set<RewardTransactionReason>([
  'daily_coin',
  'word_day_complete',
  'conversation_day_complete',
  'stage_complete',
  'manual',
])

/**
 * sanitize 단계 캡/디폴트.
 * - 실제 운영 정책(일일 코인 기본 30, 이력 캡 등)은 후속 Phase 에서 확정된다.
 * - 이 상수들은 "비정상 입력을 저장하지 않기" 위한 안전망이지 정책 선언이 아니다.
 */
const DEFAULT_DAILY_COIN_AMOUNT = 30 as const
const DAILY_COIN_AMOUNT_MAX = 1_000 as const
const USER_ID_MAX_LENGTH = 128 as const
const REWARD_HISTORY_CAP = 2_000 as const

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
  const rankTierParsed = readRankTierField(parsed.rankTier)
  const rankTier = rankTierParsed ?? defaults.rankTier

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
    rankTier,
    userExp,
    dailyWordGoal,
    totalMemorizedWords,
    completedWordDays,
    completedConversationDays,
    savedWords,
    savedExpressions,
    wrongNotes,
    rewardTransactionHistory,
    recentStudy,
    dailyStudyCount,
    updatedAt,
  }
}

const WORD_STUDY_PERSIST_SESSION_PREFIX = 'hadesvoca:wordStudyPersist:' as const

const CONVERSATION_PERSIST_SESSION_PREFIX =
  'hadesvoca:conversationPersist:' as const

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

/**
 * 단어 Day 학습 세션 종료 후 `UserProgress`에 반영한다(참조·시간만 저장).
 */
export function mergeUserProgressAfterWordStudyDay(
  prev: UserProgress,
  params: {
    readonly stageId: number
    readonly dayId: number
    readonly wrongAttempts: readonly WrongNoteAttemptRef[]
    readonly now: Date
  },
): UserProgress {
  const savedAt = params.now.toISOString()
  const dateKey = formatLocalDateKey(params.now)
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
  const gamification = mergeProgressGamification(
    prev,
    dateKey,
    completedWordDays.length,
    prev.completedConversationDays.length,
  )
  return {
    ...prev,
    version: USER_PROGRESS_SCHEMA_VERSION,
    completedWordDays,
    recentStudy,
    dailyStudyCount,
    wrongNotes,
    updatedAt: savedAt,
    ...gamification,
  }
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
  const gamification = mergeProgressGamification(
    prev,
    dateKey,
    prev.completedWordDays.length,
    completedConversationDays.length,
  )
  return {
    ...prev,
    version: USER_PROGRESS_SCHEMA_VERSION,
    completedConversationDays,
    recentStudy,
    dailyStudyCount,
    wrongNotes,
    updatedAt: savedAt,
    ...gamification,
  }
}

/** 회화 결과 화면 `localStorage` 저장 1회용 가드 */
export function markConversationPersistHandled(nonce: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return true
    const key = `${CONVERSATION_PERSIST_SESSION_PREFIX}${nonce}`
    if (sessionStorage.getItem(key) === '1') return false
    sessionStorage.setItem(key, '1')
    return true
  } catch {
    return true
  }
}

/**
 * 단어 결과 화면에서 `localStorage` 반영이 연속 호출될 때 한 번만 허용한다.
 * @returns 저장을 진행하면 `true`, 건너뛰면 `false`
 */
export function markWordStudyPersistHandled(nonce: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return true
    const key = `${WORD_STUDY_PERSIST_SESSION_PREFIX}${nonce}`
    if (sessionStorage.getItem(key) === '1') return false
    sessionStorage.setItem(key, '1')
    return true
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
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEY_USER_PROGRESS)
        : null
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
    rankTier: Math.max(1, Math.min(99, Math.floor(Number(input.rankTier) || 1))),
    userExp: (() => {
      const raw = Number(input.userExp)
      const n = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_USER_EXP
      return Math.max(0, Math.min(999_999_999, n))
    })(),
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
    if (typeof localStorage === 'undefined') return
    const normalized = sanitizeUserProgressForStorage(next)
    const payload = JSON.stringify(normalized)
    localStorage.setItem(STORAGE_KEY_USER_PROGRESS, payload)
    if (typeof window !== 'undefined') {
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
