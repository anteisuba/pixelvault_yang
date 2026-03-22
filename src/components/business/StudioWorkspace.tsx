'use client'

import { useState } from 'react'
import { ImageIcon, Film } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { GenerateForm } from '@/components/business/GenerateForm'
import VideoGenerateForm from '@/components/business/VideoGenerateForm'
import { cn } from '@/lib/utils'

type StudioMode = 'image' | 'video'

export function StudioWorkspace() {
  const [mode, setMode] = useState<StudioMode>('image')
  const t = useTranslations('StudioPage')

  return (
    <div className="space-y-6">
      {/* Mode switch — pill button group */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('image')}
          className={cn(
            'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
            mode === 'image'
              ? 'bg-foreground text-background'
              : 'border border-border/75 bg-background/50 text-foreground hover:bg-muted/30',
          )}
        >
          <ImageIcon className="size-4" />
          {t('modeImage')}
        </button>
        <button
          type="button"
          onClick={() => setMode('video')}
          className={cn(
            'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
            mode === 'video'
              ? 'bg-foreground text-background'
              : 'border border-border/75 bg-background/50 text-foreground hover:bg-muted/30',
          )}
        >
          <Film className="size-4" />
          {t('modeVideo')}
        </button>
      </div>

      {/* Form area */}
      {mode === 'image' ? <GenerateForm /> : <VideoGenerateForm />}
    </div>
  )
}
