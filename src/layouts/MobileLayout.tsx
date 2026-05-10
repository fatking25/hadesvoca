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
import { downloadUserProgressBackup } from '../utils/storage'
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
    setProfileOpen(false)
    setSettingsEntryView(panel)
    setSettingsOpen(true)
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: {},
    })
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
        <MobileStatsBar
          onProfilePress={() => {
            setSettingsOpen(false)
            setProfileOpen(true)
          }}
        />
        <div className="mobile-header__brand-row">
          <div className="mobile-header__logo" aria-hidden>
            LOGO
          </div>
          <div className="mobile-header__title">하데스 보카</div>
          <div className="mobile-header__actions">
            <button
              type="button"
              className="mobile-header__quick-save"
              aria-label="진행도 JSON 저장"
              onClick={() => {
                downloadUserProgressBackup()
              }}
            >
              저장
            </button>
            <button
              type="button"
              className={
                settingsOpen
                  ? 'mobile-header__settings mobile-header__settings--active'
                  : 'mobile-header__settings'
              }
              aria-expanded={settingsOpen}
              aria-controls="app-settings-sheet"
              onClick={() => {
                openSettingsMenu()
              }}
            >
              설정
            </button>
          </div>
        </div>
      </header>

      <div className="mobile-content">
        <Outlet />
      </div>

      <BottomTabBar />
    </div>
  )
}
