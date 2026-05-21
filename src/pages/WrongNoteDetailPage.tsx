import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { APP_ROUTES } from '../constants/routes'
import type { StageWordsFile } from '../types/content'
import type { ConversationQuiz, ConversationStage } from '../types/conversation'
import type { WrongNoteRef, WrongNoteType } from '../types/user-progress'
import {
  findExpressionQuiz,
  findKeyExpression,
  findWordQuestionWithEntry,
  getCorrectOptionText,
  getWordQuestionPrompt,
  loadConversationStageCached,
  loadStageWordsCached,
} from '../utils/contentJoin'
import { loadUserProgress } from '../utils/storage'
import './WrongNotePage.css'

function asType(value: string | undefined): WrongNoteType | null {
  return value === 'word' || value === 'expression' ? value : null
}

function asNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function sumWordWrongCountForEntry(
  notes: readonly WrongNoteRef[],
  pack: StageWordsFile,
  stageId: number,
  dayId: number,
  entryId: string,
): number {
  return notes.reduce((sum, note) => {
    if (note.type !== 'word' || note.stageId !== stageId || note.dayId !== dayId) {
      return sum
    }
    const found = findWordQuestionWithEntry(pack, note.dayId, note.id)
    return found?.entry.id === entryId ? sum + note.wrongCount : sum
  }, 0)
}

function sumExpressionWrongCount(
  notes: readonly WrongNoteRef[],
  stage: ConversationStage,
  stageId: number,
  dayId: number,
  expressionId: string | undefined,
  fallbackQuizId: string,
): number {
  return notes.reduce((sum, note) => {
    if (note.type !== 'expression' || note.stageId !== stageId || note.dayId !== dayId) {
      return sum
    }
    const quiz = findExpressionQuiz(stage, note.dayId, note.id)
    const sameExpression =
      expressionId !== undefined
        ? quiz?.expressionId === expressionId
        : note.id === fallbackQuizId
    return sameExpression ? sum + note.wrongCount : sum
  }, 0)
}

export default function WrongNoteDetailPage() {
  const params = useParams()
  const type = asType(params.type)
  const stageId = asNumber(params.stageId)
  const dayId = asNumber(params.dayId)
  const itemId = params.itemId !== undefined ? decodeURIComponent(params.itemId) : null
  const progress = useMemo(() => loadUserProgress(), [])
  const note = useMemo(
    () =>
      type !== null && stageId !== null && dayId !== null && itemId !== null
        ? progress.wrongNotes.find(
            (w) => w.type === type && w.stageId === stageId && w.dayId === dayId && w.id === itemId,
          ) ?? null
        : null,
    [dayId, itemId, progress.wrongNotes, stageId, type],
  )
  const [wordPack, setWordPack] = useState<StageWordsFile | null | undefined>(undefined)
  const [conversationStage, setConversationStage] = useState<ConversationStage | null | undefined>(undefined)

  useEffect(() => {
    if (type !== 'word' || stageId === null) return
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
  }, [stageId, type])

  useEffect(() => {
    if (type !== 'expression' || stageId === null) return
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
  }, [stageId, type])

  if (type === null || stageId === null || dayId === null || itemId === null) {
    return <WrongDetailShell message="오답 정보를 확인할 수 없습니다." />
  }
  if (note === null) return <WrongDetailShell message="오답노트에서 항목을 찾지 못했습니다." />

  if (type === 'word') {
    if (wordPack === undefined) return <WrongDetailShell message="불러오는 중…" />
    if (wordPack === null) return <WrongDetailShell message="문제를 찾지 못했습니다." />
    const found = findWordQuestionWithEntry(wordPack, dayId, itemId)
    if (found === null) return <WrongDetailShell message="문제를 찾지 못했습니다." />
    const correct = getCorrectOptionText(found.question.options, found.question.correctOptionId)
    const prompt = getWordQuestionPrompt(found.question)
    const wrongCount = sumWordWrongCountForEntry(
      progress.wrongNotes,
      wordPack,
      stageId,
      dayId,
      found.entry.id,
    )
    return (
      <main className="wrong-page">
        <Link className="wrong-detail__back" to={APP_ROUTES.wrongNote}>
          ← 오답노트
        </Link>
        <section className="ui-card ui-card--dashboard wrong-detail">
          <p className="wrong-detail__eyebrow">단어 오답</p>
          <h1 className="wrong-detail__title" lang="en">{found.entry.word}</h1>
          <p className="wrong-detail__meaning" lang="ko">{found.entry.meaning}</p>
          <DetailMeta
            stage={wordPack?.stageTitleKo ?? `Stage ${stageId}`}
            day={dayId}
            wrongCount={wrongCount}
            lastWrongAt={note.lastWrongAt}
          />
          <QuestionBlock prompt={prompt} correct={correct} />
          {found.entry.explanation !== '' && (
            <p className="wrong-detail__note">{found.entry.explanation}</p>
          )}
        </section>
      </main>
    )
  }

  if (conversationStage === undefined) return <WrongDetailShell message="불러오는 중…" />
  if (conversationStage === null) return <WrongDetailShell message="문제를 찾지 못했습니다." />
  const quiz = findExpressionQuiz(conversationStage, dayId, itemId)
  if (quiz === null) return <WrongDetailShell message="문제를 찾지 못했습니다." />
  const expression =
    quiz.expressionId !== undefined && conversationStage !== null
      ? findKeyExpression(conversationStage, dayId, quiz.expressionId)
      : null
  const correct = getCorrectOptionText(quiz.options, quiz.correctOptionId)
  const wrongCount = sumExpressionWrongCount(
    progress.wrongNotes,
    conversationStage,
    stageId,
    dayId,
    quiz.expressionId,
    itemId,
  )
  return (
    <main className="wrong-page">
      <Link className="wrong-detail__back" to={APP_ROUTES.wrongNote}>
        ← 오답노트
      </Link>
      <section className="ui-card ui-card--dashboard wrong-detail">
        <p className="wrong-detail__eyebrow">표현 오답</p>
        <h1 className="wrong-detail__title" lang="en">
          {expression?.expressionEn ?? quiz.promptEn ?? quiz.promptKo}
        </h1>
        <p className="wrong-detail__meaning" lang="ko">
          {expression?.expressionKo ?? quiz.promptKo}
        </p>
        <DetailMeta
          stage={conversationStage?.stageTitleKo ?? `Stage ${stageId}`}
          day={dayId}
          wrongCount={wrongCount}
          lastWrongAt={note.lastWrongAt}
        />
        <QuestionBlock prompt={quiz.promptKo} correct={correct} quiz={quiz} />
        {quiz.explanationKo !== undefined && quiz.explanationKo !== '' && (
          <p className="wrong-detail__note">{quiz.explanationKo}</p>
        )}
      </section>
    </main>
  )
}

function WrongDetailShell({ message }: { readonly message: string }) {
  return (
    <main className="wrong-page">
      <Link className="wrong-detail__back" to={APP_ROUTES.wrongNote}>
        ← 오답노트
      </Link>
      <section className="ui-card ui-card--dashboard wrong-detail">
        <h1 className="wrong-detail__title">오답 상세</h1>
        <p className="wrong-detail__muted">{message}</p>
      </section>
    </main>
  )
}

function DetailMeta({
  stage,
  day,
  wrongCount,
  lastWrongAt,
}: {
  readonly stage: string
  readonly day: number
  readonly wrongCount: number
  readonly lastWrongAt: string
}) {
  return (
    <dl className="wrong-detail__meta">
      <div>
        <dt>Stage</dt>
        <dd>{stage}</dd>
      </div>
      <div>
        <dt>Day</dt>
        <dd>{day}</dd>
      </div>
      <div>
        <dt>오답 횟수</dt>
        <dd>오답 {wrongCount}회</dd>
      </div>
      <div>
        <dt>마지막 오답</dt>
        <dd>
          <time dateTime={lastWrongAt}>{lastWrongAt.slice(0, 10)}</time>
        </dd>
      </div>
    </dl>
  )
}

function QuestionBlock({
  prompt,
  correct,
  quiz,
}: {
  readonly prompt: string
  readonly correct: string
  readonly quiz?: ConversationQuiz
}) {
  return (
    <div className="wrong-detail__question">
      <p className="wrong-detail__label">문제</p>
      <p className="wrong-detail__prompt">{prompt}</p>
      {quiz?.promptEn !== undefined && quiz.promptEn !== '' && (
        <p className="wrong-detail__prompt-en" lang="en">{quiz.promptEn}</p>
      )}
      {correct !== '' && (
        <>
          <p className="wrong-detail__label">정답</p>
          <p className="wrong-detail__answer">{correct}</p>
        </>
      )}
    </div>
  )
}
