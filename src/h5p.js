import { supabase } from './supabase.js'

export const H5P_CDN = 'https://cdn.jsdelivr.net/npm/h5p-standalone@3.8.2/dist'
const BUCKET = 'h5p'
const MAX_TOTAL = 80 * 1024 * 1024

const MIME = {
  js: 'text/javascript', css: 'text/css', json: 'application/json', txt: 'text/plain', vtt: 'text/vtt',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
}
const extOf = (n) => n.split('.').pop().toLowerCase()

/** أسماء أنواع H5P بالعربي */
const KINDS = {
  'H5P.InteractiveVideo': 'فيديو تفاعلي', 'H5P.CoursePresentation': 'عرض تفاعلي', 'H5P.InteractiveBook': 'كتاب تفاعلي',
  'H5P.QuestionSet': 'مجموعة أسئلة', 'H5P.MultiChoice': 'اختيار من متعدد', 'H5P.SingleChoiceSet': 'اختيار سريع',
  'H5P.TrueFalse': 'صح وغلط', 'H5P.Blanks': 'املا الفراغات', 'H5P.DragText': 'سحب الكلمات', 'H5P.MarkTheWords': 'علّم الكلمات',
  'H5P.DragQuestion': 'سحب وإفلات', 'H5P.Flashcards': 'بطاقات', 'H5P.DialogCards': 'بطاقات حوار', 'H5P.MemoryGame': 'لعبة الذاكرة',
  'H5P.Crossword': 'كلمات متقاطعة', 'H5P.FindTheWords': 'البحث عن الكلمات', 'H5P.BranchingScenario': 'سيناريو متفرّع',
  'H5P.ImageHotspots': 'صورة تفاعلية', 'H5P.ImageSequencing': 'ترتيب الصور', 'H5P.ImagePair': 'توصيل الصور',
  'H5P.Accordion': 'شرح مطوي', 'H5P.Timeline': 'خط زمني', 'H5P.Summary': 'ملخص', 'H5P.ArithmeticQuiz': 'حساب سريع',
  'H5P.Essay': 'مقال', 'H5P.SpeakTheWords': 'نطق الكلمات', 'H5P.Dictation': 'إملاء', 'H5P.SortParagraphs': 'ترتيب الفقرات',
}
export const kindName = (lib) => KINDS[lib] ?? (lib ? lib.replace(/^H5P\./, '') : 'نشاط')

/** فك ملف .h5p في المتصفح والتأكد إنه سليم */
export async function readH5P(file) {
  const { default: JSZip } = await import('jszip')
  let zip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('الملف ده مش ملف H5P سليم.') }
  const meta = zip.file('h5p.json')
  if (!meta) throw new Error('الملف مفيهوش h5p.json، اتأكد إنه ملف .h5p متصدّر من Lumi أو h5p.org.')
  if (!zip.file('content/content.json')) throw new Error('الملف مفيهوش محتوى (content/content.json).')
  const info = JSON.parse(await meta.async('string'))
  const entries = []
  const skipped = []
  let total = 0
  zip.forEach((path, f) => {
    if (f.dir || path.startsWith('__MACOSX') || path.split('/').some((p) => p.startsWith('.'))) return
    if (!MIME[extOf(path)]) { skipped.push(path); return }
    entries.push(path)
    total += f._data?.uncompressedSize ?? 0
  })
  if (total > MAX_TOTAL) throw new Error('الملف كبير أوي (أكتر من ٨٠ ميجا). حط الفيديوهات على يوتيوب بدل ما تكون جوه الملف.')
  const libs = new Set(entries.map((p) => p.split('/')[0]).filter((d) => /-\d+\.\d+$/.test(d)))
  const needed = (info.preloadedDependencies ?? []).map((d) => `${d.machineName}-${d.majorVersion}.${d.minorVersion}`)
  const missing = needed.filter((n) => !libs.has(n))
  if (missing.length) throw new Error(`الملف ناقصه مكتبات (${missing.slice(0, 3).join('، ')}). صدّره تاني من Lumi واختار "ملف كامل مع المكتبات".`)
  return { zip, info, entries, skipped, total }
}

/** رفع الملفات المفكوكة لـ Supabase Storage */
export async function uploadH5P({ zip, entries }, uid, onProgress) {
  const folder = `${uid}/${crypto.randomUUID()}`
  const done = []
  let i = 0
  async function worker() {
    while (i < entries.length) {
      const path = entries[i++]
      const blob = await zip.file(path).async('blob')
      const key = `${folder}/${path}`
      const { error } = await supabase.storage.from(BUCKET).upload(key, blob, { contentType: MIME[extOf(path)], upsert: false, cacheControl: '31536000' })
      if (error) throw new Error(`فشل رفع ${path}: ${error.message}`)
      done.push(key)
      onProgress?.(done.length / entries.length)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(6, entries.length) }, worker))
  } catch (e) {
    await removeFiles(done)
    throw e
  }
  return { folder, files: done }
}

export async function removeFiles(files) {
  for (let k = 0; k < files.length; k += 100) {
    await supabase.storage.from(BUCKET).remove(files.slice(k, k + 100))
  }
}

export const baseUrl = (folder) => supabase.storage.from(BUCKET).getPublicUrl(folder).data.publicUrl
