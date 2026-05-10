/**
 * 단어 학습 Stage·Day 목록: 콘텐츠 JSON Day 수 기준 진행률 + 저장 완료·상태 표시.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchStageWordsByStageId,
  type RemoteContentState,
} from '../api/contentApi'
import { LearningPathView } from '../components/learning/LearningPathView'
import type { StageWordsFile } from '../types/content'
import { countCompletedWordDaysForStage } from '../utils/learnStats'
import { loadUserProgress } from '../utils/storage'

type DaySummary = Readonly<{ id: number; title: string; status: 'ready' | 'coming' }>

/** Stage 1 · 기초 TOEIC 단어 (기획 5.2) — 이후 Stage JSON 분리 예정 */
const STAGE_TITLE = 'Stage 1 · 기초 TOEIC 단어'
const UNIT_HEADLINE = '핵심 단어를 한 세트씩 마스터하기'
const MVP_STAGE_ID = 1

const DAYS: readonly DaySummary[] = [
  { id: 1, title: '사무·회사 기본 단어', status: 'ready' },
  { id: 2, title: '일정·회의 단어', status: 'ready' },
  { id: 3, title: '이메일·문서 단어', status: 'ready' },
  { id: 4, title: '채용·인사 단어', status: 'ready' },
  { id: 5, title: '쇼핑·결제 단어', status: 'ready' },
  { id: 6, title: '여행·숙박 단어', status: 'ready' },
  { id: 7, title: 'Stage 1 복습', status: 'ready' },
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
    return () => {
      document.removeEventListener('visibilitychange', onVis)
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

  const { completeDayIds, completedStageCount } = useMemo(() => {
    void reloadNonce
    const p = loadUserProgress()
    const s = new Set<number>()
    for (const d of p.completedWordDays) {
      if (d.stageId === MVP_STAGE_ID) s.add(d.dayId)
    }
    return {
      completeDayIds: s,
      completedStageCount: countCompletedWordDaysForStage(p, MVP_STAGE_ID),
    }
  }, [reloadNonce])

  const contentDayTotal = useMemo(() => {
    if (packState.status === 'success') return packState.data.days.length
    return DAYS.length
  }, [packState])

  const progressLine = `Stage ${MVP_STAGE_ID} 진행률 ${completedStageCount}/${Math.max(0, contentDayTotal)}`

  return (
    <LearningPathView
      variant="word"
      sectionLabel={STAGE_TITLE}
      unitTitle={UNIT_HEADLINE}
      progressLine={progressLine}
      screenCaption={
        completeDayIds.size > 0 ?
          'Day 노드를 탭해 퀴즈로 이동합니다 · 완료·진행 가능·준비 중은 라벨로 표시됩니다'
        : 'Day 노드를 탭해 퀴즈로 이동합니다'
      }
      days={DAYS}
      basePath="/word-study"
      completeDayIds={completeDayIds}
    />
  )
}
