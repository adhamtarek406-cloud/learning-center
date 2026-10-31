import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { container, item } from './ui.jsx'
import { fmtDT, num, q, useLoad, Notice, Modal, logAct } from './adminkit.jsx'
import { H5P_CDN, readH5P, uploadH5P, removeFiles, baseUrl, kindName } from './h5p.js'

/* ================= المشغّل ================= */
export function H5PPlayer({ activity, onResult }) {
  const ref = useRef(null)
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)
  const last = useRef({ key: '', at: 0 })
  useEffect(() => {
    let off = null
    let alive = true
    const el = ref.current
    ;(async () => {
      try {
        const mod = await import('h5p-standalone')
        const H5P = mod.H5P ?? mod.default?.H5P
        el.innerHTML = ''
        const base = baseUrl(activity.folder)
        await new H5P(el, { id: activity.id, h5pJsonPath: base, frameJs: `${H5P_CDN}/frame.bundle.js`, frameCss: `${H5P_CDN}/styles/h5p.css`, xAPIObjectIRI: base, fullScreen: true })
        if (!alive) return
        setReady(true)
        const handler = (event) => {
          const st = event?.data?.statement
          const verb = st?.verb?.id ?? ''
          const score = st?.result?.score
          if (!/(completed|answered)$/.test(verb) || !score || !(score.max > 0)) return
          if (st?.context?.contextActivities?.parent?.length) return // سؤال جوه نشاط أكبر
          const key = `${score.raw}/${score.max}`
          if (last.current.key === key && Date.now() - last.current.at < 3000) return
          last.current = { key, at: Date.now() }
          onResult?.(Number(score.raw ?? 0), Number(score.max))
        }
        window.H5P?.externalDispatcher?.on('xAPI', handler)
        off = () => window.H5P?.externalDispatcher?.off('xAPI', handler)
      } catch (e) { if (alive) setErr(e.message ?? 'حصلت مشكلة في تشغيل النشاط') }
    })()
    return () => { alive = false; off?.() }
  }, [activity.id]) // eslint-disable-line
  return (
    <div className="h5p-wrap">
      {!ready && !err && <p className="muted">جاري تحميل النشاط...</p>}
      {err && <p className="msg" role="alert">{err}</p>}
      <div ref={ref} />
    </div>
  )
}

/* ================= الطالب ================= */
export function StudentActivities({ onOpen }) {
  const [d, , err] = useLoad(async () => {
    const [acts, res] = await Promise.all([
      q(supabase.from('activities').select('id, title, description, main_library, folder, due_at, group_id, created_at, groups(name, levels(name, subjects(name)))').order('created_at', { ascending: false })),
      q(supabase.from('activity_results').select('activity_id, best_percent, attempts')),
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
            <span className="pill">{kindName(a.main_library)}</span>
            <div className="strong t-name">{a.title}</div>
            <div className="muted small">{a.groups?.levels?.subjects?.name} • {a.groups?.levels?.name}</div>
            {a.description && <div className="muted small clamp2">{a.description}</div>}
            {a.due_at && <div className="muted small">لحد {fmtDT(a.due_at)}</div>}
            {r ? <span className={`pill ${r.best_percent >= 50 ? 'green' : 'gold'}`}>أحسن نتيجة {num(r.best_percent)}٪ • {num(r.attempts)} محاولة</span> : <span className="pill gold">جديد</span>}
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
  async function onResult(raw, max) {
    const { data, error } = await supabase.rpc('record_activity_result', { p_activity: activity.id, p_score: raw, p_max: max })
    setMsg(error ? `مقدرناش نسجّل النتيجة: ${error.message}` : data != null ? `اتسجلت نتيجتك: ${num(data)}٪` : '')
  }
  return (
    <div className="solve wide">
      <button className="btn-link" onClick={onBack}>→ رجوع للأنشطة</button>
      <h1>{activity.title}</h1>
      {msg && <p className="msg ok" role="status">{msg}</p>}
      <section className="card"><H5PPlayer activity={activity} onResult={onResult} /></section>
    </div>
  )
}

/* ================= المدرس والإدارة ================= */
export default function ActivitiesAdmin({ uid, role }) {
  const [d, load, err] = useLoad(async () => {
    const gq = supabase.from('groups').select('id, name, teacher_id, levels(name, subjects(name))')
    const [groups, acts, res] = await Promise.all([
      q((role === 'teacher' ? gq.eq('teacher_id', uid) : gq).order('name')),
      q(supabase.from('activities').select('*').order('created_at', { ascending: false })),
      q(supabase.from('activity_results').select('activity_id, best_percent')),
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
  const stats = (id) => { const r = d.res.filter((x) => x.activity_id === id); return { n: r.length, avg: r.length ? Math.round(r.reduce((a, b) => a + Number(b.best_percent), 0) / r.length) : null } }

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(''); setOk(''); setPkg(null)
    try {
      const p = await readH5P(file)
      setPkg({ ...p, name: file.name })
      setF((x) => ({ ...x, title: x.title || p.info.title || file.name.replace(/\.h5p$/i, '') }))
    } catch (e2) { setMsg(e2.message) }
  }

  async function publish(e) {
    e.preventDefault(); setMsg(''); setOk('')
    if (!pkg) { setMsg('اختار ملف .h5p الأول'); return }
    setProg(0)
    let up = null
    try {
      up = await uploadH5P(pkg, uid, setProg)
      const [a] = await q(supabase.from('activities').insert({
        group_id: f.group_id, title: f.title.trim(), description: f.description.trim() || null,
        main_library: pkg.info.mainLibrary ?? null, folder: up.folder, files: up.files,
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
      q(supabase.from('activity_results').select('student_id, best_percent, last_percent, attempts, last_at, profiles:student_id(full_name)').eq('activity_id', a.id)),
      q(supabase.from('enrollments').select('student_id, profiles(full_name)').eq('group_id', a.group_id)),
    ])
    const done = new Set(rows.map((r) => r.student_id))
    setRs({ a, rows: rows.sort((x, y) => y.best_percent - x.best_percent), missing: enr.filter((e) => !done.has(e.student_id)) })
  }

  return (
    <>
      <section className="card">
        <h2>نشاط تفاعلي جديد (H5P)</h2>
        <details className="howto">
          <summary>إزاي أعمل نشاط؟</summary>
          <ol>
            <li>نزّل برنامج <a href="https://lumi.education/en/lumi-h5p-offline-desktop-editor/" target="_blank" rel="noreferrer">Lumi</a> المجاني على الكمبيوتر.</li>
            <li>اعمل نشاط جديد واختار نوعه: فيديو تفاعلي، بطاقات، املا الفراغات، سحب الكلمات، لعبة الذاكرة، كلمات متقاطعة...</li>
            <li>للفيديو: حط رابط يوتيوب بدل ما ترفع الفيديو نفسه، عشان الملف يفضل صغير.</li>
            <li>صدّر النشاط كملف <b>.h5p</b> (اختار التصدير الكامل مع المكتبات)، وارفعه هنا.</li>
          </ol>
        </details>
        <form className="form" onSubmit={publish}>
          <label>المجموعة<select className="fld" required value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}><option value="">اختار...</option>{d.groups.map((g) => <option key={g.id} value={g.id}>{gname(g.id)}</option>)}</select></label>
          <label>ملف النشاط
            <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>{pkg ? `✓ ${pkg.name}` : 'اختار ملف .h5p'}</button>
            <input ref={fileRef} type="file" accept=".h5p" hidden onChange={pick} />
          </label>
          <label style={{ flex: 1, minWidth: 220 }}>العنوان<input className="fld" required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label>آخر ميعاد (اختياري)<input className="fld" type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></label>
          <label style={{ flexBasis: '100%' }}>وصف قصير (اختياري)<input className="fld" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          {pkg && <p className="muted small" style={{ flexBasis: '100%' }}>النوع: <b>{kindName(pkg.info.mainLibrary)}</b> • {num(pkg.entries.length)} ملف • {num(Math.round(pkg.total / 1024 / 1024 * 10) / 10)} ميجا{pkg.skipped.length ? ` • اتجاهل ${num(pkg.skipped.length)} ملف مش مدعوم` : ''}</p>}
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
            <thead><tr><th>النشاط</th><th>المجموعة</th><th>حلّوه</th><th>المتوسط</th><th>إجراءات</th></tr></thead>
            <tbody>
              {d.acts.map((a) => {
                const s = stats(a.id)
                return (
                  <tr key={a.id} className={a.active ? '' : 'off'}>
                    <td><div className="strong">{a.title}</div><div className="chips" style={{ marginTop: 4 }}><span className="pill">{kindName(a.main_library)}</span>{a.due_at && <span className="muted small">لحد {fmtDT(a.due_at)}</span>}</div></td>
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
              {d.acts.length === 0 && <tr><td colSpan="5" className="muted">لسه مفيش أنشطة. ارفع أول ملف .h5p من فوق.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small">النتيجة بتتسجل من النشاط نفسه لما الطالب يخلّصه، وبيتحفظ أحسن نتيجة وعدد المحاولات. بعض الأنواع (زي البطاقات والشرح المطوي) مالهاش درجة.</p>
      </section>

      <AnimatePresence>
        {pv && (
          <Modal key="pv" title={`معاينة: ${pv.title}`} onClose={() => setPv(null)}>
            <div className="modal-wide"><H5PPlayer activity={pv} /></div>
          </Modal>
        )}
        {rs && (
          <Modal key="rs" title={`نتايج: ${rs.a.title}`} onClose={() => setRs(null)}>
            <div className="modal-wide stack">
              {rs.rows.map((r) => (
                <div className="row" key={r.student_id}>
                  <div className="grow"><div className="strong">{r.profiles?.full_name ?? 'طالب'}</div><div className="muted small">{num(r.attempts)} محاولة • آخر مرة {fmtDT(r.last_at)} • آخر نتيجة {num(r.last_percent)}٪</div></div>
                  <span className={`pill ${r.best_percent >= 50 ? 'green' : 'red'}`}>{num(r.best_percent)}٪</span>
                </div>
              ))}
              {rs.missing.length > 0 && <p className="muted small">لسه ماحلّوش: {rs.missing.map((m) => m.profiles?.full_name).filter(Boolean).join('، ')}</p>}
              {rs.rows.length === 0 && <p className="muted">لسه محدش حلّه.</p>}
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}
