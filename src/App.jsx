import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Student from './Student.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="center-msg">جاري التحميل...</div>
  if (!session) return <Login />
  return <Student session={session} />
}
