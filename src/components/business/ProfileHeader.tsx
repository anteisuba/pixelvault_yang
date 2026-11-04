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
  FileText,
  MoreHorizontal,
} from '@/components/icons'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { PROFILE } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { uploadBannerAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import type { CreatorProfilePageData } from '@/types'
import { ProfileEditModal } from '@/components/business/ProfileEditModal'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { Link } from '@/i18n/navigation'

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
  const tNav = useTranslations('Navbar')
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
      if (typeof reader.result !== 'string') {
        setIsUploadingBanner(false)
        toast.error(t('updateFailed'))
        return
      }

      const dataUrl = reader.result
      const res = await uploadBannerAPI(dataUrl)
      setIsUploadingBanner(false)
      if (res.success) {
        toast.success(t('bannerUpdated'))
        onProfileUpdate?.()
      } else {
        toast.error(getApiErrorMessage(t, res, t('updateFailed')))
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const displayName = profile.displayName ?? profile.username

  return (
    <>
      {/* 封面：只有用户自己传过才画（ui-spec §1：⛔ 渐变横幅）。 */}
      {profile.bannerUrl ? (
        <div className="relative mx-4 mt-4 h-32 overflow-hidden rounded-20 sm:mx-6 md:h-44">
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
      ) : null}

      <div className="relative mx-auto max-w-content px-4 pt-6 pb-6 sm:px-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
          {/* ui-spec §9 Avatar：平圆、没边没影，没图写第一个字（64 档）。 */}
          <ProfileAvatar
            avatarUrl={profile.avatarUrl}
            name={displayName}
            size={64}
            className="size-16"
          />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <h1 className="truncate text-xl font-semibold text-foreground">
                {displayName}
              </h1>
              <span className="font-mono text-sm text-muted-foreground">
                @{profile.username}
              </span>
            </div>

            {profile.bio && (
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                {profile.bio}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isOwnProfile ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowEditModal(true)}
                  className="coarse:h-11"
                >
                  <Settings className="size-4" />
                  {t('editProfile')}
                </Button>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={handleBannerPick}
                  disabled={isUploadingBanner}
                  aria-label={t('changeBanner')}
                  title={t('changeBanner')}
                  className="coarse:size-11"
                >
                  {isUploadingBanner ? (
                    <Spinner size="md" />
                  ) : (
                    <Camera className="size-4" />
                  )}
                </Button>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleBannerChange}
                />
                {/* 手机（<1024）没有左栏底行那颗账号菜单：v10「我的」稿放在这一排。
                    提示词也收进「我的」（⛔ 不上底栏），「作品 | 提示词」分页做好之前
                    先在 ⚙ 旁边留一个入口。 */}
                <Link
                  href={ROUTES.PROMPTS}
                  aria-label={tNav('links.prompts')}
                  className={cn(
                    buttonVariants({ variant: 'secondary', size: 'icon-sm' }),
                    'lg:hidden coarse:size-11',
                  )}
                >
                  <FileText className="size-4" />
                </Link>
                <AccountMenu side="bottom" align="end">
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={tNav('settings')}
                    className="lg:hidden coarse:size-11"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </AccountMenu>
              </>
            ) : (
              <Button
                variant={isFollowing ? 'secondary' : 'default'}
                size="sm"
                onClick={onFollow}
                disabled={isFollowPending}
                className="coarse:h-11"
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

        <div className="mt-4 flex items-center justify-center gap-5 sm:justify-start">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ImageIcon className="size-3.5" />
            <span className="font-semibold text-foreground">
              {profile.publicImageCount}
            </span>
            <span>{t('works')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Heart className="size-3.5" />
            <span className="font-semibold text-foreground">
              {profile.likeCount}
            </span>
            <span>{t('likes')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5" />
            <span className="font-semibold text-foreground">
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
