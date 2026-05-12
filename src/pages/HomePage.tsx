/**
 * 메인 허브(대시보드): localStorage + Phase 6-2 통계 파생 값 표시.
 * - "최근 틀린 단어·표현" 섹션은 `wrongNotes`에서 미해결 항목 최근 3건을 골라
 *   `contentJoin` 헬퍼로 본문을 join해 표시한다. 본문은 표시 시점에만 fetch.
 * - 본문은 사용자 저장 데이터에 넣지 않고 콘텐츠 JSON에서만 읽는다.
 * - `wrongNotes` 가 비어 있으면 섹션 자체를 숨겨 빈 상태 문구를 남기지 않는다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MVP_WORD_STAGE_ID } from '../constants/content'
import type { StageWordsFile } from '../types/content'
import type { ConversationStage } from '../types/conversation'
import type { WrongNoteRef } from '../types/user-progress'
import {
  findExpressionQuiz,
  findWordQuestionWithEntry,
  loadConversationStageCached,
  loadStageWordsCached,
  parseStageIdKey,
  stageIdKey,
} from '../utils/contentJoin'
import { getTodayStudySessionCount } from '../utils/learnStats'
import {
  canGrantDailyCoin,
  getDueWordReviewStatuses,
  HADES_USER_PROGRESS_EVENT,
  loadUserProgress,
  persistGrantDailyCoinIfDue,
} from '../utils/storage'
import { deriveUserGradeLabel } from '../utils/userGrade'
import './HomePage.css'

type WordPacks = Readonly<Record<number, StageWordsFile | null>>
type ConvPacks = Readonly<Record<number, ConversationStage | null>>

const HOME_RECENT_WRONG_MAX = 3
/**
 * MVP 단계는 Stage 1 만 콘텐츠가 배포되어 있다.
 * 복습 기준 Word Day(`currentWordDayId`)는 이 Stage 의 완료 Day 만 본다
 * (다른 화면들과 동일한 기준 유지: `WordStudyDayListPage`, review 모드 `WordStudyDayDetailPage`).
 */
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

  const canGrantToday = useMemo(() => canGrantDailyCoin(progress), [progress])
  const dailyAmount = Math.max(0, Math.floor(progress.dailyCoinAmount))
  const [justGrantedAmount, setJustGrantedAmount] = useState<number | null>(null)

  const onClaimDailyCoin = useCallback(() => {
    const res = persistGrantDailyCoinIfDue()
    if (res.granted) {
      setJustGrantedAmount(res.amount)
    } else {
      setJustGrantedAmount(null)
    }
    refresh()
  }, [refresh])

  const currentWordDayId = useMemo(
    () =>
      progress.completedWordDays.reduce(
        (max, c) =>
          c.stageId === MVP_WORD_STAGE_ID && c.dayId > max ? c.dayId : max,
        0,
      ),
    [progress.completedWordDays],
  )
  const hasAnyWordReviewStatus = progress.wordReviewStatuses.length > 0
  const dueReviewCount = useMemo(
    () => getDueWordReviewStatuses(progress, currentWordDayId).length,
    [progress, currentWordDayId],
  )

  const recentWrong = useMemo<readonly WrongNoteRef[]>(
    () =>
      [...progress.wrongNotes]
        .filter((w) => w.resolved === false)
        .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt))
        .slice(0, HOME_RECENT_WRONG_MAX),
    [progress.wrongNotes],
  )

  const wordStageKey = useMemo(
    () =>
      stageIdKey(
        recentWrong.filter((w) => w.type === 'word').map((w) => w.stageId),
      ),
    [recentWrong],
  )
  const exprStageKey = useMemo(
    () =>
      stageIdKey(
        recentWrong.filter((w) => w.type === 'expression').map((w) => w.stageId),
      ),
    [recentWrong],
  )

  const [wordPacks, setWordPacks] = useState<WordPacks>({})
  const [convPacks, setConvPacks] = useState<ConvPacks>({})

  useEffect(() => {
    const stageIds = parseStageIdKey(wordStageKey)
    let cancelled = false
    Promise.all(
      stageIds.map((id) =>
        loadStageWordsCached(id)
          .then((pack): { id: number; pack: StageWordsFile | null } => ({
            id,
            pack,
          }))
          .catch((): { id: number; pack: StageWordsFile | null } => ({
            id,
            pack: null,
          })),
      ),
    ).then((rows) => {
      if (cancelled) return
      const next: Record<number, StageWordsFile | null> = {}
      for (const row of rows) next[row.id] = row.pack
      setWordPacks(next)
    })
    return () => {
      cancelled = true
    }
  }, [wordStageKey])

  useEffect(() => {
    const stageIds = parseStageIdKey(exprStageKey)
    let cancelled = false
    Promise.all(
      stageIds.map((id) =>
        loadConversationStageCached(id)
          .then((pack): { id: number; pack: ConversationStage | null } => ({
            id,
            pack,
          }))
          .catch((): { id: number; pack: ConversationStage | null } => ({
            id,
            pack: null,
          })),
      ),
    ).then((rows) => {
      if (cancelled) return
      const next: Record<number, ConversationStage | null> = {}
      for (const row of rows) next[row.id] = row.pack
      setConvPacks(next)
    })
    return () => {
      cancelled = true
    }
  }, [exprStageKey])

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
              <span className="home-duo-banner__stat-label">오늘 학습</span>
              <span
                className="home-duo-banner__stat-value"
                aria-label={`오늘 학습 ${todaySessionCount}개 / 목표 ${dailyGoal}개`}
              >
                {todaySessionCount}/{dailyGoal}
              </span>
            </li>
            <li className="home-duo-banner__stat">
              <span className="home-duo-banner__stat-label">누적 학습 단어</span>
              <span
                className="home-duo-banner__stat-value"
                aria-label={`누적 학습 단어 ${totalMemo}개 (Day 완료 기준)`}
              >
                {totalMemo}개
              </span>
            </li>
          </ul>
          <p className="home-duo-banner__grade">
            LV {rankLv} · {userGrade}
          </p>
        </div>
        <Link to="/word-study" className="ui-btn ui-btn--secondary home-duo-banner__cta">
          학습 경로 보기
        </Link>
      </section>

      {canGrantToday && dailyAmount > 0 ? (
        <section
          className="home-daily-grant ui-card ui-card--dashboard"
          aria-label="오늘의 코인"
        >
          <div className="home-daily-grant__head">
            <span className="home-daily-grant__eyebrow">오늘의 코인</span>
            <span className="home-daily-grant__amount" aria-hidden>
              +{dailyAmount}
            </span>
          </div>
          <p className="home-daily-grant__hint ui-card__body">
            오늘 하루 한 번 받을 수 있는 무료 코인이 도착했습니다.
          </p>
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--block home-daily-grant__btn"
            onClick={onClaimDailyCoin}
          >
            +{dailyAmount} 코인 받기
          </button>
        </section>
      ) : justGrantedAmount !== null ? (
        <section
          className="home-daily-grant home-daily-grant--claimed ui-card ui-card--dashboard"
          aria-live="polite"
        >
          <p className="home-daily-grant__claimed ui-card__body">
            오늘의 코인 +{justGrantedAmount}을 받았습니다.
          </p>
        </section>
      ) : null}

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
        {recent === null ? (
          <p className="home-continue__hint ui-card__body">
            최근 학습이 아직 없어요.
          </p>
        ) : null}
      </section>

      {hasAnyWordReviewStatus ? (
        <section
          className="home-review ui-card ui-card--dashboard home-dashboard-card"
          aria-labelledby="home-review-title"
        >
          <p className="home-review__eyebrow">단어 복습</p>
          <h2 id="home-review-title" className="ui-card__section-heading home-review__title">
            이번 Day 복습
          </h2>
          <p className="home-review__line ui-card__body">
            {dueReviewCount > 0
              ? `복습할 단어 ${dueReviewCount}개가 있어요.`
              : '복습할 단어가 없습니다.'}
          </p>
          {dueReviewCount > 0 ? (
            <Link
              to="/word-study/review"
              className="ui-btn ui-btn--primary ui-btn--block home-review__cta"
            >
              복습하기
            </Link>
          ) : (
            <p className="home-review__hint ui-card__body">
              새 Word Day를 진행하면 복습할 단어가 다시 누적됩니다.
            </p>
          )}
        </section>
      ) : null}

      {recentWrong.length > 0 ? (
        <section
          className="home-recent ui-card ui-card--dashboard home-dashboard-card home-dashboard-card--quiet"
          aria-labelledby="home-recent-title"
        >
          <div className="home-recent__head">
            <h2 id="home-recent-title" className="ui-card__section-heading home-recent__title">
              최근 틀린 단어·표현
            </h2>
            <Link to="/wrong-note" className="home-recent__cta">
              전체 보기 →
            </Link>
          </div>
          <ul className="home-recent__list" aria-label="최근 틀린 항목">
            {recentWrong.map((w) => (
              <li
                key={`${w.type}:${w.id}:${w.stageId}:${w.dayId}`}
                className="home-recent__row"
              >
                <HomeRecentWrongBody
                  note={w}
                  wordPack={w.type === 'word' ? wordPacks[w.stageId] : undefined}
                  convStage={w.type === 'expression' ? convPacks[w.stageId] : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="home-menu" aria-label="학습 메뉴">
        <div className="home-menu__section-head">
          <h2 className="home-menu__heading">메인 메뉴</h2>
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

function HomeRecentWrongBody({
  note,
  wordPack,
  convStage,
}: {
  readonly note: WrongNoteRef
  readonly wordPack: StageWordsFile | null | undefined
  readonly convStage: ConversationStage | null | undefined
}) {
  const refLine = `Stage ${note.stageId} · Day ${note.dayId} · 틀린 ${note.wrongCount}회`

  if (note.type === 'word') {
    if (wordPack === undefined) {
      return (
        <Link to="/wrong-note" className="home-recent__entry home-recent__entry--loading">
          <span className="home-recent__loading">불러오는 중…</span>
          <span className="home-recent__refs">{refLine}</span>
        </Link>
      )
    }
    const found =
      wordPack !== null
        ? findWordQuestionWithEntry(wordPack, note.dayId, note.id)
        : null
    if (found === null) {
      return (
        <Link to="/wrong-note" className="home-recent__entry home-recent__entry--missing">
          <span className="home-recent__fallback">해당 문제를 찾지 못했습니다.</span>
          <span className="home-recent__refs">{refLine}</span>
        </Link>
      )
    }
    return (
      <Link to="/wrong-note" className="home-recent__entry">
        <span className="home-recent__badge">단어</span>
        <span className="home-recent__main">
          <span className="home-recent__word" lang="en">
            {found.entry.word}
          </span>
          <span className="home-recent__sep" aria-hidden>
            ·
          </span>
          <span className="home-recent__meaning" lang="ko">
            {found.entry.meaning}
          </span>
        </span>
        <span className="home-recent__refs">{refLine}</span>
      </Link>
    )
  }

  if (convStage === undefined) {
    return (
      <Link to="/wrong-note" className="home-recent__entry home-recent__entry--loading">
        <span className="home-recent__loading">불러오는 중…</span>
        <span className="home-recent__refs">{refLine}</span>
      </Link>
    )
  }
  const quiz =
    convStage !== null ? findExpressionQuiz(convStage, note.dayId, note.id) : null
  if (quiz === null) {
    return (
      <Link to="/wrong-note" className="home-recent__entry home-recent__entry--missing">
        <span className="home-recent__fallback">해당 문제를 찾지 못했습니다.</span>
        <span className="home-recent__refs">{refLine}</span>
      </Link>
    )
  }
  const correct = quiz.options.find((o) => o.id === quiz.correctOptionId)?.text ?? ''
  return (
    <Link to="/wrong-note" className="home-recent__entry">
      <span className="home-recent__badge home-recent__badge--expr">표현</span>
      <span className="home-recent__main">
        <span className="home-recent__word" lang="ko">
          {quiz.promptKo}
        </span>
        {correct !== '' ? (
          <>
            <span className="home-recent__sep" aria-hidden>
              ·
            </span>
            <span className="home-recent__meaning" lang="en">
              {correct}
            </span>
          </>
        ) : null}
      </span>
      <span className="home-recent__refs">{refLine}</span>
    </Link>
  )
}
