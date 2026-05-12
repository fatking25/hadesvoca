/**
 * 앱 최초 진입 화면: 브랜딩, 학습 진입, 저작 고지 진입.
 * 첫 방문자도 온보딩 전 팬메이드 고지를 확인할 수 있게 이 화면 안에서 고지를 펼칩니다.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
      <h1 className="start-page__title">하데스 보카</h1>
      <p className="start-page__tagline">
        하데스와 함께 TOEIC 단어와 실전회화를 배워보세요.
      </p>

      <div className="start-page__cta-row">
        <button
          type="button"
          className="ui-btn ui-btn--primary ui-btn--block start-page__cta"
          onClick={() => {
            navigate('/home')
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
            <p>
              본 앱은 팬메이드 학습용 프로젝트이며, SOOP 및 하데스 공식 콘텐츠와
              무관합니다.
            </p>
            <p>
              정식 공개 전 실존 인물/그룹명/이미지 사용 범위를 다시 검토합니다.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
