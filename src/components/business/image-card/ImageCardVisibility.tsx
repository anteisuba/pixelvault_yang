import { Globe2, LockKeyhole, Pin } from 'lucide-react'

import { cn } from '@/lib/utils'

type ToggleField = 'isPublic' | 'isPromptPublic' | 'isFeatured'

interface ImageCardVisibilityProps {
  isPublic: boolean
  isPromptPublic: boolean
  isFeatured: boolean
  togglingField: ToggleField | null
  onToggle: (field: ToggleField) => void
  labelClass: string
  isDenseLocale: boolean
  labels: {
    imageVisibilityLabel: string
    promptVisibilityLabel: string
    featuredLabel: string
    publicLabel: string
    privateLabel: string
    makePublicAction: string
    makePrivateAction: string
    featuredOn: string
    featuredOff: string
    pinAction: string
    unpinAction: string
  }
}

export function ImageCardVisibility({
  isPublic,
  isPromptPublic,
  isFeatured,
  togglingField,
  onToggle,
  labelClass,
  isDenseLocale,
  labels,
}: ImageCardVisibilityProps) {
  const actionClass = cn(
    'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
    isDenseLocale
      ? 'tracking-normal normal-case'
      : 'uppercase tracking-nav-dense',
    togglingField !== null && 'opacity-50',
  )

  return (
    <dl className="grid gap-2">
      <div className="flex items-start justify-between gap-3 pt-0.5">
        <dt className={labelClass}>{labels.imageVisibilityLabel}</dt>
        <dd className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            {isPublic ? (
              <Globe2 className="size-3 text-chart-2" />
            ) : (
              <LockKeyhole className="size-3 text-muted-foreground" />
            )}
            {isPublic ? labels.publicLabel : labels.privateLabel}
          </span>
          <button
            type="button"
            disabled={togglingField !== null}
            onClick={() => void onToggle('isPublic')}
            className={actionClass}
          >
            {isPublic ? labels.makePrivateAction : labels.makePublicAction}
          </button>
        </dd>
      </div>
      <div className="flex items-start justify-between gap-3">
        <dt className={labelClass}>{labels.promptVisibilityLabel}</dt>
        <dd className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            {isPromptPublic ? (
              <Globe2 className="size-3 text-chart-2" />
            ) : (
              <LockKeyhole className="size-3 text-muted-foreground" />
            )}
            {isPromptPublic ? labels.publicLabel : labels.privateLabel}
          </span>
          <button
            type="button"
            disabled={togglingField !== null}
            onClick={() => void onToggle('isPromptPublic')}
            className={actionClass}
          >
            {isPromptPublic
              ? labels.makePrivateAction
              : labels.makePublicAction}
          </button>
        </dd>
      </div>
      <div className="flex items-start justify-between gap-3">
        <dt className={labelClass}>{labels.featuredLabel}</dt>
        <dd className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <Pin
              className={cn(
                'size-3',
                isFeatured ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            {isFeatured ? labels.featuredOn : labels.featuredOff}
          </span>
          <button
            type="button"
            disabled={togglingField !== null}
            onClick={() => void onToggle('isFeatured')}
            className={actionClass}
          >
            {isFeatured ? labels.unpinAction : labels.pinAction}
          </button>
        </dd>
      </div>
    </dl>
  )
}
