/**
 * 단어장: `UserProgress.savedWords` · `savedExpressions` 참조 목록 + 콘텐츠 JSON 본문 join 표시.
 * 본문은 표시 시점에만 fetch 하고 저장 데이터에는 본문을 넣지 않는다.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StageWordsFile } from '../types/content'
import type { ConversationStage } from '../types/conversation'
import {
  findKeyExpression,
  findWordEntry,
  loadConversationStageCached,
  loadStageWordsCached,
} from '../utils/contentJoin'
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

type WordPacks = Readonly<Record<number, StageWordsFile | null>>
type ConvPacks = Readonly<Record<number, ConversationStage | null>>

function stageIdKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',')
}

function parseStageIdKey(key: string): readonly number[] {
  if (key === '') return []
  return key.split(',').map((s) => Number(s))
}

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

  const wordStageKey = useMemo(
    () => stageIdKey(wordsSorted.map((w) => w.stageId)),
    [wordsSorted],
  )
  const exprStageKey = useMemo(
    () => stageIdKey(expressionsSorted.map((e) => e.stageId)),
    [expressionsSorted],
  )

  const [wordPacks, setWordPacks] = useState<WordPacks>({})
  const [convPacks, setConvPacks] = useState<ConvPacks>({})

  useEffect(() => {
    const stageIds = parseStageIdKey(wordStageKey)
    let cancelled = false
    Promise.all(
      stageIds.map((id) =>
        loadStageWordsCached(id)
          .then((pack): { id: number; pack: StageWordsFile | null } => ({
            id,
            pack,
          }))
          .catch((): { id: number; pack: StageWordsFile | null } => ({
            id,
            pack: null,
          })),
      ),
    ).then((rows) => {
      if (cancelled) return
      const next: Record<number, StageWordsFile | null> = {}
      for (const row of rows) next[row.id] = row.pack
      setWordPacks(next)
    })
    return () => {
      cancelled = true
    }
  }, [wordStageKey])

  useEffect(() => {
    const stageIds = parseStageIdKey(exprStageKey)
    let cancelled = false
    Promise.all(
      stageIds.map((id) =>
        loadConversationStageCached(id)
          .then((pack): { id: number; pack: ConversationStage | null } => ({
            id,
            pack,
          }))
          .catch((): { id: number; pack: ConversationStage | null } => ({
            id,
            pack: null,
          })),
      ),
    ).then((rows) => {
      if (cancelled) return
      const next: Record<number, ConversationStage | null> = {}
      for (const row of rows) next[row.id] = row.pack
      setConvPacks(next)
    })
    return () => {
      cancelled = true
    }
  }, [exprStageKey])

  let panel: ReactNode
  if (activeTab === 'words') {
    panel =
      wordsSorted.length === 0 ? (
        <p className="ui-card__body vocab-empty">
          아직 저장한 단어가 없습니다. 단어 학습 중 &quot;단어장에 저장&quot;을 눌러 보세요.
        </p>
      ) : (
        <ul className="vocab-list" aria-label="저장한 단어 목록">
          {wordsSorted.map((w) => {
            const pack = wordPacks[w.stageId]
            const entry =
              pack !== null && pack !== undefined
                ? findWordEntry(pack, w.dayId, w.lemmaId)
                : null
            const showLoading = pack === undefined
            return (
              <li key={w.lemmaId} className="vocab-list__row vocab-list__row--word">
                <div className="vocab-list__meta">
                  <span className="vocab-list__badge">단어</span>
                  {entry !== null ? (
                    <div className="vocab-list__body">
                      <p className="vocab-list__word" lang="en">
                        {entry.word}
                      </p>
                      <p className="vocab-list__meaning" lang="ko">
                        {entry.meaning}
                      </p>
                      {entry.exampleSentence !== '' && (
                        <p className="vocab-list__example" lang="en">
                          {entry.exampleSentence}
                        </p>
                      )}
                      {entry.exampleMeaning !== '' && (
                        <p className="vocab-list__example-ko" lang="ko">
                          {entry.exampleMeaning}
                        </p>
                      )}
                    </div>
                  ) : showLoading ? (
                    <p className="vocab-list__loading">단어를 불러오는 중…</p>
                  ) : (
                    <p className="vocab-list__fallback">
                      해당 콘텐츠를 찾지 못했습니다.
                    </p>
                  )}
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
            )
          })}
        </ul>
      )
  } else if (activeTab === 'expressions') {
    panel =
      expressionsSorted.length === 0 ? (
        <p className="ui-card__body vocab-empty">
          아직 저장한 표현이 없습니다. 실전 회화 핵심 표현에서 저장해 보세요.
        </p>
      ) : (
        <ul className="vocab-list" aria-label="저장한 표현 목록">
          {expressionsSorted.map((ex) => {
            const stage = convPacks[ex.stageId]
            const expr =
              stage !== null && stage !== undefined
                ? findKeyExpression(stage, ex.dayId, ex.expressionId)
                : null
            const showLoading = stage === undefined
            return (
              <li
                key={`${ex.expressionId}-${ex.stageId}-${ex.dayId}`}
                className="vocab-list__row vocab-list__row--expr"
              >
                <div className="vocab-list__meta">
                  <span className="vocab-list__badge vocab-list__badge--expr">표현</span>
                  {expr !== null ? (
                    <div className="vocab-list__body">
                      <p className="vocab-list__word" lang="en">
                        {expr.expressionEn}
                      </p>
                      <p className="vocab-list__meaning" lang="ko">
                        {expr.expressionKo}
                      </p>
                      {expr.tipKo !== undefined && expr.tipKo !== '' && (
                        <p className="vocab-list__example-ko" lang="ko">
                          {expr.tipKo}
                        </p>
                      )}
                    </div>
                  ) : showLoading ? (
                    <p className="vocab-list__loading">표현을 불러오는 중…</p>
                  ) : (
                    <p className="vocab-list__fallback">
                      해당 콘텐츠를 찾지 못했습니다.
                    </p>
                  )}
                  <span className="vocab-list__refs">
                    Stage {ex.stageId} · Day {ex.dayId} · id <code>{ex.expressionId}</code>
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
            )
          })}
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
