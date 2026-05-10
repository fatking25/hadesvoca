/**
 * 오답노트 MVP: `UserProgress.wrongNotes` 참조·통계 목록 표시(JSON 본문 없음).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WrongNoteRef, WrongNoteType } from '../types/user-progress'
import { loadUserProgress } from '../utils/storage'
import './WrongNotePage.css'

type WrongTab = 'all' | 'word' | 'expression' | 'resolved'

const TABS: ReadonlyArray<{ id: WrongTab; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'word', label: '단어' },
  { id: 'expression', label: '표현' },
  { id: 'resolved', label: '해결됨' },
]

function typeLabel(t: WrongNoteType): string {
  return t === 'word' ? '단어' : '표현'
}

export default function WrongNotePage() {
  const [activeTab, setActiveTab] = useState<WrongTab>('all')
  const [reloadNonce, setReloadNonce] = useState(0)

  const progress = useMemo(() => {
    void reloadNonce
    return loadUserProgress()
  }, [reloadNonce])

  const refresh = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  const sorted = useMemo(
    () =>
      [...progress.wrongNotes].sort((a, b) =>
        b.lastWrongAt.localeCompare(a.lastWrongAt),
      ),
    [progress.wrongNotes],
  )

  const filtered = useMemo((): WrongNoteRef[] => {
    if (activeTab === 'all') return [...sorted]
    if (activeTab === 'resolved') return sorted.filter((w) => w.resolved === true)
    const t = activeTab as WrongNoteType
    return sorted.filter((w) => w.type === t)
  }, [sorted, activeTab])

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  return (
    <main className="wrong-page">
      <h1 className="wrong-page__title">오답노트</h1>

      <div className="wrong-tabs" role="tablist" aria-label="오답 필터">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className="ui-btn ui-btn--tab"
              onClick={() => {
                setActiveTab(tab.id)
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <section className="ui-card ui-card--dashboard" aria-label="오답 목록">
        {filtered.length === 0 ?
          <>
            <p className="wrong-empty ui-card__body">
              {sorted.length === 0 ?
                '아직 저장된 오답이 없습니다. 단어나 회화 표현 퀴즈에서 틀리면 여기에 쌓여요.'
              : '이 탭에 해당하는 오답이 없습니다.'}
            </p>
          </>
        : <>
            <ul className="wrong-list" aria-label="오답 참조 목록">
              {filtered.map((w) => (
                <li key={`${w.type}:${w.id}:${w.stageId}:${w.dayId}`} className="wrong-list__row">
                  <div className="wrong-list__meta">
                    <span className="wrong-list__badge">{typeLabel(w.type)}</span>
                    <span className="wrong-list__refs">
                      Stage {w.stageId} · Day {w.dayId} · id <code>{w.id}</code>
                    </span>
                  </div>
                  <dl className="wrong-list__stats">
                    <div className="wrong-list__stat">
                      <dt>틀린 횟수</dt>
                      <dd>{w.wrongCount}</dd>
                    </div>
                    <div className="wrong-list__stat">
                      <dt>마지막 오답</dt>
                      <dd>
                        <time dateTime={w.lastWrongAt}>
                          {w.lastWrongAt.slice(0, 10)}
                        </time>
                      </dd>
                    </div>
                    <div className="wrong-list__stat">
                      <dt>복습 완료</dt>
                      <dd>{w.resolved ? '예' : '아니오'}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <p className="wrong-footnote ui-card__body">
              문제 글‧선택지 전체는 저장하지 않으며, 여기 표시되는 값은 참조 id와 통계뿐입니다.
            </p>
          </>
        }
      </section>
    </main>
  )
}
