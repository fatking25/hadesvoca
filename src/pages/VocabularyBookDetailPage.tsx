import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_ROUTES } from '../constants/routes'
import type { StageWordsFile, WordContentEntry } from '../types/content'
import type { ConversationKeyExpression, ConversationStage } from '../types/conversation'
import {
  findKeyExpression,
  findWordEntry,
  loadConversationStageCached,
  loadStageWordsCached,
} from '../utils/contentJoin'
import { loadUserProgress } from '../utils/storage'
import './VocabularyBookPage.css'

type DetailKind = 'word' | 'expression'

function asKind(value: string | undefined): DetailKind | null {
  return value === 'word' || value === 'expression' ? value : null
}

function asNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function VocabularyBookDetailPage() {
  const params = useParams()
  const kind = asKind(params.kind)
  const stageId = asNumber(params.stageId)
  const dayId = asNumber(params.dayId)
  const itemId = params.itemId !== undefined ? decodeURIComponent(params.itemId) : null
  const progress = useMemo(() => loadUserProgress(), [])
  const [wordPack, setWordPack] = useState<StageWordsFile | null | undefined>(undefined)
  const [conversationStage, setConversationStage] = useState<ConversationStage | null | undefined>(undefined)

  useEffect(() => {
    if (kind !== 'word' || stageId === null) return
    let cancelled = false
    loadStageWordsCached(stageId)
      .then((pack) => {
        if (!cancelled) setWordPack(pack)
      })
      .catch(() => {
        if (!cancelled) setWordPack(null)
      })
    return () => {
      cancelled = true
    }
  }, [kind, stageId])

  useEffect(() => {
    if (kind !== 'expression' || stageId === null) return
    let cancelled = false
    loadConversationStageCached(stageId)
      .then((stage) => {
        if (!cancelled) setConversationStage(stage)
      })
      .catch(() => {
        if (!cancelled) setConversationStage(null)
      })
    return () => {
      cancelled = true
    }
  }, [kind, stageId])

  if (kind === null || stageId === null || dayId === null || itemId === null) {
    return <DetailShell title="단어장 상세" message="항목 정보를 확인할 수 없습니다." />
  }

  if (kind === 'word') {
    if (wordPack === undefined) return <DetailShell title="단어 상세" message="불러오는 중…" />
    const entry = wordPack !== null ? findWordEntry(wordPack, dayId === 0 ? undefined : dayId, itemId) : null
    const wrongCount =
      progress.wordReviewStatuses.find(
        (status) => status.stageId === stageId && status.lemmaId === itemId,
      )?.wrongCount ?? 0
    return (
      <WordDetail
        entry={entry}
        stageTitle={wordPack?.stageTitleKo}
        stageId={stageId}
        dayId={dayId}
        wrongCount={wrongCount}
      />
    )
  }

  if (conversationStage === undefined) return <DetailShell title="표현 상세" message="불러오는 중…" />
  const expression =
    conversationStage !== null ? findKeyExpression(conversationStage, dayId, itemId) : null
  const wrongCount =
    progress.wrongNotes.find(
      (note) =>
        note.type === 'expression' &&
        note.stageId === stageId &&
        note.dayId === dayId &&
        note.id === itemId,
    )?.wrongCount ?? 0

  return (
    <ExpressionDetail
      expression={expression}
      stageTitle={conversationStage?.stageTitleKo}
      stageId={stageId}
      dayId={dayId}
      wrongCount={wrongCount}
    />
  )
}

function DetailShell({
  title,
  message,
}: {
  readonly title: string
  readonly message: string
}) {
  return (
    <main className="vocab-page">
      <Link className="vocab-detail__back" to={APP_ROUTES.vocabularyBook}>
        ← 단어장
      </Link>
      <section className="ui-card ui-card--dashboard vocab-detail">
        <h1 className="vocab-detail__title">{title}</h1>
        <p className="vocab-detail__muted">{message}</p>
      </section>
    </main>
  )
}

function WordDetail({
  entry,
  stageTitle,
  stageId,
  dayId,
  wrongCount,
}: {
  readonly entry: WordContentEntry | null
  readonly stageTitle: string | undefined
  readonly stageId: number
  readonly dayId: number
  readonly wrongCount: number
}) {
  if (entry === null) {
    return <DetailShell title="단어 상세" message="단어를 찾지 못했습니다." />
  }
  return (
    <main className="vocab-page">
      <Link className="vocab-detail__back" to={APP_ROUTES.vocabularyBook}>
        ← 단어장
      </Link>
      <section className="ui-card ui-card--dashboard vocab-detail">
        <p className="vocab-detail__eyebrow">단어</p>
        <h1 className="vocab-detail__title" lang="en">{entry.word}</h1>
        <p className="vocab-detail__meaning" lang="ko">{entry.meaning}</p>
        <dl className="vocab-detail__meta">
          <div>
            <dt>Stage</dt>
            <dd>{stageTitle ?? `Stage ${stageId}`}</dd>
          </div>
          <div>
            <dt>Day</dt>
            <dd>{dayId === 0 ? '미확인' : dayId}</dd>
          </div>
          <div>
            <dt>오답 횟수</dt>
            <dd>오답 {wrongCount}회</dd>
          </div>
        </dl>
        {entry.exampleSentence !== '' && (
          <p className="vocab-detail__example" lang="en">{entry.exampleSentence}</p>
        )}
        {entry.exampleMeaning !== '' && (
          <p className="vocab-detail__example-ko" lang="ko">{entry.exampleMeaning}</p>
        )}
        {entry.explanation !== '' && (
          <p className="vocab-detail__note">{entry.explanation}</p>
        )}
      </section>
    </main>
  )
}

function ExpressionDetail({
  expression,
  stageTitle,
  stageId,
  dayId,
  wrongCount,
}: {
  readonly expression: ConversationKeyExpression | null
  readonly stageTitle: string | undefined
  readonly stageId: number
  readonly dayId: number
  readonly wrongCount: number
}) {
  if (expression === null) {
    return <DetailShell title="표현 상세" message="표현을 찾지 못했습니다." />
  }
  return (
    <main className="vocab-page">
      <Link className="vocab-detail__back" to={APP_ROUTES.vocabularyBook}>
        ← 단어장
      </Link>
      <section className="ui-card ui-card--dashboard vocab-detail">
        <p className="vocab-detail__eyebrow">표현</p>
        <h1 className="vocab-detail__title" lang="en">{expression.expressionEn}</h1>
        <p className="vocab-detail__meaning" lang="ko">{expression.expressionKo}</p>
        <dl className="vocab-detail__meta">
          <div>
            <dt>Stage</dt>
            <dd>{stageTitle ?? `Stage ${stageId}`}</dd>
          </div>
          <div>
            <dt>Day</dt>
            <dd>{dayId}</dd>
          </div>
          <div>
            <dt>오답 횟수</dt>
            <dd>오답 {wrongCount}회</dd>
          </div>
        </dl>
        {expression.tipKo !== undefined && expression.tipKo !== '' && (
          <p className="vocab-detail__note">{expression.tipKo}</p>
        )}
      </section>
    </main>
  )
}
