// أنواع الأسئلة وأدوات مشتركة بين المحرر والحل والمراجعة والتصحيح

export const TYPES = {
  mcq: 'اختيار من متعدد',
  multi: 'اختيارات متعددة',
  tf: 'صح وغلط',
  short: 'إجابة قصيرة',
  essay: 'مقالي',
}
export const TYPE_HINT = {
  mcq: 'إجابة واحدة صح · تصحيح تلقائي',
  multi: 'أكتر من إجابة صح · تصحيح تلقائي',
  tf: 'صح أو خطأ · تصحيح تلقائي',
  short: 'كلمة أو جملة قصيرة · تصحيح تلقائي',
  essay: 'إجابة مكتوبة · المدرس بيصححها',
}
export const typeOf = (q) => (q?.type === 'text' ? 'essay' : q?.type ?? 'mcq')
export const isAuto = (q) => typeOf(q) !== 'essay'

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
export const toLatinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))

export function normalizeAr(t) {
  return String(t ?? '')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[ً-ْـ.,،؛;:!?؟"'()\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** هل إجابة الطالب صح؟ (للعرض بس — التصحيح الحقيقي في قاعدة البيانات) */
export function isCorrect(q, ans, key) {
  const t = typeOf(q)
  if (t === 'essay' || key == null || ans == null) return null
  if (t === 'mcq') return Number(ans) === Number(key)
  if (t === 'tf') return ans === key
  if (t === 'multi') {
    const a = [...new Set((ans ?? []).map(Number))].sort().join(',')
    const k = [...new Set((key ?? []).map(Number))].sort().join(',')
    return a === k
  }
  if (t === 'short') return (key ?? []).some((k) => normalizeAr(k) !== '' && normalizeAr(k) === normalizeAr(ans))
  return null
}

/** نص إجابة (للعرض) */
export function answerText(q, a) {
  const t = typeOf(q)
  if (a == null || a === '') return '—'
  if (t === 'mcq') return q.options?.[a] ?? '—'
  if (t === 'multi') return (a ?? []).map((i) => q.options?.[i]).filter(Boolean).join('، ') || '—'
  if (t === 'tf') return a === true ? 'صح' : a === false ? 'خطأ' : '—'
  return String(a)
}
export function keyText(q, k) {
  const t = typeOf(q)
  if (k == null) return ''
  if (t === 'short') return (k ?? []).join(' / ')
  return answerText(q, k)
}

export const pointsOf = (q) => {
  const p = Number(q?.points)
  return Number.isFinite(p) && p > 0 ? p : 1
}

/* ============ الاستيراد من Excel ============ */

export const TEMPLATE_HEADERS = ['النوع', 'السؤال', 'اختيار ١', 'اختيار ٢', 'اختيار ٣', 'اختيار ٤', 'اختيار ٥', 'اختيار ٦', 'الإجابة الصحيحة', 'الدرجة']
export const TEMPLATE_EXAMPLES = [
  ['اختيار من متعدد', 'ما معنى كلمة Hallo؟', 'مرحبًا', 'شكرًا', 'إلى اللقاء', 'نعم', '', '', '1', '1'],
  ['اختيارات متعددة', 'اختار الألوان:', 'rot', 'Hund', 'blau', 'Auto', '', '', '1,3', '2'],
  ['صح وغلط', 'كلمة Danke معناها شكرًا', '', '', '', '', '', '', 'صح', '1'],
  ['إجابة قصيرة', 'عاصمة ألمانيا؟', '', '', '', '', '', '', 'برلين | Berlin', '1'],
  ['مقالي', 'اكتب ٣ جمل عن نفسك بالألماني', '', '', '', '', '', '', '', '3'],
]
export const TEMPLATE_GUIDE = [
  ['العمود', 'تكتب فيه إيه'],
  ['النوع', 'اختيار من متعدد · اختيارات متعددة · صح وغلط · إجابة قصيرة · مقالي (لو سبته فاضي بنخمّنه)'],
  ['السؤال', 'نص السؤال'],
  ['اختيار ١ … ٦', 'للاختيار من متعدد والاختيارات المتعددة بس (من ٢ لـ ٦ اختيارات)'],
  ['الإجابة الصحيحة', 'اختيار من متعدد: رقم الاختيار (مثلاً 2) أو نصه · اختيارات متعددة: الأرقام بينها فاصلة (1,3) · صح وغلط: صح أو خطأ · إجابة قصيرة: الإجابات المقبولة بينها | · مقالي: فاضي'],
  ['الدرجة', 'درجة السؤال (لو فاضي = ١)'],
  ['ملاحظة', 'الإجابة القصيرة بتتصحح تلقائي وبتتجاهل التشكيل والهمزات والمسافات الزيادة'],
]

function detectType(raw, opts, ans) {
  const s = normalizeAr(raw)
  if (s) {
    if (/multi|متعدده|اختيارات|checkbox/.test(s)) return 'multi'
    if (/mcq|اختيار|choice/.test(s)) return 'mcq'
    if (/tf|true|صح|خطا|غلط/.test(s)) return 'tf'
    if (/short|قصير|اكمل|كلمه|fill/.test(s)) return 'short'
    if (/essay|مقال|text|كتابه/.test(s)) return 'essay'
  }
  if (opts.length >= 2) return /[,،]/.test(ans) ? 'multi' : 'mcq'
  if (parseTF(ans) !== null) return 'tf'
  if (String(ans).trim()) return 'short'
  return 'essay'
}

function parseTF(v) {
  const s = normalizeAr(toLatinDigits(v))
  if (['صح', 'صحيح', 'true', 't', 'yes', 'نعم', '1', '✓'].includes(s)) return true
  if (['خطا', 'غلط', 'خاطي', 'false', 'f', 'no', 'لا', '0', '✗'].includes(s)) return false
  return null
}

function optIndex(v, opts) {
  const s = toLatinDigits(v).trim()
  if (/^\d+$/.test(s)) { const n = Number(s) - 1; return n >= 0 && n < opts.length ? n : -1 }
  return opts.findIndex((o) => normalizeAr(o) === normalizeAr(s))
}

/** rows: مصفوفة صفوف (كل صف مصفوفة خلايا) — من Excel أو لصق */
export function parseRows(rows) {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c))
  if (!clean.length) return { questions: [], errors: ['الملف فاضي.'] }
  let cols = { type: 0, q: 1, opts: [2, 3, 4, 5, 6, 7], ans: 8, pts: 9 }
  let start = 0
  const head = clean[0].map((c) => normalizeAr(c))
  if (head.some((c) => (c.includes('السوال') || c.includes('السؤال')) || c === 'question' || c.includes('النوع'))) {
    start = 1
    const find = (re) => head.findIndex((c) => re.test(c))
    const opts = head.map((c, i) => (/اختيار|option|choice/.test(c) && !/النوع/.test(c) ? i : -1)).filter((i) => i >= 0)
    cols = {
      type: find(/النوع|type/),
      q: find(/السوال|السؤال|question/),
      opts: opts.length ? opts : cols.opts,
      ans: find(/الاجابه|answer|الصحيح/),
      pts: find(/الدرجه|points|درجه/),
    }
    if (cols.q < 0) return { questions: [], errors: ['مش لاقي عمود "السؤال" في أول صف.'] }
  }
  const questions = []
  const errors = []
  clean.slice(start).forEach((r, i) => {
    const line = i + start + 1
    const text = r[cols.q] ?? ''
    if (!text) { errors.push(`صف ${line}: السؤال فاضي، اتجاهل.`); return }
    const options = cols.opts.map((c) => r[c] ?? '').filter(Boolean).slice(0, 6)
    const ansRaw = cols.ans >= 0 ? r[cols.ans] ?? '' : ''
    const type = detectType(cols.type >= 0 ? r[cols.type] : '', options, ansRaw)
    const ptsN = Number(toLatinDigits(cols.pts >= 0 ? r[cols.pts] : ''))
    const q = { type, q: text, options: [], points: ptsN > 0 ? ptsN : 1, key: null }
    if (type === 'mcq' || type === 'multi') {
      if (options.length < 2) { errors.push(`صف ${line}: محتاج اختيارين على الأقل.`); return }
      q.options = options
      if (type === 'mcq') {
        const k = optIndex(ansRaw, options)
        if (k < 0) errors.push(`صف ${line}: الإجابة الصحيحة "${ansRaw}" مش واضحة، حددها بإيدك.`)
        q.key = k < 0 ? null : k
      } else {
        const ks = toLatinDigits(ansRaw).split(/[,،;؛\s]+/).filter(Boolean).map((x) => optIndex(x, options)).filter((x) => x >= 0)
        if (!ks.length) errors.push(`صف ${line}: الإجابات الصحيحة مش واضحة، حددها بإيدك.`)
        q.key = [...new Set(ks)]
      }
    } else if (type === 'tf') {
      q.key = parseTF(ansRaw)
      if (q.key === null) errors.push(`صف ${line}: اكتب "صح" أو "خطأ" في الإجابة.`)
    } else if (type === 'short') {
      q.key = ansRaw.split(/[|/؛]/).map((x) => x.trim()).filter(Boolean)
      if (!q.key.length) errors.push(`صف ${line}: مفيش إجابة مقبولة للسؤال القصير.`)
    }
    questions.push(q)
  })
  return { questions, errors }
}

export async function readSpreadsheet(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sh = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' })
}

export async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLES])
  ws['!cols'] = [{ wch: 18 }, { wch: 40 }, ...Array(6).fill({ wch: 14 }), { wch: 22 }, { wch: 8 }]
  const g = XLSX.utils.aoa_to_sheet(TEMPLATE_GUIDE)
  g['!cols'] = [{ wch: 18 }, { wch: 110 }]
  XLSX.utils.book_append_sheet(wb, ws, 'الأسئلة')
  XLSX.utils.book_append_sheet(wb, g, 'طريقة الكتابة')
  wb.Workbook = { Views: [{ RTL: true }] }
  XLSX.writeFile(wb, 'نموذج-واجب.xlsx')
}
