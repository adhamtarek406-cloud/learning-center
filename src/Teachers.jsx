import { artUrl } from './brandArt.js'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { container, item } from './ui.jsx'
import { Modal } from './adminkit.jsx'

const fmt = (n) => Number(n ?? 0).toLocaleString('ar-EG')
const dateFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' })
const REQ = { pending: ['مستني موافقة الإدارة', ''], approved: ['اتقبل', 'green'], rejected: ['اترفض', 'red'], cancelled: ['اتلغى', ''] }
const KIND = { monthly: 'شهري', level: 'بالمستوى', course: 'كورس كامل' }

export const priceOf = (plan, group) => (plan?.kind === 'monthly' && group?.price != null ? Number(group.price) : Number(plan?.price ?? 0))

export function embedUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) { const v = u.searchParams.get('v'); if (v) return `https://www.youtube-nocookie.com/embed/${v}` }
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`
    if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/shorts/')) return `https://www.youtube-nocookie.com/embed/${u.pathname.split('/')[2]}`
    if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean).pop(); if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}` }
  } catch { /* رابط مش صالح */ }
  return null
}

export function Stars({ value, size = 16 }) {
  const v = Math.round(Number(value ?? 0))
  return (
    <span className="stars" aria-label={`${fmt(value ?? 0)} من ٥`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= v ? '#E8A317' : '#DDD6FA'} aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
      ))}
    </span>
  )
}

export function Avatar({ name, photo, size = 64 }) {
  return photo
    ? <img className="t-photo" src={photo} alt={`صورة ${name}`} width={size} height={size} style={{ width: size, height: size }} />
    : <img className="t-photo" src={artUrl('avatar-teacher-default')} alt="" width={size} height={size} style={{ width: size, height: size }} />
}

/** اختيار الصف */
export function GradePicker({ value, onSave, compact }) {
  const [stages, setStages] = useState([])
  const [grades, setGrades] = useState([])
  const [stage, setStage] = useState('')
  const [grade, setGrade] = useState(value ?? '')
  useEffect(() => {
    Promise.all([supabase.from('stages').select('id, name').order('sort'), supabase.from('grades').select('id, name, stage_id').order('sort')]).then(([s, g]) => {
      setStages(s.data ?? []); setGrades(g.data ?? [])
      const cur = (g.data ?? []).find((x) => x.id === value)
      if (cur) setStage(cur.stage_id)
    })
  }, [value])
  const list = grades.filter((g) => g.stage_id === stage)
  return (
    <div className={compact ? 'form' : 'form grade-pick'}>
      <label>المرحلة<select className="fld" value={stage} onChange={(e) => { setStage(e.target.value); setGrade('') }}><option value="">اختار...</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>الصف<select className="fld" value={grade} disabled={!stage} onChange={(e) => setGrade(e.target.value)}><option value="">اختار...</option>{list.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <button className="btn-primary" disabled={!grade || grade === value} onClick={() => onSave(grade)}>حفظ</button>
    </div>
  )
}

/**
 * اختار مدرسك — للطالب (canReview) ولولي الأمر (لابنه)
 * studentId: الطالب اللي هيتسجل • gradeId: صفه • onGrade(newGradeId): حفظ الصف
 */
export default function Teachers({ studentId, gradeId, onGrade, canReview, who = 'إنت' }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const [subject, setSubject] = useState('all')
  const [open, setOpen] = useState(null)
  const [sub, setSub] = useState(null)
  const [editGrade, setEditGrade] = useState(false)
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (!gradeId) return
    let alive = true
    setErr('')
    ;(async () => {
      const [dir, plans, enr, reqs, grade] = await Promise.all([
        supabase.rpc('teacher_directory', { p_grade: gradeId }),
        supabase.from('plans').select('id, name, kind, price, duration_days, level_id').order('price'),
        supabase.from('enrollments').select('group_id').eq('student_id', studentId),
        supabase.from('enroll_requests').select('id, group_id, status, created_at, admin_note, plan_id, groups(name, levels(name, subjects(name)))').eq('student_id', studentId).order('created_at', { ascending: false }),
        supabase.from('grades').select('name').eq('id', gradeId).single(),
      ])
      const bad = [dir, plans, enr, reqs].find((r) => r.error)
      if (bad) { if (alive) setErr(bad.error.message); return }
      if (alive) setD({ teachers: dir.data ?? [], plans: plans.data ?? [], enrolled: new Set((enr.data ?? []).map((e) => e.group_id)), reqs: reqs.data ?? [], gradeName: grade.data?.name })
    })()
    return () => { alive = false }
  }, [gradeId, studentId, tick])

  if (!gradeId || editGrade) {
    return (
      <motion.section className="card" variants={item} initial="hidden" animate="visible">
        <h2>{gradeId ? 'تغيير الصف' : `${who === 'إنت' ? 'إنت في' : `${who} في`} سنة كام؟`}</h2>
        <p className="muted">عشان نوريك المدرسين والمجموعات المناسبة للصف بس.</p>
        <GradePicker value={gradeId} onSave={async (g) => { await onGrade(g); setEditGrade(false) }} />
        {gradeId && <button className="btn-link" onClick={() => setEditGrade(false)}>إلغاء</button>}
      </motion.section>
    )
  }
  if (err) return <p className="msg" role="alert">حصلت مشكلة: {err}</p>
  if (!d) return <p className="muted">جاري التحميل...</p>

  const subjects = [...new Set(d.teachers.flatMap((t) => (t.groups ?? []).map((g) => g.subject)))]
  const shown = d.teachers.filter((t) => subject === 'all' || (t.groups ?? []).some((g) => g.subject === subject))
  const pendingOf = (gid) => d.reqs.find((r) => r.group_id === gid && r.status === 'pending')
  const reload = () => setTick((x) => x + 1)

  return (
    <>
      {okMsg && <p className="msg ok" role="status">{okMsg}</p>}
      <section className="card">
        <div className="card-head">
          <div><span className="muted small">الصف</span><div className="strong">{d.gradeName}</div></div>
          <button className="btn-link" onClick={() => setEditGrade(true)}>تغيير الصف</button>
        </div>
        {subjects.length > 1 && (
          <div className="chips" role="group" aria-label="المادة">
            <button className={`chip-btn${subject === 'all' ? ' on' : ''}`} onClick={() => setSubject('all')}>كل المواد</button>
            {subjects.map((s) => <button key={s} className={`chip-btn${subject === s ? ' on' : ''}`} onClick={() => setSubject(s)}>{s}</button>)}
          </div>
        )}
      </section>

      <motion.div className="t-grid" variants={container} initial="hidden" animate="visible">
        {shown.map((t) => {
          const prices = (t.groups ?? []).map((g) => g.price).filter((x) => x != null)
          return (
            <motion.button variants={item} key={t.id} className="t-card" onClick={() => setOpen(t)}>
              <Avatar name={t.name} photo={t.photo} size={72} />
              <div className="strong t-name">{t.name}</div>
              {t.headline && <div className="muted small clamp2">{t.headline}</div>}
              <div className="inline" style={{ justifyContent: 'center' }}>
                <Stars value={t.rating} />
                <span className="muted small">{t.reviews ? `${fmt(t.rating)} (${fmt(t.reviews)})` : 'لسه مفيش تقييمات'}</span>
              </div>
              <div className="chips" style={{ justifyContent: 'center' }}>{[...new Set((t.groups ?? []).map((g) => g.subject))].map((s) => <span className="pill" key={s}>{s}</span>)}</div>
              <div className="muted small">{fmt(t.groups?.length ?? 0)} مجموعة{prices.length ? ` • من ${fmt(Math.min(...prices))} ج.م شهريًا` : ''}</div>
              <span className="btn-outline t-cta">شوف المدرس</span>
            </motion.button>
          )
        })}
      </motion.div>
      {shown.length === 0 && <section className="card"><p className="muted">مفيش مدرسين متاحين للصف ده لسه. جرّب بعدين أو كلّم إدارة السنتر.</p></section>}

      {d.reqs.length > 0 && (
        <section className="card">
          <h2>طلبات الاشتراك</h2>
          {d.reqs.map((r) => (
            <div className="row" key={r.id}>
              <div className="grow">
                <div className="strong">{r.groups?.levels?.subjects?.name} • {r.groups?.levels?.name} • {r.groups?.name}</div>
                <div className="muted small">اتبعت {dateFmt.format(new Date(r.created_at))}{r.admin_note ? ` • ملاحظة الإدارة: ${r.admin_note}` : ''}</div>
              </div>
              <span className={`pill ${REQ[r.status][1]}`}>{REQ[r.status][0]}</span>
              {r.status === 'pending' && <button className="btn-link" onClick={async () => { const { error } = await supabase.rpc('cancel_request', { p_id: r.id }); if (error) setErr(error.message); else reload() }}>إلغاء</button>}
            </div>
          ))}
          <p className="muted small">بعد ما الطلب يتبعت، ادفع للإدارة (كاش أو تحويل) وهيتفعّل الاشتراك وتتضاف للمجموعة.</p>
        </section>
      )}

      <AnimatePresence>
        {open && !sub && (
          <TeacherModal key="t" t={open} studentId={studentId} canReview={canReview} enrolled={d.enrolled} pendingOf={pendingOf}
            onClose={() => setOpen(null)} onSubscribe={(g) => setSub({ g, t: open })} />
        )}
        {sub && (
          <SubscribeModal key="s" g={sub.g} t={sub.t} plans={d.plans} studentId={studentId} who={who}
            onClose={() => setSub(null)} onDone={() => { setSub(null); setOpen(null); setOkMsg('طلبك اتبعت للإدارة. ادفع الاشتراك وهيتفعّل وتتضاف للمجموعة.'); reload() }} />
        )}
      </AnimatePresence>
    </>
  )
}

function TeacherModal({ t, studentId, canReview, enrolled, pendingOf, onClose, onSubscribe }) {
  const [reviews, setReviews] = useState(null)
  const [mine, setMine] = useState({ rating: 0, comment: '' })
  const [msg, setMsg] = useState('')
  const myTeacher = (t.groups ?? []).some((g) => enrolled.has(g.id))
  const loadReviews = () => supabase.from('teacher_reviews').select('id, student_id, reviewer_name, rating, comment, created_at').eq('teacher_id', t.id).order('created_at', { ascending: false }).limit(50)
    .then(({ data }) => {
      setReviews(data ?? [])
      const m = (data ?? []).find((r) => r.student_id === studentId)
      if (m) setMine({ rating: m.rating, comment: m.comment ?? '', id: m.id })
    })
  useEffect(() => { loadReviews() }, [t.id]) // eslint-disable-line
  const video = embedUrl(t.video)

  async function saveReview(e) {
    e.preventDefault(); setMsg('')
    if (!mine.rating) { setMsg('اختار عدد النجوم'); return }
    const row = { teacher_id: t.id, student_id: studentId, rating: mine.rating, comment: mine.comment.trim() || null }
    const { error } = mine.id ? await supabase.from('teacher_reviews').update(row).eq('id', mine.id) : await supabase.from('teacher_reviews').insert(row)
    if (error) setMsg(error.message); else { setMsg('اتحفظ تقييمك، شكرًا!'); loadReviews() }
  }

  return (
    <Modal title={t.name} onClose={onClose}>
      <div className="modal-wide stack">
        <div className="t-head">
          <Avatar name={t.name} photo={t.photo} size={88} />
          <div className="grow">
            <div className="strong t-name">{t.name}</div>
            {t.headline && <div className="muted">{t.headline}</div>}
            <div className="inline"><Stars value={t.rating} /><span className="muted small">{t.reviews ? `${fmt(t.rating)} من ٥ • ${fmt(t.reviews)} تقييم` : 'لسه مفيش تقييمات'}</span></div>
          </div>
        </div>
        {video && <div className="t-video"><iframe src={video} title={`فيديو تعريفي ${t.name}`} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>}
        {!video && t.video && <a className="btn-outline" href={t.video} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>شوف الفيديو التعريفي</a>}
        {t.bio && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.bio}</p>}

        <h3 className="sub-h">المجموعات المتاحة</h3>
        {(t.groups ?? []).map((g) => {
          const left = g.capacity != null ? g.capacity - g.enrolled : null
          const isIn = enrolled.has(g.id)
          const pend = pendingOf(g.id)
          return (
            <div className="row g-row" key={g.id}>
              <div className="grow">
                <div className="strong">{g.subject} • {g.level}</div>
                <div className="muted small">{g.name}{g.schedule ? ` • ${g.schedule}` : ''}{g.grade ? ` • ${g.grade}` : ''}</div>
                <div className="chips">
                  {g.price != null && <span className="pill gold">{fmt(g.price)} ج.م شهريًا</span>}
                  {left != null && <span className={`pill ${left <= 0 ? 'red' : left <= 3 ? 'gold' : 'green'}`}>{left <= 0 ? 'كاملة' : `فاضل ${fmt(left)} مكان`}</span>}
                </div>
              </div>
              {isIn ? <span className="pill green">مشترك</span>
                : pend ? <span className="pill">طلبك مستني الموافقة</span>
                  : <button className="btn-primary" disabled={left != null && left <= 0} onClick={() => onSubscribe(g)}>اشترك</button>}
            </div>
          )
        })}

        <h3 className="sub-h">تقييمات الطلبة</h3>
        {canReview && myTeacher && (
          <form className="review-form" onSubmit={saveReview}>
            <div className="inline">
              <span className="small strong">{mine.id ? 'تقييمك' : 'قيّم المدرس'}:</span>
              <div className="star-pick" role="radiogroup" aria-label="عدد النجوم">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" role="radio" aria-checked={mine.rating === i} aria-label={`${i} نجوم`} className={i <= mine.rating ? 'on' : ''} onClick={() => setMine({ ...mine, rating: i })}>★</button>
                ))}
              </div>
            </div>
            <textarea className="fld area" rows={2} maxLength={1000} placeholder="رأيك في المدرس (اختياري)" value={mine.comment} onChange={(e) => setMine({ ...mine, comment: e.target.value })} />
            <button className="btn-outline" style={{ alignSelf: 'flex-start' }}>{mine.id ? 'تحديث التقييم' : 'إرسال التقييم'}</button>
            {msg && <p className="muted small" role="status">{msg}</p>}
          </form>
        )}
        {reviews === null ? <p className="muted small">جاري التحميل...</p> : reviews.length ? reviews.map((r) => (
          <div className="row" key={r.id}>
            <div className="grow">
              <div className="inline"><span className="strong">{r.reviewer_name ?? 'طالب'}</span><Stars value={r.rating} size={14} /></div>
              {r.comment && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.comment}</div>}
            </div>
            <span className="muted small">{dateFmt.format(new Date(r.created_at))}</span>
          </div>
        )) : <p className="muted small">لسه مفيش تقييمات للمدرس ده.</p>}
      </div>
    </Modal>
  )
}

function SubscribeModal({ g, t, plans, studentId, who, onClose, onDone }) {
  const options = plans.filter((p) => !p.level_id || p.level_id === g.level_id)
  const [plan, setPlan] = useState(options[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const p = options.find((x) => x.id === plan)
  async function send(e) {
    e.preventDefault(); setMsg(''); setBusy(true)
    const { error } = await supabase.rpc('request_enrollment', { p_student: studentId, p_group: g.id, p_plan: plan || null, p_note: note })
    setBusy(false)
    if (error) setMsg(error.message); else onDone()
  }
  return (
    <Modal title="طلب اشتراك" onClose={onClose}>
      <form className="form" onSubmit={send}>
        <div className="qbox">
          <div className="strong">{g.subject} • {g.level} • مع {t.name}</div>
          <div className="muted small">{g.name}{g.schedule ? ` • ${g.schedule}` : ''}</div>
        </div>
        {options.length > 0 ? (
          <label>نوع الاشتراك
            <select className="fld" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {options.map((x) => <option key={x.id} value={x.id}>{x.name} ({KIND[x.kind] ?? x.kind}) • {fmt(priceOf(x, g))} ج.م</option>)}
            </select>
          </label>
        ) : <p className="muted small">الإدارة هتحدد نوع الاشتراك والسعر.</p>}
        {p && <p className="strong">المطلوب: {fmt(priceOf(p, g))} ج.م{p.duration_days ? ` لمدة ${fmt(p.duration_days)} يوم` : ''}</p>}
        <label>ملاحظة للإدارة (اختياري)<textarea className="fld area" rows={2} maxLength={500} placeholder="مثال: هدفع كاش يوم السبت" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="muted small">{who === 'إنت' ? 'طلبك' : `طلب ${who}`} هيروح للإدارة، وبعد الدفع (كاش أو تحويل) الاشتراك هيتفعّل.</p>
        {msg && <p className="msg" role="alert">{msg}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? 'لحظة...' : 'ابعت الطلب'}</button>
      </form>
    </Modal>
  )
}
