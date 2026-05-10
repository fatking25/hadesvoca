/**
 * 상단 사용자·게이지: 닉네임, 등급(Lv), 연속 학습일, 코인 (`UserProgress` 연동).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { getTodayStudySessionCount } from '../../utils/learnStats'
import { HADES_USER_PROGRESS_EVENT, loadUserProgress } from '../../utils/storage'

function formatCoins(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  return String(Math.max(0, Math.floor(n)))
}

export function MobileStatsBar() {
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
  const todaySessions = getTodayStudySessionCount(progress)
  const goal = Math.max(1, Math.floor(progress.dailyWordGoal) || 1)

  return (
    <div className="mobile-stats-bar">
      <div className="mobile-stats-bar__user" title={nick}>
        <span className="mobile-stats-bar__user-label" aria-hidden>
          나
        </span>
        <span className="mobile-stats-bar__nick">{nick}</span>
      </div>
      <div className="mobile-stats-bar__item" aria-label={`등급 티어 ${tier}`}>
        <span className="mobile-stats-bar__icon mobile-stats-bar__icon--lvl" aria-hidden>
          ⚡
        </span>
        <span className="mobile-stats-bar__chip">Lv</span>
        <span className="mobile-stats-bar__num">{tier}</span>
      </div>
      <div className="mobile-stats-bar__item" aria-label={`연속 학습 ${streak}일`}>
        <span className="mobile-stats-bar__icon" aria-hidden>
          🔥
        </span>
        <span className="mobile-stats-bar__num">{streak}</span>
      </div>
      <div className="mobile-stats-bar__item" aria-label={`코인 ${coins}`}>
        <span className="mobile-stats-bar__gem" aria-hidden />
        <span className="mobile-stats-bar__num">{coins}</span>
      </div>
      <div
        className="mobile-stats-bar__item mobile-stats-bar__item--today"
        aria-label={`오늘 학습 세션 ${todaySessions}회, 목표 ${goal}회`}
        title={`당일 세션 수 / 일일 목표 (${goal})`}
      >
        <span className="mobile-stats-bar__today-label" aria-hidden>
          오늘
        </span>
        <span className="mobile-stats-bar__num">
          {todaySessions}/{goal}
        </span>
      </div>
    </div>
  )
}
