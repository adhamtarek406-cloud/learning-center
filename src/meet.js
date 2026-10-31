import { supabase } from './supabase.js'

/** نوع برنامج الحصة من الرابط + نصيحة للطالب */
export function platformOf(url) {
  let h = ''
  try { h = new URL(url).hostname.toLowerCase() } catch { return null }
  if (h.includes('jit.si') || h.endsWith('8x8.vc')) return { key: 'jitsi', label: 'Jitsi', tip: 'بتفتح من المتصفح على طول، أو من تطبيق Jitsi Meet على الموبايل. الحصة بتقفل بعد ٩٥ دقيقة.' }
  if (h === 'meet.google.com') return { key: 'meet', label: 'Google Meet', tip: 'لو الحصة اتقفلت بعد ساعة، ادخل تاني من نفس الزرار وهتكمل.' }
  if (h.includes('teams.microsoft') || h.includes('teams.live')) return { key: 'teams', label: 'Microsoft Teams', tip: 'لو الحصة اتقفلت بعد ساعة، ادخل تاني من نفس الزرار.' }
  if (h.includes('zoom.us')) return { key: 'zoom', label: 'Zoom', tip: 'محتاج تطبيق Zoom أو تفتح من المتصفح.' }
  if (h.includes('youtube.com') || h === 'youtu.be') return { key: 'youtube', label: 'بث يوتيوب', tip: 'بث مباشر، الأسئلة بتتكتب في الشات.' }
  return { key: 'other', label: 'رابط الحصة', tip: '' }
}

export const isYoutube = (url) => platformOf(url)?.key === 'youtube'

/** غرفة Jitsi باسم عشوائي صعب يتخمّن */
export function newJitsiRoom(groupName) {
  const slug = String(groupName ?? '').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '').slice(0, 16) || 'Class'
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
  return `https://meet.jit.si/Center-${slug}-${rand}`
}

/** الطالب يدخل الحصة: بيتسجّل إنه دخل وبيفتح الرابط (النافذة بتتفتح الأول عشان المتصفح مايمنعهاش) */
export async function openSession(sessionId, onError) {
  const w = window.open('', '_blank')
  const { data, error } = await supabase.rpc('join_session', { p_session: sessionId })
  if (error || !data) {
    if (w) w.close()
    onError?.(error?.message ?? 'لسه مفيش رابط للحصة دي')
    return
  }
  if (w) { w.opener = null; w.location.href = data } else window.location.href = data
}
