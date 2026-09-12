'use client'

/**
 * 收起态的文本卡卡面（spec §2，画板 `TextJimeng.dc.html` 方向 A）：一只**高文本框**。
 *
 * 正文在卡内滚（细滚动条走 globals.css 的全局档，⛔ 不另写一套）、底部 40px 渐隐，
 * 右下角一颗拖拽手柄改高。⛔ 不再六行截断 —— 长文不展开也能读完，那正是这一版的
 * 全部理由。
 *
 * 拖拽只在这里维护「拖到哪了」的**临时**高度：落值（写进节点数据、进撤销栈）是
 * 调用方的事（`onHeightCommit`）——这一层不认识节点、不发 op。
 *
 * ⚠ 画布是缩放的：屏幕上挪 10px ≠ 卡上长 10px。缩放比**从自己的盒子量**
 * （`getBoundingClientRect().height / offsetHeight`），⛔ 不去 ReactFlow 要 zoom：
 * 那会把一颗纯呈现件绑死在画布宿主上。
 */

import { useEffect, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'

import { NODE_V4_CARD } from '@/constants/node-studio'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
import { readTextDocMarkdown, useTextDocEditor } from './TextDocEditor'

export interface TextCardBodyProps {
  readonly body: string
  onSave(body: string): void
  readonly editAriaLabel: string
  /** 正文为空时那句提示。 */
  readonly emptyLabel: string
  /** 当前高（已经含拖拽中的临时值）。 */
  readonly height: number
  /** 拖拽中每一帧的高（调用方拿去当卡面高，让卡跟着手走）。 */
  onHeightPreview(next: number): void
  /** 松手时的高（与起手一样就不会调用）。 */
  onHeightCommit(next: number): void
  readonly resizeAriaLabel: string
}

function clampHeight(value: number): number {
  return Math.min(
    NODE_V4_CARD.textMaxHeight,
    Math.max(NODE_V4_CARD.textMinHeight, Math.round(value)),
  )
}

export function TextCardBody({
  body,
  onSave,
  editAriaLabel,
  emptyLabel,
  height,
  onHeightPreview,
  onHeightCommit,
  resizeAriaLabel,
}: TextCardBodyProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerY: number
    height: number
    scale: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const text = body.trim()

  const readScale = (): number => {
    const el = boxRef.current
    if (!el || el.offsetHeight <= 0) return 1
    const measured = el.getBoundingClientRect().height / el.offsetHeight
    return measured > 0 ? measured : 1
  }

  return (
    <div ref={boxRef} data-text-collapsed className="relative h-full">
      <div
        data-text-scroll
        onDoubleClick={(event) => {
          event.stopPropagation()
          setEditing(true)
        }}
        // `nowheel` = 卡内滚动时画布不跟着缩放（ReactFlow 的约定类）。
        className="nodrag nowheel h-full overflow-y-auto px-5 py-4.5"
      >
        {editing ? (
          <TextCardEditor
            body={body}
            ariaLabel={editAriaLabel}
            onSave={(next) => {
              if (next !== body) onSave(next)
              setEditing(false)
            }}
          />
        ) : text.length === 0 ? (
          <p className="text-md leading-relaxed tracking-node-body text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          /* ⚠ 卡面也**渲染** Markdown（owner 2026-09-12）：正文里存的是 `#` 与
             `**`，原样摊在卡上就是一堆记号 —— 与全屏文档同一套字号（`data-text-rich`），
             ⛔ 卡上一套、文档里另一套的话，同一段话在两处长得不一样。 */
          <div
            data-text-rich
            className="text-md leading-relaxed tracking-node-body"
          >
            <Markdown>{body}</Markdown>
          </div>
        )}
      </div>
      {/* 底部 40px 渐隐：从卡色渐到透明，⛔ 不挡滚动（`pointer-events-none`）。 */}
      <div
        aria-hidden
        data-text-fade
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
      />
      <button
        type="button"
        aria-label={resizeAriaLabel}
        data-text-resize
        data-dragging={dragging ? 'true' : undefined}
        className={cn(
          'nodrag nopan absolute right-1.5 bottom-1.5 size-2.5 cursor-ns-resize',
          'border-r-2 border-b-2 border-border',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        )}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          // ⚠ jsdom 没有指针捕获 —— 判一下再调，⛔ 不让单测因为环境缺一个 API 挂掉。
          event.currentTarget.setPointerCapture?.(event.pointerId)
          dragRef.current = {
            pointerY: event.clientY,
            height,
            scale: readScale(),
          }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          onHeightPreview(
            clampHeight(
              drag.height + (event.clientY - drag.pointerY) / drag.scale,
            ),
          )
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (!drag) return
          dragRef.current = null
          setDragging(false)
          const next = clampHeight(
            drag.height + (event.clientY - drag.pointerY) / drag.scale,
          )
          if (next !== drag.height) onHeightCommit(next)
        }}
        onPointerCancel={() => {
          const drag = dragRef.current
          if (!drag) return
          dragRef.current = null
          setDragging(false)
          onHeightPreview(drag.height)
        }}
      />
    </div>
  )
}

function TextCardEditor({
  body,
  ariaLabel,
  onSave,
}: {
  readonly body: string
  readonly ariaLabel: string
  onSave(body: string): void
}) {
  const editor = useTextDocEditor({
    body,
    ariaLabel,
    onBlurSave: onSave,
    onEditorChange: () => {},
  })

  useEffect(() => {
    editor?.commands.focus('end', { scrollIntoView: false })
  }, [editor])

  useEffect(() => {
    if (editor && body !== readTextDocMarkdown(editor)) {
      editor.commands.setContent(body, { emitUpdate: false })
    }
  }, [body, editor])

  return (
    <div
      className="nodrag nopan nowheel min-h-full text-md leading-relaxed tracking-node-body"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onSave(readTextDocMarkdown(editor))
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
