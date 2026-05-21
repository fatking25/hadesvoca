import { useCallback, useState } from 'react'

import {
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from '../../utils/audioSettings'

export function AudioSettingsPanel() {
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => loadAudioSettings())

  const updateAudioSetting = useCallback(
    (key: keyof AudioSettings, value: number): void => {
      setAudioSettings((prev) => {
        const next = { ...prev, [key]: value }
        saveAudioSettings(next)
        return next
      })
    },
    [],
  )

  return (
    <div className="shell-audio-controls">
      <label className="shell-audio-control">
        <span className="shell-audio-control__head">
          <span>
            <strong>나레이션</strong>
            <small>추후 제공</small>
          </span>
          <output>{Math.round(audioSettings.narrationVolume * 100)}%</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(audioSettings.narrationVolume * 100)}
          onChange={(event) => {
            updateAudioSetting('narrationVolume', Number(event.currentTarget.value) / 100)
          }}
        />
      </label>
      <label className="shell-audio-control">
        <span className="shell-audio-control__head">
          <span>
            <strong>효과음</strong>
            <small>버튼과 메뉴 클릭</small>
          </span>
          <output>{Math.round(audioSettings.effectVolume * 100)}%</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(audioSettings.effectVolume * 100)}
          onChange={(event) => {
            updateAudioSetting('effectVolume', Number(event.currentTarget.value) / 100)
          }}
        />
      </label>
    </div>
  )
}
