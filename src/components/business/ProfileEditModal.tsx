'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { X, Loader2, Camera } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { PROFILE } from '@/constants/config'
import { updateProfileAPI, uploadAvatarAPI } from '@/lib/api-client'

interface ProfileEditModalProps {
  currentProfile: {
    username: string
    displayName: string | null
    avatarUrl: string | null
    bio: string | null
    isPublic: boolean
  }
  onClose: () => void
  onSaved: () => void
}

export function ProfileEditModal({
  currentProfile,
  onClose,
  onSaved,
}: ProfileEditModalProps) {
  const t = useTranslations('CreatorProfile')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(currentProfile.username)
  const [displayName, setDisplayName] = useState(
    currentProfile.displayName ?? '',
  )
  const [bio, setBio] = useState(currentProfile.bio ?? '')
  const [isPublic, setIsPublic] = useState(currentProfile.isPublic)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayedAvatar = avatarPreview ?? currentProfile.avatarUrl

  const handleAvatarPick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setError(t('unsupportedImageType'))
      return
    }
    if (file.size > PROFILE.AVATAR_MAX_SIZE_BYTES) {
      setError(t('avatarTooLarge'))
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setAvatarPreview(dataUrl)
      setAvatarFile(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)

    // Upload avatar if changed
    if (avatarFile) {
      const avatarRes = await uploadAvatarAPI(avatarFile)
      if (!avatarRes.success) {
        setError(avatarRes.error ?? t('updateFailed'))
        setIsSaving(false)
        return
      }
    }

    const response = await updateProfileAPI({
      username: username !== currentProfile.username ? username : undefined,
      displayName: displayName || null,
      bio: bio || null,
      isPublic,
    })

    setIsSaving(false)

    if (response.success) {
      toast.success(t('profileUpdated'))
      onSaved()
    } else {
      setError(response.error ?? t('updateFailed'))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('editProfile')}
    >
      <div
        className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-display font-semibold">
            {t('editProfile')}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex justify-center mb-6">
          <button
            type="button"
            onClick={handleAvatarPick}
            className="group relative size-20 rounded-full overflow-hidden border-2 border-border hover:border-primary/30 transition-colors"
            title={t('changeAvatar')}
          >
            {displayedAvatar ? (
              <Image
                src={displayedAvatar}
                alt=""
                width={80}
                height={80}
                className="size-full object-cover"
                unoptimized={!!avatarPreview}
              />
            ) : (
              <div className="size-full bg-muted flex items-center justify-center">
                <span className="text-xl font-display text-muted-foreground">
                  {(currentProfile.displayName ?? currentProfile.username)
                    .charAt(0)
                    .toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="size-5 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Fields */}
        <div className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('username')}
            </label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                maxLength={PROFILE.USERNAME_MAX_LENGTH}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={t('usernamePlaceholder')}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('usernameHint')}
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('displayName')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={PROFILE.DISPLAY_NAME_MAX_LENGTH}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={t('displayNamePlaceholder')}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('bio')}
              <span className="text-muted-foreground font-normal ml-1">
                ({bio.length}/{PROFILE.BIO_MAX_LENGTH})
              </span>
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={PROFILE.BIO_MAX_LENGTH}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={t('bioPlaceholder')}
            />
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('publicProfile')}</p>
              <p className="text-xs text-muted-foreground">
                {t('publicProfileHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic(!isPublic)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isPublic ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                  isPublic ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
