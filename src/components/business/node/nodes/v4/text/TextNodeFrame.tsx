'use client'

/**
 * 文本节点的**画中框**（spec §2 / §1.11，画板 `Expanded.dc.html`，640 宽）。
 *
 * 顶栏 名字 · 角色分段（剧本 / 风格 / 角色）· 关闭；正文 Markdown 可编辑可 @；
 * 框底 读数「N 字 · M 段」+ 快捷键；最底一条只属于写作助手。⛔ 两种模型不混。
 *
 * 失焦即存（`set_text`）。⌘E 进编辑、⌘↵ 生图、Esc 收起（Esc 由 `NodeFrame` 管）。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  MentionInput,
  type MentionCandidate,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  NODE_SLOT_TEXT_ROLES,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import { NODE_V4_CHROME } from '@/constants/node-studio'

import { NodeFrame } from '../chrome'
import { TextAssistantBar } from './TextAssistantBar'
import { TextBody, type TextMentionMediaLookup } from './TextBody'
import { summarizeTextBody } from './text-summary'

export interface TextNodeFrameProps {
  readonly open: boolean
  onClose(): void
  readonly nodeId: string
  readonly title: string
  readonly body: string
  readonly role: NodeSlotTextRole | undefined
  onRoleChange(role: NodeSlotTextRole): void
  onSave(body: string): void
  onGenerateImage(): void
  readonly tokens: readonly MentionToken[]
  readonly candidates: readonly MentionCandidate[]
  onMentionSelect(candidate: MentionCandidate, handle: MentionInputHandle): void
  readonly mediaOf: TextMentionMediaLookup
  /** 打开时直接进编辑并插一个 `@`（工具条的「@ 提及」走这条）。 */
  readonly autoMention?: boolean
}

export function TextNodeFrame({
  open,
  onClose,
  nodeId,
  title,
  body,
  role,
  onRoleChange,
  onSave,
  onGenerateImage,
  tokens,
  candidates,
  onMentionSelect,
  mediaOf,
  autoMention = false,
}: TextNodeFrameProps) {
  const t = useTranslations('StudioNode.v4.text')
  const [editing, setEditing] = useState(autoMention)
  const [draft, setDraft] = useState(body)
  const editorRef = useRef<MentionInputHandle>(null)

  // 助手 `set_text` 落下来时把草稿跟上——渲染期同步（React 官方的「派生 state」
  // 写法），⛔ 不放 effect 里：那是一次多余的级联渲染。
  const [syncedBody, setSyncedBody] = useState(body)
  if (syncedBody !== body) {
    setSyncedBody(body)
    setDraft(body)
  }

  useEffect(() => {
    if (!editing) return
    editorRef.current?.focus()
    if (autoMention) editorRef.current?.insertText('@')
  }, [editing, autoMention])

  const summary = summarizeTextBody(body)
  const names = tokens.map((token) => token.name)

  const commit = () => {
    setEditing(false)
    if (draft !== body) onSave(draft)
  }

  return (
    <NodeFrame
      open={open}
      onClose={() => {
        if (editing && draft !== body) onSave(draft)
        onClose()
      }}
      title={title}
      width={NODE_V4_CHROME.frameWidth.text}
      titleExtra={
        <ToggleGroup
          type="single"
          variant="segmented"
          value={role ?? ''}
          onValueChange={(next) => {
            if (!next) return
            onRoleChange(next as NodeSlotTextRole)
          }}
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
      }
      footer={
        <div className="flex items-center justify-between">
          <span data-text-readout className="text-xs text-muted-foreground">
            {t('readout', {
              chars: summary.chars,
              paragraphs: summary.paragraphs,
            })}
          </span>
          <span className="flex gap-1.5 text-xs text-muted-foreground">
            <kbd className="rounded-sm border px-1.5 py-px font-sans">
              {t('shortcuts.edit')}
            </kbd>
            <kbd className="rounded-sm border px-1.5 py-px font-sans">
              {t('shortcuts.generate')}
            </kbd>
            <kbd className="rounded-sm border px-1.5 py-px font-sans">
              {t('shortcuts.collapse')}
            </kbd>
          </span>
        </div>
      }
      assistantBar={<TextAssistantBar nodeId={nodeId} />}
    >
      <div
        data-text-frame-body
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey)) return
          if (event.key.toLowerCase() === 'e') {
            event.preventDefault()
            setEditing(true)
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (editing && draft !== body) onSave(draft)
            onGenerateImage()
          }
        }}
        className="max-h-100 min-h-40 overflow-y-auto text-2sm leading-relaxed tracking-node-body"
      >
        {editing ? (
          <div onBlur={commit}>
            <MentionInput
              variant="canvas"
              ref={editorRef}
              value={draft}
              onValueChange={setDraft}
              tokens={[...tokens]}
              mentionCandidates={[...candidates]}
              aria-label={t('editAriaLabel')}
              onMentionSelect={(candidate) => {
                if (!editorRef.current) return
                onMentionSelect(candidate, editorRef.current)
              }}
              className="min-h-40 w-full rounded-xl p-0 text-2sm leading-relaxed corner-squircle"
            />
          </div>
        ) : (
          <div
            role="textbox"
            tabIndex={0}
            data-text-preview
            onDoubleClick={() => setEditing(true)}
          >
            <TextBody
              body={body || t('empty')}
              names={names}
              mediaOf={mediaOf}
            />
          </div>
        )}
      </div>
    </NodeFrame>
  )
}
