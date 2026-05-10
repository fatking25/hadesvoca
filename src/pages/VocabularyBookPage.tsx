/**
 * 단어장: `UserProgress.savedWords` · `savedExpressions` 참조 목록(본문은 콘텐츠 JSON에서만).
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  loadUserProgress,
  persistRemoveSavedExpression,
  persistRemoveSavedWord,
} from '../utils/storage'
import './VocabularyBookPage.css'

type VocabTab = 'words' | 'expressions' | 'favorites'

const TABS: ReadonlyArray<{ id: VocabTab; label: string }> = [
  { id: 'words', label: '저장한 단어' },
  { id: 'expressions', label: '저장한 표현' },
  { id: 'favorites', label: '즐겨찾기' },
]

export default function VocabularyBookPage() {
  const [activeTab, setActiveTab] = useState<VocabTab>('words')
  const [reloadNonce, setReloadNonce] = useState(0)

  const progress = useMemo(() => {
    void reloadNonce
    return loadUserProgress()
  }, [reloadNonce])

  const refresh = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  const wordsSorted = useMemo(
    () =>
      [...progress.savedWords].sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      ),
    [progress.savedWords],
  )

  const expressionsSorted = useMemo(
    () =>
      [...progress.savedExpressions].sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      ),
    [progress.savedExpressions],
  )

  let panel: ReactNode
  if (activeTab === 'words') {
    panel =
      wordsSorted.length === 0 ? (
        <p className="ui-card__body vocab-empty">
          아직 저장한 단어가 없습니다. 단어 학습 중 &quot;단어장에 저장&quot;을 눌러 보세요.
        </p>
      ) : (
        <ul className="vocab-list" aria-label="저장한 단어 id 목록">
          {wordsSorted.map((w) => (
            <li key={w.lemmaId} className="vocab-list__row vocab-list__row--word">
              <div className="vocab-list__meta">
                <span className="vocab-list__badge">단어</span>
                <span className="vocab-list__refs">
                  Stage {w.stageId} · Day {w.dayId ?? '—'} · id <code>{w.lemmaId}</code>
                </span>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--ghost vocab-list__del"
                onClick={() => {
                  persistRemoveSavedWord(w.lemmaId)
                  refresh()
                }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )
  } else if (activeTab === 'expressions') {
    panel =
      expressionsSorted.length === 0 ? (
        <p className="ui-card__body vocab-empty">
          아직 저장한 표현이 없습니다. 실전 회화 핵심 표현에서 저장해 보세요.
        </p>
      ) : (
        <ul className="vocab-list" aria-label="저장한 표현 id 목록">
          {expressionsSorted.map((ex) => (
            <li
              key={`${ex.expressionId}-${ex.stageId}-${ex.dayId}`}
              className="vocab-list__row vocab-list__row--expr"
            >
              <div className="vocab-list__meta">
                <span className="vocab-list__badge vocab-list__badge--expr">표현</span>
                <span className="vocab-list__refs">
                  Stage {ex.stageId} · Day {ex.dayId} · id{' '}
                  <code>{ex.expressionId}</code>
                </span>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--ghost vocab-list__del"
                onClick={() => {
                  persistRemoveSavedExpression(
                    ex.expressionId,
                    ex.stageId,
                    ex.dayId,
                  )
                  refresh()
                }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )
  } else {
    panel = (
      <p className="ui-card__body vocab-empty">즐겨찾기는 이후 단계에서 연결합니다.</p>
    )
  }

  return (
    <main className="vocab-page">
      <h1 className="vocab-page__title">단어장</h1>

      <div className="vocab-tabs" role="tablist" aria-label="단어장 보기 방식">
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

      <section
        className="ui-card ui-card--dashboard vocab-panel"
        aria-label={
          activeTab === 'words'
            ? '저장한 단어'
            : activeTab === 'expressions'
              ? '저장한 표현'
              : '즐겨찾기'
        }
      >
        {panel}
      </section>
    </main>
  )
}
