/**
 * Duolingo 스타일 순차 해금: 같은 Stage 안에서 바로 직전 Day 완료 후에만 다음 Day 진입 허용.
 * (다음 Stage·멀티 Stage는 추후 스테이지 단위 규칙으로 확장)
 */

/** `sortedDayIds`는 오름차순이라고 가정한다. */
export function isSequentialDayUnlocked(
  sortedDayIds: readonly number[],
  persistedCompletedDayIds: ReadonlySet<number>,
  targetDayId: number,
): boolean {
  const idx = sortedDayIds.indexOf(targetDayId)
  if (idx < 0) return false
  if (idx === 0) return true
  const prev = sortedDayIds[idx - 1]
  return prev !== undefined && persistedCompletedDayIds.has(prev)
}

export type LessonPathAvailability = 'open' | 'locked' | 'coming'

export function lessonAvailabilityFromContentAndProgress(args: Readonly<{
  sortedDayIds: readonly number[]
  persistedCompletedDayIds: ReadonlySet<number>
  dayId: number
  hasContentForDay: boolean
}>): LessonPathAvailability {
  if (!args.hasContentForDay) return 'coming'
  return isSequentialDayUnlocked(
    args.sortedDayIds,
    args.persistedCompletedDayIds,
    args.dayId,
  ) ?
      'open'
    : 'locked'
}
