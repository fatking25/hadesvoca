import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../constants/routes'
import './StartPage.css'

export default function StartPage() {
  const navigate = useNavigate()
  const [noticeOpen, setNoticeOpen] = useState(false)

  return (
    <main className="start-page">
      <div
        className="ui-card ui-card--placeholder app-placeholder-visual app-placeholder-visual--hero start-page__hero-visual"
        role="presentation"
      >
        TOEIC 단어 · 실전회화
      </div>
      <h1 className="start-page__title">하데스보카</h1>
      <p className="start-page__tagline">
        하데스와 함께 TOEIC 단어와 실전회화를 배워보세요.
      </p>

      <div className="start-page__cta-row">
        <button
          type="button"
          className="ui-btn ui-btn--primary ui-btn--block start-page__cta"
          onClick={() => {
            navigate(APP_ROUTES.home)
          }}
        >
          학습 시작하기
        </button>
      </div>

      <section className="start-page__copyright-hint" aria-label="팬메이드 고지">
        <button
          type="button"
          className="start-page__copyright-link"
          aria-expanded={noticeOpen}
          onClick={() => {
            setNoticeOpen((open) => !open)
          }}
        >
          팬메이드 고지 보기
        </button>
        {noticeOpen ? (
          <div className="start-page__notice-body">
            <p>본 앱은 팬메이드 학습용 앱이며, SOOP 및 하데스 공식 콘텐츠가 아닙니다.</p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
