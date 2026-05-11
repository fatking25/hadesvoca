/**
 * 게스트 프로필 초기 설정 화면(Phase 12-0).
 *
 * 정책:
 * - 닉네임이 비어 있을 때 보호 라우트(`RequireOnboarding`) 가 이 화면으로 redirect 한다.
 * - 입력 닉네임은 trim 후 1자 이상일 때만 저장한다(빈 닉네임 저장 금지).
 * - 저장은 기존 `persistNickname` 단일 진입점만 사용한다(=`saveUserProgress` 안에서
 *   sanitize / `HADES_USER_PROGRESS_EVENT` dispatch 가 함께 처리됨).
 * - localStorage 키(`hadesvoca:userProgress`) 와 schema version 은 변경하지 않는다.
 * - 서버/로그인/회원가입/JWT 호출은 없다. 게스트 전용.
 * - 라우트 state 의 `from` 이 있으면 그 경로로 돌려보내고, 없으면 `/home` 으로 이동한다.
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

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
  if (!isOnboardingLocationState(state)) return '/home'
  const from = state.from
  if (typeof from !== 'string' || from.length === 0) return '/home'
  if (!from.startsWith('/')) return '/home'
  if (from === '/onboarding') return '/home'
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
        <h1 className="onboarding-page__title">하데스 보카 시작하기</h1>
        <p className="onboarding-page__desc">
          학습 기록을 저장할 닉네임을 설정해주세요.
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
