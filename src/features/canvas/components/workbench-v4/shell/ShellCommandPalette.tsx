'use client'

/**
 * ⌘K 命令面板（S7 §7 · 画板 `ChromeAdd.dc.html` 的 520 宽 pop）：
 * **搜节点定位 · 新建（全目录）· 问助手 · 打开剪辑台 · 切项目**，一个入口。
 *
 * ⚠ 「新建」是**全量可搜**的入口：直接渲染 `CANVAS_ADD_CATALOG` 全部十项（与加节点
 *   菜单 `CanvasAddMenu` 同一张目录、同一组序项序），⛔ 不另抄一张表；行尾字母走
 *   `canvasQuickAddLetter`。输入了字只按名字过滤，⛔ 不长「新建X「搜索词」」那种行。
 *   加节点的主路是那份菜单（双击 / 右键 / 底栏 ＋ / 空画布引导），⌘K 是键盘手的搜索入口。
 * 底座是 `Command`（cmdk）原语：↑↓ / ↵ / 过滤全是它自带的，⛔ 不手写键盘导航。
 */

import { useMemo, useState } from 'react'
import { Bot, Scissors, Table, Settings2, Upload } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  CANVAS_SHELL_LAYOUT,
  CANVAS_SHELL_PALETTE_MAX_ROWS,
  canvasQuickAddLetter,
} from '@/constants/canvas-shell'
import {
  CANVAS_ADD_CATALOG,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_SUBTYPE_LABELS } from '@/constants/node-studio'
import { formatShotDisplayName } from '@/lib/node-display-name'
import type { NodeV4, NodeWorkflowProjectSummary } from '@/types/node-workflow'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'

import { CANVAS_ADD_INTENT_ICONS } from '../../canvas-add-intent-icons'

export interface ShellCommandPaletteProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly nodes: readonly NodeV4[]
  readonly projects: readonly NodeWorkflowProjectSummary[]
  readonly currentProjectId: string
  onFocusNode(nodeId: string): void
  onAdd(intentId: CanvasAddIntentId): void
  /** 「上传素材…」：与双击第五颗、与右键「上传…」**同一件事**（S7 §7）。 */
  onUpload(): void
  onAskAssistant(query: string): void
  onOpenEditDesk(): void
  /** 画布上已经有镜头表了吗（决定那一条写「新建」还是「转到」）。 */
  readonly hasShotTable: boolean
  /** 镜头表：没有就在视口中央建一张，有了就把镜头移过去（H1）。 */
  onShotTable(): void
  onSwitchProject(projectId: string): void
  /** 「配置渠道与 key…」——跳 `/settings/keys`；外壳没挂时为 `null`，那一行不出现。 */
  readonly onManageChannels: (() => void) | null
}

export function ShellCommandPalette({
  open,
  onOpenChange,
  nodes,
  projects,
  currentProjectId,
  onFocusNode,
  onAdd,
  onUpload,
  onAskAssistant,
  onOpenEditDesk,
  hasShotTable,
  onShotTable,
  onSwitchProject,
  onManageChannels,
}: ShellCommandPaletteProps) {
  const t = useTranslations('StudioNode.shell.palette')
  const tAdd = useTranslations('StudioNode.shell.add')
  const tCatalog = useTranslations('StudioNode.addCatalog')
  const tKeys = useTranslations('ModelPicker')
  const [query, setQuery] = useState('')

  const entries = useMemo(
    () =>
      nodes.slice(0, undefined).map((node) => {
        const data = node.data
        return {
          id: node.id,
          name:
            data.kind === NODE_MEDIA_KIND_IDS.video
              ? formatShotDisplayName(data.label ?? data.name, data.shotNo)
              : data.name,
          typeLabel:
            NODE_V4_SUBTYPE_LABELS[`${data.kind}.${data.subtype}`] ??
            data.subtype,
        }
      }),
    [nodes],
  )

  const close = () => {
    onOpenChange(false)
    setQuery('')
  }

  if (!open) return null

  const trimmedQuery = query.trim()

  return (
    <>
      <button
        type="button"
        aria-label={t('title')}
        tabIndex={-1}
        onClick={close}
        className="pointer-events-auto absolute inset-0 z-canvas-transient cursor-default"
      />
      <div
        data-testid="shell-command-palette"
        style={{
          width: CANVAS_SHELL_LAYOUT.palettePopoverWidthPx,
          top: `calc(var(--canvas-topbar-h) * 2)`,
        }}
        className="pointer-events-auto absolute left-1/2 z-canvas-transient -translate-x-1/2 overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel shadow-node-menu"
      >
        <Command
          label={t('title')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('placeholder')}
            data-testid="shell-command-input"
          />
          <CommandList>
            <CommandEmpty>{t('empty')}</CommandEmpty>
            {entries.length > 0 ? (
              <CommandGroup heading={t('nodes')}>
                {entries
                  .slice(0, CANVAS_SHELL_PALETTE_MAX_ROWS)
                  .map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={`${entry.name} ${entry.typeLabel}`}
                      data-testid="shell-command-node"
                      onSelect={() => {
                        onFocusNode(entry.id)
                        close()
                      }}
                    >
                      <span className="truncate">{entry.name}</span>
                      <span className="ml-auto shrink-0 text-2xs text-node-muted">
                        {entry.typeLabel} · {t('locate')}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading={t('actions')}>
              {CANVAS_ADD_CATALOG.flatMap((group) => {
                // 大类词（「文本」「图片」…）仍要命中这一组下的每一项：目录组名 +
                // 原来四类行用的大类名都挂成附加关键字（两者在 en 里不同：Sound / Audio）。
                const groupKeywords = Array.from(
                  new Set([tCatalog(`groups.${group.id}`), tAdd(group.id)]),
                )
                return group.items.map((item) => {
                  const Icon = CANVAS_ADD_INTENT_ICONS[item.id]
                  const kind = tCatalog(`items.${item.labelKey}.label`)
                  const letter = canvasQuickAddLetter(item.id)
                  // 输入了字也只按名字过滤（⛔ 不再长「新建X「…」」那种把搜索词塞进去、
                  // 永远命中的行 —— 建出来的卡并不带那段字）。
                  const label = t('createEmpty', { kind })
                  return (
                    <CommandItem
                      key={item.id}
                      value={label}
                      keywords={groupKeywords}
                      data-testid={`shell-command-create-${item.id}`}
                      onSelect={() => {
                        onAdd(item.id)
                        close()
                      }}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{label}</span>
                      {letter ? (
                        <CommandShortcut
                          data-testid={`shell-command-create-shortcut-${item.id}`}
                        >
                          {letter.toUpperCase()}
                        </CommandShortcut>
                      ) : null}
                    </CommandItem>
                  )
                })
              })}
              <CommandItem
                value={t('upload')}
                data-testid="shell-command-upload"
                onSelect={() => {
                  onUpload()
                  close()
                }}
              >
                <Upload className="size-4 shrink-0" aria-hidden />
                <span>{t('upload')}</span>
              </CommandItem>
              <CommandItem
                value={
                  trimmedQuery
                    ? t('ask', { query: trimmedQuery })
                    : t('askEmpty')
                }
                data-testid="shell-command-ask"
                onSelect={() => {
                  onAskAssistant(trimmedQuery)
                  close()
                }}
              >
                <Bot className="size-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {trimmedQuery
                    ? t('ask', { query: trimmedQuery })
                    : t('askEmpty')}
                </span>
              </CommandItem>
              <CommandItem
                value={t('openEditDesk')}
                data-testid="shell-command-edit-desk"
                onSelect={() => {
                  onOpenEditDesk()
                  close()
                }}
              >
                <Scissors className="size-4 shrink-0" aria-hidden />
                <span>{t('openEditDesk')}</span>
              </CommandItem>
              <CommandItem
                value={hasShotTable ? t('goToShotTable') : t('newShotTable')}
                data-testid="shell-command-shot-table"
                onSelect={() => {
                  onShotTable()
                  close()
                }}
              >
                <Table className="size-4 shrink-0" aria-hidden />
                <span>
                  {hasShotTable ? t('goToShotTable') : t('newShotTable')}
                </span>
              </CommandItem>
              {onManageChannels ? (
                <CommandItem
                  value={tKeys('manageChannels')}
                  data-testid="shell-command-manage-channels"
                  onSelect={() => {
                    onManageChannels()
                    close()
                  }}
                >
                  <Settings2 className="size-4 shrink-0" aria-hidden />
                  <span>{tKeys('manageChannels')}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
            {projects.length > 1 ? (
              <CommandGroup heading={t('projects')}>
                {projects
                  .filter((project) => project.id !== currentProjectId)
                  .slice(0, CANVAS_SHELL_PALETTE_MAX_ROWS)
                  .map((project) => (
                    <CommandItem
                      key={project.id}
                      value={t('switchTo', { name: project.name })}
                      data-testid="shell-command-project"
                      onSelect={() => {
                        onSwitchProject(project.id)
                        close()
                      }}
                    >
                      <span className="truncate">
                        {t('switchTo', { name: project.name })}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </div>
    </>
  )
}
