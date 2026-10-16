import type { CategoryKey, Opportunity, Report, Strategy } from './metrics'

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const CATEGORY_PARAMS: CategoryKey[] = ['performance', 'accessibility', 'best-practices', 'seo']

export class PsiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'quota' | 'invalid-url' | 'unreachable' | 'network' | 'unknown',
  ) {
    super(message)
    this.name = 'PsiError'
  }
}

/* ---------- Minimal typings for the parts of the PSI response we read ---------- */
interface Audit {
  id: string
  title: string
  description: string
  score: number | null
  scoreDisplayMode?: string
  numericValue?: number
  metricSavings?: Record<string, number>
  details?: {
    type?: string
    overallSavingsMs?: number
    overallSavingsBytes?: number
    items?: Array<Record<string, unknown>>
    data?: string
  }
}
interface FieldMetric {
  percentile: number
}
export interface PsiResponse {
  id: string
  analysisUTCTimestamp: string
  loadingExperience?: {
    overall_category?: 'FAST' | 'AVERAGE' | 'SLOW'
    metrics?: Record<string, FieldMetric>
  }
  lighthouseResult: {
    requestedUrl: string
    finalDisplayedUrl?: string
    finalUrl?: string
    lighthouseVersion: string
    configSettings: { formFactor: Strategy }
    categories: Record<string, { score: number | null }>
    audits: Record<string, Audit>
  }
}

const stripMarkdownLinks = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '')

export function normalize(json: PsiResponse, strategy: Strategy): Report {
  const lh = json.lighthouseResult
  const a = lh.audits
  const num = (id: string) => a[id]?.numericValue ?? 0

  const scores = Object.fromEntries(
    CATEGORY_PARAMS.map((k) => [k, Math.round((lh.categories[k]?.score ?? 0) * 100)]),
  ) as Report['scores']

  const opportunities: Opportunity[] = Object.values(a)
    .map((audit) => {
      const savingsMs =
        audit.details?.overallSavingsMs ?? audit.metricSavings?.LCP ?? audit.metricSavings?.FCP ?? 0
      const savingsBytes = audit.details?.overallSavingsBytes ?? 0
      return {
        id: audit.id,
        title: audit.title,
        description: stripMarkdownLinks(audit.description ?? ''),
        savingsMs: Math.round(savingsMs),
        savingsBytes: Math.round(savingsBytes),
        score: audit.score ?? 1,
      }
    })
    .filter((o) => o.score < 0.9 && (o.savingsMs > 0 || o.savingsBytes > 0))
    .sort((x, y) => y.savingsMs - x.savingsMs || y.savingsBytes - x.savingsBytes)
    .slice(0, 10)

  const fm = json.loadingExperience?.metrics ?? {}
  const p = (k: string) => fm[k]?.percentile
  const cls = p('CUMULATIVE_LAYOUT_SHIFT_SCORE')

  return {
    id: `${strategy}:${lh.requestedUrl}:${json.analysisUTCTimestamp}`,
    url: lh.requestedUrl,
    finalUrl: lh.finalDisplayedUrl ?? lh.finalUrl ?? lh.requestedUrl,
    strategy,
    fetchedAt: json.analysisUTCTimestamp,
    lighthouseVersion: lh.lighthouseVersion,
    scores,
    lab: {
      fcp: num('first-contentful-paint'),
      lcp: num('largest-contentful-paint'),
      tbt: num('total-blocking-time'),
      cls: num('cumulative-layout-shift'),
      si: num('speed-index'),
      tti: num('interactive'),
    },
    field: {
      overall: json.loadingExperience?.overall_category,
      lcp: p('LARGEST_CONTENTFUL_PAINT_MS'),
      inp: p('INTERACTION_TO_NEXT_PAINT'),
      cls: cls === undefined ? undefined : cls / 100,
      fcp: p('FIRST_CONTENTFUL_PAINT_MS'),
      ttfb: p('EXPERIMENTAL_TIME_TO_FIRST_BYTE'),
    },
    filmstrip: ((a['screenshot-thumbnails']?.details?.items ?? []) as { timing: number; data: string }[]).map(
      ({ timing, data }) => ({ timing, data }),
    ),
    finalScreenshot: a['final-screenshot']?.details?.data,
    opportunities,
    totalBytes: num('total-byte-weight'),
    requests: a['network-requests']?.details?.items?.length ?? 0,
  }
}

export async function fetchReport(
  url: string,
  strategy: Strategy,
  { apiKey, signal }: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<Report> {
  const params = new URLSearchParams({ url, strategy })
  CATEGORY_PARAMS.forEach((c) => params.append('category', c))
  if (apiKey) params.set('key', apiKey)

  let res: Response
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new PsiError('No se pudo contactar la API de PageSpeed. Revisa tu conexión.', 'network')
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg: string = body?.error?.message ?? res.statusText
    if (res.status === 429)
      throw new PsiError(
        'Se agotó la cuota gratuita compartida de la API. Agrega tu propia API key (gratis) en Ajustes o prueba el modo demo.',
        'quota',
      )
    if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS/i.test(msg))
      throw new PsiError('Lighthouse no pudo cargar esa página. ¿La URL existe y es pública?', 'unreachable')
    if (res.status === 400) throw new PsiError('La URL no es válida para análisis.', 'invalid-url')
    throw new PsiError(msg || 'Error desconocido de la API.', 'unknown')
  }
  return normalize(body as PsiResponse, strategy)
}
