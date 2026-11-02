'use client'

/**
 * ⋯ 菜单里的**「归属角色…」**（音频卡把这条声音钉到一张角色卡上）。
 *
 * ── 它在答什么 ────────────────────────────────────────────────────────────
 * 多角色对白里，装配层要能生成 `{Name} (@AudioN)` 那个 token（同一条语义与
 * `AudioOwnerPicker` 的头注），否则送出去的只是一串无标签的 @Audio1/@Audio2。
 * v4 迁移把这个入口丢了（`ownerName` 只剩 `node-workflow-migrate-v4` 的存量读），
 * 这里把它补回卡上。
 *
 * ⚠ 候选**只来自画布上的角色卡**（`image` + `character` 子类），⛔ 不做手填：
 * 归属要能连回一张卡，随手打的名字连不回任何东西。清空 = 选「旁白」。
 * ⚠ 写入走 `set_field`（`ownerName` 在 `NODE_ASSISTANT_SETTABLE_FIELDS` 里），
 * ⛔ 不直接改节点。
 */

import { useTranslations } from 'next-intl'

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

/** 「不属于任何角色」那一档 —— 与 `AudioOwnerPicker` 的空值语义同一条。 */
const NONE_VALUE = '__none__'

export interface AudioOwnerMenuItemProps {
  readonly value: string | undefined
  /** 画布上的角色名（调用方从角色卡算好）。 */
  readonly candidates: readonly string[]
  onChange(next: string | undefined): void
}

export function AudioOwnerMenuItem({
  value,
  candidates,
  onChange,
}: AudioOwnerMenuItemProps) {
  const t = useTranslations('StudioNode.v4.audio.owner')

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-audio-more="owner">
        {t('title')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={value ?? NONE_VALUE}
          onValueChange={(next) =>
            onChange(next === NONE_VALUE ? undefined : next)
          }
        >
          <DropdownMenuRadioItem value={NONE_VALUE} data-audio-owner="none">
            {t('none')}
          </DropdownMenuRadioItem>
          {candidates.map((name) => (
            <DropdownMenuRadioItem
              key={name}
              value={name}
              data-audio-owner={name}
            >
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
