import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export default function Solve({ assignment, onBack }) {
  const [qs, setQs] = useState(null)
  const [answers, setAnswers] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    supabase.from('assignments').select('questions').eq('id', assignment.id).single().then(({ data, error }) => {
      if (error) return setErr(error.message)
      const list = data.questions ?? []
      setQs(list)
      setAnswers(list.map((q) => (q.type === 'text' ? '' : null)))
    })
  }, [assignment.id])

  async function submit() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('submit_assignment', { p_assignment: assignment.id, p_answers: answers })
    setBusy(false)
    if (error) return setErr(error.message)
    setDone({ score: data })
  }

  const ready = qs && qs.length > 0 && answers.every((a, i) => (qs[i].type === 'text' ? String(a).trim() !== '' : a !== null))

  return (
    <div className="solve">
      <button className="btn-link" onClick={onBack}>← رجوع</button>
      <h1>{assignment.title}</h1>
      {err && <p className="msg" role="alert">{err}</p>}
      {done ? (
        <section className="card">
          <h2>اتسلّم الواجب</h2>
          {done.score != null ? <p className="big">{Number(done.score).toLocaleString('ar-EG')}٪</p> : null}
          <p className="muted">{done.score != null ? 'ده تصحيحك التلقائي للأسئلة الاختيارية. لو فيه أسئلة مقالية المدرس هيصححها ويظهر لك التقييم النهائي.' : 'المدرس هيصحح إجاباتك ويظهر لك التقييم قريبًا.'}</p>
          <button className="btn-primary" onClick={onBack}>تمام</button>
        </section>
      ) : !qs ? (
        <p className="muted">جاري التحميل...</p>
      ) : qs.length === 0 ? (
        <section className="card"><p className="muted">الواجب ده لسه ما اتضافتش أسئلته. ارجع بعدين.</p></section>
      ) : (
        <>
          {qs.map((q, i) => (
            <section className="card" key={i}>
              <div className="strong">{i + 1}. {q.q}</div>
              {q.type === 'text' ? (
                <textarea className="fld area" rows={4} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
              ) : (
                <div className="opts" role="radiogroup" aria-label={q.q}>
                  {q.options.map((o, k) => (
                    <label key={k} className={answers[i] === k ? 'opt on' : 'opt'}>
                      <input type="radio" name={`q${i}`} checked={answers[i] === k} onChange={() => setAnswers(answers.map((a, j) => (j === i ? k : a)))} />
                      {o}
                    </label>
                  ))}
                </div>
              )}
            </section>
          ))}
          <button className="btn-primary" disabled={!ready || busy} onClick={submit}>{busy ? 'لحظة...' : 'سلّم الواجب'}</button>
          {!ready && <p className="muted small">جاوب على كل الأسئلة الأول.</p>}
        </>
      )}
    </div>
  )
}
