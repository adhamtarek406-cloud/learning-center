import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'
import Student from './Student.jsx'

const ROLE_AR = { manager: 'مدير', teacher: 'مدرس', assistant: 'مساعد', student: 'طالب', parent: 'ولي أمر' }
const fmtDT = (iso) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const fmtD = (iso) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(iso))
const num = (n) => Number(n ?? 0).toLocaleString('ar-EG')

async function q(p) {
  const r = await p
  if (r.error) throw new Error(r.error.message)
  return r.data
}

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => fn().then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message)), deps) // eslint-disable-line
  useEffect(() => { load() }, [load])
  return [data, load, err]
}

function Notice({ err }) {
  return err ? <p className="msg" role="alert">حصلت مشكلة: {err}</p> : null
}

/* ---------------- الطلاب والفريق ---------------- */
function People({ role }) {
  const [d, load, err] = useLoad(async () => {
    const [profiles, groups, enr] = await Promise.all([
      q(supabase.from('profiles').select('id, full_name, email, role, phone, created_at').order('created_at', { ascending: false })),
      q(supabase.from('groups').select('id, name, levels(name, subjects(name))').order('name')),
      q(supabase.from('enrollments').select('student_id, group_id')),
    ])
    return { profiles, groups, enr }
  })
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState('')
  const [only, setOnly] = useState('all')
  if (!d) return <Notice err={err} />

  const gname = (g) => `${g.levels?.subjects?.name ?? ''} ${g.levels?.name ?? ''} · ${g.name}`
  const enrolled = (sid) => d.enr.filter((e) => e.student_id === sid)
  const students = d.profiles.filter((p) => p.role === 'student' || p.role === 'parent')
  const team = d.profiles.filter((p) => ['manager', 'teacher', 'assistant'].includes(p.role))
  let shown = students.filter((p) => !filter || (p.full_name + (p.email ?? '')).toLowerCase().includes(filter.toLowerCase()))
  if (only === 'none') shown = shown.filter((p) => enrolled(p.id).length === 0)

  async function act(fn) { setMsg(''); try { await fn(); await load() } catch (e) { setMsg(e.message) } }

  return (
    <>
      <Notice err={msg} />
      <section className="card">
        <div className="card-head">
          <h2>الطلاب ({num(students.length)})</h2>
          <div className="inline">
            <input className="fld" placeholder="بحث بالاسم أو الإيميل" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="fld" value={only} onChange={(e) => setOnly(e.target.value)}>
              <option value="all">الكل</option>
              <option value="none">من غير مجموعة</option>
            </select>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>الإيميل</th><th>المجموعات</th><th>إضافة لمجموعة</th>{role === 'manager' && <th>الدور</th>}</tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.full_name}</td>
                  <td dir="ltr" className="muted">{p.email}</td>
                  <td>
                    {enrolled(p.id).map((e) => {
                      const g = d.groups.find((x) => x.id === e.group_id)
                      return (
                        <span className="pill tag" key={e.group_id}>
                          {g ? gname(g) : '—'}
                          <button className="x" aria-label="شيل من المجموعة" onClick={() => act(() => q(supabase.from('enrollments').delete().eq('student_id', p.id).eq('group_id', e.group_id)))}>×</button>
                        </span>
                      )
                    })}
                    {enrolled(p.id).length === 0 && <span className="muted small">من غير مجموعة</span>}
                  </td>
                  <td>
                    <select className="fld" value="" onChange={(e) => e.target.value && act(() => q(supabase.from('enrollments').insert({ student_id: p.id, group_id: e.target.value })))}>
                      <option value="">اختار...</option>
                      {d.groups.filter((g) => !enrolled(p.id).some((e) => e.group_id === g.id)).map((g) => <option key={g.id} value={g.id}>{gname(g)}</option>)}
                    </select>
                  </td>
                  {role === 'manager' && (
                    <td>
                      <select className="fld" value={p.role} onChange={(e) => act(() => q(supabase.from('profiles').update({ role: e.target.value }).eq('id', p.id)))}>
                        {Object.entries(ROLE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan="5" className="muted">مفيش طلبة مطابقين.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>الفريق</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>الإيميل</th><th>الدور</th></tr></thead>
            <tbody>
              {team.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.full_name}</td>
                  <td dir="ltr" className="muted">{p.email}</td>
                  <td>{ROLE_AR[p.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {role === 'manager' && <p className="muted small">لتعيين مدرس أو مساعد: يسجل حساب عادي من صفحة التسجيل، وبعدين غيّر دوره من جدول الطلاب فوق.</p>}
      </section>
    </>
  )
}

/* ---------------- المجموعات والهيكل ---------------- */
function Groups({ role }) {
  const [d, load, err] = useLoad(async () => {
    const [groups, levels, stages, subjects, staff, enr, centers] = await Promise.all([
      q(supabase.from('groups').select('id, name, schedule, monthly_price, capacity, active, teacher_id, levels(name, subjects(name), stages(name))').order('name')),
      q(supabase.from('levels').select('id, name, subjects(name), stages(name)').order('name')),
      q(supabase.from('stages').select('id, name').order('sort')),
      q(supabase.from('subjects').select('id, name').order('name')),
      q(supabase.from('profiles').select('id, full_name, role').in('role', ['manager', 'teacher', 'assistant'])),
      q(supabase.from('enrollments').select('group_id')),
      q(supabase.from('centers').select('id').limit(1)),
    ])
    return { groups, levels, stages, subjects, staff, enr, center: centers[0] }
  })
  const [msg, setMsg] = useState('')
  const [g, setG] = useState({ level_id: '', name: '', schedule: '', monthly_price: '', capacity: '', teacher_id: '' })
  const [lv, setLv] = useState({ stage_id: '', subject_id: '', name: '' })
  const [sj, setSj] = useState({ name: '', is_language: false })
  if (!d) return <Notice err={err} />
  const isM = role === 'manager'
  async function act(fn, reset) { setMsg(''); try { await fn(); reset?.(); await load() } catch (e) { setMsg(e.message) } }
  const count = (id) => d.enr.filter((e) => e.group_id === id).length

  return (
    <>
      <Notice err={msg} />
      <section className="card">
        <h2>المجموعات</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>المجموعة</th><th>المادة والمستوى</th><th>المدرس</th><th>الميعاد</th><th>السعر الشهري</th><th>الطلبة</th></tr></thead>
            <tbody>
              {d.groups.map((x) => (
                <tr key={x.id}>
                  <td className="strong">{x.name}</td>
                  <td>{x.levels?.subjects?.name} · {x.levels?.name} <span className="muted small">({x.levels?.stages?.name})</span></td>
                  <td>
                    {isM ? (
                      <select className="fld" value={x.teacher_id ?? ''} onChange={(e) => act(() => q(supabase.from('groups').update({ teacher_id: e.target.value || null }).eq('id', x.id)))}>
                        <option value="">غير محدد</option>
                        {d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    ) : (d.staff.find((s) => s.id === x.teacher_id)?.full_name ?? '—')}
                  </td>
                  <td>{x.schedule}</td>
                  <td>{x.monthly_price == null ? <span className="muted">لسه</span> : num(x.monthly_price)}</td>
                  <td>{num(count(x.id))}{x.capacity ? ` / ${num(x.capacity)}` : ''}</td>
                </tr>
              ))}
              {d.groups.length === 0 && <tr><td colSpan="6" className="muted">مفيش مجموعات لسه.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {isM && (
        <section className="card">
          <h2>إضافة مجموعة</h2>
          <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => q(supabase.from('groups').insert({ level_id: g.level_id, name: g.name, schedule: g.schedule || null, monthly_price: g.monthly_price === '' ? null : Number(g.monthly_price), capacity: g.capacity === '' ? null : Number(g.capacity), teacher_id: g.teacher_id || null })), () => setG({ level_id: '', name: '', schedule: '', monthly_price: '', capacity: '', teacher_id: '' })) }}>
            <label>المستوى<select className="fld" required value={g.level_id} onChange={(e) => setG({ ...g, level_id: e.target.value })}><option value="">اختار...</option>{d.levels.map((l) => <option key={l.id} value={l.id}>{l.subjects?.name} · {l.name} ({l.stages?.name})</option>)}</select></label>
            <label>اسم المجموعة<input className="fld" required value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></label>
            <label>الميعاد<input className="fld" placeholder="مثال: السبت والثلاثاء ٦ م" value={g.schedule} onChange={(e) => setG({ ...g, schedule: e.target.value })} /></label>
            <label>السعر الشهري<input className="fld" type="number" min="0" value={g.monthly_price} onChange={(e) => setG({ ...g, monthly_price: e.target.value })} /></label>
            <label>السعة<input className="fld" type="number" min="1" value={g.capacity} onChange={(e) => setG({ ...g, capacity: e.target.value })} /></label>
            <label>المدرس<select className="fld" value={g.teacher_id} onChange={(e) => setG({ ...g, teacher_id: e.target.value })}><option value="">غير محدد</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
            <button className="btn-primary">إضافة المجموعة</button>
          </form>
        </section>
      )}

      {isM && (
        <section className="card">
          <h2>المواد والمستويات</h2>
          <p className="muted small">المواد الحالية: {d.subjects.map((s) => s.name).join('، ') || '—'}</p>
          <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => q(supabase.from('subjects').insert({ center_id: d.center.id, name: sj.name, is_language: sj.is_language })), () => setSj({ name: '', is_language: false })) }}>
            <label>مادة جديدة<input className="fld" required value={sj.name} onChange={(e) => setSj({ ...sj, name: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={sj.is_language} onChange={(e) => setSj({ ...sj, is_language: e.target.checked })} /> لغة</label>
            <button className="btn-outline">إضافة مادة</button>
          </form>
          <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => q(supabase.from('levels').insert(lv)), () => setLv({ stage_id: '', subject_id: '', name: '' })) }}>
            <label>المرحلة<select className="fld" required value={lv.stage_id} onChange={(e) => setLv({ ...lv, stage_id: e.target.value })}><option value="">اختار...</option>{d.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>المادة<select className="fld" required value={lv.subject_id} onChange={(e) => setLv({ ...lv, subject_id: e.target.value })}><option value="">اختار...</option>{d.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>اسم الصف أو المستوى<input className="fld" required placeholder="مثال: الصف الثالث الإعدادي" value={lv.name} onChange={(e) => setLv({ ...lv, name: e.target.value })} /></label>
            <button className="btn-outline">إضافة مستوى</button>
          </form>
        </section>
      )}
    </>
  )
}

/* ---------------- الحصص ---------------- */
function Sessions() {
  const [d, load, err] = useLoad(async () => {
    const [groups, sessions] = await Promise.all([
      q(supabase.from('groups').select('id, name, levels(name, subjects(name))').order('name')),
      q(supabase.from('sessions').select('id, group_id, starts_at, topic, live_url, recording_url').order('starts_at', { ascending: false }).limit(60)),
    ])
    return { groups, sessions }
  })
  const [msg, setMsg] = useState('')
  const [f, setF] = useState({ group_id: '', starts_at: '', topic: '', live_url: '' })
  if (!d) return <Notice err={err} />
  const gname = (id) => { const g = d.groups.find((x) => x.id === id); return g ? `${g.levels?.subjects?.name ?? ''} ${g.levels?.name ?? ''} · ${g.name}` : '—' }
  async function act(fn, reset) { setMsg(''); try { await fn(); reset?.(); await load() } catch (e) { setMsg(e.message) } }

  return (
    <>
      <Notice err={msg} />
      <section className="card">
        <h2>إضافة حصة</h2>
        <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => q(supabase.from('sessions').insert({ group_id: f.group_id, starts_at: new Date(f.starts_at).toISOString(), topic: f.topic || null, live_url: f.live_url || null })), () => setF({ group_id: '', starts_at: '', topic: '', live_url: '' })) }}>
          <label>المجموعة<select className="fld" required value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}><option value="">اختار...</option>{d.groups.map((g) => <option key={g.id} value={g.id}>{gname(g.id)}</option>)}</select></label>
          <label>الميعاد<input className="fld" type="datetime-local" required value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></label>
          <label>الموضوع<input className="fld" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
          <label>رابط اللايف<input className="fld" dir="ltr" placeholder="https://" value={f.live_url} onChange={(e) => setF({ ...f, live_url: e.target.value })} /></label>
          <button className="btn-primary">إضافة الحصة</button>
        </form>
      </section>
      <section className="card">
        <h2>الحصص</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>الميعاد</th><th>المجموعة</th><th>الموضوع</th><th>رابط اللايف</th><th>رابط التسجيل</th><th></th></tr></thead>
            <tbody>
              {d.sessions.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDT(s.starts_at)}</td>
                  <td>{gname(s.group_id)}</td>
                  <td>{s.topic}</td>
                  <td><LinkField value={s.live_url} onSave={(v) => act(() => q(supabase.from('sessions').update({ live_url: v || null }).eq('id', s.id)))} /></td>
                  <td><LinkField value={s.recording_url} onSave={(v) => act(() => q(supabase.from('sessions').update({ recording_url: v || null }).eq('id', s.id)))} /></td>
                  <td><button className="btn-danger" onClick={() => window.confirm('تحذف الحصة دي؟') && act(() => q(supabase.from('sessions').delete().eq('id', s.id)))}>حذف</button></td>
                </tr>
              ))}
              {d.sessions.length === 0 && <tr><td colSpan="6" className="muted">مفيش حصص لسه.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function LinkField({ value, onSave }) {
  const [v, setV] = useState(value ?? '')
  const changed = v !== (value ?? '')
  return (
    <div className="inline">
      <input className="fld" dir="ltr" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://" />
      {changed && <button className="btn-outline" onClick={() => onSave(v.trim())}>حفظ</button>}
    </div>
  )
}

/* ---------------- الحضور ---------------- */
function Attendance() {
  const [d, , err] = useLoad(async () => {
    const [sessions, groups] = await Promise.all([
      q(supabase.from('sessions').select('id, group_id, starts_at, topic').lte('starts_at', new Date(Date.now() + 86400000).toISOString()).order('starts_at', { ascending: false }).limit(30)),
      q(supabase.from('groups').select('id, name, levels(name, subjects(name))')),
    ])
    return { sessions, groups }
  })
  const [sid, setSid] = useState('')
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  async function pick(id) {
    setSid(id); setRows(null); setMsg(''); setOk('')
    if (!id) return
    try {
      const s = d.sessions.find((x) => x.id === id)
      const [enr, att] = await Promise.all([
        q(supabase.from('enrollments').select('student_id, profiles(full_name)').eq('group_id', s.group_id)),
        q(supabase.from('attendance').select('student_id, present').eq('session_id', id)),
      ])
      const map = new Map(att.map((a) => [a.student_id, a.present]))
      setRows(enr.map((e) => ({ id: e.student_id, name: e.profiles?.full_name, present: map.has(e.student_id) ? map.get(e.student_id) : true })))
    } catch (e) { setMsg(e.message) }
  }
  async function save() {
    setMsg(''); setOk('')
    try {
      await q(supabase.from('attendance').upsert(rows.map((r) => ({ session_id: sid, student_id: r.id, present: r.present }))))
      setOk('اتحفظ الحضور')
    } catch (e) { setMsg(e.message) }
  }
  if (!d) return <Notice err={err} />
  const gname = (id) => { const g = d.groups.find((x) => x.id === id); return g ? `${g.levels?.subjects?.name ?? ''} ${g.levels?.name ?? ''} · ${g.name}` : '' }

  return (
    <section className="card">
      <h2>تسجيل الحضور</h2>
      <Notice err={msg} />
      <label className="form-one">اختار الحصة
        <select className="fld" value={sid} onChange={(e) => pick(e.target.value)}>
          <option value="">اختار...</option>
          {d.sessions.map((s) => <option key={s.id} value={s.id}>{fmtDT(s.starts_at)} · {gname(s.group_id)}</option>)}
        </select>
      </label>
      {rows && (
        <>
          <ul className="att">
            {rows.map((r, i) => (
              <li key={r.id}>
                <label className="check">
                  <input type="checkbox" checked={r.present} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, present: e.target.checked } : x)))} />
                  <span className="strong">{r.name}</span>
                </label>
                <span className={`pill ${r.present ? 'green' : ''}`}>{r.present ? 'حاضر' : 'غايب'}</span>
              </li>
            ))}
            {rows.length === 0 && <li className="muted">مفيش طلبة في المجموعة دي.</li>}
          </ul>
          {rows.length > 0 && <button className="btn-primary" onClick={save}>حفظ الحضور</button>}
          {ok && <p className="muted" role="status">{ok}</p>}
        </>
      )}
    </section>
  )
}

/* ---------------- الاشتراكات والخطط ---------------- */
const STATUS_AR = { active: 'ساري', paused: 'متوقف', expired: 'منتهي', cancelled: 'ملغي' }
function Subscriptions({ role }) {
  const [d, load, err] = useLoad(async () => {
    const [subs, students, plans, groups, centers] = await Promise.all([
      q(supabase.from('subscriptions').select('id, status, starts_on, renews_on, profiles:student_id(full_name), plans(name), groups(name)').order('starts_on', { ascending: false }).limit(100)),
      q(supabase.from('profiles').select('id, full_name').eq('role', 'student').order('full_name')),
      q(supabase.from('plans').select('id, name, kind, price, duration_days').order('name')),
      q(supabase.from('groups').select('id, name, levels(name, subjects(name))').order('name')),
      q(supabase.from('centers').select('id').limit(1)),
    ])
    return { subs, students, plans, groups, center: centers[0] }
  })
  const [msg, setMsg] = useState('')
  const [f, setF] = useState({ student_id: '', plan_id: '', group_id: '', amount: '' })
  const [pl, setPl] = useState({ name: '', kind: 'monthly', price: '', duration_days: '30' })
  if (!d) return <Notice err={err} />
  async function act(fn, reset) { setMsg(''); try { await fn(); reset?.(); await load() } catch (e) { setMsg(e.message) } }

  async function activate(e) {
    e.preventDefault()
    const plan = d.plans.find((p) => p.id === f.plan_id)
    const start = new Date()
    const renew = plan?.duration_days ? new Date(start.getTime() + plan.duration_days * 86400000) : null
    await act(async () => {
      const [sub] = await q(supabase.from('subscriptions').insert({ student_id: f.student_id, plan_id: f.plan_id, group_id: f.group_id || null, status: 'active', renews_on: renew ? renew.toISOString().slice(0, 10) : null }).select('id'))
      const amount = f.amount === '' ? plan?.price ?? 0 : Number(f.amount)
      await q(supabase.from('payments').insert({ subscription_id: sub.id, amount, status: 'paid', paid_at: new Date().toISOString(), gateway_ref: 'يدوي' }))
    }, () => setF({ student_id: '', plan_id: '', group_id: '', amount: '' }))
  }

  return (
    <>
      <Notice err={msg} />
      <section className="card">
        <h2>تفعيل اشتراك (دفع يدوي)</h2>
        <form className="form" onSubmit={activate}>
          <label>الطالب<select className="fld" required value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })}><option value="">اختار...</option>{d.students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
          <label>الخطة<select className="fld" required value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}><option value="">اختار...</option>{d.plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({num(p.price)})</option>)}</select></label>
          <label>المجموعة<select className="fld" value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })}><option value="">غير محدد</option>{d.groups.map((g) => <option key={g.id} value={g.id}>{g.levels?.subjects?.name} {g.levels?.name} · {g.name}</option>)}</select></label>
          <label>المبلغ المدفوع<input className="fld" type="number" min="0" placeholder="سعر الخطة لو سبته فاضي" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <button className="btn-primary">تفعيل وتسجيل الدفعة</button>
        </form>
      </section>

      <section className="card">
        <h2>الاشتراكات</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>الطالب</th><th>الخطة</th><th>المجموعة</th><th>بدأ</th><th>يتجدد</th><th>الحالة</th></tr></thead>
            <tbody>
              {d.subs.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.profiles?.full_name}</td>
                  <td>{s.plans?.name}</td>
                  <td>{s.groups?.name ?? '—'}</td>
                  <td>{fmtD(s.starts_on)}</td>
                  <td>{s.renews_on ? fmtD(s.renews_on) : '—'}</td>
                  <td>
                    <select className="fld" value={s.status} onChange={(e) => act(() => q(supabase.from('subscriptions').update({ status: e.target.value }).eq('id', s.id)))}>
                      {Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {d.subs.length === 0 && <tr><td colSpan="6" className="muted">مفيش اشتراكات لسه.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {role === 'manager' && (
        <section className="card">
          <h2>الخطط والأسعار</h2>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>الخطة</th><th>النوع</th><th>السعر</th><th>المدة بالأيام</th></tr></thead>
              <tbody>
                {d.plans.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.name}</td>
                    <td>{{ monthly: 'شهري', level: 'بالمستوى', course: 'كورس كامل' }[p.kind]}</td>
                    <td><PriceField value={p.price} onSave={(v) => act(() => q(supabase.from('plans').update({ price: v }).eq('id', p.id)))} /></td>
                    <td>{p.duration_days ? num(p.duration_days) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => q(supabase.from('plans').insert({ center_id: d.center.id, name: pl.name, kind: pl.kind, price: Number(pl.price), duration_days: pl.duration_days === '' ? null : Number(pl.duration_days) })), () => setPl({ name: '', kind: 'monthly', price: '', duration_days: '30' })) }}>
            <label>اسم الخطة<input className="fld" required value={pl.name} onChange={(e) => setPl({ ...pl, name: e.target.value })} /></label>
            <label>النوع<select className="fld" value={pl.kind} onChange={(e) => setPl({ ...pl, kind: e.target.value })}><option value="monthly">شهري</option><option value="level">بالمستوى</option><option value="course">كورس كامل</option></select></label>
            <label>السعر<input className="fld" type="number" min="0" required value={pl.price} onChange={(e) => setPl({ ...pl, price: e.target.value })} /></label>
            <label>المدة بالأيام<input className="fld" type="number" min="1" value={pl.duration_days} onChange={(e) => setPl({ ...pl, duration_days: e.target.value })} /></label>
            <button className="btn-outline">إضافة خطة</button>
          </form>
        </section>
      )}
    </>
  )
}

function PriceField({ value, onSave }) {
  const [v, setV] = useState(String(value ?? ''))
  const changed = v !== String(value ?? '')
  return (
    <div className="inline">
      <input className="fld narrow" type="number" min="0" value={v} onChange={(e) => setV(e.target.value)} />
      {changed && v !== '' && <button className="btn-outline" onClick={() => onSave(Number(v))}>حفظ</button>}
    </div>
  )
}

/* ---------------- الغلاف ---------------- */
const TABS = [
  ['people', 'الطلاب والفريق'],
  ['groups', 'المجموعات'],
  ['sessions', 'الحصص'],
  ['attendance', 'الحضور'],
  ['subs', 'الاشتراكات'],
]

export default function Admin({ session, role }) {
  const [tab, setTab] = useState('people')
  const [asStudent, setAsStudent] = useState(false)
  if (asStudent) return (
    <>
      <button className="floating btn-primary" onClick={() => setAsStudent(false)}>رجوع للوحة الإدارة</button>
      <Student session={session} />
    </>
  )
  return (
    <div className="admin">
      <header className="admin-top">
        <div className="brand"><Logo size={40} /><div>اسم السنتر<small>لوحة الإدارة · {ROLE_AR[role]}</small></div></div>
        <div className="inline">
          <button className="btn-link" onClick={() => setAsStudent(true)}>شوف شاشة الطالب</button>
          <button className="btn-link" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
        </div>
      </header>
      <nav className="tabs" aria-label="أقسام الإدارة">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <main className="admin-main">
        {tab === 'people' && <People role={role} />}
        {tab === 'groups' && <Groups role={role} />}
        {tab === 'sessions' && <Sessions />}
        {tab === 'attendance' && <Attendance />}
        {tab === 'subs' && <Subscriptions role={role} />}
      </main>
    </div>
  )
}
