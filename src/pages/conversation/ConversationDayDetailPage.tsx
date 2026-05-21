/**
 * 실전 회화 Day 상세: JSON 로드 후 컷씬 → 나레이션 → 대화 → 퀴즈 → 표현 스텝 진행, 마지막에 결과 화면으로 이동합니다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getConversationStage,
  isContentFetchError,
  resolvePublicUrl,
  type RemoteContentState,
} from '../../api/contentApi'
import {
  FALLBACK_CONVERSATION_CUTSCENE_PATH,
  MVP_CONVERSATION_STAGE_ID,
} from '../../constants/content'
import {
  conversationStageDayResultPath,
  conversationStagePath,
} from '../../constants/routes'
import type { ConversationDayResultLocationState } from '../../context/conversationSessionCore'
import type {
  ConversationDay,
  ConversationDialogueLine,
  ConversationQuizOption,
  ConversationQuiz,
  ConversationSceneImageKey,
  ConversationStage,
} from '../../types/conversation'
import { isSequentialDayUnlocked } from '../../utils/learningUnlock'
import { createSessionNonce } from '../../utils/id'
import {
  isConversationDayCompletedPersisted,
  loadUserProgress,
  persistRemoveSavedExpression,
  persistUpsertSavedExpression,
} from '../../utils/storage'
import '../ConversationDayDetailPage.css'

type FlowStep = 'cutscene' | 'narration' | 'dialogue' | 'quiz' | 'expressions'

const FLOW_STEPS: readonly FlowStep[] = [
  'cutscene',
  'narration',
  'dialogue',
  'quiz',
  'expressions',
] as const

function stepIndex(step: FlowStep): number {
  return FLOW_STEPS.indexOf(step)
}

function parseDayId(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function parseStageId(raw: string | undefined): number {
  if (raw === undefined || raw === '') return MVP_CONVERSATION_STAGE_ID
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : MVP_CONVERSATION_STAGE_ID
}

/** 중앙 장면 설명: `sceneDescriptionKo` 우선, 없으면 `descriptionKo` */
function resolvedSceneDescription(d: ConversationDay): string {
  const s = d.sceneDescriptionKo?.trim()
  if (s !== undefined && s.length > 0) return s
  const t = d.descriptionKo?.trim()
  return t !== undefined && t.length > 0 ? t : ''
}

type ConversationSceneImageView = Readonly<{
  src: string
  alt: string
}>

function sceneImageKeyForStep(step: FlowStep): ConversationSceneImageKey | null {
  if (step === 'narration') return 'intro'
  if (step === 'dialogue') return 'dialogue'
  if (step === 'quiz' || step === 'expressions') return 'review'
  return null
}

function fallbackSceneAlt(d: ConversationDay): string {
  const title = d.titleKo.trim()
  const desc = d.descriptionKo?.trim()
  return desc !== undefined && desc.length > 0 ? `${title} - ${desc}` : title
}

function getCurrentConversationSceneImage(
  d: ConversationDay,
  step: FlowStep,
): ConversationSceneImageView {
  const sceneKey = sceneImageKeyForStep(step)
  const sceneImage = sceneKey !== null ? d.sceneImages?.[sceneKey] : undefined
  const sceneImagePath = sceneImage?.imagePath.trim()
  const cutsceneImagePath = d.cutsceneImagePath?.trim()
  const imagePath =
    sceneImagePath !== undefined && sceneImagePath.length > 0
      ? sceneImagePath
      : cutsceneImagePath !== undefined && cutsceneImagePath.length > 0
        ? cutsceneImagePath
        : FALLBACK_CONVERSATION_CUTSCENE_PATH
  const sceneAlt = sceneImage?.altKo?.trim()
  return {
    src: resolvePublicUrl(imagePath),
    alt:
      sceneAlt !== undefined && sceneAlt.length > 0
        ? sceneAlt
        : fallbackSceneAlt(d),
  }
}

function dialogueSpeakerSlot(line: ConversationDialogueLine): string {
  const ko = line.speakerLabelKo?.trim()
  if (ko !== undefined && ko.length > 0) return ko
  const id = line.speakerId?.trim()
  if (id !== undefined && id.length > 0) return id
  return 'Speaker'
}

type SentenceBuilderToken = Readonly<{
  id: string
  text: string
}>

function normalizeSentenceBuilderAnswer(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,])/g, '$1')
    .toLocaleLowerCase('en-US')
}

function splitSentenceBuilderTokens(text: string): readonly string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function getCorrectQuizOptionText(q: ConversationQuiz): string {
  return q.options.find((opt) => opt.id === q.correctOptionId)?.text ?? ''
}

function stableShuffleValue(seed: string): number {
  let n = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    n ^= seed.charCodeAt(i)
    n = Math.imul(n, 16777619)
  }
  return n >>> 0
}

function stableShuffleBySeed<T>(
  items: readonly T[],
  seed: string,
  itemSeed: (item: T, index: number) => string,
): readonly T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      order: stableShuffleValue(`${seed}:${index}:${itemSeed(item, index)}`),
    }))
    .sort((a, b) => (a.order === b.order ? a.index - b.index : a.order - b.order))
    .map(({ item }) => item)
}

function shuffledQuizOptions(
  options: readonly ConversationQuizOption[],
  seed: string,
): readonly ConversationQuizOption[] {
  const shuffled = stableShuffleBySeed(options, seed, (opt) => `${opt.id}:${opt.text}`)
  if (shuffled.length <= 1) return shuffled
  const unchanged = shuffled.every((opt, index) => opt.id === options[index]?.id)
  if (!unchanged) return shuffled
  return [...shuffled.slice(1), shuffled[0]!]
}

function extractBacktickExpression(text: string | undefined): string | null {
  if (text === undefined) return null
  const matched = text.match(/`([^`]+)`/)
  const extracted = matched?.[1]?.trim()
  return extracted !== undefined && extracted.length > 0 ? extracted : null
}

function sentenceBuilderAnswerText(q: ConversationQuiz): string {
  const correct = getCorrectQuizOptionText(q)
  if (q.type === 'pattern-fill-blank') {
    return q.templateEn.replaceAll('{{blank}}', correct)
  }
  if (q.type === 'multiple-choice') {
    return extractBacktickExpression(q.promptEn) ?? extractBacktickExpression(q.promptKo) ?? correct
  }
  return correct
}

function blankBubbleSelectedText(
  q: ConversationQuiz & { readonly type: 'blank-bubble-fill' },
  selectedOptionIds: readonly string[],
): string {
  const selectedOptionId = selectedOptionIds[0]
  if (selectedOptionId === undefined) return ''
  return q.options.find((opt) => opt.id === selectedOptionId)?.text ?? ''
}

function sentenceBuilderTokensForQuiz(q: ConversationQuiz): readonly SentenceBuilderToken[] {
  const tokens = splitSentenceBuilderTokens(sentenceBuilderAnswerText(q)).map(
    (text, index) => ({
      id: `${q.id}-tok-${index}`,
      text,
    }),
  )
  const shuffled = stableShuffleBySeed(tokens, `sentence:${q.id}`, (token) => token.text)
  if (shuffled.length <= 1) return shuffled
  const unchanged = shuffled.every((token, index) => token.id === tokens[index]?.id)
  return unchanged ? [...shuffled.slice(1), shuffled[0]!] : shuffled
}

function createPersistNonce(): string {
  return createSessionNonce('conversation-result')
}

function nextDayIdInStage(
  stage: ConversationStage | null,
  currentDayId: number,
): number | null {
  if (stage === null) return null
  const sorted = [...stage.days].sort((a, b) => a.dayId - b.dayId)
  const ix = sorted.findIndex((d) => d.dayId === currentDayId)
  if (ix < 0 || ix >= sorted.length - 1) return null
  return sorted[ix + 1]!.dayId
}

export default function ConversationDayDetailPage() {
  const { stageId: stageIdParam, dayId: dayIdParam } = useParams<{
    stageId?: string
    dayId: string
  }>()
  const navigate = useNavigate()
  const stageId = parseStageId(stageIdParam)
  const dayIdNum = parseDayId(dayIdParam)

  // 초기값을 'loading' 으로 두어 effect 내부의 동기 setState 호출을 제거한다.
  // 기존 분기(`status === 'idle' || status === 'loading'`)는 같은 로딩 UI 라
  // 렌더 결과는 동일하다.
  const [packState, setPackState] = useState<RemoteContentState<ConversationStage>>({
    status: 'loading',
  })
  const [currentStep, setCurrentStep] = useState<FlowStep>('cutscene')
  const [narrationIndex, setNarrationIndex] = useState(0)
  const [dialogueIndex, setDialogueIndex] = useState(0)
  const [selectedDialogueResponseOptionId, setSelectedDialogueResponseOptionId] =
    useState<string | null>(null)
  const [isDialogueResponseAnswered, setIsDialogueResponseAnswered] = useState(false)
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizSelectedTokenIds, setQuizSelectedTokenIds] = useState<readonly string[]>([])
  const [quizRevealed, setQuizRevealed] = useState(false)
  const quizCorrectRef = useRef(0)
  /** 틀린 표현 퀴즈 `quiz.id` 목록(결과까지 유지) */
  const wrongQuizIdsRef = useRef<string[]>([])
  /** 단어장(표현) 저장 버튼 반영용 — `loadUserProgress` 재읽기 트리거 */
  const [exprVocabTick, setExprVocabTick] = useState(0)
  const savedExpressionKeys = useMemo(() => {
    void exprVocabTick
    const progress = loadUserProgress()
    return new Set(
      progress.savedExpressions.map(
        (s) => `${s.expressionId}:${s.stageId}:${s.dayId}`,
      ),
    )
  }, [exprVocabTick])
  const learnerNickname = useMemo(() => {
    void exprVocabTick
    const nickname = loadUserProgress().nickname.trim()
    return nickname.length > 0 ? nickname : null
  }, [exprVocabTick])

  // 렌더 중에도 호출할 수 있도록 state 리셋만 분리한다(ref 는 건드리지 않음).
  // react-hooks/refs 룰: 렌더 중에는 ref.current 접근 금지.
  const resetQuizStateLocals = useCallback(() => {
    setQuizIndex(0)
    setQuizSelectedTokenIds([])
    setQuizRevealed(false)
  }, [])

  const resetDialogueResponseState = useCallback(() => {
    setSelectedDialogueResponseOptionId(null)
    setIsDialogueResponseAnswered(false)
  }, [])

  // 이벤트 핸들러(클릭 등)에서 그대로 부르는 진입점. state + ref 모두 리셋.
  const resetQuizLocals = useCallback(() => {
    resetQuizStateLocals()
    quizCorrectRef.current = 0
    wrongQuizIdsRef.current = []
  }, [resetQuizStateLocals])

  useEffect(() => {
    let cancelled = false
    getConversationStage(stageId)
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
  }, [stageId])

  const day = useMemo((): ConversationDay | null => {
    if (packState.status !== 'success' || dayIdNum === null) return null
    return packState.data.days.find((d) => d.dayId === dayIdNum) ?? null
  }, [packState, dayIdNum])

  useEffect(() => {
    if (packState.status !== 'success' || dayIdNum === null || day === null) return
    const sortedIds = [...packState.data.days]
      .map((d) => d.dayId)
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b)
    const p = loadUserProgress()
    const completed = new Set<number>()
    for (const r of p.completedConversationDays) {
      if (r.stageId === stageId) {
        completed.add(r.dayId)
      }
    }
    const alreadyDone = isConversationDayCompletedPersisted(p, stageId, dayIdNum)
    const allowed =
      alreadyDone || isSequentialDayUnlocked(sortedIds, completed, dayIdNum)
    if (!allowed) {
      navigate(conversationStagePath(stageId), { replace: true })
    }
  }, [packState, dayIdNum, day, navigate, stageId])

  const nextDayForResult = useMemo((): number | null => {
    if (packState.status !== 'success' || day === null) return null
    return nextDayIdInStage(packState.data, day.dayId)
  }, [packState, day])

  // ─────────────────────────────────────────────────────────────────────────
  // dayId / day 변경 시 스텝을 'cutscene' 으로 리셋(=Resetting state with a prop).
  // 기존에는 useEffect 안에서 동기 setState 를 호출해 react-hooks/set-state-in-effect
  // 룰을 위반했다. 같은 의미를 effect 밖(렌더 중)에서 가드된 setState 로 표현한다.
  // 무한 루프 방지: stepResetKey 가 currentResetKey 와 같아지면 분기 false → 종료.
  // ─────────────────────────────────────────────────────────────────────────
  const [stepResetKey, setStepResetKey] = useState<string | null>(null)
  const currentResetKey =
    day !== null ? `day:${day.dayId}` : `id:${dayIdNum ?? 'null'}`
  if (stepResetKey !== currentResetKey) {
    setStepResetKey(currentResetKey)
    setCurrentStep('cutscene')
    setNarrationIndex(0)
    setDialogueIndex(0)
    resetDialogueResponseState()
    resetQuizStateLocals()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Day 변경 시점(=stepResetKey 변경)에 quiz 카운터 ref 도 리셋한다.
  // react-hooks/refs 룰: ref 접근은 렌더 밖(=effect)에서만. 같은 Day 안의
  // 이벤트 흐름에서는 resetQuizLocals 가 ref 도 함께 리셋한다.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    quizCorrectRef.current = 0
    wrongQuizIdsRef.current = []
  }, [stepResetKey])

  // ─────────────────────────────────────────────────────────────────────────
  // 빈 섹션 자동 스킵(=state derivation during render).
  // 각 가드는 다음 렌더에서 자동으로 false 가 되므로 무한 루프가 없다.
  // navigate(외부 시스템) 와는 분리해 lint 룰의 본래 의도(=effect 는 외부 동기화)에
  // 맞춘다.
  // ─────────────────────────────────────────────────────────────────────────
  if (day !== null) {
    if (currentStep === 'narration' && day.narrations.length === 0) {
      setCurrentStep('dialogue')
      setDialogueIndex(0)
    } else if (currentStep === 'dialogue' && day.dialogue.length === 0) {
      if (day.quiz.length > 0) {
        setCurrentStep('quiz')
        resetQuizStateLocals()
      } else {
        setCurrentStep('expressions')
      }
    } else if (
      currentStep === 'quiz' &&
      day.quiz.length === 0 &&
      day.keyExpressions.length > 0
    ) {
      setCurrentStep('expressions')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // expressions/quiz 가 모두 비어 있는 Day 는 결과 페이지로 자동 이동.
  // navigate 는 외부 시스템(라우터) 동기화이므로 effect 안에서 처리해야 한다.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (day === null) return
    if (dayIdParam === undefined || dayIdParam === '') return
    const expressionsEmpty =
      currentStep === 'expressions' &&
      day.keyExpressions.length === 0
    const quizEmpty =
      currentStep === 'quiz' &&
      day.quiz.length === 0 &&
      day.keyExpressions.length === 0
    if (!(expressionsEmpty || quizEmpty)) return
    const noQuizPayload: ConversationDayResultLocationState = {
      fromFlow: true,
      quizCorrect: quizCorrectRef.current,
      quizTotal: day.quiz.length,
      skippedQuiz: day.quiz.length === 0,
      nextDayId: nextDayForResult,
      persistNonce: createPersistNonce(),
      wrongQuizIds: [...wrongQuizIdsRef.current],
    }
    navigate(conversationStageDayResultPath(stageId, dayIdParam), {
      replace: true,
      state: noQuizPayload,
    })
  }, [currentStep, day, navigate, dayIdParam, nextDayForResult, stageId])

  const advanceFromCutscene = () => {
    setCurrentStep('narration')
    setNarrationIndex(0)
  }

  const advanceNarration = () => {
    if (day === null) return
    if (narrationIndex < day.narrations.length - 1) {
      setNarrationIndex((i) => i + 1)
    } else {
      setCurrentStep('dialogue')
      setDialogueIndex(0)
      resetDialogueResponseState()
    }
  }

  const advanceDialogue = () => {
    if (day === null) return
    resetDialogueResponseState()
    if (dialogueIndex < day.dialogue.length - 1) {
      setDialogueIndex((i) => i + 1)
    } else if (day.quiz.length > 0) {
      setCurrentStep('quiz')
      resetQuizLocals()
    } else {
      setCurrentStep('expressions')
    }
  }

  const advanceFromExpressions = () => {
    if (day === null || dayIdParam === undefined || dayIdParam === '') return
    const payload: ConversationDayResultLocationState = {
      fromFlow: true,
      quizCorrect: quizCorrectRef.current,
      quizTotal: day.quiz.length,
      skippedQuiz: day.quiz.length === 0,
      nextDayId: nextDayForResult,
      persistNonce: createPersistNonce(),
      wrongQuizIds: [...wrongQuizIdsRef.current],
    }
    navigate(conversationStageDayResultPath(stageId, dayIdParam), { state: payload })
  }

  const activeQuiz: ConversationQuiz | undefined =
    day !== null && day.quiz.length > 0 ? day.quiz[quizIndex] : undefined

  const handleQuizPrimary = () => {
    if (day === null || activeQuiz === undefined || dayIdParam === undefined || dayIdParam === '')
      return

    const builtAnswer =
      activeQuiz.type === 'blank-bubble-fill'
        ? blankBubbleSelectedText(activeQuiz, quizSelectedTokenIds)
        : (() => {
            const sentenceTokens = sentenceBuilderTokensForQuiz(activeQuiz)
            const tokenById = new Map(sentenceTokens.map((token) => [token.id, token]))
            return quizSelectedTokenIds
              .map((id) => tokenById.get(id)?.text ?? '')
              .filter((text) => text.length > 0)
              .join(' ')
          })()
    const targetAnswer =
      activeQuiz.type === 'blank-bubble-fill'
        ? getCorrectQuizOptionText(activeQuiz)
        : sentenceBuilderAnswerText(activeQuiz)

    if (!quizRevealed) {
      if (quizSelectedTokenIds.length === 0) return
      if (
        normalizeSentenceBuilderAnswer(builtAnswer) ===
        normalizeSentenceBuilderAnswer(targetAnswer)
      ) {
        quizCorrectRef.current += 1
      } else {
        wrongQuizIdsRef.current.push(activeQuiz.id)
      }
      setQuizRevealed(true)
      return
    }

    if (quizIndex < day.quiz.length - 1) {
      setQuizIndex((i) => i + 1)
      setQuizSelectedTokenIds([])
      setQuizRevealed(false)
    } else {
      setCurrentStep('expressions')
    }
  }

  const progressIdx = Math.max(0, stepIndex(currentStep))

  if (dayIdNum === null) {
    return (
      <main className="conv-detail">
        <p className="conv-detail__session-note" role="alert">
          Day 번호가 올바르지 않습니다.
        </p>
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to={`/conversation/stage/${stageId}`}>
          목록으로
        </Link>
      </main>
    )
  }

  if (packState.status === 'idle' || packState.status === 'loading') {
    return (
      <main className="conv-detail">
        <p className="conv-detail__session-note" role="status" aria-busy="true">
          Day 불러오는 중…
        </p>
      </main>
    )
  }

  if (packState.status === 'error') {
    const msg = isContentFetchError(packState.error)
      ? packState.error.message
      : packState.error.message || '불러오기에 실패했습니다.'
    return (
      <main className="conv-detail">
        <p className="conv-detail__session-note" role="alert">
          {msg}
        </p>
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to={`/conversation/stage/${stageId}`}>
          목록으로
        </Link>
      </main>
    )
  }

  if (day === null) {
    return (
      <main className="conv-detail">
        <p className="conv-detail__session-note" role="alert">
          이 Day 콘텐츠를 찾지 못했습니다.
        </p>
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to={`/conversation/stage/${stageId}`}>
          목록으로
        </Link>
      </main>
    )
  }

  const dayLabel = `Stage ${stageId} · Day ${day.dayId}`

  const activeDialogueLine =
    currentStep === 'dialogue' ? day.dialogue[dialogueIndex] : undefined
  const activeDialogueResponseQuiz =
    activeDialogueLine?.speakerId === 'learner'
      ? activeDialogueLine.responseQuiz
      : undefined
  const activeDialogueResponseOptions =
    activeDialogueResponseQuiz !== undefined && activeDialogueLine !== undefined
      ? shuffledQuizOptions(
          activeDialogueResponseQuiz.options,
          `dialogue:${day.dayId}:${activeDialogueLine.id}`,
        )
      : []
  const dialogueResponseCorrect =
    activeDialogueResponseQuiz !== undefined &&
    selectedDialogueResponseOptionId !== null &&
    selectedDialogueResponseOptionId === activeDialogueResponseQuiz.correctOptionId

  const primaryDisabled =
    currentStep === 'quiz'
      ? !quizRevealed && (quizSelectedTokenIds.length === 0 || activeQuiz === undefined)
      : currentStep === 'dialogue' && activeDialogueResponseQuiz !== undefined
        ? !isDialogueResponseAnswered && selectedDialogueResponseOptionId === null
        : false

  const quizPrimaryLabel = !quizRevealed ? '정답 확인' : quizIndex >= day.quiz.length - 1 ? '핵심 표현으로' : '다음 문제'

  let stepNotice: string
  if (currentStep === 'cutscene') stepNotice = '컷씬'
  else if (currentStep === 'narration') stepNotice = '나레이션'
  else if (currentStep === 'dialogue') stepNotice = '대화'
  else if (currentStep === 'expressions') stepNotice = '핵심 표현'
  else stepNotice = '퀴즈'

  function renderSceneImage(d: ConversationDay): ReactNode {
    const image = getCurrentConversationSceneImage(d, currentStep)
    return (
      <div className="conv-vn__image-shell">
        <img
          className="conv-vn__image"
          src={image.src}
          alt={image.alt}
          loading="lazy"
          decoding="async"
        />
      </div>
    )
  }

  function renderStepBody(d: ConversationDay): ReactNode {
    switch (currentStep) {
      case 'cutscene':
      case 'narration': {
        const isOpening = currentStep === 'cutscene'
        const block = isOpening ? undefined : d.narrations[narrationIndex]
        const sceneLines = resolvedSceneDescription(d)

        return (
          <section
            className="conv-vn conv-vn--tap"
            aria-labelledby="conv-vn-heading"
            role="button"
            tabIndex={0}
            onClick={handlePrimaryFooter}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handlePrimaryFooter()
              }
            }}
          >
            <h2 id="conv-vn-heading" className="conv-vn__sr-only">
              {isOpening ? '컷씬' : '나레이션'}
            </h2>

            {renderSceneImage(d)}

            <div className="ui-card ui-card--dashboard conv-vn__narr-card">
              <div className="conv-vn__narr-head">
                <span className="conv-detail__panel-badge">
                  {isOpening ? '컷씬' : '나레이션'}
                </span>
                {!isOpening && d.narrations.length > 0 ? (
                  <span className="conv-vn__narr-pager">
                    {narrationIndex + 1} / {d.narrations.length}
                  </span>
                ) : null}
              </div>

              {isOpening ? (
                <p className="conv-vn__narr-intro ui-card__body">
                  {sceneLines.length > 0 ? sceneLines : '장면 설명이 준비중입니다.'}
                </p>
              ) : block !== undefined ? (
                <div className="conv-detail__narration-box">
                  <p className="conv-detail__body ui-card__body conv-detail__body--narration" lang="ko">
                    {block.textKo}
                    {block.textEn !== undefined && block.textEn.trim() !== '' ? (
                      <>
                        {'\n\n'}
                        <span className="conv-detail__narration-en" lang="en">
                          {block.textEn}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        )
      }
      case 'dialogue': {
        const currentDialogueLine = activeDialogueLine
        const shouldShowDialogueLine =
          currentDialogueLine !== undefined &&
          (activeDialogueResponseQuiz === undefined || isDialogueResponseAnswered)
        return (
          <section
            className="conv-detail__panel conv-dialogue-vn ui-card ui-card--dashboard"
            aria-labelledby="conv-script-label"
          >
            {renderSceneImage(d)}
            <h2 id="conv-script-label" className="ui-card__section-heading">
              대화{' '}
              <span className="conv-detail__step-chip">
                {dialogueIndex + 1} / {d.dialogue.length}
              </span>
            </h2>
            <div className="conv-dialogue-vn__stage">
              {shouldShowDialogueLine ? (
                (() => {
                  const line = currentDialogueLine
                  const slot =
                    line.speakerId === 'learner' && learnerNickname !== null
                      ? learnerNickname
                      : dialogueSpeakerSlot(line)
                  return (
                    <article
                      key={line.id}
                      className="conv-dialogue-vn__block conv-dialogue-vn__block--latest"
                      aria-current="step"
                    >
                      <p className="conv-dialogue-vn__speaker" lang="ko">
                        [{slot}]
                      </p>
                      <p className="conv-dialogue-vn__en" lang="en">
                        {line.textEn}
                      </p>
                      <p className="conv-dialogue-vn__ko" lang="ko">
                        {line.textKo}
                      </p>
                    </article>
                  )
                })()
              ) : null}
            </div>
            {activeDialogueResponseQuiz !== undefined ? (
              <div className="conv-detail__quiz-context conv-dialogue-vn__response">
                {!isDialogueResponseAnswered ? (
                  <>
                    <p className="conv-detail__quiz-context-label">뭐라고 답할까?</p>
                    <p className="conv-detail__quiz-prompt" lang="ko">
                      {activeDialogueResponseQuiz.promptKo}
                    </p>
                    {activeDialogueResponseQuiz.promptEn !== undefined &&
                    activeDialogueResponseQuiz.promptEn.trim() !== '' ? (
                      <p className="conv-detail__quiz-prompt-en" lang="en">
                        {activeDialogueResponseQuiz.promptEn}
                      </p>
                    ) : null}
                    <div className="conv-detail__quiz-choices" role="group" aria-label="이어질 말">
                      {activeDialogueResponseOptions.map((opt, optionIndex) => (
                        <button
                          key={opt.id}
                          type="button"
                          className="ui-btn ui-btn--secondary ui-btn--align-start conv-detail__quiz-choice"
                          onClick={() => {
                            setSelectedDialogueResponseOptionId(opt.id)
                            setIsDialogueResponseAnswered(true)
                          }}
                        >
                          ({String.fromCharCode(65 + optionIndex)}) {opt.text}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="conv-detail__quiz-context-label">
                      {dialogueResponseCorrect ? '자연스러운 대답' : '조금 어색한 대답'}
                    </p>
                    <p
                      className={`conv-detail__quiz-feedback${
                        dialogueResponseCorrect
                          ? ' conv-detail__quiz-feedback--ok'
                          : ' conv-detail__quiz-feedback--ng'
                      }`}
                    >
                      {dialogueResponseCorrect
                        ? '좋아요. 지금 상황에 잘 어울려요.'
                        : '이 상황에서는 조금 어색해요. 더 자연스러운 말로 이어가 볼게요.'}
                    </p>
                    {activeDialogueResponseQuiz.explanationKo !== undefined &&
                    activeDialogueResponseQuiz.explanationKo.trim() !== '' ? (
                      <div className="conv-detail__quiz-explanation">
                        <p className="conv-detail__quiz-explanation-label">해설</p>
                        <p className="conv-detail__quiz-explanation-ko" lang="ko">
                          {activeDialogueResponseQuiz.explanationKo}
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {activeDialogueResponseQuiz === undefined || isDialogueResponseAnswered ? (
              <button
                type="button"
                className="ui-btn ui-btn--primary ui-btn--block conv-dialogue-vn__next"
                onClick={handleDialoguePrimary}
              >
                {dialogueIndex < d.dialogue.length - 1 ? '다음 대화' : d.quiz.length > 0 ? '퀴즈로' : '핵심 표현으로'}
              </button>
            ) : null}
          </section>
        )
      }
      case 'expressions':
        return (
          <section
            className="conv-detail__panel conv-expr-wrap"
            aria-labelledby="conv-phrases-label"
          >
            {renderSceneImage(d)}
            <div className="conv-expr-wrap__intro">
              <h2 id="conv-phrases-label" className="ui-card__section-heading conv-expr-wrap__heading">
                핵심 표현
              </h2>
            </div>
            <div className="conv-expr-wrap__list" role="list">
              {d.keyExpressions.map((ex) => {
                const tip = ex.tipKo?.trim()
                const exprSaved = savedExpressionKeys.has(
                  `${ex.id}:${stageId}:${d.dayId}`,
                )
                return (
                  <article
                    key={ex.id}
                    className="ui-card ui-card--dashboard conv-expr-card"
                    role="listitem"
                  >
                    <div className="conv-expr-card__block">
                      <p className="conv-expr-card__micro">표현</p>
                      <p className="conv-expr-card__expression" lang="en">
                        {ex.expressionEn}
                      </p>
                    </div>
                    <div className="conv-expr-card__block">
                      <p className="conv-expr-card__micro">뜻</p>
                      <p className="conv-expr-card__meaning" lang="ko">
                        {ex.expressionKo}
                      </p>
                    </div>
                    {tip !== undefined && tip.length > 0 ? (
                      <div className="conv-expr-card__tip-box">
                        <p className="conv-expr-card__micro conv-expr-card__micro--tip-label">
                          사용 팁
                        </p>
                        <p className="conv-expr-card__tip" lang="ko">
                          {tip}
                        </p>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={`ui-btn ui-btn--secondary ui-btn--block conv-expr-card__vocab${
                        exprSaved ? ' conv-expr-card__vocab--on' : ''
                      }`}
                      onClick={() => {
                        if (exprSaved) {
                          persistRemoveSavedExpression(
                            ex.id,
                            stageId,
                            d.dayId,
                          )
                        } else {
                          persistUpsertSavedExpression(
                            ex.id,
                            stageId,
                            d.dayId,
                          )
                        }
                        setExprVocabTick((t) => t + 1)
                      }}
                    >
                      {exprSaved ? '단어장에서 삭제' : '단어장에 저장'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        )
      case 'quiz':
        return activeQuiz !== undefined ? renderQuizPanel(d, activeQuiz) : null
      default:
        return null
    }
  }

  function renderQuizPanel(d: ConversationDay, q: ConversationQuiz): ReactNode {
    switch (q.type) {
      case 'multiple-choice':
        return renderQuizMultipleChoice(d, q)
      case 'next-line-choice':
        return renderQuizMultipleChoice(d, q)
      case 'pattern-fill-blank':
        return renderQuizMultipleChoice(d, q)
      case 'blank-bubble-fill':
        return renderQuizBlankBubbleFill(d, q)
    }
  }

  function renderBlankBubbleSentence(
    q: ConversationQuiz & { readonly type: 'blank-bubble-fill' },
    selectedOptionText: string,
    correctAnswerText: string,
  ): ReactNode {
    const [head, ...tailParts] = q.templateEn.split('{{blank}}')
    const tail = tailParts.join('{{blank}}')
    const filledText =
      selectedOptionText !== '' ? selectedOptionText : quizRevealed ? correctAnswerText : ''
    return (
      <p className="conv-blank-bubble__sentence" lang="en">
        {head}
        <button
          type="button"
          className={`conv-blank-bubble__blank${
            filledText !== '' ? ' conv-blank-bubble__blank--filled' : ''
          }`}
          disabled={quizRevealed || selectedOptionText === ''}
          aria-label={filledText !== '' ? `${filledText} 제거` : '빈칸'}
          onClick={() => {
            if (!quizRevealed && selectedOptionText !== '') {
              setQuizSelectedTokenIds([])
            }
          }}
        >
          {filledText !== '' ? filledText : '____'}
        </button>
        {tail}
      </p>
    )
  }

  function renderQuizBlankBubbleFill(
    d: ConversationDay,
    q: ConversationQuiz & { readonly type: 'blank-bubble-fill' },
  ): ReactNode {
    const selectedOptionId = quizSelectedTokenIds[0] ?? null
    const selectedOptionText = blankBubbleSelectedText(q, quizSelectedTokenIds)
    const correctAnswerText = getCorrectQuizOptionText(q)
    const displayOptions = shuffledQuizOptions(q.options, `blank:${q.id}`)
    const correct = selectedOptionId === q.correctOptionId
    const explainKoRaw = q.explanationKo?.trim()
    const explainEnRaw = q.explanationEn?.trim()
    const explainKo =
      explainKoRaw !== undefined && explainKoRaw.length > 0
        ? explainKoRaw
        : undefined
    const explainEn =
      explainEnRaw !== undefined && explainEnRaw.length > 0
        ? explainEnRaw
        : undefined
    const showExplanation =
      quizRevealed && (explainKo !== undefined || explainEn !== undefined)

    return (
      <section
        className="conv-detail__panel conv-detail__quiz conv-quiz-vn ui-card ui-card--dashboard"
        aria-labelledby="conv-quiz-label"
      >
        {renderSceneImage(d)}
        <div className="conv-quiz-vn__overlay">
          <div className="conv-detail__panel-head">
            <h2 id="conv-quiz-label" className="ui-card__section-heading">
              빈칸 말풍선
            </h2>
            <span className="conv-detail__panel-badge conv-detail__panel-badge--muted">
              {quizIndex + 1} / {d.quiz.length}
            </span>
          </div>
          <p className="conv-detail__quiz-meta">빈칸 말풍선 채우기</p>
          <p className="conv-detail__quiz-prompt" lang="ko">
            {q.promptKo}
          </p>
          {q.promptEn !== undefined && q.promptEn.trim() !== '' ? (
            <p className="conv-detail__quiz-prompt-en" lang="en">
              {q.promptEn}
            </p>
          ) : null}
          <div className="conv-blank-bubble" aria-label="빈칸 말풍선">
            {renderBlankBubbleSentence(q, selectedOptionText, correctAnswerText)}
          </div>
          <div className="conv-blank-bubble__options" role="group" aria-label="빈칸 선택지">
            {displayOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`conv-blank-bubble__option${
                  selectedOptionId === opt.id ? ' conv-blank-bubble__option--selected' : ''
                }`}
                disabled={quizRevealed}
                onClick={() => {
                  setQuizSelectedTokenIds((ids) => (ids[0] === opt.id ? [] : [opt.id]))
                }}
              >
                {opt.text}
              </button>
            ))}
          </div>
          {quizRevealed ? (
            <>
              <p
                className={`conv-detail__quiz-feedback${
                  correct ? ' conv-detail__quiz-feedback--ok' : ' conv-detail__quiz-feedback--ng'
                }`}
              >
                {correct
                  ? '좋아요. 자연스럽게 채웠어요.'
                  : '조금 어색해요. 빈칸에는 아래 단어가 자연스러워요.'}
              </p>
              {!correct ? (
                <p className="conv-sentence-builder__correct-answer" lang="en">
                  {q.templateEn.replaceAll('{{blank}}', correctAnswerText)}
                </p>
              ) : null}
              {showExplanation ? (
                <div className="conv-detail__quiz-explanation">
                  <p className="conv-detail__quiz-explanation-label">해설</p>
                  {explainKo !== undefined ? (
                    <p className="conv-detail__quiz-explanation-ko" lang="ko">
                      {explainKo}
                    </p>
                  ) : null}
                  {explainEn !== undefined ? (
                    <p className="conv-detail__quiz-explanation-en" lang="en">
                      {explainEn}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--block conv-quiz-vn__next"
            disabled={!quizRevealed && selectedOptionId === null}
            onClick={handleQuizPrimary}
          >
            {quizPrimaryLabel}
          </button>
        </div>
      </section>
    )
  }

  function renderQuizMultipleChoice(
    d: ConversationDay,
    q: ConversationQuiz,
  ): ReactNode {
    const sentenceTokens = sentenceBuilderTokensForQuiz(q)
    const tokenById = new Map(sentenceTokens.map((token) => [token.id, token]))
    const selectedTokens = quizSelectedTokenIds
      .map((id) => tokenById.get(id))
      .filter((token): token is SentenceBuilderToken => token !== undefined)
    const selectedTokenIdSet = new Set(quizSelectedTokenIds)
    const availableTokens = sentenceTokens.filter((token) => !selectedTokenIdSet.has(token.id))
    const builtAnswer = selectedTokens.map((token) => token.text).join(' ')
    const targetAnswer = sentenceBuilderAnswerText(q)
    const correct =
      normalizeSentenceBuilderAnswer(builtAnswer) ===
      normalizeSentenceBuilderAnswer(targetAnswer)
    const quizTitle =
      q.type === 'next-line-choice'
        ? '대답 문장 만들기'
        : q.type === 'pattern-fill-blank'
          ? '빈칸 문장 만들기'
          : '핵심 문장 만들기'
    const explainKoRaw = q.explanationKo?.trim()
    const explainEnRaw = q.explanationEn?.trim()
    const explainKo =
      explainKoRaw !== undefined && explainKoRaw.length > 0
        ? explainKoRaw
        : undefined
    const explainEn =
      explainEnRaw !== undefined && explainEnRaw.length > 0
        ? explainEnRaw
        : undefined
    const showExplanation =
      quizRevealed && (explainKo !== undefined || explainEn !== undefined)

    const removeSelectedToken = (tokenId: string): void => {
      if (quizRevealed) return
      setQuizSelectedTokenIds((ids) => ids.filter((id) => id !== tokenId))
    }

    return (
      <section
        className="conv-detail__panel conv-detail__quiz conv-quiz-vn ui-card ui-card--dashboard"
        aria-labelledby="conv-quiz-label"
      >
        {renderSceneImage(d)}
        <div className="conv-quiz-vn__overlay">
          <div className="conv-detail__panel-head">
            <h2 id="conv-quiz-label" className="ui-card__section-heading">
              문장 맞추기
            </h2>
            <span className="conv-detail__panel-badge conv-detail__panel-badge--muted">
              {quizIndex + 1} / {d.quiz.length}
            </span>
          </div>
          <p className="conv-detail__quiz-meta">{quizTitle}</p>
          {q.type === 'next-line-choice' ? (
            <div className="conv-detail__quiz-context">
              <p className="conv-detail__quiz-context-label">
                {q.partnerSpeakerLabelKo ?? '상대'}
              </p>
              <p className="conv-detail__quiz-context-en" lang="en">
                {q.partnerLineEn}
              </p>
              {q.partnerLineKo !== undefined && q.partnerLineKo.trim() !== '' ? (
                <p className="conv-detail__quiz-context-ko" lang="ko">
                  {q.partnerLineKo}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="conv-detail__quiz-prompt" lang="ko">
            {q.promptKo}
          </p>
          {q.promptEn !== undefined && q.promptEn.trim() !== '' ? (
            <p className="conv-detail__quiz-prompt-en" lang="en">
              {q.promptEn}
            </p>
          ) : null}
          <div className="conv-sentence-builder__answer" aria-label="내가 만든 문장">
            {selectedTokens.length > 0 ? (
              selectedTokens.map((token) => (
                <span key={token.id} className="conv-sentence-builder__selected-token">
                  <button
                    type="button"
                    className="conv-sentence-builder__selected-word"
                    disabled={quizRevealed}
                    aria-label={`${token.text} 제거`}
                    title="눌러서 제거"
                    onClick={() => removeSelectedToken(token.id)}
                  >
                    {token.text}
                  </button>
                </span>
              ))
            ) : (
              <span className="conv-sentence-builder__placeholder">
                머릿속 문장을 순서대로 놓아 보세요.
              </span>
            )}
          </div>
          <div className="conv-sentence-builder__bank" role="group" aria-label="단어 풍선">
            {availableTokens.map((token) => (
              <button
                key={token.id}
                type="button"
                className="conv-sentence-builder__token"
                disabled={quizRevealed}
                onClick={() => {
                  setQuizSelectedTokenIds((ids) => [...ids, token.id])
                }}
              >
                {token.text}
              </button>
            ))}
          </div>
          {quizRevealed ? (
            <>
              <p
                className={`conv-detail__quiz-feedback${correct ? ' conv-detail__quiz-feedback--ok' : ' conv-detail__quiz-feedback--ng'}`}
              >
                {correct
                  ? '좋아요. 자연스럽게 들려요.'
                  : '조금 어색해요. 자연스러운 순서는 아래와 같아요.'}
              </p>
              {!correct ? (
                <p className="conv-sentence-builder__correct-answer" lang="en">
                  {targetAnswer}
                </p>
              ) : null}
              {showExplanation ? (
                <div className="conv-detail__quiz-explanation">
                  <p className="conv-detail__quiz-explanation-label">해설</p>
                  {explainKo !== undefined ? (
                    <p className="conv-detail__quiz-explanation-ko" lang="ko">
                      {explainKo}
                    </p>
                  ) : null}
                  {explainEn !== undefined ? (
                    <p className="conv-detail__quiz-explanation-en" lang="en">
                      {explainEn}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--block conv-quiz-vn__next"
            disabled={!quizRevealed && selectedTokens.length === 0}
            onClick={handleQuizPrimary}
          >
            {quizPrimaryLabel}
          </button>
        </div>
      </section>
    )
  }

  const handleDialoguePrimary = () => {
    if (activeDialogueResponseQuiz !== undefined && !isDialogueResponseAnswered) {
      if (selectedDialogueResponseOptionId === null) return
      setIsDialogueResponseAnswered(true)
      return
    }
    advanceDialogue()
  }

  const handlePrimaryFooter = () => {
    switch (currentStep) {
      case 'cutscene':
        advanceFromCutscene()
        return
      case 'narration':
        advanceNarration()
        return
      case 'dialogue':
        handleDialoguePrimary()
        return
      case 'expressions':
        advanceFromExpressions()
        return
      case 'quiz':
        handleQuizPrimary()
        return
      default:
        return
    }
  }

  const footerPrimaryLabel =
    currentStep === 'cutscene'
      ? '장면 보기'
      : currentStep === 'narration'
        ? narrationIndex < day.narrations.length - 1
          ? '다음'
          : '대화로'
        : currentStep === 'dialogue'
          ? activeDialogueResponseQuiz !== undefined && !isDialogueResponseAnswered
            ? '답하기'
            : dialogueIndex < day.dialogue.length - 1
              ? '다음 대화'
              : day.quiz.length > 0
                ? '퀴즈로'
                : '핵심 표현으로'
          : currentStep === 'quiz'
            ? quizPrimaryLabel
            : 'Day 완료'

  const handleFooterPrimary = () => {
    handlePrimaryFooter()
  }

  const footerPrimaryDisabled =
    currentStep === 'quiz' || currentStep === 'dialogue' ? primaryDisabled : false

  const isVnStep = currentStep === 'cutscene' || currentStep === 'narration'
  const isCompactSceneStep =
    currentStep === 'cutscene' ||
    currentStep === 'narration' ||
    currentStep === 'dialogue' ||
    currentStep === 'quiz'

  return (
    <main
      className={`conv-detail${isVnStep ? ' conv-detail--vn-flow' : ''}${isCompactSceneStep ? ' conv-detail--compact-scene' : ''}`}
    >
      {isCompactSceneStep ? (
        <div className="conv-detail__title-block conv-detail__title-block--compact">
          <div className="conv-detail__compact-topline">
            <p className="conv-detail__eyebrow">{dayLabel}</p>
            <div className="conv-detail__scene-dots" aria-label="진행 단계">
              {FLOW_STEPS.map((s, i) => (
                <span
                  key={s}
                  className={
                    i === progressIdx
                      ? 'conv-detail__scene-dot conv-detail__scene-dot--active'
                      : 'conv-detail__scene-dot'
                  }
                  title={s}
                />
              ))}
            </div>
          </div>
          <div className="conv-detail__compact-title-row">
            <h1 className="conv-detail__title">{day.titleKo}</h1>
            <p className="conv-detail__session-note">
              {stepNotice}
              {day.descriptionKo !== undefined ? ` · ${day.descriptionKo}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="conv-detail__title-block">
          <p className="conv-detail__eyebrow">{dayLabel}</p>
          <h1 className="conv-detail__title">{day.titleKo}</h1>
          <div className="conv-detail__scene-dots" aria-label="진행 단계">
            {FLOW_STEPS.map((s, i) => (
              <span
                key={s}
                className={
                  i === progressIdx
                    ? 'conv-detail__scene-dot conv-detail__scene-dot--active'
                    : 'conv-detail__scene-dot'
                }
                title={s}
              />
            ))}
          </div>
          <p className="conv-detail__session-note">
            {isVnStep
              ? `${stepNotice} · 장면 학습`
              : `${stepNotice}${day.descriptionKo !== undefined ? ` · ${day.descriptionKo}` : ''}`}
          </p>
        </div>
      )}

      {renderStepBody(day)}

      {!isCompactSceneStep ? (
        <div className="conv-detail__step-footer">
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--block"
            disabled={footerPrimaryDisabled}
            onClick={handleFooterPrimary}
          >
            {footerPrimaryLabel}
          </button>
        </div>
      ) : null}
    </main>
  )
}

