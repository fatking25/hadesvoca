/**
 * 실전 회화 Day 상세: JSON 로드 후 컷씬 → 나레이션 → 대화 → 표현 → 퀴즈 스텝 진행, 마지막에 결과 화면으로 이동합니다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getConversationStage,
  isContentFetchError,
  type RemoteContentState,
} from '../../api/contentApi'
import type { ConversationDayResultLocationState } from '../../context/ConversationSessionContext'
import type {
  ConversationDay,
  ConversationDialogueLine,
  ConversationQuiz,
  ConversationStage,
} from '../../types/conversation'
import { isSequentialDayUnlocked } from '../../utils/learningUnlock'
import {
  isConversationDayCompletedPersisted,
  loadUserProgress,
  persistRemoveSavedExpression,
  persistUpsertSavedExpression,
} from '../../utils/storage'
import '../ConversationDayDetailPage.css'

const MVP_CONV_STAGE_ID = 1

type FlowStep = 'cutscene' | 'narration' | 'dialogue' | 'expressions' | 'quiz'

const FLOW_STEPS: readonly FlowStep[] = [
  'cutscene',
  'narration',
  'dialogue',
  'expressions',
  'quiz',
] as const

function publicAssetUrl(pathFromSiteRoot: string): string {
  const trimmed = pathFromSiteRoot.replace(/^\/+/, '')
  const baseRaw = import.meta.env.BASE_URL
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`
  return `${base}${trimmed}`
}

const FALLBACK_THUMB = '/content/conversations/assets/placeholder-day1-cutscene.svg'

function stepIndex(step: FlowStep): number {
  return FLOW_STEPS.indexOf(step)
}

function parseDayId(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/** 중앙 장면 설명: `sceneDescriptionKo` 우선, 없으면 `descriptionKo` */
function resolvedSceneDescription(d: ConversationDay): string {
  const s = d.sceneDescriptionKo?.trim()
  if (s !== undefined && s.length > 0) return s
  const t = d.descriptionKo?.trim()
  return t !== undefined && t.length > 0 ? t : ''
}

function dialogueSpeakerSlot(line: ConversationDialogueLine): string {
  const ko = line.speakerLabelKo?.trim()
  if (ko !== undefined && ko.length > 0) return ko
  const id = line.speakerId?.trim()
  if (id !== undefined && id.length > 0) return id
  return 'Speaker'
}

function createPersistNonce(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const { dayId: dayIdParam } = useParams<{ dayId: string }>()
  const navigate = useNavigate()
  const dayIdNum = parseDayId(dayIdParam)

  const [packState, setPackState] = useState<RemoteContentState<ConversationStage>>({ status: 'idle' })
  const [currentStep, setCurrentStep] = useState<FlowStep>('cutscene')
  const [narrationIndex, setNarrationIndex] = useState(0)
  const [dialogueIndex, setDialogueIndex] = useState(0)
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizSelected, setQuizSelected] = useState<string | null>(null)
  const [quizRevealed, setQuizRevealed] = useState(false)
  const quizCorrectRef = useRef(0)
  /** 틀린 표현 퀴즈 `quiz.id` 목록(결과까지 유지) */
  const wrongQuizIdsRef = useRef<string[]>([])
  /** 단어장(표현) 저장 버튼 반영용 — `loadUserProgress` 재읽기 트리거 */
  const [exprVocabTick, setExprVocabTick] = useState(0)

  const resetQuizLocals = useCallback(() => {
    setQuizIndex(0)
    setQuizSelected(null)
    setQuizRevealed(false)
    quizCorrectRef.current = 0
    wrongQuizIdsRef.current = []
  }, [])

  useEffect(() => {
    let cancelled = false
    setPackState({ status: 'loading' })
    getConversationStage(MVP_CONV_STAGE_ID)
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
      if (r.stageId === MVP_CONV_STAGE_ID) {
        completed.add(r.dayId)
      }
    }
    const alreadyDone = isConversationDayCompletedPersisted(p, MVP_CONV_STAGE_ID, dayIdNum)
    const allowed =
      alreadyDone || isSequentialDayUnlocked(sortedIds, completed, dayIdNum)
    if (!allowed) {
      navigate('/conversation', { replace: true })
    }
  }, [packState, dayIdNum, day, navigate])

  const nextDayForResult = useMemo((): number | null => {
    if (packState.status !== 'success' || day === null) return null
    return nextDayIdInStage(packState.data, day.dayId)
  }, [packState, day])

  useEffect(() => {
    setCurrentStep('cutscene')
    setNarrationIndex(0)
    setDialogueIndex(0)
    resetQuizLocals()
  }, [dayIdNum, day, resetQuizLocals])

  /** 빈 섹션은 통과 스킵 */
  useEffect(() => {
    if (day === null) return

    if (currentStep === 'narration' && day.narrations.length === 0) {
      setCurrentStep('dialogue')
      setDialogueIndex(0)
    }
    if (currentStep === 'dialogue' && day.dialogue.length === 0) {
      setCurrentStep('expressions')
    }
    if (currentStep === 'expressions' && day.keyExpressions.length === 0 && day.quiz.length > 0) {
      resetQuizLocals()
      setCurrentStep('quiz')
    }
    if (
      currentStep === 'expressions' &&
      day.keyExpressions.length === 0 &&
      day.quiz.length === 0
    ) {
      if (dayIdParam !== undefined && dayIdParam !== '') {
        const noQuizPayload: ConversationDayResultLocationState = {
          fromFlow: true,
          quizCorrect: 0,
          quizTotal: 0,
          skippedQuiz: true,
          nextDayId: nextDayForResult,
          persistNonce: createPersistNonce(),
          wrongQuizIds: [],
        }
        navigate(`/conversation/${dayIdParam}/result`, {
          replace: true,
          state: noQuizPayload,
        })
      }
    }
    if (currentStep === 'quiz' && day.quiz.length === 0) {
      if (dayIdParam !== undefined && dayIdParam !== '') {
        const noQuizPayload: ConversationDayResultLocationState = {
          fromFlow: true,
          quizCorrect: 0,
          quizTotal: 0,
          skippedQuiz: true,
          nextDayId: nextDayForResult,
          persistNonce: createPersistNonce(),
          wrongQuizIds: [],
        }
        navigate(`/conversation/${dayIdParam}/result`, {
          replace: true,
          state: noQuizPayload,
        })
      }
    }
  }, [
    currentStep,
    day,
    navigate,
    dayIdParam,
    resetQuizLocals,
    nextDayForResult,
  ])

  const cutsceneSrc = day?.cutsceneImagePath?.trim()
    ? publicAssetUrl(day.cutsceneImagePath)
    : publicAssetUrl(FALLBACK_THUMB)

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
    }
  }

  const advanceDialogue = () => {
    if (day === null) return
    if (dialogueIndex < day.dialogue.length - 1) {
      setDialogueIndex((i) => i + 1)
    } else {
      setCurrentStep('expressions')
    }
  }

  const advanceFromExpressions = () => {
    setCurrentStep('quiz')
    resetQuizLocals()
  }

  const activeQuiz: ConversationQuiz | undefined =
    day !== null && day.quiz.length > 0 ? day.quiz[quizIndex] : undefined

  const handleQuizPrimary = () => {
    if (day === null || activeQuiz === undefined || dayIdParam === undefined || dayIdParam === '')
      return

    if (!quizRevealed) {
      if (quizSelected === null) return
      if (quizSelected === activeQuiz.correctOptionId) {
        quizCorrectRef.current += 1
      } else {
        wrongQuizIdsRef.current.push(activeQuiz.id)
      }
      setQuizRevealed(true)
      return
    }

    if (quizIndex < day.quiz.length - 1) {
      setQuizIndex((i) => i + 1)
      setQuizSelected(null)
      setQuizRevealed(false)
    } else {
      const payload: ConversationDayResultLocationState = {
        fromFlow: true,
        quizCorrect: quizCorrectRef.current,
        quizTotal: day.quiz.length,
        nextDayId: nextDayForResult,
        persistNonce: createPersistNonce(),
        wrongQuizIds: [...wrongQuizIdsRef.current],
      }
      navigate(`/conversation/${dayIdParam}/result`, { state: payload })
    }
  }

  const progressIdx = Math.max(0, stepIndex(currentStep))

  const resultHref =
    dayIdParam !== undefined && dayIdParam !== ''
      ? `/conversation/${dayIdParam}/result`
      : '/conversation'

  if (dayIdNum === null) {
    return (
      <main className="conv-detail">
        <p className="conv-detail__session-note" role="alert">
          Day 번호가 올바르지 않습니다.
        </p>
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/conversation">
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
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/conversation">
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
        <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/conversation">
          목록으로
        </Link>
      </main>
    )
  }

  const dayLabel = `Stage ${MVP_CONV_STAGE_ID} · Day ${day.dayId}`

  const primaryDisabled =
    currentStep === 'quiz' &&
    !quizRevealed &&
    (quizSelected === null || activeQuiz === undefined)

  const quizPrimaryLabel = !quizRevealed ? '정답 확인' : quizIndex >= day.quiz.length - 1 ? '결과 보기' : '다음 문제'

  let stepNotice: string
  if (currentStep === 'cutscene') stepNotice = '컷씬'
  else if (currentStep === 'narration') stepNotice = '나레이션'
  else if (currentStep === 'dialogue') stepNotice = '대화'
  else if (currentStep === 'expressions') stepNotice = '핵심 표현'
  else stepNotice = '퀴즈'

  function renderStepBody(d: ConversationDay): ReactNode {
    switch (currentStep) {
      case 'cutscene':
      case 'narration': {
        const isOpening = currentStep === 'cutscene'
        const block = isOpening ? undefined : d.narrations[narrationIndex]
        const sceneLines = resolvedSceneDescription(d)

        return (
          <section className="conv-vn" aria-labelledby="conv-vn-heading">
            <h2 id="conv-vn-heading" className="conv-vn__sr-only">
              {isOpening ? '컷씬' : '나레이션'}
            </h2>

            <div className="conv-vn__image-shell">
              <img
                className="conv-vn__image"
                src={cutsceneSrc}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </div>

            {sceneLines.length > 0 ? (
              <p className="conv-vn__scene-desc" lang="ko">
                {sceneLines}
              </p>
            ) : (
              <p className="conv-vn__scene-desc conv-vn__scene-desc--muted">
                장면 설명 없음 · JSON 의 sceneDescriptionKo 또는 descriptionKo 를 채워 주세요.
              </p>
            )}

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
                  같은 배경에서 곧 속마음 나레이션이 시작됩니다. 아래 다음을 눌러 진행합니다.
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
        const revealed = d.dialogue.slice(0, dialogueIndex + 1)
        return (
          <section
            className="conv-detail__panel conv-dialogue-vn ui-card ui-card--dashboard"
            aria-labelledby="conv-script-label"
          >
            <h2 id="conv-script-label" className="ui-card__section-heading">
              대화{' '}
              <span className="conv-detail__step-chip">
                {dialogueIndex + 1} / {d.dialogue.length}
              </span>
            </h2>
            <p className="conv-dialogue-vn__hint">비주얼노벨 텍스트 흐름 · 다음으로 한 줄씩 이어집니다.</p>
            <div className="conv-dialogue-vn__list" role="feed" aria-label="대화 스크립트">
              {revealed.map((line, i) => {
                const isLatest = i === revealed.length - 1
                const slot = dialogueSpeakerSlot(line)
                return (
                  <article
                    key={line.id}
                    className={`conv-dialogue-vn__block${isLatest ? ' conv-dialogue-vn__block--latest' : ''}`}
                    aria-current={isLatest ? 'step' : undefined}
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
              })}
            </div>
          </section>
        )
      }
      case 'expressions':
        return (
          <section
            className="conv-detail__panel conv-expr-wrap"
            aria-labelledby="conv-phrases-label"
          >
            <div className="conv-expr-wrap__intro">
              <h2 id="conv-phrases-label" className="ui-card__section-heading conv-expr-wrap__heading">
                핵심 표현
              </h2>
              <p className="conv-expr-wrap__hint">대화에서 꺼낼 수 있는 패턴을 카드로 정리했습니다.</p>
            </div>
            <div className="conv-expr-wrap__list" role="list">
              {d.keyExpressions.map((ex) => {
                const tip = ex.tipKo?.trim()
                void exprVocabTick
                const exprSaved = loadUserProgress().savedExpressions.some(
                    (s) =>
                      s.expressionId === ex.id &&
                      s.stageId === MVP_CONV_STAGE_ID &&
                      s.dayId === d.dayId,
                  )
                return (
                  <article
                    key={ex.id}
                    className="ui-card ui-card--dashboard conv-expr-card"
                    role="listitem"
                  >
                    <div className="conv-expr-card__block">
                      <p className="conv-expr-card__micro">expression</p>
                      <p className="conv-expr-card__expression" lang="en">
                        {ex.expressionEn}
                      </p>
                    </div>
                    <div className="conv-expr-card__block">
                      <p className="conv-expr-card__micro">meaning</p>
                      <p className="conv-expr-card__meaning" lang="ko">
                        {ex.expressionKo}
                      </p>
                    </div>
                    {tip !== undefined && tip.length > 0 ? (
                      <div className="conv-expr-card__tip-box">
                        <p className="conv-expr-card__micro conv-expr-card__micro--tip-label">
                          usageTip
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
                            MVP_CONV_STAGE_ID,
                            d.dayId,
                          )
                        } else {
                          persistUpsertSavedExpression(
                            ex.id,
                            MVP_CONV_STAGE_ID,
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
    }
  }

  function renderQuizMultipleChoice(
    d: ConversationDay,
    q: Extract<ConversationQuiz, { type: 'multiple-choice' }>,
  ): ReactNode {
    const selectedId = quizSelected
    const correct =
      selectedId !== null && selectedId === q.correctOptionId
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
        className="conv-detail__panel conv-detail__quiz ui-card ui-card--dashboard"
        aria-labelledby="conv-quiz-label"
      >
        <div className="conv-detail__panel-head">
          <h2 id="conv-quiz-label" className="ui-card__section-heading">
            표현 퀴즈
          </h2>
          <span className="conv-detail__panel-badge conv-detail__panel-badge--muted">
            객관식
          </span>
        </div>
        <p className="conv-detail__quiz-meta">
          문제 {quizIndex + 1} / {d.quiz.length}
        </p>
        <p className="conv-detail__quiz-prompt" lang="ko">
          {q.promptKo}
        </p>
        {q.promptEn !== undefined && q.promptEn.trim() !== '' ? (
          <p className="conv-detail__quiz-prompt-en" lang="en">
            {q.promptEn}
          </p>
        ) : null}
        <div className="conv-detail__quiz-choices" role="group" aria-label="선택지">
          {q.options.map((opt) => {
            let cls =
              'ui-btn ui-btn--secondary ui-btn--align-start conv-detail__quiz-choice'
            if (!quizRevealed && quizSelected === opt.id) {
              cls += ' conv-detail__quiz-choice--picked'
            }
            if (quizRevealed) {
              if (opt.id === q.correctOptionId) cls += ' conv-detail__quiz-choice--correct'
              else if (
                quizSelected === opt.id &&
                opt.id !== q.correctOptionId
              ) {
                cls += ' conv-detail__quiz-choice--wrong'
              }
            }
            return (
              <button
                key={opt.id}
                type="button"
                disabled={quizRevealed}
                className={cls}
                onClick={() => {
                  if (!quizRevealed) setQuizSelected(opt.id)
                }}
              >
                ({opt.id.toUpperCase()}) {opt.text}
              </button>
            )
          })}
        </div>
        {quizRevealed ? (
          <>
            <p
              className={`conv-detail__quiz-feedback${correct ? ' conv-detail__quiz-feedback--ok' : ' conv-detail__quiz-feedback--ng'}`}
            >
              {correct
                ? '정답입니다.'
                : '오답입니다. 위 정답 문장과 핵심 표현 카드를 다시 복습해 보세요.'}
            </p>
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
      </section>
    )
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
        advanceDialogue()
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
      ? '다음 · 나레이션'
      : currentStep === 'narration'
        ? narrationIndex < day.narrations.length - 1
          ? '다음'
          : '다음 · 대화'
        : currentStep === 'dialogue'
          ? dialogueIndex < day.dialogue.length - 1
            ? '다음 대사'
            : '다음 · 핵심 표현'
          : currentStep === 'expressions'
            ? day.quiz.length > 0
              ? '퀴즈로'
              : '완료 보기'
            : quizPrimaryLabel

  const handleFooterPrimary = () => {
    if (currentStep === 'expressions' && day.quiz.length === 0) {
      const noQuizPayload: ConversationDayResultLocationState = {
        fromFlow: true,
        quizCorrect: 0,
        quizTotal: 0,
        skippedQuiz: true,
        nextDayId: nextDayForResult,
        persistNonce: createPersistNonce(),
        wrongQuizIds: [],
      }
      navigate(resultHref, { state: noQuizPayload })
      return
    }
    handlePrimaryFooter()
  }

  const footerPrimaryDisabled =
    currentStep === 'quiz' ? primaryDisabled : false

  const isVnStep = currentStep === 'cutscene' || currentStep === 'narration'

  return (
    <main className={`conv-detail${isVnStep ? ' conv-detail--vn-flow' : ''}`}>
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
            ? `${stepNotice} · 모바일 VN 레이아웃`
            : `${stepNotice} · ${day.descriptionKo ?? '텍스트 중심 MVP'}`}
        </p>
      </div>

      {renderStepBody(day)}

      <div className="conv-detail__step-footer">
        <button
          type="button"
          className="ui-btn ui-btn--primary ui-btn--block"
          disabled={footerPrimaryDisabled}
          onClick={handleFooterPrimary}
        >
          {footerPrimaryLabel}
        </button>
        <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/conversation">
          목록으로 나가기
        </Link>
      </div>
    </main>
  )
}
