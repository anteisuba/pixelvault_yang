'use client'

import { useTranslations } from 'next-intl'

import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'

import { ImageFamilyBody } from './ImageFamilyBody'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/**
 * 关键帧（`frameImage`）—— 契约 §6 里最纯的一族：媒体井 + 素材架 + 编排台 +
 * 下游反查 + 证据 + 生成，没有任何本族独有的东西。
 *
 * ⚠ 正因为它什么都不加，它是「共用引擎有没有把公共部分做全」的试纸：
 * 这个文件里出现的每一行本族代码，都说明 `ImageFamilyBody` 少做了一件事。
 * 今天它只剩关系带的空态文案 —— 那是必须逐族不同的（契约要求各族说各族的话）。
 */
export function FrameDetailBody({
  nodeId,
  type,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const uses = useDownstreamUses(nodeId)

  return (
    <ImageFamilyBody
      nodeId={nodeId}
      type={type}
      data={data}
      relations={
        <RelationsStrip
          uses={uses}
          emptyLabel={tDetail('relationsEmptyFrame')}
          labelOf={(use) => use.name ?? tTypes(use.type)}
          ariaOf={(name) => tDetail('focusOnCanvas', { name })}
        />
      }
    >
      {children}
    </ImageFamilyBody>
  )
}
