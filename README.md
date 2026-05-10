# 하데스 보카 (HadesVoca)

TOEIC·실전 회화 학습용 **모바일 우선 웹 앱**(MVP). 서버 없이 브라우저 **localStorage**에만 진행 상태를 저장하고, 단어·회화 콘텐츠는 `public/content`의 **정적 JSON**을 `fetch`로 불러옵니다.

## 기술 스택

| 구분 | 내용 |
|------|------|
| 런타임 | React 19, TypeScript |
| 빌드 | Vite 8 |
| 라우팅 | React Router 7 (`BrowserRouter`) |
| 스타일 | CSS (디자인 토큰·카드·모바일 레이아웃) |

## 주요 기능

- **단어 학습** — Stage·Day 단위 퀴즈, 완료 시 진행 저장
- **실전 회화** — 시나리오·표현 퀴즈, 완료 시 진행 저장
- **단어장** — 단어·표현 **참조(id, stage, day)** 만 저장
- **오답노트** — 틀린 문항 **참조·오답 통계** 저장
- **홈 대시보드** — 오늘/누적 학습 요약, 이어하기, Stage 진행률(목록 화면)
- **콘텐츠 분리** — 사용자 데이터는 `localStorage` 키 `hadesvoca:userProgress` 한 곳; 교재 JSON은 읽기만 하고 **쓰지 않음**

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 Vite가 안내하는 주소(기본 `http://localhost:5173`)로 접속합니다.

## 빌드

```bash
npm run build
npm run preview   # dist 미리보기
```

- 산출물: `dist/`
- 타입체크: `tsc -b` 후 Vite 빌드

## Lint

```bash
npm run lint
```

## 폴더 구조 (요약)

```
public/content/     # 단어·회화 JSON 및 에셋 (배포 시 그대로 포함)
src/
  api/              # 콘텐츠 fetch (contentApi)
  components/       # 공통 UI (탭바, 학습 경로 뷰 등)
  constants/        # storage 키 등
  layouts/          # 모바일 레이아웃
  pages/            # 화면별 페이지
  router/           # 라우트 정의
  types/            # UserProgress, 콘텐츠 타입
  utils/            # storage.ts, learnStats.ts
```

## 사용자 데이터

- **저장 위치:** 브라우저 `localStorage` (`hadesvoca:userProgress`)
- **마이그레이션:** `UserProgress.version`(현재 2) 필드로 스키마 호환
- **내보내기/가져오기:** 별도 파일 백업 UI는 없음(필요 시 DevTools로 JSON 확인)

## Vercel 배포

1. GitHub 저장소와 연결 후 **New Project**로 해당 레포를 가져옵니다.
2. 프레임워크: **Vite** (자동 감지되는 경우가 많음)
3. 빌드 명령: `npm run build`
4. 출력 디렉터리: `dist`
5. 설치 명령: `npm install` 또는 `npm ci`

`BrowserRouter`를 쓰므로 **직접 URL 새로고침·딥링크**에서 404가 나면, 프로젝트 루트에 `vercel.json`으로 SPA 폴백을 추가합니다.

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

실제 존재하는 파일(`/*.js`, `/assets/*` 등)은 Vercel이 우선 제공하고, 나머지 경로만 `index.html`로 폴백합니다.  
(동일 설정을 Vercel 대시보드의 Routes/Rewrites에서 줄 수도 있습니다.)

**서브패스 배포**(`/hadesvoca` 등)를 할 경우 `vite.config.ts`에 `base`를 맞추고, 위 rewrite도 경로에 맞게 조정합니다. 루트 도메인만 쓰면 기본 `base: '/'`로 충분합니다.

## 라이선스

`package.json`의 `private` 필드처럼 레포 정책에 맞게 별도 명시가 없으면 **프로젝트 소유자 기준**으로 관리합니다.

## 개발 메모

- 로그인·서버 API 없음(MVP)
- 콘텐츠 수정은 `public/content` 하위 JSON만 편집(앱 코드와 분리)
