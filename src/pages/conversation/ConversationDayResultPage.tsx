/**
 * 회화 Day 완료 화면: 플로우 종료 시 퀴즈 점수 표시 · 세션·`localStorage` 완료 반영
 */
import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  useConversationSession,
  type ConversationDayResultLocationState,
} from '../../context/conversationSessionCore'
import {
  loadUserProgress,
  markConversationPersistHandled,
  mergeUserProgressAfterConversationDay,
  saveUserProgress,
} from '../../utils/storage'
import '../ConversationDayDetailPage.css'

const MVP_CONV_STAGE_ID = 1

function parseDayId(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export default function ConversationDayResultPage() {
  const { dayId: dayIdParam } = useParams<{ dayId: string }>()
  const location = useLocation()
  const { recordDayCompletion } = useConversationSession()
  const dayIdNum = parseDayId(dayIdParam)

  const flowState = location.state as ConversationDayResultLocationState | null

  useEffect(() => {
    if (dayIdNum === null) return
    if (flowState?.fromFlow !== true) return
    recordDayCompletion(dayIdNum)
  }, [dayIdNum, flowState, recordDayCompletion])

  /** `persistNonce` 가 있을 때만 1회 `UserProgress` 갱신(직접 URL·구 state 제외) */
  useEffect(() => {
    if (dayIdNum === null) return
    if (flowState?.fromFlow !== true) return
    const nonce = flowState.persistNonce
    if (typeof nonce !== 'string' || nonce.length === 0) return
    if (!markConversationPersistHandled(nonce)) return

    const now = new Date()
    const quizIds =
      Array.isArray(flowState.wrongQuizIds) ?
        [...flowState.wrongQuizIds]
      : []

    const prev = loadUserProgress()
    const next = mergeUserProgressAfterConversationDay(prev, {
      stageId: MVP_CONV_STAGE_ID,
      dayId: dayIdNum,
      expressionWrongQuizIds: quizIds,
      now,
    })
    saveUserProgress(next)
  }, [dayIdNum, flowState])

  const hasFlowScores = flowState?.fromFlow === true
  const skippedQuiz = flowState?.skippedQuiz === true
  const quizTotal = hasFlowScores ? flowState.quizTotal : 0
  const quizCorrect = hasFlowScores ? flowState.quizCorrect : 0
  const showScoreLine = hasFlowScores && quizTotal > 0

  const nextDayId = hasFlowScores ? flowState.nextDayId : null
  const continueHref =
    hasFlowScores && nextDayId !== null
      ? `/conversation/${nextDayId}`
      : '/conversation'
  const continueLabel =
    hasFlowScores && nextDayId !== null ? '다음 학습 계속하기' : '회화 목록에서 계속하기'

  if (dayIdNum === null) {
    return (
      <main className="conv-detail">
        <p className="conv-detail__session-note" role="alert">
          Day 번호가 올바르지 않습니다.
        </p>
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/conversation">
          회화 목록
        </Link>
      </main>
    )
  }

  return (
    <main className="conv-detail">
      <div className="conv-detail__title-block">
        <p className="conv-detail__eyebrow">실전 회화 · Stage {MVP_CONV_STAGE_ID}</p>
        <p className="conv-detail__result-kicker">Day Complete</p>
        <h1 className="conv-detail__title conv-detail__result-title-done">Day {dayIdNum} 완료</h1>
        {showScoreLine ? (
          <p className="conv-detail__result-score-line" aria-live="polite">
            <span className="conv-detail__result-score-num">
              {quizCorrect} / {quizTotal}
            </span>{' '}
            <span className="conv-detail__result-score-label">Correct</span>
          </p>
        ) : hasFlowScores && skippedQuiz ? (
          <p className="conv-detail__session-note conv-detail__result-note">
            이번 Day에는 표현 퀴즈가 없었습니다. 시나리오를 마쳤어요.
          </p>
        ) : (
          <p className="conv-detail__session-note conv-detail__result-note">
            결과 요약은 Day를 처음부터 끝까지 진행했을 때만 표시됩니다. 목록에서 다시 시작해 주세요.
          </p>
        )}
        <p className="conv-detail__session-note">
          오늘 배운 표현은 복습할수록 더 자연스럽게 나옵니다. 수고했어요.
        </p>
      </div>

      <section className="ui-card ui-card--dashboard conv-detail__result-card">
        <nav className="conv-detail__step-footer" aria-label="다음 이동">
          <Link className="ui-btn ui-btn--primary ui-btn--block" to={continueHref}>
            {continueLabel}
          </Link>
          <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/conversation">
            회화 목록
          </Link>
          <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/home">
            홈으로
          </Link>
        </nav>
      </section>
    </main>
  )
}
