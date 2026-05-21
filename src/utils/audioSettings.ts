import { STORAGE_KEY_AUDIO_SETTINGS } from '../constants/storageKeys'
import { readLocalStorageItem, writeLocalStorageItem } from './browserStorage'

export const HADES_AUDIO_SETTINGS_EVENT = 'hadesvoca-audio-settings-updated' as const

const DEFAULT_NARRATION_VOLUME = 0.5
const DEFAULT_EFFECT_VOLUME = 0.5

export type AudioSettings = Readonly<{
  narrationVolume: number
  effectVolume: number
}>

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  narrationVolume: DEFAULT_NARRATION_VOLUME,
  effectVolume: DEFAULT_EFFECT_VOLUME,
}

function clampVolume(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(1, n))
}

function parseAudioSettings(raw: unknown): AudioSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return DEFAULT_AUDIO_SETTINGS
  }

  const record = raw as Record<string, unknown>
  return {
    narrationVolume: clampVolume(
      record.narrationVolume,
      DEFAULT_AUDIO_SETTINGS.narrationVolume,
    ),
    effectVolume: clampVolume(record.effectVolume, DEFAULT_AUDIO_SETTINGS.effectVolume),
  }
}

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = readLocalStorageItem(STORAGE_KEY_AUDIO_SETTINGS)
    if (raw === null || raw === '') return DEFAULT_AUDIO_SETTINGS
    return parseAudioSettings(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

export function saveAudioSettings(next: AudioSettings): void {
  try {
    const normalized = parseAudioSettings(next)
    if (
      writeLocalStorageItem(STORAGE_KEY_AUDIO_SETTINGS, JSON.stringify(normalized)) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent(HADES_AUDIO_SETTINGS_EVENT))
    }
  } catch {
    /* localStorage can be unavailable in private or restricted contexts. */
  }
}

export function getEffectVolume(): number {
  return loadAudioSettings().effectVolume
}
