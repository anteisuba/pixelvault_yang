'use client'

/**
 * 「产物库变了」的**一声招呼**（owner 2026-09-12 真机：传了东西，素材库不跟着变）。
 *
 * ⚠ 为什么是模块级 store 而不是 context：**传的人和列的人隔着半棵树**。上传发生在
 * 画布落物钩子（`use-node-upload-v4`）里，列表在左侧面板（`ShellSidePanels`），两者
 * 之间是整个 workbench；往 context 里加一个字段要动 provider 与它所有宿主。这一条
 * 与 `node-card-flash` 同一个理由、同一套写法，⛔ 不新造第三种。
 *
 * ⚠ 这不是缓存也不是数据：只是一个**单调递增的号**。谁改了库就 +1，列表把它当
 * effect 依赖重拉一页。⛔ 不在这里存 generations —— 真正的数据只有一处（服务端），
 * 存第二份就要回答「谁先过期」。
 */

import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let revision = 0

/** 库里多了 / 少了东西 —— 上传成功、删除成功的那一刻叫一声。 */
export function notifyGalleryChanged(): void {
  revision += 1
  for (const listener of listeners) listener()
}

/**
 * 当前的号。变了就说明该重拉了。
 *
 * ⚠ 服务端快照恒为 0：这是纯客户端的运行态，SSR 期间没有「变过」这件事。
 */
export function useGalleryRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => revision,
    () => 0,
  )
}

/** 测试用：把号清零（⛔ 生产代码不调）。 */
export function resetGalleryRevision(): void {
  revision = 0
  for (const listener of listeners) listener()
}
