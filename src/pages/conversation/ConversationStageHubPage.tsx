import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getConversationStage,
  isContentFetchError,
  resolvePublicUrl,
  type RemoteContentState,
} from '../../api/contentApi'
import { countCompletedConversationDaysForStage } from '../../utils/learnStats'
import {
  HADES_USER_PROGRESS_EVENT,
  loadUserProgress,
} from '../../utils/storage'
import type { ConversationStage } from '../../types/conversation'
import './ConversationStageListPage.css'

type StageHubEntry = Readonly<{
  id: number
  titleKo: string
  descriptionKo: string
  tags: readonly string[]
  status: 'active' | 'planned'
  thumbnailPath?: string
}>

const STAGE_HUB_ENTRIES: readonly StageHubEntry[] = [
  {
    id: 1,
    titleKo: '음식점 가는 상황',
    descriptionKo:
      '약속 잡기, 예약, 주문, 길 안내, 결제, 일정 변경까지 한 흐름으로 연습합니다.',
    tags: ['약속', '예약', '주문', '길 안내', '결제'],
    status: 'active',
    thumbnailPath: '/content/conversations/stage-1/assets/stage-1-day-01-cutscene.jpg',
  },
  {
    id: 2,
    titleKo: '구직-1: 취업 정보 얻기',
    descriptionKo:
      '카페와 서점, 동네 공간을 돌아다니며 취업 정보를 묻고 첫 면접 전날까지 준비합니다.',
    tags: ['구직', '채용 문의', '면접', '자기소개'],
    status: 'active',
    thumbnailPath: '/content/conversations/assets/placeholder-day2-cutscene.svg',
  },
  {
    id: 3,
    titleKo: '구직-2: 면접과 첫 근무',
    descriptionKo:
      '면접 당일 대화와 첫 출근 상황은 다음 콘텐츠 작업에서 이어집니다.',
    tags: ['준비 중'],
    status: 'planned',
  },
]

const ACTIVE_STAGE_IDS = STAGE_HUB_ENTRIES.filter(
  (entry) => entry.status === 'active',
).map((entry) => entry.id)

type StageMap = Readonly<Record<number, ConversationStage>>

export default function ConversationStageHubPage() {
  const [state, setState] = useState<RemoteContentState<StageMap>>({
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
    Promise.all(
      ACTIVE_STAGE_IDS.map(async (stageId) => {
        const stage = await getConversationStage(stageId)
        return [stageId, stage] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return
        setState({ status: 'success', data: Object.fromEntries(entries) as StageMap })
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e))
        if (!cancelled) setState({ status: 'error', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="conv-stage-list conv-stage-hub">
      <header className="conv-stage-list__hero">
        <p className="conv-stage-list__eyebrow">실전 회화</p>
        <h1 className="conv-stage-list__title">주제별 스테이지</h1>
        <p className="conv-stage-list__desc">
          상황을 먼저 고르고, 그 안에서 Day를 순서대로 진행합니다.
        </p>
      </header>

      {state.status === 'error' ? (
        <p className="conv-stage-list__muted" role="alert">
          {isContentFetchError(state.error)
            ? state.error.message
            : state.error.message || '스테이지 정보를 불러오지 못했습니다.'}
        </p>
      ) : null}

      <ul className="conv-stage-hub__list">
        {STAGE_HUB_ENTRIES.map((entry) => {
          const active = entry.status === 'active'
          const stage = state.status === 'success' ? state.data[entry.id] : undefined
          const total = stage?.days.length ?? 0
          const done = active
            ? Math.min(countCompletedConversationDaysForStage(persistedProgress, entry.id), total)
            : 0
          const complete = active && total > 0 && done >= total
          const progressLabel =
            active && state.status === 'success'
              ? `진행률 ${done}/${total}`
              : active
                ? '진행률 확인 중'
                : '스토리 준비 중'
          const href = `/conversation/stage/${entry.id}`
          return (
            <li key={entry.id}>
              <article
                className={`ui-card ui-card--dashboard conv-stage-hub__card${
                  active ? '' : ' conv-stage-hub__card--planned'
                }`}
              >
                <div className="conv-stage-hub__media-row">
                  <div className="conv-stage-hub__thumb" aria-hidden>
                    {entry.thumbnailPath !== undefined ? (
                      <img
                        className="conv-stage-hub__thumb-img"
                        src={resolvePublicUrl(entry.thumbnailPath)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="conv-stage-hub__thumb-placeholder">
                        Stage {entry.id}
                      </span>
                    )}
                  </div>
                  <div className="conv-stage-hub__summary">
                    <div className="conv-stage-hub__topline">
                      <p className="conv-stage-list__day-num">Stage {entry.id}</p>
                      <span
                        className={
                          active
                            ? complete
                              ? 'conv-stage-list__done-pill'
                              : 'conv-stage-list__ready-pill'
                            : 'conv-stage-list__locked-pill'
                        }
                      >
                        {active ? (complete ? '완료' : '진행 가능') : '준비 중'}
                      </span>
                    </div>
                    <h2 className="conv-stage-hub__title">{entry.titleKo}</h2>
                  </div>
                </div>
                <p className="conv-stage-list__card-desc">{entry.descriptionKo}</p>
                <div className="conv-stage-hub__tags" aria-label="학습 태그">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="conv-stage-hub__tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="conv-stage-list__progress-line">{progressLabel}</p>
                {active ? (
                  <Link className="ui-btn ui-btn--primary ui-btn--block" to={href}>
                    {done > 0 ? '이어하기' : 'Stage 시작'}
                  </Link>
                ) : (
                  <button type="button" className="ui-btn ui-btn--ghost ui-btn--block" disabled>
                    콘텐츠 추가 예정
                  </button>
                )}
              </article>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
