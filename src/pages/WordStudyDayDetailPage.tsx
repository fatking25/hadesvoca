/**
 * ?⑥뼱 ?숈뒿 Day ?곸꽭: ?뺤쟻 JSON 湲곕컲 ?댁쫰 吏꾪뻾 諛?寃곌낵 ?붾㈃?쇰줈 ?대룞 (?곹깭留?React, ????놁쓬)
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
  APP_ROUTES,
  wordStudyDayResultPath,
} from '../constants/routes'
import { WordStudyCoinGate } from './wordStudy/WordStudyCoinGate'
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
import { createSessionNonce, createUiRevision } from '../utils/id'
import { shuffleReadonly } from '../utils/random'
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
 * 蹂듭뒿 ?몄뀡??quizItems 援ъ꽦湲?Phase 11-7).
 *
 * ?뺤콉:
 * - Stage ?꾩껜 肄섑뀗痢?pack ?먯꽌 `dueLemmaIds` ???대떦?섎뒗 ?⑥뼱留?李얜뒗??
 * - ?⑥뼱 1媛쒕떦 ?깅줉??questions 瑜?紐⑤몢 異쒖젣?쒕떎(`buildQuizItems` 援ъ“ ?ъ궗??.
 * - 肄섑뀗痢좎뿉??李얠? 紐삵븳 lemmaId ??議곗슜???쒖쇅?쒕떎(?깆씠 二쎌? ?딄쾶).
 * - ?듭뀡 ?뷀뵆? ?쇰컲 ?숈뒿怨??숈씪?섍쾶 ?뚮뜑 ?쒖젏???곸슜?쒕떎.
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
  return shuffleReadonly(options)
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
  if (q.type === 'word-to-meaning') return '?쒓뎅???살쓣 怨좊Ⅴ?몄슂'
  if (q.type === 'meaning-to-word') return '?곸뼱 ?⑥뼱瑜?怨좊Ⅴ?몄슂'
  return '鍮덉뭏???뚮쭪? ?곸뼱 ?⑥뼱瑜?怨좊Ⅴ?몄슂'
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
    <span className="word-study__blank-slot" aria-label="鍮덉뭏" />
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
          <p className="word-study__instruction">?곸뼱 ?⑥뼱???살쑝濡??뚮쭪? 寃껋쓣 怨좊Ⅴ?몄슂.</p>
          <p className="word-study__prompt word-study__prompt--en-headword" lang="en">
            {q.promptEn}
          </p>
        </>
      )
    case 'meaning-to-word':
      return (
        <>
          <p className="word-study__instruction">?ㅻ챸??留욌뒗 ?곸뼱 ?⑥뼱瑜?怨좊Ⅴ?몄슂.</p>
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
            鍮덉뭏???ㅼ뼱媛??⑥뼱瑜??꾨옒 ?좏깮吏?먯꽌 怨좊Ⅴ?몄슂.
          </p>
          {renderBlankSentence(sentence, revealed, correctAnswerText)}
          <p className="word-study__example-note" lang="ko">
            <span className="word-study__example-note-label">援먯옱 ?덈Ц</span>{' '}
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
  return createSessionNonce('word-day-attempt')
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
  /** 寃곌낵 ?붾㈃?쇰줈 ?섍만 ?ㅻ떟 紐⑸줉 (`navigate` ??理쒖떊 紐⑸줉 ?뺣낫?? */
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
        navigate(APP_ROUTES.wordStudy, { replace: true })
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
    ? APP_ROUTES.wordStudyReviewResult
    : dayIdParam !== undefined && dayIdParam !== ''
      ? wordStudyDayResultPath(dayIdParam)
      : APP_ROUTES.wordStudy

  const dayLabel = isReviewMode
    ? '단어 학습 · 복습'
    : dayNum !== null
      ? `Stage ${MVP_WORD_STAGE_ID} · Day ${dayNum}`
      : 'Stage ? · Day ?'
  const headline = isReviewMode
    ? '이번 Day 복습'
    : (daySection?.titleKo ??
      (dayNum === null ? '알 수 없는 Day' : '이 Day 콘텐츠를 찾을 수 없습니다.'))

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
      const persistNonce = createSessionNonce('word-study-result')
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

  const handleOptionSelect = (optionId: string) => {
    if (current === undefined || revealed) return
    setSelectedOptionId(optionId)
    const ok = optionId === current.question.correctOptionId
    setRevealed(true)
    if (ok) setCorrectCount((c) => c + 1)
    else {
      setWrongCount((w) => w + 1)
      wrongItemsRef.current = [...wrongItemsRef.current, toWrongSummary(current)]
    }
  }

  if (!isReviewMode && dayNum === null) {
    return (
      <main className="word-study">
        <p className="word-study__muted">Day 踰덊샇媛 ?щ컮瑜댁? ?딆뒿?덈떎.</p>
        <Link to={APP_ROUTES.wordStudy} className="word-study__result-link">
          Day 紐⑸줉?쇰줈
        </Link>
      </main>
    )
  }

  if (packState.status === 'idle' || packState.status === 'loading') {
    return (
      <main className="word-study">
        <p className="word-study__eyebrow">{dayLabel}</p>
        <p className="word-study__muted">단어 콘텐츠를 불러오는 중입니다.</p>
      </main>
    )
  }

  if (packState.status === 'error') {
    const msg = isContentFetchError(packState.error)
      ? packState.error.message
      : packState.error.message || '遺덈윭?ㅺ린???ㅽ뙣?덉뒿?덈떎.'
    return (
      <main className="word-study">
        <p className="word-study__muted">{msg}</p>
        <Link to={APP_ROUTES.wordStudy} className="word-study__result-link">
          Day 紐⑸줉?쇰줈
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
          <p className="word-study__muted">복습 대상을 불러오는 중입니다.</p>
        </main>
      )
    }
    if (quizItems.length === 0) {
      return (
        <main className="word-study word-study--review">
          <p className="word-study__eyebrow">{dayLabel}</p>
          <h1 className="word-study__title">{headline}</h1>
          <p className="word-study__muted">
            ?꾩옱 Word Day {reviewSession.currentWordDayId} 湲곗? 蹂듭뒿???⑥뼱媛
            ?놁뒿?덈떎.
          </p>
          <Link to={APP_ROUTES.wordStudy} className="word-study__result-link">
            Day 紐⑸줉?쇰줈
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
        <p className="word-study__muted">??Day???꾩슂??臾몄젣 ?곗씠?곌? ?놁뒿?덈떎.</p>
        <Link to={APP_ROUTES.wordStudy} className="word-study__result-link">
          Day 紐⑸줉?쇰줈
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
        <p className="word-study__muted">?숈뒿 以鍮?以묒엯?덈떎.</p>
      </main>
    )
  }

  if (!isReviewMode && currentCoinGate.status === 'blocked') {
    return (
      <WordStudyCoinGate
        dayLabel={dayLabel}
        headline={headline}
        coins={currentCoinGate.coins}
        cost={currentCoinGate.cost}
      />
    )
  }

  const q = current!.question
  const word = current!.word
  const correctAnswerText = q.options.find((o) => o.id === q.correctOptionId)?.text ?? ''

  const progressLabel = `臾명빆 ${questionIndex + 1} / ${total}`
  const answeredCorrectly = selectedOptionId === q.correctOptionId

  const feedbackClass =
    revealed && selectedOptionId !== null && answeredCorrectly
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
          ?꾩옱 Word Day {reviewSession?.currentWordDayId ?? 0} 湲곗? 蹂듭뒿 ?몄뀡?낅땲??
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
            臾몄젣{' '}
            <span className="word-study__type-chip">{questionTypeLabel(q)}</span>
          </h2>
          <button
            type="button"
            className={`word-study__bookmark${wordInVocab ? ' word-study__bookmark--on' : ''}`}
            aria-pressed={wordInVocab}
            aria-label={
              bookmarkLemmaId === null
                ? '저장할 단어 없음'
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
                  message: '단어장에서 삭제했어요.',
                  tone: 'removed',
                  nonce: createUiRevision(),
                })
              } else {
                persistUpsertSavedWord(bookmarkLemmaId, MVP_WORD_STAGE_ID, dayNum)
                setWordInVocab(true)
                setBookmarkFeedback({
                  message: '단어장에 추가했어요.',
                  tone: 'saved',
                  nonce: createUiRevision(),
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
            <span className="word-study__choices-title">?좏깮吏</span>
            <span className="word-study__choice-hint">{choiceInstruction(q)}</span>
          </h2>
          <div className="word-study__choices" role="group" aria-label="媛앷????좏깮吏">
            {displayOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={revealed}
                className={`ui-btn ui-btn--secondary ui-btn--align-start word-study__choice${choiceModifier(opt.id)}`}
                onClick={() => {
                  handleOptionSelect(opt.id)
                }}
              >
                ({opt.id.toUpperCase()}) {opt.text}
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="word-study__footer-note word-study__score-inline">
        ?꾩쟻 쨌 ?뺣떟 {correctCount} 쨌 ?ㅻ떟 {wrongCount}
      </p>

      {revealed ? (
        <div className="word-study__answer-overlay" role="dialog" aria-modal="true">
          <div className={`word-study__feedback${feedbackClass}`} role="status">
            {answeredCorrectly ? (
              <p className="word-study__feedback-title">?뺣떟?낅땲??</p>
            ) : (
              <>
                <p className="word-study__feedback-title">?ㅻ떟?낅땲??</p>
                <p className="word-study__feedback-detail">
                  ?뺣떟: ({q.correctOptionId.toUpperCase()}) {correctAnswerText}
                </p>
              </>
            )}
            <div className="word-study__explanation-block">
              <p className="word-study__feedback-label">?댁꽕</p>
              <p className="word-study__explanation">{word.explanation}</p>
            </div>
            <p className="word-study__word-meta">
              <strong>{word.word}</strong> ??{word.meaning}
            </p>
            {q.type === 'fill-blank' ? null : (
              <>
                <p className="word-study__example-en">{word.exampleSentence}</p>
                <p className="word-study__example-ko">{word.exampleMeaning}</p>
              </>
            )}
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--block word-study__submit"
              onClick={handlePrimaryAction}
            >
              {isLast ? '寃곌낵 蹂닿린' : '?ㅼ쓬 臾몄젣'}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
