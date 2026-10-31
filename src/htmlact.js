import { supabase } from './supabase.js'

const BUCKET = 'activities'
const MAX_TOTAL = 60 * 1024 * 1024
const MIME = {
  html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', txt: 'text/plain', csv: 'text/csv', vtt: 'text/vtt', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', pdf: 'application/pdf',
}
const extOf = (n) => n.split('.').pop().toLowerCase()
const isHtml = (n) => /\.html?$/i.test(n)

/** يقرا ملف HTML واحد أو ZIP فيه index.html وصور */
export async function readActivity(file) {
  if (isHtml(file.name)) {
    return { files: [{ path: 'index.html', blob: () => Promise.resolve(file) }], entry: 'index.html', total: file.size, skipped: [], title: await titleOf(await file.text()) }
  }
  if (!/\.zip$/i.test(file.name)) throw new Error('ارفع ملف .html أو ملف .zip فيه النشاط.')
  const { default: JSZip } = await import('jszip')
  let zip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('ملف الـ ZIP ده بايظ أو مش مقروء.') }
  let paths = []
  zip.forEach((p, f) => { if (!f.dir && !p.startsWith('__MACOSX') && !p.split('/').some((s) => s.startsWith('.'))) paths.push(p) })
  // لو كل الملفات جوه فولدر واحد، نشيله من المسار
  const tops = new Set(paths.map((p) => p.split('/')[0]))
  let prefix = ''
  if (tops.size === 1 && paths.every((p) => p.includes('/'))) prefix = `${[...tops][0]}/`
  const htmls = paths.filter(isHtml).map((p) => p.slice(prefix.length))
  if (!htmls.length) throw new Error('مفيش ملف HTML جوه الـ ZIP.')
  const entry = htmls.find((p) => p.toLowerCase() === 'index.html') ?? htmls.sort((a, b) => a.split('/').length - b.split('/').length)[0]
  const skipped = []
  let total = 0
  const files = []
  for (const p of paths) {
    if (!MIME[extOf(p)]) { skipped.push(p); continue }
    total += zip.file(p)._data?.uncompressedSize ?? 0
    files.push({ path: p.slice(prefix.length), blob: () => zip.file(p).async('blob') })
  }
  if (total > MAX_TOTAL) throw new Error('النشاط كبير أوي (أكتر من ٦٠ ميجا). صغّر الصور أو حط الفيديوهات على يوتيوب.')
  const html = await zip.file(prefix + entry).async('string')
  return { files, entry, total, skipped, title: titleOf(html) }
}

function titleOf(html) {
  const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i)
  return m ? m[1].trim() : ''
}

export async function uploadActivity(pkg, uid, onProgress) {
  const folder = `${uid}/${crypto.randomUUID()}`
  const done = []
  let i = 0
  async function worker() {
    while (i < pkg.files.length) {
      const f = pkg.files[i++]
      const key = `${folder}/${f.path}`
      const { error } = await supabase.storage.from(BUCKET).upload(key, await f.blob(), { contentType: MIME[extOf(f.path)], upsert: false, cacheControl: '3600' })
      if (error) throw new Error(`فشل رفع ${f.path}: ${error.message}`)
      done.push(key)
      onProgress?.(done.length / pkg.files.length)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(6, pkg.files.length) }, worker))
  } catch (e) {
    await removeFiles(done)
    throw e
  }
  return { folder, files: done }
}

export async function removeFiles(files) {
  const own = (files ?? []).filter((f) => !f.startsWith('h5p/'))
  for (let k = 0; k < own.length; k += 100) await supabase.storage.from(BUCKET).remove(own.slice(k, k + 100))
}

export const folderUrl = (folder) => supabase.storage.from(BUCKET).getPublicUrl(folder).data.publicUrl

/** كود صغير بيتحط جوه النشاط: بديل للتخزين المحلي + CenterActivity لإرسال الدرجة */
const SHIM = `<script>(function(){
try{window.localStorage.getItem('_')}catch(e){var mk=function(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}};
try{Object.defineProperty(window,'localStorage',{value:mk()});Object.defineProperty(window,'sessionStorage',{value:mk()})}catch(_){}}
var send=function(o){o.type='center-activity';parent.postMessage(o,'*')};
window.CenterActivity={score:function(s,m){send({action:'score',score:Number(s),max:Number(m)})},complete:function(){send({action:'complete'})}};
})();</script>`

/** بيجيب HTML النشاط ويجهزه للتشغيل جوه iframe معزول */
export async function buildSrcdoc(activity) {
  const base = folderUrl(activity.folder)
  const entry = activity.entry ?? 'index.html'
  const res = await fetch(`${base}/${entry.split('/').map(encodeURIComponent).join('/')}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('مقدرناش نحمّل النشاط.')
  const html = await res.text()
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : ''
  const head = `<base href="${base}/${dir}">${SHIM}`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + head)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`)
  return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${html}</body></html>`
}

export const AI_PROMPT = `اعمل نشاط تعليمي تفاعلي كملف index.html (ممكن معاه فولدر images للصور، وكل الملفات في ZIP واحد).
- استخدم مسارات نسبية للصور زي images/pic.png (مش روابط من جهازي).
- التصميم مناسب للموبايل والكمبيوتر، وبالعربي من اليمين للشمال لو النشاط عربي.
- لما الطالب يخلص النشاط، ابعت درجته كده:
  if (window.CenterActivity) CenterActivity.score(درجة_الطالب, الدرجة_النهائية);
- لو النشاط مالوش درجة، نادِ في الآخر:
  if (window.CenterActivity) CenterActivity.complete();`
