/**
 * 설정 — 하단 슬라이드 시트 · 메뉴 / 도움말 / 저작권 / 초기화 하위 화면.
 *
 * 초기화(Phase 12-0-C):
 * - 서버 로그아웃이 아니다. localStorage 의 `UserProgress` 단일 키만 삭제하는 게스트 초기화다.
 * - `MobileLayout` 의 외부 진입(`location.state.appSettings`)으로는 `'reset'` 이 들어오지
 *   못하도록 진입 화이트리스트가 `menu / help / copyright` 로 좁혀져 있다.
 */
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import {
  clearUserProgress,
  downloadUserProgressBackup,
  importUserProgressFromJsonText,
  persistUserProgressManualTouch,
} from '../../utils/storage'

import './AppSheets.css'

export type AppSettingsView = 'menu' | 'help' | 'copyright' | 'reset'

export type AppSettingsSheetProps = Readonly<{
  open: boolean
  onClose: () => void
  initialView?: AppSettingsView
}>

export function AppSettingsSheet({
  open,
  onClose,
  initialView = 'menu',
}: AppSettingsSheetProps) {
  const uid = useId()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [view, setView] = useState<AppSettingsView>('menu')
  const [stickyHint, setStickyHint] = useState<string | null>(null)
  const [bodyHint, setBodyHint] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setView(initialView)
      setStickyHint(null)
      setBodyHint(null)
    })
    return () => {
      cancelled = true
    }
  }, [open, initialView])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (view !== 'menu') {
          setView('menu')
          return
        }
        onClose()
      }
    }
    document.addEventListener('keydown', onDoc)
    return () => document.removeEventListener('keydown', onDoc)
  }, [open, onClose, view])

  const onPickImport = useCallback((): void => {
    setStickyHint(null)
    setBodyHint(null)
    fileRef.current?.click()
  }, [])

  const onExport = useCallback((): void => {
    setStickyHint(null)
    setBodyHint(null)
    downloadUserProgressBackup()
    setStickyHint('JSON 파일을 받았는지 확인해 주세요.')
  }, [])

  const onManualSave = useCallback((): void => {
    setStickyHint(null)
    setBodyHint(null)
    const ok = persistUserProgressManualTouch()
    setStickyHint(ok ? '기기에 진행도를 반영했습니다.' : '저장에 실패했습니다. 브라우저 설정을 확인해 주세요.')
  }, [])

  const onConfirmReset = useCallback((): void => {
    setBodyHint(null)
    setStickyHint(null)
    const ok = clearUserProgress()
    if (!ok) {
      setBodyHint('초기화에 실패했습니다. 브라우저 저장소 설정을 확인해 주세요.')
      return
    }
    onClose()
    setView('menu')
    navigate('/onboarding', { replace: true })
  }, [navigate, onClose])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = (): void => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const res = importUserProgressFromJsonText(text)
      if (res.ok) {
        setBodyHint('불러오기를 완료했습니다.')
        setStickyHint(null)
      } else {
        setBodyHint(res.message)
        setStickyHint(null)
      }
    }
    reader.onerror = (): void => {
      setBodyHint('파일을 읽지 못했습니다.')
      setStickyHint(null)
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  if (!open || typeof document === 'undefined') return null

  const grabId = `${uid}-grab`
  const titleId = `${uid}-title`

  const menu = (
    <>
      <p className="shell-sheet-intro">
        로그인 없이 이 기기 안에만 학습 기록이 저장됩니다. 교체·백업 시 JSON으로 내보내세요.
      </p>
      <button
        type="button"
        className="shell-settings-menu-row"
        onClick={() => {
          setBodyHint(null)
          onExport()
        }}
      >
        <span className="shell-settings-menu-row__icon" aria-hidden>
          ⬇️
        </span>
        진행 데이터 저장하기
        <span className="shell-settings-menu-row__chevron" aria-hidden />
      </button>
      <button type="button" className="shell-settings-menu-row" onClick={onPickImport}>
        <span className="shell-settings-menu-row__icon" aria-hidden>
          ⬆️
        </span>
        JSON 불러오기
        <span className="shell-settings-menu-row__chevron" aria-hidden />
      </button>
      <button type="button" className="shell-settings-menu-row" onClick={onManualSave}>
        <span className="shell-settings-menu-row__icon" aria-hidden>
          💾
        </span>
        진행도 기기에 다시 저장
        <span className="shell-settings-menu-row__chevron" aria-hidden />
      </button>
      <button
        type="button"
        className="shell-settings-menu-row"
        onClick={() => {
          setBodyHint(null)
          setStickyHint(null)
          setView('help')
        }}
      >
        <span className="shell-settings-menu-row__icon" aria-hidden>
          ❓
        </span>
        도움말
        <span className="shell-settings-menu-row__chevron">›</span>
      </button>
      <button
        type="button"
        className="shell-settings-menu-row"
        onClick={() => {
          setBodyHint(null)
          setStickyHint(null)
          setView('copyright')
        }}
      >
        <span className="shell-settings-menu-row__icon" aria-hidden>
          ©
        </span>
        저작권 · 고지
        <span className="shell-settings-menu-row__chevron">›</span>
      </button>
      <button
        type="button"
        className="shell-settings-menu-row shell-settings-menu-row--danger"
        onClick={() => {
          setBodyHint(null)
          setStickyHint(null)
          setView('reset')
        }}
      >
        <span
          className="shell-settings-menu-row__icon shell-settings-menu-row__icon--danger"
          aria-hidden
        >
          ↺
        </span>
        처음부터 다시 시작
        <span className="shell-settings-menu-row__chevron">›</span>
      </button>
      <input
        ref={fileRef}
        className="shell-file-input-hidden"
        type="file"
        accept="application/json,.json"
        tabIndex={-1}
        onChange={onFileChange}
      />
    </>
  )

  const help = (
    <div className="shell-settings-submenu">
      <button
        type="button"
        className="shell-settings-back"
        onClick={() => {
          setView('menu')
          setBodyHint(null)
        }}
      >
        ← 메뉴
      </button>
      <ul className="shell-help-list">
        <li>
          <strong>최근 학습:</strong> 마지막 학습 위치는 홈에 표시됩니다.
        </li>
        <li>
          <strong>Day 복습:</strong> 완료한 Day는 다시 풀 수 있습니다.
        </li>
        <li>
          <strong>보상:</strong> 완료한 Day를 다시 풀면 보상은 중복 지급되지 않습니다.
        </li>
        <li>
          <strong>오답노트:</strong> 오답은 오답노트에 저장됩니다.
        </li>
        <li>
          <strong>단어장:</strong> 저장한 단어와 표현은 단어장에서 확인할 수 있습니다.
        </li>
        <li>
          <strong>JSON:</strong> 이 기기의 학습 기록 백업·복원용입니다.
        </li>
        <li>
          <strong>Stage 가져오기:</strong> 콘텐츠 가져오기는 준비 중입니다.
        </li>
        <li>
          <strong>다시 시작:</strong> 이 기기의 학습 기록이 삭제됩니다.
        </li>
      </ul>
    </div>
  )

  const copyright = (
    <div className="shell-settings-submenu">
      <button
        type="button"
        className="shell-settings-back"
        onClick={() => {
          setView('menu')
          setBodyHint(null)
        }}
      >
        ← 메뉴
      </button>
      <h3 className="shell-copyright__subhead">팬메이드 고지</h3>
      <p className="shell-copyright__body">
        본 앱은 팬메이드 학습용 프로젝트이며,
        <strong> SOOP 및 하데스 공식 콘텐츠와 무관합니다.</strong>
      </p>
      <h3 className="shell-copyright__subhead">앱 구현 및 권리</h3>
      <p className="shell-copyright__body">
        구현(소스코드·UI 등)에 대한 권리는 <strong>개인 개발자 데브케이</strong>
        （연락:{' '}
        <a className="shell-copyright__mailto" href="mailto:fatking25@kakao.com">
          fatking25@kakao.com
        </a>
        ）에게 있습니다.
      </p>
    </div>
  )

  const reset = (
    <div className="shell-settings-submenu">
      <button
        type="button"
        className="shell-settings-back"
        onClick={() => {
          setView('menu')
          setBodyHint(null)
        }}
      >
        ← 메뉴
      </button>
      <h3 className="shell-copyright__subhead">처음부터 다시 시작</h3>
      <p className="shell-copyright__body">
        현재 학습 기록, 단어장, 오답노트가 이 브라우저에서 삭제됩니다.
      </p>
      <p className="shell-copyright__body">
        백업이 필요하면 먼저{' '}
        <strong>“진행 데이터 저장하기”</strong> 를 진행해 주세요.
      </p>
      <p className="shell-copyright__body">처음부터 다시 시작할까요?</p>
      <div className="shell-settings-confirm-actions">
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          onClick={() => {
            setView('menu')
            setBodyHint(null)
          }}
        >
          취소
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--primary shell-settings-confirm-cta--danger"
          onClick={onConfirmReset}
        >
          다시 시작
        </button>
      </div>
    </div>
  )

  let headline = '설정'
  let subtitle = '메뉴에서 항목을 선택하세요'
  if (view === 'help') {
    headline = '도움말'
    subtitle = ''
  }
  if (view === 'copyright') {
    headline = '저작권 · 고지'
    subtitle = ''
  }
  if (view === 'reset') {
    headline = '처음부터 다시 시작'
    subtitle = '이 브라우저의 학습 기록을 모두 삭제합니다'
  }

  return createPortal(
    <div className="shell-overlay-stack" role="presentation">
      <button type="button" className="shell-overlay-backdrop" aria-label="설정 닫기" onClick={onClose} />
      <div
        id="app-settings-sheet"
        className="shell-settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={view === 'menu' ? grabId : undefined}
      >
        <button id={grabId} type="button" className="shell-settings-sheet__grab" aria-hidden tabIndex={-1} />
        <div className="shell-settings-sheet__head">
          <div className="shell-settings-sheet__titles">
            <h2 id={titleId} className="shell-settings-sheet__title">
              {headline}
            </h2>
            {subtitle !== '' ? <p className="shell-settings-sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="shell-settings-sheet__body">
          {view === 'menu' ? menu : null}
          {view === 'help' ? help : null}
          {view === 'copyright' ? copyright : null}
          {view === 'reset' ? reset : null}
          {bodyHint !== null ? (
            <p
              role="status"
              className={`shell-sheet-hint-here ${
                bodyHint.startsWith('불러오기') ? 'shell-sheet-hint-here--ok' : 'shell-sheet-hint-here--warn'
              }`}
            >
              {bodyHint}
            </p>
          ) : null}
        </div>
        <p className="shell-settings-sheet__sticky-hint" aria-label="앱 진행 버전">
          {stickyHint !== null ?
            stickyHint
          : '진행 기록은 이 기기에 저장됩니다. 상단 닉네임을 탭하면 프로필을 수정할 수 있습니다.'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
