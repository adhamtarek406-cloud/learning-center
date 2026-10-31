import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from './supabase.js'
import { Tabs } from './ui.jsx'
import { num, q, useLoad, Notice, Modal, Editable, logAct } from './adminkit.jsx'

const EMPTY_G = { id: null, level_id: '', name: '', schedule: '', monthly_price: '', capacity: '', teacher_id: '', active: true }

export default function Content() {
  const [d, load, err] = useLoad(async () => {
    const [groups, levels, stages, subjects, staff, enr, sess, asg, centers, grades] = await Promise.all([
      q(supabase.from('groups').select('id, name, schedule, monthly_price, capacity, active, teacher_id, level_id').order('name')),
      q(supabase.from('levels').select('id, name, stage_id, subject_id, grade_id').order('name')),
      q(supabase.from('stages').select('id, name, sort').order('sort')),
      q(supabase.from('subjects').select('id, name, is_language').order('name')),
      q(supabase.from('profiles').select('id, full_name').in('role', ['manager', 'teacher', 'assistant']).eq('active', true)),
      q(supabase.from('enrollments').select('group_id')),
      q(supabase.from('sessions').select('group_id')),
      q(supabase.from('assignments').select('group_id')),
      q(supabase.from('centers').select('id').limit(1)),
      q(supabase.from('grades').select('id, name, stage_id, sort').order('sort')),
    ])
    return { groups, levels, stages, subjects, staff, enr, sess, asg, center: centers[0], grades }
  })
  const [tab, setTab] = useState('groups')
  const [msg, setMsg] = useState('')
  const [gf, setGf] = useState(null)
  const [st, setSt] = useState('')
  const [sj, setSj] = useState({ name: '', is_language: false })
  const [lv, setLv] = useState({ stage_id: '', subject_id: '', name: '', grade_id: '' })
  const [gr, setGr] = useState({ stage_id: '', name: '' })
  if (!d) return <Notice err={err} />

  const stage = (id) => d.stages.find((x) => x.id === id)?.name ?? '—'
  const subject = (id) => d.subjects.find((x) => x.id === id)?.name ?? '—'
  const levelOf = (id) => d.levels.find((x) => x.id === id)
  const gradeName = (id) => d.grades.find((x) => x.id === id)?.name
  const levelLabel = (l) => (l ? `${subject(l.subject_id)} • ${l.name} (${gradeName(l.grade_id) ?? stage(l.stage_id)})` : '—')
  const teacher = (id) => d.staff.find((x) => x.id === id)?.full_name ?? '—'
  const cnt = (arr, id) => arr.filter((x) => x.group_id === id).length

  async function act(fn, reset) {
    setMsg('')
    try { await fn(); reset?.(); await load() } catch (e) { setMsg(e.message) }
  }

  const saveGroup = (e) => {
    e.preventDefault()
    const row = {
      level_id: gf.level_id, name: gf.name.trim(), schedule: gf.schedule?.trim() || null,
      monthly_price: gf.monthly_price === '' || gf.monthly_price == null ? null : Number(gf.monthly_price),
      capacity: gf.capacity === '' || gf.capacity == null ? null : Number(gf.capacity),
      teacher_id: gf.teacher_id || null, active: gf.active,
    }
    act(async () => {
      if (gf.id) { await q(supabase.from('groups').update(row).eq('id', gf.id)); logAct('group_updated', 'groups', gf.id, { name: row.name }) }
      else { const [g] = await q(supabase.from('groups').insert(row).select('id')); logAct('group_created', 'groups', g.id, { name: row.name }) }
      setGf(null)
    })
  }

  const delGroup = (g) => {
    const s = cnt(d.enr, g.id), n = cnt(d.sess, g.id), a = cnt(d.asg, g.id)
    if (!window.confirm(`حذف مجموعة "${g.name}" نهائيًا؟\nهيتحذف معاها: ${num(n)} حصة و${num(a)} واجب (بتسليماته)، وهيتشال ${num(s)} طالب من عضويتها.\nلو عايز بس توقفها اضغط "إيقاف" بدل الحذف.`)) return
    act(async () => { await q(supabase.from('groups').delete().eq('id', g.id)); logAct('group_deleted', 'groups', g.id, { name: g.name }) })
  }

  const delStage = (s) => {
    const ls = d.levels.filter((l) => l.stage_id === s.id)
    const gs = d.groups.filter((g) => ls.some((l) => l.id === g.level_id))
    if (!window.confirm(`حذف المرحلة "${s.name}"؟ هيتحذف معاها ${num(ls.length)} مستوى و${num(gs.length)} مجموعة وكل حصصها وواجباتها.`)) return
    act(async () => { await q(supabase.from('stages').delete().eq('id', s.id)); logAct('stage_deleted', 'stages', s.id, { name: s.name }) })
  }
  const delSubject = (s) => {
    const ls = d.levels.filter((l) => l.subject_id === s.id)
    const gs = d.groups.filter((g) => ls.some((l) => l.id === g.level_id))
    if (!window.confirm(`حذف المادة "${s.name}"؟ هيتحذف معاها ${num(ls.length)} مستوى و${num(gs.length)} مجموعة وكل حصصها وواجباتها.`)) return
    act(async () => { await q(supabase.from('subjects').delete().eq('id', s.id)); logAct('subject_deleted', 'subjects', s.id, { name: s.name }) })
  }
  const delLevel = (l) => {
    const gs = d.groups.filter((g) => g.level_id === l.id)
    if (!window.confirm(`حذف المستوى "${l.name}"؟ هيتحذف معاه ${num(gs.length)} مجموعة وكل حصصها وواجباتها.`)) return
    act(async () => { await q(supabase.from('levels').delete().eq('id', l.id)); logAct('level_deleted', 'levels', l.id, { name: l.name }) })
  }

  return (
    <>
      <Notice err={msg} />
      <section className="card">
        <div className="card-head">
          <Tabs flat id="content-tab" label="المحتوى" value={tab} onChange={setTab} items={[['groups', `المجموعات (${num(d.groups.length)})`], ['structure', 'المراحل والصفوف والمواد']]} />
          {tab === 'groups' && <button className="btn-primary" onClick={() => setGf({ ...EMPTY_G })}>+ مجموعة جديدة</button>}
        </div>

        {tab === 'groups' && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>المجموعة</th><th>المادة والمستوى</th><th>المدرس</th><th>الميعاد</th><th>السعر</th><th>الطلبة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
              <tbody>
                {d.groups.map((g) => (
                  <tr key={g.id} className={g.active ? '' : 'off'}>
                    <td className="strong">{g.name}</td>
                    <td>{levelLabel(levelOf(g.level_id))}</td>
                    <td>{g.teacher_id ? teacher(g.teacher_id) : <span className="muted">غير محدد</span>}</td>
                    <td>{g.schedule}</td>
                    <td>{g.monthly_price == null ? <span className="muted">لسه</span> : num(g.monthly_price)}</td>
                    <td>{num(cnt(d.enr, g.id))}{g.capacity ? ` / ${num(g.capacity)}` : ''}</td>
                    <td><span className={`pill ${g.active ? 'green' : 'red'}`}>{g.active ? 'شغالة' : 'موقوفة'}</span></td>
                    <td>
                      <div className="inline">
                        <button className="btn-outline" onClick={() => setGf({ ...g, monthly_price: g.monthly_price ?? '', capacity: g.capacity ?? '', teacher_id: g.teacher_id ?? '', schedule: g.schedule ?? '' })}>تعديل</button>
                        <button className="btn-link" onClick={() => act(async () => { await q(supabase.from('groups').update({ active: !g.active }).eq('id', g.id)); logAct(g.active ? 'group_paused' : 'group_resumed', 'groups', g.id, { name: g.name }) })}>{g.active ? 'إيقاف' : 'تشغيل'}</button>
                        <button className="btn-danger" onClick={() => delGroup(g)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {d.groups.length === 0 && <tr><td colSpan="8" className="muted">مفيش مجموعات لسه. ابدأ من تبويب "المراحل والمواد والمستويات" لو لسه ما ضفتش مستويات.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'structure' && (
          <div className="stack">
            <h3 className="sub-h">المراحل</h3>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>الاسم</th><th>الترتيب</th><th>المستويات</th><th></th></tr></thead>
                <tbody>
                  {d.stages.map((s) => (
                    <tr key={s.id}>
                      <td><Editable label="اسم المرحلة" value={s.name} onSave={(v) => v.trim() && act(() => q(supabase.from('stages').update({ name: v.trim() }).eq('id', s.id)))} /></td>
                      <td><Editable label="ترتيب المرحلة" type="number" width={80} value={s.sort ?? 0} onSave={(v) => act(() => q(supabase.from('stages').update({ sort: Number(v) }).eq('id', s.id)))} /></td>
                      <td>{num(d.levels.filter((l) => l.stage_id === s.id).length)}</td>
                      <td><button className="btn-danger" onClick={() => delStage(s)}>حذف</button></td>
                    </tr>
                  ))}
                  {d.stages.length === 0 && <tr><td colSpan="4" className="muted">مفيش مراحل لسه (مثال: ابتدائي، إعدادي، ثانوي، تأهيل).</td></tr>}
                </tbody>
              </table>
            </div>
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(async () => { await q(supabase.from('stages').insert({ center_id: d.center.id, name: st.trim(), sort: d.stages.length + 1 })); logAct('stage_created', 'stages', null, { name: st.trim() }) }, () => setSt('')) }}>
              <label>مرحلة جديدة<input className="fld" required value={st} onChange={(e) => setSt(e.target.value)} /></label>
              <button className="btn-outline">إضافة مرحلة</button>
            </form>

            <h3 className="sub-h">الصفوف الدراسية</h3>
            <p className="muted small">الطالب بيختار صفه، وبيشوف المدرسين والمجموعات اللي مستواها مربوط بالصف ده (أو المستويات المفتوحة لكل الصفوف زي اللغات).</p>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>المرحلة</th><th>الصف</th><th>الترتيب</th><th>المستويات المربوطة</th><th></th></tr></thead>
                <tbody>
                  {d.stages.flatMap((s) => d.grades.filter((g) => g.stage_id === s.id).map((g) => (
                    <tr key={g.id}>
                      <td>{s.name}</td>
                      <td><Editable label="اسم الصف" value={g.name} onSave={(v) => v.trim() && act(() => q(supabase.from('grades').update({ name: v.trim() }).eq('id', g.id)))} /></td>
                      <td><Editable label="ترتيب الصف" type="number" width={70} value={g.sort} onSave={(v) => act(() => q(supabase.from('grades').update({ sort: Number(v) }).eq('id', g.id)))} /></td>
                      <td>{num(d.levels.filter((l) => l.grade_id === g.id).length)}</td>
                      <td><button className="btn-danger" onClick={() => window.confirm(`حذف "${g.name}"؟ المستويات المربوطة بيه هتبقى مفتوحة لكل الصفوف.`) && act(() => q(supabase.from('grades').delete().eq('id', g.id)))}>حذف</button></td>
                    </tr>
                  )))}
                  {d.grades.length === 0 && <tr><td colSpan="5" className="muted">مفيش صفوف لسه.</td></tr>}
                </tbody>
              </table>
            </div>
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => q(supabase.from('grades').insert({ stage_id: gr.stage_id, name: gr.name.trim(), sort: d.grades.filter((x) => x.stage_id === gr.stage_id).length + 1 })), () => setGr({ stage_id: gr.stage_id, name: '' })) }}>
              <label>المرحلة<select className="fld" required value={gr.stage_id} onChange={(e) => setGr({ ...gr, stage_id: e.target.value })}><option value="">اختار...</option>{d.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>صف جديد<input className="fld" required placeholder="مثال: الصف الرابع الابتدائي" value={gr.name} onChange={(e) => setGr({ ...gr, name: e.target.value })} /></label>
              <button className="btn-outline">إضافة صف</button>
            </form>

            <h3 className="sub-h">المواد</h3>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>الاسم</th><th>لغة؟</th><th>المستويات</th><th></th></tr></thead>
                <tbody>
                  {d.subjects.map((s) => (
                    <tr key={s.id}>
                      <td><Editable label="اسم المادة" value={s.name} onSave={(v) => v.trim() && act(() => q(supabase.from('subjects').update({ name: v.trim() }).eq('id', s.id)))} /></td>
                      <td><label className="check"><input type="checkbox" checked={!!s.is_language} onChange={(e) => act(() => q(supabase.from('subjects').update({ is_language: e.target.checked }).eq('id', s.id)))} /> لغة</label></td>
                      <td>{num(d.levels.filter((l) => l.subject_id === s.id).length)}</td>
                      <td><button className="btn-danger" onClick={() => delSubject(s)}>حذف</button></td>
                    </tr>
                  ))}
                  {d.subjects.length === 0 && <tr><td colSpan="4" className="muted">مفيش مواد لسه.</td></tr>}
                </tbody>
              </table>
            </div>
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(async () => { await q(supabase.from('subjects').insert({ center_id: d.center.id, name: sj.name.trim(), is_language: sj.is_language })); logAct('subject_created', 'subjects', null, { name: sj.name.trim() }) }, () => setSj({ name: '', is_language: false })) }}>
              <label>مادة جديدة<input className="fld" required value={sj.name} onChange={(e) => setSj({ ...sj, name: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={sj.is_language} onChange={(e) => setSj({ ...sj, is_language: e.target.checked })} /> لغة</label>
              <button className="btn-outline">إضافة مادة</button>
            </form>

            <h3 className="sub-h">المستويات</h3>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>المرحلة</th><th>المادة</th><th>اسم المستوى</th><th>الصف</th><th>المجموعات</th><th></th></tr></thead>
                <tbody>
                  {d.levels.map((l) => (
                    <tr key={l.id}>
                      <td>{stage(l.stage_id)}</td>
                      <td>{subject(l.subject_id)}</td>
                      <td><Editable label="اسم المستوى" value={l.name} onSave={(v) => v.trim() && act(() => q(supabase.from('levels').update({ name: v.trim() }).eq('id', l.id)))} /></td>
                      <td>
                        <select className="fld" aria-label="الصف" value={l.grade_id ?? ''} onChange={(e) => act(() => q(supabase.from('levels').update({ grade_id: e.target.value || null }).eq('id', l.id)))}>
                          <option value="">مفتوح لكل الصفوف</option>
                          {d.grades.filter((g) => g.stage_id === l.stage_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td>{num(d.groups.filter((g) => g.level_id === l.id).length)}</td>
                      <td><button className="btn-danger" onClick={() => delLevel(l)}>حذف</button></td>
                    </tr>
                  ))}
                  {d.levels.length === 0 && <tr><td colSpan="6" className="muted">مفيش مستويات لسه.</td></tr>}
                </tbody>
              </table>
            </div>
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(async () => { await q(supabase.from('levels').insert({ ...lv, name: lv.name.trim(), grade_id: lv.grade_id || null })); logAct('level_created', 'levels', null, { name: lv.name.trim() }) }, () => setLv({ stage_id: '', subject_id: '', name: '', grade_id: '' })) }}>
              <label>المرحلة<select className="fld" required value={lv.stage_id} onChange={(e) => setLv({ ...lv, stage_id: e.target.value })}><option value="">اختار...</option>{d.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>المادة<select className="fld" required value={lv.subject_id} onChange={(e) => setLv({ ...lv, subject_id: e.target.value })}><option value="">اختار...</option>{d.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>الصف<select className="fld" value={lv.grade_id} onChange={(e) => setLv({ ...lv, grade_id: e.target.value })}><option value="">مفتوح لكل الصفوف</option>{d.grades.filter((g) => g.stage_id === lv.stage_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
              <label>اسم المستوى<input className="fld" required placeholder="مثال: رياضيات تالتة إعدادي، أو A1" value={lv.name} onChange={(e) => setLv({ ...lv, name: e.target.value })} /></label>
              <button className="btn-outline">إضافة مستوى</button>
            </form>
          </div>
        )}
      </section>

      <AnimatePresence>
        {gf && (
          <Modal key="g" title={gf.id ? 'تعديل مجموعة' : 'مجموعة جديدة'} onClose={() => setGf(null)}>
            <form className="form" onSubmit={saveGroup}>
              <label>المستوى<select className="fld" required value={gf.level_id} onChange={(e) => setGf({ ...gf, level_id: e.target.value })}><option value="">اختار...</option>{d.levels.map((l) => <option key={l.id} value={l.id}>{levelLabel(l)}</option>)}</select></label>
              <label>اسم المجموعة<input className="fld" required value={gf.name} onChange={(e) => setGf({ ...gf, name: e.target.value })} /></label>
              <label>الميعاد<input className="fld" placeholder="مثال: السبت والثلاثاء ٦ م" value={gf.schedule} onChange={(e) => setGf({ ...gf, schedule: e.target.value })} /></label>
              <label>السعر الشهري<input className="fld" type="number" min="0" value={gf.monthly_price} onChange={(e) => setGf({ ...gf, monthly_price: e.target.value })} /></label>
              <label>السعة (عدد الطلبة)<input className="fld" type="number" min="1" value={gf.capacity} onChange={(e) => setGf({ ...gf, capacity: e.target.value })} /></label>
              <label>المدرس<select className="fld" value={gf.teacher_id} onChange={(e) => setGf({ ...gf, teacher_id: e.target.value })}><option value="">غير محدد</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
              <label className="check"><input type="checkbox" checked={gf.active} onChange={(e) => setGf({ ...gf, active: e.target.checked })} /> المجموعة شغالة</label>
              <Notice err={msg} />
              <button className="btn-primary">{gf.id ? 'حفظ' : 'إضافة المجموعة'}</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}
