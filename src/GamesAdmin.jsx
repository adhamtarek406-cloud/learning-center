import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from './supabase.js'
import { Tabs } from './ui.jsx'
import { fmtD, num, q, useLoad, Notice, Modal, Editable, logAct } from './adminkit.jsx'

function parseWords(text) {
  const out = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const i = line.includes('=') ? line.indexOf('=') : line.indexOf('\t')
    if (i < 0) return { error: `السطر "${line}" مفيهوش علامة = بين الكلمة ومعناها.` }
    const w = { q: line.slice(0, i).trim(), a: line.slice(i + 1).trim() }
    if (!w.q || !w.a) return { error: `السطر "${line}" ناقص (لازم كلمة ومعنى).` }
    out.push(w)
  }
  if (out.length === 0) return { words: null }
  if (out.length < 4) return { error: 'لازم ٤ كلمات على الأقل عشان تتعمل اختيارات.' }
  if (new Set(out.map((w) => w.a)).size < 4) return { error: 'لازم يكون فيه ٤ معاني مختلفة على الأقل.' }
  if (out.length > 200) return { error: 'الحد الأقصى ٢٠٠ كلمة.' }
  return { words: out }
}

const EMPTY = { id: null, name: '', description: '', max_daily_tries: 5, seconds: 120, words: '', active: true }

export default function GamesAdmin() {
  const [d, load, err] = useLoad(async () => {
    const [games, scores, badges, awarded, students, centers] = await Promise.all([
      q(supabase.from('games').select('*').order('name')),
      q(supabase.from('game_scores').select('game_id, student_id, played_at').limit(20000)),
      q(supabase.from('badges').select('id, name, rule').order('name')),
      q(supabase.from('student_badges').select('student_id, badge_id, awarded_at, profiles:student_id(full_name), badges(name)').order('awarded_at', { ascending: false }).limit(50)),
      q(supabase.from('profiles').select('id, full_name').eq('role', 'student').eq('active', true).order('full_name')),
      q(supabase.from('centers').select('id').limit(1)),
    ])
    const tops = {}
    await Promise.all(games.map(async (g) => { const r = await supabase.rpc('leaderboard', { p_game: g.id }); tops[g.id] = (r.data ?? []).slice(0, 3) }))
    return { games, scores, badges, awarded, students, tops, center: centers[0] }
  })
  const [tab, setTab] = useState('games')
  const [msg, setMsg] = useState('')
  const [gf, setGf] = useState(null)
  const [bf, setBf] = useState({ name: '', rule: '' })
  const [aw, setAw] = useState({ student: '', badge: '' })
  if (!d) return <Notice err={err} />

  async function act(fn, reset) {
    setMsg('')
    try { await fn(); reset?.(); await load() } catch (e) { setMsg(e.message) }
  }

  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const stats = (gid) => {
    const rows = d.scores.filter((s) => s.game_id === gid)
    return { plays: rows.length, players: new Set(rows.map((r) => r.student_id)).size, today: rows.filter((r) => r.played_at >= today).length }
  }

  function saveGame(e) {
    e.preventDefault()
    const parsed = parseWords(gf.words)
    if (parsed.error) { setMsg(parsed.error); return }
    const row = {
      name: gf.name.trim(), description: gf.description.trim() || null, active: gf.active,
      max_daily_tries: Number(gf.max_daily_tries), seconds: Number(gf.seconds),
      config: parsed.words ? { words: parsed.words } : null,
    }
    act(async () => {
      if (gf.id) { await q(supabase.from('games').update(row).eq('id', gf.id)); logAct('game_updated', 'games', gf.id, { name: row.name }) }
      else { const [g] = await q(supabase.from('games').insert({ ...row, center_id: d.center.id }).select('id')); logAct('game_created', 'games', g.id, { name: row.name }) }
      setGf(null)
    })
  }

  const editGame = (g) => { setMsg(''); setGf({ id: g.id, name: g.name, description: g.description ?? '', max_daily_tries: g.max_daily_tries, seconds: g.seconds, active: g.active, words: (g.config?.words ?? []).map((w) => `${w.q} = ${w.a}`).join('\n') }) }

  const resetBoard = (g) => {
    if (!window.confirm(`تصفير ترتيب "${g.name}"؟ هتتمسح كل نتايج اللعبة دي (${num(stats(g.id).plays)} محاولة) ومينفعش ترجّعها.`)) return
    act(async () => { await q(supabase.from('game_scores').delete().eq('game_id', g.id)); logAct('game_scores_reset', 'games', g.id, { name: g.name }) })
  }

  const delGame = (g) => {
    if (!window.confirm(`حذف لعبة "${g.name}" نهائيًا مع كل نتايجها؟ لو عايز بس توقفها اضغط "إيقاف".`)) return
    act(async () => { await q(supabase.from('games').delete().eq('id', g.id)); logAct('game_deleted', 'games', g.id, { name: g.name }) })
  }

  return (
    <>
      <Notice err={msg && !gf ? msg : ''} />
      <section className="card">
        <div className="card-head">
          <Tabs flat id="games-tab" label="الألعاب" value={tab} onChange={setTab} items={[['games', `الألعاب (${num(d.games.length)})`], ['badges', `الشارات (${num(d.badges.length)})`]]} />
          {tab === 'games' && <button className="btn-primary" onClick={() => { setMsg(''); setGf({ ...EMPTY }) }}>+ لعبة جديدة</button>}
        </div>

        {tab === 'games' && (
          <div className="stack">
            {d.games.map((g) => {
              const s = stats(g.id)
              const n = g.config?.words?.length
              return (
                <div className={`qbox${g.active ? '' : ' off'}`} key={g.id}>
                  <div className="card-head">
                    <div>
                      <span className="strong">{g.name}</span> <span className={`pill ${g.active ? 'green' : 'red'}`}>{g.active ? 'شغالة' : 'موقوفة'}</span>
                      <div className="muted small">{g.description}</div>
                    </div>
                    <div className="inline">
                      <button className="btn-outline" onClick={() => editGame(g)}>تعديل</button>
                      <button className="btn-link" onClick={() => act(async () => { await q(supabase.from('games').update({ active: !g.active }).eq('id', g.id)); logAct(g.active ? 'game_paused' : 'game_resumed', 'games', g.id, { name: g.name }) })}>{g.active ? 'إيقاف' : 'تشغيل'}</button>
                      <button className="btn-danger" onClick={() => resetBoard(g)}>تصفير الترتيب</button>
                      <button className="btn-danger" onClick={() => delGame(g)}>حذف</button>
                    </div>
                  </div>
                  <div className="muted small">
                    لعب: {num(s.plays)} مرة · {num(s.players)} طالب · النهاردة: {num(s.today)} · {num(g.max_daily_tries)} محاولات يوميًا · {num(g.seconds)} ثانية للجولة · {n ? `${num(n)} كلمة مخصصة` : 'القائمة الأساسية (ألماني ٢٦ كلمة)'}
                  </div>
                  {d.tops[g.id]?.length > 0 && <div className="inline">{d.tops[g.id].map((r, i) => <span className="pill tag" key={i}>{num(i + 1)}. {r.first_name} · {num(r.score)}</span>)}</div>}
                </div>
              )
            })}
            {d.games.length === 0 && <p className="muted">مفيش ألعاب. اضغط "لعبة جديدة".</p>}
            <p className="muted small">اللعبة بتبقى "اختار المعنى الصح" على كلمات إنت اللي بتكتبها، لأي مادة أو لغة. الطلبة بيشوفوا كل الألعاب الشغالة.</p>
          </div>
        )}

        {tab === 'badges' && (
          <div className="stack">
            <h3 className="sub-h">الشارات المتاحة</h3>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>الاسم</th><th>الوصف / شرط الحصول</th><th>اتمنحت</th><th></th></tr></thead>
                <tbody>
                  {d.badges.map((b) => (
                    <tr key={b.id}>
                      <td><Editable label="اسم الشارة" value={b.name} onSave={(v) => v.trim() && act(() => q(supabase.from('badges').update({ name: v.trim() }).eq('id', b.id)))} /></td>
                      <td><Editable label="وصف الشارة" value={b.rule ?? ''} onSave={(v) => act(() => q(supabase.from('badges').update({ rule: v.trim() || null }).eq('id', b.id)))} /></td>
                      <td>{num(d.awarded.filter((a) => a.badge_id === b.id).length)}</td>
                      <td><button className="btn-danger" onClick={() => window.confirm(`حذف شارة "${b.name}" وسحبها من كل الطلبة؟`) && act(async () => { await q(supabase.from('badges').delete().eq('id', b.id)); logAct('badge_deleted', 'badges', b.id, { name: b.name }) })}>حذف</button></td>
                    </tr>
                  ))}
                  {d.badges.length === 0 && <tr><td colSpan="4" className="muted">مفيش شارات لسه.</td></tr>}
                </tbody>
              </table>
            </div>
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(async () => { const [b] = await q(supabase.from('badges').insert({ center_id: d.center.id, name: bf.name.trim(), rule: bf.rule.trim() || null }).select('id')); logAct('badge_created', 'badges', b.id, { name: bf.name.trim() }) }, () => setBf({ name: '', rule: '' })) }}>
              <label>شارة جديدة<input className="fld" required value={bf.name} onChange={(e) => setBf({ ...bf, name: e.target.value })} /></label>
              <label>الوصف (اختياري)<input className="fld" placeholder="مثال: أول ١٠٠ نقطة" value={bf.rule} onChange={(e) => setBf({ ...bf, rule: e.target.value })} /></label>
              <button className="btn-outline">إضافة شارة</button>
            </form>

            <h3 className="sub-h">منح شارة لطالب</h3>
            <form className="form" onSubmit={(e) => { e.preventDefault(); act(async () => { await q(supabase.from('student_badges').insert({ student_id: aw.student, badge_id: aw.badge })); logAct('badge_awarded', 'student_badges', null, { student: aw.student, badge: aw.badge }) }, () => setAw({ student: '', badge: '' })) }}>
              <label>الطالب<select className="fld" required value={aw.student} onChange={(e) => setAw({ ...aw, student: e.target.value })}><option value="">اختار...</option>{d.students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
              <label>الشارة<select className="fld" required value={aw.badge} onChange={(e) => setAw({ ...aw, badge: e.target.value })}><option value="">اختار...</option>{d.badges.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              <button className="btn-primary">منح الشارة</button>
            </form>
            {d.awarded.length > 0 && (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>الطالب</th><th>الشارة</th><th>التاريخ</th><th></th></tr></thead>
                  <tbody>
                    {d.awarded.map((a) => (
                      <tr key={`${a.student_id}${a.badge_id}`}>
                        <td className="strong">{a.profiles?.full_name}</td>
                        <td>{a.badges?.name}</td>
                        <td className="muted">{fmtD(a.awarded_at)}</td>
                        <td><button className="btn-link" onClick={() => act(() => q(supabase.from('student_badges').delete().eq('student_id', a.student_id).eq('badge_id', a.badge_id)))}>سحب</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <AnimatePresence>
        {gf && (
          <Modal key="g" title={gf.id ? 'تعديل لعبة' : 'لعبة جديدة'} onClose={() => setGf(null)}>
            <form className="form" onSubmit={saveGame}>
              <label>اسم اللعبة<input className="fld" required value={gf.name} onChange={(e) => setGf({ ...gf, name: e.target.value })} /></label>
              <label>وصف قصير<input className="fld" value={gf.description} onChange={(e) => setGf({ ...gf, description: e.target.value })} /></label>
              <label>عدد المحاولات في اليوم<input className="fld" type="number" min="1" max="50" required value={gf.max_daily_tries} onChange={(e) => setGf({ ...gf, max_daily_tries: e.target.value })} /></label>
              <label>وقت الجولة (بالثواني)<input className="fld" type="number" min="20" max="600" required value={gf.seconds} onChange={(e) => setGf({ ...gf, seconds: e.target.value })} /></label>
              <label>الكلمات (سطر لكل كلمة: الكلمة = المعنى)
                <textarea className="fld area" rows={8} dir="auto" placeholder={'Hallo = مرحبًا\nDanke = شكرًا\nBitte = من فضلك\nJa = نعم'} value={gf.words} onChange={(e) => setGf({ ...gf, words: e.target.value })} />
              </label>
              <p className="muted small">سيبها فاضية لو عايز القائمة الأساسية (ألماني ٢٦ كلمة). لازم ٤ كلمات على الأقل بمعاني مختلفة.</p>
              <label className="check"><input type="checkbox" checked={gf.active} onChange={(e) => setGf({ ...gf, active: e.target.checked })} /> اللعبة شغالة</label>
              <Notice err={msg} />
              <button className="btn-primary">{gf.id ? 'حفظ' : 'إضافة اللعبة'}</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}
