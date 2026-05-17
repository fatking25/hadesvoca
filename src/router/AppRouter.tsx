import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { ConversationSessionProvider } from '../context/ConversationSessionContext'
import MobileLayout from '../layouts/MobileLayout'
import ConversationDayDetailPage from '../pages/conversation/ConversationDayDetailPage'
import ConversationDayResultPage from '../pages/conversation/ConversationDayResultPage'
import ConversationStageHubPage from '../pages/conversation/ConversationStageHubPage'
import ConversationStageListPage from '../pages/conversation/ConversationStageListPage'
import HomePage from '../pages/HomePage'
import OnboardingPage from '../pages/OnboardingPage'
import StartPage from '../pages/StartPage'
import VocabularyBookPage from '../pages/VocabularyBookPage'
import WordStudyDayDetailPage from '../pages/WordStudyDayDetailPage'
import WordStudyDayListPage from '../pages/WordStudyDayListPage'
import WordStudyResultPage from '../pages/WordStudyResultPage'
import WrongNotePage from '../pages/WrongNotePage'
import RequireOnboarding from './RequireOnboarding'

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ConversationSessionProvider>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<RequireOnboarding />}>
          <Route element={<MobileLayout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/word-study/review/result" element={<WordStudyResultPage />} />
            <Route path="/word-study/review" element={<WordStudyDayDetailPage />} />
            <Route path="/word-study/:dayId/result" element={<WordStudyResultPage />} />
            <Route path="/word-study/:dayId" element={<WordStudyDayDetailPage />} />
            <Route path="/word-study" element={<WordStudyDayListPage />} />
            <Route path="/conversation" element={<ConversationStageHubPage />} />
            <Route path="/conversation/stage/:stageId" element={<ConversationStageListPage />} />
            <Route path="/conversation/stage/:stageId/day/:dayId/result" element={<ConversationDayResultPage />} />
            <Route path="/conversation/stage/:stageId/day/:dayId" element={<ConversationDayDetailPage />} />
            <Route path="/conversation/:dayId/result" element={<ConversationDayResultPage />} />
            <Route path="/conversation/:dayId" element={<ConversationDayDetailPage />} />
            <Route path="/vocabulary-book" element={<VocabularyBookPage />} />
            <Route path="/wrong-note" element={<WrongNotePage />} />
            <Route path="*" element={<NotFoundView />} />
          </Route>
        </Route>
      </Routes>
      </ConversationSessionProvider>
    </BrowserRouter>
  )
}

function NotFoundView() {
  return (
    <main className="word-study">
      <section className="ui-card ui-card--dashboard">
        <h1 className="ui-card__section-heading">페이지를 찾을 수 없어요</h1>
        <p className="ui-card__body">
          주소가 잘못되었거나 아직 준비되지 않은 화면입니다.
        </p>
        <Link className="ui-btn ui-btn--primary ui-btn--block" to="/home">
          홈으로 돌아가기
        </Link>
      </section>
    </main>
  )
}
