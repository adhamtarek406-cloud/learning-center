import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { Tabs, container, item } from './ui.jsx'
import { fmtDT, fmtD, num, q, useLoad, Notice, Modal, logAct } from './adminkit.jsx'
import { TYPES, typeOf, pointsOf, isCorrect, answerText, keyText } from './questions.js'

const gLabel = (g) => (g ? `${g.levels?.subjects?.name ?? ''} ${g.levels?.name ?? ''} · ${g.name}` : '—')
const GSEL = 'id, name, schedule, teacher_id, active, levels(name, subjects(name))'

export function waLink(phone, text) {
  let n = (phone ?? '').replace(/\D/g, '')
  if (n.startsWith('00')) n = n.slice(2)
  else if (n.startsWith('0')) n = '20' + n.slice(1)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

/* ================= مجموعاتي وطلابي ================= */
export function MyGroups({ uid, role }) {
  const [d, , err] = useLoad(async () => {
    let gq = supabase.from('groups').select(GSEL).order('name')
    if (role === 'teacher') gq = gq.eq('teacher_id', uid)
    const [groups, enr, next] = await Promise.all([
      q(gq),
      q(supabase.from('enrollments').select('group_id, student_id, profiles(full_name, phone, active)')),
      q(supabase.from('sessions').select('group_id, starts_at, topic').gte('starts_at', new Date().toISOString()).order('starts_at').limit(200)),
    ])
    return { groups, enr, next }
  })
  const [s, setS] = useState('')
  const [open, setOpen] = useState(null)
  if (!d) return <Notice err={err} />
  const term = s.trim().toLowerCase()

  return (
    <>
      <div className="card-head">
        <p className="muted">{role === 'teacher' ? 'المجموعات اللي بتدرّسها وطلابها.' : 'كل المجموعات.'} اضغط على اسم أي طالب تفتح ملفه.</p>
        <input className="fld" style={{ maxWidth: 280 }} placeholder="بحث عن طالب" value={s} onChange={(e) => setS(e.target.value)} />
      </div>
      <motion.div className="grid" variants={container} initial="hidden" animate="visible">
        {d.groups.map((g) => {
          const studs = d.enr.filter((e) => e.group_id === g.id && (!term || (e.profiles?.full_name ?? '').toLowerCase().includes(term)))
          const nx = d.next.find((x) => x.group_id === g.id)
          return (
            <motion.section variants={item} className="card" key={g.id}>
              <div className="card-head">
                <h2>{g.name}</h2>
                <span className={`pill ${g.active ? 'green' : 'red'}`}>{num(d.enr.filter((e) => e.group_id === g.id).length)} طالب</span>
              </div>
              <div className="muted small">{g.levels?.subjects?.name} · {g.levels?.name}{g.schedule ? ` · ${g.schedule}` : ''}</div>
              <div className="muted small">{nx ? `الحصة الجاية: ${fmtDT(nx.starts_at)}${nx.topic ? ` · ${nx.topic}` : ''}` : 'مفيش حصة قادمة متسجلة'}</div>
              <div className="chips">
                {studs.map((e) => (
                  <button key={e.student_id} className={`chip-btn${e.profiles?.active === false ? ' off' : ''}`} onClick={() => setOpen({ id: e.student_id, name: e.profiles?.full_name, phone: e.profiles?.phone })}>{e.profiles?.full_name}</button>
                ))}
                {studs.length === 0 && <span className="muted small">{term ? 'مفيش نتايج.' : 'مفيش طلبة لسه.'}</span>}
              </div>
            </motion.section>
          )
        })}
      </motion.div>
      {d.groups.length === 0 && <section className="card"><p className="muted">{role === 'teacher' ? 'لسه مفيش مجموعات متسجلة باسمك. الإدارة بتعيّن المدرس لكل مجموعة.' : 'مفيش مجموعات.'}</p></section>}
      <AnimatePresence>{open && <StudentFile key="sf" uid={uid} student={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  )
}

export function StudentFile({ uid, student, onClose }) {
  const [d, load, err] = useLoad(async () => {
    const [att, subs, scores, notes, badges, streak] = await Promise.all([
      q(supabase.from('attendance').select('present, sessions(starts_at, topic)').eq('student_id', student.id)),
      q(supabase.from('submissions').select('auto_score, final_score, submitted_at, feedback, assignments(title, kind)').eq('student_id', student.id).order('submitted_at', { ascending: false })),
      q(supabase.from('game_scores').select('score').eq('student_id', student.id)),
      q(supabase.from('student_notes').select('id, body, author_id, author_name, created_at').eq('student_id', student.id).order('created_at', { ascending: false })),
      q(supabase.from('student_badges').select('awarded_at, badges(name)').eq('student_id', student.id)),
      q(supabase.rpc('streak_of', { p_student: student.id })),
    ])
    return { att, subs, scores, notes, badges, streak }
  }, [student.id])
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('summary')

  async function addNote(e) {
    e.preventDefault(); setMsg('')
    try { await q(supabase.from('student_notes').insert({ student_id: student.id, author_id: uid, body: note.trim() })); setNote(''); await load() } catch (e2) { setMsg(e2.message) }
  }

  let body = <Notice err={err} />
  if (d) {
    const attended = d.att.filter((a) => a.present).length
    const rate = d.att.length ? Math.round((100 * attended) / d.att.length) : null
    const graded = d.subs.map((s) => s.final_score ?? s.auto_score).filter((x) => x != null)
    const avg = graded.length ? Math.round(graded.reduce((a, b) => a + Number(b), 0) / graded.length) : null
    const pts = d.scores.reduce((a, b) => a + b.score, 0)
    const atts = [...d.att].sort((a, b) => (b.sessions?.starts_at ?? '').localeCompare(a.sessions?.starts_at ?? ''))
    body = (
      <div className="stack">
        <div className="stats">
          <div className="stat"><b>{rate == null ? '—' : `${num(rate)}٪`}</b><span>الحضور ({num(attended)}/{num(d.att.length)})</span></div>
          <div className="stat"><b>{avg == null ? '—' : `${num(avg)}٪`}</b><span>متوسط الدرجات</span></div>
          <div className="stat"><b>{num(pts)}</b><span>نقاط الألعاب</span></div>
          <div className="stat"><b>{num(d.streak?.current ?? 0)}</b><span>أيام متتالية (أحسن {num(d.streak?.best ?? 0)})</span></div>
        </div>
        <Tabs flat id="sf-tab" label="ملف الطالب" value={tab} onChange={setTab} items={[['summary', 'ملاحظات'], ['att', 'الحضور'], ['grades', 'الدرجات'], ['badges', 'الشارات']]} />
        {tab === 'summary' && (
          <>
            <form className="form" onSubmit={addNote}>
              <label style={{ flex: 1 }}>ملاحظة جديدة (بتظهر للفريق بس)<textarea className="fld area" rows={3} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <button className="btn-primary">حفظ</button>
            </form>
            <Notice err={msg} />
            {d.notes.map((n) => (
              <div className="row" key={n.id}>
                <div className="grow"><div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div><div className="muted small">{n.author_name ?? '—'} · {fmtDT(n.created_at)}</div></div>
                {n.author_id === uid && <button className="btn-link" onClick={async () => { await supabase.from('student_notes').delete().eq('id', n.id); load() }}>حذف</button>}
              </div>
            ))}
            {d.notes.length === 0 && <p className="muted small">مفيش ملاحظات لسه.</p>}
            {student.phone && <a className="btn-outline" style={{ alignSelf: 'flex-start' }} href={waLink(student.phone, `أهلاً ${student.name}،`)} target="_blank" rel="noreferrer">واتساب للطالب</a>}
          </>
        )}
        {tab === 'att' && (atts.length ? atts.map((a, i) => (
          <div className="row" key={i}><div className="grow">{a.sessions ? fmtDT(a.sessions.starts_at) : '—'}{a.sessions?.topic ? ` · ${a.sessions.topic}` : ''}</div><span className={`pill ${a.present ? 'green' : 'red'}`}>{a.present ? 'حاضر' : 'غايب'}</span></div>
        )) : <p className="muted">لسه مفيش حضور متسجل.</p>)}
        {tab === 'grades' && (d.subs.length ? d.subs.map((s, i) => (
          <div className="row" key={i}>
            <div className="grow"><div className="strong">{s.assignments?.title}</div><div className="muted small">{fmtD(s.submitted_at)}{s.feedback ? ` · ${s.feedback}` : ''}</div></div>
            <span className={`pill ${s.final_score != null ? 'green' : ''}`}>{s.final_score != null ? `${num(s.final_score)}٪` : s.auto_score != null ? `${num(s.auto_score)}٪ مبدئي` : 'محتاج تصحيح'}</span>
          </div>
        )) : <p className="muted">لسه ماسلمش حاجة.</p>)}
        {tab === 'badges' && (d.badges.length ? <div className="chips">{d.badges.map((b, i) => <span className="pill gold" key={i}>{b.badges?.name}</span>)}</div> : <p className="muted">مفيش شارات لسه.</p>)}
      </div>
    )
  }
  return <Modal title={`ملف ${student.name}`} onClose={onClose}><div className="modal-wide">{body}</div></Modal>
}

/* ================= الحضور السريع ================= */
export function QuickAttendance({ uid, role }) {
  const [d, , err] = useLoad(async () => {
    let gq = supabase.from('groups').select(GSEL)
    if (role === 'teacher') gq = gq.eq('teacher_id', uid)
    const [sessions, groups] = await Promise.all([
      q(supabase.from('sessions').select('id, group_id, starts_at, topic').lte('starts_at', new Date(Date.now() + 2 * 86400000).toISOString()).gte('starts_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('starts_at', { ascending: false }).limit(60)),
      q(gq),
    ])
    const mine = new Set(groups.map((g) => g.id))
    return { sessions: sessions.filter((s) => mine.has(s.group_id)), groups }
  })
  const [sid, setSid] = useState('')
  const [rows, setRows] = useState(null)
  const [saved, setSaved] = useState(true)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    if (!d || sid) return
    const now = Date.now()
    const best = [...d.sessions].sort((a, b) => Math.abs(new Date(a.starts_at) - now) - Math.abs(new Date(b.starts_at) - now))[0]
    if (best) pick(best.id)
  }, [d]) // eslint-disable-line

  async function pick(id) {
    setSid(id); setRows(null); setMsg(''); setOk(''); setSaved(true)
    if (!id) return
    try {
      const s = d.sessions.find((x) => x.id === id)
      const [enr, att] = await Promise.all([
        q(supabase.from('enrollments').select('student_id, profiles(full_name)').eq('group_id', s.group_id)),
        q(supabase.from('attendance').select('student_id, present').eq('session_id', id)),
      ])
      const map = new Map(att.map((a) => [a.student_id, a.present]))
      setRows(enr.map((e) => ({ id: e.student_id, name: e.profiles?.full_name ?? '—', present: map.has(e.student_id) ? map.get(e.student_id) : null })).sort((a, b) => a.name.localeCompare(b.name, 'ar')))
    } catch (e) { setMsg(e.message) }
  }
  const setP = (i, v) => { setRows(rows.map((x, j) => (j === i ? { ...x, present: v } : x))); setSaved(false); setOk('') }
  async function save() {
    setMsg(''); setOk('')
    try {
      await q(supabase.from('attendance').upsert(rows.filter((r) => r.present !== null).map((r) => ({ session_id: sid, student_id: r.id, present: r.present }))))
      setSaved(true); setOk('اتحفظ الحضور')
    } catch (e) { setMsg(e.message) }
  }
  if (!d) return <Notice err={err} />
  const gname = (id) => gLabel(d.groups.find((x) => x.id === id))
  const present = rows?.filter((r) => r.present === true).length ?? 0
  const absent = rows?.filter((r) => r.present === false).length ?? 0
  const pending = rows?.filter((r) => r.present === null).length ?? 0

  return (
    <section className="card">
      <h2>تسجيل الحضور</h2>
      <Notice err={msg} />
      <label className="form-one">الحصة
        <select className="fld" value={sid} onChange={(e) => pick(e.target.value)}>
          <option value="">اختار...</option>
          {d.sessions.map((s) => <option key={s.id} value={s.id}>{fmtDT(s.starts_at)} · {gname(s.group_id)}</option>)}
        </select>
      </label>
      {d.sessions.length === 0 && <p className="muted">مفيش حصص في آخر ٣٠ يوم أو اليومين الجايين.</p>}
      {rows && (
        <>
          <div className="inline">
            <span className="pill green">حاضر {num(present)}</span>
            <span className="pill red">غايب {num(absent)}</span>
            {pending > 0 && <span className="pill">لسه {num(pending)}</span>}
            <button className="btn-link" onClick={() => { setRows(rows.map((r) => ({ ...r, present: r.present ?? true }))); setSaved(false) }}>الباقي حاضر</button>
          </div>
          <ul className="att-quick">
            {rows.map((r, i) => (
              <li key={r.id} className={r.present === false ? 'abs' : r.present ? 'pre' : ''}>
                <span className="strong grow">{r.name}</span>
                <div className="seg" role="group" aria-label={`حضور ${r.name}`}>
                  <button type="button" className={r.present === true ? 'on yes' : ''} aria-pressed={r.present === true} onClick={() => setP(i, true)}>حاضر</button>
                  <button type="button" className={r.present === false ? 'on no' : ''} aria-pressed={r.present === false} onClick={() => setP(i, false)}>غايب</button>
                </div>
              </li>
            ))}
            {rows.length === 0 && <li className="muted">مفيش طلبة في المجموعة دي.</li>}
          </ul>
          {rows.length > 0 && <button className="btn-primary sticky-save" disabled={saved} onClick={save}>{saved ? 'محفوظ' : 'حفظ الحضور'}</button>}
          {ok && <p className="msg ok" role="status">{ok}</p>}
        </>
      )}
    </section>
  )
}

/* ================= التصحيح ================= */
export function Grading({ uid }) {
  const [mode, setMode] = useState('todo')
  const [d, load, err] = useLoad(async () => {
    let sq = supabase.from('submissions').select('id, assignment_id, student_id, answers, auto_score, final_score, feedback, submitted_at, graded_at, profiles:student_id(full_name), assignments(title, kind, questions, group_id)')
    sq = mode === 'todo' ? sq.is('final_score', null).order('submitted_at') : sq.not('final_score', 'is', null).order('graded_at', { ascending: false, nullsFirst: false })
    const subs = await q(sq.limit(80))
    const ids = [...new Set(subs.map((s) => s.assignment_id))]
    const keys = ids.length ? await q(supabase.from('assignment_keys').select('assignment_id, answers').in('assignment_id', ids)) : []
    return { subs, keys: Object.fromEntries(keys.map((k) => [k.assignment_id, k.answers])) }
  }, [mode])

  return (
    <section className="card">
      <div className="card-head">
        <h2>التصحيح</h2>
        <Tabs flat id="grade-tab" label="التصحيح" value={mode} onChange={setMode} items={[['todo', `محتاج تصحيح${d && mode === 'todo' ? ` (${num(d.subs.length)})` : ''}`], ['done', 'اتصحح']]} />
      </div>
      <Notice err={err} />
      {d && d.subs.map((s) => <GradeCard key={s.id} s={s} keys={d.keys[s.assignment_id]} uid={uid} onDone={load} />)}
      {d && d.subs.length === 0 && <p className="muted">{mode === 'todo' ? 'مفيش حاجة مستنية تصحيح. برافو!' : 'لسه مفيش تسليمات اتصححت.'}</p>}
    </section>
  )
}

export function GradeCard({ s, keys, uid, onDone }) {
  const [score, setScore] = useState(s.final_score ?? s.auto_score ?? '')
  const [fb, setFb] = useState(s.feedback ?? '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const qs = s.assignments?.questions ?? []
  async function save() {
    setMsg(''); setBusy(true)
    try {
      if (score === '' || Number(score) < 0 || Number(score) > 100) throw new Error('الدرجة لازم تكون من ٠ لـ ١٠٠')
      await q(supabase.from('submissions').update({ final_score: Number(score), feedback: fb.trim() || null, graded_by: uid, graded_at: new Date().toISOString() }).eq('id', s.id))
      onDone()
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  return (
    <div className="qbox">
      <div className="card-head">
        <div><span className="strong">{s.profiles?.full_name}</span> · {s.assignments?.title}</div>
        <span className="muted small">اتسلّم {fmtDT(s.submitted_at)} · التلقائي: {s.auto_score == null ? '—' : `${num(s.auto_score)}٪`}</span>
      </div>
      <ol className="ans">
        {qs.map((x, i) => {
          const a = s.answers?.[i]
          const k = keys?.[i]
          const right = isCorrect(x, a, k)
          return (
            <li key={i}>
              <span className="muted">{x.q}</span> <span className="muted small">({TYPES[typeOf(x)]}{pointsOf(x) !== 1 ? `، ${num(pointsOf(x))} درجة` : ''})</span><br />
              <b className={right === true ? 'ok-t' : right === false ? 'bad-t' : ''} style={{ whiteSpace: 'pre-wrap' }}>{answerText(x, a)}</b>
              {right === false && k != null && <span className="muted small"> (الصح: {keyText(x, k)})</span>}
            </li>
          )
        })}
      </ol>
      <div className="form">
        <label>الدرجة (٪)<input className="fld narrow" type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} /></label>
        <label style={{ flex: 1 }}>تعليق للطالب (اختياري)<input className="fld" placeholder="مثال: شغل حلو، راجع أسئلة الأرقام" value={fb} onChange={(e) => setFb(e.target.value)} /></label>
        <button className="btn-primary" disabled={busy} onClick={save}>{s.final_score != null ? 'تحديث' : 'اعتماد الدرجة'}</button>
      </div>
      <Notice err={msg} />
    </div>
  )
}

/* ================= الإعلانات ================= */
export function Announcements({ uid, role }) {
  const [d, load, err] = useLoad(async () => {
    let gq = supabase.from('groups').select(GSEL).order('name')
    if (role === 'teacher') gq = gq.eq('teacher_id', uid)
    const [groups, list] = await Promise.all([q(gq), q(supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(60))])
    return { groups, list }
  })
  const [f, setF] = useState({ group_id: '', title: '', body: '' })
  const [msg, setMsg] = useState('')
  if (!d) return <Notice err={err} />
  async function post(e) {
    e.preventDefault(); setMsg('')
    try {
      await q(supabase.from('announcements').insert({ group_id: f.group_id || null, author_id: uid, title: f.title.trim(), body: f.body.trim() || null }))
      logAct('announcement_posted', 'announcements', null, { title: f.title.trim() })
      setF({ group_id: role === 'teacher' ? f.group_id : '', title: '', body: '' }); await load()
    } catch (e2) { setMsg(e2.message) }
  }
  const canAll = role === 'manager'
  return (
    <>
      <section className="card">
        <h2>إعلان جديد</h2>
        <p className="muted small">الإعلان بيظهر لطلاب المجموعة وأولياء أمورهم على الرئيسية.</p>
        <form className="form" onSubmit={post}>
          <label>لمين؟
            <select className="fld" required={!canAll} value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}>
              {canAll ? <option value="">كل السنتر</option> : <option value="">اختار المجموعة...</option>}
              {d.groups.map((g) => <option key={g.id} value={g.id}>{gLabel(g)}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>العنوان<input className="fld" required maxLength={200} placeholder="مثال: تأجيل حصة السبت" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label style={{ flexBasis: '100%' }}>التفاصيل (اختياري)<textarea className="fld area" rows={3} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <button className="btn-primary">نشر الإعلان</button>
        </form>
        <Notice err={msg} />
      </section>
      <section className="card">
        <h2>الإعلانات</h2>
        {d.list.map((a) => (
          <div className="row" key={a.id}>
            <div className="grow">
              <div className="strong">{a.title}</div>
              {a.body && <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>}
              <div className="muted small">{a.group_id ? gLabel(d.groups.find((g) => g.id === a.group_id)) : 'كل السنتر'} · {a.author_name ?? '—'} · {fmtDT(a.created_at)}</div>
            </div>
            {(role === 'manager' || a.author_id === uid) && <button className="btn-danger" onClick={() => window.confirm('حذف الإعلان؟') && supabase.from('announcements').delete().eq('id', a.id).then(load)}>حذف</button>}
          </div>
        ))}
        {d.list.length === 0 && <p className="muted">مفيش إعلانات لسه.</p>}
      </section>
    </>
  )
}

/* ================= رسايل أولياء الأمور ================= */
export function Inbox({ uid }) {
  const [d, load, err] = useLoad(async () => {
    const [msgs, links] = await Promise.all([
      q(supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(800)),
      q(supabase.from('parent_links').select('parent_id, student_id')),
    ])
    const ids = [...new Set([...links.flatMap((l) => [l.parent_id, l.student_id]), ...msgs.flatMap((m) => [m.parent_id, m.student_id])])]
    const people = ids.length ? await q(supabase.from('profiles').select('id, full_name').in('id', ids)) : []
    const visible = new Set(people.map((p) => p.id))
    return { msgs, links: links.filter((l) => visible.has(l.student_id)), names: Object.fromEntries(people.map((p) => [p.id, p.full_name])) }
  })
  const [open, setOpen] = useState(null)
  const [newT, setNewT] = useState('')

  const threads = useMemo(() => {
    if (!d) return []
    const map = new Map()
    for (const m of d.msgs) {
      const k = `${m.student_id}|${m.parent_id}`
      if (!map.has(k)) map.set(k, { student_id: m.student_id, parent_id: m.parent_id, last: m, unread: 0 })
      if (m.from_parent && !m.read) map.get(k).unread++
    }
    return [...map.values()]
  }, [d])
  if (!d) return <Notice err={err} />
  const nm = (id) => d.names[id] ?? '—'

  if (open) return <Thread uid={uid} staff studentId={open.student_id} parentId={open.parent_id} title={`${nm(open.parent_id)} · ولي أمر ${nm(open.student_id)}`} onBack={() => { setOpen(null); load() }} />

  return (
    <section className="card">
      <div className="card-head">
        <h2>رسايل أولياء الأمور</h2>
        <div className="inline">
          <select className="fld" value={newT} onChange={(e) => setNewT(e.target.value)} aria-label="رسالة جديدة لولي أمر">
            <option value="">رسالة جديدة لولي أمر...</option>
            {d.links.map((l) => <option key={`${l.student_id}|${l.parent_id}`} value={`${l.student_id}|${l.parent_id}`}>{nm(l.parent_id)} (ولي أمر {nm(l.student_id)})</option>)}
          </select>
          {newT && <button className="btn-primary" onClick={() => { const [s, p] = newT.split('|'); setOpen({ student_id: s, parent_id: p }) }}>افتح</button>}
        </div>
      </div>
      {threads.map((t) => (
        <button className="row thread-row" key={`${t.student_id}|${t.parent_id}`} onClick={() => setOpen(t)}>
          <div className="grow">
            <div className="strong">{nm(t.parent_id)} <span className="muted small">· ولي أمر {nm(t.student_id)}</span></div>
            <div className="muted small ellipsis">{t.last.from_parent ? '' : 'إنت: '}{t.last.body}</div>
          </div>
          <span className="muted small">{fmtD(t.last.created_at)}</span>
          {t.unread > 0 && <span className="pill red">{num(t.unread)} جديد</span>}
        </button>
      ))}
      {threads.length === 0 && <p className="muted">مفيش رسايل لسه.</p>}
    </section>
  )
}

/** محادثة واحدة — بيستخدمها الفريق وولي الأمر */
export function Thread({ uid, staff, studentId, parentId, title, onBack }) {
  const [d, load, err] = useLoad(() => q(supabase.from('messages').select('*').eq('student_id', studentId).eq('parent_id', parentId).order('created_at')), [studentId, parentId])
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!d) return
    const unread = d.filter((m) => m.from_parent === !!staff && !m.read).map((m) => m.id)
    if (unread.length) supabase.from('messages').update({ read: true }).in('id', unread).then(() => {})
  }, [d, staff])
  async function send(e) {
    e.preventDefault(); setMsg('')
    try {
      await q(supabase.from('messages').insert({ student_id: studentId, parent_id: parentId, sender_id: uid, from_parent: !staff, body: text.trim() }))
      setText(''); await load()
    } catch (e2) { setMsg(e2.message) }
  }
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2>{onBack && <button className="btn-link" onClick={onBack}>→ رجوع</button>}</div>
      <Notice err={err || msg} />
      <div className="chat">
        {d && d.map((m) => {
          const mine = m.from_parent === !staff
          return (
            <div key={m.id} className={`bubble${mine ? ' mine' : ''}`}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
              <div className="small muted">{m.sender_name ?? ''} · {fmtDT(m.created_at)}{mine && m.read ? ' · اتقرت' : ''}</div>
            </div>
          )
        })}
        {d && d.length === 0 && <p className="muted">مفيش رسايل لسه. ابدأ المحادثة.</p>}
      </div>
      <form className="form" onSubmit={send}>
        <label style={{ flex: 1 }}>رسالتك<textarea className="fld area" rows={2} required maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button className="btn-primary">إرسال</button>
      </form>
    </section>
  )
}

/* ================= متابعة الغياب ================= */
export function Absences() {
  const [days, setDays] = useState('14')
  const [rows, , err] = useLoad(() => q(supabase.rpc('recent_absences', { p_days: Number(days) })), [days])
  const text = (r, parent) => `السلام عليكم${parent ? ` أ/ ${parent}` : ''}،\nحابين نطمّن على ${r.student_name}، غاب ${num(r.absences)} حصة في آخر ${num(Number(days))} يوم، آخرها ${fmtD(r.last_absent)}.\nلو فيه أي حاجة نقدر نساعد فيها بلّغونا. شكرًا.`
  return (
    <section className="card">
      <div className="card-head">
        <h2>متابعة الغياب</h2>
        <Tabs flat id="abs-tab" label="المدة" value={days} onChange={setDays} items={[['7', 'آخر ٧ أيام'], ['14', 'آخر ١٤ يوم'], ['30', 'آخر ٣٠ يوم']]} />
      </div>
      <Notice err={err} />
      {rows && rows.map((r) => (
        <div className="row" key={r.student_id}>
          <div className="grow">
            <div className="strong">{r.student_name} <span className="pill red">غاب {num(r.absences)}</span></div>
            <div className="muted small">{r.grp} · آخر غياب {fmtD(r.last_absent)}</div>
          </div>
          <div className="inline">
            {r.parents.filter((p) => p.phone).map((p, i) => <a key={i} className="btn-outline" href={waLink(p.phone, text(r, p.name))} target="_blank" rel="noreferrer">واتساب {p.name}</a>)}
            {r.parents.every((p) => !p.phone) && r.student_phone && <a className="btn-outline" href={waLink(r.student_phone, text(r))} target="_blank" rel="noreferrer">واتساب الطالب</a>}
            {r.parents.every((p) => !p.phone) && !r.student_phone && <span className="muted small">مفيش رقم متسجل</span>}
          </div>
        </div>
      ))}
      {rows && rows.length === 0 && <p className="muted">مفيش غياب في الفترة دي.</p>}
    </section>
  )
}
