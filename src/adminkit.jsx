import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { EASE } from './ui.jsx'

export const ROLE_AR = { manager: 'مدير', teacher: 'مدرس', assistant: 'مساعد', student: 'طالب', parent: 'ولي أمر' }
export const fmtDT = (iso) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
export const fmtD = (iso) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(iso))
export const num = (n) => Number(n ?? 0).toLocaleString('ar-EG')

export async function q(p) {
  const r = await p
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => fn().then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message)), deps) // eslint-disable-line
  useEffect(() => { load() }, [load])
  return [data, load, err]
}

export function Notice({ err }) {
  return err ? <p className="msg" role="alert">حصلت مشكلة: {err}</p> : null
}

// ملحوظة: طلبات supabase مابتتبعتش غير لما نستناها (then/await)، فلازم then هنا عشان التسجيل يتبعت فعلًا
export const logAct = (action, table, target, details) =>
  supabase.rpc('log_action', { p_action: action, p_table: table, p_target: target ?? null, p_details: details ?? null }).then(() => {}, () => {})

/** رسالة صغيرة بتظهر تحت الشاشة وتختفي لوحدها */
export function toast(text, kind = 'error') {
  const el = document.createElement('div')
  el.className = `toast ${kind}`; el.setAttribute('role', kind === 'error' ? 'alert' : 'status'); el.textContent = text
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400) }, 4500)
}

/** بينفذ عملية حفظ ويطلّع رسالة واضحة لو فشلت. بيرجع true لو نجحت */
export async function must(builder, what = 'الحفظ') {
  try {
    const { error } = await builder
    if (error) throw error
    return true
  } catch (e) {
    toast(`${what} مانجحش: ${e.message ?? 'جرّب تاني'}`)
    return false
  }
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal card" role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14 }} transition={{ duration: 0.5, ease: EASE }}>
        <div className="card-head"><h2>{title}</h2><button type="button" className="btn-link" onClick={onClose}>إغلاق</button></div>
        {children}
      </motion.div>
    </motion.div>
  )
}

/** حقل نص بيظهر زرار "حفظ" لما القيمة تتغير */
export function Editable({ value, onSave, type = 'text', width, label }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  const changed = String(v) !== String(value ?? '')
  return (
    <div className="inline" style={{ flexWrap: 'nowrap' }}>
      <input className="fld" aria-label={label} type={type} value={v} style={width ? { width } : undefined} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changed && onSave(v)} />
      {changed && <button type="button" className="btn-outline" onClick={() => onSave(v)}>حفظ</button>}
    </div>
  )
}
