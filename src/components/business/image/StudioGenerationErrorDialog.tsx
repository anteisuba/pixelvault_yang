'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Pencil,
  RefreshCw,
  Shuffle,
  type LucideIcon,
} from 'lucide-react'

import {
  GENERATION_ERROR_CODES,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'
import type { GenerationErrorCode } from '@/constants/generation-errors'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface GenerationErrorInfo {
  message: string
  code?: GenerationErrorCode
}

type ErrorAction = 'retry' | 'switchModel' | 'configureKey' | 'editPrompt'

interface ErrorActionPair {
  primary: ErrorAction
  secondary: ErrorAction
}

interface ErrorActionConfig {
  labelKey: string
  Icon: LucideIcon
}

interface OptionalActionHandlers {
  onConfigureKey?: () => void
  onEditPrompt?: () => void
}

interface StudioGenerationErrorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  error: GenerationErrorInfo
  onRetry: () => void
  onSwitchModel: () => void
  onConfigureKey?: () => void
  onEditPrompt?: () => void
}

const DEFAULT_ERROR_ACTIONS: ErrorActionPair = {
  primary: 'retry',
  secondary: 'switchModel',
}

const ERROR_ACTIONS_BY_CODE: Partial<
  Record<GenerationErrorCode, ErrorActionPair>
> = {
  [GENERATION_ERROR_CODES.INVALID_API_KEY]: {
    primary: 'configureKey',
    secondary: 'switchModel',
  },
  [GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS]: {
    primary: 'configureKey',
    secondary: 'switchModel',
  },
  [GENERATION_ERROR_CODES.CONTENT_FILTERED]: {
    primary: 'editPrompt',
    secondary: 'switchModel',
  },
  [GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT]: DEFAULT_ERROR_ACTIONS,
  [GENERATION_ERROR_CODES.PROVIDER_OVERLOADED]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.MODEL_UNAVAILABLE]: {
    primary: 'switchModel',
    secondary: 'retry',
  },
  [GENERATION_ERROR_CODES.PROVIDER_TIMEOUT]: DEFAULT_ERROR_ACTIONS,
  [GENERATION_ERROR_CODES.CALLBACK_TIMEOUT]: DEFAULT_ERROR_ACTIONS,
  [GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT]: DEFAULT_ERROR_ACTIONS,
  [GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED]: DEFAULT_ERROR_ACTIONS,
  [GENERATION_ERROR_CODES.UNKNOWN]: DEFAULT_ERROR_ACTIONS,
}

const ERROR_ACTION_CONFIGS: Record<ErrorAction, ErrorActionConfig> = {
  retry: {
    labelKey: 'generationError.retry',
    Icon: RefreshCw,
  },
  switchModel: {
    labelKey: 'generationError.switchModel',
    Icon: Shuffle,
  },
  configureKey: {
    labelKey: 'generationError.configureKey',
    Icon: KeyRound,
  },
  editPrompt: {
    labelKey: 'generationError.editPrompt',
    Icon: Pencil,
  },
}

function resolveErrorActions(code?: GenerationErrorCode): ErrorActionPair {
  if (!code) {
    return DEFAULT_ERROR_ACTIONS
  }
  return ERROR_ACTIONS_BY_CODE[code] ?? DEFAULT_ERROR_ACTIONS
}

function normalizeAction(
  action: ErrorAction,
  handlers: OptionalActionHandlers,
): ErrorAction {
  if (action === 'configureKey' && !handlers.onConfigureKey) {
    return 'switchModel'
  }
  if (action === 'editPrompt' && !handlers.onEditPrompt) {
    return 'switchModel'
  }
  return action
}

function resolveAvailableActions(
  code: GenerationErrorCode | undefined,
  handlers: OptionalActionHandlers,
): ErrorAction[] {
  const actions = resolveErrorActions(code)
  const primary = normalizeAction(actions.primary, handlers)
  const secondary = normalizeAction(actions.secondary, handlers)

  return primary === secondary ? [primary] : [primary, secondary]
}

export function StudioGenerationErrorDialog({
  open,
  onOpenChange,
  error,
  onRetry,
  onSwitchModel,
  onConfigureKey,
  onEditPrompt,
}: StudioGenerationErrorDialogProps) {
  const t = useTranslations('StudioV2')
  const tErrors = useTranslations('Errors')
  const [detailsExpanded, setDetailsExpanded] = useState(false)

  const errorCode = error.code ?? parseGenerationErrorCode(error.message)
  const reasonKey = `generation.${errorCode}` as const
  const actions = resolveAvailableActions(errorCode, {
    onConfigureKey,
    onEditPrompt,
  })

  const handleAction = (action: ErrorAction) => {
    const callbackByAction: Record<ErrorAction, () => void> = {
      retry: onRetry,
      switchModel: onSwitchModel,
      configureKey: onConfigureKey ?? onSwitchModel,
      editPrompt: onEditPrompt ?? onSwitchModel,
    }

    onOpenChange(false)
    callbackByAction[action]()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="font-sans">
                {t('generationError.title')}
              </DialogTitle>
              <DialogDescription className="mt-1 font-serif">
                {tErrors(reasonKey)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setDetailsExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={detailsExpanded}
          >
            {detailsExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {t('generationError.viewDetails')}
          </button>
          {detailsExpanded && (
            <pre className="mt-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono">
              {error.message}
            </pre>
          )}
        </div>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
          {actions.map((action, index) => {
            const { Icon, labelKey } = ERROR_ACTION_CONFIGS[action]
            return (
              <Button
                key={action}
                variant={index === 0 ? 'default' : 'outline'}
                onClick={() => handleAction(action)}
                className="gap-2"
              >
                <Icon className="size-4" />
                {t(labelKey)}
              </Button>
            )
          })}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
