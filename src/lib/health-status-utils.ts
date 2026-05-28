import type { ApiKeyHealthStatus } from '@/types'

export type HealthDotTheme = 'default' | 'node'

const HEALTH_DOT_COLORS: Record<
  HealthDotTheme,
  Record<ApiKeyHealthStatus, string>
> = {
  default: {
    available: 'bg-emerald-500',
    no_key: 'bg-amber-500',
    failed: 'bg-red-500',
    unknown: 'bg-muted-foreground/40',
  },
  node: {
    available: 'bg-emerald-400',
    no_key: 'bg-amber-400',
    failed: 'bg-red-400',
    unknown: 'bg-node-muted/45',
  },
}

export function getHealthDotClass(
  status: ApiKeyHealthStatus | undefined,
  theme: HealthDotTheme = 'default',
): string {
  if (!status) return 'bg-transparent'
  return HEALTH_DOT_COLORS[theme][status]
}

export type HealthLabelKey = 'available' | 'failed' | 'noKey' | 'unknown'

export function getHealthLabelKey(
  status: ApiKeyHealthStatus | undefined,
): HealthLabelKey | null {
  if (!status) return null
  switch (status) {
    case 'available':
      return 'available'
    case 'failed':
      return 'failed'
    case 'no_key':
      return 'noKey'
    case 'unknown':
      return 'unknown'
  }
}
