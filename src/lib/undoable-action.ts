import { toast } from 'sonner'

import { FEEDBACK_TIMING } from '@/constants/motion'

/**
 * 「删完在底部黑条上撤销」（owner 2026-10-08 第 2 题：删图时按钮随图一起消失，
 * 撤销放进底部黑条）。
 *
 * 做法是**延后落库**：`apply()` 先把东西从界面上拿掉，底部黑条挂「撤销」
 * `undoWindowMs` 那么久；没人点撤销才真的 `commit()`。点了撤销 = `undo()` 把东西
 * 放回去，服务端从头到尾没被碰过 —— ⛔ 不需要任何「恢复」接口。
 *
 * ⚠ 状态住在模块里（不在组件里）：发起删除的那一层（查看器、抽屉）往往正是随着
 *   删除一起关掉的那一层，组件 state 会跟着它一起没了。
 * ⚠ 窗口还没过就整页关掉：`pagehide` 时把挂着的全部立刻落库（尽力而为）；
 *   真没发出去，结果是东西还在 —— 错也错在安全那一边。
 */
export interface UndoableActionOptions {
  /** 黑条上那句（「已删除」）。 */
  message: string
  /** 黑条上那颗动作（「撤销」）。 */
  undoLabel: string
  /** 先在界面上生效（乐观）。 */
  apply: () => void
  /** 撤销：把界面放回去。 */
  undo: () => void
  /** 窗口过了，真的落库。 */
  commit: () => Promise<void> | void
  windowMs?: number
}

interface PendingAction {
  timer: ReturnType<typeof setTimeout>
  commit: () => Promise<void> | void
}

const pending = new Set<PendingAction>()
let pageHideBound = false

function flushPending() {
  for (const entry of pending) {
    clearTimeout(entry.timer)
    void entry.commit()
  }
  pending.clear()
}

function bindPageHide() {
  if (pageHideBound || typeof window === 'undefined') return
  pageHideBound = true
  window.addEventListener('pagehide', flushPending)
}

export function runUndoableAction({
  message,
  undoLabel,
  apply,
  undo,
  commit,
  windowMs = FEEDBACK_TIMING.undoWindowMs,
}: UndoableActionOptions): void {
  bindPageHide()
  apply()
  const entry: PendingAction = {
    timer: setTimeout(() => {
      pending.delete(entry)
      void commit()
    }, windowMs),
    commit,
  }
  pending.add(entry)
  toast.success(message, {
    duration: windowMs,
    action: {
      label: undoLabel,
      onClick: () => {
        if (!pending.has(entry)) return
        clearTimeout(entry.timer)
        pending.delete(entry)
        undo()
      },
    },
  })
}

/** 测试用：清掉挂着的（不落库）。 */
export function resetUndoableActionsForTest() {
  for (const entry of pending) clearTimeout(entry.timer)
  pending.clear()
}
