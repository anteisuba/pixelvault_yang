'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils'

interface PrivateProfileViewProps {
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export function PrivateProfileView({
  username,
  displayName,
  avatarUrl,
}: PrivateProfileViewProps) {
  const t = useTranslations('CreatorProfile')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-content mx-auto px-4 sm:px-6 pt-12 pb-20">
        <div className="flex flex-col items-center text-center">
          {/* Avatar */}
          <div className="relative size-24 rounded-full overflow-hidden bg-muted mb-4">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName ?? username}
                fill
                className="object-cover"
              />
            ) : (
              <div
                className={cn(
                  'size-full flex items-center justify-center',
                  'bg-accent/10 text-accent text-3xl font-heading font-bold',
                )}
              >
                {(displayName ?? username).charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name */}
          <h1 className="font-heading text-xl font-bold text-foreground mb-1">
            {displayName ?? username}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">@{username}</p>

          {/* Private indicator */}
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="size-14 rounded-full bg-muted/60 flex items-center justify-center">
              <Lock className="size-6 text-muted-foreground" />
            </div>
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {t('privateProfile')}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t('privateProfileHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
