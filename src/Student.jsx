import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Logo from './Logo.jsx'
import Solve from './Solve.jsx'
import Game from './Game.jsx'
import Review from './Review.jsx'
import Teachers from './Teachers.jsx'
import { openSession, platformOf } from './meet.js'
import { StudentActivities, ActivityView } from './Activities.jsx'
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
  return `${dayName.format(d)} ${dateFmt.format(d)} • ${t}`
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
  ['teachers', 'اختار مدرسك', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
  ['news', 'الإعلانات والتنبيهات', 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  ['schedule', 'جدول الحصص', 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM8 3v4M16 3v4M3 10h18'],
  ['assign', 'الواجبات والكويزات', 'M6 3h9l4 4v14H6zM9 12h7M9 16h7'],
  ['activities', 'أنشطة تفاعلية', 'M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5'],
  ['games', 'التحديات والألعاب', 'M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 21h8M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3'],
  ['board', 'لوحة الصدارة', 'M5 20V10M12 20V4M19 20v-7'],
  ['sub', 'اشتراكي', 'M3 9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 10h18M7 15h3'],
  ['me', 'ملفي', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
]

export default function Student({ session }) {
  const uid = session.user.id
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState(null)
  const [tick, setTick] = useState(0)
  const [sec, setSec] = useState('home')
  const [joinErr, setJoinErr] = useState('')
  const seenKey = `seen_${uid}`
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(seenKey) || '1970' } catch { return '1970' } })
  const [seenBefore, setSeenBefore] = useState('1970')
  function go(k) {
    if (k === 'news') {
      setSeenBefore(seen)
      const now = new Date().toISOString()
      try { localStorage.setItem(seenKey, now) } catch { /* مفيش تخزين */ }
      setSeen(now)
    }
    setSec(k)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const nowIso = new Date().toISOString()
      const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      const SEL = 'id, group_id, starts_at, topic, live_url, recording_url, groups(name, schedule, levels(name, subjects(name)))'
      const [prof, sess, assigns, subs, games, scores, todayScores, mySubs, upc, past, overall, myBadges, anns, streak, glinks] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase
          .from('sessions')
          .select(SEL)
          .gte('starts_at', nowIso)
          .order('starts_at')
          .limit(1),
        supabase.from('assignments').select('id, title, kind, due_at, created_at').order('due_at'),
        supabase.from('subscriptions').select('id, status, starts_on, renews_on, plans(name)').eq('student_id', uid).order('starts_on', { ascending: false }),
        supabase.from('games').select('id, name, description, max_daily_tries, seconds, config').eq('active', true).order('name'),
        supabase.from('game_scores').select('game_id, score, played_at').eq('student_id', uid),
        supabase.from('game_scores').select('id', { count: 'exact', head: true }).eq('student_id', uid).gte('played_at', startOfDay),
        supabase.from('submissions').select('assignment_id, auto_score, final_score, submitted_at, feedback, graded_at, assignments(title, kind)').eq('student_id', uid).order('submitted_at', { ascending: false }),
        supabase.from('sessions').select(SEL).gte('starts_at', nowIso).order('starts_at').limit(30),
        supabase.from('sessions').select(SEL).lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(10),
        supabase.rpc('leaderboard'),
        supabase.from('student_badges').select('awarded_at, badges(name, rule)').eq('student_id', uid).order('awarded_at', { ascending: false }),
        supabase.from('announcements').select('id, title, body, author_name, created_at').order('created_at', { ascending: false }).limit(30),
        supabase.rpc('streak_of', { p_student: uid }),
        supabase.from('group_links').select('group_id, url'),
      ])
      const bad = [prof, sess, assigns, subs, games, scores].find((r) => r.error)
      if (bad) { if (alive) setErr(bad.error.message); return }
      const gl = games.data ?? []
      const game = gl[0] ?? null
      const boards = {}
      await Promise.all(gl.map(async (g) => { const lb = await supabase.rpc('leaderboard', { p_game: g.id }); boards[g.id] = lb.data ?? [] }))
      const board = game ? boards[game.id] ?? [] : []
      const playedMap = {}
      ;(scores.data ?? []).forEach((r) => { if (r.played_at >= startOfDay) playedMap[r.game_id] = (playedMap[r.game_id] ?? 0) + 1 })
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
          games: gl,
          boards,
          playedMap,
          badges: myBadges.data ?? [],
          anns: anns.data ?? [],
          streak: streak.data ?? { current: 0, best: 0 },
          allAssignments: assigns.data ?? [],
          links: Object.fromEntries((glinks.data ?? []).map((l) => [l.group_id, l.url])),
          board,
          points: (scores.data ?? []).reduce((s, r) => s + r.score, 0),
          playedToday: game ? playedMap[game.id] ?? 0 : 0,
          results: (mySubs.data ?? []).slice(0, 4),
        })
    })()
    return () => { alive = false }
  }, [uid, tick])

  if (err) return <div className="center-msg">حصلت مشكلة في تحميل البيانات: {err}</div>
  if (!d) return <div className="center-msg">جاري التحميل...</div>

  const { profile, session: next, assignments, sub, game, board, points, playedToday, results, subs, upcoming, past, overall, scoreRows, allResults, games: gameList, boards, playedMap, badges, anns, streak, allAssignments, links } = d
  const back = () => { setView(null); setTick((t) => t + 1) }
  if (view?.type === 'assignment') return <Solve assignment={view.a} onBack={back} />
  if (view?.type === 'activity') return <ActivityView activity={view.a} onBack={() => setView(null)} />
  if (view?.type === 'review') return <Review assignmentId={view.id} onBack={() => setView(null)} />
  if (view?.type === 'game') { const g = view.game ?? game; return <Game game={g} playedToday={playedMap[g.id] ?? 0} onBack={back} /> }
  const level = next?.groups?.levels
  const myFirst = profile.first_name
  const myRank = board.findIndex((r) => r.first_name === myFirst)
  const MAX_TRIES = game?.max_daily_tries ?? 5
  const news = [
    ...anns.map((a) => ({ t: a.created_at, kind: 'إعلان', title: a.title, body: a.body, by: a.author_name })),
    ...allAssignments.filter((a) => a.created_at).map((a) => ({ t: a.created_at, kind: a.kind === 'quiz' ? 'كويز جديد' : 'واجب جديد', title: a.title, body: dueLabel(a.due_at) })),
    ...allResults.filter((r) => r.graded_at).map((r) => ({ t: r.graded_at, kind: 'درجة جديدة', title: r.assignments?.title, body: `${fmt(r.final_score)}٪${r.feedback ? ` • ${r.feedback}` : ''}`, review: r.assignment_id })),
  ].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 40)
  const unseen = news.filter((n) => n.t > seen).length

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
            <button key={key} type="button" className={sec === key ? 'nav active' : 'nav'} aria-current={sec === key ? 'page' : undefined} onClick={() => go(key)}>
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
            <button className="bell" aria-label={`التنبيهات${unseen ? ` (${unseen} جديد)` : ''}`} onClick={() => go('news')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              {unseen > 0 && <span className="bell-n">{fmt(unseen)}</span>}
            </button>
            {streak.current > 0 && <div className="streak" title={`أحسن سلسلة: ${fmt(streak.best)} يوم`}>{fmt(streak.current)} {streak.current === 1 ? 'يوم' : 'أيام'} ورا بعض</div>}
            <div className="points">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8A317" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>
              <CountUp value={points} /> نقطة
            </div>
            <div className="avatar" aria-label={`حساب ${myFirst}`}>{myFirst.slice(0, 1)}</div>
          </div>
        </motion.header>

        {sec === 'home' && (<>
        {!profile.grade_id && (
          <motion.section className="card nudge" variants={item} initial="hidden" animate="visible">
            <div className="grow"><div className="strong">اختار صفك وشوف المدرسين المتاحين</div><div className="muted small">اشترك مع المدرس اللي يعجبك في المجموعة والميعاد اللي يناسبك.</div></div>
            <button className="btn-primary" onClick={() => go('teachers')}>اختار مدرسك<GoIcon /></button>
          </motion.section>
        )}
        <motion.section className="hero" aria-label="الحصة القادمة" variants={item} initial="hidden" animate="visible">
          {next ? (
            <>
              <div>
                <span className="chip">الحصة القادمة • {whenLabel(next.starts_at)}</span>
                <div className="hero-title">{level?.subjects?.name} • {level?.name}</div>
                <div className="hero-sub">{next.groups?.name}</div>
              </div>
              {(next.live_url || links[next.group_id]) ? (
                <div className="join-box">
                  <button className="btn-gold" onClick={() => openSession(next.id, setJoinErr)}>ادخل الحصة<GoIcon /></button>
                  <span className="hero-tip">{platformOf(next.live_url || links[next.group_id])?.label}{platformOf(next.live_url || links[next.group_id])?.tip ? ` • ${platformOf(next.live_url || links[next.group_id]).tip}` : ''}</span>
                  {joinErr && <span className="chip soft">{joinErr}</span>}
                </div>
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

        {anns.length > 0 && (
          <motion.section className="card ann-card" variants={item} initial="hidden" animate="visible">
            <div className="card-head"><h2>آخر الإعلانات</h2><button className="btn-link" onClick={() => go('news')}>الكل</button></div>
            {anns.slice(0, 2).map((a) => (
              <div className="row" key={a.id}><div className="grow"><div className="strong">{a.title}</div>{a.body && <div className="muted small clamp2">{a.body}</div>}</div><span className="muted small">{dateFmt.format(new Date(a.created_at))}</span></div>
            ))}
          </motion.section>
        )}

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
                    <div className="muted small">{a.kind === 'quiz' ? 'كويز • ' : ''}{dueLabel(a.due_at)}</div>
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
          <Pages key={sec} sec={sec} {...{ links, myFirst, upcoming, past, assignments, allResults, gameList, boards, playedMap, badges, overall, scoreRows, points, subs, news, seenBefore, streak, profile }} uid={uid} email={session.user.email} onSaved={() => setTick((t) => t + 1)} onReview={(id) => setView({ type: 'review', id })} onActivity={(a) => setView({ type: 'activity', a })} onAssign={(a) => setView({ type: 'assignment', a })} onPlay={(g) => setView({ type: 'game', game: g })} />
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

function Pages({ links, sec, myFirst, upcoming, past, assignments, allResults, gameList, boards, playedMap, badges, overall, scoreRows, points, subs, news, seenBefore, streak, profile, uid, email, onSaved, onReview, onActivity, onAssign, onPlay }) {
  const [bt, setBt] = useState(gameList[0]?.id ?? 'all')
  const lv = (x) => `${x.groups?.levels?.subjects?.name ?? ''} • ${x.groups?.levels?.name ?? ''}`
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
                <div className="muted small">{lv(x)} • {x.groups?.name}{x.topic ? ` • ${x.topic}` : ''}</div>
              </div>
              {(x.live_url || links[x.group_id]) ? <button className="btn-outline" onClick={() => openSession(x.id, (m) => alert(m))}>ادخل • {platformOf(x.live_url || links[x.group_id])?.label}</button> : <span className="muted small">الرابط بيظهر قبلها</span>}
            </div>
          )) : <p className="muted">مفيش حصص قادمة متسجلة.</p>}
        </motion.section>
        <motion.section variants={item} className="card">
          <h2>حصص فاتت</h2>
          {past.length ? past.map((x) => (
            <div className="row" key={x.id}>
              <div className="grow">
                <div className="strong">{dayName.format(new Date(x.starts_at))} {dateFmt.format(new Date(x.starts_at))}</div>
                <div className="muted small">{lv(x)}{x.topic ? ` • ${x.topic}` : ''}</div>
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
                <div className="muted small">{a.kind === 'quiz' ? 'كويز • ' : 'واجب • '}{dueLabel(a.due_at)}</div>
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
                <div className="muted small">{r.assignments?.kind === 'quiz' ? 'كويز • ' : 'واجب • '}اتسلّم {dateFmt.format(new Date(r.submitted_at))}</div>
              </div>
              <span className={`pill ${r.final_score != null ? 'green' : ''}`}>
                {r.final_score != null ? `${fmt(r.final_score)}٪` : r.auto_score != null ? `${fmt(r.auto_score)}٪ (مبدئي)` : 'بانتظار تصحيح المدرس'}
              </span>
              <button className="btn-outline" onClick={() => onReview(r.assignment_id)}>مراجعة</button>
            </div>
          )) : <p className="muted">لسه ماسلمتش حاجة.</p>}
        </motion.section>
      </>
    )

  if (sec === 'games') {
    const best = scoreRows.reduce((m, r) => Math.max(m, r.score), 0)
    const todayTotal = Object.values(playedMap).reduce((x, y) => x + y, 0)
    return wrap(
      <>
        <motion.div variants={item} className="stats">
          <div className="stat"><b><CountUp value={points} /></b><span>مجموع نقاطك</span></div>
          <div className="stat"><b><CountUp value={best} /></b><span>أعلى نتيجة ليك</span></div>
          <div className="stat"><b><CountUp value={scoreRows.length} /></b><span>مرات اللعب</span></div>
          <div className="stat"><b><CountUp value={streak.current} /></b><span>أيام ورا بعض (أحسن {fmt(streak.best)})</span></div>
        </motion.div>
        <motion.section variants={item} className="card">
          <h2>الألعاب المتاحة</h2>
          {gameList.length ? gameList.map((g) => {
            const played = playedMap[g.id] ?? 0
            const max = g.max_daily_tries ?? 5
            return (
              <div className="challenge" key={g.id}>
                <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label="أيقونة اللعبة"><rect width="72" height="72" rx="20" fill="#7A66E8" /><path d="M20 26h32M20 36h22M20 46h28" stroke="#fff" strokeWidth="5" strokeLinecap="round" /><circle cx="52" cy="46" r="7" fill="#FFC24B" /></svg>
                <div className="grow">
                  <div className="strong">{g.name}</div>
                  <div className="muted">{g.description}</div>
                  <Progress pct={(played / max) * 100} />
                  <div className="muted small">{fmt(played)} من {fmt(max)} محاولات النهاردة</div>
                </div>
                <button className="btn-primary" disabled={played >= max} onClick={() => onPlay(g)}>{played >= max ? 'خلصت محاولات النهاردة' : <>العب<GoIcon /></>}</button>
              </div>
            )
          }) : <p className="muted">مفيش تحديات متاحة حاليًا.</p>}
        </motion.section>
        <motion.section variants={item} className="card">
          <h2>شاراتي</h2>
          {badges.length ? badges.map((b, i) => (
            <div className="row" key={i}>
              <div className="grow"><div className="strong">{b.badges?.name}</div>{b.badges?.rule && <div className="muted small">{b.badges.rule}</div>}</div>
              <span className="pill gold">{dateFmt.format(new Date(b.awarded_at))}</span>
            </div>
          )) : <p className="muted">لسه معاكش شارات. العب وذاكر وهتاخد شارات من المدرس.</p>}
        </motion.section>
      </>
    )
  }

  if (sec === 'board')
    return wrap(
      <motion.section variants={item} className="card">
        <Tabs flat id="board-tab" label="نوع الترتيب" items={[...gameList.map((g) => [g.id, g.name]), ['all', 'الترتيب الإجمالي']]} value={bt} onChange={setBt} />
        <BoardList rows={bt === 'all' ? overall : boards[bt] ?? []} myFirst={myFirst} />
        <p className="muted small">الترتيب بيعرض الاسم الأول بس، وولي الأمر يقدر يخفي اسم ابنه.</p>
      </motion.section>
    )

  if (sec === 'news')
    return wrap(
      <motion.section variants={item} className="card">
        <h2>الإعلانات والتنبيهات</h2>
        {news.length ? news.map((n, i) => (
          <div className={`row${n.t > seenBefore ? ' new' : ''}`} key={i}>
            <div className="grow">
              <div><span className="pill">{n.kind}</span> <span className="strong">{n.title}</span>{n.t > seenBefore && <span className="pill red" style={{ marginInlineStart: 6 }}>جديد</span>}</div>
              {n.body && <div className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>}
              <div className="muted small">{n.by ? `${n.by} • ` : ''}{dateFmt.format(new Date(n.t))}</div>
            </div>
            {n.review && <button className="btn-outline" onClick={() => onReview(n.review)}>مراجعة</button>}
          </div>
        )) : <p className="muted">مفيش جديد لسه.</p>}
      </motion.section>
    )

  if (sec === 'activities') return <div className="pane"><StudentActivities onOpen={onActivity} /></div>

  if (sec === 'me') return wrap(<Me profile={profile} email={email} onSaved={onSaved} />)

  if (sec === 'teachers')
    return (
      <div className="pane">
        <Teachers studentId={uid} gradeId={profile.grade_id} canReview who="إنت"
          onGrade={async (g) => { const { error } = await supabase.rpc('set_my_grade', { p_grade: g }); if (!error) onSaved() }} />
      </div>
    )

  // sub
  return wrap(
    <motion.section variants={item} className="card">
      <h2>اشتراكاتي</h2>
      {subs.length ? subs.map((x) => (
        <div className="row" key={x.id}>
          <div className="grow">
            <div className="strong">{x.plans?.name}</div>
            <div className="muted small">بدأ {dateFmt.format(new Date(x.starts_on))}{x.renews_on ? ` • يتجدد ${dateFmt.format(new Date(x.renews_on))}` : ''}</div>
          </div>
          <span className={`pill ${x.status === 'active' ? 'green' : ''}`}>{STATUS_AR[x.status] ?? x.status}</span>
        </div>
      )) : <p className="muted">مفيش اشتراك متسجل لحد دلوقتي. الإدارة هتفعّله بعد الدفع.</p>}
      <p className="muted small">لتجديد الاشتراك أو التحويل بين الخطط كلّم إدارة السنتر.</p>
    </motion.section>
  )
}

function Me({ profile, email, onSaved }) {
  const [name, setName] = useState(profile.full_name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  async function saveInfo(e) {
    e.preventDefault(); setMsg(''); setOk('')
    const { error } = await supabase.rpc('update_my_profile', { p_name: name, p_phone: phone })
    if (error) setMsg(error.message); else { setOk('اتحفظت بياناتك'); onSaved() }
  }
  async function savePw(e) {
    e.preventDefault(); setMsg(''); setOk('')
    if (pw !== pw2) { setMsg('كلمتين السر مش زي بعض'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setMsg(error.message); else { setOk('اتغيرت كلمة السر'); setPw(''); setPw2('') }
  }
  return (
    <>
      {msg && <p className="msg" role="alert">{msg}</p>}
      {ok && <p className="msg ok" role="status">{ok}</p>}
      <motion.section variants={item} className="card">
        <h2>بياناتي</h2>
        <form className="form" onSubmit={saveInfo}>
          <label>الاسم<input className="fld" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>الموبايل<input className="fld" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label>الإيميل<input className="fld" dir="ltr" value={email ?? ''} disabled /></label>
          <button className="btn-primary">حفظ</button>
        </form>
        <p className="muted small">اسمك الأول بيظهر في لوحة الصدارة.</p>
      </motion.section>
      <motion.section variants={item} className="card">
        <h2>تغيير كلمة السر</h2>
        <form className="form" onSubmit={savePw}>
          <label>كلمة السر الجديدة<input className="fld" type="password" dir="ltr" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <label>اكتبها تاني<input className="fld" type="password" dir="ltr" minLength={8} required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          <button className="btn-outline">تغيير</button>
        </form>
      </motion.section>
    </>
  )
}
