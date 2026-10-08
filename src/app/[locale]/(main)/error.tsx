'use client'

import { RouteErrorState } from '@/components/business/RouteErrorState'
import { ROUTES } from '@/constants/routes'

interface ErrorPageProps {
  error: Error & { digest?: string }
  retry: () => void
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  return (
    <RouteErrorState error={error} retry={retry} fallbackHref={ROUTES.HOME} />
  )
}
