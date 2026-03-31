'use client'

import { memo, useCallback } from 'react'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { GenerationPreview } from './GenerationPreview'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

export const StudioRightPanel = memo(function StudioRightPanel({
  className,
}: {
  className?: string
}) {
  const { dispatch } = useStudioForm()
  const { projects, imageUpload } = useStudioData()
  const { isGenerating, lastGeneration } = useStudioGen()

  // Shared handler: add an image URL as a reference image + auto-open panel
  const handleUseAsRef = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
    },
    [imageUpload, dispatch],
  )

  const handleHistorySelect = useCallback(
    (gen: GenerationRecord) => {
      if (gen.outputType === 'IMAGE' && gen.url) {
        void handleUseAsRef(gen.url)
      }
    },
    [handleUseAsRef],
  )

  return (
    <div className={cn('space-y-4', className)}>
      {/* Generation status (aria-live for screen readers) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isGenerating
          ? 'Generating...'
          : lastGeneration
            ? 'Generation complete'
            : null}
      </div>

      {/* Hero preview — draggable + "use as reference" button */}
      <GenerationPreview onUseAsReference={handleUseAsRef} />

      {/* History grid — draggable + click-to-use-as-reference */}
      <HistoryPanel
        generations={projects.history}
        total={projects.historyTotal}
        hasMore={projects.historyHasMore}
        isLoading={projects.isLoadingHistory}
        onLoadMore={projects.loadMoreHistory}
        onSelect={handleHistorySelect}
      />
    </div>
  )
})
