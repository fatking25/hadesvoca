import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { wrongNoteDetailPath } from '../constants/routes'
import type { StageWordsFile } from '../types/content'
import type { ConversationStage } from '../types/conversation'
import type { WrongNoteRef, WrongNoteType } from '../types/user-progress'
import {
  findExpressionQuiz,
  findKeyExpression,
  findWordQuestionWithEntry,
  loadConversationStageCached,
  loadStageWordsCached,
  parseStageIdKey,
  stageIdKey,
} from '../utils/contentJoin'
import { loadUserProgress } from '../utils/storage'
import './WrongNotePage.css'

type WrongTab = 'all' | 'word' | 'expression'

type WordPacks = Readonly<Record<number, StageWordsFile | null>>
type ConvPacks = Readonly<Record<number, ConversationStage | null>>

type WrongListRow = Readonly<{
  key: string
  note: WrongNoteRef
  label: string
  title: string
  meaning: string
  wrongCount: number
}>

const TABS: ReadonlyArray<{ id: WrongTab; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'word', label: '단어' },
  { id: 'expression', label: '표현' },
]

function groupWrongRows(
  notes: readonly WrongNoteRef[],
  wordPacks: WordPacks,
  convPacks: ConvPacks,
): readonly WrongListRow[] {
  const rows = new Map<string, WrongListRow>()

  for (const note of notes) {
    if (note.type === 'word') {
      const pack = wordPacks[note.stageId]
      const found =
        pack !== null && pack !== undefined
          ? findWordQuestionWithEntry(pack, note.dayId, note.id)
          : null
      const groupId = found?.entry.id ?? note.id
      const key = `word:${note.stageId}:${note.dayId}:${groupId}`
      const prev = rows.get(key)
      rows.set(key, {
        key,
        note: prev?.note ?? note,
        label: '단어',
        title: found?.entry.word ?? '불러오는 중…',
        meaning: found?.entry.meaning ?? '',
        wrongCount: (prev?.wrongCount ?? 0) + note.wrongCount,
      })
      continue
    }

    const stage = convPacks[note.stageId]
    const quiz =
      stage !== null && stage !== undefined
        ? findExpressionQuiz(stage, note.dayId, note.id)
        : null
    const expr =
      quiz?.expressionId !== undefined && stage !== null && stage !== undefined
        ? findKeyExpression(stage, note.dayId, quiz.expressionId)
        : null
    const groupId = quiz?.expressionId ?? note.id
    const key = `expression:${note.stageId}:${note.dayId}:${groupId}`
    const prev = rows.get(key)
    rows.set(key, {
      key,
      note: prev?.note ?? note,
      label: '표현',
      title: expr?.expressionEn ?? quiz?.promptEn ?? quiz?.promptKo ?? '불러오는 중…',
      meaning: expr?.expressionKo ?? quiz?.promptKo ?? '',
      wrongCount: (prev?.wrongCount ?? 0) + note.wrongCount,
    })
  }

  return [...rows.values()]
}

export default function WrongNotePage() {
  const [activeTab, setActiveTab] = useState<WrongTab>('all')
  const [reloadNonce, setReloadNonce] = useState(0)

  const progress = useMemo(() => {
    void reloadNonce
    return loadUserProgress()
  }, [reloadNonce])

  const sorted = useMemo(
    () =>
      [...progress.wrongNotes].sort((a, b) =>
        b.lastWrongAt.localeCompare(a.lastWrongAt),
      ),
    [progress.wrongNotes],
  )

  const filtered = useMemo((): WrongNoteRef[] => {
    if (activeTab === 'all') return [...sorted]
    const t = activeTab as WrongNoteType
    return sorted.filter((w) => w.type === t)
  }, [sorted, activeTab])

  const wordStageKey = useMemo(
    () =>
      stageIdKey(
        sorted.filter((w) => w.type === 'word').map((w) => w.stageId),
      ),
    [sorted],
  )
  const exprStageKey = useMemo(
    () =>
      stageIdKey(
        sorted.filter((w) => w.type === 'expression').map((w) => w.stageId),
      ),
    [sorted],
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

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === 'visible') setReloadNonce((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const grouped = useMemo(
    () => groupWrongRows(filtered, wordPacks, convPacks),
    [convPacks, filtered, wordPacks],
  )

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

      <section className="ui-card ui-card--dashboard wrong-panel" aria-label="오답 목록">
        {grouped.length === 0 ? (
          <p className="wrong-empty ui-card__body">
            {sorted.length === 0
              ? '오답이 없습니다.'
              : '필터에 해당하는 오답이 없습니다.'}
          </p>
        ) : (
          <ul className="wrong-list" aria-label="오답 목록">
            {grouped.map((row) => (
              <li key={row.key} className="wrong-list__row">
                <Link
                  className="wrong-list__link"
                  to={wrongNoteDetailPath(
                    row.note.type,
                    row.note.stageId,
                    row.note.dayId,
                    row.note.id,
                  )}
                >
                  <span className="wrong-list__badge">{row.label}</span>
                  <span className="wrong-list__text">
                    <span className="wrong-list__word" lang="en">
                      {row.title}
                    </span>
                    {row.meaning !== '' && (
                      <span className="wrong-list__meaning" lang="ko">
                        {row.meaning}
                      </span>
                    )}
                  </span>
                  <span className="wrong-list__count">오답 {row.wrongCount}회</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
