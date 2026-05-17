import type { ConversationDayDifficulty } from '../types/conversation'

export type ConversationDifficultyTone = 'easy' | 'normal' | 'hard'

export type ConversationDifficultyView = Readonly<{
  difficulty: ConversationDayDifficulty
  labelKo: string
  shortLabelKo: string
  tone: ConversationDifficultyTone
}>

const DIFFICULTY_VIEW: Record<ConversationDayDifficulty, ConversationDifficultyView> = {
  low: {
    difficulty: 'low',
    labelKo: '하 · 초급',
    shortLabelKo: '하',
    tone: 'easy',
  },
  medium: {
    difficulty: 'medium',
    labelKo: '중 · 기본',
    shortLabelKo: '중',
    tone: 'normal',
  },
  high: {
    difficulty: 'high',
    labelKo: '상 · 심화',
    shortLabelKo: '상',
    tone: 'hard',
  },
}

export function getConversationDifficultyView(
  difficulty: ConversationDayDifficulty | undefined,
): ConversationDifficultyView {
  return DIFFICULTY_VIEW[difficulty ?? 'low']
}
