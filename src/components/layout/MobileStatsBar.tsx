/**
 * 헤더 우측 컴팩트 통계: 프로필(닉네임) · 등급(Lv) · 연속 학습일 · 코인.
 * - 좌측의 닉네임 chip 버튼만 클릭 가능하며, 누르면 프로필/닉네임 시트가 열린다.
 * - 나머지 chip 3개(Lv / streak / coin)는 표시 전용(클릭 불가).
 * - `UserProgress` 갱신은 가시성 / `HADES_USER_PROGRESS_EVENT` 로 재구독한다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { HADES_USER_PROGRESS_EVENT, loadUserProgress } from '../../utils/storage'

function formatCoins(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  return String(Math.max(0, Math.floor(n)))
}

/** surrogate-pair 안전 첫 글자. 닉네임이 비어 있으면 한국어 기본값 '나'. */
function avatarInitial(nick: string): string {
  const trimmed = nick.trim()
  if (trimmed === '') return '나'
  const cp = trimmed.codePointAt(0)
  if (cp === undefined) return '나'
  return String.fromCodePoint(cp)
}

export type MobileStatsBarProps = Readonly<{
  onProfilePress?: () => void
}>

export function MobileStatsBar(props: MobileStatsBarProps) {
  const { onProfilePress } = props
  const [rev, setRev] = useState(0)

  const bump = useCallback(() => setRev((k) => k + 1), [])

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'visible') bump()
    }
    document.addEventListener('visibilitychange', onVis)

    const onProg = (): void => bump()
    window.addEventListener(HADES_USER_PROGRESS_EVENT, onProg)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(HADES_USER_PROGRESS_EVENT, onProg)
    }
  }, [bump])

  const progress = useMemo(() => {
    void rev
    return loadUserProgress()
  }, [rev])

  const nick = progress.nickname.trim() !== '' ? progress.nickname.trim() : '학습자'
  const streak = Math.max(0, Math.floor(progress.streakDays))
  const tier = Math.max(1, Math.min(99, Math.floor(progress.rankTier)))
  const coins = formatCoins(progress.coins)
  const initial = avatarInitial(nick)

  return (
    <div className="mobile-stats-bar">
      <button
        type="button"
        className="mobile-stats-bar__profile"
        title="프로필 · 닉네임 바꾸기"
        aria-label={`프로필, 닉네임 ${nick}`}
        onClick={() => {
          onProfilePress?.()
        }}
      >
        <span className="mobile-stats-bar__profile-initial" aria-hidden>
          {initial}
        </span>
        <span className="mobile-stats-bar__profile-name">{nick}</span>
      </button>
      <div
        className="mobile-stats-bar__item mobile-stats-bar__item--lvl"
        aria-label={`등급 티어 ${tier}`}
      >
        <span className="mobile-stats-bar__icon mobile-stats-bar__icon--lvl" aria-hidden>
          ⚡
        </span>
        <span className="mobile-stats-bar__chip">Lv</span>
        <span className="mobile-stats-bar__num">{tier}</span>
      </div>
      <div
        className="mobile-stats-bar__item mobile-stats-bar__item--streak"
        aria-label={`연속 학습 ${streak}일`}
      >
        <span className="mobile-stats-bar__icon" aria-hidden>
          🔥
        </span>
        <span className="mobile-stats-bar__num">{streak}</span>
      </div>
      <div
        className="mobile-stats-bar__item mobile-stats-bar__item--coin"
        aria-label={`코인 ${coins}`}
      >
        <span className="mobile-stats-bar__gem" aria-hidden />
        <span className="mobile-stats-bar__num">{coins}</span>
      </div>
    </div>
  )
}
