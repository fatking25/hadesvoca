import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchStageWordsByStageId,
  type RemoteContentState,
} from '../api/contentApi'
import { LearningPathView, type LearningPathDay } from '../components/learning/LearningPathView'
import { MVP_WORD_STAGE_ID } from '../constants/content'
import { WORD_DAY_START_COIN_COST } from '../constants/economy'
import type { StageWordsFile } from '../types/content'
import { countCompletedWordDaysForStage } from '../utils/learnStats'
import { lessonAvailabilityFromContentAndProgress } from '../utils/learningUnlock'
import {
  getDueWordReviewStatuses,
  HADES_USER_PROGRESS_EVENT,
  loadUserProgress,
} from '../utils/storage'

const STAGE_TITLE = 'Stage 1 · 기초 TOEIC 단어'
const UNIT_HEADLINE = '필수 단어를 하루 단위로 익히기'
const FALLBACK_DAY_ROWS: readonly Readonly<{ id: number; title: string }>[] = [
  { id: 1, title: '업무·회사 기본 단어' },
  { id: 2, title: '일정·회의 단어' },
  { id: 3, title: '이메일·주문 단어' },
  { id: 4, title: '채용·인사 단어' },
  { id: 5, title: '결제·정산 단어' },
  { id: 6, title: '여행·숙박 단어' },
  { id: 7, title: 'Stage 1 복습' },
]

export default function WordStudyDayListPage() {
  const [reloadNonce, setReloadNonce] = useState(0)
  const [contentRetryNonce, setContentRetryNonce] = useState(0)
  const [packState, setPackState] = useState<RemoteContentState<StageWordsFile>>({
    status: 'loading',
  })

  const refresh = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  const retryContentLoad = useCallback(() => {
    setPackState({ status: 'loading' })
    setContentRetryNonce((n) => n + 1)
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

  useEffect(() => {
    let cancelled = false
    fetchStageWordsByStageId(MVP_WORD_STAGE_ID)
      .then((data) => {
        if (!cancelled) setPackState({ status: 'success', data })
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e))
        if (!cancelled) setPackState({ status: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [contentRetryNonce])

  const {
    coins,
    completeDayIds,
    completedStageCount,
    pathDays,
    contentDayTotal,
    dueReviewCount,
    currentOpenDayId,
  } = useMemo(() => {
    void reloadNonce
    const p = loadUserProgress()
    const contentIds = new Set<number>()
    if (packState.status === 'success') {
      for (const sec of packState.data.days) {
        contentIds.add(sec.dayId)
      }
    } else {
      for (const r of FALLBACK_DAY_ROWS) {
        contentIds.add(r.id)
      }
    }

    const completedForUnlock = new Set<number>()
    const visibleComplete = new Set<number>()
    let maxCompletedDayId = 0
    for (const d of p.completedWordDays) {
      if (d.stageId !== MVP_WORD_STAGE_ID) continue
      visibleComplete.add(d.dayId)
      if (d.dayId > maxCompletedDayId) maxCompletedDayId = d.dayId
      if (contentIds.has(d.dayId)) {
        completedForUnlock.add(d.dayId)
      }
    }

    const sortedDayIds =
      packState.status === 'success'
        ? [...packState.data.days]
            .map((sec) => sec.dayId)
            .filter((id) => Number.isFinite(id))
            .sort((a, b) => a - b)
        : FALLBACK_DAY_ROWS.map((r) => r.id)

    const orderedRows = sortedDayIds.map((id): LearningPathDay => {
      const sec =
        packState.status === 'success'
          ? packState.data.days.find((d) => d.dayId === id)
          : undefined
      const fb = FALLBACK_DAY_ROWS.find((r) => r.id === id)
      const titleKo = sec?.titleKo ?? fb?.title ?? `Day ${id}`
      const hasContent = sec !== undefined || (packState.status !== 'success' && fb !== undefined)
      const doneHere = visibleComplete.has(id)
      const rawStatus = lessonAvailabilityFromContentAndProgress({
        sortedDayIds,
        persistedCompletedDayIds: completedForUnlock,
        dayId: id,
        hasContentForDay: hasContent,
      })
      const status: LearningPathDay['status'] = doneHere ? 'open' : rawStatus
      const idx = sortedDayIds.indexOf(id)
      const prevId = idx > 0 ? sortedDayIds[idx - 1] : undefined
      return {
        id,
        title: titleKo,
        status,
        prerequisiteDayId:
          status === 'locked' && prevId !== undefined ? prevId : undefined,
      }
    })

    const totalDays =
      packState.status === 'success'
        ? packState.data.days.length
        : FALLBACK_DAY_ROWS.length

    const nextDay = orderedRows.find(
      (row) => row.status === 'open' && !visibleComplete.has(row.id),
    )

    return {
      coins: p.coins,
      completeDayIds: visibleComplete,
      completedStageCount: countCompletedWordDaysForStage(p, MVP_WORD_STAGE_ID),
      pathDays: orderedRows,
      contentDayTotal: Math.max(0, totalDays),
      dueReviewCount: getDueWordReviewStatuses(p, maxCompletedDayId).length,
      currentOpenDayId: nextDay?.id,
    }
  }, [reloadNonce, packState])

  const coinShort = coins < WORD_DAY_START_COIN_COST
  const progressLine = `Stage ${MVP_WORD_STAGE_ID} 진행률 ${completedStageCount}/${Math.max(0, contentDayTotal)} · 보유 ${coins}코인`
  const screenCaption = coinShort
    ? `보유 코인 ${coins}개로는 새 Day를 시작할 수 없습니다.`
    : '노드를 누르면 시작 카드가 열립니다.'

  if (packState.status === 'error') {
    return (
      <main className="learning-path learning-path--word">
        <section className="ui-card ui-card--dashboard">
          <h1 className="ui-card__section-heading">
            단어 콘텐츠를 불러오지 못했어요
          </h1>
          <p className="ui-card__body">
            연결을 확인한 뒤 다시 시도해 주세요.
          </p>
          <div className="word-study__coin-gate-actions">
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--block"
              onClick={retryContentLoad}
            >
              다시 시도
            </button>
            <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/home">
              홈으로 이동
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <LearningPathView
      variant="word"
      sectionLabel={STAGE_TITLE}
      unitTitle={UNIT_HEADLINE}
      progressLine={progressLine}
      screenCaption={screenCaption}
      days={pathDays}
      basePath="/word-study"
      completeDayIds={completeDayIds}
      reviewBanner={{
        dueCount: dueReviewCount,
        reviewHref: '/word-study/review',
      }}
      currentOpenDayId={currentOpenDayId}
      startGate={{ coins, cost: WORD_DAY_START_COIN_COST }}
    />
  )
}
