import { useEffect, useId, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { APP_ROUTES } from '../constants/routes'
import {
  hasNicknameOnboardingCompleted,
  persistNickname,
} from '../utils/storage'
import './OnboardingPage.css'

type OnboardingLocationState = Readonly<{ from?: string }>

function isOnboardingLocationState(x: unknown): x is OnboardingLocationState {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return o.from === undefined || typeof o.from === 'string'
}

function pickReturnPath(state: unknown): string {
  if (!isOnboardingLocationState(state)) return APP_ROUTES.home
  const from = state.from
  if (typeof from !== 'string' || from.length === 0) return APP_ROUTES.home
  if (!from.startsWith('/')) return APP_ROUTES.home
  if (from === APP_ROUTES.onboarding) return APP_ROUTES.home
  return from
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const inputId = useId()
  const hintId = useId()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      if (hasNicknameOnboardingCompleted()) {
        navigate(pickReturnPath(location.state), { replace: true })
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [navigate, location.state])

  const trimmed = draft.trim()
  const isValid = trimmed.length > 0

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (!isValid) return
    persistNickname(trimmed)
    navigate(pickReturnPath(location.state), { replace: true })
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-page__head">
        <h1 className="onboarding-page__title">하데스보카 시작하기</h1>
        <p className="onboarding-page__desc">
          학습 기록에 표시할 닉네임을 설정해 주세요.
        </p>
      </header>

      <form className="onboarding-page__form" onSubmit={onSubmit} noValidate>
        <label className="onboarding-page__label" htmlFor={inputId}>
          닉네임
        </label>
        <input
          id={inputId}
          className="onboarding-page__input"
          type="text"
          inputMode="text"
          autoComplete="nickname"
          maxLength={32}
          placeholder="닉네임"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-required="true"
          aria-describedby={hintId}
        />
        <button
          type="submit"
          className="ui-btn ui-btn--primary ui-btn--block onboarding-page__cta"
          disabled={!isValid}
        >
          시작하기
        </button>
        <p id={hintId} className="onboarding-page__hint">
          로그인 없이 이 기기에만 학습 기록이 저장됩니다. 닉네임은 설정에서 언제든 바꿀 수 있어요.
        </p>
      </form>
    </main>
  )
}
