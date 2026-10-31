export default function Logo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="شعار مؤقت">
      <circle cx="22" cy="22" r="22" fill="#5B43D6" />
      <circle cx="15" cy="19" r="4.5" fill="#fff" />
      <circle cx="29" cy="19" r="4.5" fill="#fff" />
      <circle cx="15.8" cy="19.6" r="2" fill="#2A1F6B" />
      <circle cx="29.8" cy="19.6" r="2" fill="#2A1F6B" />
      <path d="M15 29c2 2.6 12 2.6 14 0" stroke="#FFC24B" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}
