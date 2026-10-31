import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from './supabase.js'
import { Tabs } from './ui.jsx'
import { ROLE_AR, fmtD, num, q, useLoad, Notice, Modal } from './adminkit.jsx'

const siteUrl = () => location.origin + location.pathname

function inviteText(inv) {
  return [
    `أهلاً ${inv.full_name}،`,
    `تم تسجيلك في السنتر كـ ${ROLE_AR[inv.role]}.`,
    '',
    'عشان تفعّل حسابك:',
    '١) افتح الرابط ده:',
    siteUrl(),
    '٢) اضغط "معندكش حساب؟ سجّل"',
    '٣) سجّل بنفس الإيميل ده:',
    inv.email,
    '٤) هيوصلك إيميل تأكيد، أكده وبعدين ادخل.',
  ].join('\n')
}

function waLink(phone, text) {
  let n = (phone ?? '').replace(/\D/g, '')
  if (n.startsWith('00')) n = n.slice(2)
  else if (n.startsWith('0')) n = '20' + n.slice(1)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

const EMPTY = { name: '', email: '', phone: '', role: 'student', group: '', student: '' }

export default function Accounts({ uid }) {
  const [d, load, err] = useLoad(async () => {
    const [profiles, groups, enr, links, invites] = await Promise.all([
      q(supabase.from('profiles').select('id, full_name, email, role, phone, active, created_at').order('created_at', { ascending: false })),
      q(supabase.from('groups').select('id, name, teacher_id, levels(name, subjects(name))').order('name')),
      q(supabase.from('enrollments').select('student_id, group_id')),
      q(supabase.from('parent_links').select('parent_id, student_id')),
      q(supabase.from('invites').select('*').is('claimed_at', null).order('created_at', { ascending: false })),
    ])
    return { profiles, groups, enr, links, invites }
  })
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState(EMPTY)
  const [sent, setSent] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!d) return <Notice err={err} />

  const gname = (g) => `${g.levels?.subjects?.name ?? ''} ${g.levels?.name ?? ''} · ${g.name}`
  const students = d.profiles.filter((p) => p.role === 'student')
  const parents = d.profiles.filter((p) => p.role === 'parent')
  const staff = d.profiles.filter((p) => ['manager', 'teacher', 'assistant'].includes(p.role))
  const log = (action, table, target, details) => supabase.rpc('log_action', { p_action: action, p_table: table, p_target: target, p_details: details })

  async function act(fn) {
    setMsg(''); setOk('')
    try { await fn(); await load() } catch (e) { setMsg(e.message) }
  }

  async function sendInvite(e) {
    e.preventDefault()
    setMsg(''); setBusy(true)
    try {
      const email = f.email.trim().toLowerCase()
      if (d.profiles.some((p) => (p.email ?? '').toLowerCase() === email)) throw new Error('الإيميل ده عنده حساب بالفعل. عدّل بياناته من الجدول.')
      const row = {
        email,
        full_name: f.name.trim(),
        phone: f.phone.trim() || null,
        role: f.role,
        group_id: ['student', 'teacher'].includes(f.role) ? f.group || null : null,
        link_student_id: f.role === 'parent' ? f.student || null : null,
        created_by: uid,
      }
      const [inv] = await q(supabase.from('invites').insert(row).select())
      log('invite_created', 'invites', inv.id, { role: inv.role, email })
      setAdding(false); setF(EMPTY); setSent(inv)
      await load()
    } catch (e2) {
      setMsg(/duplicate|unique/i.test(e2.message) ? 'فيه دعوة معلّقة لنفس الإيميل بالفعل (شوفها في "دعوات معلّقة").' : e2.message)
    }
    setBusy(false)
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setOk('اتنسخت الرسالة، الصقها في واتساب أو أي مكان.') }
    catch { setOk('المتصفح منع النسخ التلقائي. حدد الرسالة بإيديك وانسخها.') }
  }

  async function saveEdit(e) {
    e.preventDefault()
    await act(async () => {
      await q(supabase.from('profiles').update({ full_name: edit.full_name.trim(), phone: edit.phone?.trim() || null, role: edit.role }).eq('id', edit.id))
      log('profile_updated', 'profiles', edit.id, { role: edit.role })
      setEdit(null)
    })
  }

  const setActive = (p, active) => act(async () => {
    await q(supabase.from('profiles').update({ active }).eq('id', p.id))
    log(active ? 'account_activated' : 'account_suspended', 'profiles', p.id, { email: p.email })
  })

  async function resetLink(p) {
    setMsg(''); setOk('')
    const { error } = await supabase.auth.resetPasswordForEmail(p.email, { redirectTo: siteUrl() })
    if (error) setMsg(error.message)
    else { setOk(`اتبعت رابط تغيير كلمة السر على ${p.email}`); log('password_reset_sent', 'profiles', p.id, null) }
  }

  const term = search.trim().toLowerCase()
  const match = (p) => !term || `${p.full_name} ${p.email ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(term)
  const shown = (tab === 'student' ? students : tab === 'parent' ? parents : tab === 'staff' ? staff : d.profiles).filter(match)

  const enrolled = (sid) => d.enr.filter((e) => e.student_id === sid)
  const mineLinks = (pid) => d.links.filter((l) => l.parent_id === pid)

  function details(p) {
    if (p.role === 'student')
      return (
        <>
          {enrolled(p.id).map((e) => {
            const g = d.groups.find((x) => x.id === e.group_id)
            return (
              <span className="pill tag" key={e.group_id}>
                {g ? gname(g) : '—'}
                <button className="x" aria-label="شيل من المجموعة" onClick={() => act(() => q(supabase.from('enrollments').delete().eq('student_id', p.id).eq('group_id', e.group_id)))}>×</button>
              </span>
            )
          })}
          <select className="fld mini" value="" aria-label="إضافة لمجموعة" onChange={(e) => e.target.value && act(() => q(supabase.from('enrollments').insert({ student_id: p.id, group_id: e.target.value })))}>
            <option value="">{enrolled(p.id).length ? '+ مجموعة' : 'من غير مجموعة · أضف'}</option>
            {d.groups.filter((g) => !enrolled(p.id).some((e) => e.group_id === g.id)).map((g) => <option key={g.id} value={g.id}>{gname(g)}</option>)}
          </select>
        </>
      )
    if (p.role === 'parent')
      return (
        <>
          {mineLinks(p.id).map((l) => (
            <span className="pill tag" key={l.student_id}>
              {d.profiles.find((x) => x.id === l.student_id)?.full_name ?? '—'}
              <button className="x" aria-label="فك الربط" onClick={() => act(() => q(supabase.from('parent_links').delete().eq('parent_id', p.id).eq('student_id', l.student_id)))}>×</button>
            </span>
          ))}
          <select className="fld mini" value="" aria-label="ربط بطالب" onChange={(e) => e.target.value && act(() => q(supabase.from('parent_links').insert({ parent_id: p.id, student_id: e.target.value })))}>
            <option value="">{mineLinks(p.id).length ? '+ ابن/بنت' : 'مفيش · اربط'}</option>
            {students.filter((x) => !mineLinks(p.id).some((l) => l.student_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
          </select>
        </>
      )
    const teaching = d.groups.filter((g) => g.teacher_id === p.id)
    return teaching.length ? teaching.map((g) => <span className="pill tag" key={g.id}>{gname(g)}</span>) : <span className="muted small">{p.role === 'manager' ? 'كل الصلاحيات' : 'من غير مجموعات (عيّنه من تبويب المجموعات)'}</span>
  }

  const FIELDS_NEED_GROUP = ['student', 'teacher']

  return (
    <>
      <Notice err={msg} />
      {ok && <p className="msg ok" role="status">{ok}</p>}

      <div className="stats">
        <div className="stat"><b>{num(students.length)}</b><span>طلاب</span></div>
        <div className="stat"><b>{num(parents.length)}</b><span>أولياء أمور</span></div>
        <div className="stat"><b>{num(staff.length)}</b><span>الفريق</span></div>
        <div className="stat"><b>{num(d.invites.length)}</b><span>دعوات معلّقة</span></div>
      </div>

      <section className="card">
        <div className="card-head">
          <Tabs flat id="acc-tab" label="نوع الحسابات" value={tab} onChange={setTab} items={[['all', `الكل (${num(d.profiles.length)})`], ['student', 'طلاب'], ['parent', 'أولياء أمور'], ['staff', 'مدرسين ومساعدين'], ['invites', `دعوات معلّقة (${num(d.invites.length)})`]]} />
          <button className="btn-primary" onClick={() => { setMsg(''); setOk(''); setAdding(true) }}>+ إضافة شخص</button>
        </div>

        {tab !== 'invites' ? (
          <>
            <input className="fld" style={{ maxWidth: 360 }} placeholder="بحث بالاسم أو الإيميل أو الموبايل" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>التفاصيل</th><th>إجراءات</th></tr></thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className={p.active ? '' : 'off'}>
                      <td>
                        <div className="strong">{p.full_name}</div>
                        <div dir="ltr" className="muted small" style={{ textAlign: 'start' }}>{p.email}{p.phone ? ` · ${p.phone}` : ''}</div>
                      </td>
                      <td><span className={`pill ${p.role === 'manager' ? 'gold' : ''}`}>{ROLE_AR[p.role]}</span></td>
                      <td><span className={`pill ${p.active ? 'green' : 'red'}`}>{p.active ? 'نشط' : 'موقوف'}</span></td>
                      <td>{details(p)}</td>
                      <td>
                        <div className="inline">
                          <button className="btn-outline" onClick={() => setEdit({ ...p })}>تعديل</button>
                          {p.id !== uid && (p.active
                            ? <button className="btn-danger" onClick={() => window.confirm(`إيقاف حساب ${p.full_name}؟ مش هيقدر يدخل لحد ما تفعّله تاني.`) && setActive(p, false)}>إيقاف</button>
                            : <button className="btn-outline" onClick={() => setActive(p, true)}>تفعيل</button>)}
                          {p.email && <button className="btn-link" onClick={() => resetLink(p)}>رابط كلمة السر</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan="5" className="muted">مفيش نتايج. اضغط "إضافة شخص" لدعوة حد جديد.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>الاسم</th><th>الدور</th><th>اتضاف</th><th>إجراءات</th></tr></thead>
              <tbody>
                {d.invites.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="strong">{i.full_name}</div>
                      <div dir="ltr" className="muted small" style={{ textAlign: 'start' }}>{i.email}{i.phone ? ` · ${i.phone}` : ''}</div>
                    </td>
                    <td><span className="pill">{ROLE_AR[i.role]}</span></td>
                    <td className="muted">{fmtD(i.created_at)}</td>
                    <td>
                      <div className="inline">
                        <button className="btn-outline" onClick={() => { setOk(''); setSent(i) }}>رسالة الدعوة</button>
                        <button className="btn-danger" onClick={() => window.confirm('إلغاء الدعوة؟') && act(async () => { await q(supabase.from('invites').delete().eq('id', i.id)); log('invite_cancelled', 'invites', i.id, { email: i.email }) })}>إلغاء</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {d.invites.length === 0 && <tr><td colSpan="4" className="muted">مفيش دعوات معلّقة.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">الإيقاف بيمنع الشخص من الدخول لكن بيحفظ كل بياناته. الحذف النهائي للحسابات بيتم من لوحة Supabase.</p>
      </section>

      <AnimatePresence>
        {adding && (
          <Modal key="add" title="إضافة شخص جديد" onClose={() => setAdding(false)}>
            <form className="form" onSubmit={sendInvite}>
              <label>الاسم بالكامل<input className="fld" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label>الإيميل<input className="fld" type="email" dir="ltr" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
              <label>الموبايل (واتساب) — اختياري<input className="fld" dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
              <label>الدور
                <select className="fld" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, group: '', student: '' })}>
                  {['student', 'parent', 'teacher', 'assistant', 'manager'].map((r) => <option key={r} value={r}>{ROLE_AR[r]}</option>)}
                </select>
              </label>
              {FIELDS_NEED_GROUP.includes(f.role) && (
                <label>{f.role === 'student' ? 'المجموعة (اختياري)' : 'المجموعة اللي هيدرّسها (اختياري)'}
                  <select className="fld" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>
                    <option value="">من غير</option>
                    {d.groups.map((g) => <option key={g.id} value={g.id}>{gname(g)}</option>)}
                  </select>
                </label>
              )}
              {f.role === 'parent' && (
                <label>ابنه / بنته (اختياري)
                  <select className="fld" value={f.student} onChange={(e) => setF({ ...f, student: e.target.value })}>
                    <option value="">اربطه بعدين</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </label>
              )}
              {f.role === 'manager' && <p className="msg">المدير بيقدر يتحكم في كل حاجة على المنصة. اتأكد من الإيميل كويس.</p>}
              <Notice err={msg} />
              <button className="btn-primary" disabled={busy}>{busy ? 'لحظة...' : 'إنشاء الدعوة'}</button>
            </form>
          </Modal>
        )}

        {sent && (
          <Modal key="sent" title="رسالة الدعوة جاهزة" onClose={() => setSent(null)}>
            <p className="muted">ابعت الرسالة دي لـ {sent.full_name}. أول ما يسجّل بنفس الإيميل ويأكده، حسابه بيتفعّل بدور {ROLE_AR[sent.role]} تلقائي.</p>
            <textarea className="fld area" rows={9} readOnly value={inviteText(sent)} onFocus={(e) => e.target.select()} />
            {ok && <p className="msg ok" role="status">{ok}</p>}
            <div className="inline">
              <button className="btn-primary" onClick={() => copy(inviteText(sent))}>نسخ الرسالة</button>
              <a className="btn-outline" href={waLink(sent.phone, inviteText(sent))} target="_blank" rel="noreferrer">إرسال واتساب</a>
              <button className="btn-link" onClick={() => { setSent(null); setAdding(true) }}>إضافة شخص تاني</button>
            </div>
          </Modal>
        )}

        {edit && (
          <Modal key="edit" title={`تعديل ${edit.full_name}`} onClose={() => setEdit(null)}>
            <form className="form" onSubmit={saveEdit}>
              <label>الاسم<input className="fld" required value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></label>
              <label>الموبايل<input className="fld" dir="ltr" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
              <label>الدور
                <select className="fld" value={edit.role} disabled={edit.id === uid} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                  {Object.entries(ROLE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {edit.id === uid && <p className="muted small">مينفعش تغيّر دور حسابك إنت.</p>}
              <Notice err={msg} />
              <button className="btn-primary">حفظ</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}
