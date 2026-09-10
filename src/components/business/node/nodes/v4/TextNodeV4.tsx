'use client'

/**
 * 文本节点（`node-canvas-v2.md` §2，画板 `TextJimeng.dc.html` **方向 A**，
 * owner 2026-09-11 定稿）。
 *
 * 三态都摆在这里，卡内件在 `./text/`：
 * ① **收起** = 一只**高文本框**（320 宽 / 默认 480 高、卡内滚动 + 底部渐隐 +
 *    右下角拖高），名字行 = 「T」+ 名字 + 归属/子型标签图标；
 * ② **选中** = 工具条 `展开 · 下载 · ⋯` 居中悬卡上 + 助手栏居中在卡下
 *    （⛔ 多选时两条都不出）；
 * ③ **展开** = **全屏文档**（`text/TextDocOverlay`）。
 *
 * ⛔ 卡面上没有卡头、没有分段控件、没有派生按钮行 —— 那是 v3 旧骨架的形状，
 * 它已在 S11 删除，⛔ 不要复活。⛔ 也不要把六行截断与 640 画中框改回来：
 * 「长文不展开也能读」正是这一版的全部理由。
 */

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeSlotTextRole } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { renameStableNodeName } from '@/lib/node-display-name'
import type { MentionChipMedia, MentionPickerOption } from './chrome'
import type { NodeV4, NodeV4TextData } from '@/types/node-workflow'

import { NodeCardShell, portSpecOf, useNodeCardFlash } from './chrome'
import { useNodeV4Canvas } from './NodeV4Context'
import { buildMentionCandidates } from './NodeV4Mentions'
import { TextAssistantBar } from './text/TextAssistantBar'
import { TextCardBody } from './text/TextCardBody'
import { TextDocOverlay } from './text/TextDocOverlay'
import { TextNodeToolbar } from './text/TextNodeToolbar'
import { TextSplitMenuItem } from './text/TextSplitMenuItem'
import { TextTagChip } from './text/TextTagChip'
import { downloadTextNodeBody } from './text/text-download'

export function TextNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tText = useTranslations('StudioNode.v4.text')
  const canvas = useNodeV4Canvas()
  const textData = data as unknown as NodeV4TextData
  /** 别人「连到镜头」连到这张卡时那一下高亮（spec §1.13）。 */
  const flashed = useNodeCardFlash(id)
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  // ⋯ 菜单的「改名」走 `NodeCardShell` 的受控入口（每 +1 进一次编辑态）。
  const [renameRequest, setRenameRequest] = useState(0)
  /** 拖拽中的临时高（松手写进节点数据，见 `commitHeight`）。 */
  const [dragHeight, setDragHeight] = useState<number | null>(null)

  const candidates = useMemo(
    () =>
      buildMentionCandidates(canvas.nodes, id, (item) =>
        t(`mentionGroups.${item.data.kind}`),
      ),
    [canvas.nodes, id, t],
  )
  const mediaOf = useMemo(() => {
    const byName = new Map<string, MentionChipMedia>()
    for (const item of canvas.nodes) {
      const itemData = item.data
      if (itemData.kind === NODE_MEDIA_KIND_IDS.text) continue
      if (itemData.kind === NODE_MEDIA_KIND_IDS.audio) {
        byName.set(itemData.name, { kind: 'audio' })
        continue
      }
      byName.set(itemData.name, {
        kind: itemData.kind === NODE_MEDIA_KIND_IDS.video ? 'video' : 'image',
        ...(itemData.url ? { thumbnailUrl: itemData.url } : {}),
      })
    }
    return (name: string) => byName.get(name)
  }, [canvas.nodes])
  const mentionOptions = useMemo<MentionPickerOption[]>(
    () =>
      candidates.map((candidate) => {
        const media = mediaOf(candidate.name)
        return {
          id: candidate.id,
          name: candidate.name,
          groupLabel: candidate.groupLabel ?? '',
          ...(media ? { media } : {}),
        }
      }),
    [candidates, mediaOf],
  )

  if (!node) return null

  const expanded = canvas.expandedNodeId === id
  // 多选时两条浮层都收起来 —— 每张卡各弹一条是 v3 被抓到的老毛病
  // （判据与 `NodeV4SelectionToolbar` 同源）。
  const soloSelected = Boolean(selected) && canvas.selectedNodeIds.length <= 1
  const cardHeight =
    dragHeight ?? textData.cardHeight ?? NODE_V4_CARD.textCollapsedHeight

  const renameNode = (next: string): boolean => {
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== id)
        .map((item) => item.data.name),
    )
    const result = renameStableNodeName(textData.name, next, taken)
    if (!result.ok) return false
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: id,
      field: 'name',
      value: result.name,
    })
    return true
  }

  /**
   * 拖高落值：**一条 op 一批**（`onApplyBatch`）—— 拖一次 = 撤销栈上一条，
   * ⛔ 不在拖拽的每一帧发 op（那会把撤销栈灌成一串没人看得懂的 1px 变化）。
   */
  const commitHeight = (next: number) => {
    setDragHeight(null)
    void canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setField,
        target: id,
        field: 'cardHeight',
        value: next,
      },
    ])
  }

  return (
    <div className="relative">
      <TextNodeToolbar
        visible={soloSelected && !expanded}
        onExpand={() => canvas.onToggleExpanded(id)}
        onDownload={() => downloadTextNodeBody(textData.name, textData.body)}
        onDeriveShotImage={() => canvas.onDeriveFromText(id, 'shotImage')}
        onDeriveShot={() => canvas.onDeriveFromText(id, 'video')}
        onRename={() => setRenameRequest((count) => count + 1)}
        onClone={() =>
          void canvas.onApplyOp({
            op: NODE_ASSISTANT_OP_V4_IDS.addNode,
            kind: node.data.kind,
            subtype: node.data.subtype,
            ...(node.data.shotNo === undefined
              ? {}
              : { shotNo: node.data.shotNo }),
          })
        }
        splitItem={<TextSplitMenuItem node={node} />}
        onDelete={() =>
          void canvas.onApplyOp({
            op: NODE_ASSISTANT_OP_V4_IDS.delete,
            target: id,
          })
        }
      />

      <NodeCardShell
        name={textData.name}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        renameRequest={renameRequest}
        selected={Boolean(selected)}
        expanded={expanded}
        changed={canvas.changedNodeIds.includes(id) || flashed}
        width={NODE_V4_CARD.textCollapsedWidth}
        surfaceHeight={cardHeight}
        surfaceClassName="overflow-hidden"
        portSpec={portSpecOf(node)}
        nameLeading={
          <span
            aria-hidden
            data-text-mark
            className="shrink-0 px-0.5 text-xs font-semibold"
          >
            T
          </span>
        }
        nameTrailing={
          <TextTagChip
            subtype={textData.subtype}
            role={textData.defaultRole as NodeSlotTextRole | undefined}
            onRoleChange={(role) =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.setField,
                target: id,
                field: 'defaultRole',
                value: role,
              })
            }
          />
        }
      >
        <div
          className="h-full"
          onDoubleClick={() => canvas.onToggleExpanded(id)}
        >
          <TextCardBody
            body={textData.body}
            emptyLabel={tText('empty')}
            height={cardHeight}
            onHeightPreview={setDragHeight}
            onHeightCommit={commitHeight}
            resizeAriaLabel={tText('card.resize')}
          />
        </div>
      </NodeCardShell>

      {soloSelected && !expanded && (
        <div
          data-text-assistant-bar
          className="absolute top-full left-1/2 z-10 mt-2.5 w-90 -translate-x-1/2"
        >
          <TextAssistantBar nodeId={id} />
        </div>
      )}

      {/* 全屏文档自己 portal 到 body（`chrome/NodeFrame`），这里只管开合。 */}
      {expanded && (
        <TextDocOverlay
          open={expanded}
          onClose={() => canvas.onToggleExpanded(id)}
          nodeId={id}
          title={textData.name}
          body={textData.body}
          onSave={(body) => canvas.onEditText(id, body)}
          onDownload={() => downloadTextNodeBody(textData.name, textData.body)}
          mentionOptions={mentionOptions}
          onMentionSelect={(option, insertText) => {
            const picked = canvas.nodes.find((item) => item.id === option.id)
            // 文本节点粘原文，素材插一枚 `@名字` 胶囊——两条路径分家。
            insertText(
              picked?.data.kind === NODE_MEDIA_KIND_IDS.text
                ? picked.data.body
                : `@${option.name} `,
            )
          }}
        />
      )}
    </div>
  )
}
