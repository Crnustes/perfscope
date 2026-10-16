import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Github, History, KeyRound, Monitor, Plus, Search, Settings, Smartphone, Swords, Trash2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useReport } from './lib/useReport'
import { PsiError } from './lib/psi'
import { RATING_COLOR, hostOf, normalizeUrl, rateScore, type Strategy } from './lib/metrics'
import { useAppStore } from './store/useAppStore'
import { ReportView } from './components/Report'
import { Card, ErrorBox, Scanning } from './components/ui'

const Compare = lazy(() => import('./components/Compare'))

type Mode = 'analyze' | 'compare'
interface Route {
  mode: Mode
  urls: string[]
  strategy: Strategy
}

/* ---------- URL <-> state sync: every analysis is a shareable link ---------- */
function readRoute(fallback: Strategy): Route {
  const p = new URLSearchParams(location.search)
  const urls = p.getAll('url').map((u) => normalizeUrl(u)).filter(Boolean) as string[]
  const strategy = p.get('strategy') === 'desktop' ? 'desktop' : p.get('strategy') === 'mobile' ? 'mobile' : fallback
  return { mode: urls.length > 1 ? 'compare' : 'analyze', urls, strategy }
}
function writeRoute(r: Route) {
  const p = new URLSearchParams()
  r.urls.forEach((u) => p.append('url', u.replace(/^https:\/\//, '').replace(/\/$/, '')))
  if (r.urls.length) p.set('strategy', r.strategy)
  const qs = p.toString()
  history.pushState(null, '', qs ? `?${qs}` : location.pathname)
}

const EXAMPLES = ['react.dev', 'vercel.com', 'wikipedia.org', 'techtecnic.com']

export default function App() {
  const store = useAppStore()
  const [route, setRoute] = useState<Route>(() => readRoute(store.strategy))
  const [mode, setMode] = useState<Mode>(route.mode)
  const [inputs, setInputs] = useState<string[]>(route.urls.length ? route.urls.map(hostOf) : [''])
  const [formError, setFormError] = useState('')
  const [panel, setPanel] = useState<'settings' | 'history' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  useEffect(() => {
    const onPop = () => setRoute(readRoute(store.strategy))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setPanel(null)
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
    }
  }, [store.strategy])

  // keep the Mobile/Desktop toggle in sync with shared links (?strategy=desktop)
  const { setStrategy: persistStrategy } = store
  useEffect(() => {
    if (route.urls.length) persistStrategy(route.strategy)
  }, [route.strategy, route.urls.length, persistStrategy])

  const navigate = useCallback((r: Route) => {
    setRoute(r)
    writeRoute(r)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const list = (mode === 'compare' ? inputs : inputs.slice(0, 1)).map((v) => v.trim()).filter(Boolean)
    const urls = list.map(normalizeUrl)
    if (!urls.length || urls.some((u) => !u)) return setFormError('Escribe una URL válida, por ejemplo: misitio.com')
    if (mode === 'compare' && urls.length < 2) return setFormError('Agrega al menos 2 sitios para comparar.')
    setFormError('')
    navigate({ mode, urls: urls as string[], strategy: store.strategy })
  }

  const setStrategy = (s: Strategy) => {
    store.setStrategy(s)
    if (route.urls.length) navigate({ ...route, strategy: s })
  }

  const single = route.mode === 'analyze' ? (route.urls[0] ?? null) : null
  const report = useReport(single, route.strategy)
  const hasResults = route.urls.length > 0

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-slate-200">
      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-[140px]" />
        <div className="absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-violet-600/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <button onClick={() => navigate({ mode: 'analyze', urls: [], strategy: store.strategy })} className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-ink-950">
            <Activity size={20} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white">
            Perf<span className="text-cyan-300">Scope</span>
          </span>
        </button>
        <nav className="flex items-center gap-1">
          {store.demoMode && <span className="mr-2 hidden rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-xs font-semibold text-fuchsia-300 sm:inline">Modo demo</span>}
          <IconBtn label="Historial" onClick={() => setPanel('history')}>
            <History size={18} />
          </IconBtn>
          <IconBtn label="Ajustes" onClick={() => setPanel('settings')}>
            <Settings size={18} />
          </IconBtn>
          <a href="https://github.com/Crnustes/perfscope" target="_blank" rel="noreferrer" className="rounded-xl p-2.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="GitHub">
            <Github size={18} />
          </a>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24">
        <AnimatePresence>
          {!hasResults && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="pb-10 pt-12 text-center sm:pt-20">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-xs font-medium text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" /> Powered by Google Lighthouse
              </span>
              <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
                ¿Qué tan rápido es{' '}
                <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">tu sitio web</span>?
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-slate-400">
                Analiza Core Web Vitals, mira tu página cargar cuadro a cuadro, compara contra la competencia y simula cuántos puntos ganarías optimizando.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <form onSubmit={submit} className={`mx-auto max-w-3xl ${hasResults ? 'mb-8' : ''}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m)
                if (m === 'compare' && inputs.length < 2) setInputs([...inputs, ''])
              }}
              options={[
                { value: 'analyze', label: 'Analizar', icon: <Search size={14} /> },
                { value: 'compare', label: 'Comparar', icon: <Swords size={14} /> },
              ]}
            />
            <Segmented
              value={store.strategy}
              onChange={setStrategy}
              options={[
                { value: 'mobile', label: 'Móvil', icon: <Smartphone size={14} /> },
                { value: 'desktop', label: 'Escritorio', icon: <Monitor size={14} /> },
              ]}
            />
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-900/80 p-2 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl focus-within:border-cyan-400/50">
            {(mode === 'compare' ? inputs : inputs.slice(0, 1)).map((v, i) => (
              <div key={i} className={`flex items-center gap-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <Search size={18} className="ml-3 shrink-0 text-slate-500" />
                <input
                  ref={i === 0 ? inputRef : undefined}
                  value={v}
                  onChange={(e) => setInputs(inputs.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? 'tusitio.com' : `competidor-${i}.com`}
                  className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base text-white placeholder:text-slate-600 focus:outline-none"
                  inputMode="url"
                  autoComplete="url"
                  aria-label={`URL ${i + 1}`}
                />
                {mode === 'compare' && inputs.length > 2 && (
                  <button type="button" onClick={() => setInputs(inputs.filter((_, j) => j !== i))} className="p-2 text-slate-500 hover:text-white" aria-label="Quitar">
                    <X size={16} />
                  </button>
                )}
                {i === 0 && (
                  <button type="submit" className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-3 text-sm font-bold text-ink-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 active:scale-95">
                    {mode === 'compare' ? 'Comparar' : 'Analizar'}
                  </button>
                )}
              </div>
            ))}
            {mode === 'compare' && inputs.length < 3 && (
              <button type="button" onClick={() => setInputs([...inputs, ''])} className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-3 text-sm text-slate-500 hover:text-cyan-300">
                <Plus size={16} /> Agregar otro sitio
              </button>
            )}
          </div>
          {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}
          {!hasResults && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">Prueba con:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setInputs([ex])
                    setMode('analyze')
                    navigate({ mode: 'analyze', urls: [normalizeUrl(ex)!], strategy: store.strategy })
                  }}
                  className="rounded-full border border-white/10 px-3 py-1 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-300"
                >
                  {ex}
                </button>
              ))}
              <span className="hidden text-xs text-slate-600 sm:inline">· pulsa <kbd className="rounded border border-white/10 px-1">/</kbd> para buscar</span>
            </div>
          )}
        </form>

        {/* Results */}
        {single && (
          <>
            {report.isFetching && <Scanning label={hostOf(single)} />}
            {report.error && !report.isFetching && (
              <ErrorBox
                message={report.error instanceof PsiError ? report.error.message : 'Ocurrió un error inesperado.'}
                action={
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => qc.invalidateQueries({ queryKey: ['report'] })} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
                      Reintentar
                    </button>
                    {report.error instanceof PsiError && report.error.kind === 'quota' && (
                      <>
                        <button onClick={() => setPanel('settings')} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
                          <KeyRound size={14} /> Agregar API key
                        </button>
                        <button onClick={() => store.setDemoMode(true)} className="rounded-xl bg-fuchsia-500/20 px-4 py-2 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-500/30">
                          Usar modo demo
                        </button>
                      </>
                    )}
                  </div>
                }
              />
            )}
            {report.data && !report.isFetching && <ReportView report={report.data} />}
          </>
        )}

        {route.mode === 'compare' && route.urls.length > 1 && (
          <Suspense fallback={<Scanning label="sitios" />}>
            <Compare urls={route.urls} strategy={route.strategy} />
          </Suspense>
        )}

        {!hasResults && <Features />}
      </main>

      <footer className="relative z-10 pb-10 text-center text-xs text-slate-600">
        Hecho con React + TypeScript por{' '}
        <a href="https://cristian.click" className="text-slate-400 hover:text-cyan-300">
          Cristian Ñustes
        </a>{' '}
        · Datos de Google PageSpeed Insights
      </footer>

      <Drawer open={panel === 'settings'} onClose={() => setPanel(null)} title="Ajustes">
        <SettingsPanel />
      </Drawer>
      <Drawer open={panel === 'history'} onClose={() => setPanel(null)} title="Historial">
        <HistoryPanel
          onPick={(url, strategy) => {
            setPanel(null)
            setMode('analyze')
            setInputs([hostOf(url)])
            store.setStrategy(strategy)
            navigate({ mode: 'analyze', urls: [url], strategy })
          }}
        />
      </Drawer>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="rounded-xl p-2.5 text-slate-400 hover:bg-white/5 hover:text-white">
      {children}
    </button>
  )
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: React.ReactNode }[] }) {
  return (
    <div className="relative flex rounded-xl border border-white/10 bg-ink-900/80 p-1 text-sm">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5">
          {value === o.value && <motion.span layoutId={`seg-${options[0].value}`} className="absolute inset-0 rounded-lg bg-white/10" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
          <span className={`relative flex items-center gap-1.5 ${value === o.value ? 'text-white' : 'text-slate-500'}`}>
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label={title}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-white/10 bg-ink-900 p-6"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function SettingsPanel() {
  const { apiKey, setApiKey, demoMode, setDemoMode } = useAppStore()
  const [draft, setDraft] = useState(apiKey)
  return (
    <div className="space-y-8">
      <div>
        <label className="text-sm font-semibold text-white">API key de PageSpeed Insights</label>
        <p className="mt-1 text-xs text-slate-500">
          Opcional. Sin key se usa la cuota pública compartida de Google, que a veces se agota. Se guarda solo en tu navegador.{' '}
          <a className="text-cyan-300 underline" href="https://developers.google.com/speed/docs/insights/v5/get-started#APIKey" target="_blank" rel="noreferrer">
            Obtener una gratis
          </a>
        </p>
        <div className="mt-3 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} type="password" placeholder="AIza…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-sm focus:border-cyan-400/50 focus:outline-none" />
          <button onClick={() => setApiKey(draft)} className="rounded-xl bg-cyan-400 px-4 text-sm font-bold text-ink-950">
            Guardar
          </button>
        </div>
      </div>
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="text-sm font-semibold text-white">Modo demo</span>
          <span className="mt-1 block text-xs text-slate-500">Genera reportes simulados (deterministas por URL) sin llamar a la API. Ideal para presentaciones.</span>
        </span>
        <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} className="mt-1 h-5 w-5 accent-fuchsia-400" />
      </label>
    </div>
  )
}

function HistoryPanel({ onPick }: { onPick: (url: string, s: Strategy) => void }) {
  const { history, clearHistory } = useAppStore()
  if (!history.length) return <p className="text-sm text-slate-500">Aún no hay análisis. Los resultados se guardan aquí automáticamente.</p>
  return (
    <div>
      <ul className="space-y-2">
        {history.map((h) => (
          <li key={h.id}>
            <button onClick={() => onPick(h.url, h.strategy)} className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[.02] p-3 text-left hover:border-cyan-400/30">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold" style={{ color: RATING_COLOR[rateScore(h.scores.performance)], background: `${RATING_COLOR[rateScore(h.scores.performance)]}1a` }}>
                {h.scores.performance}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{hostOf(h.url)}</span>
                <span className="text-xs text-slate-500">
                  {h.strategy === 'mobile' ? 'Móvil' : 'Escritorio'} · {new Date(h.fetchedAt).toLocaleString()} {h.demo && '· demo'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={clearHistory} className="mt-6 flex items-center gap-2 text-sm text-red-400 hover:text-red-300">
        <Trash2 size={14} /> Borrar historial
      </button>
    </div>
  )
}

function Features() {
  const items = [
    { t: 'Core Web Vitals', d: 'LCP, CLS, TBT e INP con umbrales oficiales de Google, en laboratorio y con usuarios reales (CrUX).' },
    { t: 'Filmstrip de carga', d: 'Mira cuadro a cuadro lo que ve tu usuario mientras la página se pinta.' },
    { t: 'Simulador “¿y si…?”', d: 'Reimplementa la curva log-normal de Lighthouse para proyectar tu nuevo puntaje.' },
    { t: 'Modo batalla', d: 'Compara hasta 3 sitios en paralelo con radar, barras y ganador por métrica.' },
    { t: 'Historial y tendencias', d: 'Cada análisis se guarda localmente para ver cómo evoluciona tu sitio.' },
    { t: 'Links compartibles', d: 'Cada reporte vive en una URL: envíaselo a tu cliente o a tu equipo.' },
  ]
  return (
    <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f, i) => (
        <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
          <Card className="h-full">
            <h3 className="font-semibold text-white">{f.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.d}</p>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
