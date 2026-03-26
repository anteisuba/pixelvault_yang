'use client'
/* eslint-disable @next/next/no-img-element */

import type { StoryPanelRecord } from '@/types'

interface StoryScrollRendererProps {
  panels: StoryPanelRecord[]
}

export function StoryScrollRenderer({ panels }: StoryScrollRendererProps) {
  return (
    <div className="space-y-12">
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${index * 150}ms` }}
        >
          {/* Image */}
          {panel.generation?.url && (
            <div className="overflow-hidden rounded-3xl border border-border/50">
              <img
                src={panel.generation.url}
                alt={panel.generation.prompt}
                className="w-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Narration text */}
          {panel.narration && (
            <div className="mx-auto mt-6 max-w-2xl px-4">
              <p className="font-serif text-lg leading-relaxed text-foreground/90">
                {panel.narration}
              </p>
            </div>
          )}

          {/* Caption */}
          {panel.caption && (
            <div className="mx-auto mt-3 max-w-2xl px-4">
              <p className="text-center text-sm font-medium text-muted-foreground italic">
                {panel.caption}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
