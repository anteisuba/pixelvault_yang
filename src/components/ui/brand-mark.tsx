const TRANSFORMS = [
  'translateY(0.16rem) rotate(-12deg)',
  'translateY(0.35rem) rotate(12deg)',
  'translateY(-0.08rem) rotate(12deg)',
  'translateY(-0.25rem) rotate(-12deg)',
] as const

interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'grid',
        width: '1.5rem',
        height: '1.85rem',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.16rem',
      }}
    >
      {TRANSFORMS.map((t, i) => (
        <span
          key={i}
          style={{
            borderRadius: '9999px',
            background: 'var(--foreground)',
            transform: t,
          }}
        />
      ))}
    </span>
  )
}
