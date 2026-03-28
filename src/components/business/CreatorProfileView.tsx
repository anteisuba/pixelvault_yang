'use client'

import { useCallback } from 'react'
import { Loader2 } from 'lucide-react'

import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { toggleGenerationVisibility } from '@/lib/api-client'
import { useCreatorProfile } from '@/hooks/use-creator-profile'
import { useLike } from '@/hooks/use-like'
import { useFollow } from '@/hooks/use-follow'
import { invalidateMyProfile } from '@/hooks/use-my-profile'
import { ProfileHeader } from '@/components/business/ProfileHeader'
import { PolaroidGrid } from '@/components/business/PolaroidGrid'
import type { CreatorProfilePageData } from '@/types'

interface CreatorProfileViewProps {
  username: string
  /** SSR-fetched initial data to avoid loading flash */
  initialData?: CreatorProfilePageData
}

export function CreatorProfileView({
  username,
  initialData,
}: CreatorProfileViewProps) {
  const tToasts = useTranslations('Toasts')

  const {
    profile,
    isLoading,
    error,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh,
  } = useCreatorProfile(username)

  // Use SSR data as fallback while client fetches
  const data = profile ?? initialData ?? null

  // Like handler — update local state optimistically
  const handleLikeSuccess = useCallback(
    (_generationId: string, _liked: boolean, _likeCount: number) => {
      refresh()
    },
    [refresh],
  )

  const { toggle: toggleLike, isPending: isLikePending } =
    useLike(handleLikeSuccess)

  // Follow handler
  const handleFollowSuccess = useCallback(
    (_targetUserId: string, _following: boolean, _followerCount: number) => {
      refresh()
    },
    [refresh],
  )

  const { toggle: toggleFollow, isPending: isFollowPending } =
    useFollow(handleFollowSuccess)

  const handleFollow = useCallback(() => {
    if (data?.viewerRelation.isOwnProfile) return
    if (data) {
      toggleFollow((data as { userId?: string }).userId ?? '')
    }
  }, [data, toggleFollow])

  const handleLike = useCallback(
    (generationId: string) => {
      if (!isLikePending) {
        toggleLike(generationId)
      }
    },
    [toggleLike, isLikePending],
  )

  const handlePin = useCallback(
    async (generationId: string) => {
      const result = await toggleGenerationVisibility(
        generationId,
        'isFeatured',
      )
      if (!result.success) {
        const msg =
          result.error === 'MAX_FEATURED_EXCEEDED'
            ? tToasts('featuredLimitReached')
            : tToasts('featuredFailed')
        toast.error(msg)
      } else {
        toast.success(
          tToasts(
            result.data?.isFeatured ? 'featuredAdded' : 'featuredRemoved',
          ),
        )
      }
      refresh()
    },
    [refresh, tToasts],
  )

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-background">
      <ProfileHeader
        profile={data}
        onFollow={handleFollow}
        isFollowPending={isFollowPending}
        onProfileUpdate={() => {
          invalidateMyProfile()
          refresh()
        }}
      />

      {/* Subtle divider */}
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="border-t border-border/40" />
      </div>

      <PolaroidGrid
        generations={data.generations}
        totalImages={data.total}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        onLike={handleLike}
        isOwnProfile={data.viewerRelation.isOwnProfile}
        onPin={data.viewerRelation.isOwnProfile ? handlePin : undefined}
        isEmpty={data.generations.length === 0}
      />
    </div>
  )
}
