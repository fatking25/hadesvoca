/**
 * 모바일 앱 형태의 공통 프레임: 상단 헤더, 본문, 하단 탭. 설정은 시트 오버레이.
 */
import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { AppSettingsView } from '../components/layout/AppSettingsSheet'
import { AppSettingsSheet } from '../components/layout/AppSettingsSheet'
import { MobileStatsBar } from '../components/layout/MobileStatsBar'
import { ProfileNickSheet } from '../components/layout/ProfileNickSheet'
import { BottomTabBar } from '../components/navigation/BottomTabBar'
import './MobileLayout.css'

type LaunchSettingsState = Readonly<{ appSettings?: AppSettingsView }>

export default function MobileLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsEntryView, setSettingsEntryView] = useState<AppSettingsView>('menu')

  useEffect(() => {
    const lock = profileOpen || settingsOpen
    if (!lock) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return (): void => {
      document.body.style.overflow = prev
    }
  }, [profileOpen, settingsOpen])

  useEffect(() => {
    const raw = location.state as LaunchSettingsState | null | undefined
    const panel = raw?.appSettings
    if (
      panel !== 'copyright'
      && panel !== 'help'
      && panel !== 'menu'
    ) {
      return
    }
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setProfileOpen(false)
      setSettingsEntryView(panel)
      setSettingsOpen(true)
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: {},
      })
    })
    return () => {
      cancelled = true
    }
  }, [location, navigate])

  const closeSettings = useCallback((): void => {
    setSettingsOpen(false)
    setSettingsEntryView('menu')
  }, [])

  const openSettingsMenu = useCallback((): void => {
    setProfileOpen(false)
    setSettingsEntryView('menu')
    setSettingsOpen(true)
  }, [])

  return (
    <div className="mobile-shell">
      <ProfileNickSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AppSettingsSheet open={settingsOpen} onClose={closeSettings} initialView={settingsEntryView} />

      <header className="mobile-header">
        <div className="mobile-header__brand" aria-label="앱 브랜드">
          <span
            className="mobile-header__logo"
            role="img"
            aria-label="하데스 보카 로고"
          >
            🦉
          </span>
          <span className="mobile-header__title">하데스 보카</span>
        </div>
        <MobileStatsBar
          onProfilePress={() => {
            setSettingsOpen(false)
            setProfileOpen(true)
          }}
        />
        <button
          type="button"
          className={
            settingsOpen
              ? 'mobile-header__settings mobile-header__settings--active'
              : 'mobile-header__settings'
          }
          aria-expanded={settingsOpen}
          aria-controls="app-settings-sheet"
          aria-label="메뉴 · 설정 열기"
          onClick={() => {
            openSettingsMenu()
          }}
        >
          메뉴
        </button>
      </header>

      <div className="mobile-content">
        <Outlet />
      </div>

      <BottomTabBar />
    </div>
  )
}
