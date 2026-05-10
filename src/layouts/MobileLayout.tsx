/**
 * 모바일 앱 형태의 공통 프레임: 상단 헤더(플레이스홀더 로고·설정 링크), 스크롤 가능한 본문(Outlet), 하단 탭 네비게이션.
 */
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MobileStatsBar } from '../components/layout/MobileStatsBar'
import { BottomTabBar } from '../components/navigation/BottomTabBar'
import './MobileLayout.css'

function resolveMainTabStates(pathname: string): {
  info: boolean
} {
  return {
    info: pathname === '/info',
  }
}

function settingsClassName(isActive: boolean): string {
  return isActive
    ? 'mobile-header__settings mobile-header__settings--active'
    : 'mobile-header__settings'
}

export default function MobileLayout() {
  const { pathname } = useLocation()
  const tabs = resolveMainTabStates(pathname)

  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <MobileStatsBar />
        <div className="mobile-header__brand-row">
          <div className="mobile-header__logo" aria-hidden>
            LOGO
          </div>
          <div className="mobile-header__title">하데스 보카</div>
          <NavLink
            to="/info"
            className={() => settingsClassName(tabs.info)}
            end
          >
            설정
          </NavLink>
        </div>
      </header>

      <div className="mobile-content">
        <Outlet />
      </div>

      <BottomTabBar />
    </div>
  )
}
