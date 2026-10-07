/**
 * 助手流的**传输层**协议（2026-08-25 从裸 `text/plain` 换过来）。
 *
 * ⚠ 别和 `constants/assistant-protocol.ts` 混：那个是**正文内**的 `[[ask]]` /
 * `[[next]]` 标记，是模型写在自己话里的东西；这里是**帧**，是服务端与客户端之间
 * 的信封。两者眼下是嵌套关系——`text` 帧的载荷里仍可能含标记块，客户端照旧抽取。
 * 把标记也升级成帧是下一片（owner 2026-08-25 定的切法）。
 *
 * ── 为什么必须有 `open` 帧 ─────────────────────────────────────────
 * Next 要等这条流吐出**第一个字节**才 flush 响应头。裸文本流在模型开口之前一个
 * 字节都没有，于是函数被平台杀掉时响应头从未发出，网关只能回 **504**——用户看到
 * 的是错误而不是半截回答（2026-08-24 生产实证）。开流即发 `open`，响应头当场
 * flush，这条路由上的 504 就结构性地不可能再发生：之后无论模型想多久、无论是不是
 * 引用闸那条整段缓冲的路径，超时最多是一条**截断的 200**，已经出的字还在。
 */

export const ASSISTANT_STREAM_CONTENT_TYPE = 'text/event-stream; charset=utf-8'

export const ASSISTANT_STREAM_EVENTS = {
  /** 开流握手。载荷为空——它的全部职责是产生字节，把响应头顶出去。 */
  open: 'open',
  /** 正文增量。载荷 `{ delta }`，⚠ 是增量不是累积。 */
  text: 'text',
  /** 检索回执，最多一次，排在第一个 `text` 之前。 */
  research: 'research',
  /** 本轮 LoRA 候选，最多一次，排在第一个 `text` 之前。 */
  lora: 'lora',
  /**
   * 流中途失败。
   *
   * ⭐ 这是换帧协议**顺带修好**的一个老毛病：裸流时中途失败只能
   * `controller.error()`，客户端读到的是一个没有 errorCode / i18nKey 的读流异常，
   * 于是「provider 超时」和「网络断了」在 UI 上长得一模一样。现在它是一帧结构化
   * 载荷，已经吐出去的字照样留在屏幕上。
   */
  error: 'error',
  /** 正常收尾。用来把「说完了」和「连接断了」分开。 */
  done: 'done',
} as const

export type AssistantStreamEventName =
  (typeof ASSISTANT_STREAM_EVENTS)[keyof typeof ASSISTANT_STREAM_EVENTS]
