import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Student from './Student.jsx'
import Admin from './Admin.jsx'
import Parent from './Parent.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setRole(null); return }
    supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({ data }) => setRole(data?.role ?? 'student'))
  }, [session])

  if (session === undefined) return <div className="center-msg">جاري التحميل...</div>
  if (!session) return <Login />
  if (!role) return <div className="center-msg">جاري التحميل...</div>
  if (['manager', 'teacher', 'assistant'].includes(role)) return <Admin session={session} role={role} />
  if (role === 'parent') return <Parent />
  return <Student session={session} />
}
