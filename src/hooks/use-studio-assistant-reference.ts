'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * 一次「把这张图塞进助手输入区」的请求。
 *
 * `token` 单调递增：面板拿它判断「这是新的一次注入」而不是同一次的重渲染 ——
 * 同一张图可以被移除后再点一次，仅靠 url 去重会让第二次静默无效。
 */
export interface StudioAssistantInjectedReference {
  url: string
  token: number
}

// ─── Module-level store ─────────────────────────────────────────────
//
// 为什么是模块级 store 而不是 props：注入的**发起方**（结果图上的「问助手」按钮，
// 长在 StudioCanvas 深处）和**消费方**（PromptAssistantPanel，挂在 dock / 移动端
// 抽屉两个宿主里）是 DOM 树上的兄弟分支，中间隔着五层布局组件。逐层透传一个可选
// 回调正是「可选 prop 漏传 = 三绿而功能全失效」的高发形态。
//
// 同一套 `useSyncExternalStore` 模式已经在 `use-studio-assistant-controls.ts`
// （头部控件 ↔ 面板）和 `use-prompt-assistant.ts`（对话按 surface 分槽）用着，
// 这里是第三个同构的点，不是新发明。
//
// ⚠ 不进 `studio-context`：那是 47 个文件的高风险模块，而这条通道只有三个消费者，
// 加一个 action + 一段 reducer 分支是给它增重。

let injected: StudioAssistantInjectedReference | undefined
/**
 * ⚠ 令牌**单调递增且不随清空回退**，所以它是独立的一个数，不是从 `injected`
 * 里读的。从 `injected?.token ?? 0` 推的话，`clearReference()` 之后下一次注入
 * 又是 1 —— 而桌面 dock 的面板从不卸载，它记着的 `lastInjectedToken` 还是 1，
 * 于是「关掉助手 → 再点另一张图的问助手」会被判成同一次注入而**静默失效**。
 */
let nextToken = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): StudioAssistantInjectedReference | undefined {
  return injected
}

// ⚠ 返回类型写全（而不是让它推成 `undefined`）：`useSyncExternalStore` 的 T 由
// 两个 getter 一起推，第二个收窄成 `undefined` 会把整个 hook 的返回类型也拖窄。
function getServerSnapshot(): StudioAssistantInjectedReference | undefined {
  return undefined
}

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

/**
 * 助手输入区的图片注入通道。
 *
 * - `injectedReference` —— 给 `PromptAssistantPanel` 的 `injectedReference` prop。
 *   两个宿主（桌面 dock / 移动端抽屉）读同一份，所以在哪个宿主注入都能落到当前
 *   打开的那个面板上。
 * - `injectReference` —— 发起注入。**只管塞附件，不管开面板**：dock 的拖放路径
 *   是「面板已经开着才可能被拖入」，而结果图上的按钮需要额外把面板打开，那一步
 *   由 `useAskAssistantAboutImage` 负责。
 * - `clearReference` —— 面板关掉时清掉这一份，**一次注入只属于一次打开**。
 *   ⚠ 不清的后果只在移动端露出来：那个宿主是抽屉，关掉会把面板整个卸载，重开
 *   时 `lastInjectedToken` 归零，于是上一次问过的那张图会被**再挂一次**——用户
 *   没点，附件却在那儿，一不留神发出去就是白烧一次 vision。桌面 dock 的面板
 *   常驻不卸载，看不到这个病，所以只验桌面会漏掉它。
 */
export function useStudioAssistantReference() {
  const injectedReference = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const injectReference = useCallback((url: string) => {
    nextToken += 1
    injected = { url, token: nextToken }
    emit()
  }, [])

  const clearReference = useCallback(() => {
    if (!injected) return
    injected = undefined
    emit()
  }, [])

  return { injectedReference, injectReference, clearReference }
}
