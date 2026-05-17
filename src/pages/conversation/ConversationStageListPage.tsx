/**
 * Stage 1 실전 회화 Day 목록: `stage-1.json` 로드 후 카드 형태로 표시합니다.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  FALLBACK_CONVERSATION_CUTSCENE_PATH,
  MVP_CONVERSATION_STAGE_ID,
} from '../../constants/content'
import { useConversationSession } from '../../context/conversationSessionCore'
import {
  getConversationStage,
  isContentFetchError,
  resolvePublicUrl,
  type RemoteContentState,
} from '../../api/contentApi'
import { countCompletedConversationDaysForStage } from '../../utils/learnStats'
import { getConversationDifficultyView } from '../../utils/conversationDifficulty'
import { isSequentialDayUnlocked } from '../../utils/learningUnlock'
import {
  HADES_USER_PROGRESS_EVENT,
  isConversationDayCompletedPersisted,
  loadUserProgress,
} from '../../utils/storage'
import type { ConversationDay, ConversationStage } from '../../types/conversation'
import './ConversationStageListPage.css'

function DayEntryCard(
  props: Readonly<{ stageId: number; day: ConversationDay; complete: boolean; locked: boolean }>,
) {
  const { stageId, day, complete, locked } = props
  const thumbSrc = day.cutsceneImagePath?.trim()
    ? resolvePublicUrl(day.cutsceneImagePath)
    : resolvePublicUrl(FALLBACK_CONVERSATION_CUTSCENE_PATH)
  const href = `/conversation/stage/${stageId}/day/${day.dayId}`
  const difficulty = getConversationDifficultyView(day.difficulty)

  return (
    <li>
      <article
        className={`ui-card ui-card--dashboard conv-stage-list__card${locked ? ' conv-stage-list__card--locked' : ''}`}
        aria-labelledby={`conv-day-head-${day.dayId}`}
      >
        <div className="conv-stage-list__thumb-wrap">
          <img
            className="conv-stage-list__thumb"
            src={thumbSrc}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="conv-stage-list__card-body">
          <div>
            <div className="conv-stage-list__day-row">
              <p className="conv-stage-list__day-num">Day {day.dayId}</p>
              <span
                className={`conv-stage-list__difficulty conv-stage-list__difficulty--${difficulty.tone}`}
                title={difficulty.labelKo}
              >
                {difficulty.labelKo}
              </span>
              {complete ? (
                <span className="conv-stage-list__done-pill" aria-label="학습 완료">
                  완료
                </span>
              ) : locked ? (
                <span className="conv-stage-list__locked-pill">잠금</span>
              ) : (
                <span className="conv-stage-list__ready-pill">진행 가능</span>
              )}
            </div>
            <h2 id={`conv-day-head-${day.dayId}`} className="conv-stage-list__card-title">
              {day.titleKo}
            </h2>
            {day.descriptionKo !== undefined ? (
              <p className="conv-stage-list__card-desc">{day.descriptionKo}</p>
            ) : null}
          </div>
          {locked ? (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--block" disabled>
              앞 순서 Day를 완료하면 열립니다
            </button>
          ) : (
            <Link className="ui-btn ui-btn--primary ui-btn--block" to={href}>
              {complete ? '복습하기' : '시작하기'}
            </Link>
          )}
        </div>
      </article>
    </li>
  )
}

export default function ConversationStageListPage() {
  const { stageId: stageIdParam } = useParams<{ stageId: string }>()
  const stageIdRaw =
    stageIdParam === undefined || stageIdParam === ''
      ? MVP_CONVERSATION_STAGE_ID
      : Number.parseInt(stageIdParam, 10)
  const stageId = Number.isFinite(stageIdRaw) ? stageIdRaw : MVP_CONVERSATION_STAGE_ID
  const { isDayComplete } = useConversationSession()
  // 초기값을 'loading' 으로 두어 effect 내부의 동기 setState 호출을 제거한다.
  // 기존 분기(`status === 'idle' || status === 'loading'`)는 같은 로딩 UI 라
  // 렌더 결과는 동일하다.
  const [state, setState] = useState<RemoteContentState<ConversationStage>>({
    status: 'loading',
  })
  const [reloadNonce, setReloadNonce] = useState(0)

  const persistedProgress = useMemo(() => {
    void reloadNonce
    return loadUserProgress()
  }, [reloadNonce])

  const refreshPersisted = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'visible') refreshPersisted()
    }
    document.addEventListener('visibilitychange', onVis)
    const onProg = (): void => refreshPersisted()
    window.addEventListener(HADES_USER_PROGRESS_EVENT, onProg)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener(HADES_USER_PROGRESS_EVENT, onProg)
    }
  }, [refreshPersisted])

  useEffect(() => {
    let cancelled = false
    getConversationStage(stageId)
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data })
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e))
        if (!cancelled) setState({ status: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [stageId])

  let body: ReactNode
  if (state.status === 'idle' || state.status === 'loading') {
    body = (
      <p className="conv-stage-list__muted" role="status" aria-busy="true">
        Day 목록 불러오는 중…
      </p>
    )
  } else if (state.status === 'error') {
    const msg = isContentFetchError(state.error)
      ? state.error.message
      : state.error.message || '불러오기에 실패했습니다.'
    body = (
      <div className="conv-stage-list__muted-row">
        <p className="conv-stage-list__muted" role="alert">
          {msg}
        </p>
        <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/home">
          홈으로
        </Link>
      </div>
    )
  } else {
    const days = [...state.data.days].sort((a, b) => a.dayId - b.dayId)
    const sortedIds = days.map((d) => d.dayId)
    const completedPersisted = new Set<number>()
    for (const r of persistedProgress.completedConversationDays) {
      if (r.stageId === stageId) {
        completedPersisted.add(r.dayId)
      }
    }
    body =
      days.length === 0 ? (
        <p className="conv-stage-list__muted">표시할 Day가 없습니다.</p>
      ) : (
        <ul className="conv-stage-list__list">
          {days.map((d) => {
            const persistedDone = isConversationDayCompletedPersisted(
              persistedProgress,
              stageId,
              d.dayId,
            )
            const sessionDone = isDayComplete(stageId, d.dayId)
            const complete = sessionDone || persistedDone
            const seqOpen = isSequentialDayUnlocked(sortedIds, completedPersisted, d.dayId)
            const locked = !complete && !seqOpen
            return (
              <DayEntryCard
                key={d.dayId}
                stageId={stageId}
                day={d}
                complete={complete}
                locked={locked}
              />
            )
          })}
        </ul>
      )
  }

  const stageEyebrow = `Stage ${stageId} · 실전 회화`
  const stageTitle =
    state.status === 'success' && state.data.stageTitleKo !== undefined && state.data.stageTitleKo.trim() !== ''
      ? state.data.stageTitleKo
      : `Stage ${stageId}`
  const stageDesc =
    state.status === 'success' && state.data.stageDescriptionKo !== undefined
      ? state.data.stageDescriptionKo
      : null

  const stageProgressLine =
    state.status === 'success' ?
      (() => {
        const total = Math.max(0, state.data.days.length)
        const done = countCompletedConversationDaysForStage(
          persistedProgress,
          stageId,
        )
        return `Stage ${stageId} 진행률 ${done}/${total}`
      })()
    : null

  return (
    <main className="conv-stage-list">
      <header className="conv-stage-list__hero">
        <p className="conv-stage-list__eyebrow">{stageEyebrow}</p>
        <h1 className="conv-stage-list__title">{stageTitle}</h1>
        <Link className="conv-stage-list__back-link" to="/conversation">
          스테이지 선택
        </Link>
        {stageProgressLine !== null ? (
          <p className="conv-stage-list__progress-line">{stageProgressLine}</p>
        ) : null}
        {stageDesc !== null ? <p className="conv-stage-list__desc">{stageDesc}</p> : null}
      </header>
      {body}
    </main>
  )
}
