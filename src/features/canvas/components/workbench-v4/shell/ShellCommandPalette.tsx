'use client'

/**
 * ⌘K 命令面板（S7 §7 · 画板 `ChromeAdd.dc.html` 的 520 宽 pop）：
 * **搜节点定位 · 新建四类 · 问助手 · 打开剪辑台 · 切项目**，一个入口。
 *
 * ⚠ 「新建」四类读的是与双击 / 右键 / 快捷键**同一张** `CANVAS_SHELL_QUICK_ADD`。
 * 底座是 `Command`（cmdk）原语：↑↓ / ↵ / 过滤全是它自带的，⛔ 不手写键盘导航。
 */

import { useMemo, useState } from 'react'
import {
  Bot,
  Film,
  ImageIcon,
  Mic2,
  Scissors,
  Settings2,
  Type,
  Upload,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  CANVAS_SHELL_LAYOUT,
  CANVAS_SHELL_PALETTE_MAX_ROWS,
  CANVAS_SHELL_QUICK_ADD,
} from '@/constants/canvas-shell'
import type { CanvasAddIntentId } from '@/constants/canvas-add-catalog'
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
} from '@/components/ui/command'

const KIND_ICONS = {
  [NODE_MEDIA_KIND_IDS.text]: Type,
  [NODE_MEDIA_KIND_IDS.image]: ImageIcon,
  [NODE_MEDIA_KIND_IDS.audio]: Mic2,
  [NODE_MEDIA_KIND_IDS.video]: Film,
} as const

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
  onSwitchProject,
  onManageChannels,
}: ShellCommandPaletteProps) {
  const t = useTranslations('StudioNode.shell.palette')
  const tAdd = useTranslations('StudioNode.shell.add')
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
              {CANVAS_SHELL_QUICK_ADD.map((entry) => {
                const Icon = KIND_ICONS[entry.kind]
                const kind = tAdd(entry.kind)
                return (
                  <CommandItem
                    key={entry.kind}
                    value={
                      trimmedQuery
                        ? t('create', { kind, query: trimmedQuery })
                        : t('createEmpty', { kind })
                    }
                    data-testid={`shell-command-create-${entry.kind}`}
                    onSelect={() => {
                      onAdd(entry.intentId)
                      close()
                    }}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      {trimmedQuery
                        ? t('create', { kind, query: trimmedQuery })
                        : t('createEmpty', { kind })}
                    </span>
                  </CommandItem>
                )
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
