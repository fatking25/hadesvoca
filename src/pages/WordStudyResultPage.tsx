import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { MVP_WORD_STAGE_ID } from '../constants/content'
import type {
  WordReviewWrongAttemptRef,
  WrongNoteAttemptRef,
} from '../types/user-progress'
import type { WordStudyWrongItemSummary } from '../types/wordStudySession'
import {
  isWordStudyQuizResultNavigateState,
  normalizeWordStudyResultState,
} from '../types/wordStudySession'
import {
  loadUserProgress,
  markWordStudyPersistHandled,
  mergeUserProgressAfterWordStudyDay,
  mergeUserProgressAfterWordReviewSession,
  saveUserProgress,
} from '../utils/storage'
import './WordStudyPage.css'

type RewardOutcome = Readonly<{
  firstCompletion: boolean
  expGranted: number
  coinsGranted: number
  memorizedDelta: number
  stageFirstCompletion: boolean
  stageExpGranted: number
  stageCoinsGranted: number
}>

type ReviewOutcome = Readonly<{
  reviewedLemmaCount: number
  correctLemmaCount: number
  wrongLemmaCount: number
  nextReviewDayId: number | null
}>

type ResultStep = 'wrong' | 'summary' | 'reward'

export default function WordStudyResultPage() {
  const { dayId } = useParams<{ dayId: string }>()
  const { state } = useLocation()
  const scored = isWordStudyQuizResultNavigateState(state)
  const isReviewMode = scored && state.mode === 'word-review'
  const redoHref = isReviewMode
    ? '/word-study/review'
    : dayId !== undefined && dayId !== ''
      ? `/word-study/${dayId}`
      : '/word-study'

  const dayNum = useMemo((): number | null => {
    if (dayId === undefined || dayId === '') return null
    const n = Number.parseInt(dayId, 10)
    return Number.isFinite(n) ? n : null
  }, [dayId])

  const emptyWrongItems: readonly WordStudyWrongItemSummary[] = []

  const { correctCount, wrongCount, totalQuestions, wrongItems } = scored
    ? normalizeWordStudyResultState(state)
    : {
        correctCount: 0,
        wrongCount: 0,
        totalQuestions: 0,
        wrongItems: emptyWrongItems,
      }

  const answered = correctCount + wrongCount
  const ratePct =
    totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : answered > 0
        ? Math.round((correctCount / answered) * 100)
        : 0

  const [reward, setReward] = useState<RewardOutcome | null>(null)
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcome | null>(null)
  const [resultStep, setResultStep] = useState<ResultStep>('wrong')

  useEffect(() => {
    if (!isWordStudyQuizResultNavigateState(state)) return
    const nonce = state.persistNonce
    if (typeof nonce !== 'string' || nonce.length === 0) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      if (!markWordStudyPersistHandled(nonce)) return

      const { wrongItems: items } = normalizeWordStudyResultState(state)
      const now = new Date()
      const resultDayId = isReviewMode
        ? typeof state.reviewCurrentWordDayId === 'number' &&
          Number.isFinite(state.reviewCurrentWordDayId)
          ? Math.max(0, Math.floor(state.reviewCurrentWordDayId))
          : 0
        : dayNum
      if (resultDayId === null) return
      const wrongAttempts: WrongNoteAttemptRef[] = items.map((item) => ({
        type: 'word',
        id: item.questionId,
        stageId: MVP_WORD_STAGE_ID,
        dayId: resultDayId,
      }))
      const wrongReviewAttempts: WordReviewWrongAttemptRef[] = items
        .map((item): WordReviewWrongAttemptRef | null => {
          if (typeof item.lemmaId !== 'string' || item.lemmaId.trim() === '') {
            return null
          }
          return {
            lemmaId: item.lemmaId,
            stageId: MVP_WORD_STAGE_ID,
            dayId: resultDayId,
          }
        })
        .filter((item): item is WordReviewWrongAttemptRef => item !== null)

      const prev = loadUserProgress()
      if (isReviewMode) {
        const answeredLemmaIds = Array.isArray(state.answeredLemmaIds)
          ? state.answeredLemmaIds.filter(
              (id): id is string => typeof id === 'string' && id.trim() !== '',
            )
          : []
        const merged = mergeUserProgressAfterWordReviewSession(prev, {
          stageId: MVP_WORD_STAGE_ID,
          currentWordDayId: resultDayId,
          answeredLemmaIds,
          wrongAttempts,
          wrongReviewAttempts,
          now,
        })
        saveUserProgress(merged.next)
        if (cancelled) return
        setReviewOutcome({
          reviewedLemmaCount: merged.reviewedLemmaCount,
          correctLemmaCount: merged.correctLemmaCount,
          wrongLemmaCount: merged.wrongLemmaCount,
          nextReviewDayId: merged.nextReviewDayId,
        })
        return
      }

      const dayWordsCount =
        typeof state.dayWordsCount === 'number' &&
        Number.isFinite(state.dayWordsCount)
          ? state.dayWordsCount
          : 0
      const stageDayIds = Array.isArray(state.stageDayIds)
        ? state.stageDayIds.filter(
            (v): v is number => typeof v === 'number' && Number.isFinite(v),
          )
        : []
      const merged = mergeUserProgressAfterWordStudyDay(prev, {
        stageId: MVP_WORD_STAGE_ID,
        dayId: resultDayId,
        wrongAttempts,
        wrongReviewAttempts,
        dayWordsCount,
        stageDayIds,
        now,
      })
      saveUserProgress(merged.next)
      if (cancelled) return
      setReward({
        firstCompletion: merged.firstCompletion,
        expGranted: merged.expGranted,
        coinsGranted: merged.coinsGranted,
        memorizedDelta: merged.memorizedDelta,
        stageFirstCompletion: merged.stageFirstCompletion,
        stageExpGranted: merged.stageExpGranted,
        stageCoinsGranted: merged.stageCoinsGranted,
      })
    })
    return () => {
      cancelled = true
    }
  }, [scored, dayNum, state, isReviewMode])

  const hasWrongItems = wrongItems.length > 0
  const activeWrongItem = hasWrongItems ? wrongItems[0] : null

  return (
    <main className={`word-result${isReviewMode ? ' word-result--review' : ''}`}>
      <p className="word-result__done-badge">
        {isReviewMode ? '복습 세션 완료' : '학습 완료'}
      </p>
      <h1 className="word-result__title">
        {isReviewMode ? '복습 결과' : '학습 결과'}
      </h1>
      <p className="word-result__meta">
        {isReviewMode ? '이번 Day 복습' : `Stage ${MVP_WORD_STAGE_ID} · Day ${dayId ?? '?'}`}
      </p>

      {scored ? (
        <>
          <div className="word-result__steps" aria-label="결과 흐름">
            <span className={resultStep === 'wrong' ? 'word-result__step word-result__step--on' : 'word-result__step'}>
              오답 문제
            </span>
            <span className={resultStep === 'summary' ? 'word-result__step word-result__step--on' : 'word-result__step'}>
              한눈에 보기
            </span>
            <span className={resultStep === 'reward' ? 'word-result__step word-result__step--on' : 'word-result__step'}>
              완료
            </span>
          </div>

          {resultStep === 'wrong' ? (
            <section className="ui-card ui-card--dashboard word-result__panel" aria-label="오답 문제">
              <h2 className="ui-card__section-heading">오답 문제</h2>
              {activeWrongItem === null ? (
                <p className="word-result__muted word-result__empty-wrong ui-card__body">
                  이번 세트에서 오답 문제가 없었어요.
                </p>
              ) : (
                <div className="word-result__wrong-item word-result__wrong-item--focus">
                  <div className="word-result__wrong-head">
                    <span className="word-result__wrong-word" lang="en">
                      {activeWrongItem.wordHeadwordEn}
                    </span>
                    <span className="word-result__wrong-type-chip">
                      {activeWrongItem.questionTypeLabel}
                    </span>
                  </div>
                  <p className="word-result__wrong-meaning">{activeWrongItem.meaningKo}</p>
                  <p className="word-result__wrong-prompt">{activeWrongItem.snapshotPrompt}</p>
                  {wrongItems.length > 1 ? (
                    <p className="word-result__muted">
                      외 {wrongItems.length - 1}개는 오답노트에 함께 저장됩니다.
                    </p>
                  ) : null}
                </div>
              )}
              <button
                type="button"
                className="ui-btn ui-btn--primary ui-btn--block"
                onClick={() => setResultStep('summary')}
              >
                한눈에 보기
              </button>
            </section>
          ) : null}

          {resultStep === 'summary' ? (
            <section className="ui-card ui-card--dashboard word-result__panel" aria-label="통계 요약">
              <h2 className="ui-card__section-heading">한눈에 보기</h2>
              <div className="word-result__stats">
                <div className="word-result__stat">
                  <span className="word-result__stat-label">총 문항</span>
                  <span className="word-result__stat-value">{totalQuestions}</span>
                </div>
                <div className="word-result__stat word-result__stat--ok">
                  <span className="word-result__stat-label">정답</span>
                  <span className="word-result__stat-value">{correctCount}</span>
                </div>
                <div className="word-result__stat word-result__stat--ng">
                  <span className="word-result__stat-label">오답</span>
                  <span className="word-result__stat-value">{wrongCount}</span>
                </div>
              </div>
              <p className="word-result__rate" aria-live="polite">
                정답률 <strong>{ratePct}%</strong>
              </p>
              <button
                type="button"
                className="ui-btn ui-btn--primary ui-btn--block"
                onClick={() => setResultStep('reward')}
              >
                완료 보상 보기
              </button>
            </section>
          ) : null}

          {resultStep === 'reward' ? (
            <section className="ui-card ui-card--dashboard word-result__panel word-result__reward" aria-label="완료 보상">
              <h2 className="ui-card__section-heading">
                {isReviewMode ? '복습 완료' : '완료 보상'}
              </h2>
              {isReviewMode ? (
                reviewOutcome !== null ? (
                  <>
                    <p className="word-result__muted ui-card__body">
                      복습 {reviewOutcome.reviewedLemmaCount}개 · 정답 {reviewOutcome.correctLemmaCount}개 · 오답 {reviewOutcome.wrongLemmaCount}개
                    </p>
                    <p className="word-result__muted ui-card__body">
                      {reviewOutcome.nextReviewDayId === null
                        ? '다음 복습 대상 단어가 없습니다.'
                        : `다음 복습은 Word Day ${reviewOutcome.nextReviewDayId}부터 대상이 됩니다.`}
                    </p>
                  </>
                ) : (
                  <p className="word-result__muted ui-card__body">복습 결과를 저장하는 중입니다.</p>
                )
              ) : reward !== null && reward.firstCompletion ? (
                <div className="word-result__reward-grid">
                  <div className="word-result__reward-cell">
                    <span className="word-result__reward-label">EXP</span>
                    <span className="word-result__reward-value">+{reward.expGranted}</span>
                  </div>
                  <div className="word-result__reward-cell">
                    <span className="word-result__reward-label">코인</span>
                    <span className="word-result__reward-value">+{reward.coinsGranted}</span>
                  </div>
                  {reward.memorizedDelta > 0 ? (
                    <div className="word-result__reward-cell">
                      <span className="word-result__reward-label">완료 단어</span>
                      <span className="word-result__reward-value">+{reward.memorizedDelta}</span>
                    </div>
                  ) : null}
                  {reward.stageFirstCompletion ? (
                    <>
                      <div className="word-result__reward-cell">
                        <span className="word-result__reward-label">Stage EXP</span>
                        <span className="word-result__reward-value">+{reward.stageExpGranted}</span>
                      </div>
                      <div className="word-result__reward-cell">
                        <span className="word-result__reward-label">Stage 코인</span>
                        <span className="word-result__reward-value">+{reward.stageCoinsGranted}</span>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="word-result__muted ui-card__body">
                  진행 기록을 업데이트했어요.
                </p>
              )}
            </section>
          ) : null}
        </>
      ) : (
        <section className="ui-card ui-card--dashboard" aria-label="안내">
          <p className="word-result__muted ui-card__body">
            결과를 보려면 Day 학습을 끝까지 완료한 뒤 &quot;결과 보기&quot;로 들어오세요.
          </p>
        </section>
      )}

      {!scored || resultStep === 'reward' ? (
        <nav className="word-result__actions" aria-label="결과 다음 동작">
          <Link className="ui-btn ui-btn--primary ui-btn--block" to={redoHref}>
            {isReviewMode ? '복습 다시 진행' : '다시 학습하기'}
          </Link>
          <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/home">
            홈으로 돌아가기
          </Link>
        </nav>
      ) : null}
    </main>
  )
}
