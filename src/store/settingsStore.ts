import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIProvider = 'openai' | 'anthropic'

export const MODELS: Record<AIProvider, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (fast)' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
}

const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
}

interface SettingsStore {
  provider: AIProvider
  model: string
  /** When true (default), the canvas auto-arranges after every add/edit/delete.
   * When false, layout only runs when the user clicks the Layout button. */
  autoLayoutEnabled: boolean
  /** Width of the right AI panel in pixels. Persisted so the user's chosen
   * size sticks across reloads. */
  rightPanelWidth: number
  setProvider: (p: AIProvider) => void
  setModel: (m: string) => void
  setAutoLayoutEnabled: (enabled: boolean) => void
  setRightPanelWidth: (px: number) => void
}

export const RIGHT_PANEL_MIN = 280
export const RIGHT_PANEL_MAX = 720
export const RIGHT_PANEL_DEFAULT = 288

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      provider: 'anthropic',
      model: DEFAULT_MODEL.anthropic,
      autoLayoutEnabled: true,
      rightPanelWidth: RIGHT_PANEL_DEFAULT,
      setProvider: (provider) => set({ provider, model: DEFAULT_MODEL[provider] }),
      setModel: (model) => set({ model }),
      setAutoLayoutEnabled: (autoLayoutEnabled) => set({ autoLayoutEnabled }),
      setRightPanelWidth: (px) => set({
        rightPanelWidth: Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, Math.round(px))),
      }),
    }),
    { name: 'diginode-settings' }
  )
)
