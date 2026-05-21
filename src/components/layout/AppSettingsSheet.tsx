import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { APP_ROUTES } from '../../constants/routes'
import {
  clearUserProgress,
  downloadUserProgressBackup,
  importUserProgressFromJsonText,
} from '../../utils/storage'
import { AudioSettingsPanel } from './AudioSettingsPanel'

import './AppSheets.css'

export type AppSettingsView = 'menu' | 'settings' | 'help' | 'copyright' | 'reset'

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

  const clearHints = useCallback((): void => {
    setStickyHint(null)
    setBodyHint(null)
  }, [])

  const goBackToMenu = useCallback((): void => {
    setView('menu')
    setBodyHint(null)
  }, [])

  const onPickImport = useCallback((): void => {
    clearHints()
    fileRef.current?.click()
  }, [clearHints])

  const onExport = useCallback((): void => {
    clearHints()
    downloadUserProgressBackup()
    setStickyHint('백업 파일을 저장했습니다. 다운로드 폴더를 확인해 주세요.')
  }, [clearHints])

  const onConfirmReset = useCallback((): void => {
    clearHints()
    const ok = clearUserProgress()
    if (!ok) {
      setBodyHint('초기화에 실패했습니다. 브라우저 저장소 설정을 확인해 주세요.')
      return
    }
    onClose()
    setView('menu')
    navigate(APP_ROUTES.onboarding, { replace: true })
  }, [clearHints, navigate, onClose])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = (): void => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const res = importUserProgressFromJsonText(text)
      if (res.ok) {
        setBodyHint('백업을 불러왔습니다.')
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
      <p className="shell-sheet-intro">학습 설정과 백업을 관리합니다.</p>
      <button type="button" className="shell-settings-menu-row" onClick={onExport}>
        <span className="shell-settings-menu-row__icon" aria-hidden>
          저장
        </span>
        백업하기
        <span className="shell-settings-menu-row__chevron" aria-hidden>
          ›
        </span>
      </button>
      <button type="button" className="shell-settings-menu-row" onClick={onPickImport}>
        <span className="shell-settings-menu-row__icon" aria-hidden>
          열기
        </span>
        백업 불러오기
        <span className="shell-settings-menu-row__chevron" aria-hidden>
          ›
        </span>
      </button>
      <button
        type="button"
        className="shell-settings-menu-row"
        onClick={() => {
          clearHints()
          setView('settings')
        }}
      >
        <span className="shell-settings-menu-row__icon" aria-hidden>
          소리
        </span>
        설정
        <span className="shell-settings-menu-row__chevron">›</span>
      </button>
      <button
        type="button"
        className="shell-settings-menu-row"
        onClick={() => {
          clearHints()
          setView('help')
        }}
      >
        <span className="shell-settings-menu-row__icon" aria-hidden>
          도움
        </span>
        도움말
        <span className="shell-settings-menu-row__chevron">›</span>
      </button>
      <button
        type="button"
        className="shell-settings-menu-row"
        onClick={() => {
          clearHints()
          setView('copyright')
        }}
      >
        <span className="shell-settings-menu-row__icon" aria-hidden>
          고지
        </span>
        저작권 · 고지
        <span className="shell-settings-menu-row__chevron">›</span>
      </button>
      <button
        type="button"
        className="shell-settings-menu-row shell-settings-menu-row--danger"
        onClick={() => {
          clearHints()
          setView('reset')
        }}
      >
        <span
          className="shell-settings-menu-row__icon shell-settings-menu-row__icon--danger"
          aria-hidden
        >
          초기화
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

  const settings = (
    <div className="shell-settings-submenu">
      <button type="button" className="shell-settings-back" onClick={goBackToMenu}>
        ← 메뉴
      </button>
      <AudioSettingsPanel />
    </div>
  )

  const help = (
    <div className="shell-settings-submenu">
      <button type="button" className="shell-settings-back" onClick={goBackToMenu}>
        ← 메뉴
      </button>
      <ul className="shell-help-list">
        <li>
          <strong>최근 학습:</strong> 마지막으로 학습한 위치를 홈에서 확인할 수 있습니다.
        </li>
        <li>
          <strong>Day 복습:</strong> 완료한 Day는 다시 풀 수 있습니다.
        </li>
        <li>
          <strong>보상:</strong> 완료 보상은 같은 Day에서 한 번만 지급됩니다.
        </li>
        <li>
          <strong>오답노트:</strong> 틀린 단어와 표현은 오답노트에 저장됩니다.
        </li>
        <li>
          <strong>단어장:</strong> 저장한 단어와 표현을 한곳에서 볼 수 있습니다.
        </li>
        <li>
          <strong>백업:</strong> 기기를 바꾸기 전 백업하기로 파일을 저장하고,
          새 기기에서는 백업 불러오기로 복원할 수 있습니다.
        </li>
        <li>
          <strong>다시 시작:</strong> 이 기기의 학습 기록만 삭제됩니다.
        </li>
      </ul>
    </div>
  )

  const copyright = (
    <div className="shell-settings-submenu">
      <button type="button" className="shell-settings-back" onClick={goBackToMenu}>
        ← 메뉴
      </button>
      <h3 className="shell-copyright__subhead">팬메이드 고지</h3>
      <p className="shell-copyright__body">
        본 앱은 팬메이드 학습용 앱이며,
        <strong> SOOP 및 하데스 공식 콘텐츠가 아닙니다.</strong>
      </p>
      <h3 className="shell-copyright__subhead">문의</h3>
      <p className="shell-copyright__body">
        앱 관련 문의:{' '}
        <a className="shell-copyright__mailto" href="mailto:fatking25@kakao.com">
          fatking25@kakao.com
        </a>
      </p>
    </div>
  )

  const reset = (
    <div className="shell-settings-submenu">
      <button type="button" className="shell-settings-back" onClick={goBackToMenu}>
        ← 메뉴
      </button>
      <h3 className="shell-copyright__subhead">처음부터 다시 시작</h3>
      <p className="shell-copyright__body">
        현재 학습 기록, 단어장, 오답노트가 이 브라우저에서 삭제됩니다.
      </p>
      <p className="shell-copyright__body">
        필요한 기록은 먼저 <strong>백업하기</strong>로 저장해 주세요.
      </p>
      <p className="shell-copyright__body">정말 처음부터 다시 시작할까요?</p>
      <div className="shell-settings-confirm-actions">
        <button type="button" className="ui-btn ui-btn--ghost" onClick={goBackToMenu}>
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
  let subtitle = '메뉴에서 항목을 선택하세요.'
  if (view === 'settings') {
    headline = '설정'
    subtitle = '소리 크기를 조절할 수 있습니다.'
  }
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
    subtitle = '이 브라우저의 학습 기록을 모두 삭제합니다.'
  }

  return createPortal(
    <div className="shell-overlay-stack" role="presentation">
      <button
        type="button"
        className="shell-overlay-backdrop"
        aria-label="설정 닫기"
        onClick={onClose}
      />
      <div
        className="shell-sheet shell-settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span id={grabId} className="shell-sheet__grab" aria-hidden />
        <header className="shell-sheet__header">
          <div>
            <p className="shell-sheet__eyebrow">하데스 보카</p>
            <h2 id={titleId} className="shell-sheet__title">
              {headline}
            </h2>
            {subtitle !== '' && <p className="shell-sheet__subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="shell-sheet__close"
            aria-label="설정 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="shell-sheet__body">
          {view === 'menu' && menu}
          {view === 'settings' && settings}
          {view === 'help' && help}
          {view === 'copyright' && copyright}
          {view === 'reset' && reset}
          {bodyHint !== null && (
            <p className="shell-settings-body-hint" role="status">
              {bodyHint}
            </p>
          )}
        </div>
        {stickyHint !== null && (
          <p className="shell-sheet__footer-hint" role="status">
            {stickyHint}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
