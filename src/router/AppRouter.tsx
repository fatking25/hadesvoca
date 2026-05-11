import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ConversationSessionProvider } from '../context/ConversationSessionContext'
import MobileLayout from '../layouts/MobileLayout'
import ConversationDayDetailPage from '../pages/conversation/ConversationDayDetailPage'
import ConversationDayResultPage from '../pages/conversation/ConversationDayResultPage'
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
            <Route path="/conversation" element={<ConversationStageListPage />} />
            <Route path="/conversation/:dayId/result" element={<ConversationDayResultPage />} />
            <Route path="/conversation/:dayId" element={<ConversationDayDetailPage />} />
            <Route path="/vocabulary-book" element={<VocabularyBookPage />} />
            <Route path="/wrong-note" element={<WrongNotePage />} />
          </Route>
        </Route>
      </Routes>
      </ConversationSessionProvider>
    </BrowserRouter>
  )
}
