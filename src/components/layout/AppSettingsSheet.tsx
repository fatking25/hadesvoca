/**
 * 설정 — 하단 슬라이드 시트 · 메뉴 / 도움말 / 저작권 하위 화면.
 */
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'

import {
  downloadUserProgressBackup,
  importUserProgressFromJsonText,
  persistUserProgressManualTouch,
} from '../../utils/storage'

import './AppSheets.css'

export type AppSettingsView = 'menu' | 'help' | 'copyright'

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
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [view, setView] = useState<AppSettingsView>('menu')
  const [stickyHint, setStickyHint] = useState<string | null>(null)
  const [bodyHint, setBodyHint] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setView(initialView)
    setStickyHint(null)
    setBodyHint(null)
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
          <strong>단어 학습:</strong> Stage·Day를 풀고 결과에서 진행이 저장됩니다. 즐겨찾기는 참조만
          저장됩니다.
        </li>
        <li>
          <strong>실전 회화:</strong> 퀴즈까지 마치면 Day 완료로 기록됩니다.
        </li>
        <li>
          <strong>단어장:</strong> 단어·표현 본문은 콘텐츠 파일에서 불러오고, 기기에는 ID만 둡니다.
        </li>
        <li>
          <strong>오답노트:</strong> 서버 전송 없이 기기 안에서만 참조합니다.
        </li>
        <li>
          <strong>PWA:</strong> 홈 화면에 추가하면 브라우저 없이 앱처럼 쓸 수 있습니다.
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
          : '보카 사용자 진행 스키마 version 3 · 좌측 상단 이름을 탭하면 프로필 수정'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
