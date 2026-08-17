// The saved settings, live, wherever the form is rendered.
//
// The popup could get away with a plain load-once: it exists for four seconds
// and then the window is gone. The settings tab does not — it sits open for
// days, and a change made in the popup (or by Alt+P on a video) has to show up
// in it rather than being overwritten by whatever the page still believed.

import { useEffect, useRef, useState } from 'preact/hooks'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  type Settings,
} from '../shared/settings'

export interface SettingsForm {
  settings: Settings
  /** False until the first read lands — render nothing rather than the defaults. */
  loaded: boolean
  update: (patch: Partial<Settings>) => void
}

export function useSettings(): SettingsForm {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  /**
   * Keys this page has changed but whose write has not come back yet.
   *
   * `saveSettings` is a read-modify-write, so its echo arrives a moment later
   * carrying the value from before the change. Dragging a slider produces one
   * of those per frame, and applying them all would fight the drag. Local
   * intent wins until the write it came from has settled.
   */
  const pending = useRef<Partial<Settings>>({})

  useEffect(() => {
    loadSettings().then((saved) => {
      setSettings(saved)
      setLoaded(true)
    })

    return onSettingsChanged((incoming) => {
      setSettings({ ...incoming, ...pending.current })
    })
  }, [])

  const update = (patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    pending.current = { ...pending.current, ...patch }

    void saveSettings(patch).finally(() => {
      // Only clear the keys this write owned. A newer change to the same key
      // while it was in flight is still pending, and dropping it here would
      // let the next echo undo it.
      for (const key of Object.keys(patch) as Array<keyof Settings>) {
        if (pending.current[key] === patch[key]) delete pending.current[key]
      }
    })
  }

  return { settings, loaded, update }
}
