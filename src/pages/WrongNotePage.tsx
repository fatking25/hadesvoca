/**
 * 오답노트: `UserProgress.wrongNotes` 참조·통계 + 콘텐츠 JSON 본문 join 표시.
 * 본문(문제글·선택지·정답·해설)은 표시 시점에만 fetch 하고 저장 데이터에는 본문을 넣지 않는다.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StageWordsFile } from '../types/content'
import type { ConversationStage } from '../types/conversation'
import type { WrongNoteRef, WrongNoteType } from '../types/user-progress'
import {
  findExpressionQuiz,
  findWordQuestionWithEntry,
  getCorrectOptionText,
  getWordQuestionPrompt,
  loadConversationStageCached,
  loadStageWordsCached,
} from '../utils/contentJoin'
import { loadUserProgress } from '../utils/storage'
import './WrongNotePage.css'

type WrongTab = 'all' | 'word' | 'expression' | 'resolved'

const TABS: ReadonlyArray<{ id: WrongTab; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'word', label: '단어' },
  { id: 'expression', label: '표현' },
  { id: 'resolved', label: '해결됨' },
]

type WordPacks = Readonly<Record<number, StageWordsFile | null>>
type ConvPacks = Readonly<Record<number, ConversationStage | null>>

function typeLabel(t: WrongNoteType): string {
  return t === 'word' ? '단어' : '표현'
}

function stageIdKey(ids: readonly number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',')
}

function parseStageIdKey(key: string): readonly number[] {
  if (key === '') return []
  return key.split(',').map((s) => Number(s))
}

function WordWrongBody({
  note,
  pack,
}: {
  readonly note: WrongNoteRef
  readonly pack: StageWordsFile | null | undefined
}): ReactNode {
  if (pack === undefined) {
    return <p className="wrong-list__loading">문제를 불러오는 중…</p>
  }
  const found =
    pack !== null ? findWordQuestionWithEntry(pack, note.dayId, note.id) : null
  if (found === null) {
    return <p className="wrong-list__fallback">해당 문제를 찾지 못했습니다.</p>
  }
  const { entry, question } = found
  const prompt = getWordQuestionPrompt(question)
  const correct = getCorrectOptionText(question.options, question.correctOptionId)
  const promptLang = question.type === 'meaning-to-word' ? 'ko' : 'en'
  return (
    <div className="wrong-list__body">
      <p className="wrong-list__prompt" lang={promptLang}>
        {prompt}
      </p>
      {correct !== '' && (
        <p className="wrong-list__answer">
          <span className="wrong-list__answer-label">정답</span>{' '}
          <span lang={question.type === 'meaning-to-word' ? 'en' : 'ko'}>
            {correct}
          </span>
        </p>
      )}
      <p className="wrong-list__lemma">
        <span lang="en">
          <strong>{entry.word}</strong>
        </span>
        <span aria-hidden="true"> · </span>
        <span lang="ko">{entry.meaning}</span>
      </p>
      {entry.explanation !== '' && (
        <p className="wrong-list__exp">{entry.explanation}</p>
      )}
    </div>
  )
}

function ExpressionWrongBody({
  note,
  stage,
}: {
  readonly note: WrongNoteRef
  readonly stage: ConversationStage | null | undefined
}): ReactNode {
  if (stage === undefined) {
    return <p className="wrong-list__loading">문제를 불러오는 중…</p>
  }
  const quiz =
    stage !== null ? findExpressionQuiz(stage, note.dayId, note.id) : null
  if (quiz === null) {
    return <p className="wrong-list__fallback">해당 문제를 찾지 못했습니다.</p>
  }
  const correct = getCorrectOptionText(quiz.options, quiz.correctOptionId)
  return (
    <div className="wrong-list__body">
      <p className="wrong-list__prompt" lang="ko">
        {quiz.promptKo}
      </p>
      {quiz.promptEn !== undefined && quiz.promptEn !== '' && (
        <p className="wrong-list__prompt-en" lang="en">
          {quiz.promptEn}
        </p>
      )}
      {correct !== '' && (
        <p className="wrong-list__answer">
          <span className="wrong-list__answer-label">정답</span>{' '}
          <span lang="en">{correct}</span>
        </p>
      )}
      {quiz.explanationKo !== undefined && quiz.explanationKo !== '' && (
        <p className="wrong-list__exp">{quiz.explanationKo}</p>
      )}
    </div>
  )
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
        {filtered.length === 0 ? (
          <p className="wrong-empty ui-card__body">
            {sorted.length === 0
              ? '아직 저장된 오답이 없습니다. 단어나 회화 표현 퀴즈에서 틀리면 여기에 쌓여요.'
              : '이 탭에 해당하는 오답이 없습니다.'}
          </p>
        ) : (
          <>
            <ul className="wrong-list" aria-label="오답 목록">
              {filtered.map((w) => (
                <li
                  key={`${w.type}:${w.id}:${w.stageId}:${w.dayId}`}
                  className="wrong-list__row"
                >
                  <div className="wrong-list__meta">
                    <span className="wrong-list__badge">{typeLabel(w.type)}</span>
                    <span className="wrong-list__refs">
                      Stage {w.stageId} · Day {w.dayId} · id <code>{w.id}</code>
                    </span>
                  </div>
                  {w.type === 'word' ? (
                    <WordWrongBody note={w} pack={wordPacks[w.stageId]} />
                  ) : (
                    <ExpressionWrongBody
                      note={w}
                      stage={convPacks[w.stageId]}
                    />
                  )}
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
              문제 본문·선택지·정답은 콘텐츠 JSON에서 매번 불러와 표시하며, 저장 데이터에는 참조 id와 통계만 남습니다.
            </p>
          </>
        )}
      </section>
    </main>
  )
}
