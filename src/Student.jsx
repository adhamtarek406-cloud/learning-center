import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'
import Solve from './Solve.jsx'
import Game from './Game.jsx'
import { motion } from 'framer-motion'
import { container, item, rowItem, CountUp, GoIcon, Progress, Tabs } from './ui.jsx'

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
  ['home', 'الرئيسية', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['schedule', 'جدول الحصص', 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM8 3v4M16 3v4M3 10h18'],
  ['assign', 'الواجبات والكويزات', 'M6 3h9l4 4v14H6zM9 12h7M9 16h7'],
  ['games', 'التحديات والألعاب', 'M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 21h8M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3'],
  ['board', 'لوحة الصدارة', 'M5 20V10M12 20V4M19 20v-7'],
  ['sub', 'اشتراكي', 'M3 9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 10h18M7 15h3'],
]

export default function Student({ session }) {
  const uid = session.user.id
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState(null)
  const [tick, setTick] = useState(0)
  const [sec, setSec] = useState('home')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const nowIso = new Date().toISOString()
      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      const SEL = 'id, starts_at, topic, live_url, recording_url, groups(name, schedule, levels(name, subjects(name)))'
      const [prof, sess, assigns, subs, games, scores, todayScores, mySubs, upc, past, overall] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase
          .from('sessions')
          .select(SEL)
          .gte('starts_at', nowIso)
          .order('starts_at')
          .limit(1),
        supabase.from('assignments').select('id, title, kind, due_at').order('due_at'),
        supabase.from('subscriptions').select('id, status, starts_on, renews_on, plans(name)').eq('student_id', uid).order('starts_on', { ascending: false }),
        supabase.from('games').select('id, name, description').eq('active', true).limit(1),
        supabase.from('game_scores').select('score, played_at').eq('student_id', uid),
        supabase.from('game_scores').select('id', { count: 'exact', head: true }).eq('student_id', uid).gte('played_at', startOfDay),
        supabase.from('submissions').select('assignment_id, auto_score, final_score, submitted_at, assignments(title, kind)').eq('student_id', uid).order('submitted_at', { ascending: false }),
        supabase.from('sessions').select(SEL).gte('starts_at', nowIso).order('starts_at').limit(30),
        supabase.from('sessions').select(SEL).lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(10),
        supabase.rpc('leaderboard'),
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
          subs: subs.data ?? [],
          upcoming: upc.data ?? [],
          past: past.data ?? [],
          overall: overall.data ?? [],
          scoreRows: scores.data ?? [],
          allResults: mySubs.data ?? [],
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

  const { profile, session: next, assignments, sub, game, board, points, playedToday, results, subs, upcoming, past, overall, scoreRows, allResults } = d
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
          {NAV.map(([key, label, path]) => (
            <button key={key} type="button" className={sec === key ? 'nav active' : 'nav'} aria-current={sec === key ? 'page' : undefined} onClick={() => setSec(key)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
              {label}
            </button>
          ))}
        </nav>
        <button className="btn-link signout" onClick={() => supabase.auth.signOut()}>تسجيل الخروج</button>
      </aside>

      <main>
        <motion.header className="top" variants={item} initial="hidden" animate="visible">
          <div>
            <span className="eyebrow">لوحتك</span>
            {sec === 'home' ? (
              <>
                <h1>أهلاً يا {myFirst}</h1>
                <p>{assignments.length ? `عندك ${fmt(assignments.length)} مطلوب تسليمه` : 'مفيش حاجة متأخرة عليك'}</p>
              </>
            ) : (
              <h1>{NAV.find((n) => n[0] === sec)[1]}</h1>
            )}
          </div>
          <div className="top-end">
            <div className="points">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8A317" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
              <CountUp value={points} /> نقطة
            </div>
            <div className="avatar" aria-label={`حساب ${myFirst}`}>{myFirst.slice(0, 1)}</div>
          </div>
        </motion.header>

        {sec === 'home' && (<>
        <motion.section className="hero" aria-label="الحصة القادمة" variants={item} initial="hidden" animate="visible">
          {next ? (
            <>
              <div>
                <span className="chip">الحصة القادمة · {whenLabel(next.starts_at)}</span>
                <div className="hero-title">{level?.subjects?.name} · {level?.name}</div>
                <div className="hero-sub">{next.groups?.name}</div>
              </div>
              {next.live_url ? (
                <a className="btn-gold" href={next.live_url} target="_blank" rel="noreferrer">ادخل الحصة<GoIcon /></a>
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
        </motion.section>

        <motion.div className="grid" variants={container} initial="hidden" animate="visible">
          <motion.section variants={item} className="card" aria-label="التحدي">
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
                    <Progress pct={(playedToday / MAX_TRIES) * 100} />
                    <div className="muted small">{fmt(playedToday)} من {fmt(MAX_TRIES)} محاولات النهاردة</div>
                  </div>
                </div>
                <button className="btn-primary" disabled={playedToday >= MAX_TRIES} onClick={() => setView({ type: 'game' })}>{playedToday >= MAX_TRIES ? 'خلصت محاولات النهاردة' : <>العب دلوقتي<GoIcon /></>}</button>
              </>
            ) : (
              <p className="muted">مفيش تحديات متاحة حاليًا.</p>
            )}
          </motion.section>

          <motion.section variants={item} className="card" aria-label="لوحة الصدارة">
            <div className="card-head">
              <h2>ترتيب {game ? 'اللعبة' : 'الألعاب'}</h2>
            </div>
            {board.length ? (
              <motion.ol className="board" variants={container} initial="hidden" animate="visible">
                {board.slice(0, 5).map((r, i) => {
                  const me = r.first_name === myFirst
                  return (
                    <motion.li variants={rowItem} key={i} className={me ? 'me' : i === 0 ? 'first' : ''}>
                      <span className="rank">{fmt(i + 1)}</span>
                      <span className="grow">{r.first_name}{me ? ' (إنتي)' : ''}</span>
                      <b>{fmt(r.score)}</b>
                    </motion.li>
                  )
                })}
              </motion.ol>
            ) : (
              <p className="muted">لسه محدش لعب. كون إنت الأول!</p>
            )}
            {myRank > 4 && <p className="muted small">ترتيبك: {fmt(myRank + 1)}</p>}
          </motion.section>

          <motion.section variants={item} className="card" aria-label="الواجبات">
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
          </motion.section>

          <motion.section variants={item} className="card" aria-label="النتايج">
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
          </motion.section>

          <motion.section variants={item} className="card" aria-label="الاشتراك">
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
          </motion.section>
        </motion.div>
        </>)}

        {sec !== 'home' && (
          <Pages key={sec} sec={sec} {...{ myFirst, upcoming, past, assignments, allResults, game, board, overall, scoreRows, points, playedToday, subs, MAX_TRIES }} onAssign={(a) => setView({ type: 'assignment', a })} onPlay={() => setView({ type: 'game' })} />
        )}
      </main>
    </div>
  )
}

function BoardList({ rows, myFirst }) {
  if (!rows.length) return <p className="muted">لسه محدش لعب. كون إنت الأول!</p>
  return (
    <motion.ol className="board" variants={container} initial="hidden" animate="visible">
      {rows.map((r, i) => {
        const me = r.first_name === myFirst
        return (
          <motion.li variants={rowItem} key={i} className={me ? 'me' : i === 0 ? 'first' : ''}>
            <span className="rank">{fmt(i + 1)}</span>
            <span className="grow">{r.first_name}{me ? ' (إنتي)' : ''}</span>
            <b>{fmt(r.score)}</b>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}

const STATUS_AR = { active: 'ساري', paused: 'موقوف', expired: 'منتهي', cancelled: 'ملغي' }

function Pages({ sec, myFirst, upcoming, past, assignments, allResults, game, board, overall, scoreRows, points, playedToday, subs, MAX_TRIES, onAssign, onPlay }) {
  const [bt, setBt] = useState('game')
  const lv = (x) => `${x.groups?.levels?.subjects?.name ?? ''} · ${x.groups?.levels?.name ?? ''}`
  const wrap = (children) => (
    <motion.div className="pane" variants={container} initial="hidden" animate="visible">{children}</motion.div>
  )

  if (sec === 'schedule')
    return wrap(
      <>
        <motion.section variants={item} className="card">
          <h2>الحصص الجاية</h2>
          {upcoming.length ? upcoming.map((x) => (
            <div className="row" key={x.id}>
              <div className="grow">
                <div className="strong">{whenLabel(x.starts_at)}</div>
                <div className="muted small">{lv(x)} · {x.groups?.name}{x.topic ? ` · ${x.topic}` : ''}</div>
              </div>
              {x.live_url ? <a className="btn-outline" href={x.live_url} target="_blank" rel="noreferrer">ادخل</a> : <span className="muted small">الرابط بيظهر قبلها</span>}
            </div>
          )) : <p className="muted">مفيش حصص قادمة متسجلة.</p>}
        </motion.section>
        <motion.section variants={item} className="card">
          <h2>حصص فاتت</h2>
          {past.length ? past.map((x) => (
            <div className="row" key={x.id}>
              <div className="grow">
                <div className="strong">{dayName.format(new Date(x.starts_at))} {dateFmt.format(new Date(x.starts_at))}</div>
                <div className="muted small">{lv(x)}{x.topic ? ` · ${x.topic}` : ''}</div>
              </div>
              {x.recording_url ? <a className="btn-outline" href={x.recording_url} target="_blank" rel="noreferrer">شوف التسجيل</a> : <span className="muted small">مفيش تسجيل</span>}
            </div>
          )) : <p className="muted">لسه مفيش حصص فاتت.</p>}
        </motion.section>
      </>
    )

  if (sec === 'assign')
    return wrap(
      <>
        <motion.section variants={item} className="card">
          <h2>المطلوب تسليمه</h2>
          {assignments.length ? assignments.map((a) => (
            <div className="row" key={a.id}>
              <div className="grow">
                <div className="strong">{a.title}</div>
                <div className="muted small">{a.kind === 'quiz' ? 'كويز · ' : 'واجب · '}{dueLabel(a.due_at)}</div>
              </div>
              <button className="btn-outline" onClick={() => onAssign(a)}>ابدأ</button>
            </div>
          )) : <p className="muted">خلصت كل الواجبات. برافو!</p>}
        </motion.section>
        <motion.section variants={item} className="card">
          <h2>اللي سلّمته</h2>
          {allResults.length ? allResults.map((r) => (
            <div className="row" key={r.assignment_id}>
              <div className="grow">
                <div className="strong">{r.assignments?.title}</div>
                <div className="muted small">{r.assignments?.kind === 'quiz' ? 'كويز · ' : 'واجب · '}اتسلّم {dateFmt.format(new Date(r.submitted_at))}</div>
              </div>
              <span className={`pill ${r.final_score != null ? 'green' : ''}`}>
                {r.final_score != null ? `${fmt(r.final_score)}٪` : r.auto_score != null ? `${fmt(r.auto_score)}٪ (مبدئي)` : 'بانتظار تصحيح المدرس'}
              </span>
            </div>
          )) : <p className="muted">لسه ماسلمتش حاجة.</p>}
        </motion.section>
      </>
    )

  if (sec === 'games') {
    const best = scoreRows.reduce((m, r) => Math.max(m, r.score), 0)
    return wrap(
      <>
        <motion.div variants={item} className="stats">
          <div className="stat"><b><CountUp value={points} /></b><span>مجموع نقاطك</span></div>
          <div className="stat"><b><CountUp value={best} /></b><span>أعلى نتيجة ليك</span></div>
          <div className="stat"><b><CountUp value={scoreRows.length} /></b><span>مرات اللعب</span></div>
          <div className="stat"><b><CountUp value={playedToday} /> / {fmt(MAX_TRIES)}</b><span>محاولات النهاردة</span></div>
        </motion.div>
        <motion.section variants={item} className="card">
          <h2>الألعاب المتاحة</h2>
          {game ? (
            <div className="challenge">
              <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label="أيقونة اللعبة"><rect width="72" height="72" rx="20" fill="#7A66E8" /><path d="M20 26h32M20 36h22M20 46h28" stroke="#fff" strokeWidth="5" strokeLinecap="round" /><circle cx="52" cy="46" r="7" fill="#FFC24B" /></svg>
              <div className="grow">
                <div className="strong">{game.name}</div>
                <div className="muted">{game.description}</div>
                <Progress pct={(playedToday / MAX_TRIES) * 100} />
              </div>
              <button className="btn-primary" disabled={playedToday >= MAX_TRIES} onClick={onPlay}>{playedToday >= MAX_TRIES ? 'خلصت محاولات النهاردة' : <>العب<GoIcon /></>}</button>
            </div>
          ) : <p className="muted">مفيش تحديات متاحة حاليًا.</p>}
          <p className="muted small">ألعاب جديدة هتتضاف قريب.</p>
        </motion.section>
      </>
    )
  }

  if (sec === 'board')
    return wrap(
      <motion.section variants={item} className="card">
        <Tabs flat id="board-tab" label="نوع الترتيب" items={[['game', game ? game.name : 'اللعبة'], ['all', 'الترتيب الإجمالي']]} value={bt} onChange={setBt} />
        <BoardList rows={bt === 'game' ? board : overall} myFirst={myFirst} />
        <p className="muted small">الترتيب بيعرض الاسم الأول بس، وولي الأمر يقدر يخفي اسم ابنه.</p>
      </motion.section>
    )

  // sub
  return wrap(
    <motion.section variants={item} className="card">
      <h2>اشتراكاتي</h2>
      {subs.length ? subs.map((x) => (
        <div className="row" key={x.id}>
          <div className="grow">
            <div className="strong">{x.plans?.name}</div>
            <div className="muted small">بدأ {dateFmt.format(new Date(x.starts_on))}{x.renews_on ? ` · يتجدد ${dateFmt.format(new Date(x.renews_on))}` : ''}</div>
          </div>
          <span className={`pill ${x.status === 'active' ? 'green' : ''}`}>{STATUS_AR[x.status] ?? x.status}</span>
        </div>
      )) : <p className="muted">مفيش اشتراك متسجل لحد دلوقتي. الإدارة هتفعّله بعد الدفع.</p>}
      <p className="muted small">لتجديد الاشتراك أو التحويل بين الخطط كلّم إدارة السنتر.</p>
    </motion.section>
  )
}
