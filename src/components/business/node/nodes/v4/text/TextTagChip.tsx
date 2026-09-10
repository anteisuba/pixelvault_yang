'use client'

/**
 * 名字行最右那枚**标签图标**（spec §2，画板 `TextJimeng.dc.html`：「标签图标 =
 * 归属 / 子型，点开是 ⋯ 里那一段」）。
 *
 * 两段：**子型**（剧本 / 镜头说明 / 规则）**只读**——`set_subtype` 按设计只认 image
 * kind（换文本卡的子型等于换一张卡，见 `node-assistant-op-apply-v4` 那条 ⛔），
 * 这里⛔ 不为一颗标签图标另开一条改子型的暗路；**归属**（连进 `text` 槽时当什么用）
 * 可改，走 `set_field defaultRole`。
 *
 * ⚠ 归属这一段是从旧画中框顶栏搬过来的：全屏文档的顶栏只有 文件图标 · 名字.md ·
 * 下载 · ×（画板），那一段没地方放，也不该在全屏里才够得着 —— 它是这张卡的属性。
 */

import { Tag } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  NODE_SLOT_TEXT_ROLES,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import type { NodeV4TextSubtype } from '@/constants/node-types'

import { ChipPopover } from '../chrome'

/** 画板上的参数弹层宽（与「画面」chip 同一档）。 */
const TAG_POPOVER_WIDTH = 300

export interface TextTagChipProps {
  readonly subtype: NodeV4TextSubtype
  readonly role: NodeSlotTextRole | undefined
  onRoleChange(next: NodeSlotTextRole): void
}

export function TextTagChip({ subtype, role, onRoleChange }: TextTagChipProps) {
  const t = useTranslations('StudioNode.v4.text')

  return (
    <ChipPopover
      ariaLabel={t('tag.title')}
      width={TAG_POPOVER_WIDTH}
      trigger={
        <button
          type="button"
          data-text-tag-chip
          aria-label={t('tag.title')}
          className="nodrag nopan flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Tag aria-hidden className="size-4" />
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-3xs tracking-node-sec text-muted-foreground">
            {t('tag.subtype')}
          </span>
          <span data-text-subtype className="text-2sm text-foreground">
            {t(`subtypes.${subtype}`)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-3xs tracking-node-sec text-muted-foreground">
            {t('tag.role')}
          </span>
          <ToggleGroup
            type="single"
            variant="segmented"
            value={role ?? ''}
            onValueChange={(next) => {
              if (next) onRoleChange(next as NodeSlotTextRole)
            }}
            aria-label={t('tag.role')}
            className="flex-wrap"
          >
            {NODE_SLOT_TEXT_ROLES.map((item) => (
              <ToggleGroupItem
                key={item}
                value={item}
                data-text-role-option={item}
              >
                {t(`roles.${item}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
    </ChipPopover>
  )
}
