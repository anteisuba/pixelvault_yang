'use client'

import { ArrowUpRight, Download, ImageIcon } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { galleryGenerationPath } from '@/constants/routes'
import { useImageEdit } from '@/contexts/image-edit-context'
import { Link } from '@/i18n/navigation'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { downloadRemoteAsset } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

function getFileExtension(imageUrl: string): string {
  try {
    const pathname = new URL(imageUrl).pathname
    const extension = pathname.split('.').pop()
    return extension && extension.length <= 5 ? extension : 'png'
  } catch {
    return 'png'
  }
}

/**
 * Shared result actions card rendered by every task page once a result exists.
 * Reads `result` straight from ImageEditContext; renders nothing when the task
 * hasn't produced output yet.
 */
export function EditResultActions() {
  const t = useTranslations('StudioImageEdit')
  const tErrors = useTranslations('Errors')
  const { result, isBusy, setSourceFromGeneration } = useImageEdit()

  const downloadResult = useCallback(async () => {
    if (!result || isBusy) return

    const extension = getFileExtension(result.imageUrl)
    const response = await downloadRemoteAsset(
      result.imageUrl,
      `pixelvault-edit-${result.task}.${extension}`,
    )

    if (!response.success) {
      toast.error(getApiErrorMessage(tErrors, response, t('downloadFailed')))
      window.open(result.imageUrl, '_blank', 'noopener,noreferrer')
    }
  }, [isBusy, result, t, tErrors])

  const useResultAsSource = useCallback(() => {
    if (!result?.generation) return
    setSourceFromGeneration(result.generation)
  }, [result, setSourceFromGeneration])

  if (!result) return null

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {t('resultActionsTitle')}
      </h2>
      <div className="mt-3 grid gap-2">
        <Button
          type="button"
          variant="outline"
          className="justify-start rounded-lg"
          disabled={isBusy}
          onClick={() => void downloadResult()}
        >
          <Download className="size-4" />
          {t('downloadResult')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="justify-start rounded-lg"
          disabled={isBusy || !result.generation}
          onClick={useResultAsSource}
        >
          <ImageIcon className="size-4" />
          {t('useResultAsSource')}
        </Button>
        {result.generation ? (
          <Button
            type="button"
            variant="outline"
            className="justify-start rounded-lg"
            asChild
          >
            <Link href={galleryGenerationPath(result.generation.id)}>
              <ArrowUpRight className="size-4" />
              {t('openSavedGeneration')}
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  )
}
