/**
 * 하단 고정 학습 네비게이션 탭바.
 */

import { NavLink, useLocation } from 'react-router-dom'

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
    home: pathname === '/home',
    word: pathname === '/word-study' || pathname.startsWith('/word-study/'),
    conversation:
      pathname === '/conversation' || pathname.startsWith('/conversation/'),
    vocabulary: pathname === '/vocabulary-book',
    wrong: pathname === '/wrong-note',
  }
}

export function BottomTabBar() {
  const { pathname } = useLocation()
  const tabs = tabStates(pathname)

  return (
    <nav className="mobile-tabbar" aria-label="주요 메뉴">
      <NavLink to="/home" className={() => tabClass(tabs.home)} end>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            H
          </span>
          <span className="mobile-tab__label">홈</span>
        </span>
      </NavLink>
      <NavLink to="/word-study" className={() => tabClass(tabs.word)} end={false}>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            W
          </span>
          <span className="mobile-tab__label">단어</span>
        </span>
      </NavLink>
      <NavLink to="/conversation" className={() => tabClass(tabs.conversation)} end={false}>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            C
          </span>
          <span className="mobile-tab__label">회화</span>
        </span>
      </NavLink>
      <NavLink to="/vocabulary-book" className={() => tabClass(tabs.vocabulary)} end>
        <span className="mobile-tab__inner">
          <span className="mobile-tab__icon" aria-hidden>
            B
          </span>
          <span className="mobile-tab__label">단어장</span>
        </span>
      </NavLink>
      <NavLink to="/wrong-note" className={() => tabClass(tabs.wrong)} end>
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
