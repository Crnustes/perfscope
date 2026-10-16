export type Strategy = 'mobile' | 'desktop'
export type CategoryKey = 'performance' | 'accessibility' | 'best-practices' | 'seo'
export type Rating = 'good' | 'average' | 'poor'
export type LabMetricKey = 'fcp' | 'lcp' | 'tbt' | 'cls' | 'si' | 'tti'
export type FieldMetricKey = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb'

export interface Opportunity {
  id: string
  title: string
  description: string
  savingsMs: number
  savingsBytes: number
  score: number
}

export interface Report {
  id: string
  url: string
  finalUrl: string
  strategy: Strategy
  fetchedAt: string
  lighthouseVersion: string
  scores: Record<CategoryKey, number>
  lab: Record<LabMetricKey, number>
  field: Partial<Record<FieldMetricKey, number>> & { overall?: 'FAST' | 'AVERAGE' | 'SLOW' }
  filmstrip: { timing: number; data: string }[]
  finalScreenshot?: string
  opportunities: Opportunity[]
  totalBytes: number
  requests: number
  demo?: boolean
  /** true when the real API quota was exhausted and a simulated report was shown instead */
  quotaFallback?: boolean
}

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'best-practices', label: 'Best Practices' },
  { key: 'seo', label: 'SEO' },
]

interface MetricDef {
  label: string
  short: string
  unit: 'ms' | 'unitless'
  /** [good, poor] — value <= good is good, value > poor is poor */
  thresholds: [number, number]
  hint: string
}

export const LAB_METRICS: Record<LabMetricKey, MetricDef> = {
  fcp: { label: 'First Contentful Paint', short: 'FCP', unit: 'ms', thresholds: [1800, 3000], hint: 'Cuándo aparece el primer texto o imagen.' },
  lcp: { label: 'Largest Contentful Paint', short: 'LCP', unit: 'ms', thresholds: [2500, 4000], hint: 'Cuándo se pinta el elemento más grande visible.' },
  tbt: { label: 'Total Blocking Time', short: 'TBT', unit: 'ms', thresholds: [200, 600], hint: 'Tiempo en que el hilo principal bloquea la interacción.' },
  cls: { label: 'Cumulative Layout Shift', short: 'CLS', unit: 'unitless', thresholds: [0.1, 0.25], hint: 'Cuánto “salta” el contenido mientras carga.' },
  si: { label: 'Speed Index', short: 'SI', unit: 'ms', thresholds: [3400, 5800], hint: 'Qué tan rápido se llena visualmente la página.' },
  tti: { label: 'Time to Interactive', short: 'TTI', unit: 'ms', thresholds: [3800, 7300], hint: 'Cuándo la página responde de forma fiable.' },
}

export const FIELD_METRICS: Record<FieldMetricKey, MetricDef> = {
  lcp: { label: 'Largest Contentful Paint', short: 'LCP', unit: 'ms', thresholds: [2500, 4000], hint: 'p75 de usuarios reales (CrUX).' },
  inp: { label: 'Interaction to Next Paint', short: 'INP', unit: 'ms', thresholds: [200, 500], hint: 'p75 de latencia de interacción real.' },
  cls: { label: 'Cumulative Layout Shift', short: 'CLS', unit: 'unitless', thresholds: [0.1, 0.25], hint: 'p75 de estabilidad visual real.' },
  fcp: { label: 'First Contentful Paint', short: 'FCP', unit: 'ms', thresholds: [1800, 3000], hint: 'p75 del primer pintado real.' },
  ttfb: { label: 'Time to First Byte', short: 'TTFB', unit: 'ms', thresholds: [800, 1800], hint: 'p75 de respuesta del servidor.' },
}

export function rateScore(score: number): Rating {
  if (score >= 90) return 'good'
  if (score >= 50) return 'average'
  return 'poor'
}

export function rateMetric(value: number, [good, poor]: [number, number]): Rating {
  if (value <= good) return 'good'
  if (value <= poor) return 'average'
  return 'poor'
}

export const RATING_COLOR: Record<Rating, string> = {
  good: '#22c55e',
  average: '#f59e0b',
  poor: '#ef4444',
}

export function formatMetric(value: number, unit: MetricDef['unit']): string {
  if (unit === 'unitless') return value.toFixed(value < 1 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '') || '0'
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

/** Accepts "example.com", "http://x.y/path" etc. Returns a normalized https URL or null. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withProto)
    if (!u.hostname.includes('.') || u.hostname.endsWith('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Estimates the performance score a site would reach if the top N opportunities were fixed,
 * by removing their estimated savings from LCP/FCP/SI and re-scoring with Lighthouse's log-normal curves.
 */
const SCORING: Record<'fcp' | 'lcp' | 'si' | 'tbt' | 'cls', { weight: number; p10: number; median: number }> = {
  fcp: { weight: 0.1, p10: 1800, median: 3000 },
  si: { weight: 0.1, p10: 3387, median: 5800 },
  lcp: { weight: 0.25, p10: 2500, median: 4000 },
  tbt: { weight: 0.3, p10: 200, median: 600 },
  cls: { weight: 0.25, p10: 0.1, median: 0.25 },
}

// Complementary error function approximation (Abramowitz & Stegun 7.1.26)
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    )
  return x >= 0 ? r : 2 - r
}

/** Lighthouse log-normal scoring: maps a raw metric value to a 0..1 score. */
export function logNormalScore(value: number, p10: number, median: number): number {
  if (value <= 0) return 1
  const INVERSE_ERFC_ONE_FIFTH = 0.9061938024368232
  const shape = Math.abs(Math.log(p10 / median)) / (Math.SQRT2 * INVERSE_ERFC_ONE_FIFTH)
  const standardized = Math.log(value / median) / (Math.SQRT2 * shape)
  const score = erfc(standardized) / 2
  return Math.min(1, Math.max(0, score))
}

export function estimatePerformance(lab: Pick<Report['lab'], 'fcp' | 'lcp' | 'si' | 'tbt' | 'cls'>): number {
  let total = 0
  for (const key of Object.keys(SCORING) as (keyof typeof SCORING)[]) {
    const { weight, p10, median } = SCORING[key]
    total += weight * logNormalScore(lab[key], p10, median)
  }
  return Math.round(total * 100)
}

export function projectWithFixes(report: Report, count = 3): { score: number; savedMs: number } {
  const saved = [...report.opportunities]
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, count)
    .reduce((acc, o) => acc + o.savingsMs, 0)
  const lab = report.lab
  const projected = estimatePerformance({
    fcp: Math.max(lab.fcp * 0.4, lab.fcp - saved * 0.5),
    lcp: Math.max(lab.lcp * 0.4, lab.lcp - saved),
    si: Math.max(lab.si * 0.4, lab.si - saved * 0.8),
    tbt: lab.tbt,
    cls: lab.cls,
  })
  return { score: Math.max(projected, report.scores.performance), savedMs: saved }
}
