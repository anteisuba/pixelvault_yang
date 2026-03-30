'use client'

import dynamic from 'next/dynamic'

import { HistoryPanel } from '@/components/business/HistoryPanel'
import { useStudioData } from '@/contexts/studio-context'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)

export function StudioVideoMode() {
  const { characters, projects } = useStudioData()

  return (
    <div
      role="tabpanel"
      id="studio-panel-video"
      aria-labelledby="studio-tab-video"
      className="space-y-4"
    >
      <VideoGenerateForm activeCharacterCards={characters.activeCards} />
      <HistoryPanel
        generations={projects.history}
        total={projects.historyTotal}
        hasMore={projects.historyHasMore}
        isLoading={projects.isLoadingHistory}
        onLoadMore={projects.loadMoreHistory}
      />
    </div>
  )
}
