import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-3xl border border-white/[.07] bg-ink-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl ${className}`}
    >
      {children}
    </motion.section>
  )
}

export function SectionTitle({ icon, title, subtitle, right }: { icon: ReactNode; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">{icon}</span>
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

const STEPS = [
  'Levantando Chrome headless…',
  'Simulando red 4G lenta y CPU 4× más lenta…',
  'Cargando la página y grabando cada frame…',
  'Midiendo LCP, CLS y Total Blocking Time…',
  'Auditando accesibilidad y SEO…',
  'Calculando oportunidades de mejora…',
]

export function Scanning({ label }: { label: string }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2600)
    return () => clearInterval(id)
  }, [])
  return (
    <Card className="flex flex-col items-center py-16 text-center">
      <div className="relative h-32 w-32">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border border-cyan-400/50"
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
          />
        ))}
        <motion.div
          className="absolute inset-6 rounded-full border-4 border-cyan-400/20 border-t-cyan-300"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <p className="mt-8 font-semibold text-white">Analizando {label}</p>
      <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 font-mono text-sm text-cyan-300/80">
        {STEPS[step]}
      </motion.p>
      <p className="mt-6 text-xs text-slate-500">Un análisis real tarda entre 15 y 40 segundos.</p>
    </Card>
  )
}

export function ErrorBox({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Card className="border-red-500/20">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-400">
          <AlertTriangle size={20} />
        </span>
        <div className="flex-1">
          <p className="font-semibold text-white">No pudimos completar el análisis</p>
          <p className="mt-1 text-sm text-slate-400">{message}</p>
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </Card>
  )
}
