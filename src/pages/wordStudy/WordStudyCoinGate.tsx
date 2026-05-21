import { Link } from 'react-router-dom'
import { APP_ROUTES } from '../../constants/routes'

export type WordStudyCoinGateProps = Readonly<{
  dayLabel: string
  headline: string
  coins: number
  cost: number
}>

export function WordStudyCoinGate({
  dayLabel,
  headline,
  coins,
  cost,
}: WordStudyCoinGateProps) {
  return (
    <main className="word-study">
      <p className="word-study__eyebrow">{dayLabel}</p>
      <h1 className="word-study__title">{headline}</h1>
      <section className="ui-card ui-card--dashboard word-study__coin-gate">
        <h2 className="ui-card__section-heading">코인이 부족합니다</h2>
        <p className="ui-card__body word-study__coin-gate-copy">
          이 Day를 시작하려면 {cost}코인이 필요합니다. 현재 보유 코인은 {coins}코인입니다.
        </p>
        <p className="ui-card__body word-study__coin-gate-copy">
          홈에서 오늘의 코인을 받은 뒤 다시 시작해 주세요.
        </p>
        <div className="word-study__coin-gate-actions">
          <Link to={APP_ROUTES.home} className="ui-btn ui-btn--primary ui-btn--block">
            홈에서 코인 받기
          </Link>
          <Link to={APP_ROUTES.wordStudy} className="ui-btn ui-btn--ghost ui-btn--block">
            Day 목록으로
          </Link>
        </div>
      </section>
    </main>
  )
}
