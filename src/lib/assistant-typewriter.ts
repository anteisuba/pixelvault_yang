/**
 * 助手正文的打字机 —— **传输与呈现之间的那道解耦**（owner 2026-08-18 定）。
 *
 * 上游给什么无所谓：Gemini/OpenAI 是逐 token 的 SSE，DeepSeek/Qwen/Claude 是一整块
 * 缓冲后一次吐。两种都 `push()` 进来，呈现层看到的永远是同一件事——文字一个字一个
 * 字长出来。
 *
 * 这么做换来三件事：
 * 1. **能力矩阵不泄漏成体验差异**。哪个 provider 支持 SSE 是实现细节，用户不该从
 *    「这次是唰一下出来的」推断出来。
 * 2. **渲染次数由动画定，不由 provider 定**。直接按 chunk 渲染时，一次 57 个 chunk
 *    就是 57 次整列表重渲染，而且 chunk 大小完全不均（Gemini 常一次一大段）。
 * 3. **等待变得有交代**。第一个字出现之前是「思考中」，出现之后是「在写」，两个
 *    状态分得开。
 *
 * ⚠ **用 `setInterval` 不用 `requestAnimationFrame`**：后台标签页里 rAF 是**完全冻结**
 * 的，用户切走再切回来会看到打字停在半路；setInterval 只是被节流到 ~1s，慢但不死。
 * 而且 `finish()` 一律立即把剩余全冲出去，所以即使被节流也不会卡住收尾。
 */

import { ASSISTANT_TYPEWRITER } from '@/constants/assistant'

export interface AssistantTypewriter {
  /** 上游来了一段（增量）文本。 */
  push(chunk: string): void
  /**
   * 上游结束：**不再有新输入，但继续把 buffer 打完**，排空后 resolve。
   *
   * ⚠ 早先这里是「立即全部显示」，那是错的：provider 两秒就传完，打字机才跳两拍
   * 就被一次性倒完剩下的几百字 —— 表现就是 owner 说的「字跳得太快」。呈现速度必须
   * 由动画定，不能由上游什么时候结束定。
   */
  finish(): Promise<void>
  /**
   * 中断（出错）。停表但**保留已经显示的部分** —— §3.0 要的「已流出文字 + 错误
   * 尾巴」，清空是错的。
   */
  cancel(): void
  /** 当前应当显示的文本。 */
  visible(): string
  /** 上游已收到的完整文本（含还没打出来的部分）。 */
  raw(): string
}

export interface AssistantTypewriterOptions {
  /** 每次可见文本变化时回调。只在真的变了时触发，不空转。 */
  onUpdate(visibleText: string): void
  /** 便于测试注入；默认用全局 timer。 */
  scheduler?: {
    setInterval(handler: () => void, ms: number): ReturnType<typeof setInterval>
    clearInterval(handle: ReturnType<typeof setInterval>): void
  }
}

export function createAssistantTypewriter(
  options: AssistantTypewriterOptions,
): AssistantTypewriter {
  const scheduler = options.scheduler ?? {
    setInterval: (handler, ms) => setInterval(handler, ms),
    clearInterval: (handle) => clearInterval(handle),
  }

  let received = ''
  let shown = 0
  let timer: ReturnType<typeof setInterval> | null = null
  /**
   * 时长兜底算出来的步长下限。**在积压出现的那一刻定死，之后只增不减** ——
   * 每拍拿缩小后的剩余量重算是错的：那样兜底会越来越弱，尾巴无限逼近却排不完
   * （芝诺式），实测 20000 字跑满两倍预算还剩 2500 字没吐。
   */
  let stepFloor: number = ASSISTANT_TYPEWRITER.minCharsPerTick

  const budgetTicks = Math.max(
    1,
    Math.floor(ASSISTANT_TYPEWRITER.maxDrainMs / ASSISTANT_TYPEWRITER.tickMs),
  )

  /** `finish()` 的等待者 —— 排空（或被 cancel）时才 resolve。 */
  let drainWaiters: (() => void)[] = []
  const settleDrained = () => {
    const waiters = drainWaiters
    drainWaiters = []
    for (const resolve of waiters) resolve()
  }

  const stopTimer = () => {
    if (timer === null) return
    scheduler.clearInterval(timer)
    timer = null
  }

  const emit = () => options.onUpdate(received.slice(0, shown))

  const tick = () => {
    const pending = received.length - shown
    if (pending <= 0) {
      // 追平了就停表。下一个 chunk 进来时 `push` 会重新起表 —— 空转的定时器
      // 在长对话里是白烧的渲染预算。
      stopTimer()
      settleDrained()
      return
    }
    // 常态：夹在 min/max 之间 —— 上限保证「像打字」，下限保证短回复不是一次蹦完。
    const paced = Math.min(
      ASSISTANT_TYPEWRITER.maxCharsPerTick,
      Math.max(
        ASSISTANT_TYPEWRITER.minCharsPerTick,
        Math.ceil(pending / ASSISTANT_TYPEWRITER.backlogDivisor),
      ),
    )
    // 兜底：超长回答按常态速度要跑几十秒，那时让人干等比看起来跳更糟。
    // 常见长度算出来的 stepFloor 就是 1，落不到兜底上，步长仍是 maxCharsPerTick。
    const step = Math.max(paced, stepFloor)
    shown = Math.min(received.length, shown + step)
    emit()
  }

  const startTimer = () => {
    if (timer !== null) return
    timer = scheduler.setInterval(tick, ASSISTANT_TYPEWRITER.tickMs)
  }

  return {
    push(chunk: string) {
      if (!chunk) return
      received += chunk
      stepFloor = Math.max(
        stepFloor,
        Math.ceil((received.length - shown) / budgetTicks),
      )
      startTimer()
    },
    finish() {
      if (shown >= received.length) {
        stopTimer()
        return Promise.resolve()
      }
      // 还没打完就继续打 —— 速度由动画定，不由上游何时结束定。
      startTimer()
      return new Promise<void>((resolve) => {
        drainWaiters.push(resolve)
      })
    },
    cancel() {
      stopTimer()
      // 等在 finish() 上的调用方必须放行，否则出错时那条 await 永远挂着。
      settleDrained()
    },
    visible: () => received.slice(0, shown),
    raw: () => received,
  }
}
