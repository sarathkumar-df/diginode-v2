import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIProvider = 'openai' | 'anthropic'

export const MODELS: Record<AIProvider, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
}

const DEFAULT_MODEL: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-opus-4-6',
}

interface SettingsStore {
  provider: AIProvider
  model: string
  setProvider: (p: AIProvider) => void
  setModel: (m: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      provider: 'anthropic',
      model: DEFAULT_MODEL.anthropic,
      setProvider: (provider) => set({ provider, model: DEFAULT_MODEL[provider] }),
      setModel: (model) => set({ model }),
    }),
    { name: 'digonode-settings' }
  )
)
