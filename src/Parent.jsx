import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'
import { motion } from 'framer-motion'
import { Tabs, container, item } from './ui.jsx'
import { Thread } from './Staff.jsx'

const num = (n) => Number(n ?? 0).toLocaleString('ar-EG')
const fmtDT = (iso) => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const fmtD = (iso) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' }).format(new Date(iso))
const STATUS = { active: 'ساري', paused: 'متوقف', expired: 'منتهي', cancelled: 'ملغي' }
const PAY = { pending: 'مستني الدفع', paid: 'مدفوع', failed: 'فشل', refunded: 'مسترد' }

export default function Parent({ session }) {
  const uid = session.user.id
  const [kids, setKids] = useState(null)
  const [sel, setSel] = useState(null)
  const [rep, setRep] = useState(null)
  const [det, setDet] = useState(null)
  const [anns, setAnns] = useState([])
  const [unread, setUnread] = useState({})
  const [tab, setTab] = useState('report')
  const [err, setErr] = useState('')

  async function loadKids() {
    const { data, error } = await supabase.rpc('my_children')
    if (error) return setErr(error.message)
    setKids(data)
    if (data.length && !sel) setSel(data[0].id)
  }
  useEffect(() => {
    loadKids()
    supabase.from('announcements').select('id, title, body, author_name, created_at').order('created_at', { ascending: false }).limit(30).then(({ data }) => setAnns(data ?? []))
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!sel) return
    setRep(null); setDet(null)
    supabase.rpc('parent_report', { p_student: sel }).then(({ data, error }) => (error ? setErr(error.message) : setRep(data)))
    supabase.rpc('parent_detail', { p_student: sel }).then(({ data, error }) => (error ? setErr(error.message) : setDet(data)))
  }, [sel])

  useEffect(() => {
    supabase.from('messages').select('student_id').eq('parent_id', uid).eq('from_parent', false).eq('read', false).then(({ data }) => {
      const m = {}
      ;(data ?? []).forEach((r) => { m[r.student_id] = (m[r.student_id] ?? 0) + 1 })
      setUnread(m)
    })
  }, [uid, tab, sel])

  async function toggleHidden(kid) {
    const { error } = await supabase.rpc('set_child_hidden', { p_student: kid.id, p_hidden: !kid.hidden })
    if (error) setErr(error.message)
    else loadKids()
  }

  const kid = kids?.find((k) => k.id === sel)
  const first = kid?.full_name.split(' ')[0]
  const w = rep?.week
  const sections = [['report', 'التقرير'], ['att', 'الحضور'], ['grades', 'الدرجات'], ['subs', 'الاشتراك والمدفوعات'], ['news', 'الإعلانات'], ['chat', `رسايل المدرس${unread[sel] ? ` (${num(unread[sel])})` : ''}`]]

  return (
    <div className="admin">
      <header className="admin-top">
        <div className="brand"><Logo size={40} /><div>اسم السنتر<small>ولي الأمر</small></div></div>
        <div className="inline">
          {rep && tab === 'report' && <button className="btn-link" onClick={() => window.print()}>طباعة التقرير</button>}
          <button className="btn-link" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
        </div>
      </header>
      {kids && kids.length > 0 && <Tabs items={sections} value={tab} onChange={setTab} label="أقسام ولي الأمر" id="parent-tab" />}
      <main className="admin-main">
        {err && <p className="msg" role="alert">حصلت مشكلة: {err}</p>}
        {!kids ? (
          <p className="muted">جاري التحميل...</p>
        ) : kids.length === 0 ? (
          <section className="card"><h2>مفيش طالب مربوط بحسابك</h2><p className="muted">اطلب من إدارة السنتر تربط حسابك بحساب ابنك أو بنتك.</p></section>
        ) : (
          <>
            {kids.length > 1 && <Tabs flat items={kids.map((k) => [k.id, k.full_name.split(' ')[0]])} value={sel} onChange={setSel} label="الأبناء" id="kid-tab" />}

            {tab === 'report' && (!rep ? <p className="muted">جاري تحميل التقرير...</p> : (
              <>
                <motion.section className="hero" aria-label="ملخص" variants={item} initial="hidden" animate="visible" key={`h${sel}`}>
                  <div>
                    <span className="chip">تقرير آخر ٧ أيام</span>
                    <div className="hero-title">{rep.name}</div>
                    <div className="hero-sub">
                      {rep.next_session ? `الحصة الجاية: ${rep.next_session.subject} · ${rep.next_session.level} — ${fmtDT(rep.next_session.starts_at)}` : 'مفيش حصة قادمة متسجلة'}
                    </div>
                  </div>
                  {det?.streak?.current > 0 && <span className="chip">{num(det.streak.current)} أيام نشاط ورا بعض</span>}
                </motion.section>

                <motion.div className="stats" variants={container} initial="hidden" animate="visible" key={`s${sel}`}>
                  <motion.div variants={item} className="stat"><b>{num(w.attended)} / {num(w.sessions)}</b><span>حصص حضرها</span></motion.div>
                  <motion.div variants={item} className="stat"><b>{num(w.submitted)} / {num(w.assigned)}</b><span>واجبات اتسلمت من الجديدة</span></motion.div>
                  <motion.div variants={item} className="stat"><b>{w.avg_score == null ? '—' : `${num(w.avg_score)}٪`}</b><span>متوسط الدرجات</span></motion.div>
                  <motion.div variants={item} className="stat"><b>{num(w.points)}</b><span>نقاط الألعاب</span></motion.div>
                </motion.div>
                {rep.absences_30d > 0 && <p className="msg">غاب {num(rep.absences_30d)} مرة في آخر ٣٠ يوم.</p>}

                <motion.div className="grid" variants={container} initial="hidden" animate="visible" key={`g${sel}`}>
                  <motion.section variants={item} className="card">
                    <h2>واجبات لسه ماتسلمتش</h2>
                    {rep.missing.length ? rep.missing.map((m, i) => (
                      <div className="row" key={i}><div className="grow strong">{m.title}</div><span className="muted small">{m.due_at ? `لحد ${fmtD(m.due_at)}` : ''}</span></div>
                    )) : <p className="muted">كل الواجبات اتسلمت.</p>}
                  </motion.section>
                  <motion.section variants={item} className="card">
                    <h2>آخر النتايج</h2>
                    {rep.recent_results.length ? rep.recent_results.map((r, i) => (
                      <div className="row" key={i}>
                        <div className="grow strong">{r.title}</div>
                        <span className={`pill ${r.graded ? 'green' : ''}`}>{r.score == null ? 'بانتظار التصحيح' : `${num(r.score)}٪${r.graded ? '' : ' (مبدئي)'}`}</span>
                      </div>
                    )) : <p className="muted">لسه مفيش نتايج.</p>}
                  </motion.section>
                  <motion.section variants={item} className="card">
                    <h2>آخر الإعلانات</h2>
                    {anns.length ? anns.slice(0, 3).map((a) => (
                      <div className="row" key={a.id}><div className="grow"><div className="strong">{a.title}</div>{a.body && <div className="muted small clamp2">{a.body}</div>}</div><span className="muted small">{fmtD(a.created_at)}</span></div>
                    )) : <p className="muted">مفيش إعلانات.</p>}
                  </motion.section>
                  <motion.section variants={item} className="card">
                    <h2>الخصوصية</h2>
                    <p className="muted">اسم {first} بيظهر (الاسم الأول بس) في ترتيب الألعاب مع باقي الطلبة. تقدر تخفيه.</p>
                    <button className="btn-outline" onClick={() => toggleHidden(kid)}>{kid?.hidden ? 'إظهاره في الترتيب' : 'إخفاؤه من الترتيب'}</button>
                  </motion.section>
                </motion.div>
              </>
            ))}

            {tab === 'att' && (
              <section className="card">
                <h2>حضور {first} (آخر ٩٠ يوم)</h2>
                {!det ? <p className="muted">جاري التحميل...</p> : det.attendance.length ? det.attendance.map((a, i) => (
                  <div className="row" key={i}>
                    <div className="grow"><div className="strong">{fmtDT(a.starts_at)}</div><div className="muted small">{a.subject} · {a.grp}{a.topic ? ` · ${a.topic}` : ''}</div></div>
                    <span className={`pill ${a.present === true ? 'green' : a.present === false ? 'red' : ''}`}>{a.present === true ? 'حاضر' : a.present === false ? 'غايب' : 'لسه ما اتسجلش'}</span>
                  </div>
                )) : <p className="muted">لسه مفيش حصص فاتت.</p>}
              </section>
            )}

            {tab === 'grades' && (
              <section className="card">
                <h2>درجات {first}</h2>
                {!det ? <p className="muted">جاري التحميل...</p> : det.grades.length ? det.grades.map((g, i) => (
                  <div className="row" key={i}>
                    <div className="grow">
                      <div className="strong">{g.title} <span className="muted small">· {g.kind === 'quiz' ? 'كويز' : 'واجب'}</span></div>
                      <div className="muted small">اتسلّم {fmtD(g.submitted_at)}</div>
                      {g.feedback && <div className="feedback small"><b>تعليق المدرس:</b> {g.feedback}</div>}
                    </div>
                    <span className={`pill ${g.final_score != null ? 'green' : ''}`}>{g.final_score != null ? `${num(g.final_score)}٪` : g.auto_score != null ? `${num(g.auto_score)}٪ (مبدئي)` : 'بانتظار التصحيح'}</span>
                  </div>
                )) : <p className="muted">لسه ماسلمش حاجة.</p>}
              </section>
            )}

            {tab === 'subs' && (
              <section className="card">
                <h2>الاشتراك والمدفوعات</h2>
                {!det ? <p className="muted">جاري التحميل...</p> : det.subscriptions.length ? det.subscriptions.map((s) => (
                  <div className="qbox" key={s.id}>
                    <div className="card-head">
                      <div><span className="strong">{s.plan}</span><div className="muted small">بدأ {fmtD(s.starts_on)}{s.renews_on ? ` · يتجدد ${fmtD(s.renews_on)}` : ''}</div></div>
                      <span className={`pill ${s.status === 'active' ? 'green' : ''}`}>{STATUS[s.status] ?? s.status}</span>
                    </div>
                    {s.payments.length ? s.payments.map((p, i) => (
                      <div className="row" key={i}><div className="grow">{num(p.amount)} ج.م</div><span className="muted small">{fmtD(p.paid_at ?? p.created_at)}</span><span className={`pill ${p.status === 'paid' ? 'green' : ''}`}>{PAY[p.status] ?? p.status}</span></div>
                    )) : <p className="muted small">مفيش مدفوعات متسجلة للاشتراك ده.</p>}
                  </div>
                )) : <p className="muted">مفيش اشتراك متسجل. كلّم إدارة السنتر.</p>}
                <p className="muted small">للتجديد أو أي استفسار عن الدفع كلّم إدارة السنتر.</p>
              </section>
            )}

            {tab === 'news' && (
              <section className="card">
                <h2>الإعلانات</h2>
                {anns.length ? anns.map((a) => (
                  <div className="row" key={a.id}>
                    <div className="grow"><div className="strong">{a.title}</div>{a.body && <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>}<div className="muted small">{a.author_name ?? ''} · {fmtDT(a.created_at)}</div></div>
                  </div>
                )) : <p className="muted">مفيش إعلانات.</p>}
              </section>
            )}

            {tab === 'chat' && sel && (
              <Thread key={sel} uid={uid} staff={false} studentId={sel} parentId={uid} title={`رسايلك مع المدرسين بخصوص ${first}`} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
