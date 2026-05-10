/**
 * 상단 학습 게이지 플레이스홀더 (듀오 스타일 Lv·연속·자원 줄).
 */

export function MobileStatsBar() {
  return (
    <div className="mobile-stats-bar">
      <div className="mobile-stats-bar__item" aria-label="레벨 placeholder">
        <span className="mobile-stats-bar__icon mobile-stats-bar__icon--lvl" aria-hidden>
          ⚡
        </span>
        <span className="mobile-stats-bar__chip">Lv</span>
        <span className="mobile-stats-bar__num">60</span>
      </div>
      <div className="mobile-stats-bar__item" aria-label="연속 학습 placeholder">
        <span className="mobile-stats-bar__icon" aria-hidden>
          🔥
        </span>
        <span className="mobile-stats-bar__num">0</span>
      </div>
      <div className="mobile-stats-bar__item" aria-label="재화 placeholder">
        <span className="mobile-stats-bar__gem" aria-hidden />
        <span className="mobile-stats-bar__num">∞</span>
      </div>
      <div className="mobile-stats-bar__item mobile-stats-bar__item--life" aria-label="하트 placeholder">
        <span className="mobile-stats-bar__heart" aria-hidden />
        <span className="mobile-stats-bar__num">5</span>
      </div>
    </div>
  )
}
