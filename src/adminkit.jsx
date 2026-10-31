import { useCallback, useEffect, useState } from 'react'

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
