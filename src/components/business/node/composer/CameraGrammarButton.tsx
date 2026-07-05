'use client'

import { ChevronDown, Clapperboard } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CAMERA_GRAMMAR_GROUPS } from '@/constants/cinematic-grammar'

interface CameraGrammarButtonProps {
  /** Insert a film-language phrase at the prompt caret (plain text, §5 L1). */
  onInsert(phrase: string): void
}

/** §5 L1 运镜语法 — a ▾ button opening the shot-size / angle / movement chip
 *  vocabulary (from cinematic-grammar). Clicking a chip inserts its standard
 *  film term into the prompt as plain text. Zero learning curve. */
export function CameraGrammarButton({ onInsert }: CameraGrammarButtonProps) {
  const tc = useTranslations('StudioNode.videoComposer.cameraGrammar')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="nodrag inline-flex h-[26px] items-center gap-1 rounded-md border border-node-panel-inner px-2 text-2xs text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
        >
          <Clapperboard className="size-3" />
          {tc('label')}
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 space-y-2.5 rounded-xl border-node-panel-inner bg-node-panel/96 p-3 text-node-foreground shadow-node-panel backdrop-blur-xl"
      >
        {CAMERA_GRAMMAR_GROUPS.map((group) => (
          <div key={group.id} className="space-y-1.5">
            <p className="text-3xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {tc(`groups.${group.id}`)}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onInsert(chip)}
                  className="rounded-md border border-node-panel-inner bg-node-panel-soft px-2 py-1 text-2xs text-node-foreground transition-colors hover:border-node-edge hover:bg-node-panel-inner"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
