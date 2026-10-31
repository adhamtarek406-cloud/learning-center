import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

export const BUILTIN_WORDS = [
  ['Hallo', 'مرحبًا'], ['Danke', 'شكرًا'], ['Bitte', 'من فضلك'], ['Ja', 'نعم'], ['Nein', 'لا'],
  ['Guten Morgen', 'صباح الخير'], ['Gute Nacht', 'تصبح على خير'], ['Tschüss', 'إلى اللقاء'],
  ['Wasser', 'ماء'], ['Brot', 'خبز'], ['Apfel', 'تفاحة'], ['Haus', 'بيت'], ['Buch', 'كتاب'],
  ['Schule', 'مدرسة'], ['Freund', 'صديق'], ['Mutter', 'أم'], ['Vater', 'أب'], ['Katze', 'قطة'],
  ['Hund', 'كلب'], ['Auto', 'سيارة'], ['Tisch', 'طاولة'], ['Stuhl', 'كرسي'],
  ['rot', 'أحمر'], ['blau', 'أزرق'], ['grün', 'أخضر'], ['gelb', 'أصفر'],
]

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }

function wordsOf(game) {
  const w = game.config?.words
  return Array.isArray(w) && w.length >= 4 ? w.map((x) => [x.q, x.a]) : BUILTIN_WORDS
}

function buildRound(words) {
  return shuffle(words).map(([de, ar]) => {
    const wrong = shuffle(words.filter((w) => w[1] !== ar)).slice(0, 3).map((w) => w[1])
    return { de, ar, options: shuffle([ar, ...wrong]) }
  })
}

export default function Game({ game, playedToday, onBack }) {
  const SECONDS = game.seconds ?? 120
  const TRIES = game.max_daily_tries ?? 5
  const round = useMemo(() => buildRound(wordsOf(game)), []) // eslint-disable-line
  const [i, setI] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [left, setLeft] = useState(SECONDS)
  const [picked, setPicked] = useState(null)
  const [phase, setPhase] = useState('play')
  const [err, setErr] = useState('')
  const saved = useRef(false)
  const correctRef = useRef(0)
  correctRef.current = correct

  useEffect(() => {
    if (phase !== 'play') return
    const t = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'play' && (left <= 0 || i >= round.length)) setPhase('saving')
  }, [left, i, phase, round.length])

  useEffect(() => {
    if (phase !== 'saving' || saved.current) return
    saved.current = true
    supabase.rpc('submit_score', { p_game: game.id, p_score: correctRef.current * 10 }).then(({ error }) => {
      if (error) setErr(error.message)
      setPhase('done')
    })
  }, [phase, game.id])

  function choose(opt) {
    if (picked !== null || phase !== 'play') return
    const q = round[i]
    setPicked(opt)
    if (opt === q.ar) setCorrect((c) => c + 1)
    setTimeout(() => { setPicked(null); setI((x) => x + 1) }, 450)
  }

  if (phase !== 'play') {
    return (
      <div className="solve">
        <h1>{game.name}</h1>
        <section className="card">
          <img className="result-art" src="./brand/time-up.svg" alt="" width="200" height="150" />
          <h2>{phase === 'saving' ? 'بنحفظ نتيجتك...' : 'خلص الوقت!'}</h2>
          {phase === 'done' && (
            <>
              <p className="big">{(correct * 10).toLocaleString('ar-EG')} نقطة</p>
              <p className="muted">{correct.toLocaleString('ar-EG')} إجابة صح</p>
              {err ? <p className="msg" role="alert">{err}</p> : <p className="muted">اتسجلت في الترتيب. ممكن تلعب تاني النهاردة لحد {TRIES.toLocaleString('ar-EG')} محاولات ({(playedToday + 1).toLocaleString('ar-EG')} اتلعبت).</p>}
              <button className="btn-primary" onClick={onBack}>رجوع للرئيسية</button>
            </>
          )}
        </section>
      </div>
    )
  }

  const q = round[i]
  return (
    <div className="solve">
      <div className="game-top">
        <button className="btn-link" onClick={onBack}>خروج</button>
        <div className="pill" role="timer" aria-label="الوقت المتبقي">{Math.max(left, 0).toLocaleString('ar-EG')} ث</div>
        <div className="pill green">{(correct * 10).toLocaleString('ar-EG')} نقطة</div>
      </div>
      <section className="card game-q">
        <p className="muted">معنى الكلمة دي إيه؟</p>
        <div className="de" dir="auto">{q.de}</div>
        <div className="opts" role="group" aria-label="الاختيارات">
          {q.options.map((o) => {
            const state = picked === null ? '' : o === q.ar ? ' right' : o === picked ? ' wrong' : ''
            return <button key={o} className={'opt btn-opt' + state} onClick={() => choose(o)}>{o}</button>
          })}
        </div>
      </section>
    </div>
  )
}
