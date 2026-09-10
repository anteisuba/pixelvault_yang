'use client'

/**
 * **短暂高亮**一张卡（spec §1.13 尾句「连完目标卡短暂高亮并滚到可见」）。
 *
 * 「滚到可见」由 `onFocusNode` 管；这一份只管那一下亮 —— 它复用的就是变更高亮
 * （`NodeCardShell.changed`：名字旁那颗蓝点 + 选中环），⛔ 不新造第二种高亮语言。
 *
 * ⚠ 为什么是模块级 store 而不是 context：**点的人和亮的人不是同一张卡**。音频卡
 * 上的弹层要让视频卡亮一下，两者是 ReactFlow 里两个互不相识的组件；往 context 里
 * 加一个字段则要动 `NodeV4Provider` 与它的宿主（S8 在飞的文件）。
 *
 * ⚠ 这是**纯运行态**：不进撤销栈、不落库、刷新即无 —— 与 `use-node-graph-v4` 头注
 * 里那四类例外同一条定位。
 */

import { useCallback, useSyncExternalStore } from 'react'

import { NODE_V4_CONNECT_TO_SHOT } from '@/constants/node-studio'

const listeners = new Set<() => void>()
/** 现在亮着的那些 id。⚠ 每次都换新 Set —— `useSyncExternalStore` 认引用。 */
let flashing: ReadonlySet<string> = new Set()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener()
}

/** 让这张卡亮 `ms` 毫秒。同一张卡连点两次 = 重新计时，⛔ 不叠两个定时器。 */
export function flashNodeCard(
  nodeId: string,
  ms: number = NODE_V4_CONNECT_TO_SHOT.highlightMs,
): void {
  const existing = timers.get(nodeId)
  if (existing) clearTimeout(existing)
  const next = new Set(flashing)
  next.add(nodeId)
  flashing = next
  timers.set(
    nodeId,
    setTimeout(() => {
      timers.delete(nodeId)
      const after = new Set(flashing)
      after.delete(nodeId)
      flashing = after
      emit()
    }, ms),
  )
  emit()
}

/** 测试用：把状态清干净（⛔ 生产代码不调）。 */
export function resetNodeCardFlash(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  flashing = new Set()
  emit()
}

export function useNodeCardFlash(nodeId: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])
  const get = useCallback(() => flashing.has(nodeId), [nodeId])
  // 服务端没有运行态可言 —— 第三个参数返回 false，⛔ 不让 SSR 读模块级可变量。
  return useSyncExternalStore(subscribe, get, () => false)
}
