'use client'

/**
 * 输入区左下那颗 **＋**（P4 第 4 项，owner 2026-10-16 定稿样张）。
 *
 * ⭐ 把原来并排的三颗图标（回形针 / 素材库 / `@`）收进一个弹层：
 *   上面一行**最近的图**（素材库最新几张，点一张直接 `@` 进输入框）+「全部」；
 *   下面三行：从素材挑图 / 上传文件 / @ 角色或素材。
 * ⛔ 没有「拍照」（owner 12:31 删掉）—— 手机上「上传文件」本来就能选相机。
 *
 * ⚠ 弹层从按钮正上方长出来（`side="top" align="start"`，原点跟着按钮），
 *   与模型 / 思考两颗 chip 是同一种弹法。
 * ⚠ 最近那一行**开着才取**：`useMentionLibrarySearch` 关着时一发都不打。
 * ⚠ 上传必须在点击这一拍里同步 `click()` 文件框：挪到下一拍浏览器会当成
 *   脚本弹窗拦掉。其余两样等弹层关了再做，⛔ 否则焦点被还回 ＋ 上、光标丢了。
 */

import { useState } from 'react'
import Image from 'next/image'
import { AtSign, Images, Paperclip, Plus } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { AssistantMentionCandidate } from '@/types/assistant-mention'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { useMentionLibrarySearch } from '@/hooks/use-assistant-mention-composer'
import { cn } from '@/lib/utils'

/** 最近那一行摆几张（窄面板 320 宽也放得下一行）。 */
const RECENT_IMAGE_COUNT = 5

interface StudioOperatorAddMenuProps {
  /** 点了最近那一行的一张：登记成 `@` 胶囊插进输入框。 */
  onPickRecent(candidate: AssistantMentionCandidate): void
  onOpenLibrary(): void
  onUpload(): void
  onMention(): void
}

const ROW_CLASS =
  'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-2sm text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'

export function StudioOperatorAddMenu({
  onPickRecent,
  onOpenLibrary,
  onUpload,
  onMention,
}: StudioOperatorAddMenuProps) {
  const t = useTranslations('StudioOperator.addMenu')
  const [open, setOpen] = useState(false)
  const library = useMentionLibrarySearch({
    enabled: open,
    query: '',
    folderId: null,
  })
  const recent = library.items
    .filter((item) => item.kind === 'image' && (item.thumb ?? item.url))
    .slice(0, RECENT_IMAGE_COUNT)

  /** 关掉弹层后再做：让焦点先回到输入框那一侧，而不是还给 ＋。 */
  const afterClose = (action: () => void) => {
    setOpen(false)
    window.setTimeout(action, 0)
  }

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          data-testid="operator-add-toggle"
          aria-label={t('label')}
          title={t('label')}
          data-state={open ? 'open' : 'closed'}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-surface-fill data-[state=open]:text-foreground motion-reduce:transition-none coarse:size-11"
        >
          <Plus
            className={cn(
              'size-4 transition-transform duration-fast ease-standard motion-reduce:transition-none',
              open && 'rotate-45',
            )}
            aria-hidden
          />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        side="top"
        align="start"
        label={t('label')}
        onCloseAutoFocus={(event) => event.preventDefault()}
        /* 三层玻璃③：浮层（与模型 / 思考 chip 同一身）。 */
        className="w-64 rounded-xl border-assistant-line-strong p-0 assistant-glass-overlay shadow-assistant-overlay"
        mobileClassName="px-0"
      >
        <div
          data-testid="operator-add-menu"
          className="flex flex-col gap-0.5 p-1.5"
        >
          <div className="flex items-center justify-between px-2.5 pt-1 pb-1.5">
            <span className="text-2xs text-muted-foreground">
              {t('recent')}
            </span>
            <button
              type="button"
              data-testid="operator-add-all"
              onClick={() => {
                setOpen(false)
                onOpenLibrary()
              }}
              className="rounded-md px-1.5 text-2xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('all')}
            </button>
          </div>
          <div
            data-testid="operator-add-recent"
            className="flex min-h-12 gap-1.5 px-2.5 pb-1.5"
          >
            {recent.length > 0 ? (
              recent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  data-testid="operator-add-recent-item"
                  onClick={() => afterClose(() => onPickRecent(item))}
                  className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-transform duration-fast ease-standard hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <Image
                    src={item.thumb ?? item.url ?? ''}
                    alt={item.label}
                    fill
                    sizes="40px"
                    unoptimized
                    className="object-cover"
                  />
                </button>
              ))
            ) : (
              <span className="self-center text-2xs text-muted-foreground">
                {library.loading ? t('loading') : t('empty')}
              </span>
            )}
          </div>
          <div className="mx-1 border-t border-border/60" />
          <button
            type="button"
            data-testid="operator-add-library"
            onClick={() => {
              setOpen(false)
              onOpenLibrary()
            }}
            className={ROW_CLASS}
          >
            <Images className="size-4 text-muted-foreground" aria-hidden />
            {t('library')}
          </button>
          <button
            type="button"
            data-testid="operator-add-upload"
            onClick={() => {
              // ⚠ 同步点文件框（见头注），之后再关弹层。
              onUpload()
              setOpen(false)
            }}
            className={ROW_CLASS}
          >
            <Paperclip className="size-4 text-muted-foreground" aria-hidden />
            {t('upload')}
          </button>
          <button
            type="button"
            data-testid="operator-add-mention"
            onClick={() => afterClose(onMention)}
            className={ROW_CLASS}
          >
            <AtSign className="size-4 text-muted-foreground" aria-hidden />
            {t('mention')}
          </button>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
