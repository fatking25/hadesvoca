function randomSuffix(): string {
  const bytes = new Uint32Array(2)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (n) => n.toString(36)).join('')
  }
  return Math.random().toString(36).slice(2, 12)
}

export function createLocalId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${randomSuffix()}`
}

export function createSessionNonce(prefix = 'nonce'): string {
  return createLocalId(prefix)
}

export function createUiRevision(): number {
  return Date.now()
}
