/** رمز شاطر: "شرارة النمو". tile=true بيرسمه أبيض جوه مربع بنفسجي (زي أيقونة التطبيق) */
export default function Logo({ size = 44, tile = true }) {
  const c = tile ? '#FFFFFF' : '#5842E3'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="شاطر">
      {tile && <rect width="64" height="64" rx="16" fill="#5842E3" />}
      <g transform={tile ? 'translate(6 7) scale(.8125)' : undefined}>
        <path d="M11 30 C11 46 20 53 32 53 C45 53 52 44 52 28" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" />
        <path d="M44.5 34 L52 25.5 L59.5 34" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="23" cy="30" r="4.2" fill={c} /><circle cx="35" cy="30" r="4.2" fill={c} />
        <path d="M29 8 C29.8 14 31 15.2 37 16 C31 16.8 29.8 18 29 24 C28.2 18 27 16.8 21 16 C27 15.2 28.2 14 29 8Z" fill="#FFB800" />
      </g>
    </svg>
  )
}

/** اسم المنصة جنب الرمز */
export function BrandName({ sub }) {
  return <div className="brand-name">شاطر<small>{sub ?? 'Shater'}</small></div>
}
