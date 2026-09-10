'use client'

/**
 * 画中框里那份**正文**（spec §2「正文即 Markdown 文档可编辑、可 @」，画板 `Expanded.dc.html`）。
 *
 * 静态态复用全站的 `Markdown` 渲染件，只把**段落与列表项里的 `@` 引用**换成 S0 的
 * `MentionChip`（解析走 S0 的 `parseMentions`，⛔ 不在这里另写一套语法）。
 * ⛔ 不做双栏实时预览：640 宽里两边都不够用。
 */

import { Fragment, isValidElement, type ReactNode } from 'react'

import { Markdown } from '@/components/ui/markdown'

import { MentionChip, parseMentions, type MentionChipMedia } from '../chrome'

export type TextMentionMediaLookup = (
  name: string,
) => MentionChipMedia | undefined

/** 把 ReactNode 里的**字符串叶子**切成 text / mention 段。其余节点原样递归。 */
export function renderTextMentions(
  node: ReactNode,
  names: readonly string[],
  mediaOf: TextMentionMediaLookup,
  keyPrefix = 'm',
): ReactNode {
  if (typeof node === 'string') {
    const segments = parseMentions(node, { names })
    if (segments.every((segment) => segment.type === 'text')) return node
    return segments.map((segment, index) =>
      segment.type === 'text' ? (
        <Fragment key={`${keyPrefix}-${index}`}>{segment.value}</Fragment>
      ) : (
        <MentionChip
          key={`${keyPrefix}-${index}`}
          name={segment.name}
          role={segment.role}
          showRole={segment.explicitRole}
          {...(mediaOf(segment.name)
            ? { media: mediaOf(segment.name) as MentionChipMedia }
            : {})}
        />
      ),
    )
  }
  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={`${keyPrefix}-${index}`}>
        {renderTextMentions(child, names, mediaOf, `${keyPrefix}-${index}`)}
      </Fragment>
    ))
  }
  if (isValidElement(node)) return node
  return node
}

export interface TextBodyProps {
  readonly body: string
  readonly names: readonly string[]
  readonly mediaOf: TextMentionMediaLookup
  readonly className?: string
}

export function TextBody({ body, names, mediaOf, className }: TextBodyProps) {
  return (
    <div data-text-body className={className}>
      <Markdown
        components={{
          p: ({ children }) => (
            <p className="mb-3.5 last:mb-0">
              {renderTextMentions(children, names, mediaOf)}
            </p>
          ),
          li: ({ children }) => (
            <li>{renderTextMentions(children, names, mediaOf)}</li>
          ),
        }}
      >
        {body}
      </Markdown>
    </div>
  )
}
