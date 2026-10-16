import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Report, Strategy } from '../lib/metrics'

/** Lightweight snapshot kept in history (no screenshots → small localStorage footprint). */
export type HistoryEntry = Pick<Report, 'id' | 'url' | 'strategy' | 'fetchedAt' | 'scores' | 'lab' | 'demo'>

interface AppState {
  apiKey: string
  demoMode: boolean
  strategy: Strategy
  history: HistoryEntry[]
  setApiKey: (key: string) => void
  setDemoMode: (on: boolean) => void
  setStrategy: (s: Strategy) => void
  record: (report: Report) => void
  clearHistory: () => void
}

const MAX_HISTORY = 60

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      apiKey: '',
      demoMode: false,
      strategy: 'mobile',
      history: [],
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setDemoMode: (demoMode) => set({ demoMode }),
      setStrategy: (strategy) => set({ strategy }),
      record: (r) =>
        set((s) => {
          if (s.history.some((h) => h.id === r.id)) return s
          const entry: HistoryEntry = {
            id: r.id,
            url: r.url,
            strategy: r.strategy,
            fetchedAt: r.fetchedAt,
            scores: r.scores,
            lab: r.lab,
            demo: r.demo,
          }
          return { history: [entry, ...s.history].slice(0, MAX_HISTORY) }
        }),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'perfscope',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** Score trend for one URL+strategy, oldest → newest. */
export function trendFor(history: HistoryEntry[], url: string, strategy: Strategy) {
  return history
    .filter((h) => h.url === url && h.strategy === strategy)
    .sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))
}
