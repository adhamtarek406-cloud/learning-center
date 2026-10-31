import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { fmtD, num, q, useLoad, Notice, must } from './adminkit.jsx'
import { Avatar, Stars, embedUrl } from './Teachers.jsx'

/** المدرس يعدّل صفحته التعريفية — والمدير يختار أي مدرس */
export default function TeacherPage({ uid, role }) {
  const [teachers] = useLoad(async () => (role === 'manager'
    ? q(supabase.from('profiles').select('id, full_name, role').in('role', ['manager', 'teacher']).eq('active', true).order('full_name'))
    : []), [role])
  const [tid, setTid] = useState(uid)
  return (
    <>
      {role === 'manager' && teachers && (
        <section className="card">
          <label className="form-one">صفحة مين؟
            <select className="fld" value={tid} onChange={(e) => setTid(e.target.value)}>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.id === uid ? ' (إنت)' : ''}</option>)}
            </select>
          </label>
        </section>
      )}
      <Editor key={tid} tid={tid} role={role} />
    </>
  )
}

function Editor({ tid, role }) {
  const [d, load, err] = useLoad(async () => {
    const [prof, tp, reviews] = await Promise.all([
      q(supabase.from('profiles').select('full_name').eq('id', tid).single()),
      q(supabase.from('teacher_profiles').select('*').eq('teacher_id', tid)),
      q(supabase.from('teacher_reviews').select('id, reviewer_name, rating, comment, created_at').eq('teacher_id', tid).order('created_at', { ascending: false })),
    ])
    return { name: prof.full_name, tp: tp[0] ?? {}, reviews }
  }, [tid])
  const [f, setF] = useState(null)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  useEffect(() => { if (d) setF({ headline: d.tp.headline ?? '', bio: d.tp.bio ?? '', video_url: d.tp.video_url ?? '', photo_url: d.tp.photo_url ?? '' }) }, [d])
  if (!d || !f) return <Notice err={err} />

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(''); setOk('')
    if (file.size > 2 * 1024 * 1024) { setMsg('الصورة لازم تكون أقل من ٢ ميجا.'); return }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMsg('الصورة لازم تكون JPG أو PNG أو WebP.'); return }
    setBusy(true)
    const path = `${tid}/${Date.now()}.${file.type.split('/')[1]}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    setF({ ...f, photo_url: url })
    setOk('الصورة اترفعت. اضغط "حفظ" عشان تتثبت.')
  }

  async function save(e) {
    e.preventDefault(); setMsg(''); setOk('')
    if (f.video_url && !/^https?:\/\//.test(f.video_url)) { setMsg('رابط الفيديو لازم يبدأ بـ https://'); return }
    setBusy(true)
    const { error } = await supabase.from('teacher_profiles').upsert({ teacher_id: tid, headline: f.headline.trim() || null, bio: f.bio.trim() || null, video_url: f.video_url.trim() || null, photo_url: f.photo_url || null, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) setMsg(error.message); else { setOk('اتحفظت الصفحة. الطلبة وأولياء الأمور بيشوفوها في "اختار مدرسك".'); load() }
  }

  const avg = d.reviews.length ? d.reviews.reduce((a, r) => a + r.rating, 0) / d.reviews.length : null
  const video = embedUrl(f.video_url)

  return (
    <>
      <section className="card">
        <h2>الصفحة التعريفية {role === 'manager' ? `لـ ${d.name}` : ''}</h2>
        <p className="muted small">دي الصفحة اللي الطلبة وأولياء الأمور بيشوفوها قبل ما يختاروا المدرس.</p>
        <div className="t-head">
          <Avatar name={d.name} photo={f.photo_url} size={96} />
          <div className="stack" style={{ gap: 8 }}>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => fileRef.current?.click()}>{f.photo_url ? 'تغيير الصورة' : 'رفع صورة'}</button>
            {f.photo_url && <button type="button" className="btn-link" onClick={() => setF({ ...f, photo_url: '' })}>شيل الصورة</button>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
            <span className="muted small">JPG أو PNG، أقل من ٢ ميجا.</span>
          </div>
        </div>
        <form className="form" onSubmit={save}>
          <label style={{ flexBasis: '100%' }}>جملة تعريفية قصيرة<input className="fld" maxLength={120} placeholder="مثال: مدرس ألماني • ١٠ سنين خبرة • معتمد من جوته" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></label>
          <label style={{ flexBasis: '100%' }}>نبذة عنك<textarea className="fld area" rows={5} maxLength={3000} placeholder="خبرتك، مؤهلاتك، طريقتك في الشرح، نتايج طلبتك..." value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
          <label style={{ flexBasis: '100%' }}>رابط فيديو تعريفي (يوتيوب أو فيميو)<input className="fld" dir="ltr" placeholder="https://www.youtube.com/watch?v=..." value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} /></label>
          {f.video_url && !video && <p className="muted small">الرابط ده هيظهر كزرار، مش فيديو جوه الصفحة. استخدم رابط يوتيوب أو فيميو عشان يشتغل جوه الصفحة.</p>}
          {video && <div className="t-video" style={{ flexBasis: '100%' }}><iframe src={video} title="معاينة الفيديو" allowFullScreen loading="lazy" /></div>}
          <Notice err={msg} />
          {ok && <p className="msg ok" role="status" style={{ flexBasis: '100%' }}>{ok}</p>}
          <button className="btn-primary" disabled={busy}>{busy ? 'لحظة...' : 'حفظ'}</button>
        </form>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>تقييمات الطلبة</h2>
          {avg != null && <div className="inline"><Stars value={avg} /><span className="muted small">{num(Math.round(avg * 10) / 10)} من ٥ • {num(d.reviews.length)} تقييم</span></div>}
        </div>
        {d.reviews.map((r) => (
          <div className="row" key={r.id}>
            <div className="grow">
              <div className="inline"><span className="strong">{r.reviewer_name ?? 'طالب'}</span><Stars value={r.rating} size={14} /></div>
              {r.comment && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{r.comment}</div>}
            </div>
            <span className="muted small">{fmtD(r.created_at)}</span>
            {role === 'manager' && <button className="btn-link" onClick={async () => { if (window.confirm('حذف التقييم ده؟') && await must(supabase.from('teacher_reviews').delete().eq('id', r.id), 'حذف التقييم')) load() }}>حذف</button>}
          </div>
        ))}
        {d.reviews.length === 0 && <p className="muted">لسه مفيش تقييمات. الطلبة المشتركين معاك يقدروا يقيّموك من صفحتك.</p>}
      </section>
    </>
  )
}
