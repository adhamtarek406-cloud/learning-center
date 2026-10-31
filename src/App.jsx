import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Login, { NewPassword } from './Login.jsx'
import Student from './Student.jsx'
import Admin from './Admin.jsx'
import Parent from './Parent.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)
  const [recovery, setRecovery] = useState(false)
  const uid = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!uid) { setRole(null); return }
    let alive = true
    ;(async () => {
      await supabase.rpc('claim_invite') // يفعّل دعوة الإدارة (لو فيه) بعد تأكيد الإيميل
      const { data } = await supabase.from('profiles').select('role, active').eq('id', uid).single()
      if (alive) setRole(data?.active === false ? 'suspended' : data?.role ?? 'student')
    })()
    return () => { alive = false }
  }, [uid])

  if (session === undefined) return <div className="center-msg">جاري التحميل...</div>
  if (!session) return <Login />
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />
  if (!role) return <div className="center-msg">جاري التحميل...</div>
  if (role === 'suspended')
    return (
      <div className="center-msg">
        <div className="login-card">
          <h1>الحساب موقوف</h1>
          <p className="muted" style={{ textAlign: 'center' }}>حسابك متوقف حاليًا. كلّم إدارة السنتر عشان يرجّعوه.</p>
          <button className="btn-primary" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
        </div>
      </div>
    )
  if (['manager', 'teacher', 'assistant'].includes(role)) return <Admin session={session} role={role} />
  if (role === 'parent') return <Parent />
  return <Student session={session} />
}
