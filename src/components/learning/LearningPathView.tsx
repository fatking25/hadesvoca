/**
 * 학습 경로 목록 화면: 유닛 배너 · 지그재그 노드 · 듀오형 시작 시트 (placeholder 데이터 그대로).
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
  status: 'ready' | 'coming'
}>

export type LearningPathVariant = 'conversation' | 'word'

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
}: LearningPathViewProps) {
  const sheetTitleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const ctaRef = useRef<HTMLAnchorElement | null>(null)
  const prevActiveEl = useRef<Element | null>(null)

  const [focusDay, setFocusDay] = useState<LearningPathDay | null>(null)
  const sheetOpen = focusDay !== null

  useEffect(() => {
    if (!sheetOpen) return
    prevActiveEl.current = document.activeElement
    const id = window.requestAnimationFrame(() => {
      if (focusDay?.status === 'ready') {
        ctaRef.current?.focus({ preventScroll: true })
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
          <button type="button" className="learning-path__guide-slot" aria-label="가이드 placeholder">
            {guideAccessory ?? <span aria-hidden className="learning-path__guide-icon" />}
          </button>
        </section>

        {progressLine !== undefined && progressLine.trim() !== '' ? (
          <p className="learning-path__progress-line" aria-label="Stage 진행률">
            {progressLine}
          </p>
        ) : null}
        <p className="learning-path__screen-caption">{screenCaption}</p>

        <div className="learning-path__path-wrap">
          <div className="learning-path__spine" aria-hidden />
          <ol className="learning-path__steps">
            {days.map((day, idx) => {
              const locked = day.status === 'coming'
              const doneFlag = completeDayIds?.has(day.id) === true

              const nodeCls = ['learning-path__node']
              if (locked) nodeCls.push('learning-path__node--locked')
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
                      aria-label={`Day ${day.id} · ${day.title}${locked ? ' · 준비 중' : ''}`}
                      onClick={() => {
                        setFocusDay(day)
                      }}
                    >
                      <span className="learning-path__node-face" aria-hidden>
                        {locked ? (
                          <span className="learning-path__node-lock">⊘</span>
                        ) : (
                          <span className="learning-path__node-star">★</span>
                        )}
                      </span>
                    </button>
                    <span className="learning-path__node-caption-wrap">
                      <span className="learning-path__node-caption">{day.title}</span>
                      {locked ? (
                        <span className="learning-path__status-pill learning-path__status-pill--locked">
                          준비 중
                        </span>
                      ) : doneFlag ? (
                        <span className="learning-path__status-pill learning-path__status-pill--done">
                          완료
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
                  focusDay.status === 'ready' ? '진행 가능' : '준비 중'
                const doneSuffix = doneFlag ? ' · 완료' : ''
                return `Day ${focusDay.id} · ${status}${doneSuffix}`
              })()}
            </p>
            <div className="learning-path-float__actions">
              {focusDay.status === 'ready' ? (
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
