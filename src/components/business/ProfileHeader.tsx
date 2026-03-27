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
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  return (
    <>
      {/* Banner */}
      <div className="relative w-full h-40 md:h-56 bg-muted overflow-hidden group">
        {profile.bannerUrl ? (
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5" />
        )}

        {/* Banner edit overlay */}
        {isOwnProfile && (
          <>
            <button
              type="button"
              onClick={handleBannerPick}
              disabled={isUploadingBanner}
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
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

      <header className="max-w-content mx-auto px-4 -mt-12 pb-8 md:pb-12">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
          {/* Avatar — overlaps banner */}
          <div className="relative shrink-0">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={profile.displayName ?? profile.username}
                width={96}
                height={96}
                className="size-24 rounded-full object-cover border-4 border-background shadow-sm"
              />
            ) : (
              <div className="size-24 rounded-full bg-muted flex items-center justify-center border-4 border-background">
                <span className="text-2xl font-display text-muted-foreground">
                  {(profile.displayName ?? profile.username)
                    .charAt(0)
                    .toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center md:items-baseline gap-2 md:gap-4">
              <h1 className="text-2xl font-display font-bold tracking-tight">
                {profile.displayName ?? profile.username}
              </h1>
              <span className="text-sm text-muted-foreground font-mono">
                @{profile.username}
              </span>
            </div>

            {profile.bio && (
              <p className="mt-2 text-sm text-muted-foreground font-serif max-w-md">
                {profile.bio}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center md:justify-start gap-6 mt-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ImageIcon className="size-4" />
                <span className="font-medium text-foreground">
                  {profile.publicImageCount}
                </span>
                {t('works')}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Heart className="size-4" />
                <span className="font-medium text-foreground">
                  {profile.likeCount}
                </span>
                {t('likes')}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="size-4" />
                <span className="font-medium text-foreground">
                  {profile.followerCount}
                </span>
                {t('followers')}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-center md:justify-start gap-3">
              {isOwnProfile ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEditModal(true)}
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
                  className={cn(isFollowing && 'text-muted-foreground')}
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
        </div>
      </header>

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
