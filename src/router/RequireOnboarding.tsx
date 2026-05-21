/**
 * 게스트 프로필 온보딩(닉네임 설정) 통과 여부를 검사하는 라우터 가드(Phase 12-0).
 *
 * - 닉네임이 비어 있으면 `/onboarding` 으로 redirect 하고, 통과하면 자식 라우트를 렌더한다.
 * - 진입하려던 경로(`pathname + search + hash`)는 location state 의 `from` 으로 전달해
 *   온보딩 완료 후 같은 위치로 돌아갈 수 있게 한다.
 * - 서버/로그인 가드가 아니다. localStorage 의 `UserProgress.nickname` 만 본다.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { APP_ROUTES } from '../constants/routes'
import { hasNicknameOnboardingCompleted } from '../utils/storage'

export default function RequireOnboarding() {
  const location = useLocation()
  if (!hasNicknameOnboardingCompleted()) {
    return (
      <Navigate
        to={APP_ROUTES.onboarding}
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }
  return <Outlet />
}
