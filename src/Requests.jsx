import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from './supabase.js'
import { Tabs } from './ui.jsx'
import { fmtDT, num, q, useLoad, Notice, Modal } from './adminkit.jsx'
import { priceOf } from './Teachers.jsx'
import { waLink } from './Staff.jsx'

const ST = { pending: ['مستني', ''], approved: ['اتقبل', 'green'], rejected: ['اترفض', 'red'], cancelled: ['اتلغى', ''] }

/** طلبات الاشتراك — المدير بيوافق ويسجّل الدفع، والمدرس بيتابع طلبات مجموعاته */
export default function Requests({ role }) {
  const [mode, setMode] = useState('pending')
  const [d, load, err] = useLoad(async () => {
    let rq = supabase.from('enroll_requests').select('id, status, note, admin_note, created_at, decided_at, student_id, group_id, plan_id, profiles:student_id(full_name, phone), requester:requested_by(full_name, role, phone), groups(name, monthly_price, capacity, teacher_id, levels(name, subjects(name))), plans(name, kind, price, duration_days)').order('created_at', { ascending: mode === 'pending' }).limit(150)
    rq = mode === 'pending' ? rq.eq('status', 'pending') : rq.neq('status', 'pending')
    const [rows, enr, teachers] = await Promise.all([
      q(rq),
      q(supabase.from('enrollments').select('group_id')),
      q(supabase.from('profiles').select('id, full_name').in('role', ['manager', 'teacher'])),
    ])
    return { rows, enr, teachers }
  }, [mode])
  const [dec, setDec] = useState(null)
  const [msg, setMsg] = useState('')
  if (!d) return <Notice err={err} />
  const tname = (id) => d.teachers.find((t) => t.id === id)?.full_name ?? '—'
  const seats = (g, gid) => (g?.capacity != null ? g.capacity - d.enr.filter((e) => e.group_id === gid).length : null)

  async function decide(e) {
    e.preventDefault(); setMsg('')
    const amount = dec.free ? 0 : Number(dec.amount)
    if (dec.approve && !dec.free && !(amount > 0)) { setMsg('اكتب المبلغ اللي اتدفع، أو علّم على "مجاني / من غير دفع".'); return }
    const { error } = await supabase.rpc('decide_request', { p_id: dec.r.id, p_approve: dec.approve, p_amount: dec.approve ? amount : null, p_admin_note: dec.note })
    if (error) setMsg(error.message); else { setDec(null); load() }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>طلبات الاشتراك</h2>
        <Tabs flat id="req-tab" label="الطلبات" value={mode} onChange={setMode} items={[['pending', `مستنية${mode === 'pending' ? ` (${num(d.rows.length)})` : ''}`], ['done', 'اتقرر فيها']]} />
      </div>
      <Notice err={msg} />
      {d.rows.map((r) => {
        const g = r.groups
        const left = seats(g, r.group_id)
        const price = r.plans ? priceOf(r.plans, { price: g?.monthly_price }) : g?.monthly_price
        const byParent = r.requester?.role === 'parent'
        const phone = r.requester?.phone || r.profiles?.phone
        return (
          <div className="qbox" key={r.id}>
            <div className="card-head">
              <div>
                <span className="strong">{r.profiles?.full_name}</span>
                {byParent && <span className="muted small"> • الطلب من ولي الأمر {r.requester.full_name}</span>}
                <div className="muted small">{fmtDT(r.created_at)}</div>
              </div>
              <span className={`pill ${ST[r.status][1]}`}>{ST[r.status][0]}</span>
            </div>
            <div className="small">
              <b>{g?.levels?.subjects?.name} • {g?.levels?.name} • {g?.name}</b> مع {tname(g?.teacher_id)}
              {left != null && <span className={`pill ${left <= 0 ? 'red' : 'green'}`} style={{ marginInlineStart: 8 }}>{left <= 0 ? 'المجموعة كاملة' : `فاضل ${num(left)} مكان`}</span>}
            </div>
            <div className="small">الاشتراك: {r.plans ? `${r.plans.name} • ${num(price)} ج.م` : 'مش محدد'}</div>
            {r.note && <div className="feedback small">ملاحظة: {r.note}</div>}
            {r.admin_note && <div className="muted small">ملاحظة الإدارة: {r.admin_note}</div>}
            {r.status === 'pending' && role === 'manager' && (
              <div className="inline">
                <button className="btn-primary" onClick={() => setDec({ r, approve: true, amount: price ?? '', note: '', free: false })}>موافقة وتسجيل الدفع</button>
                <button className="btn-danger" onClick={() => setDec({ r, approve: false, amount: '', note: '' })}>رفض</button>
                {phone && <a className="btn-link" href={waLink(phone, `أهلاً، بخصوص طلب اشتراك ${r.profiles?.full_name} في ${g?.levels?.subjects?.name} ${g?.levels?.name} (${g?.name})${price ? `، المطلوب ${num(price)} ج.م` : ''}.`)} target="_blank" rel="noreferrer">واتساب</a>}
              </div>
            )}
          </div>
        )
      })}
      {d.rows.length === 0 && <p className="muted">{mode === 'pending' ? 'مفيش طلبات مستنية.' : 'مفيش طلبات سابقة.'}</p>}
      {role !== 'manager' && <p className="muted small">الموافقة وتسجيل الدفع من الإدارة بس.</p>}

      <AnimatePresence>
        {dec && (
          <Modal key="dec" title={dec.approve ? 'موافقة على الاشتراك' : 'رفض الطلب'} onClose={() => setDec(null)}>
            <form className="form" onSubmit={decide}>
              <p className="strong">{dec.r.profiles?.full_name} • {dec.r.groups?.name}</p>
              {dec.approve && (
                <>
                  <label>المبلغ اللي اتدفع (ج.م)<input className="fld" type="number" min="1" step="any" required={!dec.free} disabled={dec.free} value={dec.free ? '' : dec.amount} onChange={(e) => setDec({ ...dec, amount: e.target.value })} /></label>
                  <label className="check"><input type="checkbox" checked={!!dec.free} onChange={(e) => setDec({ ...dec, free: e.target.checked })} /> مجاني / من غير دفع (منحة أو تجربة)</label>
                  <p className="muted small">الطالب هيتضاف للمجموعة{dec.r.plans ? `، واشتراك "${dec.r.plans.name}" هيبدأ النهاردة` : ''}{dec.free ? '، ومفيش دفعة هتتسجل.' : '، والدفعة هتتسجل في الإيراد.'}</p>
                </>
              )}
              <label>ملاحظة تظهر للطالب (اختياري)<input className="fld" value={dec.note} placeholder={dec.approve ? 'مثال: أهلاً بيك في المجموعة' : 'مثال: المجموعة كاملة، جرّب مجموعة الأحد'} onChange={(e) => setDec({ ...dec, note: e.target.value })} /></label>
              <Notice err={msg} />
              <button className={dec.approve ? 'btn-primary' : 'btn-danger'}>{dec.approve ? 'تأكيد الموافقة' : 'تأكيد الرفض'}</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </section>
  )
}
