import { useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'

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
      <form className="login-card" onSubmit={submit}>
        <Logo size={56} />
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
          {busy ? 'لحظة...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
        </button>
        <button type="button" className="btn-link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }}>
          {mode === 'login' ? 'معندكش حساب؟ سجّل' : 'عندك حساب؟ ادخل'}
        </button>
      </form>
    </div>
  )
}
