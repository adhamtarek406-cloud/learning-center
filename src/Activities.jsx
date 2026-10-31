import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { container, item } from './ui.jsx'
import { fmtDT, num, q, useLoad, Notice, Modal, logAct } from './adminkit.jsx'
import { readActivity, uploadActivity, removeFiles, buildSrcdoc, AI_PROMPT } from './htmlact.js'

/* ================= المشغّل ================= */
export function ActivityPlayer({ activity, onScore }) {
  const frame = useRef(null)
  const [doc, setDoc] = useState(null)
  const [err, setErr] = useState('')
  const last = useRef({ key: '', at: 0 })
  const cb = useRef(onScore)
  cb.current = onScore

  useEffect(() => {
    let alive = true
    setDoc(null); setErr('')
    buildSrcdoc(activity).then((h) => alive && setDoc(h)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [activity.id]) // eslint-disable-line

  useEffect(() => {
    function onMsg(e) {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data
      if (!m || m.type !== 'center-activity') return
      let s = null, mx = null
      if (m.action === 'score') {
        s = Number(m.score); mx = Number(m.max)
        if (!Number.isFinite(s) || !Number.isFinite(mx) || mx <= 0) return
      } else if (m.action !== 'complete') return
      const key = `${m.action}:${s}/${mx}`
      if (last.current.key === key && Date.now() - last.current.at < 3000) return
      last.current = { key, at: Date.now() }
      cb.current?.(s, mx)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <div className="act-wrap">
      {!doc && !err && <p className="muted">جاري تحميل النشاط...</p>}
      {err && <p className="msg" role="alert">{err}</p>}
      {doc && (
        <>
          <iframe
            ref={frame}
            title={activity.title}
            className="act-frame"
            srcDoc={doc}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            allow="fullscreen; autoplay"
            allowFullScreen
          />
          <button type="button" className="btn-link small" onClick={() => frame.current?.requestFullscreen?.()}>⛶ ملء الشاشة</button>
        </>
      )}
    </div>
  )
}

const resultLabel = (r) => (r.scored ? `${num(r.best_percent)}٪` : 'خلّصه ✓')

/* ================= الطالب ================= */
export function StudentActivities({ onOpen }) {
  const [d, , err] = useLoad(async () => {
    const [acts, res] = await Promise.all([
      q(supabase.from('activities').select('id, title, description, folder, entry, due_at, group_id, created_at, groups(name, levels(name, subjects(name)))').eq('active', true).order('created_at', { ascending: false })),
      q(supabase.from('activity_results').select('activity_id, best_percent, attempts, scored, completed')),
    ])
    return { acts, res: Object.fromEntries(res.map((r) => [r.activity_id, r])) }
  })
  if (!d) return <Notice err={err} />
  return (
    <motion.div className="t-grid" variants={container} initial="hidden" animate="visible">
      {d.acts.map((a) => {
        const r = d.res[a.id]
        return (
          <motion.button variants={item} key={a.id} className="t-card act-card" onClick={() => onOpen(a)}>
            <span className="pill">نشاط تفاعلي</span>
            <div className="strong t-name">{a.title}</div>
            <div className="muted small">{a.groups?.levels?.subjects?.name} • {a.groups?.levels?.name}</div>
            {a.description && <div className="muted small clamp2">{a.description}</div>}
            {a.due_at && <div className="muted small">لحد {fmtDT(a.due_at)}</div>}
            {r ? <span className={`pill ${!r.scored || r.best_percent >= 50 ? 'green' : 'gold'}`}>{r.scored ? `أحسن نتيجة ${num(r.best_percent)}٪` : 'خلّصته ✓'} • {num(r.attempts)} مرة</span> : <span className="pill gold">جديد</span>}
            <span className="btn-outline t-cta">{r ? 'العب تاني' : 'ابدأ'}</span>
          </motion.button>
        )
      })}
      {d.acts.length === 0 && <section className="card"><p className="muted">لسه مفيش أنشطة تفاعلية لمجموعاتك.</p></section>}
    </motion.div>
  )
}

export function ActivityView({ activity, onBack }) {
  const [msg, setMsg] = useState('')
  const [scored, setScored] = useState(false)
  const [busy, setBusy] = useState(false)
  async function record(score, max) {
    const { data, error } = await supabase.rpc('record_activity_result', { p_activity: activity.id, p_score: score ?? 0, p_max: max })
    if (error) { setMsg(`مقدرناش نسجّل: ${error.message}`); return false }
    if (data != null) { setScored(true); setMsg(`اتسجلت نتيجتك: ${num(data)}٪ 🎉`) } else setMsg('اتسجّل إنك خلّصت النشاط ✓')
    return true
  }
  async function finish() {
    if (scored) { onBack(); return }
    setBusy(true)
    if (await record(null, null)) setTimeout(onBack, 900)
    setBusy(false)
  }
  return (
    <div className="solve wide">
      <button className="btn-link" onClick={onBack}>→ رجوع للأنشطة</button>
      <h1>{activity.title}</h1>
      {activity.description && <p className="muted">{activity.description}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}
      <section className="card"><ActivityPlayer activity={activity} onScore={record} /></section>
      <div className="inline" style={{ justifyContent: 'center' }}>
        <button className="btn-primary" disabled={busy} onClick={finish}>{scored ? 'تمام، رجوع للأنشطة' : busy ? 'بيتسجّل...' : 'خلصت ✓'}</button>
      </div>
    </div>
  )
}

/* ================= المدرس والإدارة ================= */
function PromptBox() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(AI_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* المتصفح منع النسخ */ }
  }
  return (
    <div className="prompt-box">
      <div className="row"><b className="grow">الجزء ده حطه في آخر طلبك للذكاء الاصطناعي</b><button type="button" className="btn-outline" onClick={copy}>{copied ? '✓ اتنسخ' : 'انسخ'}</button></div>
      <pre dir="rtl">{AI_PROMPT}</pre>
    </div>
  )
}

export default function ActivitiesAdmin({ uid, role }) {
  const [d, load, err] = useLoad(async () => {
    const gq = supabase.from('groups').select('id, name, teacher_id, levels(name, subjects(name))')
    const [groups, acts, res] = await Promise.all([
      q((role === 'teacher' ? gq.eq('teacher_id', uid) : gq).order('name')),
      q(supabase.from('activities').select('*').order('created_at', { ascending: false })),
      q(supabase.from('activity_results').select('activity_id, best_percent, scored')),
    ])
    return { groups, acts, res }
  })
  const [f, setF] = useState({ group_id: '', title: '', description: '', due_at: '' })
  const [pkg, setPkg] = useState(null)
  const [prog, setProg] = useState(null)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const [pv, setPv] = useState(null)
  const [rs, setRs] = useState(null)
  const fileRef = useRef(null)
  if (!d) return <Notice err={err} />
  const gname = (id) => { const g = d.groups.find((x) => x.id === id); return g ? `${g.levels?.subjects?.name ?? ''} ${g.levels?.name ?? ''} • ${g.name}` : '—' }
  const stats = (id) => {
    const r = d.res.filter((x) => x.activity_id === id)
    const sc = r.filter((x) => x.scored)
    return { n: r.length, avg: sc.length ? Math.round(sc.reduce((a, b) => a + Number(b.best_percent), 0) / sc.length) : null }
  }

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(''); setOk(''); setPkg(null)
    try {
      const p = await readActivity(file)
      setPkg({ ...p, name: file.name })
      setF((x) => ({ ...x, title: x.title || p.title || file.name.replace(/\.(zip|html?)$/i, '') }))
    } catch (e2) { setMsg(e2.message) }
  }

  async function publish(e) {
    e.preventDefault(); setMsg(''); setOk('')
    if (!pkg) { setMsg('اختار ملف النشاط الأول (.zip أو .html)'); return }
    setProg(0)
    let up = null
    try {
      up = await uploadActivity(pkg, uid, setProg)
      const [a] = await q(supabase.from('activities').insert({
        group_id: f.group_id, title: f.title.trim(), description: f.description.trim() || null,
        main_library: 'html', folder: up.folder, files: up.files, entry: pkg.entry,
        due_at: f.due_at ? new Date(f.due_at).toISOString() : null, created_by: uid,
      }).select('id'))
      logAct('activity_created', 'activities', a.id, { title: f.title.trim() })
      setOk(`اتنشر "${f.title.trim()}" لطلبة المجموعة.`)
      setPkg(null); setF({ group_id: f.group_id, title: '', description: '', due_at: '' })
      await load()
    } catch (e2) {
      if (up) await removeFiles(up.files)
      setMsg(e2.message)
    }
    setProg(null)
  }

  async function remove(a) {
    if (!window.confirm(`حذف "${a.title}" ونتايج الطلبة فيه؟`)) return
    setMsg('')
    try {
      await q(supabase.from('activities').delete().eq('id', a.id))
      await removeFiles(a.files ?? [])
      logAct('activity_deleted', 'activities', a.id, { title: a.title })
      await load()
    } catch (e) { setMsg(e.message) }
  }

  async function results(a) {
    const [rows, enr] = await Promise.all([
      q(supabase.from('activity_results').select('student_id, best_percent, last_percent, attempts, scored, last_at, profiles:student_id(full_name)').eq('activity_id', a.id)),
      q(supabase.from('enrollments').select('student_id, profiles(full_name)').eq('group_id', a.group_id)),
    ])
    const done = new Set(rows.map((r) => r.student_id))
    setRs({ a, rows: rows.sort((x, y) => y.best_percent - x.best_percent), missing: enr.filter((e) => !done.has(e.student_id)) })
  }

  return (
    <>
      <section className="card">
        <h2>نشاط تفاعلي جديد</h2>
        <details className="howto">
          <summary>إزاي أعمل نشاط بالذكاء الاصطناعي؟</summary>
          <ol>
            <li>اطلب من Claude أو ChatGPT نشاط تفاعلي (لعبة توصيل، اختيار من متعدد، سحب وإفلات، بطاقات...) واوصفله الدرس والصف.</li>
            <li>انسخ الجزء اللي تحت وحطه في آخر طلبك، عشان النشاط يبعت درجة الطالب للمنصة.</li>
            <li>نزّل الملف <b>index.html</b>، ولو فيه صور حطهم مع الملف في فولدر واعمله ZIP.</li>
            <li>ارفع الـ ZIP أو ملف الـ HTML هنا، واعمل معاينة قبل ما الطلبة يشوفوه.</li>
          </ol>
          <PromptBox />
          <p className="muted small">لو النشاط مابعتش درجة، الطالب بيدوس "خلصت" وبيتسجل إنه خلّصه. الفيديوهات الكبيرة حطها على يوتيوب بدل ما ترفعها.</p>
        </details>
        <form className="form" onSubmit={publish}>
          <label>المجموعة<select className="fld" required value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}><option value="">اختار...</option>{d.groups.map((g) => <option key={g.id} value={g.id}>{gname(g.id)}</option>)}</select></label>
          <label>ملف النشاط
            <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>{pkg ? `✓ ${pkg.name}` : 'اختار ZIP أو HTML'}</button>
            <input ref={fileRef} type="file" accept=".zip,.html,.htm" hidden onChange={pick} />
          </label>
          <label style={{ flex: 1, minWidth: 220 }}>العنوان<input className="fld" required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label>آخر ميعاد (اختياري)<input className="fld" type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></label>
          <label style={{ flexBasis: '100%' }}>وصف قصير (اختياري)<input className="fld" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          {pkg && <p className="muted small" style={{ flexBasis: '100%' }}>الصفحة الرئيسية: <b dir="ltr">{pkg.entry}</b> • {num(pkg.files.length)} ملف • {num(Math.round(pkg.total / 1024 / 1024 * 10) / 10)} ميجا{pkg.skipped.length ? ` • اتجاهل ${num(pkg.skipped.length)} ملف مش مدعوم` : ''}</p>}
          {prog != null && <div className="upbar" style={{ flexBasis: '100%' }}><div style={{ transform: `scaleX(${prog})` }} /><span>{num(Math.round(prog * 100))}٪</span></div>}
          <Notice err={msg} />
          {ok && <p className="msg ok" role="status" style={{ flexBasis: '100%' }}>{ok}</p>}
          <button className="btn-primary" disabled={prog != null}>{prog != null ? 'بيترفع...' : 'رفع ونشر'}</button>
        </form>
      </section>

      <section className="card">
        <h2>الأنشطة التفاعلية</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>النشاط</th><th>المجموعة</th><th>خلّصوه</th><th>متوسط الدرجة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {d.acts.map((a) => {
                const s = stats(a.id)
                return (
                  <tr key={a.id} className={a.active ? '' : 'off'}>
                    <td><div className="strong">{a.title}</div>{a.due_at && <div className="muted small">لحد {fmtDT(a.due_at)}</div>}</td>
                    <td>{gname(a.group_id)}</td>
                    <td>{num(s.n)}</td>
                    <td>{s.avg == null ? '—' : `${num(s.avg)}٪`}</td>
                    <td>
                      <div className="inline">
                        <button className="btn-outline" onClick={() => results(a)}>النتايج</button>
                        <button className="btn-link" onClick={() => setPv(a)}>معاينة</button>
                        <button className="btn-link" onClick={async () => { await supabase.from('activities').update({ active: !a.active }).eq('id', a.id); load() }}>{a.active ? 'إخفاء' : 'إظهار'}</button>
                        <button className="btn-danger" onClick={() => remove(a)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {d.acts.length === 0 && <tr><td colSpan="5" className="muted">لسه مفيش أنشطة. ارفع أول نشاط من فوق.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AnimatePresence>
        {pv && (
          <Modal key="pv" title={`معاينة: ${pv.title}`} onClose={() => setPv(null)}>
            <div className="modal-wide"><ActivityPlayer activity={pv} /><p className="muted small">في المعاينة الدرجة مابتتسجلش.</p></div>
          </Modal>
        )}
        {rs && (
          <Modal key="rs" title={`نتايج: ${rs.a.title}`} onClose={() => setRs(null)}>
            <div className="modal-wide stack">
              {rs.rows.map((r) => (
                <div className="row" key={r.student_id}>
                  <div className="grow"><div className="strong">{r.profiles?.full_name ?? 'طالب'}</div><div className="muted small">{num(r.attempts)} مرة • آخر مرة {fmtDT(r.last_at)}{r.scored ? ` • آخر درجة ${num(r.last_percent)}٪` : ''}</div></div>
                  <span className={`pill ${!r.scored || r.best_percent >= 50 ? 'green' : 'red'}`}>{resultLabel(r)}</span>
                </div>
              ))}
              {rs.missing.length > 0 && <p className="muted small">لسه ماخلّصوش: {rs.missing.map((m) => m.profiles?.full_name).filter(Boolean).join('، ')}</p>}
              {rs.rows.length === 0 && <p className="muted">لسه محدش خلّصه.</p>}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}
