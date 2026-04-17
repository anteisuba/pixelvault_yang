/**
 * Unified toast helper — wraps `sonner` to enforce consistent usage.
 *
 * Business code MUST use these helpers instead of `import { toast } from 'sonner'`.
 * This ensures consistent styling and future-proofs for i18n integration.
 */

import { toast, type ExternalToast } from 'sonner'

export function toastSuccess(message: string, options?: ExternalToast) {
  return toast.success(message, options)
}

export function toastError(message: string, options?: ExternalToast) {
  return toast.error(message, options)
}

export function toastLoading(message: string, options?: ExternalToast) {
  return toast.loading(message, options)
}

export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: unknown) => string)
  },
) {
  return toast.promise(promise, messages)
}

/** Dismiss a specific toast or all toasts */
export function toastDismiss(toastId?: string | number) {
  return toast.dismiss(toastId)
}
