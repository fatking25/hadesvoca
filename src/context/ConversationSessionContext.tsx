import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  ConversationSessionContext,
  type ConversationSessionValue,
} from './conversationSessionCore'

function conversationDayKey(stageId: number, dayId: number): string {
  return `${stageId}:${dayId}`
}

export function ConversationSessionProvider(props: Readonly<{ children: ReactNode }>) {
  const { children } = props
  const [completedDayKeys, setCompletedDayKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  const recordDayCompletion = useCallback((stageId: number, dayId: number) => {
    const key = conversationDayKey(stageId, dayId)
    setCompletedDayKeys((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const isDayComplete = useCallback(
    (stageId: number, dayId: number) =>
      completedDayKeys.has(conversationDayKey(stageId, dayId)),
    [completedDayKeys],
  )

  const value = useMemo<ConversationSessionValue>(
    () => ({
      completedDayKeys,
      recordDayCompletion,
      isDayComplete,
    }),
    [completedDayKeys, recordDayCompletion, isDayComplete],
  )

  return (
    <ConversationSessionContext.Provider value={value}>
      {children}
    </ConversationSessionContext.Provider>
  )
}
