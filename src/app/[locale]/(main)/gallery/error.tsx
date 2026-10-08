'use client'

import { RouteErrorState } from '@/components/business/RouteErrorState'
import { ROUTES } from '@/constants/routes'

interface ErrorPageProps {
  error: Error & { digest?: string }
  retry: () => void
}

export default function GalleryErrorPage({ error, retry }: ErrorPageProps) {
  return (
    <RouteErrorState
      error={error}
      retry={retry}
      fallbackHref={ROUTES.GALLERY}
    />
  )
}
