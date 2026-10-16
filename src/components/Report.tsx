import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, Download, Gauge, Image as ImageIcon, Sparkles, Users, Wand2, Zap } from 'lucide-react'
import {
  CATEGORIES,
  FIELD_METRICS,
  LAB_METRICS,
  RATING_COLOR,
  formatBytes,
  formatMetric,
  hostOf,
  projectWithFixes,
  rateMetric,
  rateScore,
  type FieldMetricKey,
  type LabMetricKey,
  type Report,
} from '../lib/metrics'
import { trendFor, useAppStore } from '../store/useAppStore'
import { Card, SectionTitle } from './ui'

/* ------------------------------------------------------------------ */
/* Animated circular score gauge                                       */
/* ------------------------------------------------------------------ */
export function ScoreGauge({ score, label, size = 132, delay = 0 }: { score: number; label: string; size?: number; delay?: number }) {
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  const color = RATING_COLOR[rateScore(score)]
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => Math.round(v))
  const dash = useTransform(mv, (v) => `${(v / 100) * c} ${c}`)

  useEffect(() => {
    const controls = animate(mv, score, { duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [score, delay, mv])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <div className="absolute inset-3 rounded-full blur-2xl opacity-30" style={{ background: color }} />
        <svg width={size} height={size} className="relative -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={10} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            style={{ strokeDasharray: dash }}
          />
        </svg>
        <motion.span className="absolute inset-0 grid place-items-center font-mono text-4xl font-bold" style={{ color }}>
          {rounded}
        </motion.span>
      </div>
      <span className="text-sm font-medium text-slate-300">{label}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Metric card with threshold bar                                      */
/* ------------------------------------------------------------------ */
function MetricCard({ value, def, index }: { value: number; def: (typeof LAB_METRICS)[LabMetricKey]; index: number }) {
  const rating = rateMetric(value, def.thresholds)
  const [good, poor] = def.thresholds
  const max = poor * 1.6
  const pos = Math.min(100, (value / max) * 100)
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className="rounded-2xl border border-white/5 bg-white/[.03] p-4"
      title={def.hint}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-slate-400">{def.short}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: RATING_COLOR[rating], boxShadow: `0 0 12px ${RATING_COLOR[rating]}` }} />
      </div>
      <div className="mt-2 font-mono text-2xl font-bold" style={{ color: RATING_COLOR[rating] }}>
        {formatMetric(value, def.unit)}
      </div>
      <div className="mt-1 truncate text-xs text-slate-500">{def.label}</div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0 bg-emerald-500/60" style={{ width: `${(good / max) * 100}%` }} />
        <div className="absolute inset-y-0 bg-amber-500/60" style={{ left: `${(good / max) * 100}%`, width: `${((poor - good) / max) * 100}%` }} />
        <div className="absolute inset-y-0 right-0 bg-red-500/60" style={{ left: `${(poor / max) * 100}%` }} />
      </div>
      <motion.div
        className="relative -mt-2.5 h-3.5 w-1 rounded bg-white shadow"
        initial={{ left: 0 }}
        animate={{ left: `calc(${pos}% - 2px)` }}
        transition={{ delay: 0.3 + index * 0.06, duration: 0.8 }}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Filmstrip — how the page paints over time                           */
/* ------------------------------------------------------------------ */
function Filmstrip({ report }: { report: Report }) {
  if (!report.filmstrip.length) return null
  return (
    <Card>
      <SectionTitle icon={<ImageIcon size={18} />} title="Carga cuadro a cuadro" subtitle="Así ve tu usuario la página mientras carga" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {report.filmstrip.map((f, i) => {
          const afterLcp = f.timing >= report.lab.lcp
          return (
            <motion.figure
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.07 }}
              className="shrink-0"
            >
              <img
                src={f.data}
                alt={`Frame at ${f.timing} ms`}
                className={`h-40 w-auto rounded-lg border-2 bg-white object-cover ${afterLcp ? 'border-emerald-400/70' : 'border-white/10'}`}
                loading="lazy"
              />
              <figcaption className="mt-1 text-center font-mono text-xs text-slate-400">{(f.timing / 1000).toFixed(1)}s</figcaption>
            </motion.figure>
          )
        })}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Opportunities + "what if" simulator                                 */
/* ------------------------------------------------------------------ */
function Opportunities({ report }: { report: Report }) {
  const [open, setOpen] = useState<string | null>(null)
  const [fixes, setFixes] = useState(3)
  const projection = useMemo(() => projectWithFixes(report, fixes), [report, fixes])
  const maxSave = Math.max(1, ...report.opportunities.map((o) => o.savingsMs))
  const gain = projection.score - report.scores.performance

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <SectionTitle icon={<Zap size={18} />} title="Oportunidades" subtitle="Ordenadas por impacto estimado" />
        {report.opportunities.length === 0 && <p className="text-slate-400">Sin oportunidades relevantes. 🎉</p>}
        <ul className="space-y-2">
          {report.opportunities.map((o, i) => (
            <li key={o.id} className="overflow-hidden rounded-xl border border-white/5 bg-white/[.02]">
              <button
                onClick={() => setOpen(open === o.id ? null : o.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[.03]"
                aria-expanded={open === o.id}
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${i < fixes ? 'bg-cyan-400/20 text-cyan-300' : 'bg-white/5 text-slate-500'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-200">{o.title}</span>
                <div className="hidden w-32 sm:block">
                  <motion.div
                    className="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-red-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(o.savingsMs / maxSave) * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.05 }}
                  />
                </div>
                <span className="w-20 text-right font-mono text-xs text-amber-300">
                  {o.savingsMs > 0 ? `-${formatMetric(o.savingsMs, 'ms')}` : formatBytes(o.savingsBytes)}
                </span>
                <ChevronDown size={16} className={`text-slate-500 transition ${open === o.id ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {open === o.id && (
                  <motion.p
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 pb-4 pl-[52px] text-sm leading-relaxed text-slate-400"
                  >
                    {o.description}
                    {o.savingsBytes > 0 && <span className="mt-1 block text-xs text-slate-500">Ahorro potencial: {formatBytes(o.savingsBytes)}</span>}
                  </motion.p>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl" />
        <SectionTitle icon={<Wand2 size={18} />} title="Simulador “¿y si…?”" subtitle="Proyección con el modelo de scoring de Lighthouse" />
        <label className="text-sm text-slate-400">
          Arreglar las top <b className="text-white">{fixes}</b> oportunidades
        </label>
        <input
          type="range"
          min={0}
          max={Math.max(1, report.opportunities.length)}
          value={fixes}
          onChange={(e) => setFixes(Number(e.target.value))}
          className="mt-3 w-full accent-cyan-400"
        />
        <div className="mt-6 flex items-end justify-center gap-6">
          <div className="text-center">
            <div className="font-mono text-4xl font-bold" style={{ color: RATING_COLOR[rateScore(report.scores.performance)] }}>
              {report.scores.performance}
            </div>
            <div className="text-xs text-slate-500">hoy</div>
          </div>
          <Sparkles className="mb-4 text-cyan-300" />
          <div className="text-center">
            <motion.div
              key={projection.score}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-mono text-6xl font-extrabold"
              style={{ color: RATING_COLOR[rateScore(projection.score)] }}
            >
              {projection.score}
            </motion.div>
            <div className="text-xs text-slate-500">proyectado</div>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          {gain > 0 ? (
            <>
              <b className="text-emerald-400">+{gain} puntos</b> recortando ~{formatMetric(projection.savedMs, 'ms')} de carga
            </>
          ) : (
            'Mueve el control para simular mejoras'
          )}
        </p>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Field data (real users, CrUX)                                       */
/* ------------------------------------------------------------------ */
function FieldData({ report }: { report: Report }) {
  const keys = (Object.keys(FIELD_METRICS) as FieldMetricKey[]).filter((k) => report.field[k] !== undefined)
  if (!keys.length) return null
  const overall = report.field.overall
  return (
    <Card>
      <SectionTitle
        icon={<Users size={18} />}
        title="Usuarios reales (Chrome UX Report)"
        subtitle="Percentil 75 de los últimos 28 días"
        right={
          overall && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${overall === 'FAST' ? 'bg-emerald-500/15 text-emerald-300' : overall === 'AVERAGE' ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>
              Core Web Vitals: {overall === 'FAST' ? 'APROBADO' : 'NO APROBADO'}
            </span>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {keys.map((k, i) => (
          <MetricCard key={k} value={report.field[k]!} def={FIELD_METRICS[k]} index={i} />
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Score trend from local history                                      */
/* ------------------------------------------------------------------ */
function Trend({ report }: { report: Report }) {
  const history = useAppStore((s) => s.history)
  const data = trendFor(history, report.url, report.strategy).map((h) => ({
    t: new Date(h.fetchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    score: h.scores.performance,
  }))
  if (data.length < 2) return null
  return (
    <Card>
      <SectionTitle icon={<Gauge size={18} />} title="Tendencia de Performance" subtitle={`${data.length} análisis guardados de ${hostOf(report.url)}`} />
      <div className="h-40">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: -24, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="trend" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12 }} />
            <Area type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={2} fill="url(#trend)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Full report                                                         */
/* ------------------------------------------------------------------ */
export function ReportView({ report }: { report: Report }) {
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `perfscope-${hostOf(report.url)}-${report.strategy}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      {report.quotaFallback && (
        <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-5 py-4 text-sm text-fuchsia-100">
          <b>Resultados simulados.</b> La cuota pública gratuita de Google PageSpeed está agotada en este momento, así que
          te mostramos un reporte de ejemplo. Agrega tu propia API key (gratis) en <b>Ajustes ⚙️</b> para ver datos reales.
        </div>
      )}
      <Card className="relative overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <a href={report.finalUrl} target="_blank" rel="noreferrer" className="block truncate text-xl font-bold text-white hover:text-cyan-300">
              {hostOf(report.finalUrl)}
            </a>
            <p className="mt-1 text-xs text-slate-500">
              {report.strategy === 'mobile' ? '📱 Móvil' : '🖥️ Escritorio'} · Lighthouse {report.lighthouseVersion} ·{' '}
              {new Date(report.fetchedAt).toLocaleString()} · {report.requests} requests · {formatBytes(report.totalBytes)}
              {report.demo && <span className="ml-2 rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-fuchsia-300">DEMO</span>}
            </p>
          </div>
          <button onClick={exportJson} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
            <Download size={16} /> Exportar JSON
          </button>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
          {CATEGORIES.map((c, i) => (
            <ScoreGauge key={c.key} score={report.scores[c.key]} label={c.label} delay={i * 0.12} />
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={<Gauge size={18} />} title="Métricas de laboratorio" subtitle="Medidas por Lighthouse en una carga simulada" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(Object.keys(LAB_METRICS) as LabMetricKey[]).map((k, i) => (
            <MetricCard key={k} value={report.lab[k]} def={LAB_METRICS[k]} index={i} />
          ))}
        </div>
      </Card>

      <FieldData report={report} />
      <Filmstrip report={report} />
      <Opportunities report={report} />
      <Trend report={report} />
    </div>
  )
}
