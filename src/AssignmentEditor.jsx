import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { EASE } from './ui.jsx'
import { num, q as run, Notice, Modal, logAct } from './adminkit.jsx'
import { TYPES, TYPE_HINT, typeOf, pointsOf, parseRows, readSpreadsheet, downloadTemplate } from './questions.js'
import Solve from './Solve.jsx'

let seq = 0
const nid = () => `q${++seq}`
const blank = (type) => ({
  id: nid(), type, q: '', points: 1,
  options: type === 'mcq' || type === 'multi' ? ['', '', '', ''] : [],
  key: type === 'multi' ? [] : type === 'short' ? '' : null,
})
const toLocal = (iso) => { if (!iso) return ''; const x = new Date(iso); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16) }
const fromLocal = (v) => (v ? new Date(v).toISOString() : null)

/** من قاعدة البيانات لحالة المحرر */
function fromDB(questions, keys) {
  return (questions ?? []).map((x, i) => {
    const type = typeOf(x)
    const k = keys?.[i] ?? null
    return {
      id: nid(), type, q: x.q ?? '', points: pointsOf(x), options: x.options ?? [],
      key: type === 'short' ? (k ?? []).join(' | ') : type === 'multi' ? k ?? [] : k,
    }
  })
}
/** من حالة المحرر لقاعدة البيانات */
function toDB(qs) {
  const questions = qs.map((x) => {
    const base = { type: x.type, q: x.q.trim(), points: Number(x.points) > 0 ? Number(x.points) : 1 }
    return x.type === 'mcq' || x.type === 'multi' ? { ...base, options: x.options.map((o) => o.trim()) } : base
  })
  const keys = qs.map((x) => {
    if (x.type === 'short') return String(x.key ?? '').split('|').map((s) => s.trim()).filter(Boolean)
    if (x.type === 'essay') return null
    return x.key
  })
  return { questions, keys }
}
function problems(qs) {
  const out = []
  if (!qs.length) out.push('ضيف سؤال واحد على الأقل.')
  qs.forEach((x, i) => {
    const n = `سؤال ${num(i + 1)}`
    if (!x.q.trim()) out.push(`${n}: نص السؤال فاضي.`)
    if ((x.type === 'mcq' || x.type === 'multi') && x.options.some((o) => !o.trim())) out.push(`${n}: فيه اختيار فاضي (اكتبه أو امسحه).`)
    if (x.type === 'mcq' && x.key == null) out.push(`${n}: حدد الإجابة الصحيحة.`)
    if (x.type === 'multi' && !x.key?.length) out.push(`${n}: حدد إجابة صحيحة واحدة على الأقل.`)
    if (x.type === 'tf' && x.key == null) out.push(`${n}: حدد صح ولا خطأ.`)
    if (x.type === 'short' && !String(x.key ?? '').trim()) out.push(`${n}: اكتب الإجابة المقبولة.`)
  })
  return out
}

export default function AssignmentEditor({ groups, gname, initial, locked, onSaved, onCancel }) {
  const edit = !!initial
  const [f, setF] = useState(() => ({
    group_id: initial?.group_id ?? '', title: initial?.title ?? '', kind: initial?.kind ?? 'homework',
    due_at: toLocal(initial?.due_at), available_from: toLocal(initial?.available_from),
    time_limit_min: initial?.time_limit_min ?? '', shuffle_questions: initial?.shuffle_questions ?? false,
    shuffle_options: initial?.shuffle_options ?? false, show_answers: initial?.show_answers ?? 'after_due', allow_late: initial?.allow_late ?? true,
  }))
  const [qs, setQs] = useState(() => (initial ? fromDB(initial.questions, initial.keys) : [blank('mcq')]))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [imp, setImp] = useState(null)
  const [paste, setPaste] = useState(null)
  const [preview, setPreview] = useState(false)
  const [tried, setTried] = useState(false)
  const fileRef = useRef(null)

  const upd = (i, patch) => setQs(qs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= qs.length) return; const c = [...qs]; [c[i], c[j]] = [c[j], c[i]]; setQs(c) }
  const changeType = (i, type) => {
    const x = qs[i]
    const keepOpts = (type === 'mcq' || type === 'multi') ? (x.options.length >= 2 ? x.options : ['', '', '', '']) : []
    upd(i, { type, options: keepOpts, key: type === 'multi' ? [] : type === 'short' ? '' : null })
  }
  const total = qs.reduce((s, x) => s + (Number(x.points) > 0 ? Number(x.points) : 1), 0)
  const issues = problems(qs)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg('')
    try {
      const rows = await readSpreadsheet(file)
      const r = parseRows(rows)
      setImp({ ...r, name: file.name })
    } catch (err) { setMsg('مقدرناش نقرا الملف: ' + err.message) }
  }
  function onPaste() {
    const rows = paste.split(/\r?\n/).map((l) => l.split('\t'))
    setImp({ ...parseRows(rows), name: 'لصق' })
    setPaste(null)
  }
  function applyImport(mode) {
    const add = imp.questions.map((x) => ({ ...x, id: nid(), key: x.type === 'short' ? (x.key ?? []).join(' | ') : x.key }))
    const empty = qs.length === 1 && !qs[0].q.trim()
    setQs(mode === 'replace' || empty ? add : [...qs, ...add])
    setImp(null)
  }

  async function save() {
    setTried(true); setMsg('')
    if (!f.group_id || !f.title.trim()) { setMsg('اختار المجموعة واكتب عنوان.'); return }
    if (!locked && issues.length) { setMsg('فيه حاجات ناقصة في الأسئلة (مكتوبة تحت).'); return }
    setBusy(true)
    try {
      const meta = {
        group_id: f.group_id, title: f.title.trim(), kind: f.kind,
        due_at: fromLocal(f.due_at), available_from: fromLocal(f.available_from),
        time_limit_min: f.time_limit_min === '' ? null : Number(f.time_limit_min),
        shuffle_questions: f.shuffle_questions, shuffle_options: f.shuffle_options,
        show_answers: f.show_answers, allow_late: f.allow_late,
      }
      const { questions, keys } = toDB(qs)
      if (edit) {
        await run(supabase.from('assignments').update(locked ? meta : { ...meta, questions }).eq('id', initial.id))
        if (!locked) await run(supabase.from('assignment_keys').upsert({ assignment_id: initial.id, answers: keys }))
        logAct('assignment_updated', 'assignments', initial.id, { title: meta.title })
      } else {
        const [a] = await run(supabase.from('assignments').insert({ ...meta, questions }).select('id'))
        await run(supabase.from('assignment_keys').insert({ assignment_id: a.id, answers: keys }))
        logAct('assignment_created', 'assignments', a.id, { title: meta.title, questions: questions.length })
      }
      onSaved()
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  const previewData = { id: 'preview', title: f.title || 'معاينة', ...toDB(qs), time_limit_min: f.time_limit_min === '' ? null : Number(f.time_limit_min), shuffle_questions: f.shuffle_questions, shuffle_options: f.shuffle_options }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>{edit ? `تعديل: ${initial.title}` : 'واجب أو كويز جديد'}</h2>
          <button className="btn-link" onClick={onCancel}>→ رجوع للقايمة</button>
        </div>
        <div className="form">
          <label>المجموعة<select className="fld" value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}><option value="">اختار...</option>{groups.map((g) => <option key={g.id} value={g.id}>{gname(g.id)}</option>)}</select></label>
          <label style={{ flex: 1, minWidth: 220 }}>العنوان<input className="fld" placeholder="مثال: واجب الحصة الخامسة • الأرقام" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label>النوع
            <div className="seg">
              <button type="button" className={f.kind === 'homework' ? 'on yes' : ''} onClick={() => setF({ ...f, kind: 'homework' })}>واجب</button>
              <button type="button" className={f.kind === 'quiz' ? 'on yes' : ''} onClick={() => setF({ ...f, kind: 'quiz' })}>كويز</button>
            </div>
          </label>
          <label>آخر ميعاد للتسليم<input className="fld" type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></label>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>الأسئلة <span className="muted small">({num(qs.length)} سؤال، {num(total)} درجة)</span></h2>
          {!locked && (
            <div className="inline">
              <button className="btn-outline" onClick={() => fileRef.current?.click()}>رفع ملف Excel</button>
              <button className="btn-link" onClick={() => setPaste('')}>لصق من Excel</button>
              <button className="btn-link" onClick={() => downloadTemplate().catch((e) => setMsg(e.message))}>تحميل النموذج</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
            </div>
          )}
        </div>
        {locked && <p className="msg">فيه طلبة سلّموا الواجب ده، فالأسئلة مقفولة عشان درجاتهم ما تتلخبطش. تقدر تغيّر البيانات والإعدادات بس.</p>}

        <AnimatePresence initial={false}>
          {qs.map((x, i) => (
            <motion.div layout key={x.id} className="qcard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.4, ease: EASE }}>
              <div className="qhead">
                <span className="qnum">{num(i + 1)}</span>
                <select className="fld" value={x.type} disabled={locked} onChange={(e) => changeType(i, e.target.value)} aria-label="نوع السؤال">
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="pts">درجة<input className="fld" type="number" min="0.5" step="0.5" disabled={locked} value={x.points} onChange={(e) => upd(i, { points: e.target.value })} /></label>
                <span className="muted small grow">{TYPE_HINT[x.type]}</span>
                {!locked && (
                  <div className="qtools">
                    <button type="button" className="icon-btn" aria-label="لفوق" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="icon-btn" aria-label="لتحت" disabled={i === qs.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="icon-btn" aria-label="نسخ السؤال" onClick={() => setQs([...qs.slice(0, i + 1), { ...x, id: nid(), options: [...x.options], key: Array.isArray(x.key) ? [...x.key] : x.key }, ...qs.slice(i + 1)])}>⧉</button>
                    <button type="button" className="icon-btn danger" aria-label="حذف السؤال" disabled={qs.length === 1} onClick={() => setQs(qs.filter((_, j) => j !== i))}>×</button>
                  </div>
                )}
              </div>
              <textarea className="fld qtext" rows={2} disabled={locked} placeholder="اكتب السؤال هنا" value={x.q} onChange={(e) => upd(i, { q: e.target.value })} />

              {(x.type === 'mcq' || x.type === 'multi') && (
                <div className="optlist">
                  {x.options.map((o, k) => {
                    const on = x.type === 'mcq' ? x.key === k : x.key?.includes(k)
                    return (
                      <div className={`optrow${on ? ' on' : ''}`} key={k}>
                        <button type="button" disabled={locked} className={`mark ${x.type === 'multi' ? 'sq' : ''}`} aria-pressed={on} aria-label={`الاختيار ${k + 1} صح`}
                          onClick={() => upd(i, { key: x.type === 'mcq' ? k : on ? x.key.filter((y) => y !== k) : [...x.key, k] })}>{on ? '✓' : ''}</button>
                        <input className="fld" disabled={locked} placeholder={`الاختيار ${num(k + 1)}`} value={o} onChange={(e) => upd(i, { options: x.options.map((y, m) => (m === k ? e.target.value : y)) })} />
                        {!locked && x.options.length > 2 && (
                          <button type="button" className="icon-btn" aria-label="امسح الاختيار" onClick={() => {
                            const options = x.options.filter((_, m) => m !== k)
                            const fix = (v) => (v === k ? null : v > k ? v - 1 : v)
                            upd(i, { options, key: x.type === 'mcq' ? fix(x.key) : x.key.filter((y) => y !== k).map(fix) })
                          }}>×</button>
                        )}
                      </div>
                    )
                  })}
                  <div className="inline">
                    {!locked && x.options.length < 6 && <button type="button" className="btn-link" onClick={() => upd(i, { options: [...x.options, ''] })}>+ اختيار</button>}
                    <span className="muted small">{x.type === 'mcq' ? 'اضغط على الدايرة جنب الإجابة الصح.' : 'علّم كل الإجابات الصح.'}</span>
                  </div>
                </div>
              )}
              {x.type === 'tf' && (
                <div className="inline">
                  <span className="muted small">الإجابة الصحيحة:</span>
                  <div className="seg">
                    <button type="button" disabled={locked} className={x.key === true ? 'on yes' : ''} onClick={() => upd(i, { key: true })}>صح</button>
                    <button type="button" disabled={locked} className={x.key === false ? 'on no' : ''} onClick={() => upd(i, { key: false })}>خطأ</button>
                  </div>
                </div>
              )}
              {x.type === 'short' && (
                <label className="form-one">الإجابات المقبولة (افصل بينهم بـ |)
                  <input className="fld" disabled={locked} placeholder="مثال: برلين | Berlin" value={x.key ?? ''} onChange={(e) => upd(i, { key: e.target.value })} />
                  <span className="muted small">التصحيح بيتجاهل التشكيل والهمزات والمسافات الزيادة وعلامات الترقيم.</span>
                </label>
              )}
              {x.type === 'essay' && <p className="muted small">الطالب بيكتب إجابته، وإنت بتصححها من تبويب "التصحيح".</p>}
            </motion.div>
          ))}
        </AnimatePresence>

        {!locked && (
          <div className="addbar">
            <span className="muted small">ضيف سؤال:</span>
            {Object.entries(TYPES).map(([k, v]) => <button key={k} type="button" className="chip-btn" onClick={() => setQs([...qs, blank(k)])}>+ {v}</button>)}
          </div>
        )}
        {tried && !locked && issues.length > 0 && <ul className="issues">{issues.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      </section>

      <section className="card">
        <h2>الإعدادات</h2>
        <div className="form">
          <label>يظهر للطلبة من (اختياري)<input className="fld" type="datetime-local" value={f.available_from} onChange={(e) => setF({ ...f, available_from: e.target.value })} /></label>
          <label>الوقت بالدقايق (اختياري)<input className="fld narrow" type="number" min="1" max="300" placeholder="من غير" value={f.time_limit_min} onChange={(e) => setF({ ...f, time_limit_min: e.target.value })} /></label>
          <label>الإجابات الصح تظهر للطالب
            <select className="fld" value={f.show_answers} onChange={(e) => setF({ ...f, show_answers: e.target.value })}>
              <option value="after_due">بعد آخر ميعاد</option>
              <option value="after_submit">بعد ما يسلّم على طول</option>
              <option value="never">ماتظهرش (الدرجة بس)</option>
            </select>
          </label>
        </div>
        <div className="toggles">
          <label className="check"><input type="checkbox" checked={f.shuffle_questions} onChange={(e) => setF({ ...f, shuffle_questions: e.target.checked })} /> ترتيب الأسئلة عشوائي لكل طالب</label>
          <label className="check"><input type="checkbox" checked={f.shuffle_options} onChange={(e) => setF({ ...f, shuffle_options: e.target.checked })} /> ترتيب الاختيارات عشوائي</label>
          <label className="check"><input type="checkbox" checked={f.allow_late} onChange={(e) => setF({ ...f, allow_late: e.target.checked })} /> مسموح التسليم بعد آخر ميعاد</label>
        </div>
      </section>

      <div className="savebar">
        <Notice err={msg} />
        <div className="inline">
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'لحظة...' : edit ? 'حفظ التعديلات' : f.available_from ? 'جدولة الواجب' : 'نشر للطلبة'}</button>
          <button className="btn-outline" onClick={() => setPreview(true)}>معاينة زي الطالب</button>
          <span className="muted small">{num(qs.length)} سؤال، {num(total)} درجة{f.time_limit_min ? `، ${num(f.time_limit_min)} دقيقة` : ''}</span>
        </div>
      </div>

      <AnimatePresence>
        {imp && (
          <Modal key="imp" title={`استيراد من ${imp.name}`} onClose={() => setImp(null)}>
            <p className="strong">لقينا {num(imp.questions.length)} سؤال.</p>
            <div className="chips">{Object.keys(TYPES).map((t) => { const n = imp.questions.filter((x) => x.type === t).length; return n ? <span className="pill" key={t}>{TYPES[t]}: {num(n)}</span> : null })}</div>
            {imp.errors.length > 0 && <ul className="issues">{imp.errors.slice(0, 12).map((t, i) => <li key={i}>{t}</li>)}{imp.errors.length > 12 && <li>و{num(imp.errors.length - 12)} ملاحظة تانية.</li>}</ul>}
            {imp.questions.length > 0 ? (
              <div className="inline">
                <button className="btn-primary" onClick={() => applyImport('add')}>ضيفهم للأسئلة</button>
                <button className="btn-outline" onClick={() => applyImport('replace')}>استبدل الأسئلة الحالية</button>
              </div>
            ) : <p className="muted">مفيش أسئلة اتقرت. نزّل النموذج واتبع طريقته.</p>}
            <p className="muted small">بعد الإضافة تقدر تراجع وتعدّل أي سؤال قبل النشر.</p>
          </Modal>
        )}
        {paste !== null && (
          <Modal key="paste" title="لصق من Excel" onClose={() => setPaste(null)}>
            <p className="muted small">حدد الصفوف في Excel (بنفس ترتيب أعمدة النموذج) واعمل نسخ، وبعدين الصق هنا.</p>
            <textarea className="fld area" rows={8} dir="auto" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'اختيار من متعدد\tما معنى Hallo؟\tمرحبًا\tشكرًا\t\t\t\t\t1\t1'} />
            <button className="btn-primary" disabled={!paste.trim()} onClick={onPaste}>اقرا الأسئلة</button>
          </Modal>
        )}
        {preview && (
          <Modal key="pv" title="معاينة زي ما الطالب هيشوفها" onClose={() => setPreview(false)}>
            <div className="modal-wide"><Solve preview={previewData} assignment={{ id: 'preview', title: previewData.title }} onBack={() => setPreview(false)} /></div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}
