import { NavLink, useLocation } from 'react-router-dom'
import { APP_ROUTES } from '../../constants/routes'

function tabClass(isActive: boolean): string {
  return isActive ? 'ui-btn ui-btn--nav ui-btn--active' : 'ui-btn ui-btn--nav'
}

function tabStates(pathname: string): {
  home: boolean
  word: boolean
  conversation: boolean
  vocabulary: boolean
  wrong: boolean
} {
  return {
    home: pathname === APP_ROUTES.home,
    word: pathname === APP_ROUTES.wordStudy || pathname.startsWith(`${APP_ROUTES.wordStudy}/`),
    conversation:
      pathname === APP_ROUTES.conversation || pathname.startsWith(`${APP_ROUTES.conversation}/`),
    vocabulary:
      pathname === APP_ROUTES.vocabularyBook || pathname.startsWith(`${APP_ROUTES.vocabularyBook}/`),
    wrong: pathname === APP_ROUTES.wrongNote || pathname.startsWith(`${APP_ROUTES.wrongNote}/`),
  }
}

export function BottomTabBar() {
  const { pathname } = useLocation()
  const tabs = tabStates(pathname)

  return (
    <nav className="mobile-tabbar" aria-label="주요 메뉴">
      <NavLink to={APP_ROUTES.home} className={() => tabClass(tabs.home)} end>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            H
          </span>
          <span className="mobile-tab__label">홈</span>
        </span>
      </NavLink>
      <NavLink to={APP_ROUTES.wordStudy} className={() => tabClass(tabs.word)} end={false}>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            W
          </span>
          <span className="mobile-tab__label">단어</span>
        </span>
      </NavLink>
      <NavLink to={APP_ROUTES.conversation} className={() => tabClass(tabs.conversation)} end={false}>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            C
          </span>
          <span className="mobile-tab__label">회화</span>
        </span>
      </NavLink>
      <NavLink to={APP_ROUTES.vocabularyBook} className={() => tabClass(tabs.vocabulary)} end>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            B
          </span>
          <span className="mobile-tab__label">단어장</span>
        </span>
      </NavLink>
      <NavLink to={APP_ROUTES.wrongNote} className={() => tabClass(tabs.wrong)} end>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            N
          </span>
          <span className="mobile-tab__label">오답</span>
        </span>
      </NavLink>
    </nav>
  )
}
