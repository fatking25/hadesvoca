/**
 * 실전회화 Day 목록: 듀오형 학습 경로 UI. 데이터는 기존 DAYS 그대로입니다.
 */
import { LearningPathView } from '../components/learning/LearningPathView'

type DaySummary = Readonly<{ id: number; title: string; status: 'ready' | 'coming' }>

/** Stage 1 실전회화 (기획 5.3) · MVP 초기 학습 분량은 Day 1~3 */
const STAGE_TITLE = 'Stage 1 · 하데스와 첫 만남'
const UNIT_HEADLINE = '실전회화 · 친구처럼 영어로 말하기'

const DAYS: readonly DaySummary[] = [
  { id: 1, title: '하데스와 첫 만남', status: 'ready' },
  { id: 2, title: '식사 약속 잡기', status: 'ready' },
  { id: 3, title: '카페에서 주문하기', status: 'ready' },
  { id: 4, title: '길 묻기', status: 'coming' },
  { id: 5, title: '일정 조율하기', status: 'coming' },
  { id: 6, title: '공연 전 대화하기', status: 'coming' },
  { id: 7, title: 'Stage 1 복습 회화', status: 'coming' },
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
