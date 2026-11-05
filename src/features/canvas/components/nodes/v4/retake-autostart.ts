/**
 * 「重生成 = 新卡」的卡间交接（node-canvas-v2 §1 第 18 条，owner 2026-11-03 / 11-05）。
 *
 * 旧卡按下重生成：长一张同条件的新卡（`buildRetakeOps`，一批 = 一个撤销），然后在这里
 * **登记**「这张新卡一挂上就自己发一枪」。新卡渲染时认领登记、用它自己的发送路径出图。
 *
 * ⚠ 为什么不由旧卡直接替新卡生成：生成中的卡面状态（几张在飞、2×2 挑图、计时、取消）
 * 全是**发起那张卡的本地 state**。旧卡替新卡发，进度会画在旧卡上、新卡干等着一张空框。
 * ⚠ 为什么模型走登记载荷而不是批里的 `set_model`：那条 op 只收 modelId、由画布按目录
 * 展开成默认渠道，会把用户选的线路（自己的 key / 中转）换掉；新卡起跑时用载荷里的
 * 完整选择写回自己，与旧卡那一枪同一家同一条线路。
 * ⚠ 旧卡那一刻已经过了 key 闸（缺 key 会先弹 `QuickSetupDialog`），新卡起跑按「已验」走。
 */

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

import { NODE_STUDIO_DOCK } from '@/constants/node-studio'
import { buildRetakeOps } from '@/lib/node-retake'
import type { NodeV4, NodeWorkflowModelSelection } from '@/types/node-workflow'

import { flashNodeCard } from './chrome/node-card-flash'
import type { NodeV4CanvasContextValue } from './NodeV4Context'

export interface RetakeAutostart {
  /** 旧卡那一枪用的模型（含线路）；缺席 = 新卡按自己的默认走。 */
  readonly model?: NodeWorkflowModelSelection
}

const pending = new Map<string, RetakeAutostart>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function markRetakeAutostart(nodeId: string, payload: RetakeAutostart) {
  pending.set(nodeId, payload)
  for (const listener of listeners) listener()
}

/** 认领一次就清掉：同一张卡重挂（切视图、热更新）⛔ 再发第二枪。 */
function takeRetakeAutostart(nodeId: string): RetakeAutostart | undefined {
  const payload = pending.get(nodeId)
  if (payload) pending.delete(nodeId)
  return payload
}

/**
 * 卡片侧：本卡有登记就认领并调 `start`。`start` 每次渲染取最新的那份（发送函数闭包着
 * 本卡的草稿与模型），⛔ 用挂载那一刻的旧闭包。
 */
export function useRetakeAutostart(
  nodeId: string,
  start: (payload: RetakeAutostart) => void,
) {
  const startRef = useRef(start)
  useLayoutEffect(() => {
    startRef.current = start
  })
  const flagged = useSyncExternalStore(
    subscribe,
    () => pending.has(nodeId),
    () => false,
  )
  useEffect(() => {
    if (!flagged) return
    const payload = takeRetakeAutostart(nodeId)
    if (payload) startRef.current(payload)
  }, [flagged, nodeId])
}

/**
 * 同一个 hook 的组件壳：卡片把它**放在 JSX 里**（提前返回之后）。
 *
 * ⚠ 为什么不直接在卡片里调 hook：hook 必须排在 `if (!node) return null` 之前，而卡片的
 * 发送函数声明在提前返回之后 —— 在前面闭包它，React Compiler 判「声明之前就读」
 * （`react-hooks/immutability`）。放进子组件，`onStart` 拿到的永远是已经初始化的那份。
 */
export function RetakeAutostartTrigger({
  nodeId,
  onStart,
}: {
  readonly nodeId: string
  readonly onStart: (payload: RetakeAutostart) => void
}) {
  useRetakeAutostart(nodeId, onStart)
  return null
}

type RetakeCanvas = Pick<
  NodeV4CanvasContextValue,
  'readGraph' | 'onPlaceBeside' | 'onApplyBatch'
>

/**
 * 旧卡侧：长新卡 + 登记起跑。返回新卡 id；批没落下（宿主没给回执）返回 `undefined`，
 * 调用方此时什么也别做 —— ⛔ 退回在旧卡上叠版本，那正是这条规则要拦的。
 */
export async function forkRetake(
  canvas: RetakeCanvas,
  nodeId: string,
  prompt: string,
  payload: RetakeAutostart,
): Promise<string | undefined> {
  const graph = canvas.readGraph()
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node) return undefined
  const position = canvas.onPlaceBeside(nodeId, [
    { kind: node.data.kind, subtype: node.data.subtype },
  ])?.[0]
  const outcome = await canvas.onApplyBatch(
    buildRetakeOps({
      node,
      edges: graph.edges,
      prompt,
      ...(position ? { position } : {}),
    }),
  )
  const created = outcome?.createdNodeIds?.[0]
  if (created) markRetakeAutostart(created, payload)
  return created
}

/** 新卡起跑时把自己亮出来：平移到可见、选中、镜头停下后闪一下（与「连完跳过去」同一套）。 */
export function revealRetakeCard(
  canvas: Pick<NodeV4CanvasContextValue, 'onFocusNode' | 'onSelectNode'>,
  nodeId: NodeV4['id'],
) {
  canvas.onFocusNode(nodeId)
  canvas.onSelectNode?.(nodeId)
  flashNodeCard(nodeId, NODE_STUDIO_DOCK.focusDurationMs)
}
