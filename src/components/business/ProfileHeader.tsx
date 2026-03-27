'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  UserPlus,
  UserCheck,
  Settings,
  ImageIcon,
  Heart,
  Users,
  Camera,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PROFILE } from '@/constants/config'
import { uploadBannerAPI } from '@/lib/api-client'
import type { CreatorProfilePageData } from '@/types'
import { ProfileEditModal } from '@/components/business/ProfileEditModal'

interface ProfileHeaderProps {
  profile: CreatorProfilePageData
  onFollow: () => void
  isFollowPending: boolean
  onProfileUpdate?: () => void
}

export function ProfileHeader({
  profile,
  onFollow,
  isFollowPending,
  onProfileUpdate,
}: ProfileHeaderProps) {
  const t = useTranslations('CreatorProfile')
  const [showEditModal, setShowEditModal] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const { isOwnProfile, isFollowing } = profile.viewerRelation

  const handleBannerPick = () => {
    bannerInputRef.current?.click()
  }

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error(t('unsupportedImageType'))
      return
    }
    if (file.size > PROFILE.BANNER_MAX_SIZE_BYTES) {
      toast.error(t('bannerTooLarge'))
      return
    }

    setIsUploadingBanner(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const res = await uploadBannerAPI(dataUrl)
      setIsUploadingBanner(false)
      if (res.success) {
        toast.success(t('bannerUpdated'))
        onProfileUpdate?.()
      } else {
        toast.error(res.error ?? t('updateFailed'))
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const displayName = profile.displayName ?? profile.username
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <>
      {/* Banner — compact, warm tones */}
      <div className="relative w-full h-32 md:h-44 overflow-hidden group">
        {profile.bannerUrl ? (
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          /* Warm gradient fallback matching design system */
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-primary/4" />
        )}

        {/* Subtle warm overlay for cohesion when banner exists */}
        {profile.bannerUrl && (
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
        )}

        {/* Banner edit overlay */}
        {isOwnProfile && (
          <>
            <button
              type="button"
              onClick={handleBannerPick}
              disabled={isUploadingBanner}
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                {isUploadingBanner ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                {t('changeBanner')}
              </span>
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleBannerChange}
            />
          </>
        )}
      </div>

      {/* Profile info card — overlaps banner */}
      <div className="max-w-content mx-auto px-4 sm:px-6 -mt-16 pb-6 relative z-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={displayName}
                width={96}
                height={96}
                className="size-24 rounded-full object-cover border-4 border-background shadow-md ring-1 ring-border/40"
                unoptimized
              />
            ) : (
              <div className="size-24 rounded-full bg-primary/8 flex items-center justify-center border-4 border-background shadow-md ring-1 ring-border/40">
                <span className="text-2xl font-display font-bold text-primary/60">
                  {initial}
                </span>
              </div>
            )}
          </div>

          {/* Name + actions row */}
          <div className="flex-1 min-w-0 text-center sm:text-left pb-1">
            <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-1 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-foreground truncate">
                {displayName}
              </h1>
              <span className="text-sm text-muted-foreground font-mono">
                @{profile.username}
              </span>
            </div>

            {profile.bio && (
              <p className="mt-1.5 text-sm text-muted-foreground font-serif max-w-md leading-relaxed">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Action button — right aligned on desktop */}
          <div className="shrink-0 pb-1">
            {isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditModal(true)}
                className="rounded-full border-border/60 hover:border-primary/25 hover:bg-primary/5"
              >
                <Settings className="size-4" />
                {t('editProfile')}
              </Button>
            ) : (
              <Button
                variant={isFollowing ? 'outline' : 'default'}
                size="sm"
                onClick={onFollow}
                disabled={isFollowPending}
                className={cn(
                  'rounded-full',
                  isFollowing && 'text-muted-foreground border-border/60',
                )}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="size-4" />
                    {t('following')}
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    {t('follow')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Stats bar — warm accent pills */}
        <div className="flex items-center justify-center sm:justify-start gap-5 mt-4 sm:ml-30">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ImageIcon className="size-3.5 text-primary/60" />
            <span className="font-display font-semibold text-foreground">
              {profile.publicImageCount}
            </span>
            <span>{t('works')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Heart className="size-3.5 text-primary/60" />
            <span className="font-display font-semibold text-foreground">
              {profile.likeCount}
            </span>
            <span>{t('likes')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5 text-primary/60" />
            <span className="font-display font-semibold text-foreground">
              {profile.followerCount}
            </span>
            <span>{t('followers')}</span>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <ProfileEditModal
          currentProfile={{
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            bio: profile.bio,
            isPublic: profile.isPublic,
          }}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false)
            onProfileUpdate?.()
          }}
        />
      )}
    </>
  )
}
