'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_SOURCES,
  LORA_TOAST_DURATION_MS,
  civitaiBaseModelToFamilySlug,
  familySlugToCivitaiBaseModel,
  familySlugToHuggingFaceFamily,
  huggingFaceFamilyToFamilySlug,
  isCivitaiBaseModelGeneratable,
  type LoraLibraryFamily,
  type LoraLibrarySource,
} from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import { useHuggingFaceLoraLibrary } from '@/hooks/use-huggingface-lora-library'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import type {
  CivitaiLoraLibraryItem,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { LoraLibraryCard } from './LoraLibraryCard'
import { LoraLibraryChipRow } from './LoraLibraryChipRow'
import { LoraLibrarySegmented } from './LoraLibrarySegmented'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'
import { LoraLibraryPagination } from './LoraLibraryPagination'

interface LoraLibraryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MINE_SOURCE = 'mine'
type ModalSource = LoraLibrarySource | typeof MINE_SOURCE

// S3 库 modal（方向 B「＋添加 LoRA」唤起·配屏 3）：分类库以对话框覆盖生成页，
// 即筛即挂不离开创作。三源 segmented（Civitai / HuggingFace / 我的）+ 分类/底模族
// chip 横排 + 卡网格 + 分页（Civitai 另有安全模式；「我的」无搜索/筛选/分页）。
// engine 直接跑各源 hook（浏览源不做 URL sync——那是「库」tab pane 的职责，modal
// 用独立实例避免污染生成页 URL），现有行 pane / 库 tab 零改动。
export function LoraLibraryModal({
  open,
  onOpenChange,
}: LoraLibraryModalProps) {
  const t = useTranslations('LoraWorkbench')
  const stack = useActiveLoraStack()
  // 「我的」= 收藏 + 训练；HF 挂载走「导入为收藏 → LoraAssetRecord → 挂栈」
  // （favoriteExternalLora 幂等：已收藏文件直接返回既有记录）。
  const { favoriteExternalLora, favoriteAssets, trainedAssets, isLoadingMine } =
    useLoraAssets()
  const [source, setSource] = useState<ModalSource>(
    LORA_LIBRARY_SOURCES.CIVITAI,
  )
  // 两浏览源 hook 都无条件调用（hooks 规则）；modal 只在打开时挂载，故仅在＋添加
  // 时各拉一次首页。共享形态（search / contentType / 分页 / load）经 lib 统一读，
  // 家族字段两源命名不同（civitai baseModel / hf baseModelFamily）单独分支。
  const civitai = useCivitaiLoraLibrary({})
  const hf = useHuggingFaceLoraLibrary({})
  const isMine = source === MINE_SOURCE
  const isHf = source === LORA_LIBRARY_SOURCES.HUGGINGFACE
  const lib = isHf ? hf : civitai
  // 「我的」不是有效的浏览源键——选项/lib 用 browseSource（mine 时回落 civitai，
  // 此时筛选/网格都不渲染，仅为让 index 类型合法）。
  const browseSource: LoraLibrarySource = isHf
    ? LORA_LIBRARY_SOURCES.HUGGINGFACE
    : LORA_LIBRARY_SOURCES.CIVITAI

  const mountedUrls = useMemo(
    () => new Set(stack.items.map((entry) => entry.asset.loraUrl)),
    [stack.items],
  )
  // 「我的」= 训练 + 收藏去重（同一把 LoRA 只出现一次）。
  const mineItems = useMemo(() => {
    const seen = new Set<string>()
    const out: LoraAssetRecord[] = []
    for (const asset of [...trainedAssets, ...favoriteAssets]) {
      if (seen.has(asset.id)) continue
      seen.add(asset.id)
      out.push(asset)
    }
    return out
  }, [trainedAssets, favoriteAssets])

  const typeOptions = useMemo(
    () =>
      LORA_CONTENT_TYPE_VALUES_BY_SOURCE[browseSource].map((value) => ({
        value,
        label: t(LORA_CONTENT_TYPE_LABEL_KEYS[value]),
      })),
    [browseSource, t],
  )
  const familyOptions = useMemo(
    () =>
      LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[browseSource].map((value) => ({
        value,
        label: t(LORA_LIBRARY_FAMILY_LABEL_KEYS[value]),
      })),
    [browseSource, t],
  )
  const familyValue = isHf
    ? huggingFaceFamilyToFamilySlug(hf.baseModelFamily)
    : civitaiBaseModelToFamilySlug(civitai.baseModel)
  const handleFamilyChange = useCallback(
    (slug: string) => {
      if (isHf) {
        hf.setBaseModelFamily(
          familySlugToHuggingFaceFamily(slug as LoraLibraryFamily),
        )
      } else {
        civitai.setBaseModel(
          familySlugToCivitaiBaseModel(slug as LoraLibraryFamily),
        )
      }
    },
    [civitai, hf, isHf],
  )

  const safeMode = civitai.nsfwFilter === 'safe'

  const handleUseCivitai = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      // 不可 fal hosted 出图的族（如 Anima DiT）——挂载会必然失败，改开 Civitai
      // 来源页（与行 pane handleUse 同策略）。
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      onOpenChange(false)
    },
    [onOpenChange, stack, t],
  )

  const handleUseHf = useCallback(
    async (item: HuggingFaceLoraSearchItem) => {
      // HF 一个模型可含多把 .safetensors（不同底模族）——卡片「使用」自动挑第一
      // 把有可用兼容底模的文件（行 pane 在展开详情里让用户手选，卡片走快捷路径）。
      const file =
        item.files.find((candidate) =>
          getCompatibleBases(candidate.baseModelFamily).some(
            (base) => base.available,
          ),
        ) ?? null
      if (!file) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      const record = await favoriteExternalLora({
        name: item.name,
        triggerWord: item.triggerWord,
        loraUrl: file.downloadUrl,
        type: item.type,
        baseModelFamily: file.baseModelFamily,
        provider: 'huggingface',
        coverImageUrl: item.coverImageUrl,
      })
      if (!record) return
      stack.push(record)
      toast.success(t('addedToStack', { name: record.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      onOpenChange(false)
    },
    [favoriteExternalLora, onOpenChange, stack, t],
  )

  const handleUseMine = useCallback(
    (asset: LoraAssetRecord) => {
      stack.push(asset)
      toast.success(t('addedToStack', { name: asset.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      onOpenChange(false)
    },
    [onOpenChange, stack, t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="space-y-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="sr-only">{t('tabs.library')}</DialogTitle>
            <LoraLibrarySegmented
              ariaLabel={t('librarySourceLabel')}
              value={source}
              onChange={setSource}
              options={[
                {
                  value: LORA_LIBRARY_SOURCES.CIVITAI,
                  label: t('librarySourceCivitai'),
                },
                {
                  value: LORA_LIBRARY_SOURCES.HUGGINGFACE,
                  label: t('librarySourceHuggingFace'),
                },
                { value: MINE_SOURCE, label: t('tabs.mine') },
              ]}
            />
            {!isMine ? (
              <>
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={lib.search}
                    onChange={(e) => lib.setSearch(e.target.value)}
                    placeholder={t('library.searchPlaceholder')}
                    className="h-9 pl-8 text-sm"
                    aria-label={t('library.searchPlaceholder')}
                  />
                </div>
                {/* 安全模式仅 Civitai（HF 无分级数据）。 */}
                {!isHf ? (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={safeMode}
                      onCheckedChange={(v) =>
                        civitai.setNsfwFilter(v ? 'safe' : 'unrestricted')
                      }
                      aria-label={t('library.safeMode')}
                    />
                    {t('library.safeMode')}
                  </label>
                ) : null}
              </>
            ) : null}
          </div>
          {!isMine ? (
            <>
              <LoraLibraryChipRow
                ariaLabel={t('typeFilterLabel')}
                options={typeOptions}
                value={lib.contentType}
                onChange={(value) =>
                  lib.setContentType(
                    value as (typeof typeOptions)[number]['value'],
                  )
                }
              />
              <LoraLibraryChipRow
                label={t('libraryFamilyFilter')}
                ariaLabel={t('baseModelFilterLabel')}
                options={familyOptions}
                value={familyValue}
                onChange={handleFamilyChange}
              />
            </>
          ) : null}
        </DialogHeader>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-4 py-4 transition-opacity',
            !isMine && lib.isRevalidating && lib.items.length > 0
              ? 'opacity-60'
              : 'opacity-100',
          )}
          aria-busy={isMine ? isLoadingMine : lib.isRevalidating}
        >
          {isMine ? (
            isLoadingMine ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" className="text-muted-foreground" />
              </div>
            ) : mineItems.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-center text-xs text-muted-foreground">
                {t('library.mineEmpty')}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {mineItems.map((asset) => (
                  <LoraLibraryCard
                    key={asset.id}
                    source="mine"
                    item={asset}
                    mounted={mountedUrls.has(asset.loraUrl)}
                    onUse={() => handleUseMine(asset)}
                  />
                ))}
              </div>
            )
          ) : lib.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          ) : lib.error && lib.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive" aria-hidden />
                {t('communityLoadFailed')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void lib.refresh()}
              >
                {t('refresh')}
              </Button>
            </div>
          ) : lib.items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-center text-xs text-muted-foreground">
              {t('communityEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {isHf
                ? hf.items.map((item) => (
                    <LoraLibraryCard
                      key={item.repoId}
                      source="huggingface"
                      item={item}
                      mounted={item.files.some((file) =>
                        mountedUrls.has(file.downloadUrl),
                      )}
                      onUse={() => void handleUseHf(item)}
                    />
                  ))
                : civitai.items.map((item) => (
                    <LoraLibraryCard
                      key={item.id}
                      source="civitai"
                      item={item}
                      mounted={mountedUrls.has(item.loraUrl)}
                      onUse={() => handleUseCivitai(item)}
                    />
                  ))}
            </div>
          )}
        </div>

        {!isMine ? (
          <div className="border-t border-border px-4 py-2.5">
            <LoraLibraryPagination
              page={lib.page}
              total={lib.total}
              hasNextPage={lib.hasNextPage}
              isBusy={lib.isRevalidating}
              onPreviousPage={lib.previousPage}
              onNextPage={lib.nextPage}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
