/**
 * 설정·정보: 저작권·고지, 저장 방침(PWA 포함) 안내 및 앱 버전 placeholder.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import './InfoPage.css'

export default function InfoPage() {
  const { hash } = useLocation()

  useEffect(() => {
    if (hash === '#info-copyright') {
      document.getElementById('info-copyright')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [hash])

  return (
    <main className="info-page">
      <h1 className="info-page__title">설정 / 정보</h1>

      <section
        id="info-copyright"
        className="info-copyright ui-card ui-card--info-accent"
        aria-labelledby="info-copyright-heading"
      >
        <h2 id="info-copyright-heading" className="ui-card__section-heading">
          저작권 · 고지
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

      <section className="info-card ui-card ui-card--info" aria-labelledby="info-app-label">
        <h2 id="info-app-label" className="ui-card__title">
          하데스 보카
        </h2>
        <ul className="info-card__list">
          <li>
            저장 방식: 브라우저 <strong>localStorage</strong> 임시 저장 예정 및{' '}
            <strong>JSON 파일</strong> 내보내기·불러오기 예정입니다. (모두 현재 미구현)
          </li>
          <li>
            학습 데이터는 사용자 기기에만 두며 인터넷 없이 학습 가능하도록 설계 목표입니다.
          </li>
          <li>연동 <strong>서버 없음</strong> — 데이터는 기기 안에만 둡니다.</li>
          <li>
            <strong>로그인 없음</strong> — 정식 배포 전까지 계정 기능은 검토 상태입니다.
          </li>
          <li>
            <strong>PWA</strong>: 홈 화면 설치 및 오프라인 캐시는 Phase 배포 단계에서 적용
            예정입니다.
          </li>
        </ul>
      </section>

      <p className="info-meta" aria-label="앱 버전">
        버전: 0.0.0 (placeholder)
      </p>
    </main>
  )
}
