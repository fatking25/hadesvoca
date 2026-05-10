/**
 * (현재 라우터 미사용 placeholder) 실전회화 경로 UI 검증용 · Stage 목록은 ConversationStageListPage 사용
 */
import { LearningPathView } from '../components/learning/LearningPathView'

const STAGE_TITLE = 'Stage 1 · 하데스와 첫 만남'
const UNIT_HEADLINE = '실전회화 · 친구처럼 영어로 말하기'

const DAYS = [
  { id: 1, title: '하데스와 첫 만남', status: 'open' as const },
  { id: 2, title: '식사 약속 잡기', status: 'open' as const },
  { id: 3, title: '카페에서 주문하기', status: 'open' as const },
  { id: 4, title: '길 묻기', status: 'coming' as const },
  { id: 5, title: '일정 조율하기', status: 'coming' as const },
  { id: 6, title: '공연 전 대화하기', status: 'coming' as const },
  { id: 7, title: 'Stage 1 복습 회화', status: 'coming' as const },
]

export default function ConversationDayListPage() {
  return (
    <LearningPathView
      variant="conversation"
      sectionLabel={STAGE_TITLE}
      unitTitle={UNIT_HEADLINE}
      screenCaption="노드를 탭하면 시작 카드가 열립니다 · Stage 1 Day 플로우 · mock"
      days={DAYS}
      basePath="/conversation"
    />
  )
}
