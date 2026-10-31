import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { typeOf, isCorrect, pointsOf, TYPES } from './questions.js'

const fmt = (n) => Number(n ?? 0).toLocaleString('ar-EG')
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
const emptyAns = (q) => { const t = typeOf(q); return t === 'multi' ? [] : t === 'short' || t === 'essay' ? '' : null }
const answered = (q, a) => { const t = typeOf(q); return t === 'multi' ? a?.length > 0 : t === 'short' || t === 'essay' ? String(a ?? '').trim() !== '' : a !== null && a !== undefined }
const clock = (s) => `${fmt(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])}`

/** preview: { questions, keys, time_limit_min, shuffle_questions, shuffle_options } — معاينة للمدرس من غير تسليم */
export default function Solve({ assignment, onBack, preview }) {
  const [a, setA] = useState(preview ?? null)
  const [answers, setAnswers] = useState([])
  const [phase, setPhase] = useState('load')
  const [deadline, setDeadline] = useState(null)
  const [left, setLeft] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const sent = useRef(false)

  useEffect(() => {
    if (preview) return
    supabase.from('assignments').select('questions, time_limit_min, shuffle_questions, shuffle_options, due_at, allow_late').eq('id', assignment.id).single()
      .then(({ data, error }) => (error ? setErr(error.message) : setA(data)))
  }, [assignment.id, preview])

  const qs = a?.questions ?? []
  const order = useMemo(() => (a?.shuffle_questions ? shuffle(qs.map((_, i) => i)) : qs.map((_, i) => i)), [a]) // eslint-disable-line
  const optOrder = useMemo(() => qs.map((q) => (q.options ? (a?.shuffle_options ? shuffle(q.options.map((_, k) => k)) : q.options.map((_, k) => k)) : [])), [a]) // eslint-disable-line

  useEffect(() => {
    if (!a) return
    setAnswers(qs.map(emptyAns))
    setPhase(a.time_limit_min ? 'intro' : 'answer')
  }, [a]) // eslint-disable-line

  useEffect(() => {
    if (!deadline || phase !== 'answer') return
    const tick = () => {
      const s = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setLeft(s)
      if (s <= 0) submit(true)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [deadline, phase]) // eslint-disable-line

  async function start() {
    setErr('')
    if (preview) { setDeadline(Date.now() + a.time_limit_min * 60000); setPhase('answer'); return }
    const { data, error } = await supabase.rpc('start_assignment', { p_assignment: assignment.id })
    if (error) return setErr(error.message)
    setDeadline(new Date(data).getTime() + a.time_limit_min * 60000)
    setPhase('answer')
  }

  const setAns = (i, v) => setAnswers((prev) => prev.map((x, j) => (j === i ? v : x)))
  const doneCount = qs.filter((q, i) => answered(q, answers[i])).length

  async function submit(auto = false) {
    if (sent.current) return
    const missing = qs.length - doneCount
    if (!auto && missing > 0 && !window.confirm(`لسه فيه ${fmt(missing)} سؤال من غير إجابة. تسلّم كده؟`)) return
    sent.current = true
    setBusy(true); setErr('')
    if (preview) {
      let tot = 0, got = 0, essay = false
      qs.forEach((q, i) => { if (typeOf(q) === 'essay') { essay = true; return } tot += pointsOf(q); if (isCorrect(q, answers[i], preview.keys?.[i])) got += pointsOf(q) })
      setDone({ score: tot ? Math.round((1000 * got) / tot) / 10 : null, essay, preview: true, auto })
      setBusy(false); setPhase('done'); return
    }
    const { data, error } = await supabase.rpc('submit_assignment', { p_assignment: assignment.id, p_answers: answers })
    setBusy(false)
    if (error) { sent.current = false; return setErr(error.message) }
    setDone({ score: data, essay: qs.some((q) => typeOf(q) === 'essay'), auto })
    setPhase('done')
  }

  return (
    <div className={preview ? 'solve in-modal' : 'solve'}>
      {!preview && <button className="btn-link" onClick={onBack}>→ رجوع</button>}
      <h1>{assignment.title}</h1>
      {err && <p className="msg" role="alert">{err}</p>}

      {phase === 'load' && !err && <p className="muted">جاري التحميل...</p>}

      {phase === 'intro' && (
        <section className="card">
          <h2>الكويز ده ليه وقت</h2>
          <p>عندك <b>{fmt(a.time_limit_min)} دقيقة</b> من أول ما تضغط "ابدأ"، و{fmt(qs.length)} سؤال. لما الوقت يخلص إجاباتك بتتسلّم لوحدها.</p>
          <button className="btn-primary" onClick={start}>ابدأ</button>
        </section>
      )}

      {phase === 'answer' && (qs.length === 0 ? (
        <section className="card"><p className="muted">الواجب ده لسه ما اتضافتش أسئلته.</p></section>
      ) : (
        <>
          <div className="solve-bar">
            <span className="pill">جاوبت {fmt(doneCount)} من {fmt(qs.length)}</span>
            {left != null && <span className={`pill ${left < 60 ? 'red' : ''}`} role="timer" aria-label="الوقت المتبقي">{clock(left)}</span>}
          </div>
          {order.map((i, n) => {
            const q = qs[i]
            const t = typeOf(q)
            const ans = answers[i]
            return (
              <section className="card" key={i}>
                <div className="card-head">
                  <div className="strong">{fmt(n + 1)}. <span style={{ whiteSpace: 'pre-wrap' }}>{q.q}</span></div>
                  <span className="muted small">{TYPES[t]}{pointsOf(q) !== 1 ? ` (${fmt(pointsOf(q))} درجة)` : ''}</span>
                </div>
                {t === 'mcq' && (
                  <div className="opts" role="radiogroup" aria-label={q.q}>
                    {optOrder[i].map((k) => (
                      <label key={k} className={ans === k ? 'opt on' : 'opt'}>
                        <input type="radio" name={`q${i}`} checked={ans === k} onChange={() => setAns(i, k)} />
                        {q.options[k]}
                      </label>
                    ))}
                  </div>
                )}
                {t === 'multi' && (
                  <div className="opts" role="group" aria-label={q.q}>
                    <span className="muted small">اختار كل الإجابات الصح</span>
                    {optOrder[i].map((k) => {
                      const on = ans?.includes(k)
                      return (
                        <label key={k} className={on ? 'opt on' : 'opt'}>
                          <input type="checkbox" checked={!!on} onChange={() => setAns(i, on ? ans.filter((x) => x !== k) : [...(ans ?? []), k])} />
                          {q.options[k]}
                        </label>
                      )
                    })}
                  </div>
                )}
                {t === 'tf' && (
                  <div className="opts tf" role="radiogroup" aria-label={q.q}>
                    <button type="button" className={`opt btn-opt${ans === true ? ' on' : ''}`} aria-pressed={ans === true} onClick={() => setAns(i, true)}>صح</button>
                    <button type="button" className={`opt btn-opt${ans === false ? ' on' : ''}`} aria-pressed={ans === false} onClick={() => setAns(i, false)}>خطأ</button>
                  </div>
                )}
                {t === 'short' && <input className="fld" dir="auto" placeholder="اكتب إجابتك" value={ans ?? ''} onChange={(e) => setAns(i, e.target.value)} />}
                {t === 'essay' && <textarea className="fld area" dir="auto" rows={4} placeholder="اكتب إجابتك" value={ans ?? ''} onChange={(e) => setAns(i, e.target.value)} />}
              </section>
            )
          })}
          <button className="btn-primary" disabled={busy} onClick={() => submit(false)}>{busy ? 'لحظة...' : preview ? 'جرّب التسليم' : 'سلّم'}</button>
        </>
      ))}

      {phase === 'done' && done && (
        <section className="card">
          <h2>{done.preview ? 'نتيجة المعاينة' : done.auto ? 'الوقت خلص واتسلّمت إجاباتك' : 'اتسلّم'}</h2>
          {done.score != null && <p className="big">{fmt(done.score)}٪</p>}
          <p className="muted">
            {done.score != null && done.essay ? 'ده تصحيح الأسئلة التلقائية. الأسئلة المقالية المدرس هيصححها ويظهر لك التقييم النهائي.'
              : done.score != null ? 'دي درجتك. تقدر تراجع إجاباتك من صفحة الواجبات.'
                : 'المدرس هيصحح إجاباتك ويظهر لك التقييم قريبًا.'}
          </p>
          {done.preview ? <p className="muted small">دي معاينة، مفيش حاجة اتسلّمت.</p> : <button className="btn-primary" onClick={onBack}>تمام</button>}
        </section>
      )}
    </div>
  )
}
