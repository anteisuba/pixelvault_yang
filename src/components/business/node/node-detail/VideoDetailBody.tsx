'use client'

import { VideoComposer } from '../composer/VideoComposer'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/**
 * 视频生成（`seedance`）的槽表提供者 —— 一层薄转接。
 *
 * ⚠ 内容不搬家：监视器、引用、提示词、参数全部仍住在 `VideoComposer`
 * （`density='detail'`）里。那些状态与 handler 有近千行，搬去别处只会制造第二个家；
 * S7 做的是**重排**不是搬迁 —— 同一批 JSX 换个槽落位，逻辑一行不动。
 *
 * 槽由 `VideoComposer` 通过 children 渲染函数交出来，与其余九族同一个契约。
 */
export function VideoDetailBody({
  nodeId,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  return (
    <VideoComposer id={nodeId} data={data} density="detail">
      {children}
    </VideoComposer>
  )
}
