/**
 * 단어 학습 Day 상세: 정적 JSON 기반 퀴즈 진행 및 결과 화면으로 이동 (상태만 React, 저장 없음)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchStageWordsByStageId,
  isContentFetchError,
  type RemoteContentState,
} from '../api/contentApi'
import { MVP_WORD_STAGE_ID } from '../constants/content'
import {
  WORD_CONTENT_BLANK_TOKEN,
  type StageWordsDaySection,
  type StageWordsFile,
  type WordContentEntry,
  type WordContentOption,
  type WordContentQuestion,
} from '../types/content'
import type {
  WordStudyQuizResultNavigateState,
  WordStudyWrongItemSummary,
} from '../types/wordStudySession'
import { isSequentialDayUnlocked } from '../utils/learningUnlock'
import {
  getDueWordReviewStatuses,
  isWordDayCompleted,
  loadUserProgress,
  persistStartWordDayWithCoinCost,
  persistRemoveSavedWord,
  persistUpsertSavedWord,
} from '../utils/storage'
import './WordStudyPage.css'

type QuizItem = {
  readonly word: WordContentEntry
  readonly question: WordContentQuestion
}

type WordDayCoinGateState = Readonly<
  | { status: 'checking'; stageId: number; dayId: number }
  | { status: 'ready'; stageId: number; dayId: number }
  | { status: 'blocked'; stageId: number; dayId: number; coins: number; cost: number }
>

type WordDayAttemptKeyRef = Readonly<{
  stageId: number
  dayId: number
  key: string
}>

function hasRenderableOptions(question: WordContentQuestion): boolean {
  if (!Array.isArray(question.options) || question.options.length === 0) return false
  return question.options.some((option) => option.id === question.correctOptionId)
}

function buildQuizItems(day: StageWordsDaySection): QuizItem[] {
  const items: QuizItem[] = []
  for (const word of day.words) {
    for (const question of word.questions) {
      if (!hasRenderableOptions(question)) continue
      items.push({ word, question })
    }
  }
  return items
}

/**
 * 복습 세션용 quizItems 구성기(Phase 11-7).
 *
 * 정책:
 * - Stage 전체 콘텐츠 pack 에서 `dueLemmaIds` 에 해당하는 단어만 찾는다.
 * - 단어 1개당 등록된 questions 를 모두 출제한다(`buildQuizItems` 구조 재사용).
 * - 콘텐츠에서 찾지 못한 lemmaId 는 조용히 제외한다(앱이 죽지 않게).
 * - 옵션 셔플은 일반 학습과 동일하게 렌더 시점에 적용된다.
 */
function buildReviewQuizItems(
  pack: StageWordsFile,
  dueLemmaIds: readonly string[],
): QuizItem[] {
  if (dueLemmaIds.length === 0) return []
  const wordByLemmaId = new Map<string, WordContentEntry>()
  for (const day of pack.days) {
    for (const w of day.words) {
      wordByLemmaId.set(w.id, w)
    }
  }
  const items: QuizItem[] = []
  for (const lemmaId of dueLemmaIds) {
    const word = wordByLemmaId.get(lemmaId)
    if (word === undefined) continue
    for (const question of word.questions) {
      if (!hasRenderableOptions(question)) continue
      items.push({ word, question })
    }
  }
  return items
}

function shuffleOptionsOnce(options: readonly WordContentOption[]): readonly WordContentOption[] {
  const shuffled = [...options]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = tmp
  }
  return shuffled
}

function questionTypeLabel(q: WordContentQuestion): string {
  if (q.type === 'word-to-meaning') return '영어 → 뜻'
  if (q.type === 'meaning-to-word') return '뜻 → 영어'
  return '예문 빈칸'
}

function snapshotForWrongPrompt(item: QuizItem): string {
  const q = item.question
  if (q.type === 'word-to-meaning') return q.promptEn
  if (q.type === 'meaning-to-word') return q.promptKo
  return fillBlankSentenceSource(q).replaceAll(WORD_CONTENT_BLANK_TOKEN, '____')
}

function toWrongSummary(item: QuizItem): WordStudyWrongItemSummary {
  return {
    questionId: item.question.id,
    lemmaId: item.word.id,
    wordHeadwordEn: item.word.word,
    meaningKo: item.word.meaning,
    questionTypeLabel: questionTypeLabel(item.question),
    snapshotPrompt: snapshotForWrongPrompt(item),
  }
}

function choiceInstruction(q: WordContentQuestion): string {
  if (q.type === 'word-to-meaning') return '한국어 뜻을 고르세요'
  if (q.type === 'meaning-to-word') return '영어 단어를 고르세요'
  return '빈칸에 알맞은 영어 단어를 고르세요'
}

function fillBlankSentenceSource(q: WordContentQuestion & { type: 'fill-blank' }): string {
  const custom = q.blankSentence?.trim()
  return custom && custom.length > 0 ? custom : q.templateEn
}

function renderBlankSentence(
  sentence: string,
  filled: boolean,
  answerEn: string
): ReactNode {
  if (!sentence.includes(WORD_CONTENT_BLANK_TOKEN)) {
    return <p className="word-study__prompt-block">{sentence}</p>
  }
  const [head, ...rest] = sentence.split(WORD_CONTENT_BLANK_TOKEN)
  const tail = rest.join(WORD_CONTENT_BLANK_TOKEN)
  const slot = filled ? (
    <span className="word-study__blank-slot word-study__blank-slot--filled">{answerEn}</span>
  ) : (
    <span className="word-study__blank-slot" aria-label="빈칸" />
  )
  return (
    <p className="word-study__prompt-block word-study__prompt-block--blank">
      {head}
      {slot}
      {tail}
    </p>
  )
}

function renderQuestionStem(
  word: WordContentEntry,
  q: WordContentQuestion,
  revealed: boolean,
  correctAnswerText: string
): ReactNode {
  switch (q.type) {
    case 'word-to-meaning':
      return (
        <>
          <p className="word-study__instruction">영어 단어의 뜻으로 알맞은 것을 고르세요.</p>
          <p className="word-study__prompt word-study__prompt--en-headword" lang="en">
            {q.promptEn}
          </p>
        </>
      )
    case 'meaning-to-word':
      return (
        <>
          <p className="word-study__instruction">설명에 맞는 영어 단어를 고르세요.</p>
          <p className="word-study__prompt word-study__prompt--ko-meaning" lang="ko">
            {q.promptKo}
          </p>
        </>
      )
    case 'fill-blank': {
      const sentence = fillBlankSentenceSource(q)
      return (
        <>
          <p className="word-study__instruction">
            빈칸에 들어갈 단어를 아래 선택지에서 고르세요.
          </p>
          {renderBlankSentence(sentence, revealed, correctAnswerText)}
          <p className="word-study__example-note" lang="ko">
            <span className="word-study__example-note-label">교재 예문</span>{' '}
            <span className="word-study__example-note-en" lang="en">
              {word.exampleSentence}
            </span>
          </p>
          <p className="word-study__example-note word-study__example-note-trans" lang="ko">
            {word.exampleMeaning}
          </p>
        </>
      )
    }
  }
}

function parseDayIdParam(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function generateWordDayAttemptKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

type ReviewSessionState = Readonly<{
  dueLemmaIds: readonly string[]
  currentWordDayId: number
}>

type BookmarkFeedback = Readonly<{
  message: string
  tone: 'saved' | 'removed'
  nonce: number
}>

export default function WordStudyDayDetailPage() {
  const { dayId: dayIdParam } = useParams<{ dayId: string }>()
  const navigate = useNavigate()
  const isReviewMode = dayIdParam === 'review'
  const dayNum = isReviewMode ? null : parseDayIdParam(dayIdParam)

  const [packState, setPackState] = useState<RemoteContentState<Awaited<ReturnType<typeof fetchStageWordsByStageId>>>>({
    status: 'loading',
  })

  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  /** 결과 화면으로 넘길 오답 목록 (`navigate` 시 최신 목록 확보용) */
  const wrongItemsRef = useRef<WordStudyWrongItemSummary[]>([])
  const wordDayAttemptRef = useRef<WordDayAttemptKeyRef | null>(null)
  const [coinGate, setCoinGate] = useState<WordDayCoinGateState>(() => ({
    status: 'checking',
    stageId: MVP_WORD_STAGE_ID,
    dayId: dayNum ?? 0,
  }))
  const [reviewSession, setReviewSession] = useState<ReviewSessionState | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    fetchStageWordsByStageId(MVP_WORD_STAGE_ID)
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

  const daySection = useMemo((): StageWordsDaySection | null => {
    if (packState.status !== 'success' || dayNum === null) return null
    const found = packState.data.days.find((d) => d.dayId === dayNum)
    return found ?? null
  }, [packState, dayNum])

  useEffect(() => {
    if (isReviewMode) return
    if (packState.status !== 'success' || dayNum === null || daySection === null) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const sortedIds = [...packState.data.days]
        .map((d) => d.dayId)
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b)
      const p = loadUserProgress()
      const completed = new Set<number>()
      for (const d of p.completedWordDays) {
        if (d.stageId === MVP_WORD_STAGE_ID) completed.add(d.dayId)
      }
      const isCompletedWordDay = isWordDayCompleted(p, MVP_WORD_STAGE_ID, dayNum)
      if (!isCompletedWordDay && !isSequentialDayUnlocked(sortedIds, completed, dayNum)) {
        navigate('/word-study', { replace: true })
        return
      }

      if (isCompletedWordDay) {
        if (cancelled) return
        setCoinGate({ status: 'ready', stageId: MVP_WORD_STAGE_ID, dayId: dayNum })
        return
      }

      const existingAttempt = wordDayAttemptRef.current
      const attempt =
        existingAttempt !== null &&
        existingAttempt.stageId === MVP_WORD_STAGE_ID &&
        existingAttempt.dayId === dayNum
          ? existingAttempt
          : {
              stageId: MVP_WORD_STAGE_ID,
              dayId: dayNum,
              key: generateWordDayAttemptKey(),
            }
      wordDayAttemptRef.current = attempt

      const costRes = persistStartWordDayWithCoinCost(
        MVP_WORD_STAGE_ID,
        dayNum,
        attempt.key,
      )
      if (cancelled) return
      if (costRes.started) {
        setCoinGate({ status: 'ready', stageId: MVP_WORD_STAGE_ID, dayId: dayNum })
      } else {
        setCoinGate({
          status: 'blocked',
          stageId: MVP_WORD_STAGE_ID,
          dayId: dayNum,
          coins: costRes.coins,
          cost: costRes.cost,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [isReviewMode, packState, dayNum, daySection, navigate])

  useEffect(() => {
    if (!isReviewMode) return
    if (reviewSession !== null) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const p = loadUserProgress()
      const currentWordDayId = p.completedWordDays.reduce(
        (max, c) =>
          c.stageId === MVP_WORD_STAGE_ID && c.dayId > max ? c.dayId : max,
        0,
      )
      const dueLemmaIds = getDueWordReviewStatuses(p, currentWordDayId).map(
        (s) => s.lemmaId,
      )
      setReviewSession({ dueLemmaIds, currentWordDayId })
    })
    return () => {
      cancelled = true
    }
  }, [isReviewMode, reviewSession])

  const quizItems = useMemo(() => {
    if (isReviewMode) {
      if (packState.status !== 'success' || reviewSession === null) {
        return [] as QuizItem[]
      }
      return buildReviewQuizItems(packState.data, reviewSession.dueLemmaIds)
    }
    return daySection ? buildQuizItems(daySection) : []
  }, [isReviewMode, packState, reviewSession, daySection])

  const bookmarkLemmaId = useMemo((): string | null => {
    if (packState.status !== 'success' || dayNum === null) return null
    if (quizItems.length === 0) return null
    if (questionIndex < 0 || questionIndex >= quizItems.length) return null
    return quizItems[questionIndex]!.word.id
  }, [packState.status, dayNum, quizItems, questionIndex])

  const [wordInVocab, setWordInVocab] = useState(false)
  const [bookmarkFeedback, setBookmarkFeedback] =
    useState<BookmarkFeedback | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      if (bookmarkLemmaId === null) {
        setWordInVocab(false)
        return
      }
      const p = loadUserProgress()
      setWordInVocab(p.savedWords.some((w) => w.lemmaId === bookmarkLemmaId))
    })
    return () => {
      cancelled = true
    }
  }, [bookmarkLemmaId])

  useEffect(() => {
    if (bookmarkFeedback === null) return
    const id = window.setTimeout(() => {
      setBookmarkFeedback((current) =>
        current?.nonce === bookmarkFeedback.nonce ? null : current,
      )
    }, 1400)
    return () => window.clearTimeout(id)
  }, [bookmarkFeedback])

  const resetQuestionLocalState = useCallback(() => {
    setSelectedOptionId(null)
    setRevealed(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      resetQuestionLocalState()
      setQuestionIndex(0)
      setCorrectCount(0)
      setWrongCount(0)
      wrongItemsRef.current = []
    })
    return () => {
      cancelled = true
    }
  }, [dayNum, daySection, reviewSession, resetQuestionLocalState])

  const current = quizItems[questionIndex]
  const total = quizItems.length
  const isLast = questionIndex >= total - 1
  const displayOptions = useMemo(
    () => (current === undefined ? [] : shuffleOptionsOnce(current.question.options)),
    [current],
  )

  const resultHref = isReviewMode
    ? '/word-study/review/result'
    : dayIdParam !== undefined && dayIdParam !== ''
      ? `/word-study/${dayIdParam}/result`
      : '/word-study'

  const dayLabel = isReviewMode
    ? '단어 학습 · 복습'
    : dayNum !== null
      ? `Stage ${MVP_WORD_STAGE_ID} · Day ${dayNum}`
      : 'Stage ? · Day ?'
  const headline = isReviewMode
    ? '이번 Day 복습'
    : (daySection?.titleKo ??
      (dayNum === null ? '알 수 없는 Day' : '이 Day 콘텐츠를 찾지 못했습니다'))

  const handlePrimaryAction = () => {
    if (current === undefined) return

    if (!revealed) {
      if (selectedOptionId === null) return
      const ok = selectedOptionId === current.question.correctOptionId
      setRevealed(true)
      if (ok) setCorrectCount((c) => c + 1)
      else {
        setWrongCount((w) => w + 1)
        wrongItemsRef.current = [...wrongItemsRef.current, toWrongSummary(current)]
      }
      return
    }

    if (isLast) {
      const persistNonce =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const stageDayIds: readonly number[] = isReviewMode
        ? []
        : packState.status === 'success'
          ? packState.data.days
              .map((d) => d.dayId)
              .filter((id): id is number => Number.isFinite(id))
          : []
      const navState: WordStudyQuizResultNavigateState = {
        correctCount,
        wrongCount,
        answeredLemmaIds: quizItems.map((item) => item.word.id),
        totalQuestions: total,
        wrongItems: [...wrongItemsRef.current],
        persistNonce,
        dayWordsCount: isReviewMode ? 0 : (daySection?.words.length ?? 0),
        stageDayIds,
        mode: isReviewMode ? 'word-review' : 'word-day',
        reviewCurrentWordDayId: isReviewMode
          ? reviewSession?.currentWordDayId
          : undefined,
      }
      navigate(resultHref, { state: navState })
      return
    }

    setQuestionIndex((i) => i + 1)
    resetQuestionLocalState()
  }

  if (!isReviewMode && dayNum === null) {
    return (
      <main className="word-study">
        <p className="word-study__muted">Day 번호가 올바르지 않습니다.</p>
        <Link to="/word-study" className="word-study__result-link">
          Day 목록으로
        </Link>
      </main>
    )
  }

  if (packState.status === 'idle' || packState.status === 'loading') {
    return (
      <main className="word-study">
        <p className="word-study__eyebrow">{dayLabel}</p>
        <p className="word-study__muted">단어 세트 불러오는 중…</p>
      </main>
    )
  }

  if (packState.status === 'error') {
    const msg = isContentFetchError(packState.error)
      ? packState.error.message
      : packState.error.message || '불러오기에 실패했습니다.'
    return (
      <main className="word-study">
        <p className="word-study__muted">{msg}</p>
        <Link to="/word-study" className="word-study__result-link">
          Day 목록으로
        </Link>
      </main>
    )
  }

  if (isReviewMode) {
    if (reviewSession === null) {
      return (
        <main className="word-study word-study--review">
          <p className="word-study__eyebrow">{dayLabel}</p>
          <h1 className="word-study__title">{headline}</h1>
          <p className="word-study__muted">복습 대상을 불러오는 중입니다…</p>
        </main>
      )
    }
    if (quizItems.length === 0) {
      return (
        <main className="word-study word-study--review">
          <p className="word-study__eyebrow">{dayLabel}</p>
          <h1 className="word-study__title">{headline}</h1>
          <p className="word-study__muted">
            현재 Word Day {reviewSession.currentWordDayId} 기준 복습할 단어가
            없습니다.
          </p>
          <Link to="/word-study" className="word-study__result-link">
            Day 목록으로
          </Link>
        </main>
      )
    }
  }

  if (!isReviewMode && (daySection === null || quizItems.length === 0)) {
    return (
      <main className="word-study">
        <p className="word-study__eyebrow">{dayLabel}</p>
        <h1 className="word-study__title">{headline}</h1>
        <p className="word-study__muted">이 Day에 필요한 문제 데이터가 없습니다.</p>
        <Link to="/word-study" className="word-study__result-link">
          Day 목록으로
        </Link>
      </main>
    )
  }

  const currentCoinGate =
    coinGate.stageId === MVP_WORD_STAGE_ID && coinGate.dayId === (dayNum ?? 0)
      ? coinGate
      : ({
          status: 'checking',
          stageId: MVP_WORD_STAGE_ID,
          dayId: dayNum ?? 0,
        } as const)

  if (!isReviewMode && currentCoinGate.status === 'checking') {
    return (
      <main className="word-study">
        <p className="word-study__eyebrow">{dayLabel}</p>
        <h1 className="word-study__title">{headline}</h1>
        <p className="word-study__muted">학습 준비 중입니다.</p>
      </main>
    )
  }

  if (!isReviewMode && currentCoinGate.status === 'blocked') {
    return (
      <main className="word-study">
        <p className="word-study__eyebrow">{dayLabel}</p>
        <h1 className="word-study__title">{headline}</h1>
        <section className="ui-card ui-card--dashboard word-study__coin-gate">
          <h2 className="ui-card__section-heading">코인이 부족합니다</h2>
          <p className="ui-card__body word-study__coin-gate-copy">
            이 Day를 시작하려면 {currentCoinGate.cost}코인이 필요합니다. 현재 보유
            코인은 {currentCoinGate.coins}코인입니다.
          </p>
          <p className="ui-card__body word-study__coin-gate-copy">
            홈에서 오늘의 코인을 받은 뒤 다시 시작해 주세요.
          </p>
          <div className="word-study__coin-gate-actions">
            <Link to="/home" className="ui-btn ui-btn--primary ui-btn--block">
              홈에서 코인 받기
            </Link>
            <Link to="/word-study" className="ui-btn ui-btn--ghost ui-btn--block">
              Day 목록으로
            </Link>
          </div>
        </section>
      </main>
    )
  }

  const q = current!.question
  const word = current!.word
  const correctAnswerText = q.options.find((o) => o.id === q.correctOptionId)?.text ?? ''
  const primaryDisabled = !revealed && selectedOptionId === null

  const progressLabel = `문항 ${questionIndex + 1} / ${total}`

  const feedbackClass =
    revealed && selectedOptionId !== null && selectedOptionId === q.correctOptionId
      ? ' word-study__feedback--correct'
      : revealed
        ? ' word-study__feedback--incorrect'
        : ''

  function choiceModifier(optionId: string): string {
    if (!revealed) return selectedOptionId === optionId ? ' word-study__choice--picked' : ''
    const isCorrectChoice = optionId === q.correctOptionId
    const isWrongPick = selectedOptionId === optionId && optionId !== q.correctOptionId
    if (isCorrectChoice) return ' word-study__choice--correct'
    if (isWrongPick) return ' word-study__choice--incorrect'
    return ''
  }

  return (
    <main className="word-study">
      <div className="word-study__title-block">
        <p className="word-study__eyebrow">{dayLabel}</p>
        <h1 className="word-study__title">{headline}</h1>
        <p className="word-study__progress">{progressLabel}</p>
      </div>

      {isReviewMode ? (
        <p className="word-study__muted">
          현재 Word Day {reviewSession?.currentWordDayId ?? 0} 기준 복습 세션입니다.
        </p>
      ) : daySection?.descriptionKo !== undefined ? (
        <p className="word-study__muted">{daySection.descriptionKo}</p>
      ) : null}

      <section
        className="ui-card ui-card--dashboard word-study__focus-panel"
        aria-labelledby="word-study-card-label"
      >
        <div className="word-study__q-head">
          <h2 id="word-study-card-label" className="ui-card__section-heading word-study__q-title">
            문제{' '}
            <span className="word-study__type-chip">{questionTypeLabel(q)}</span>
          </h2>
          <button
            type="button"
            className={`word-study__bookmark${wordInVocab ? ' word-study__bookmark--on' : ''}`}
            aria-pressed={wordInVocab}
            aria-label={
              bookmarkLemmaId === null
                ? '단어 식별 없음'
                : wordInVocab
                  ? '단어장에서 삭제'
                  : '단어장에 저장'
            }
            disabled={bookmarkLemmaId === null}
            onClick={() => {
              if (bookmarkLemmaId === null || dayNum === null) return
              if (wordInVocab) {
                persistRemoveSavedWord(bookmarkLemmaId)
                setWordInVocab(false)
                setBookmarkFeedback({
                  message: '단어장에서 삭제했어요',
                  tone: 'removed',
                  nonce: Date.now(),
                })
              } else {
                persistUpsertSavedWord(bookmarkLemmaId, MVP_WORD_STAGE_ID, dayNum)
                setWordInVocab(true)
                setBookmarkFeedback({
                  message: '단어장에 추가했어요',
                  tone: 'saved',
                  nonce: Date.now(),
                })
              }
            }}
          >
            <span aria-hidden className="word-study__bookmark-icon">
              {wordInVocab ? '★' : '☆'}
            </span>
          </button>
          {bookmarkFeedback !== null ? (
            <p
              className={`word-study__bookmark-toast word-study__bookmark-toast--${bookmarkFeedback.tone}`}
              role="status"
              aria-live="polite"
            >
              {bookmarkFeedback.message}
            </p>
          ) : null}
        </div>
        <div className="ui-card__body word-study__stem">{renderQuestionStem(word, q, revealed, correctAnswerText)}</div>

        <div className="word-study__choices-panel" aria-labelledby="word-study-choices-label">
          <h2 id="word-study-choices-label" className="word-study__choices-heading">
            <span className="word-study__choices-title">선택지</span>
            <span className="word-study__choice-hint">{choiceInstruction(q)}</span>
          </h2>
          <div className="word-study__choices" role="group" aria-label="객관식 선택지">
            {displayOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={revealed}
                className={`ui-btn ui-btn--secondary ui-btn--align-start word-study__choice${choiceModifier(opt.id)}`}
                onClick={() => {
                  if (!revealed) setSelectedOptionId(opt.id)
                }}
              >
                ({opt.id.toUpperCase()}) {opt.text}
              </button>
            ))}
          </div>
        </div>

        {revealed ? (
          <div className={`word-study__feedback${feedbackClass}`} role="status">
            {selectedOptionId === q.correctOptionId ? (
              <p className="word-study__feedback-title">정답입니다.</p>
            ) : (
              <>
                <p className="word-study__feedback-title">오답입니다.</p>
                <p className="word-study__feedback-detail">
                  정답: ({q.correctOptionId.toUpperCase()}){' '}
                  {q.options.find((o) => o.id === q.correctOptionId)?.text}
                </p>
              </>
            )}
            <div className="word-study__explanation-block">
              <p className="word-study__feedback-label">해설</p>
              <p className="word-study__explanation">{word.explanation}</p>
            </div>
            <p className="word-study__word-meta">
              <strong>{word.word}</strong> — {word.meaning}
            </p>
            {q.type === 'fill-blank' ? null : (
              <>
                <p className="word-study__example-en">{word.exampleSentence}</p>
                <p className="word-study__example-ko">{word.exampleMeaning}</p>
              </>
            )}
          </div>
        ) : null}

        <button
          type="button"
          disabled={primaryDisabled}
          className="ui-btn ui-btn--primary ui-btn--block word-study__submit"
          onClick={handlePrimaryAction}
        >
          {!revealed ? '정답 확인' : isLast ? '결과 보기' : '다음 문제'}
        </button>
      </section>

      <p className="word-study__footer-note word-study__score-inline">
        누적 · 정답 {correctCount} · 오답 {wrongCount}
      </p>
    </main>
  )
}
