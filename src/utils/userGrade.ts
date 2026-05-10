/**
 * `UserProgress.rankTier`만 저장하고, 표시용 등급 문자열은 여기서 파생한다.
 */
export function deriveUserGradeLabel(rankTier: number): string {
  const t = Math.floor(Number(rankTier) || 0)
  if (t < 1) return '새싹 학습자'
  if (t <= 4) return '새싹 학습자'
  if (t <= 9) return '루키 학습자'
  if (t <= 19) return '집중 학습자'
  if (t <= 34) return '실전 학습자'
  if (t <= 49) return '보카 마스터'
  return '하데스 영어요원'
}
