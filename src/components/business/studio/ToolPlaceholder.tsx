'use client'

import {
  ArrowLeft,
  Palette,
  ScanSearch,
  Sparkles,
  Wand2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ToolKey = 'edit' | 'enhance' | 'analyze' | 'lora' | 'node'

const TOOL_ICONS: Record<ToolKey, LucideIcon> = {
  edit: Wand2,
  enhance: Sparkles,
  analyze: ScanSearch,
  lora: Palette,
  node: Workflow,
}

interface ToolPlaceholderProps {
  toolKey: ToolKey
  className?: string
}

/**
 * ToolPlaceholder — Krea-style "Coming Soon" landing for tool pages whose
 * implementation lands in a later phase (Edit / Enhance / Analyze / LoRA / Node).
 *
 * Visual mirrors Krea's empty-state tool pages: large icon + tool name,
 * one-line description, and a "Coming Soon" pill.
 *
 * Icons are resolved internally (rather than passed as props) because page.tsx
 * files are server components by default, and React components cannot cross
 * the server/client boundary as props in the App Router.
 */
export function ToolPlaceholder({ toolKey, className }: ToolPlaceholderProps) {
  const t = useTranslations(`StudioTools.tools.${toolKey}`)
  const tShared = useTranslations('StudioTools')
  const Icon = TOOL_ICONS[toolKey]

  return (
    <div
      className={cn(
        'flex min-h-[calc(100vh-3rem)] items-center justify-center px-6',
        className,
      )}
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/8 text-primary/70">
          <Icon className="size-8" strokeWidth={1.5} />
        </div>
        <h1 className="mb-3 font-display text-3xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="mb-6 leading-relaxed text-muted-foreground">
          {t('description')}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {tShared('comingSoon')}
        </span>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href="/studio/image">
              <ArrowLeft className="size-4" />
              {tShared('backToImage')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
