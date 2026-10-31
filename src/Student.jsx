import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'
import Solve from './Solve.jsx'
import Game from './Game.jsx'

const fmt = (n) => Number(n ?? 0).toLocaleString('ar-EG')
const dayName = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' })
const timeFmt = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' })

function whenLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 86400000)
  const t = timeFmt.format(d)
  if (diff === 0) return `النهاردة ${t}`
  if (diff === 1) return `بكرة ${t}`
  return `${dayName.format(d)} ${dateFmt.format(d)} · ${t}`
}

function dueLabel(iso) {
  if (!iso) return 'من غير ميعاد'
  const d = new Date(iso)
  const diff = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86400000)
  if (diff < 0) return 'اتأخر'
  if (diff === 0) return 'التسليم: النهاردة'
  if (diff === 1) return 'التسليم: بكرة'
  return `التسليم: ${dateFmt.format(d)}`
}

const NAV = [
  ['الرئيسية', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['جدول الحصص', 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM8 3v4M16 3v4M3 10h18'],
  ['الواجبات والكويزات', 'M6 3h9l4 4v14H6zM9 12h7M9 16h7'],
  ['التحديات والألعاب', 'M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 21h8M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3'],
  ['لوحة الصدارة', 'M5 20V10M12 20V4M19 20v-7'],
  ['اشتراكي', 'M3 9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 10h18M7 15h3'],
]

export default function Student({ session }) {
  const uid = session.user.id
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const nowIso = new Date().toISOString()
      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      const [prof, sess, assigns, subs, games, scores, todayScores, mySubs] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase
          .from('sessions')
          .select('id, starts_at, topic, live_url, groups(name, schedule, levels(name, subjects(name)))')
          .gte('starts_at', nowIso)
          .order('starts_at')
          .limit(1),
        supabase.from('assignments').select('id, title, kind, due_at').order('due_at'),
        supabase.from('subscriptions').select('id, status, renews_on, plans(name)').eq('student_id', uid).order('starts_on', { ascending: false }).limit(1),
        supabase.from('games').select('id, name, description').eq('active', true).limit(1),
        supabase.from('game_scores').select('score').eq('student_id', uid),
        supabase.from('game_scores').select('id', { count: 'exact', head: true }).eq('student_id', uid).gte('played_at', startOfDay),
        supabase.from('submissions').select('assignment_id, auto_score, final_score, submitted_at, assignments(title)').eq('student_id', uid).order('submitted_at', { ascending: false }),
      ])
      const bad = [prof, sess, assigns, subs, games, scores].find((r) => r.error)
      if (bad) { if (alive) setErr(bad.error.message); return }
      const game = games.data?.[0] ?? null
      let board = []
      if (game) {
        const lb = await supabase.rpc('leaderboard', { p_game: game.id })
        board = lb.data ?? []
      }
      const done = new Set((mySubs.data ?? []).map((s) => s.assignment_id))
      if (alive)
        setD({
          profile: prof.data,
          session: sess.data?.[0] ?? null,
          assignments: (assigns.data ?? []).filter((a) => !done.has(a.id)),
          sub: subs.data?.[0] ?? null,
          game,
          board,
          points: (scores.data ?? []).reduce((s, r) => s + r.score, 0),
          playedToday: todayScores.count ?? 0,
          results: (mySubs.data ?? []).slice(0, 4),
        })
    })()
    return () => { alive = false }
  }, [uid, tick])

  if (err) return <div className="center-msg">حصلت مشكلة في تحميل البيانات: {err}</div>
  if (!d) return <div className="center-msg">جاري التحميل...</div>

  const { profile, session: next, assignments, sub, game, board, points, playedToday, results } = d
  const back = () => { setView(null); setTick((t) => t + 1) }
  if (view?.type === 'assignment') return <Solve assignment={view.a} onBack={back} />
  if (view?.type === 'game') return <Game game={game} playedToday={playedToday} onBack={back} />
  const level = next?.groups?.levels
  const myFirst = profile.first_name
  const myRank = board.findIndex((r) => r.first_name === myFirst)
  const MAX_TRIES = 5

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Logo />
          <div>
            اسم السنتر
            <small>شعار مؤقت</small>
          </div>
        </div>
        <nav aria-label="القائمة">
          {NAV.map(([label, path], i) => (
            <a key={label} href="#" className={i === 0 ? 'nav active' : 'nav'} onClick={(e) => e.preventDefault()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
              {label}
            </a>
          ))}
        </nav>
        <button className="btn-link signout" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
      </aside>

      <main>
        <header className="top">
          <div>
            <h1>أهلاً يا {myFirst}</h1>
            <p>{assignments.length ? `عندك ${fmt(assignments.length)} مطلوب تسليمه` : 'مفيش حاجة متأخرة عليك'}</p>
          </div>
          <div className="top-end">
            <div className="points">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8A317" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
              {fmt(points)} نقطة
            </div>
            <div className="avatar" aria-label={`حساب ${myFirst}`}>{myFirst.slice(0, 1)}</div>
          </div>
        </header>

        <section className="hero" aria-label="الحصة القادمة">
          {next ? (
            <>
              <div>
                <span className="chip">الحصة القادمة · {whenLabel(next.starts_at)}</span>
                <div className="hero-title">{level?.subjects?.name} · {level?.name}</div>
                <div className="hero-sub">{next.groups?.name}</div>
              </div>
              {next.live_url ? (
                <a className="btn-gold" href={next.live_url} target="_blank" rel="noreferrer">ادخل الحصة</a>
              ) : (
                <span className="chip soft">رابط الحصة بيظهر قبلها بشوية</span>
              )}
            </>
          ) : (
            <div>
              <div className="hero-title">مفيش حصة قادمة متسجلة</div>
              <div className="hero-sub">أول ما المدرس يضيف حصة هتظهر هنا</div>
            </div>
          )}
        </section>

        <div className="grid">
          <section className="card" aria-label="التحدي">
            <div className="card-head">
              <h2>تحدي النهاردة</h2>
              <span className="pill green">مفتوح دايمًا</span>
            </div>
            {game ? (
              <>
                <div className="challenge">
                  <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label="أيقونة اللعبة"><rect width="72" height="72" rx="20" fill="#7A66E8" /><path d="M20 26h32M20 36h22M20 46h28" stroke="#fff" strokeWidth="5" strokeLinecap="round" /><circle cx="52" cy="46" r="7" fill="#FFC24B" /></svg>
                  <div className="grow">
                    <div className="strong">{game.name}</div>
                    <div className="muted">{game.description}</div>
                    <div className="bar"><div style={{ width: `${Math.min(100, (playedToday / MAX_TRIES) * 100)}%` }} /></div>
                    <div className="muted small">{fmt(playedToday)} من {fmt(MAX_TRIES)} محاولات النهاردة</div>
                  </div>
                </div>
                <button className="btn-primary" disabled={playedToday >= MAX_TRIES} onClick={() => setView({ type: 'game' })}>{playedToday >= MAX_TRIES ? 'خلصت محاولات النهاردة' : 'العب دلوقتي'}</button>
              </>
            ) : (
              <p className="muted">مفيش تحديات متاحة حاليًا.</p>
            )}
          </section>

          <section className="card" aria-label="لوحة الصدارة">
            <div className="card-head">
              <h2>ترتيب {game ? 'اللعبة' : 'الألعاب'}</h2>
            </div>
            {board.length ? (
              <ol className="board">
                {board.slice(0, 5).map((r, i) => {
                  const me = r.first_name === myFirst
                  return (
                    <li key={i} className={me ? 'me' : i === 0 ? 'first' : ''}>
                      <span className="rank">{fmt(i + 1)}</span>
                      <span className="grow">{r.first_name}{me ? ' (إنتي)' : ''}</span>
                      <b>{fmt(r.score)}</b>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="muted">لسه محدش لعب. كون إنت الأول!</p>
            )}
            {myRank > 4 && <p className="muted small">ترتيبك: {fmt(myRank + 1)}</p>}
          </section>

          <section className="card" aria-label="الواجبات">
            <h2>الواجبات المطلوبة</h2>
            {assignments.length ? (
              assignments.map((a) => (
                <div className="row" key={a.id}>
                  <div className="grow">
                    <div className="strong">{a.title}</div>
                    <div className="muted small">{a.kind === 'quiz' ? 'كويز · ' : ''}{dueLabel(a.due_at)}</div>
                  </div>
                  <button className="btn-outline" onClick={() => setView({ type: 'assignment', a })}>ابدأ</button>
                </div>
              ))
            ) : (
              <p className="muted">خلصت كل الواجبات. برافو!</p>
            )}
          </section>

          <section className="card" aria-label="النتايج">
            <h2>آخر النتايج</h2>
            {results.length ? (
              results.map((r) => (
                <div className="row" key={r.assignment_id}>
                  <div className="grow strong">{r.assignments?.title}</div>
                  <span className={`pill ${r.final_score != null ? 'green' : ''}`}>
                    {r.final_score != null ? `${fmt(r.final_score)}٪` : 'بانتظار تصحيح المدرس'}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">لسه ماسلمتش حاجة.</p>
            )}
          </section>

          <section className="card" aria-label="الاشتراك">
            <h2>اشتراكي</h2>
            {sub ? (
              <div className="row">
                <div className="grow">
                  <div className="strong">{sub.plans?.name}</div>
                  {sub.renews_on && <div className="muted small">يتجدد في {dateFmt.format(new Date(sub.renews_on))}</div>}
                </div>
                <span className={`pill ${sub.status === 'active' ? 'green' : ''}`}>{sub.status === 'active' ? 'ساري' : 'غير ساري'}</span>
              </div>
            ) : (
              <p className="muted">مفيش اشتراك متسجل لحد دلوقتي. الإدارة هتفعّله بعد الدفع.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
