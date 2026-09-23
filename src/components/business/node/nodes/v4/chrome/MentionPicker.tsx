'use client'

/**
 * 提示词栏里键入 `@` 时弹出来的**候选列表**（spec §1.7，画板 `VideoRefs.dc.html`
 * 正文里那几颗胶囊的来路）。
 *
 * 四类卡共用一份：形态与键盘都住在这里，⛔ 不让每张卡各写一个下拉。视频卡的候选
 * 是「参考轨上的序号项（`@图1`）+ 画布上的卡按 kind 分组」，图片 / 文本 / 音频卡
 * 传自己的清单进来即可 —— 这一层**不认识节点**。
 *
 * ── 两条纪律 ──────────────────────────────────────────────────────────
 * ① **纯呈现 + 受控**：高亮项、开关、落字都由 `NodePromptBar` 管（键盘事件必须与
 *    正文那只 textarea 在同一处判，⛔ 不在这里另接一套 document 监听）。
 * ② **不抢焦点**：点选走 `onPointerDown` 并 `preventDefault` —— 一旦 textarea 失焦，
 *    落字的光标位置就没了。
 */

import Image from 'next/image'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import type { MentionChipMedia } from './MentionChip'

export interface MentionPickerOption {
  readonly id: string
  /** 落进正文的名字（不含 `@`）。 */
  readonly name: string
  /** 分组标题（视频卡：参考轨 / 图 / 视频 / 语音 / 文本）。 */
  readonly groupLabel: string
  readonly media?: MentionChipMedia
}

export interface MentionPickerProps {
  readonly options: readonly MentionPickerOption[]
  /** 高亮的那一项（↑↓ 移动，↵ / Tab 落字）。 */
  readonly activeId: string | null
  onActiveChange(id: string): void
  onSelect(option: MentionPickerOption): void
  readonly ariaLabel: string
  readonly emptyLabel: string
  readonly className?: string
}

/** 语音没有缩略图，给三根柱子当波形小标（与 `MentionChip` 同一套）。 */
function WaveformGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-3.5 w-4 shrink-0 items-end justify-center gap-px text-foreground"
    >
      <i className="block h-1.5 w-0.5 rounded-full bg-current" />
      <i className="block h-3 w-0.5 rounded-full bg-current" />
      <i className="block h-2 w-0.5 rounded-full bg-current" />
    </span>
  )
}

function OptionThumb({ media }: { readonly media?: MentionChipMedia }) {
  if (!media) return null
  if (media.kind === 'audio') return <WaveformGlyph />
  if ('thumbnailUrl' in media && media.thumbnailUrl) {
    return (
      <Image
        src={media.thumbnailUrl}
        alt=""
        width={NODE_V4_CHROME.mentionThumbSize}
        height={NODE_V4_CHROME.mentionThumbSize}
        unoptimized
        className="size-4 shrink-0 rounded-xs object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-xs bg-surface-fill-track"
    />
  )
}

export function MentionPicker({
  options,
  activeId,
  onActiveChange,
  onSelect,
  ariaLabel,
  emptyLabel,
  className,
}: MentionPickerProps) {
  // 分组按**首次出现的顺序**，⛔ 不排序：调用方给的顺序就是语义顺序
  // （视频卡：先参考轨的序号项，再画布上的卡）。
  const groups: { label: string; items: MentionPickerOption[] }[] = []
  for (const option of options) {
    const last = groups[groups.length - 1]
    if (last && last.label === option.groupLabel) {
      last.items.push(option)
      continue
    }
    groups.push({ label: option.groupLabel, items: [option] })
  }

  return (
    <div
      data-node-chrome="mention-picker"
      className={cn(
        'absolute bottom-full left-0 z-30 mb-2 max-h-64 w-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-node-menu',
        className,
      )}
      // 点在列表空白处也不能夺走正文的焦点。
      onPointerDown={(event) => event.preventDefault()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ul role="listbox" aria-label={ariaLabel} className="flex flex-col">
        {options.length === 0 ? (
          <li className="px-2 py-1.5 text-2xs text-muted-foreground">
            {emptyLabel}
          </li>
        ) : null}
        {groups.map((group) => (
          <li key={group.label}>
            <p className="px-2 pt-1.5 pb-1 text-3xs tracking-node-sec text-muted-foreground">
              {group.label}
            </p>
            <ul className="flex flex-col">
              {group.items.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === activeId}
                    data-mention-option={option.id}
                    data-mention-option-active={
                      option.id === activeId ? 'true' : 'false'
                    }
                    onPointerEnter={() => onActiveChange(option.id)}
                    onPointerDown={(event) => {
                      event.preventDefault()
                      onSelect(option)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-2sm text-foreground',
                      option.id === activeId && 'bg-surface-fill',
                    )}
                  >
                    <OptionThumb
                      {...(option.media ? { media: option.media } : {})}
                    />
                    <span className="truncate">{option.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface MentionQuery {
  /** 正文里那个 `@` 的下标。 */
  readonly start: number
  /** `@` 与光标之间已经键入的字（可为空串）。 */
  readonly query: string
}

/** `@` 之后不再继续当查询词的字符：空白与中英文断句标点。 */
const QUERY_TERMINATORS = /[\s,.;:!?，。；：！？、）)】\]」』@]/

/**
 * 光标处在不在一个 `@` 查询里？**纯函数**（无 DOM），供提示词栏与测试共用。
 *
 * 判据：从光标往回找最近的 `@`，中间不能有终止符；`@` 前面可以是中文和图号，
 * 但不能接在 ASCII 单词后面，避免邮箱里也弹候选。
 */
export function readMentionQuery(
  value: string,
  caret: number,
): MentionQuery | null {
  const at = Math.min(Math.max(caret, 0), value.length)
  for (let index = at - 1; index >= 0; index -= 1) {
    const char = value[index] ?? ''
    if (char === '@') {
      const beforeWord = value.slice(0, index).match(/[A-Za-z0-9_]+$/)?.[0]
      if (beforeWord && /[A-Za-z_]/.test(beforeWord)) return null
      return { start: index, query: value.slice(index + 1, at) }
    }
    if (QUERY_TERMINATORS.test(char)) return null
  }
  return null
}

/** 按已键入的字过滤候选（大小写不敏感；空查询 = 全给）。 */
export function matchMentionOptions(
  options: readonly MentionPickerOption[],
  query: string,
): MentionPickerOption[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return [...options]
  return options.filter((option) => option.name.toLowerCase().includes(needle))
}
