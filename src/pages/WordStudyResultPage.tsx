/**
 * 단어 학습 결과 MVP: 세션 종료 후 `navigate(state)` 로 통계 표시 + `localStorage` 진행 저장
 */
import { useEffect, useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { WrongNoteAttemptRef } from '../types/user-progress'
import type { WordStudyWrongItemSummary } from '../types/wordStudySession'
import {
  isWordStudyQuizResultNavigateState,
  normalizeWordStudyResultState,
} from '../types/wordStudySession'
import {
  loadUserProgress,
  markWordStudyPersistHandled,
  mergeUserProgressAfterWordStudyDay,
  saveUserProgress,
} from '../utils/storage'
import './WordStudyPage.css'

const MVP_STAGE_ID = 1

export default function WordStudyResultPage() {
  const { dayId } = useParams<{ dayId: string }>()
  const { state } = useLocation()
  const redoHref =
    dayId !== undefined && dayId !== '' ? `/word-study/${dayId}` : '/word-study'

  const dayNum = useMemo((): number | null => {
    if (dayId === undefined || dayId === '') return null
    const n = Number.parseInt(dayId, 10)
    return Number.isFinite(n) ? n : null
  }, [dayId])

  const scored = isWordStudyQuizResultNavigateState(state)

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

  /** 퀴즈 완료 후 `persistNonce` 가 있을 때만 1회 저장(Strict Mode·재방문 오염 완화) */
  useEffect(() => {
    if (!scored || dayNum === null) return
    if (!isWordStudyQuizResultNavigateState(state)) return
    const nonce = state.persistNonce
    if (typeof nonce !== 'string' || nonce.length === 0) return
    if (!markWordStudyPersistHandled(nonce)) return

    const { wrongItems: items } = normalizeWordStudyResultState(state)
    const now = new Date()
    const wrongAttempts: WrongNoteAttemptRef[] = items.map((item) => ({
      type: 'word',
      id: item.questionId,
      stageId: MVP_STAGE_ID,
      dayId: dayNum,
    }))

    const prev = loadUserProgress()
    const next = mergeUserProgressAfterWordStudyDay(prev, {
      stageId: MVP_STAGE_ID,
      dayId: dayNum,
      wrongAttempts,
      now,
    })
    saveUserProgress(next)
  }, [scored, dayNum, state])

  return (
    <main className="word-result">
      <p className="word-result__done-badge">오늘 미션 완료 · 짧은 5분 학습 세트</p>
      <h1 className="word-result__title">학습 결과</h1>
      <p className="word-result__meta">Stage 1 · Day {dayId ?? '—'}</p>

      {scored ? (
        <>
          <section
            className="ui-card ui-card--dashboard"
            aria-label="통계 요약"
          >
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
          </section>

          <section
            className="ui-card ui-card--dashboard"
            aria-label="틀린 문제 목록"
          >
            <h2 className="ui-card__section-heading">틀린 문제</h2>
            {wrongItems.length === 0 ? (
              <p className="word-result__muted word-result__empty-wrong ui-card__body">
                이번 세트에서 틀린 문제가 없었어요. 잘했어요!
              </p>
            ) : (
              <ul className="word-result__wrong-list">
                {wrongItems.map((item) => (
                  <li key={item.questionId} className="word-result__wrong-item">
                    <div className="word-result__wrong-head">
                      <span className="word-result__wrong-word" lang="en">
                        {item.wordHeadwordEn}
                      </span>
                      <span className="word-result__wrong-type-chip">
                        {item.questionTypeLabel}
                      </span>
                    </div>
                    <p className="word-result__wrong-meaning">{item.meaningKo}</p>
                    <p className="word-result__wrong-prompt">{item.snapshotPrompt}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="word-result__muted ui-card__body">
              틀린 문항은 기기에 저장된 진행 데이터의 오답 목록에 반영됩니다. (이 기기에서만)
            </p>
          </section>
        </>
      ) : (
        <section className="ui-card ui-card--dashboard" aria-label="안내">
          <p className="word-result__muted ui-card__body">
            결과를 보려면 Day 학습을 끝까지 완료한 뒤 &quot;결과 보기&quot;로 들어오세요.
          </p>
        </section>
      )}

      <nav className="word-result__actions" aria-label="결과 다음 동작">
        <Link className="ui-btn ui-btn--primary ui-btn--block" to={redoHref}>
          다시 학습하기
        </Link>
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/home">
          홈으로 돌아가기
        </Link>
      </nav>
    </main>
  )
}
