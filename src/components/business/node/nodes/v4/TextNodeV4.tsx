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
import { useEffect, useRef, useState } from 'react'

import { Markdown } from '@/components/ui/markdown'
import { NODE_V4_CARD } from '@/constants/node-studio'
import type { NodeV4, NodeV4TextData } from '@/types/node-workflow'

import { NODE_TEXT_DERIVE_ACTIONS, useNodeV4Canvas } from './NodeV4Context'
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
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  if (!node) return null
  const summary = textSummary(textData.body)

  return (
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
          <textarea
            ref={ref}
            value={draft}
            aria-label={t('editText')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false)
              if (draft !== textData.body) canvas.onEditText(id, draft)
            }}
            className="h-64 w-full resize-none rounded-md border bg-background p-2 font-mono text-xs"
          />
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
  )
}
