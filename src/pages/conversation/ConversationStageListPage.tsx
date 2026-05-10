/**
 * Stage 1 실전 회화 Day 목록: `stage-1.json` 로드 후 카드 형태로 표시합니다.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useConversationSession } from '../../context/ConversationSessionContext'
import {
  getConversationStage,
  isContentFetchError,
  type RemoteContentState,
} from '../../api/contentApi'
import { countCompletedConversationDaysForStage } from '../../utils/learnStats'
import { isSequentialDayUnlocked } from '../../utils/learningUnlock'
import {
  HADES_USER_PROGRESS_EVENT,
  isConversationDayCompletedPersisted,
  loadUserProgress,
} from '../../utils/storage'
import type { ConversationDay, ConversationStage } from '../../types/conversation'
import './ConversationStageListPage.css'

const MVP_CONV_STAGE_ID = 1

/** `public/` 정적 에셋 URL — Vite BASE_URL 반영 */
function publicAssetUrl(pathFromSiteRoot: string): string {
  const trimmed = pathFromSiteRoot.replace(/^\/+/, '')
  const baseRaw = import.meta.env.BASE_URL
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`
  return `${base}${trimmed}`
}

const FALLBACK_THUMB = '/content/conversations/assets/placeholder-day1-cutscene.svg'

function DayEntryCard(
  props: Readonly<{ day: ConversationDay; complete: boolean; locked: boolean }>,
) {
  const { day, complete, locked } = props
  const thumbSrc = day.cutsceneImagePath?.trim()
    ? publicAssetUrl(day.cutsceneImagePath)
    : publicAssetUrl(FALLBACK_THUMB)
  const href = `/conversation/${day.dayId}`

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
  const { isDayComplete } = useConversationSession()
  const [state, setState] = useState<RemoteContentState<ConversationStage>>({ status: 'idle' })
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
    setState({ status: 'loading' })
    getConversationStage(MVP_CONV_STAGE_ID)
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
  }, [])

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
      if (r.stageId === MVP_CONV_STAGE_ID) {
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
              MVP_CONV_STAGE_ID,
              d.dayId,
            )
            const sessionDone = isDayComplete(d.dayId)
            const complete = sessionDone || persistedDone
            const seqOpen = isSequentialDayUnlocked(sortedIds, completedPersisted, d.dayId)
            const locked = !complete && !seqOpen
            return (
              <DayEntryCard key={d.dayId} day={d} complete={complete} locked={locked} />
            )
          })}
        </ul>
      )
  }

  const stageEyebrow = `Stage ${MVP_CONV_STAGE_ID} · 실전 회화`
  const stageTitle =
    state.status === 'success' && state.data.stageTitleKo !== undefined && state.data.stageTitleKo.trim() !== ''
      ? state.data.stageTitleKo
      : `Stage ${MVP_CONV_STAGE_ID}`
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
          MVP_CONV_STAGE_ID,
        )
        return `Stage ${MVP_CONV_STAGE_ID} 진행률 ${done}/${total}`
      })()
    : null

  return (
    <main className="conv-stage-list">
      <header className="conv-stage-list__hero">
        <p className="conv-stage-list__eyebrow">{stageEyebrow}</p>
        <h1 className="conv-stage-list__title">{stageTitle}</h1>
        {stageProgressLine !== null ? (
          <p className="conv-stage-list__progress-line">{stageProgressLine}</p>
        ) : null}
        {stageDesc !== null ? <p className="conv-stage-list__desc">{stageDesc}</p> : null}
      </header>
      {body}
    </main>
  )
}
