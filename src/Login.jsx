import { useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'
import { motion } from 'framer-motion'
import { EASE, GoIcon } from './ui.jsx'

export function NewPassword({ onDone }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg('حصلت مشكلة: ' + error.message)
    else onDone()
  }
  return (
    <div className="login-wrap">
      <motion.form className="login-card" onSubmit={submit} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}>
        <div className="login-brand"><Logo size={56} /><div className="brand-name">شاطر<small>Shater</small></div></div>
        <h1>كلمة سر جديدة</h1>
        <label>
          اكتب كلمة السر الجديدة
          <input type="password" dir="ltr" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" />
        </label>
        {msg && <p className="msg" role="alert">{msg}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? 'لحظة...' : 'حفظ ودخول'}</button>
      </motion.form>
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const res =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
    setBusy(false)
    if (res.error) setMsg('حصلت مشكلة: ' + res.error.message)
    else if (mode === 'signup' && !res.data.session) setMsg('اتبعتلك رسالة تأكيد على الإيميل، افتحها وبعدين سجّل دخول.')
  }

  return (
    <div className="login-wrap">
      <motion.form className="login-card" onSubmit={submit} initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: EASE }}>
        <div className="login-brand"><Logo size={56} /><div className="brand-name">شاطر<small>Shater</small></div></div>
        <h1>{mode === 'login' ? 'أهلاً بيك' : 'إنشاء حساب'}</h1>
        {mode === 'signup' && (
          <label>
            الاسم بالكامل
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label>
          الإيميل
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          كلمة السر
          <input type="password" dir="ltr" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'signup' && <p className="muted small">ولي أمر؟ سجّل بنفس الطريقة، وإدارة السنتر هتربط حسابك بحساب ابنك.</p>}
        {msg && <p className="msg" role="alert">{msg}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'لحظة...' : <>{mode === 'login' ? 'دخول' : 'إنشاء الحساب'}<GoIcon /></>}
        </button>
        {mode === 'login' && (
          <button type="button" className="btn-link" onClick={async () => {
            if (!email) { setMsg('اكتب الإيميل الأول، وبعدين اضغط "نسيت كلمة السر".'); return }
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
            setMsg(error ? 'حصلت مشكلة: ' + error.message : 'لو الإيميل مسجل هيوصلك رابط تغيير كلمة السر.')
          }}>نسيت كلمة السر؟</button>
        )}
        <button type="button" className="btn-link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }}>
          {mode === 'login' ? 'معندكش حساب؟ سجّل' : 'عندك حساب؟ ادخل'}
        </button>
      </motion.form>
    </div>
  )
}
