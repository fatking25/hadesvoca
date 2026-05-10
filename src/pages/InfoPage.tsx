/**
 * 설정·정보: 저장·불러오기·환경·도움말·저작권.
 */
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useLocation } from 'react-router-dom'

import {
  HADES_USER_PROGRESS_EVENT,
  downloadUserProgressBackup,
  importUserProgressFromJsonText,
  loadUserProgress,
  persistNickname,
  persistUserProgressManualTouch,
} from '../utils/storage'

import './InfoPage.css'

export default function InfoPage() {
  const { hash } = useLocation()
  const fileInputId = useId()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [rev, setRev] = useState(0)
  const [nickDraft, setNickDraft] = useState('')
  const [dataHint, setDataHint] = useState<string | null>(null)
  const [importHint, setImportHint] = useState<string | null>(null)

  const bump = useCallback(() => setRev((k) => k + 1), [])

  useEffect(() => {
    const map: Record<string, string> = {
      '#info-copyright': 'info-copyright',
      '#info-profile': 'info-profile',
      '#info-save': 'info-save',
      '#info-import': 'info-import',
      '#info-prefs': 'info-prefs',
      '#info-help': 'info-help',
    }
    const id = map[hash]
    if (id !== undefined) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hash])

  useEffect(() => {
    void rev
    setNickDraft(loadUserProgress().nickname)
  }, [rev])

  useEffect(() => {
    const onProg = (): void => bump()
    window.addEventListener(HADES_USER_PROGRESS_EVENT, onProg)
    return () => window.removeEventListener(HADES_USER_PROGRESS_EVENT, onProg)
  }, [bump])

  const onSaveProgress = useCallback((): void => {
    setImportHint(null)
    const ok = persistUserProgressManualTouch()
    setDataHint(ok ? '기기에 진행도를 다시 저장했습니다.' : '저장에 실패했습니다. 사생활 보호 모드를 확인해 주세요.')
  }, [])

  const onExport = useCallback((): void => {
    setImportHint(null)
    downloadUserProgressBackup()
    setDataHint('JSON 파일을 받았는지 확인해 주세요.')
  }, [])

  const onNicknameSave = useCallback((): void => {
    setImportHint(null)
    persistNickname(nickDraft)
    setDataHint('닉네임을 저장했습니다.')
    bump()
  }, [nickDraft, bump])

  const onPickImport = useCallback((): void => {
    fileRef.current?.click()
  }, [])

  const onFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (file === undefined) return
      const reader = new FileReader()
      reader.onload = (): void => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        const res = importUserProgressFromJsonText(text)
        if (res.ok) {
          setImportHint('불러오기를 완료했습니다.')
          setDataHint(null)
          bump()
        } else {
          setImportHint(res.message)
        }
      }
      reader.onerror = (): void => {
        setImportHint('파일을 읽지 못했습니다.')
      }
      reader.readAsText(file, 'utf-8')
    },
    [bump],
  )

  return (
    <main className="info-page">
      <h1 className="info-page__title">설정</h1>

      <nav className="info-page__toc" aria-label="설정 구역 이동">
        <a className="info-page__toc-link" href="#info-save">
          저장하기
        </a>
        <a className="info-page__toc-link" href="#info-import">
          불러오기
        </a>
        <a className="info-page__toc-link" href="#info-prefs">
          환경설정
        </a>
        <a className="info-page__toc-link" href="#info-help">
          도움말
        </a>
        <a className="info-page__toc-link" href="#info-copyright">
          저작권 정보
        </a>
      </nav>

      <section
        id="info-save"
        className="info-section ui-card ui-card--info"
        aria-labelledby="info-save-heading"
      >
        <h2 id="info-save-heading" className="ui-card__title">
          저장하기
        </h2>
        <p className="info-section__lead ui-card__body">
          학습 진행 데이터(<code>hadesvoca:userProgress</code>)만 포함한 JSON 파일로 내보냅니다. 단어·회화 본문
          콘텐츠는 포함하지 않습니다.
        </p>
        <div className="info-actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onExport}>
            JSON 저장(내보내기)
          </button>
        </div>
      </section>

      <section
        id="info-import"
        className="info-section ui-card ui-card--info"
        aria-labelledby="info-import-heading"
      >
        <h2 id="info-import-heading" className="ui-card__title">
          불러오기
        </h2>
        <p className="info-section__lead ui-card__body">
          이전에 내보낸 진행 데이터 JSON을 불러오면 현재 브라우저의 진행 상태를 덮어씁니다.
        </p>
        <div className="info-actions">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onPickImport}>
            JSON 불러오기
          </button>
        </div>
        <input
          ref={fileRef}
          id={fileInputId}
          className="info-file-input"
          type="file"
          accept="application/json,.json"
          tabIndex={-1}
          onChange={onFileChange}
        />
      </section>

      <section
        id="info-prefs"
        className="info-section ui-card ui-card--info"
        aria-labelledby="info-prefs-heading"
      >
        <h2 id="info-prefs-heading" className="ui-card__title">
          환경설정 (MVP)
        </h2>
        <p className="info-section__lead ui-card__body">
          로그인 없이 브라우저 <strong>localStorage</strong>에만 진행 상태를 둡니다. 기기 교체 전에는 저장하기로
          JSON 백업을 권장합니다.
        </p>
        <div className="info-actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={onSaveProgress}>
            진행도 수동 저장
          </button>
        </div>
      </section>

      <section
        id="info-profile"
        className="info-section ui-card ui-card--dashboard"
        aria-labelledby="info-profile-heading"
      >
        <h2 id="info-profile-heading" className="ui-card__section-heading">
          프로필
        </h2>
        <p className="info-section__lead ui-card__body">
          상단 배지에 표시되는 이름입니다. 기기에만 저장됩니다.
        </p>
        <div className="info-field-row">
          <label className="info-field" htmlFor="info-nickname-input">
            닉네임
            <input
              id="info-nickname-input"
              className="info-field__input"
              type="text"
              maxLength={32}
              autoComplete="nickname"
              value={nickDraft}
              onChange={(e) => setNickDraft(e.target.value)}
              placeholder="예: 하데스 팬"
            />
          </label>
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onNicknameSave}>
            닉네임 저장
          </button>
        </div>
      </section>

      <section
        id="info-help"
        className="info-section ui-card ui-card--dashboard"
        aria-labelledby="info-help-heading"
      >
        <h2 id="info-help-heading" className="ui-card__title">
          도움말
        </h2>
        <ul className="info-card__list">
          <li>
            <strong>단어 학습:</strong> Stage·Day별로 문제를 풀고 결과 화면에서 진행도가 저장됩니다. 즐겨찾은 단어는
            참조만 기기에 남습니다.
          </li>
          <li>
            <strong>실전 회화:</strong> 대화 플레이 후 퀴즈를 마치면 회화 Day 완료로 기록됩니다.
          </li>
          <li>
            <strong>단어장:</strong> 저장한 단어와 표현의 ID만 보관합니다. 뜻·문장은 콘텐츠 JSON에서 불러와
            표시합니다.
          </li>
          <li>
            <strong>오답노트:</strong> 단어 퀴즈·표현 퀴즈에서 틀린 항목이 참조로 쌓입니다. 별도 서버로 전송하지
            않습니다.
          </li>
          <li>
            <strong>PWA:</strong> 홈 화면에 추가하면 브라우저 없이 앱처럼 실행할 수 있습니다.
          </li>
        </ul>
      </section>

      <section
        id="info-copyright"
        className="info-copyright ui-card ui-card--info-accent"
        aria-labelledby="info-copyright-heading"
      >
        <h2 id="info-copyright-heading" className="ui-card__section-heading">
          저작권 정보
        </h2>

        <h3 className="info-copyright__subhead">팬메이드 고지</h3>
        <p className="info-copyright__body ui-card__body">
          본 앱은 팬메이드 학습용 프로젝트이며,
          <strong> SOOP 및 하데스 공식 콘텐츠와 무관합니다.</strong>
          배포 전 실존 그룹명, 멤버명, 이미지, 캐릭터성 사용 가능 범위를 반드시 재확인하세요.
        </p>

        <h3 className="info-copyright__subhead">앱 구현 및 권리</h3>
        <p className="info-copyright__body ui-card__body">
          본 애플리케이션의 구현(소스코드·프로그램 구조·UI 등)에 대한 권리는{' '}
          <strong>개인 개발자 데브케이</strong>(연락:{' '}
          <a className="info-copyright__mailto" href="mailto:fatking25@kakao.com">
            fatking25@kakao.com
          </a>
          )에게 있습니다. 팬 콘텐츠·원저작과 별개로, 앱 자체의 창작·개발에 대한 표시를 유지해 주세요.
        </p>
      </section>

      {dataHint !== null ? (
        <p className="info-hint info-hint--ok" role="status">
          {dataHint}
        </p>
      ) : null}
      {importHint !== null ? (
        <p
          className={
            importHint.startsWith('불러오기') ? 'info-hint info-hint--ok' : 'info-hint info-hint--warn'
          }
          role="status"
        >
          {importHint}
        </p>
      ) : null}

      <p className="info-meta" aria-label="앱 버전">
        보카 사용자 진행 스키마 version 3 · 앱 빌드 placeholder 0.0.0
      </p>
    </main>
  )
}
