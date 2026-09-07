'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AlertCircle, Trash2, Upload } from 'lucide-react'

import { PROFILE } from '@/constants/config'
import {
  CONTEXT_CARD_IMAGE_ROLES,
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KINDS,
  CONTEXT_CARD_KIND_IDS,
  CONTEXT_CARD_LIMITS,
  type ContextCardImageRoleId,
  type ContextCardKindId,
} from '@/constants/context-cards'
import { useContextCards } from '@/hooks/use-context-cards'
import { cn } from '@/lib/utils'
import type { ContextCard } from '@/types/context-cards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

/**
 * **上下文卡编辑器**（第三期 K1）——建 / 改一张角色卡、风格卡或品牌卡。
 *
 * ⚠ **卡的三档走页签，⛔ 不是三个对话框**：它们的字段一模一样（名字 / 摘要 /
 * 正文 / 参考图 / 硬否定 / 常挂），三份界面只会先长歪一份。
 * ⚠ **参考图要先有卡**：图走 R2，而 R2 上的 key 里带着卡 id。新卡因此是「先保存
 * 再传图」——上传区在没保存过的卡上说明这一点，⛔ 不让用户传完才发现丢了。
 * ⚠ **保存失败就地说话**（`role="alert"`）：`save()` 失败时什么都不发生的话，
 * 用户只看到弹层不关（persona 那次真机抓到的 bug 1，同一条判据）。
 * ⛔ **不接进 @ 面板**：入口（⋯ / 齿轮 / @ 面板里的卡片档）留给下一片。
 */

interface ContextCardDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** 给了就是编辑，缺席就是新建。 */
  card?: ContextCard | null
  /**
   * 当前工作台 / 域的 id —— 「常挂到这里」那颗开关认它。
   * 缺席时不画那颗开关（没有「这里」可挂）。
   */
  scope?: string
  onSaved?(card: ContextCard): void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

export function ContextCardDialog({
  open,
  onOpenChange,
  card = null,
  scope,
  onSaved,
}: ContextCardDialogProps) {
  const t = useTranslations('ContextCards')
  /**
   * ⚠ `enabled: false` —— 这颗弹层编的是**手上这一张**，⛔ 不为了打开一个编辑器
   * 去拉一遍整个卡表（列表是 @ 面板那一片的事）。
   */
  const cards = useContextCards({ enabled: false })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<ContextCardKindId>(
    card?.kind ?? CONTEXT_CARD_KIND_IDS.character,
  )
  const [name, setName] = useState(card?.name ?? '')
  const [summary, setSummary] = useState(card?.summary ?? '')
  const [body, setBody] = useState(card?.body ?? '')
  const [negative, setNegative] = useState(card?.negative ?? '')
  const [uploadRole, setUploadRole] = useState<ContextCardImageRoleId>(
    CONTEXT_CARD_IMAGE_ROLE_IDS.reference,
  )
  const [saved, setSaved] = useState<ContextCard | null>(card)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  /** 换一张卡（或从新建切到编辑）时把草稿整份换掉，⛔ 别把上一张的字留在框里。 */
  useEffect(() => {
    setKind(card?.kind ?? CONTEXT_CARD_KIND_IDS.character)
    setName(card?.name ?? '')
    setSummary(card?.summary ?? '')
    setBody(card?.body ?? '')
    setNegative(card?.negative ?? '')
    setSaved(card)
    setError(null)
  }, [card])

  const images = saved?.images ?? []
  const pinned = Boolean(scope && saved?.pinnedScopes.includes(scope))
  const canUpload =
    Boolean(saved) && images.length < CONTEXT_CARD_LIMITS.maxImages

  const handleSave = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('errorNameRequired'))
      return
    }

    setIsSaving(true)
    setError(null)
    const payload = {
      kind,
      name: trimmed,
      summary: summary.trim(),
      body,
      negative: negative.trim() ? negative.trim() : null,
    }
    const result = saved
      ? await cards.update(saved.id, payload)
      : await cards.create({ ...payload, pinnedScopes: [] })
    setIsSaving(false)

    if (!result) {
      // ⛔ 不静默关闭：失败时弹层留在原地，错误就地说出来。
      setError(cards.error ?? t('errorSaveFailed'))
      return
    }
    setSaved(result)
    onSaved?.(result)
    onOpenChange(false)
  }, [
    body,
    cards,
    kind,
    name,
    negative,
    onOpenChange,
    onSaved,
    saved,
    summary,
    t,
  ])

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !saved) return
      setIsUploading(true)
      setError(null)
      try {
        const imageData = await readFileAsDataUrl(file)
        const result = await cards.addImage(saved.id, {
          imageData,
          role: uploadRole,
        })
        if (!result) {
          setError(cards.error ?? t('errorUploadFailed'))
          return
        }
        setSaved(result)
      } catch {
        setError(t('errorUploadFailed'))
      } finally {
        setIsUploading(false)
      }
    },
    [cards, saved, t, uploadRole],
  )

  const handleRemoveImage = useCallback(
    async (url: string) => {
      if (!saved) return
      const result = await cards.removeImage(saved.id, url)
      if (!result) {
        setError(cards.error ?? t('errorUploadFailed'))
        return
      }
      setSaved(result)
    },
    [cards, saved, t],
  )

  const handlePin = useCallback(
    async (next: boolean) => {
      if (!saved || !scope) return
      const result = await cards.setPinned(saved.id, scope, next)
      if (!result) {
        setError(cards.error ?? t('errorSaveFailed'))
        return
      }
      setSaved(result)
    },
    [cards, saved, scope, t],
  )

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="flex flex-col gap-0 overflow-hidden p-0 lg:max-w-2xl"
        style={{
          maxHeight:
            'min(95svh, calc(100dvh - 2rem), calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
        }}
        mobileBodyClassName="px-0 pt-0"
      >
        <ResponsiveDialogHeader className="shrink-0 gap-1.5 px-4 pb-3 pr-12 pt-4 text-left lg:px-6 lg:pt-6">
          <ResponsiveDialogTitle className="text-base">
            {saved ? t('titleEdit') : t('titleNew')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-md">
            {t('description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 lg:px-6">
          {/* ── 卡的三档 ─────────────────────────────────────── */}
          <Tabs
            value={kind}
            onValueChange={(value) => setKind(value as ContextCardKindId)}
          >
            <TabsList className="grid w-full grid-cols-3">
              {CONTEXT_CARD_KINDS.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {t(`kind.${id}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="context-card-name">{t('nameLabel')}</Label>
            <Input
              id="context-card-name"
              value={name}
              maxLength={CONTEXT_CARD_LIMITS.maxNameChars}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="context-card-summary">{t('summaryLabel')}</Label>
            <Input
              id="context-card-summary"
              value={summary}
              maxLength={CONTEXT_CARD_LIMITS.maxSummaryChars}
              placeholder={t('summaryPlaceholder')}
              onChange={(event) => setSummary(event.target.value)}
            />
            {/* 摘要是**唯一每轮都进系统提示**的那段字 —— 说出来，用户才知道该写什么。 */}
            <p className="text-md text-muted-foreground">{t('summaryHint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="context-card-body">{t('bodyLabel')}</Label>
            <Textarea
              id="context-card-body"
              value={body}
              rows={8}
              maxLength={CONTEXT_CARD_LIMITS.maxBodyChars}
              placeholder={t(`bodyPlaceholder.${kind}`)}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="context-card-negative">{t('negativeLabel')}</Label>
            <Input
              id="context-card-negative"
              value={negative}
              maxLength={CONTEXT_CARD_LIMITS.maxNegativeChars}
              placeholder={t('negativePlaceholder')}
              onChange={(event) => setNegative(event.target.value)}
            />
            <p className="text-md text-muted-foreground">{t('negativeHint')}</p>
          </div>

          {/* ── 参考图 ───────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <span className="text-2sm font-semibold uppercase tracking-nav text-muted-foreground">
              {t('imagesLabel', {
                count: images.length,
                max: CONTEXT_CARD_LIMITS.maxImages,
              })}
            </span>

            {images.length > 0 ? (
              <ul className="grid grid-cols-4 gap-2">
                {images.map((image) => (
                  <li
                    key={image.url}
                    className="relative overflow-hidden rounded-md border border-border"
                  >
                    <Image
                      src={image.url}
                      alt={t(`role.${image.role}`)}
                      width={160}
                      height={160}
                      unoptimized
                      className="aspect-square size-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-background/80 px-1 py-0.5 text-center text-2sm text-muted-foreground">
                      {t(`role.${image.role}`)}
                    </span>
                    <button
                      type="button"
                      aria-label={t('removeImage')}
                      className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => void handleRemoveImage(image.url)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 上传的图算哪一档 —— sheet 是身份证据，reference 只是口味。 */}
            <ToggleGroup
              type="single"
              value={uploadRole}
              onValueChange={(value) =>
                value && setUploadRole(value as ContextCardImageRoleId)
              }
              className="w-full"
            >
              {CONTEXT_CARD_IMAGE_ROLES.map((role) => (
                <ToggleGroupItem key={role} value={role} className="flex-1">
                  {t(`role.${role}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canUpload || isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Spinner size="sm" />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                {t('uploadImage')}
              </Button>
              {!saved ? (
                <span className="text-md text-muted-foreground">
                  {t('saveBeforeUpload')}
                </span>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              data-testid="context-card-file"
              accept={PROFILE.SUPPORTED_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={(event) => {
                void handleFile(event.target.files?.[0])
                // 同一张图连传两次也要触发 change —— ⛔ 别忘了清值。
                event.target.value = ''
              }}
            />
          </section>

          {/* ── 常挂 ─────────────────────────────────────────── */}
          {scope ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="flex flex-col">
                <Label htmlFor="context-card-pin">{t('pinLabel')}</Label>
                <span className="text-md text-muted-foreground">
                  {t('pinHint')}
                </span>
              </div>
              <Switch
                id="context-card-pin"
                checked={pinned}
                disabled={!saved}
                onCheckedChange={(next) => void handlePin(next)}
              />
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className={cn(
                'flex items-center gap-1.5 text-md text-status-risk',
              )}
            >
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <ResponsiveDialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3 lg:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? <Spinner size="sm" /> : null}
            {t('save')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
