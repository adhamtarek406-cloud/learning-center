import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { typeOf, isCorrect, answerText, keyText } from './questions.js'

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
            {!d.reveal && <p className="muted small">{d.show_answers === 'never' ? 'المدرس اختار إن الإجابات الصح ماتظهرش للواجب ده.' : `الإجابات الصحيحة هتظهر بعد آخر ميعاد التسليم (${dt(d.due_at)}).`}</p>}
          </section>
          {(d.questions ?? []).map((x, i) => {
            const mine = d.answers?.[i]
            const key = d.keys?.[i]
            const t = typeOf(x)
            const right = d.reveal ? isCorrect(x, mine, key) : null
            return (
              <section className="card" key={i}>
                <div className="card-head">
                  <div className="strong">{fmt(i + 1)}. <span style={{ whiteSpace: 'pre-wrap' }}>{x.q}</span></div>
                  {right !== null && <span className={`pill ${right ? 'green' : 'red'}`}>{right ? 'صح' : 'غلط'}</span>}
                </div>
                {(t === 'mcq' || t === 'multi') ? (
                  <div className="opts">
                    {x.options.map((o, k) => {
                      const picked = t === 'mcq' ? k === Number(mine) : (mine ?? []).includes(k)
                      const isKey = d.reveal && key != null && (t === 'mcq' ? k === Number(key) : (key ?? []).includes(k))
                      const cls = d.reveal && key != null ? (isKey ? ' right' : picked ? ' wrong' : '') : picked ? ' on' : ''
                      return (
                        <div key={k} className={`opt${cls}`}>
                          {o}
                          {picked && <span className="muted small"> • إجابتك</span>}
                          {isKey && !picked && <span className="muted small"> • الإجابة الصح</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    <div className={`opt ${right === true ? 'right' : right === false ? 'wrong' : 'on'}`} style={{ whiteSpace: 'pre-wrap' }}>إجابتك: {answerText(x, mine)}</div>
                    {right === false && key != null && <div className="opt right">الإجابة الصح: {keyText(x, key)}</div>}
                    {t === 'essay' && <p className="muted small">السؤال ده بيتصحح من المدرس.</p>}
                  </>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
