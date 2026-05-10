/**
 * 사용자 기기(localStorage)에 둘 진행·북마크 데이터 타입.
 * 커리큘럼 JSON(`content.ts`, `conversation.ts`) 본문은 저장하지 않고 참조만 둔다.
 */

/** `UserProgress.version` — 스키마 바꿀 때마다 올리고 `storage`에서 분기한다. */
export const USER_PROGRESS_SCHEMA_VERSION = 2 as const
export type UserProgressVersion = typeof USER_PROGRESS_SCHEMA_VERSION

/** v1 진행 저장과의 호환: 구 오답 `kind`(conversation)만 달랐던 값 */
export const USER_PROGRESS_SCHEMA_VERSION_LEGACY = 1 as const

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
 * localStorage에 직렬화해 두는 루트 객체.
 * 필드가 늘어나면 `version`을 올리고 `utils/storage`에서 병합·마이그레이션한다.
 */
export interface UserProgress {
  readonly version: UserProgressVersion
  readonly nickname: string
  readonly completedWordDays: readonly CompletedWordDayRef[]
  readonly completedConversationDays: readonly CompletedConversationDayRef[]
  readonly savedWords: readonly SavedWordRef[]
  readonly savedExpressions: readonly SavedExpressionRef[]
  readonly wrongNotes: readonly WrongNoteRef[]
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
    completedWordDays: [],
    completedConversationDays: [],
    savedWords: [],
    savedExpressions: [],
    wrongNotes: [],
    recentStudy: null,
    dailyStudyCount: {
      dateKey: formatLocalDateKey(now),
      count: 0,
    },
    updatedAt: now.toISOString(),
  }
}
