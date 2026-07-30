interface SLoopMarkProps {
  className?: string
  size?: 'sm' | 'md' | 'hero'
}

const sizeClasses = {
  sm: 'h-7 w-7 rounded-lg',
  md: 'h-16 w-16 rounded-xl',
  hero: 'h-24 w-24 rounded-[22px]',
}

const glyphClasses = {
  sm: 'h-4 w-4',
  md: 'h-10 w-10',
  hero: 'h-15 w-15',
}

/**
 * S-Loop's workspace mark: a continuous agent path shaped into an S,
 * contained by a broken orbit that represents an open tool loop.
 */
export function SLoopMark({ className = '', size = 'hero' }: SLoopMarkProps) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden border border-border bg-surface text-accent shadow-sm ${sizeClasses[size]} ${className}`}
      role="img"
      aria-label="S-Loop"
    >
      <span className="absolute inset-y-[22%] left-0 w-0.5 rounded-r-full bg-accent" />
      <span className="absolute inset-[9%] rounded-[inherit] border border-accent/8" />

      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={`relative ${glyphClasses[size]}`}
        aria-hidden="true"
      >
        <path
          d="M17.5 15.5A23 23 0 1 1 13 43.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.22"
        />
        <path
          d="M44.5 19.5c-4.1-4.2-11.6-5.6-17.2-2.8-6.7 3.3-7.4 11.3-.9 14.4l11.5 5.4c6.5 3.1 5.7 11.3-.9 14.2-5.7 2.5-13.3.8-17.5-3.8"
          stroke="currentColor"
          strokeWidth="5.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="45.7" cy="18.8" r="3.2" fill="currentColor" />
        <circle cx="18.2" cy="47.2" r="3.2" fill="currentColor" opacity="0.42" />
        <circle cx="50.5" cy="42.5" r="1.8" fill="currentColor" opacity="0.3" />
      </svg>

      {size === 'hero' && (
        <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_3px_rgb(var(--color-accent-rgb),0.1)]" />
      )}
    </div>
  )
}
