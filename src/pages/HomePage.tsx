/**
 * 메인 허브(대시보드): localStorage + Phase 6-2 통계 파생 값 표시(MVP).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  computeStreakDaysMvp,
  countCompletedConversationDaysForStage,
  countCompletedWordDaysForStage,
  getAnswerRateFromStoredProgress,
  getCumulativeStudyCounts,
  getRecentStudySummary,
  getTodayStudySessionCount,
} from '../utils/learnStats'
import { loadUserProgress } from '../utils/storage'
import './HomePage.css'

const MVP_WORD_STAGE_ID = 1
const MVP_CONV_STAGE_ID = 1

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
    return () => {
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  const todayStudyCount = useMemo(
    () => getTodayStudySessionCount(progress),
    [progress],
  )
  const cumulative = useMemo(() => getCumulativeStudyCounts(progress), [progress])
  const answerMeta = useMemo(() => getAnswerRateFromStoredProgress(progress), [progress])
  const recentSummary = useMemo(() => getRecentStudySummary(progress), [progress])
  const streakMvp = useMemo(() => computeStreakDaysMvp(progress), [progress])

  const wordDoneCount = useMemo(
    () => countCompletedWordDaysForStage(progress, MVP_WORD_STAGE_ID),
    [progress],
  )
  const convDoneCount = useMemo(
    () => countCompletedConversationDaysForStage(progress, MVP_CONV_STAGE_ID),
    [progress],
  )

  const answerRateLine =
    answerMeta.rate === null
      ? '정답률 · 기록 없음'
      : `정답률 ${Math.round(answerMeta.rate * 100)}%`

  const recentWordLine =
    recentSummary.latestWordDay !== null
      ? `최근 학습: 단어 Day ${recentSummary.latestWordDay.dayId}`
      : null
  const recentConvLine =
    recentSummary.latestConversationDay !== null
      ? `최근 학습: 회화 Day ${recentSummary.latestConversationDay.dayId}`
      : null
  const hasRecentStudyLines = recentWordLine !== null || recentConvLine !== null

  const streakLine =
    streakMvp >= 1 ? `연속 학습 ${streakMvp}일` : '오늘 첫 학습을 시작해보세요'

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
          <p className="home-dashboard-top__welcome">환영합니다, 학습자님 · mock</p>
        </div>
        <p className="home-dashboard-top__tagline">
          하데스와 함께 오늘의 영어 미션을 완료하세요.
        </p>
      </header>

      <section className="home-duo-banner" aria-label="오늘 학습 세션 placeholder">
        <div className="home-duo-banner__viz" aria-hidden>
          <span className="home-duo-banner__mascot">◉</span>
          <span className="home-duo-banner__ring" />
        </div>
        <div className="home-duo-banner__body">
          <p className="home-duo-banner__eyebrow">오늘의 세션</p>
          <p className="home-duo-banner__line">단어 Day + 회화 Day 각 1회 이상 추천 · mock 목표</p>
        </div>
        <Link to="/word-study" className="ui-btn ui-btn--secondary home-duo-banner__cta">
          경로 보기
        </Link>
      </section>

      <section
        className="home-stats ui-card ui-card--dashboard home-dashboard-card home-dashboard-card--hub"
        aria-labelledby="home-today-stats"
      >
        <div className="home-dashboard-card-head">
          <h2 id="home-today-stats" className="ui-card__section-heading home-dashboard-card-head__title">
            오늘의 학습
          </h2>
          <span className="ui-card__badge ui-card__badge--muted">기기 저장</span>
        </div>
        <ul className="home-stats__list home-hub-stats__list">
          <li>오늘 {todayStudyCount}회 학습</li>
          <li>누적 {cumulative.total}회 학습</li>
          <li>{answerRateLine}</li>
          <li>{streakLine}</li>
          {hasRecentStudyLines ? (
            <>
              {recentWordLine !== null ? <li>{recentWordLine}</li> : null}
              {recentConvLine !== null ? <li>{recentConvLine}</li> : null}
            </>
          ) : (
            <li>학습 기록 없음</li>
          )}
          <li>단어 학습 완료: {wordDoneCount}일</li>
          <li>실전회화 완료: {convDoneCount}일</li>
        </ul>
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
