import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './supabase.js'
import { CountUp, EASE, container, item } from './ui.jsx'
import { ROLE_AR, fmtDT, num, q, useLoad, Notice } from './adminkit.jsx'

function Bars({ data, label }) {
  const max = Math.max(1, ...data.map((x) => x.n))
  return (
    <div className="bars" role="img" aria-label={label}>
      {data.map((x, i) => (
        <div className="bar-col" key={i} title={`${x.d}: ${num(x.n)}`}>
          <span className="bar-n">{x.n ? num(x.n) : ''}</span>
          <motion.div className="bar-fill" style={{ height: `${Math.max(4, (x.n / max) * 100)}%`, transformOrigin: 'bottom' }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.03 * i }} />
          <span className="bar-l">{i % 2 === 0 ? x.d : ''}</span>
        </div>
      ))}
    </div>
  )
}

export default function Overview({ role, onGo }) {
  const [d, , err] = useLoad(async () => {
    const r = await q(supabase.rpc('admin_overview'))
    return r
  })
  if (!d) return <Notice err={err} />
  const tiles = [
    ['students', 'طلاب نشطين', d.students],
    ['new', 'طلاب جدد (٣٠ يوم)', d.new_students_30d],
    ['subs', 'اشتراكات سارية', d.active_subs],
    ...(role === 'manager' ? [['rev', 'إيراد الشهر (ج.م)', d.revenue_month]] : []),
    ['att', 'نسبة الحضور (٣٠ يوم)', d.attendance_30d, d.attendance_30d == null ? '—' : '٪'],
    ['sub7', 'تسليمات آخر ٧ أيام', d.submissions_7d],
    ['plays', `محاولات ألعاب (٧ أيام) · ${num(d.players_7d)} لاعب`, d.plays_7d],
    ['sess', 'حصص الأسبوع الجاي', d.sessions_7d],
  ]
  const todo = [
    d.ungraded > 0 && ['assign', `${num(d.ungraded)} تسليم لسه من غير تصحيح نهائي`],
    d.no_group > 0 && ['people', `${num(d.no_group)} طالب من غير مجموعة`],
    d.expiring_7d > 0 && ['subs', `${num(d.expiring_7d)} اشتراك بيتجدد خلال ٧ أيام`],
    d.invites > 0 && role === 'manager' && ['people', `${num(d.invites)} دعوة لسه ما اتقبلتش`],
  ].filter(Boolean)

  return (
    <>
      <motion.div className="stats stats-8" variants={container} initial="hidden" animate="visible">
        {tiles.map(([k, label, v, suffix]) => (
          <motion.div className="stat" variants={item} key={k}>
            <b>{v == null ? '—' : <CountUp value={Number(v)} suffix={suffix === '٪' ? '٪' : ''} />}</b>
            <span>{label}</span>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid">
        <section className="card">
          <h2>محتاج انتباه</h2>
          {todo.length ? todo.map(([tab, text]) => (
            <div className="row" key={text}>
              <div className="grow strong">{text}</div>
              <button className="btn-outline" onClick={() => onGo(tab)}>افتح</button>
            </div>
          )) : <p className="muted">كل حاجة تمام، مفيش حاجة معلّقة.</p>}
        </section>
        <section className="card">
          <h2>محاولات الألعاب (آخر ١٤ يوم)</h2>
          <Bars data={d.plays_daily} label="محاولات الألعاب يوميًا" />
        </section>
      </div>
      <section className="card">
        <h2>طلاب جدد (آخر ٨ أسابيع)</h2>
        <Bars data={d.signups_weekly} label="الطلاب الجدد أسبوعيًا" />
      </section>
    </>
  )
}

const ACT = {
  invite_created: 'أنشأ دعوة', invite_cancelled: 'ألغى دعوة', invite_claimed: 'قبل الدعوة وفعّل حسابه',
  profile_updated: 'عدّل بيانات حساب', account_suspended: 'أوقف حساب', account_activated: 'فعّل حساب', password_reset_sent: 'أرسل رابط كلمة سر',
  group_created: 'أنشأ مجموعة', group_updated: 'عدّل مجموعة', group_deleted: 'حذف مجموعة', group_paused: 'أوقف مجموعة', group_resumed: 'شغّل مجموعة',
  stage_created: 'أضاف مرحلة', stage_deleted: 'حذف مرحلة', subject_created: 'أضاف مادة', subject_deleted: 'حذف مادة', level_created: 'أضاف مستوى', level_deleted: 'حذف مستوى',
  game_created: 'أنشأ لعبة', game_updated: 'عدّل لعبة', game_deleted: 'حذف لعبة', game_paused: 'أوقف لعبة', game_resumed: 'شغّل لعبة', game_scores_reset: 'صفّر ترتيب لعبة',
  badge_created: 'أنشأ شارة', badge_deleted: 'حذف شارة', badge_awarded: 'منح شارة',
  session_updated: 'عدّل حصة', session_deleted: 'حذف حصة', assignment_updated: 'عدّل واجب', assignment_deleted: 'حذف واجب',
}

function detail(x) {
  if (!x) return ''
  return Object.entries(x).filter(([, v]) => v).map(([k, v]) => (k === 'role' ? ROLE_AR[v] ?? v : String(v))).join(' · ')
}

export function LogTab() {
  const [rows, , err] = useLoad(() => q(supabase.from('activity_log').select('id, action, details, at, profiles:actor_id(full_name)').order('at', { ascending: false }).limit(300)))
  const [s, setS] = useState('')
  if (!rows) return <Notice err={err} />
  const term = s.trim().toLowerCase()
  const shown = rows.filter((r) => !term || `${ACT[r.action] ?? r.action} ${r.profiles?.full_name ?? ''} ${detail(r.details)}`.toLowerCase().includes(term))
  return (
    <section className="card">
      <div className="card-head">
        <h2>سجل النشاط</h2>
        <input className="fld" style={{ maxWidth: 300 }} placeholder="بحث في السجل" value={s} onChange={(e) => setS(e.target.value)} />
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>الوقت</th><th>مين</th><th>عمل إيه</th><th>تفاصيل</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmtDT(r.at)}</td>
                <td className="strong">{r.profiles?.full_name ?? '—'}</td>
                <td>{ACT[r.action] ?? r.action}</td>
                <td className="muted" dir="auto">{detail(r.details)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="4" className="muted">مفيش نشاط مسجّل لسه. أي تغيير مهم بتعمله من لوحة الإدارة هيظهر هنا.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">بيعرض آخر ٣٠٠ إجراء. التسجيل شغال للحسابات والمحتوى والألعاب والحصص والواجبات.</p>
    </section>
  )
}
