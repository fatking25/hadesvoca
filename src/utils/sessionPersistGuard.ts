import { readSessionStorageItem, writeSessionStorageItem } from './browserStorage'

const WORD_STUDY_PERSIST_SESSION_PREFIX = 'hadesvoca:wordStudyPersist:' as const
const CONVERSATION_PERSIST_SESSION_PREFIX = 'hadesvoca:conversationPersist:' as const

function markPersistHandled(prefix: string, nonce: string): boolean {
  try {
    const key = `${prefix}${nonce}`
    if (readSessionStorageItem(key) === '1') return false
    if (!writeSessionStorageItem(key, '1')) return true
    return true
  } catch {
    return true
  }
}

export function markConversationPersistHandled(nonce: string): boolean {
  return markPersistHandled(CONVERSATION_PERSIST_SESSION_PREFIX, nonce)
}

export function markWordStudyPersistHandled(nonce: string): boolean {
  return markPersistHandled(WORD_STUDY_PERSIST_SESSION_PREFIX, nonce)
}
