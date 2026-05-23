'use client'

import {
  ArrowUp,
  ChevronDown,
  FileText,
  ImagePlus,
  MessageCircleQuestion,
  Paintbrush,
  Plus,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '@/lib/utils'

interface StudioNodeAssistantDockProps {
  className?: string
}

export function StudioNodeAssistantDock({
  className,
}: StudioNodeAssistantDockProps) {
  const t = useTranslations('StudioNode.assistantDock')
  const [collapsed, setCollapsed] = useState(true)

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={cn(
          'pointer-events-auto absolute right-5 top-5 z-30 grid size-11 place-items-center rounded-full border border-white/[0.08] bg-[#181716] text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors hover:bg-[#22211f]',
          className,
        )}
        aria-label={t('title')}
        title={t('title')}
      >
        <Star className="size-4 text-amber-300" />
      </button>
    )
  }

  return (
    <aside
      className={cn(
        'pointer-events-auto absolute inset-y-5 right-5 z-30 flex w-[336px] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#181716] shadow-[0_20px_60px_rgba(0,0,0,0.5)]',
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-1.5 font-display text-[13px] font-bold text-foreground">
          <Star className="size-3.5 text-amber-300" />
          {t('title')}
        </div>
        <div className="flex items-center gap-1.5">
          <Chip icon={<Plus className="size-3" />} label={t('newChat')} />
          <Chip
            icon={<Users className="size-3" />}
            label={t('helperLabel')}
            dropdown
          />
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label={t('collapse')}
            title={t('collapse')}
            className="grid size-7 place-items-center rounded-md text-[#a6a098] transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span aria-hidden className="text-3xl leading-none">
          👋
        </span>
        <p className="mt-5 max-w-[240px] font-serif text-sm leading-6 text-[#a6a098]">
          <span className="font-display font-medium text-foreground/90">
            {t('greetingTitle')}
          </span>
          <br />
          {t('greetingBody')}
        </p>
      </div>

      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap justify-between gap-3 text-[12px] text-[#a6a098]">
          <SubLink
            icon={<Sparkles className="size-3.5" />}
            label={t('skillLibrary')}
          />
          <SubLink
            icon={<Paintbrush className="size-3.5" />}
            label={t('skillCommunity')}
          />
          <SubLink
            icon={<FileText className="size-3.5" />}
            label={t('styleGuide')}
          />
        </div>
      </div>

      <div className="m-3 mt-0 rounded-2xl border border-white/[0.08] bg-[#1f1d1b] p-3">
        <p className="min-h-[40px] text-[12px] leading-5 text-[#6f6a63]">
          {t('composerPlaceholder')}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="image"
              className="grid size-7 place-items-center rounded-md text-[#a6a098] transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ImagePlus className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="snippet"
              className="grid size-7 place-items-center rounded-md text-[#a6a098] transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <FileText className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Chip
              icon={<MessageCircleQuestion className="size-3" />}
              label={t('askChip')}
              dropdown
            />
            <button
              type="button"
              aria-label="send"
              disabled
              className="grid size-8 place-items-center rounded-full bg-white/20 text-[#0d0c0b]/60"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

interface ChipProps {
  icon?: React.ReactNode
  label: string
  dropdown?: boolean
}

function Chip({ icon, label, dropdown }: ChipProps) {
  return (
    <button
      type="button"
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#22211f] px-2.5 text-[11px] font-semibold text-[#a6a098] transition-colors hover:bg-[#2d2b28] hover:text-foreground/90"
    >
      {icon}
      <span>{label}</span>
      {dropdown && <ChevronDown className="size-3" />}
    </button>
  )
}

interface SubLinkProps {
  icon: React.ReactNode
  label: string
}

function SubLink({ icon, label }: SubLinkProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 font-display text-[12px] font-medium transition-colors hover:text-foreground/90"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
