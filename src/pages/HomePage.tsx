/**
 * 메인 허브(대시보드): localStorage + Phase 6-2 통계 파생 값 표시(MVP).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTodayStudySessionCount } from '../utils/learnStats'
import { deriveUserGradeLabel } from '../utils/userGrade'
import { HADES_USER_PROGRESS_EVENT, loadUserProgress } from '../utils/storage'
import './HomePage.css'

export default function HomePage() {
  const [reloadNonce, setReloadNonce] = useState(0)

  const progress = useMemo(() => {
    void reloadNonce
    return loadUserProgress()
  }, [reloadNonce])

  const refresh = useCallback(() => {
    setReloadNonce((k) => k + 1)
  }, [])

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    const onProg = (): void => refresh()
    window.addEventListener(HADES_USER_PROGRESS_EVENT, onProg)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(HADES_USER_PROGRESS_EVENT, onProg)
    }
  }, [refresh])

  const streakDaysStored = useMemo(
    () => Math.max(0, Math.floor(progress.streakDays)),
    [progress],
  )
  const todaySessionCount = useMemo(
    () => getTodayStudySessionCount(progress),
    [progress],
  )
  const dailyGoal = Math.max(1, Math.floor(progress.dailyWordGoal) || 1)
  const rankLv = Math.max(1, Math.min(99, Math.floor(progress.rankTier)))
  const userGrade = deriveUserGradeLabel(rankLv)
  const totalMemo = Math.max(0, Math.floor(progress.totalMemorizedWords))

  const recent = progress.recentStudy
  const recentLine =
    recent === null
      ? null
      : recent.type === 'word'
        ? `최근 학습: 단어 Day ${recent.dayId}`
        : `최근 학습: 실전회화 Day ${recent.dayId}`
  const continueHref =
    recent === null
      ? '/word-study'
      : recent.type === 'word'
        ? `/word-study/${recent.dayId}`
        : `/conversation/${recent.dayId}`
  const continueLabel =
    recent === null
      ? '오늘 첫 학습 시작하기'
      : recent.type === 'word'
        ? `이어서 단어 Day ${recent.dayId} 학습하기`
        : `이어서 회화 Day ${recent.dayId} 진행하기`

  return (
    <main className="home-page">
      <header className="home-dashboard-top">
        <p className="home-dashboard-top__eyebrow">오늘의 학습 허브</p>
        <div className="home-dashboard-top__hero">
          <h1 className="home-dashboard-top__brand">하데스 보카</h1>
          <p className="home-dashboard-top__welcome">
            환영합니다,{' '}
            {progress.nickname.trim() !== '' ? `${progress.nickname.trim()}님` : '학습자님'}
          </p>
        </div>
        <p className="home-dashboard-top__tagline">
          하데스와 함께 오늘의 영어 미션을 완료하세요.
        </p>
      </header>

      <section className="home-duo-banner" aria-label="오늘 학습 세션 요약">
        <div className="home-duo-banner__viz" aria-hidden>
          <span className="home-duo-banner__mascot">◉</span>
          <span className="home-duo-banner__ring" />
        </div>
        <div className="home-duo-banner__body">
          <p className="home-duo-banner__eyebrow">오늘의 세션</p>
          <ul
            className="home-duo-banner__stats"
            title="오늘 수치는 같은 날 완료한 학습 세션 수(dailyStudyCount)입니다."
          >
            <li className="home-duo-banner__stat">
              <span className="home-duo-banner__stat-label">연속 학습</span>
              <span className="home-duo-banner__stat-value">{streakDaysStored}일</span>
            </li>
            <li className="home-duo-banner__stat">
              <span className="home-duo-banner__stat-label">오늘 단어</span>
              <span className="home-duo-banner__stat-value">
                {todaySessionCount}/{dailyGoal}
              </span>
            </li>
            <li className="home-duo-banner__stat">
              <span className="home-duo-banner__stat-label">누적 암기</span>
              <span className="home-duo-banner__stat-value">{totalMemo}개</span>
            </li>
          </ul>
          <p className="home-duo-banner__grade">
            LV {rankLv} · {userGrade}
          </p>
          <p className="home-duo-banner__line">단어와 회화를 조금씩 나눠서 해도 좋아요.</p>
        </div>
        <Link to="/word-study" className="ui-btn ui-btn--secondary home-duo-banner__cta">
          경로 보기
        </Link>
      </section>

      <section
        className="home-continue ui-card ui-card--dashboard home-dashboard-card home-dashboard-card--continue"
        aria-label="이어서 학습"
      >
        <p className="home-continue__eyebrow">바로 이어가기</p>
        {recentLine !== null ? (
          <p className="home-continue__recent ui-card__body">{recentLine}</p>
        ) : null}
        <Link
          to={continueHref}
          className="ui-btn ui-btn--primary ui-btn--block home-continue__btn"
        >
          {continueLabel}
        </Link>
        <p className="home-continue__hint ui-card__body">
          {recent === null
            ? '학습을 한 번이라도 완료하면 이곳에 최근 위치가 표시됩니다.'
            : '같은 Day로 바로 이동합니다. 목록은 하단 메뉴에서도 열 수 있어요.'}
        </p>
      </section>

      <section
        className="home-recommend ui-card ui-card--dashboard home-dashboard-card home-dashboard-card--spotlight"
        aria-labelledby="home-recommend-title"
      >
        <h2 id="home-recommend-title" className="ui-card__section-heading">
          오늘 추천 학습
        </h2>
        <p className="ui-card__body">
          단어 학습 Stage 1 Day 1 또는 하데스 실전회화 Day 1 진행을 권장합니다. (mock)
        </p>
      </section>

      <section
        className="home-recent ui-card ui-card--dashboard home-dashboard-card home-dashboard-card--quiet"
        aria-labelledby="home-recent-title"
      >
        <h2 id="home-recent-title" className="ui-card__section-heading">
          최근 틀린 단어·표현
        </h2>
        <p className="ui-card__body">
          오답이 생기면 최대 3개까지 여기에 표시 예정입니다. (mock 비어 있음)
        </p>
      </section>

      <nav className="home-menu" aria-label="학습 메뉴">
        <div className="home-menu__section-head">
          <h2 className="home-menu__heading">메인 메뉴</h2>
          <span className="home-menu__section-hint" aria-hidden>
            탭으로 이동
          </span>
        </div>
        <Link
          to="/word-study"
          className="ui-card ui-card--menu ui-card--interactive home-menu__link home-menu__link--featured"
        >
          <span className="ui-card__title">TOEIC 단어 학습</span>
          <span className="ui-card__subtitle">
            짧은 퀴즈로 핵심 단어 익히기 · Stage·Day
          </span>
        </Link>
        <Link
          to="/conversation"
          className="ui-card ui-card--menu ui-card--interactive home-menu__link"
        >
          <span className="ui-card__title">하데스 실전회화</span>
          <span className="ui-card__subtitle">하데스 멤버와 상황별 영어 표현 익히기</span>
        </Link>
        <Link
          to="/vocabulary-book"
          className="ui-card ui-card--menu ui-card--interactive home-menu__link"
        >
          <span className="ui-card__title">단어장</span>
          <span className="ui-card__subtitle">저장한 단어와 표현 복습하기</span>
        </Link>
        <Link
          to="/wrong-note"
          className="ui-card ui-card--menu ui-card--interactive home-menu__link"
        >
          <span className="ui-card__title">오답노트</span>
          <span className="ui-card__subtitle">최근 틀린 항목 다시 보기</span>
        </Link>
      </nav>
    </main>
  )
}
