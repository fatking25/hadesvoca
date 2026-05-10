/**
 * 단어 학습 Stage·Day 목록: 콘텐츠 순서대로 순차 해금(Duolingo 스타일) · 완료 표시는 localStorage
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchStageWordsByStageId,
  type RemoteContentState,
} from '../api/contentApi'
import { LearningPathView, type LearningPathDay } from '../components/learning/LearningPathView'
import type { StageWordsFile } from '../types/content'
import { countCompletedWordDaysForStage } from '../utils/learnStats'
import { lessonAvailabilityFromContentAndProgress } from '../utils/learningUnlock'
import { HADES_USER_PROGRESS_EVENT, loadUserProgress } from '../utils/storage'

/** Stage 1 · 기초 TOEIC 단어 (기획 5.2) — 콘텐츠 로드 전 플레이스홀더 */
const STAGE_TITLE = 'Stage 1 · 기초 TOEIC 단어'
const UNIT_HEADLINE = '핵심 단어를 한 세트씩 마스터하기'
const MVP_STAGE_ID = 1

const FALLBACK_DAY_ROWS: readonly Readonly<{ id: number; title: string }>[] = [
  { id: 1, title: '사무·회사 기본 단어' },
  { id: 2, title: '일정·회의 단어' },
  { id: 3, title: '이메일·문서 단어' },
  { id: 4, title: '채용·인사 단어' },
  { id: 5, title: '쇼핑·결제 단어' },
  { id: 6, title: '여행·숙박 단어' },
  { id: 7, title: 'Stage 1 복습' },
]

export default function WordStudyDayListPage() {
  const [reloadNonce, setReloadNonce] = useState(0)
  const [packState, setPackState] = useState<RemoteContentState<StageWordsFile>>({
    status: 'idle',
  })

  const refresh = useCallback(() => {
    setReloadNonce((n) => n + 1)
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
    setPackState({ status: 'loading' })
    fetchStageWordsByStageId(MVP_STAGE_ID)
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
  }, [])

  const { completeDayIds, completedStageCount, pathDays, contentDayTotal } = useMemo(() => {
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
    for (const d of p.completedWordDays) {
      if (d.stageId !== MVP_STAGE_ID) continue
      visibleComplete.add(d.dayId)
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

    return {
      completeDayIds: visibleComplete,
      completedStageCount: countCompletedWordDaysForStage(p, MVP_STAGE_ID),
      pathDays: orderedRows,
      contentDayTotal: Math.max(0, totalDays),
    }
  }, [reloadNonce, packState])

  const progressLine = `Stage ${MVP_STAGE_ID} 진행률 ${completedStageCount}/${Math.max(0, contentDayTotal)}`

  return (
    <LearningPathView
      variant="word"
      sectionLabel={STAGE_TITLE}
      unitTitle={UNIT_HEADLINE}
      progressLine={progressLine}
      screenCaption={
        'Day는 앞 순서부터 열립니다. 첫 레슨부터 완료해 나가세요 · 완료한 Day는 자유 복습'
      }
      days={pathDays}
      basePath="/word-study"
      completeDayIds={completeDayIds}
    />
  )
}
