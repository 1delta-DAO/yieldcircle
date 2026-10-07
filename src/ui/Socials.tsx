import { TELEGRAM_BLUE, TELEGRAM_D, TELEGRAM_URL, X_D, X_URL } from '../config/links'

const out = { target: '_blank', rel: 'noopener noreferrer', onClick: (e: React.MouseEvent) => e.stopPropagation() }

/** The community links: Telegram as a pill (its mark in its own blue, a label beside it), X as an icon button. */
export function Socials({ className = '', label = 'Join us on Telegram' }: { className?: string; label?: string }) {
  return (
    <div className={`socials ${className}`.trim()}>
      <a className="tg-link" href={TELEGRAM_URL} {...out}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d={TELEGRAM_D} fill={TELEGRAM_BLUE} /></svg><span>{label}</span>
      </a>
      <a className="x-link" href={X_URL} {...out} aria-label="YieldCircle on X" title="YieldCircle on X">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden><path d={X_D} fill="currentColor" /></svg>
      </a>
    </div>
  )
}
