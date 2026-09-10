'use client'

/**
 * ⋯ 菜单里的「拆成多段」（spec §2）。
 *
 * ⚠ 单独一个组件，是因为它要 `useNodeCanvasActions()`：**整批一次落图 = 一个撤销
 * 条目**（与助手的一轮同一条纪律），而 `onApplyOp` 一次只发一条、新卡的 id 也回不来。
 * 那个出口缺 Provider 时会抛错，所以只在**菜单真的打开时**才挂载它 —— 收起态的卡
 * 不该因为一颗还没点开的菜单项而要求整条动作总线在场。
 */

import { useTranslations } from 'next-intl'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import { useNodeCanvasActions } from '../NodeV4ActionsBridge'
import { splitTextBodyIntoParagraphs } from './text-summary'

export function TextSplitMenuItem({ node }: { readonly node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4.text')
  const actions = useNodeCanvasActions()
  const body = node.data.kind === 'text' ? node.data.body : ''
  const paragraphs = splitTextBodyIntoParagraphs(body)

  return (
    <DropdownMenuItem
      data-menu-action="split"
      disabled={paragraphs.length < 2}
      onSelect={() => {
        if (paragraphs.length < 2) return
        const ops: NodeAssistantOpV4[] = [
          {
            op: NODE_ASSISTANT_OP_V4_IDS.setText,
            target: node.id,
            body: paragraphs[0] as string,
            mode: 'replace',
          },
          ...paragraphs
            .slice(1)
            .flatMap((block, index): NodeAssistantOpV4[] => {
              const ref = `${node.id}-split-${index}`
              return [
                {
                  op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                  kind: node.data.kind,
                  subtype: node.data.subtype,
                  ref,
                  ...(node.data.shotNo === undefined
                    ? {}
                    : { shotNo: node.data.shotNo }),
                },
                {
                  op: NODE_ASSISTANT_OP_V4_IDS.setText,
                  target: ref,
                  body: block,
                  mode: 'replace',
                },
              ]
            }),
        ]
        void actions.runAssistantOps(
          ops.map((op, index) => ({ index, op, status: 'ready' as const })),
        )
      }}
    >
      {t('toolbar.split')}
    </DropdownMenuItem>
  )
}
