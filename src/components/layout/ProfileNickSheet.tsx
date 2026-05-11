/**
 * 좌측 상단 프로필: 성장 요약 · 통계 타일 · 닉네임 (텍스트 설명 최소화).
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import type { UserProgress } from '../../types/user-progress'
import { getTodayStudySessionCount } from '../../utils/learnStats'
import { deriveUserGradeLabel } from '../../utils/userGrade'
import { HADES_USER_PROGRESS_EVENT, loadUserProgress, persistNickname } from '../../utils/storage'

import './AppSheets.css'

export type ProfileNickSheetProps = Readonly<{
  open: boolean
  onClose: () => void
}>

/** 표시만: EXP 바 0~1 (저장 레벨업 공식과 별개) */
function visualExpSegmentRatio(exp: number): number {
  const seg = 500
  const e = Math.max(0, Math.floor(Number(exp) || 0))
  const r = (e % seg) / seg
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0
}

function compactCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const x = Math.max(0, Math.floor(n))
  if (x >= 1000000) return `${Math.round(x / 100000) / 10}M`
  if (x >= 10000) return `${Math.round(x / 1000)}k`
  if (x >= 1000) return `${Math.round(x / 100) / 10}k`.replace(/\.0k$/, 'k')
  return String(x)
}

export function ProfileNickSheet({ open, onClose }: ProfileNickSheetProps) {
  const uid = useId()
  const inputId = `${uid}-nickname`
  const nameHeadingId = `${uid}-disp-name`

  const [draft, setDraft] = useState('')
  const [p, setP] = useState<UserProgress>(() => loadUserProgress())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const next = loadUserProgress()
      setP(next)
      setDraft(next.nickname)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const bump = (): void => setP(loadUserProgress())
    window.addEventListener(HADES_USER_PROGRESS_EVENT, bump)
    return (): void => window.removeEventListener(HADES_USER_PROGRESS_EVENT, bump)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onDoc)
    return () => document.removeEventListener('keydown', onDoc)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const displayNick =
    p.nickname.trim() !== ''
      ? p.nickname.trim()
      : draft.trim() !== ''
        ? draft.trim()
        : '학습자'

  const tier = Math.max(1, Math.min(99, Math.floor(p.rankTier)))
  const goal = Math.max(1, Math.floor(p.dailyWordGoal) || 1)
  const today = getTodayStudySessionCount(p)
  const streak = Math.max(0, Math.floor(p.streakDays))
  const wordDays = p.completedWordDays.length
  const convDays = p.completedConversationDays.length
  const memo = Math.max(0, Math.floor(p.totalMemorizedWords))
  const coins = compactCount(p.coins)
  const grade = deriveUserGradeLabel(tier)
  const exp = Math.max(0, Math.floor(p.userExp))
  const fill = visualExpSegmentRatio(exp)

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    persistNickname(draft)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(HADES_USER_PROGRESS_EVENT))
    }
    onClose()
  }

  return createPortal(
    <div className="shell-overlay-stack shell-settings-stack--profile" role="presentation">
      <button
        type="button"
        className="shell-overlay-backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className="shell-profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={nameHeadingId}
      >
        <button
          type="button"
          className="ui-btn ui-btn--ghost shell-profile-sheet__close"
          aria-label="닫기"
          onClick={onClose}
        >
          ✕
        </button>

        <form onSubmit={onSubmit}>
          <h2 id={nameHeadingId} className="shell-profile-hero-name">
            {displayNick}
          </h2>

          <div className="shell-profile-lv-row">
            <span className="shell-profile-lv-badge" aria-label={`레벨 ${tier}`}>
              Lv{tier}
            </span>
            <p className="shell-profile-grade" title={grade}>
              {grade}
            </p>
          </div>

          <div className="shell-profile-exp" aria-label={`경험치 ${exp}`}>
            <div className="shell-profile-exp__track" aria-hidden>
              <div className="shell-profile-exp__fill" style={{ width: `${fill * 100}%` }} />
            </div>
            <span className="shell-profile-exp__num" title="EXP">
              {compactCount(exp)}
            </span>
          </div>

          <div className="shell-profile-metrics">
            <div className="shell-profile-tile" aria-label={`연속 ${streak}일`}>
              <span className="shell-profile-tile__val">{compactCount(streak)}</span>
              <span className="shell-profile-tile__lbl">연속</span>
            </div>
            <div className="shell-profile-tile" aria-label={`오늘 ${today}/${goal}`}>
              <span className="shell-profile-tile__val">
                {today}/{compactCount(goal)}
              </span>
              <span className="shell-profile-tile__lbl">오늘</span>
            </div>
            <div className="shell-profile-tile" aria-label={`단어 Day ${wordDays}`}>
              <span className="shell-profile-tile__val">{compactCount(wordDays)}</span>
              <span className="shell-profile-tile__lbl">단어</span>
            </div>
            <div className="shell-profile-tile" aria-label={`회화 Day ${convDays}`}>
              <span className="shell-profile-tile__val">{compactCount(convDays)}</span>
              <span className="shell-profile-tile__lbl">회화</span>
            </div>
            <div
              className="shell-profile-tile"
              aria-label={`누적 학습 단어 ${memo}개 (Day 완료 기준)`}
              title="누적 학습 단어 (Day 완료 기준)"
            >
              <span className="shell-profile-tile__val">{compactCount(memo)}</span>
              <span className="shell-profile-tile__lbl">학습</span>
            </div>
            <div className="shell-profile-tile" aria-label={`코인 ${p.coins}`}>
              <span className="shell-profile-tile__val">{coins}</span>
              <span className="shell-profile-tile__lbl">코인</span>
            </div>
          </div>

          <div className="shell-profile-foot">
            <label className="shell-sr-only" htmlFor={inputId}>
              닉네임
            </label>
            <input
              id={inputId}
              type="text"
              maxLength={32}
              autoComplete="nickname"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="닉네임"
            />
          </div>

          <div className="shell-profile-sheet__actions">
            <button type="submit" className="ui-btn ui-btn--primary">
              저장
            </button>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
