export const APP_ROUTES = {
  start: '/',
  onboarding: '/onboarding',
  home: '/home',
  wordStudy: '/word-study',
  wordStudyReview: '/word-study/review',
  wordStudyReviewResult: '/word-study/review/result',
  conversation: '/conversation',
  vocabularyBook: '/vocabulary-book',
  wrongNote: '/wrong-note',
} as const

export function wordStudyDayPath(dayId: number | string): string {
  return `${APP_ROUTES.wordStudy}/${dayId}`
}

export function wordStudyDayResultPath(dayId: number | string): string {
  return `${wordStudyDayPath(dayId)}/result`
}

export function conversationStagePath(stageId: number | string): string {
  return `${APP_ROUTES.conversation}/stage/${stageId}`
}

export function conversationStageDayPath(
  stageId: number | string,
  dayId: number | string,
): string {
  return `${conversationStagePath(stageId)}/day/${dayId}`
}

export function conversationStageDayResultPath(
  stageId: number | string,
  dayId: number | string,
): string {
  return `${conversationStageDayPath(stageId, dayId)}/result`
}

export function vocabularyBookDetailPath(
  kind: 'word' | 'expression',
  stageId: number | string,
  dayId: number | string,
  itemId: string,
): string {
  return `${APP_ROUTES.vocabularyBook}/${kind}/${stageId}/${dayId}/${encodeURIComponent(itemId)}`
}

export function wrongNoteDetailPath(
  type: 'word' | 'expression',
  stageId: number | string,
  dayId: number | string,
  itemId: string,
): string {
  return `${APP_ROUTES.wrongNote}/${type}/${stageId}/${dayId}/${encodeURIComponent(itemId)}`
}
