/**
 * 回放里的 `after`（`next/server`）：收下每一跳交给它的活，一轮跑完再一起等完。
 *
 * 真机上函数也是等它们跑完才退（Vercel）；回放据此把一轮收尾后在后台跑的那几样（v3 抽记忆、
 * 调用日志、过程记录）算进这一轮 —— 不等的话，它们会在下一题换了 `fetch` 之后才发出去。
 * 两份回放用例都把 `next/server` 的 `after` 换成 `collectAfterTask`。
 */
type AfterTask = Promise<unknown> | (() => unknown)

const queue: AfterTask[] = []

export function collectAfterTask(task: AfterTask): void {
  queue.push(task)
}

/** 等完收下的每一样（跑的过程中又交来的也等）。 */
export async function settleAfterTasks(): Promise<void> {
  while (queue.length > 0) {
    const tasks = queue.splice(0)
    await Promise.all(
      tasks.map((task) => (typeof task === 'function' ? task() : task)),
    )
  }
}
