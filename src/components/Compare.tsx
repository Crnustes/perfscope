import { Bar, BarChart, Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Crown, Loader2, Swords } from 'lucide-react'
import { motion } from 'framer-motion'
import { CATEGORIES, LAB_METRICS, RATING_COLOR, formatMetric, hostOf, rateMetric, type LabMetricKey, type Report, type Strategy } from '../lib/metrics'
import { useReports } from '../lib/useReport'
import { PsiError } from '../lib/psi'
import { Card, SectionTitle } from './ui'
import { ScoreGauge } from './Report'

const PALETTE = ['#22d3ee', '#a78bfa', '#f472b6']
const tooltipStyle = { background: '#0b1120', border: '1px solid #1e293b', borderRadius: 12 }

export default function Compare({ urls, strategy }: { urls: string[]; strategy: Strategy }) {
  const results = useReports(urls, strategy)
  const ready = results.map((r) => r.data).filter(Boolean) as Report[]
  const allDone = results.every((r) => !r.isFetching)

  const radarData = CATEGORIES.map((c) => ({
    category: c.label,
    ...Object.fromEntries(ready.map((r) => [hostOf(r.url), r.scores[c.key]])),
  }))

  const metricKeys: LabMetricKey[] = ['fcp', 'lcp', 'si', 'tbt']
  const barData = metricKeys.map((k) => ({
    metric: LAB_METRICS[k].short,
    ...Object.fromEntries(ready.map((r) => [hostOf(r.url), Math.round(r.lab[k])])),
  }))

  // Winner = best Performance score; ties broken by the average of all categories
  const avg = (r: Report) => CATEGORIES.reduce((s, c) => s + r.scores[c.key], 0) / CATEGORIES.length
  const rank = (r: Report) => r.scores.performance * 1000 + avg(r)
  const winner = allDone && ready.length > 1 ? ready.reduce((a, b) => (rank(b) > rank(a) ? b : a)) : null

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 ${urls.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {results.map((r, i) => (
          <Card key={urls[i]} className="relative">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[i] }} />
              <span className="truncate font-semibold text-white">{hostOf(urls[i])}</span>
              {winner && r.data?.id === winner.id && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-bold text-amber-300">
                  <Crown size={12} /> Ganador
                </motion.span>
              )}
            </div>
            {r.isFetching && (
              <div className="flex h-36 items-center justify-center gap-2 text-slate-400">
                <Loader2 className="animate-spin" size={18} /> Analizando…
              </div>
            )}
            {r.error && <p className="text-sm text-red-400">{r.error instanceof PsiError ? r.error.message : 'Error al analizar.'}</p>}
            {r.data && !r.isFetching && (
              <div className="flex justify-center">
                <ScoreGauge score={r.data.scores.performance} label="Performance" size={120} />
              </div>
            )}
          </Card>
        ))}
      </div>

      {ready.length > 1 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle icon={<Swords size={18} />} title="Cara a cara" subtitle="Puntajes Lighthouse por categoría" />
            <div className="h-80">
              <ResponsiveContainer>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="#1e293b" />
                  <PolarAngleAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  {ready.map((r) => (
                    <Radar key={r.id} name={hostOf(r.url)} dataKey={hostOf(r.url)} stroke={PALETTE[urls.indexOf(r.url)]} fill={PALETTE[urls.indexOf(r.url)]} fillOpacity={0.18} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <SectionTitle icon={<Swords size={18} />} title="Tiempos de carga (ms)" subtitle="Menos es mejor" />
            <div className="h-80">
              <ResponsiveContainer>
                <BarChart data={barData} margin={{ left: -8 }}>
                  <XAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {ready.map((r) => (
                    <Bar key={r.id} dataKey={hostOf(r.url)} fill={PALETTE[urls.indexOf(r.url)]} radius={[6, 6, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {ready.length > 1 && (
        <Card>
          <SectionTitle icon={<Swords size={18} />} title="Métrica por métrica" subtitle="La corona marca al mejor de cada fila" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 font-medium">Métrica</th>
                  {ready.map((r) => (
                    <th key={r.id} className="pb-3 font-medium" style={{ color: PALETTE[urls.indexOf(r.url)] }}>
                      {hostOf(r.url)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(LAB_METRICS) as LabMetricKey[]).map((k) => {
                  const best = Math.min(...ready.map((r) => r.lab[k]))
                  return (
                    <tr key={k} className="border-t border-white/5">
                      <td className="py-3 text-slate-300">{LAB_METRICS[k].label}</td>
                      {ready.map((r) => (
                        <td key={r.id} className="py-3 font-mono" style={{ color: RATING_COLOR[rateMetric(r.lab[k], LAB_METRICS[k].thresholds)] }}>
                          {formatMetric(r.lab[k], LAB_METRICS[k].unit)} {r.lab[k] === best && '👑'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
