import { describe, expect, it } from 'vitest'
import { estimatePerformance, formatMetric, logNormalScore, normalizeUrl, projectWithFixes, rateMetric, rateScore } from './metrics'
import { normalize, type PsiResponse } from './psi'
import { makeDemoReport } from './demo'

describe('normalizeUrl', () => {
  it('adds https and validates hostnames', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/')
    expect(normalizeUrl(' http://a.b/c ')).toBe('http://a.b/c')
    expect(normalizeUrl('localhost')).toBeNull()
    expect(normalizeUrl('')).toBeNull()
  })
})

describe('ratings', () => {
  it('rates scores with Lighthouse bands', () => {
    expect(rateScore(95)).toBe('good')
    expect(rateScore(70)).toBe('average')
    expect(rateScore(10)).toBe('poor')
  })
  it('rates metrics against thresholds', () => {
    expect(rateMetric(2400, [2500, 4000])).toBe('good')
    expect(rateMetric(3000, [2500, 4000])).toBe('average')
    expect(rateMetric(5000, [2500, 4000])).toBe('poor')
  })
  it('formats values', () => {
    expect(formatMetric(1234, 'ms')).toBe('1.2 s')
    expect(formatMetric(321.6, 'ms')).toBe('322 ms')
    expect(formatMetric(0.05, 'unitless')).toBe('0.05')
  })
})

describe('Lighthouse log-normal scoring', () => {
  it('returns 0.9 at p10 and 0.5 at the median', () => {
    expect(logNormalScore(2500, 2500, 4000)).toBeCloseTo(0.9, 2)
    expect(logNormalScore(4000, 2500, 4000)).toBeCloseTo(0.5, 2)
  })
  it('gives ~100 for a very fast page and a low score for a slow one', () => {
    expect(estimatePerformance({ fcp: 400, lcp: 600, si: 700, tbt: 0, cls: 0 })).toBeGreaterThanOrEqual(99)
    expect(estimatePerformance({ fcp: 6000, lcp: 12000, si: 10000, tbt: 2000, cls: 0.5 })).toBeLessThan(15)
  })
})

describe('demo + projection', () => {
  it('is deterministic per URL and never projects a lower score', () => {
    const a = makeDemoReport('https://x.com/', 'mobile')
    const b = makeDemoReport('https://x.com/', 'mobile')
    expect(a.scores).toEqual(b.scores)
    expect(projectWithFixes(a, 3).score).toBeGreaterThanOrEqual(a.scores.performance)
  })
})

describe('normalize PSI response', () => {
  it('maps categories, metrics, field data and opportunities', () => {
    const json = {
      id: 'https://site.com/',
      analysisUTCTimestamp: '2026-10-15T12:00:00Z',
      loadingExperience: {
        overall_category: 'AVERAGE',
        metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2900 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12 } },
      },
      lighthouseResult: {
        requestedUrl: 'https://site.com/',
        finalDisplayedUrl: 'https://www.site.com/',
        lighthouseVersion: '12.8.0',
        configSettings: { formFactor: 'mobile' },
        categories: { performance: { score: 0.73 }, accessibility: { score: 0.9 }, 'best-practices': { score: 1 }, seo: { score: 0.85 } },
        audits: {
          'largest-contentful-paint': { id: 'largest-contentful-paint', title: 'LCP', description: '', score: 0.5, numericValue: 3100 },
          'unused-javascript': {
            id: 'unused-javascript',
            title: 'Reduce unused JavaScript',
            description: 'See [docs](https://x).',
            score: 0.3,
            details: { type: 'opportunity', overallSavingsMs: 600, overallSavingsBytes: 90000 },
          },
          'fine-audit': { id: 'fine-audit', title: 'ok', description: '', score: 1, details: { overallSavingsMs: 0 } },
        },
      },
    } as unknown as PsiResponse
    const r = normalize(json, 'mobile')
    expect(r.scores.performance).toBe(73)
    expect(r.lab.lcp).toBe(3100)
    expect(r.field.cls).toBeCloseTo(0.12)
    expect(r.field.overall).toBe('AVERAGE')
    expect(r.finalUrl).toBe('https://www.site.com/')
    expect(r.opportunities).toHaveLength(1)
    expect(r.opportunities[0].description).toBe('See docs.')
  })
})
