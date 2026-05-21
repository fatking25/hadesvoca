import { useEffect } from 'react'
import { getEffectVolume } from '../utils/audioSettings'

const UI_CLICK_SOUND_SRC = '/audio/ui_click.wav'
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  'summary',
].join(',')

let uiClickAudio: HTMLAudioElement | null = null

function getUiClickAudio(): HTMLAudioElement {
  if (!uiClickAudio) {
    uiClickAudio = new Audio(UI_CLICK_SOUND_SRC)
    uiClickAudio.preload = 'auto'
  }

  return uiClickAudio
}

function canPlayClickSound(target: Element): boolean {
  const interactive = target.closest<HTMLElement>(INTERACTIVE_SELECTOR)
  if (!interactive) return false

  const ariaDisabled = interactive.getAttribute('aria-disabled') === 'true'
  const disabled = interactive.matches(':disabled') || ariaDisabled
  const optedOut = Boolean(interactive.closest('[data-ui-click-sound="off"]'))

  return !disabled && !optedOut
}

function playUiClickSound(): void {
  const audio = getUiClickAudio()
  audio.volume = getEffectVolume()
  if (audio.volume <= 0) return

  audio.currentTime = 0
  void audio.play().catch(() => {
    // Browsers can still reject playback in edge cases; UI should continue silently.
  })
}

export function useUiClickSound(): void {
  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return
      if (!canPlayClickSound(event.target)) return

      playUiClickSound()
    }

    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      document.removeEventListener('click', handleClick, { capture: true })
    }
  }, [])
}
