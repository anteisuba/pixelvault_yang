'use client'

/**
 * 文本节点（node-canvas-v2 §2.4 · §8 派生）。
 *
 * 收起：首行作标题 + 「N 字 · M 段」。展开：默认**预览态**（渲染后的 Markdown），
 * 点「编辑」或 `Cmd+E` 切编辑态（等宽、软换行、⛔ 无双栏实时预览——400–560px 宽
 * 里两边都不够用）。编辑态失焦即存并回预览。
 */

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_TEXT_ROLES } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_CARD } from '@/constants/node-studio'
import type { NodeV4, NodeV4TextData } from '@/types/node-workflow'

import {
  MentionInput,
  type MentionInputHandle,
} from '../../composer/MentionInput'
import { NODE_TEXT_DERIVE_ACTIONS, useNodeV4Canvas } from './NodeV4Context'
import { buildMentionCandidates, buildMentionTokens } from './NodeV4Mentions'
import { NodeV4SelectionToolbar } from './NodeV4SelectionToolbar'
import { NodeV4Shell } from './NodeV4Shell'

export function textSummary(body: string): {
  title: string
  chars: number
  paragraphs: number
} {
  const lines = body.split('\n')
  const title = (lines.find((line) => line.trim().length > 0) ?? '').replace(
    /^#+\s*/,
    '',
  )
  const paragraphs = body
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0).length
  return { title, chars: body.replace(/\s/g, '').length, paragraphs }
}

export function TextNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const textData = data as unknown as NodeV4TextData
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(textData.body)
  // 助手 `set_text` 落下来时把草稿跟上——渲染期同步（React 官方的
  // 「派生 state」写法），⛔ 不放 effect 里：那是一次多余的级联渲染。
  const [syncedBody, setSyncedBody] = useState(textData.body)
  if (syncedBody !== textData.body) {
    setSyncedBody(textData.body)
    setDraft(textData.body)
  }
  const ref = useRef<MentionInputHandle>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  // `@` 的两份清单。⚠ 文本节点只进候选、不进胶囊——点它是把正文**原文粘进来**，
  // 粘完就是普通文字（owner 2026-08-10 定）。
  const tokens = useMemo(
    () => buildMentionTokens(canvas.nodes, id),
    [canvas.nodes, id],
  )
  const candidates = useMemo(
    () =>
      buildMentionCandidates(canvas.nodes, id, (item) =>
        t(`mentionGroups.${item.data.kind}`),
      ),
    [canvas.nodes, id, t],
  )

  if (!node) return null
  const summary = textSummary(textData.body)

  return (
    <>
      <NodeV4SelectionToolbar node={node} selected={selected} />
      <NodeV4Shell
        node={node}
        selected={selected}
        width={
          editing || canvas.expandedNodeId === id
            ? NODE_V4_CARD.expandedWidth
            : NODE_V4_CARD.textCollapsedWidth
        }
        collapsedBody={
          <div className="text-xs">
            <p className="truncate font-medium">
              {summary.title || t('untitledText')}
            </p>
            <p className="mt-1 text-2xs text-muted-foreground">
              {t('textMeta', {
                chars: summary.chars,
                paragraphs: summary.paragraphs,
              })}
            </p>
          </div>
        }
        expandedBody={
          editing ? (
            <div
              onBlur={() => {
                setEditing(false)
                if (draft !== textData.body) canvas.onEditText(id, draft)
              }}
            >
              <MentionInput
                ref={ref}
                value={draft}
                onValueChange={setDraft}
                tokens={tokens}
                mentionCandidates={candidates}
                aria-label={t('editText')}
                onMentionSelect={(candidate) => {
                  const picked = canvas.nodes.find(
                    (item) => item.id === candidate.id,
                  )
                  // 文本节点粘原文，素材插一枚 `@名字` 胶囊——两条路径分家，
                  // ⛔ 不给文本也发一枚指不到任何素材的胶囊。
                  if (picked?.data.kind === NODE_MEDIA_KIND_IDS.text) {
                    ref.current?.insertText(picked.data.body)
                  } else {
                    ref.current?.insertToken(candidate.name)
                  }
                }}
                className="h-64 w-full overflow-auto rounded-md border bg-background p-2 font-mono text-xs"
              />
            </div>
          ) : (
            <div
              data-markdown-preview
              onDoubleClick={() => setEditing(true)}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key.toLowerCase() === 'e'
                ) {
                  event.preventDefault()
                  setEditing(true)
                }
              }}
              role="textbox"
              tabIndex={0}
              className="max-h-80 overflow-auto text-xs"
            >
              <Markdown>{textData.body || t('untitledText')}</Markdown>
            </div>
          )
        }
        toolbar={
          <>
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="rounded border px-2 py-0.5 text-2xs"
            >
              {editing ? t('previewText') : t('editText')}
            </button>
            {/* 角色切换（C1 契约修正 2）：写的是节点的 `defaultRole`——「这段字连进
              镜头时默认当什么用」。⚠ 单条边上的角色仍以**边**为准（同一份文本
              可以在 A 镜当剧本、在 B 镜当风格），这里改的只是缺省值。 */}
            {NODE_SLOT_TEXT_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                data-text-role-option={role}
                aria-pressed={textData.defaultRole === role}
                onClick={() =>
                  void canvas.onApplyOp({
                    op: NODE_ASSISTANT_OP_V4_IDS.setField,
                    target: id,
                    field: 'defaultRole',
                    value: role,
                  })
                }
                className={cn(
                  'rounded border px-2 py-0.5 text-2xs',
                  textData.defaultRole === role &&
                    'border-primary text-primary',
                )}
              >
                {t(`textRoles.${role}`)}
              </button>
            ))}
            {NODE_TEXT_DERIVE_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                data-derive-action={action}
                onClick={() => canvas.onDeriveFromText(id, action)}
                className="rounded border px-2 py-0.5 text-2xs"
              >
                {t(`derive.${action}`)}
              </button>
            ))}
          </>
        }
      />
    </>
  )
}
