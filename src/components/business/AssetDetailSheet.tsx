'use client'

import {
  Check,
  ExternalLink,
  FolderInput,
  Loader2,
  Mic,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import NextImage from 'next/image'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ROUTES } from '@/constants/routes'
import { Link, useRouter } from '@/i18n/navigation'
import {
  assignGenerationProjectAPI,
  deleteGenerationAPI,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { GenerationRecord, ProjectRecord } from '@/types'

interface AssetDetailSheetProps {
  generation: GenerationRecord | null
  onOpenChange: (open: boolean) => void
  /** Folders the user can move this generation into. */
  projects: ProjectRecord[]
  /** Called after a successful delete so the parent can prune the grid + refresh counts. */
  onDeleted?: (id: string) => void
  /** Called after a successful folder move so the parent can refresh the affected counts. */
  onMoved?: (id: string, projectId: string | null) => void
}

/**
 * Right-side detail panel for an /assets tile. Shows the preview, the
 * captured prompt/model/timing metadata, and three actions: Remix in
 * Studio (jumps to /studio/<mode>?remix=<id>), Move to Folder (assigns
 * the generation to a project), and Delete (with confirm).
 */
export function AssetDetailSheet({
  generation,
  onOpenChange,
  projects,
  onDeleted,
  onMoved,
}: AssetDetailSheetProps) {
  const t = useTranslations('AssetsPage')
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)

  const open = generation !== null

  const studioModeFor = (gen: GenerationRecord): 'image' | 'video' | 'audio' =>
    gen.outputType === 'VIDEO'
      ? 'video'
      : gen.outputType === 'AUDIO'
        ? 'audio'
        : 'image'

  const handleRemix = () => {
    if (!generation) return
    const mode = studioModeFor(generation)
    router.push(`/studio/${mode}?remix=${generation.id}`)
    onOpenChange(false)
  }

  const handleMove = async (projectId: string | null) => {
    if (!generation || isMoving) return
    if (generation.projectId === projectId) {
      onOpenChange(false)
      return
    }
    setIsMoving(true)
    const response = await assignGenerationProjectAPI(generation.id, projectId)
    setIsMoving(false)
    if (response.success) {
      toast.success(t('detailMoved'))
      onMoved?.(generation.id, projectId)
      onOpenChange(false)
    } else {
      toast.error(response.error ?? t('detailMoveFailed'))
    }
  }

  const handleDelete = async () => {
    if (!generation) return
    setIsDeleting(true)
    const response = await deleteGenerationAPI(generation.id)
    setIsDeleting(false)
    if (response.success) {
      toast.success(t('detailDeleted'))
      onDeleted?.(generation.id)
      onOpenChange(false)
    } else {
      toast.error(response.error ?? t('detailDeleteFailed'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:w-[480px] sm:max-w-[520px]"
      >
        {generation && (
          <>
            <SheetHeader className="px-5 pt-5 pb-3">
              <SheetTitle className="font-display text-base">
                {t('detailTitle')}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {t('detailDescription')}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <Preview generation={generation} />

              <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <Field
                  label={t('detailPrompt')}
                  value={generation.prompt || '—'}
                  multiline
                />
                <Field label={t('detailModel')} value={generation.model} />
                <Field
                  label={t('detailProvider')}
                  value={generation.provider}
                />
                <Field
                  label={t('detailDimensions')}
                  value={`${generation.width} × ${generation.height}`}
                />
                {generation.duration != null && (
                  <Field
                    label={t('detailDuration')}
                    value={`${generation.duration}s`}
                  />
                )}
                {generation.seed != null && (
                  <Field
                    label={t('detailSeed')}
                    value={String(generation.seed)}
                  />
                )}
                <Field
                  label={t('detailCreatedAt')}
                  value={new Date(generation.createdAt).toLocaleString()}
                />
              </dl>
            </div>

            <div className="shrink-0 border-t border-border/60 px-5 py-3">
              <Button
                variant="default"
                size="sm"
                className="w-full gap-1.5 rounded-full"
                onClick={handleRemix}
              >
                <Sparkles className="size-4" />
                {t('detailRemix')}
              </Button>
              <div className="mt-2 flex items-center gap-1">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={isMoving}
                    >
                      {isMoving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FolderInput className="size-4" />
                      )}
                      {t('detailMoveTo')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-72 w-56 overflow-y-auto"
                  >
                    <DropdownMenuItem
                      onClick={() => void handleMove(null)}
                      className={cn(
                        'gap-2',
                        generation.projectId == null && 'font-medium',
                      )}
                    >
                      <span className="flex w-4 shrink-0 items-center justify-center">
                        {generation.projectId == null && (
                          <Check className="size-3.5" />
                        )}
                      </span>
                      {t('detailMoveUnassigned')}
                    </DropdownMenuItem>
                    {projects.length > 0 && <DropdownMenuSeparator />}
                    {projects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => void handleMove(project.id)}
                        className={cn(
                          'gap-2',
                          generation.projectId === project.id && 'font-medium',
                        )}
                      >
                        <span className="flex w-4 shrink-0 items-center justify-center">
                          {generation.projectId === project.id && (
                            <Check className="size-3.5" />
                          )}
                        </span>
                        <span className="truncate">{project.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button asChild variant="ghost" size="sm" className="gap-1.5">
                  <Link href={`${ROUTES.GALLERY}/${generation.id}`}>
                    <ExternalLink className="size-4" />
                    {t('detailOpenInGallery')}
                  </Link>
                </Button>
                <ConfirmDialog
                  title={t('detailDeleteConfirmTitle')}
                  description={t('detailDeleteConfirmDescription')}
                  cancelLabel={t('detailDeleteCancel')}
                  confirmLabel={t('detailDelete')}
                  variant="destructive"
                  onConfirm={handleDelete}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      {t('detailDelete')}
                    </Button>
                  }
                />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Preview({ generation }: { generation: GenerationRecord }) {
  if (generation.outputType === 'VIDEO') {
    return (
      <video
        src={generation.url}
        controls
        playsInline
        className="aspect-video w-full rounded-lg border border-border/60 bg-muted/40 object-contain"
      />
    )
  }
  if (generation.outputType === 'AUDIO') {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
        <Mic className="size-10 text-muted-foreground" />
        <audio src={generation.url} controls className="w-full max-w-[360px]" />
      </div>
    )
  }
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border/60 bg-muted/40">
      <NextImage
        src={generation.url}
        alt={generation.prompt || generation.id}
        fill
        sizes="480px"
        className="object-contain"
      />
    </div>
  )
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <>
      <dt className="font-medium text-muted-foreground/80">{label}</dt>
      <dd
        className={
          multiline
            ? 'whitespace-pre-wrap break-words text-foreground'
            : 'break-words text-foreground'
        }
      >
        {value}
      </dd>
    </>
  )
}
