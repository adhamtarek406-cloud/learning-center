import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'

const num = (n) => Number(n ?? 0).toLocaleString('ar-EG')
const fmtDT = (iso) => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const fmtD = (iso) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' }).format(new Date(iso))
const STATUS = { active: 'ساري', paused: 'متوقف', expired: 'منتهي', cancelled: 'ملغي' }

export default function Parent() {
  const [kids, setKids] = useState(null)
  const [sel, setSel] = useState(null)
  const [rep, setRep] = useState(null)
  const [err, setErr] = useState('')

  async function loadKids() {
    const { data, error } = await supabase.rpc('my_children')
    if (error) return setErr(error.message)
    setKids(data)
    if (data.length && !sel) setSel(data[0].id)
  }
  useEffect(() => { loadKids() }, []) // eslint-disable-line

  useEffect(() => {
    if (!sel) return
    setRep(null)
    supabase.rpc('parent_report', { p_student: sel }).then(({ data, error }) => (error ? setErr(error.message) : setRep(data)))
  }, [sel])

  async function toggleHidden(kid) {
    const { error } = await supabase.rpc('set_child_hidden', { p_student: kid.id, p_hidden: !kid.hidden })
    if (error) setErr(error.message)
    else loadKids()
  }

  const kid = kids?.find((k) => k.id === sel)
  const w = rep?.week

  return (
    <div className="admin">
      <header className="admin-top">
        <div className="brand"><Logo size={40} /><div>اسم السنتر<small>ولي الأمر</small></div></div>
        <div className="inline">
          {rep && <button className="btn-link" onClick={() => window.print()}>طباعة التقرير</button>}
          <button className="btn-link" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
        </div>
      </header>
      <main className="admin-main">
        {err && <p className="msg" role="alert">حصلت مشكلة: {err}</p>}
        {!kids ? (
          <p className="muted">جاري التحميل...</p>
        ) : kids.length === 0 ? (
          <section className="card"><h2>مفيش طالب مربوط بحسابك</h2><p className="muted">اطلب من إدارة السنتر تربط حسابك بحساب ابنك أو بنتك.</p></section>
        ) : (
          <>
            {kids.length > 1 && (
              <nav className="tabs" aria-label="الأبناء" style={{ padding: 0 }}>
                {kids.map((k) => <button key={k.id} className={sel === k.id ? 'tab active' : 'tab'} onClick={() => setSel(k.id)}>{k.full_name.split(' ')[0]}</button>)}
              </nav>
            )}
            {!rep ? <p className="muted">جاري تحميل التقرير...</p> : (
              <>
                <section className="hero" aria-label="ملخص">
                  <div>
                    <span className="chip">تقرير آخر ٧ أيام</span>
                    <div className="hero-title">{rep.name}</div>
                    <div className="hero-sub">
                      {rep.next_session ? `الحصة الجاية: ${rep.next_session.subject} · ${rep.next_session.level} — ${fmtDT(rep.next_session.starts_at)}` : 'مفيش حصة قادمة متسجلة'}
                    </div>
                  </div>
                </section>

                <div className="stats">
                  <div className="stat"><b>{num(w.attended)} / {num(w.sessions)}</b><span>حصص حضرها</span></div>
                  <div className="stat"><b>{num(w.submitted)} / {num(w.assigned)}</b><span>واجبات اتسلمت من الجديدة</span></div>
                  <div className="stat"><b>{w.avg_score == null ? '—' : `${num(w.avg_score)}٪`}</b><span>متوسط الدرجات</span></div>
                  <div className="stat"><b>{num(w.points)}</b><span>نقاط الألعاب</span></div>
                </div>
                {rep.absences_30d > 0 && <p className="msg">غاب {num(rep.absences_30d)} مرة في آخر ٣٠ يوم.</p>}

                <div className="grid">
                  <section className="card">
                    <h2>واجبات لسه ماتسلمتش</h2>
                    {rep.missing.length ? rep.missing.map((m, i) => (
                      <div className="row" key={i}><div className="grow strong">{m.title}</div><span className="muted small">{m.due_at ? `لحد ${fmtD(m.due_at)}` : ''}</span></div>
                    )) : <p className="muted">كل الواجبات اتسلمت.</p>}
                  </section>
                  <section className="card">
                    <h2>آخر النتايج</h2>
                    {rep.recent_results.length ? rep.recent_results.map((r, i) => (
                      <div className="row" key={i}>
                        <div className="grow strong">{r.title}</div>
                        <span className={`pill ${r.graded ? 'green' : ''}`}>{r.score == null ? 'بانتظار التصحيح' : `${num(r.score)}٪${r.graded ? '' : ' (مبدئي)'}`}</span>
                      </div>
                    )) : <p className="muted">لسه مفيش نتايج.</p>}
                  </section>
                  <section className="card">
                    <h2>الاشتراك</h2>
                    {rep.subscription ? (
                      <div className="row"><div className="grow"><div className="strong">{rep.subscription.plan}</div>{rep.subscription.renews_on && <div className="muted small">يتجدد في {fmtD(rep.subscription.renews_on)}</div>}</div><span className={`pill ${rep.subscription.status === 'active' ? 'green' : ''}`}>{STATUS[rep.subscription.status]}</span></div>
                    ) : <p className="muted">مفيش اشتراك متسجل.</p>}
                  </section>
                  <section className="card">
                    <h2>الخصوصية</h2>
                    <p className="muted">اسم {kid?.full_name.split(' ')[0]} بيظهر (الاسم الأول بس) في ترتيب الألعاب مع باقي الطلبة. تقدر تخفيه.</p>
                    <button className="btn-outline" onClick={() => toggleHidden(kid)}>{kid?.hidden ? 'إظهاره في الترتيب' : 'إخفاؤه من الترتيب'}</button>
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
