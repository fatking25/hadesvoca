/**
 * 학습 경로 목록 화면: 유닛 배너 · 지그재그 노드 · 듀오형 시작 시트.
 * 상위(`WordStudyDayListPage` 등)에서 콘텐츠/`UserProgress` 기반 상태를 계산해 props 로 주입한다.
 */

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'

import './LearningPathView.css'

export type LearningPathDay = Readonly<{
  id: number
  title: string
  /** open: 학습 가능 · locked: 직전 Day 미완료로 잠금 · coming: 교재 미배포 */
  status: 'open' | 'locked' | 'coming'
  /** `locked`일 때 안내 문구용 직전 Day 번호 */
  prerequisiteDayId?: number
}>

export type LearningPathVariant = 'conversation' | 'word'

/**
 * 복습 진입 배너(주로 단어 학습 경로에서 사용).
 * `dueCount === 0` 이면 상위에서 prop 자체를 전달하지 않거나 0 으로 두면 배너가 숨겨진다.
 */
export type LearningPathReviewBanner = Readonly<{
  dueCount: number
  reviewHref: string
}>

/**
 * Stage 콘텐츠 가져오기 자리(Phase 12-1-B).
 * 실제 외부 JSON import 기능 없이, 준비중 UI 만 표시한다.
 */
export type LearningPathStageImportBanner = Readonly<{
  title: string
  description: string
  buttonLabel: string
  statusLabel: string
}>

/**
 * 일반 Day 시작 비용 게이트(단어 학습 전용).
 * `coins < cost` 일 때 시작 CTA 를 비활성화하고 안내 문구를 띄운다.
 * 복습 배너는 이 게이트와 무관하게 동작한다.
 */
export type LearningPathStartGate = Readonly<{
  coins: number
  cost: number
}>

export type LearningPathViewProps = Readonly<{
  variant: LearningPathVariant
  sectionLabel: string
  unitTitle: string
  screenCaption: string
  days: readonly LearningPathDay[]
  basePath: string
  guideAccessory?: ReactNode
  /** 해당 Day id 기준으로 기기 저장 완료 표시(localStorage 참조 없음 · 상위에서만 채움) */
  completeDayIds?: ReadonlySet<number>
  /** 예: Stage 1 진행률 3/7 — 콘텐츠 Day 수와 완료 수는 상위에서 계산 */
  progressLine?: string
  /** Stage 2+ 콘텐츠 가져오기 준비중 자리. 실제 import 동작은 연결하지 않는다. */
  stageImportBanner?: LearningPathStageImportBanner
  /** 복습 대상이 있을 때 상단에 노출되는 배너. 없으면 표시되지 않는다. */
  reviewBanner?: LearningPathReviewBanner
  /** 진행 경로에서 다음에 풀어야 할 Day id. 강조 pill 표시에 사용. */
  currentOpenDayId?: number
  /** 일반 Day 시작 비용 게이트. 미전달이면 시작 CTA 는 항상 활성화된다(=구 회화 화면 호환). */
  startGate?: LearningPathStartGate
}>

export function LearningPathView({
  variant,
  sectionLabel,
  unitTitle,
  screenCaption,
  days,
  basePath,
  guideAccessory,
  completeDayIds,
  progressLine,
  stageImportBanner,
  reviewBanner,
  currentOpenDayId,
  startGate,
}: LearningPathViewProps) {
  const sheetTitleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const ctaRef = useRef<HTMLAnchorElement | null>(null)
  const prevActiveEl = useRef<Element | null>(null)

  const [focusDay, setFocusDay] = useState<LearningPathDay | null>(null)
  const sheetOpen = focusDay !== null

  const sheetCoinShort =
    focusDay !== null &&
    focusDay.status === 'open' &&
    startGate !== undefined &&
    startGate.coins < startGate.cost

  useEffect(() => {
    if (!sheetOpen) return
    prevActiveEl.current = document.activeElement
    const id = window.requestAnimationFrame(() => {
      if (focusDay?.status === 'open' && ctaRef.current !== null) {
        ctaRef.current.focus({ preventScroll: true })
      } else {
        closeBtnRef.current?.focus({ preventScroll: true })
      }
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFocusDay(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('keydown', onKey)
      const p = prevActiveEl.current
      if (p instanceof HTMLElement) {
        p.focus()
      }
    }
  }, [sheetOpen, focusDay])

  return (
    <>
      <main className={`learning-path learning-path--${variant}`}>
        <section className="learning-path__banner" aria-label="현재 학습 유닛">
          <div className="learning-path__banner-copy">
            <p className="learning-path__section-label">{sectionLabel}</p>
            <h1 className="learning-path__unit-title">{unitTitle}</h1>
          </div>
          <button
            type="button"
            className="learning-path__guide-slot"
            aria-label="가이드 준비 중"
            disabled
            title="가이드 준비 중"
          >
            {guideAccessory ?? <span aria-hidden className="learning-path__guide-icon" />}
          </button>
        </section>

        {progressLine !== undefined && progressLine.trim() !== '' ? (
          <p className="learning-path__progress-line" aria-label="Stage 진행률">
            {progressLine}
          </p>
        ) : null}
        <p className="learning-path__screen-caption">{screenCaption}</p>

        {stageImportBanner !== undefined ? (
          <section
            className="learning-path__stage-import-banner"
            aria-label="추가 스테이지 준비 중"
          >
            <div className="learning-path__stage-import-copy">
              <p className="learning-path__stage-import-title">
                {stageImportBanner.title}
              </p>
              <p className="learning-path__stage-import-sub">
                {stageImportBanner.description}
              </p>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn--ghost learning-path__stage-import-cta"
              disabled
            >
              {stageImportBanner.buttonLabel}
              <span className="learning-path__stage-import-status">
                {stageImportBanner.statusLabel}
              </span>
            </button>
          </section>
        ) : null}

        {reviewBanner !== undefined && reviewBanner.dueCount > 0 ? (
          <section
            className="learning-path__review-banner"
            aria-label="복습 안내"
          >
            <div className="learning-path__review-banner-copy">
              <p className="learning-path__review-banner-title">
                복습할 단어 {reviewBanner.dueCount}개
              </p>
              <p className="learning-path__review-banner-sub">
                지금 복습하면 더 오래 기억할 수 있어요.
              </p>
            </div>
            <Link
              to={reviewBanner.reviewHref}
              className="ui-btn ui-btn--primary learning-path__review-banner-cta"
            >
              복습하기
            </Link>
          </section>
        ) : null}

        <div className="learning-path__path-wrap">
          <div className="learning-path__spine" aria-hidden />
          <ol className="learning-path__steps">
            {days.map((day, idx) => {
              const nodeLockedVisually = day.status !== 'open'
              const doneFlag = completeDayIds?.has(day.id) === true

              const nodeCls = ['learning-path__node']
              if (nodeLockedVisually) nodeCls.push('learning-path__node--locked')
              else nodeCls.push('learning-path__node--ready')

              return (
                <li
                  key={day.id}
                  className={
                    idx % 2 === 0
                      ? 'learning-path__step learning-path__step--left'
                      : 'learning-path__step learning-path__step--right'
                  }
                >
                  <div className="learning-path__step-shell">
                    <button
                      type="button"
                      className={nodeCls.join(' ')}
                      aria-expanded={sheetOpen && focusDay?.id === day.id}
                      aria-controls={sheetTitleId}
                      aria-label={
                        day.status === 'coming'
                          ? `Day ${day.id} · ${day.title} · 준비 중`
                        : day.status === 'locked'
                          ? `Day ${day.id} · ${day.title} · 잠금`
                          : `Day ${day.id} · ${day.title}`
                      }
                      onClick={() => {
                        setFocusDay(day)
                      }}
                    >
                      <span className="learning-path__node-face" aria-hidden>
                        {nodeLockedVisually ? (
                          <span className="learning-path__node-lock">⊘</span>
                        ) : (
                          <span className="learning-path__node-star">★</span>
                        )}
                      </span>
                    </button>
                    <span className="learning-path__node-caption-wrap">
                      <span className="learning-path__node-caption">{day.title}</span>
                      {day.status === 'coming' ? (
                        <span className="learning-path__status-pill learning-path__status-pill--locked">
                          준비 중
                        </span>
                      ) : day.status === 'locked' ? (
                        <span className="learning-path__status-pill learning-path__status-pill--progress-lock">
                          잠금
                        </span>
                      ) : doneFlag ? (
                        <span className="learning-path__status-pill learning-path__status-pill--done">
                          완료
                        </span>
                      ) : currentOpenDayId !== undefined &&
                        currentOpenDayId === day.id ? (
                        <span className="learning-path__status-pill learning-path__status-pill--ready-now">
                          이번 Day
                        </span>
                      ) : (
                        <span className="learning-path__status-pill learning-path__status-pill--ready">
                          진행 가능
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </main>

      {focusDay !== null ? (
        <div className="learning-path-float-root">
          <button
            type="button"
            className="learning-path-float-backdrop"
            aria-label="레슨 카드 닫기"
            onClick={() => {
              setFocusDay(null)
            }}
          />

          <div
            className="learning-path-float-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={sheetTitleId}
          >
            <div className="learning-path-float__nub" aria-hidden />
            <h2 id={sheetTitleId} className="learning-path-float__title">
              {focusDay.title}
            </h2>
            <p className="learning-path-float__meta">
              {(() => {
                const doneFlag = completeDayIds?.has(focusDay.id) === true
                const status =
                  focusDay.status === 'open' ? '진행 가능'
                  : focusDay.status === 'locked' ? '잠금'
                  : '준비 중'
                const doneSuffix = doneFlag ? ' · 완료' : ''
                return `Day ${focusDay.id} · ${status}${doneSuffix}`
              })()}
            </p>
            {focusDay.status === 'locked' && focusDay.prerequisiteDayId !== undefined ?
              <p className="learning-path-float__hint">
                Day {focusDay.prerequisiteDayId}을(를) 먼저 완료하면 열립니다.
              </p>
            : null}
            {focusDay.status === 'open' && sheetCoinShort && startGate !== undefined ?
              <p className="learning-path-float__hint learning-path-float__hint--gate">
                보유 코인 {startGate.coins}개로는 시작할 수 없습니다. 홈에서 오늘의 코인을 받아 주세요.
              </p>
            : null}
            <div className="learning-path-float__actions">
              {focusDay.status === 'open' ? (
                sheetCoinShort ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--block"
                    disabled
                  >
                    코인 부족 · 시작할 수 없음
                  </button>
                ) : (
                  <Link
                    ref={ctaRef}
                    className="ui-btn ui-btn--primary ui-btn--block learning-path-float__cta"
                    to={`${basePath}/${focusDay.id}`}
                    onClick={() => {
                      setFocusDay(null)
                    }}
                  >
                    {completeDayIds?.has(focusDay.id) === true ? '복습하기' : '시작하기'}
                  </Link>
                )
              ) : focusDay.status === 'locked' ? (
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--block" disabled>
                  순차 학습 후 이용할 수 있습니다
                </button>
              ) : (
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--block" disabled>
                  준비 중입니다
                </button>
              )}
              <button
                ref={closeBtnRef}
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--block learning-path-float__close"
                onClick={() => {
                  setFocusDay(null)
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
