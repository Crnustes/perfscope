import { useEffect } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { fetchReport, PsiError } from './psi'
import { makeDemoReport } from './demo'
import type { Report, Strategy } from './metrics'
import { useAppStore } from '../store/useAppStore'

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

function reportQuery(url: string, strategy: Strategy, apiKey: string, demo: boolean) {
  return {
    queryKey: ['report', url, strategy, demo, apiKey] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Report> => {
      if (demo) {
        await wait(1400 + Math.random() * 1200, signal) // feel like a real audit
        return makeDemoReport(url, strategy)
      }
      try {
        return await fetchReport(url, strategy, { apiKey: apiKey || import.meta.env.VITE_PSI_API_KEY, signal })
      } catch (err) {
        // Shared public quota exhausted → keep the experience alive with a clearly-labelled simulated report
        if (err instanceof PsiError && err.kind === 'quota') return { ...makeDemoReport(url, strategy), quotaFallback: true }
        throw err
      }
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  }
}

/** Single-site audit. Records successful results into persistent history. */
export function useReport(url: string | null, strategy: Strategy) {
  const { apiKey, demoMode, record } = useAppStore()
  const q = useQuery({ ...reportQuery(url ?? '', strategy, apiKey, demoMode), enabled: !!url })
  useEffect(() => {
    if (q.data) record(q.data)
  }, [q.data, record])
  return q
}

/** Runs several audits in parallel (each one is cached and cancellable independently). */
export function useReports(urls: string[], strategy: Strategy) {
  const { apiKey, demoMode, record } = useAppStore()
  const results = useQueries({ queries: urls.map((u) => reportQuery(u, strategy, apiKey, demoMode)) })
  const ids = results.map((r) => r.data?.id ?? '').join('|')
  useEffect(() => {
    results.forEach((r) => r.data && record(r.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  return results
}
