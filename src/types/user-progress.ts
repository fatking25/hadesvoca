/**
 * 사용자 기기(localStorage)에 둘 진행·북마크 데이터 타입.
 * 커리큘럼 JSON(`content.ts`, `conversation.ts`) 본문은 저장하지 않고 참조만 둔다.
 */

/** `UserProgress.version` — 스키마 바꿀 때마다 올리고 `storage`에서 분기한다. */
export const USER_PROGRESS_SCHEMA_VERSION = 3 as const
export type UserProgressVersion = typeof USER_PROGRESS_SCHEMA_VERSION

/** 사용자 EXP(후속 Phase에서 지급 로직 연결 전까지 저장만) */
export const DEFAULT_USER_EXP = 0 as const
/** 일일 학습 목표(오늘 카운터 분모 · UI 표시) */
export const DEFAULT_DAILY_WORD_GOAL = 30 as const
/** 누적 암기 단어 수(게임 로직 연결 전까지 저장·표시용) */
export const DEFAULT_TOTAL_MEMORIZED_WORDS = 0 as const

/** v1 진행 저장과의 호환: 구 오답 `kind`(conversation)만 달랐던 값 */
export const USER_PROGRESS_SCHEMA_VERSION_LEGACY = 1 as const

/** v2 — streak·코인·등급 필드 없음 */
export const USER_PROGRESS_SCHEMA_VERSION_2 = 2 as const

/** 오답노트 한 건의 유형 — 단어 퀴즈 / 표현(회화) 퀴즈 */
export type WrongNoteType = 'word' | 'expression'

/** 퀴즈 세션에서 오답 1회(또는 동일 문항 재오답)마다 증분할 참조 단위 */
export interface WrongNoteAttemptRef {
  readonly type: WrongNoteType
  readonly id: string
  readonly stageId: number
  readonly dayId: number
}

/** 단일 문항 시도 한 건(localStorage 등) — 기존 Phase 정의 유지 */
export interface WordStudyAttemptRecord {
  readonly questionId: string
  readonly lemmaId: string
  readonly dayId: number
  readonly stageId: number
  readonly correct: boolean
  readonly answeredAtIso8601: string
}

/** 단어 Stage/Day 완료 한 건(본문 없음) */
export interface CompletedWordDayRef {
  readonly stageId: number
  readonly dayId: number
  readonly completedAt: string
}

/** 실전 회화 Stage/Day 완료 한 건(본문 없음) */
export interface CompletedConversationDayRef {
  readonly stageId: number
  readonly dayId: number
  readonly completedAt: string
}

/** 단어장에 넣은 단어 — lemma·소속 Stage/Day 참조만 */
export interface SavedWordRef {
  readonly lemmaId: string
  readonly stageId: number
  readonly dayId?: number
  readonly savedAt: string
}

/** 핵심 표현 저장 — 콘텐츠의 expression `id` 등 */
export interface SavedExpressionRef {
  readonly expressionId: string
  readonly stageId: number
  readonly dayId: number
  readonly savedAt: string
}

/**
 * 오답노트 한 건(문제 본문 없이 참조·통계만).
 * `id`는 단어 퀴즈는 `question.id`, 표현 퀴즈는 `quiz.id`.
 */
export interface WrongNoteRef {
  readonly id: string
  readonly type: WrongNoteType
  readonly stageId: number
  readonly dayId: number
  readonly wrongCount: number
  readonly lastWrongAt: string
  readonly resolved: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** 마지막으로 열었던 학습 위치(이어하기용) */
export interface RecentStudySnapshot {
  readonly type: 'word' | 'conversation'
  readonly stageId: number
  readonly dayId: number
  readonly savedAt: string
}

/** 당일 학습 횟수(로컬 날짜 기준) */
export interface DailyStudyCount {
  readonly dateKey: string
  readonly count: number
}

/**
 * 보상/코인 거래 1건의 사유. UI 메시지·통계 분류·중복 지급 가드(`refId`)에 함께 쓰인다.
 * - `daily_coin`                : 매일 1회 무료 코인 지급
 * - `word_day_complete`         : 단어 Day 최초 완료 보상
 * - `conversation_day_complete` : 회화 Day 최초 완료 보상(현재는 지급 보류, 자리 예약)
 * - `stage_complete`            : Stage 최초 완료 보상(단어 우선, 회화 보류)
 * - `manual`                    : 수동 보정·디버그용 1회 항목
 */
export type RewardTransactionReason =
  | 'daily_coin'
  | 'word_day_complete'
  | 'conversation_day_complete'
  | 'stage_complete'
  | 'manual'

/**
 * 보상/코인 거래 한 건. EXP·코인 변동을 한 줄에 합쳐 적고, `(reason, refId)` 단일성으로
 * 중복 지급을 차단한다. 본문 저장 금지 원칙상 콘텐츠 텍스트는 들어가지 않으며 참조 id 문자열만 둔다.
 * 지급 규칙·sanitize 길이 캡 등 실제 적용 로직은 후속 Phase 에서 연결한다.
 */
export interface RewardTransaction {
  /** 거래 자체의 고유 id(예: UUID). 동일 거래 재기록 방지에 사용 */
  readonly id: string
  readonly reason: RewardTransactionReason
  /** 멱등 키(예: `word-day-clear-first:stage:1:day:3`). 같은 키 재기록 금지 */
  readonly refId: string | null
  /** 이번 거래로 더할 EXP 변화량. 지급은 양수, 보정은 음수 가능 */
  readonly expDelta: number
  /** 이번 거래로 더할 코인 변화량. 지급은 양수, 차감은 음수 */
  readonly coinDelta: number
  /** ISO8601 타임스탬프 */
  readonly createdAt: string
}

/**
 * localStorage 키 `hadesvoca:userProgress` 에 JSON으로 넣는 루트 스냅샷.
 * 자동 저장(퀴즈·회화 완료, 단어장 등)과 수동 저장·임포트 모두 같은 형식이다.
 * 필드 추가 시 `utils/storage.ts` 파서·sanitize에서 기본값으로 병합한다. 호환 깨지는 변경만 version 상향.
 */
export interface UserProgress {
  readonly version: UserProgressVersion
  readonly nickname: string
  /**
   * 로컬에서 생성된 익명 사용자 id(첫 진입 시 자동 발급, PII와 결합하지 않음).
   * 서버/로그인 도입 시 계정 id 로 1:1 승격 가능. 발급 함수는 후속 Phase에서 연결.
   */
  readonly userId: string
  /** 로컬 달력 기준 연속 학습일(첫 활동일 1부터, 날짜가 끊기면 1로 리셋) */
  readonly streakDays: number
  /** `streakDays`를 마지막으로 갱신한 로컬일 `YYYY-MM-DD` */
  readonly lastStudyDateKey: string
  /** 소프트 재화(MVP) */
  readonly coins: number
  /** 사용자별 일일 무료 코인 지급량(현재 정책 기본 30, sanitize 단계에서 범위 클램프) */
  readonly dailyCoinAmount: number
  /** 마지막으로 일일 코인을 지급한 로컬일 `YYYY-MM-DD`. 미지급이면 `null` */
  readonly lastDailyCoinGrantedDate: string | null
  /** 사용자 등급 티어(1~99, 완료 Day 수에서 파생·저장) — UI의 LV로 표시 */
  readonly rankTier: number
  /** 누적 경험치(EXP). 지급 규칙은 후속 작업. */
  readonly userExp: number
  /** 하루 학습 세션 목표(기본 30). `dailyStudyCount.count`와 짝을 이룸 */
  readonly dailyWordGoal: number
  /** 암기 처리한 단어 누적 수(본문 미저장 · 후속 로직에서 갱신) */
  readonly totalMemorizedWords: number
  readonly completedWordDays: readonly CompletedWordDayRef[]
  readonly completedConversationDays: readonly CompletedConversationDayRef[]
  readonly savedWords: readonly SavedWordRef[]
  readonly savedExpressions: readonly SavedExpressionRef[]
  readonly wrongNotes: readonly WrongNoteRef[]
  /**
   * 보상/코인 거래 이력. `(reason, refId)` 단일성으로 중복 지급을 차단하고,
   * sanitize 단계의 길이 캡으로 무한 누적을 방지한다(캡 수치는 후속 Phase에서 확정).
   */
  readonly rewardTransactionHistory: readonly RewardTransaction[]
  readonly recentStudy: RecentStudySnapshot | null
  readonly dailyStudyCount: DailyStudyCount
  readonly updatedAt: string
}

/** 로컬 달력 기준 `YYYY-MM-DD`(일일 카운터·통계 분리용) */
export function formatLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 저장소가 비었거나 파싱 실패 시 복구용 기본 스냅샷.
 * `dailyStudyCount.dateKey`는 호출 시점의 로컬 달력 날짜로 둔다.
 */
export function createDefaultUserProgress(now: Date = new Date()): UserProgress {
  return {
    version: USER_PROGRESS_SCHEMA_VERSION,
    nickname: '',
    userId: '',
    streakDays: 0,
    lastStudyDateKey: '',
    coins: 0,
    dailyCoinAmount: 30,
    lastDailyCoinGrantedDate: null,
    rankTier: 1,
    userExp: DEFAULT_USER_EXP,
    dailyWordGoal: DEFAULT_DAILY_WORD_GOAL,
    totalMemorizedWords: DEFAULT_TOTAL_MEMORIZED_WORDS,
    completedWordDays: [],
    completedConversationDays: [],
    savedWords: [],
    savedExpressions: [],
    wrongNotes: [],
    rewardTransactionHistory: [],
    recentStudy: null,
    dailyStudyCount: {
      dateKey: formatLocalDateKey(now),
      count: 0,
    },
    updatedAt: now.toISOString(),
  }
}
