import { estimatePerformance, type Opportunity, type Report, type Strategy } from './metrics'

/** Deterministic PRNG (mulberry32) seeded from the URL, so the same URL always yields the same demo report. */
function seeded(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rnd: () => number, min: number, max: number) => min + rnd() * (max - min)

/** Draws a page "skeleton" at a given load progress (0..1) as an SVG data URI. */
function frame(progress: number, hue: number): string {
  const show = (at: number) => (progress >= at ? 1 : 0)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 210">
  <rect width="120" height="210" fill="#fff"/>
  <g opacity="${show(0.15)}"><rect width="120" height="18" fill="hsl(${hue},45%,18%)"/>
  <rect x="8" y="6" width="26" height="6" rx="3" fill="#fff" opacity=".8"/></g>
  <g opacity="${show(0.35)}"><rect x="8" y="28" width="80" height="9" rx="3" fill="#1f2937"/>
  <rect x="8" y="41" width="60" height="5" rx="2" fill="#9ca3af"/>
  <rect x="8" y="51" width="34" height="10" rx="5" fill="hsl(${hue},80%,50%)"/></g>
  <g opacity="${show(0.6)}"><rect x="8" y="70" width="104" height="58" rx="5" fill="hsl(${hue},70%,88%)"/>
  <circle cx="60" cy="99" r="14" fill="hsl(${hue},70%,60%)"/></g>
  <g opacity="${show(0.85)}"><rect x="8" y="136" width="49" height="30" rx="4" fill="#e5e7eb"/>
  <rect x="63" y="136" width="49" height="30" rx="4" fill="#e5e7eb"/>
  <rect x="8" y="172" width="104" height="5" rx="2" fill="#d1d5db"/>
  <rect x="8" y="181" width="84" height="5" rx="2" fill="#d1d5db"/></g>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const DEMO_OPPS: Omit<Opportunity, 'savingsMs' | 'savingsBytes' | 'score'>[] = [
  { id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', description: 'Resources are blocking the first paint of your page. Consider delivering critical JS/CSS inline and deferring all non-critical JS/styles.' },
  { id: 'unused-javascript', title: 'Reduce unused JavaScript', description: 'Reduce unused JavaScript and defer loading scripts until they are required to decrease bytes consumed by network activity.' },
  { id: 'modern-image-formats', title: 'Serve images in next-gen formats', description: 'Image formats like WebP and AVIF often provide better compression than PNG or JPEG.' },
  { id: 'uses-responsive-images', title: 'Properly size images', description: 'Serve images that are appropriately-sized to save cellular data and improve load time.' },
  { id: 'unused-css-rules', title: 'Reduce unused CSS', description: 'Reduce unused rules from stylesheets and defer CSS not used for above-the-fold content.' },
  { id: 'offscreen-images', title: 'Defer offscreen images', description: 'Consider lazy-loading offscreen and hidden images after all critical resources have finished loading.' },
  { id: 'server-response-time', title: 'Reduce initial server response time', description: 'Keep the server response time for the main document short because all other requests depend on it.' },
]

export function makeDemoReport(url: string, strategy: Strategy): Report {
  const rnd = seeded(`${url}|${strategy}`)
  const slow = strategy === 'mobile' ? 1.9 : 1
  const lab = {
    fcp: between(rnd, 700, 2400) * slow,
    lcp: between(rnd, 1300, 4200) * slow,
    tbt: between(rnd, 40, 520) * slow,
    cls: Math.round(between(rnd, 0, 0.28) * 1000) / 1000,
    si: between(rnd, 1300, 4600) * slow,
    tti: 0,
  }
  lab.lcp = Math.max(lab.lcp, lab.fcp + 150)
  lab.tti = lab.lcp + lab.tbt * 1.5
  const hue = Math.floor(rnd() * 360)
  const end = lab.lcp * 1.15

  const opportunities = DEMO_OPPS.filter(() => rnd() > 0.25).map((o) => ({
    ...o,
    savingsMs: Math.round(between(rnd, 80, 1400) * slow),
    savingsBytes: Math.round(between(rnd, 20, 900) * 1024),
    score: Math.round(rnd() * 80) / 100,
  }))
  opportunities.sort((x, y) => y.savingsMs - x.savingsMs)

  return {
    id: `demo:${strategy}:${url}`,
    url,
    finalUrl: url,
    strategy,
    fetchedAt: new Date().toISOString(),
    lighthouseVersion: '12.x (demo)',
    scores: {
      performance: estimatePerformance(lab),
      accessibility: Math.round(between(rnd, 72, 100)),
      'best-practices': Math.round(between(rnd, 70, 100)),
      seo: Math.round(between(rnd, 78, 100)),
    },
    lab,
    field: {},
    filmstrip: Array.from({ length: 8 }, (_, i) => {
      const timing = Math.round((end / 8) * (i + 1))
      return { timing, data: frame(timing / end, hue) }
    }),
    opportunities,
    totalBytes: Math.round(between(rnd, 600, 4200) * 1024),
    requests: Math.round(between(rnd, 25, 140)),
    demo: true,
  }
}
