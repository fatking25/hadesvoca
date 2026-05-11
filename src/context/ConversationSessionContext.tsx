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

export function ConversationSessionProvider(props: Readonly<{ children: ReactNode }>) {
  const { children } = props
  const [completedDayIds, setCompletedDayIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  )

  const recordDayCompletion = useCallback((dayId: number) => {
    setCompletedDayIds((prev) => {
      if (prev.has(dayId)) return prev
      const next = new Set(prev)
      next.add(dayId)
      return next
    })
  }, [])

  const isDayComplete = useCallback(
    (dayId: number) => completedDayIds.has(dayId),
    [completedDayIds],
  )

  const value = useMemo<ConversationSessionValue>(
    () => ({
      completedDayIds,
      recordDayCompletion,
      isDayComplete,
    }),
    [completedDayIds, recordDayCompletion, isDayComplete],
  )

  return (
    <ConversationSessionContext.Provider value={value}>
      {children}
    </ConversationSessionContext.Provider>
  )
}

