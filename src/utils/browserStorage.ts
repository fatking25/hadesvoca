export function readLocalStorageItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocalStorageItem(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeLocalStorageItem(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function readSessionStorageItem(key: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeSessionStorageItem(key: string, value: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    sessionStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
