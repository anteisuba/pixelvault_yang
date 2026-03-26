import { AlertCircle } from 'lucide-react'

interface ErrorAlertProps {
  title?: string
  message: string
  children?: React.ReactNode
}

/**
 * Standardized error alert with destructive styling.
 * Used in generation forms to display API errors.
 */
export function ErrorAlert({ title, message, children }: ErrorAlertProps) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        <p>{message}</p>
        {children}
      </div>
    </div>
  )
}
