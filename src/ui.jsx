import { useEffect, useRef, useState } from 'react'
import { motion, animate, useInView, useReducedMotion } from 'framer-motion'

// منحنى حركة "ثقيل وناعم" — بدل ease-in-out العادي
export const EASE = [0.32, 0.72, 0, 1]

export const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

export const item = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
}

export const rowItem = {
  hidden: { opacity: 0, x: 14 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
}

/** أرقام بتعد لحد القيمة (بالأرقام العربية) */
export function CountUp({ value, suffix = '' }) {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const target = Number(value ?? 0)
  const [shown, setShown] = useState(reduce ? target : 0)
  useEffect(() => {
    if (!inView) return
    if (reduce) { setShown(target); return }
    const c = animate(0, target, { duration: 1.1, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) })
    return () => c.stop()
  }, [inView, target, reduce])
  return <span ref={ref}>{shown.toLocaleString('ar-EG')}{suffix}</span>
}

/** سهم داخل دايرة (Button-in-Button) — الاتجاه لليسار لأن الواجهة RTL */
export function GoIcon() {
  return (
    <span className="go" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
    </span>
  )
}

/** شريط تقدّم بيتحرك بـ transform بس */
export function Progress({ pct }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        style={{ transformOrigin: 'right' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(0.02, Math.min(1, pct / 100)) }}
        transition={{ duration: 1, ease: EASE, delay: 0.3 }}
      />
    </div>
  )
}

/** تابات بمؤشر بيتنقل بين التابات بحركة spring */
export function Tabs({ items, value, onChange, label, id, flat }) {
  return (
    <nav className={'tabs' + (flat ? ' flat' : '')} aria-label={label}>
      {items.map(([k, l]) => (
        <button key={k} type="button" className={'tab' + (value === k ? ' active' : '')} onClick={() => onChange(k)} aria-current={value === k ? 'page' : undefined}>
          {value === k && <motion.span layoutId={id} className="tab-ind" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span className="tab-l">{l}</span>
        </button>
      ))}
    </nav>
  )
}
