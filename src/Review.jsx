import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const fmt = (n) => Number(n ?? 0).toLocaleString('ar-EG')
const dt = (iso) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export default function Review({ assignmentId, onBack }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('my_review', { p_assignment: assignmentId }).then(({ data, error }) => (error ? setErr(error.message) : setD(data)))
  }, [assignmentId])

  return (
    <div className="solve">
      <button className="btn-link" onClick={onBack}>→ رجوع</button>
      {err && <p className="msg" role="alert">{err}</p>}
      {!d && !err && <p className="muted">جاري التحميل...</p>}
      {d && (
        <>
          <h1>{d.title}</h1>
          <section className="card">
            <div className="card-head">
              <h2>نتيجتك</h2>
              <span className={`pill ${d.final_score != null ? 'green' : ''}`}>
                {d.final_score != null ? `${fmt(d.final_score)}٪` : d.auto_score != null ? `${fmt(d.auto_score)}٪ (مبدئي)` : 'بانتظار تصحيح المدرس'}
              </span>
            </div>
            {d.feedback && <div className="feedback"><b>تعليق المدرس:</b> {d.feedback}</div>}
            {!d.reveal && <p className="muted small">الإجابات الصحيحة هتظهر بعد آخر ميعاد التسليم ({dt(d.due_at)}).</p>}
          </section>
          {(d.questions ?? []).map((x, i) => {
            const mine = d.answers?.[i]
            const key = d.keys?.[i]
            const isMcq = x.type !== 'text'
            return (
              <section className="card" key={i}>
                <div className="strong">{fmt(i + 1)}. {x.q}</div>
                {isMcq ? (
                  <div className="opts">
                    {x.options.map((o, k) => {
                      const cls = d.reveal && key != null ? (k === Number(key) ? ' right' : k === Number(mine) ? ' wrong' : '') : k === Number(mine) ? ' on' : ''
                      return (
                        <div key={k} className={`opt${cls}`}>
                          {o}
                          {k === Number(mine) && <span className="muted small"> · إجابتك</span>}
                          {d.reveal && k === Number(key) && k !== Number(mine) && <span className="muted small"> · الإجابة الصح</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="opt on" style={{ whiteSpace: 'pre-wrap' }}>{mine || '—'}</div>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
