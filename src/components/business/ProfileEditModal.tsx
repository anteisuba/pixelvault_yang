'use client'

import { useId, useRef, useState, type ChangeEvent } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Loader2, Camera } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { PROFILE } from '@/constants/config'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { updateProfileAPI, uploadAvatarAPI } from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

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
  const tErrors = useTranslations('Errors')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const usernameInputRef = useRef<HTMLInputElement>(null)
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
  const usernameId = useId()
  const displayNameId = useId()
  const bioId = useId()
  const profileVisibilityId = useId()

  const displayedAvatar = avatarPreview ?? currentProfile.avatarUrl

  const handleAvatarPick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
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
      if (typeof reader.result !== 'string') {
        setError(t('updateFailed'))
        return
      }

      const dataUrl = reader.result
      setAvatarPreview(dataUrl)
      setAvatarFile(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)

    try {
      if (avatarFile) {
        const avatarRes = await uploadAvatarAPI(avatarFile)
        if (!avatarRes.success) {
          setError(
            getApiErrorMessage(tErrors, avatarRes, t('updateFailed')),
          )
          return
        }
      }

      const response = await updateProfileAPI({
        username: username !== currentProfile.username ? username : undefined,
        displayName: displayName || null,
        bio: bio || null,
        isPublic,
      })

      if (response.success) {
        toast.success(t('profileUpdated'))
        onSaved()
        return
      }

      setError(getApiErrorMessage(tErrors, response, t('updateFailed')))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[min(100%-2rem,34rem)] rounded-3xl border-border/70 bg-card p-0 shadow-2xl"
        closeLabel={t('close')}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          usernameInputRef.current?.focus()
        }}
      >
        <DialogHeader className="space-y-2 border-b border-border/70 px-6 py-5 text-left">
          <DialogTitle className="font-display text-xl font-semibold tracking-tight">
            {t('editProfile')}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground">
            {t('editProfileDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleAvatarPick}
              className="group relative size-20 overflow-hidden rounded-full border border-border/70 bg-muted transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label={t('changeAvatar')}
            >
              {displayedAvatar ? (
                <Image
                  src={displayedAvatar}
                  alt={displayName || username}
                  width={80}
                  height={80}
                  className="size-full object-cover"
                  unoptimized={!!avatarPreview}
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-primary/8">
                  <span className="font-display text-xl text-primary/60">
                    {(currentProfile.displayName ?? currentProfile.username)
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="size-5 text-white" />
              </div>
            </button>

            <div className="space-y-1">
              <p className="font-medium text-foreground">{t('changeAvatar')}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('unsupportedImageType')} {t('avatarTooLarge')}
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor={usernameId}
                className="text-sm font-medium text-foreground"
              >
                {t('username')}
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3">
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  id={usernameId}
                  ref={usernameInputRef}
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value.toLowerCase())
                  }
                  maxLength={PROFILE.USERNAME_MAX_LENGTH}
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  placeholder={t('usernamePlaceholder')}
                  autoComplete="username"
                />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {t('usernameHint')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={displayNameId}
                className="text-sm font-medium text-foreground"
              >
                {t('displayName')}
              </label>
              <Input
                id={displayNameId}
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={PROFILE.DISPLAY_NAME_MAX_LENGTH}
                placeholder={t('displayNamePlaceholder')}
                autoComplete="name"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={bioId}
                className="flex items-center justify-between gap-3 text-sm font-medium text-foreground"
              >
                <span>{t('bio')}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {bio.length}/{PROFILE.BIO_MAX_LENGTH}
                </span>
              </label>
              <Textarea
                id={bioId}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={PROFILE.BIO_MAX_LENGTH}
                rows={4}
                className="resize-none"
                placeholder={t('bioPlaceholder')}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="space-y-1">
                <label
                  htmlFor={profileVisibilityId}
                  className="text-sm font-medium text-foreground"
                >
                  {t('publicProfile')}
                </label>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t('publicProfileHint')}
                </p>
              </div>
              <button
                id={profileVisibilityId}
                type="button"
                role="switch"
                aria-checked={isPublic}
                onClick={() => setIsPublic((prev) => !prev)}
                className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  isPublic ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                    isPublic ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-4 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
