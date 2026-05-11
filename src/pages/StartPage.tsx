/**
 * 앱 최초 진입 화면: 브랜딩, 학습 진입, 저작 고지 진입.
 * 저작 고지 상세는 학습 홈 진입 후 설정 패널(저작권·고지)에서 봅니다.
 */
import { Link, useNavigate } from 'react-router-dom'
import './StartPage.css'

export default function StartPage() {
  const navigate = useNavigate()

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
          학습 시작
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--secondary ui-btn--block start-page__cta"
          onClick={() => {
            navigate('/home')
          }}
        >
          이어서 학습하기
        </button>
      </div>

      <p className="start-page__copyright-hint">
        상세 고지와 권리 안내는{' '}
        <Link
          className="start-page__copyright-link"
          to="/home"
          state={{ appSettings: 'copyright' }}
        >
          설정의 저작권 · 고지
        </Link>
        에서 확인할 수 있습니다.
      </p>
    </main>
  )
}
