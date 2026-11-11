import type { PGlite } from '@electric-sql/pglite'

/** 扩展协议里要等到 Sync 才算一段的消息：Parse / Bind / Describe / Execute / Close / Flush。 */
const BATCH_MESSAGES = new Set(
  ['P', 'B', 'D', 'E', 'C', 'H'].map((type) => type.charCodeAt(0)),
)
const SYNC = new Uint8Array([0x53, 0, 0, 0, 4])
const ERROR_RESPONSE = 'E'.charCodeAt(0)
const READY_FOR_QUERY = 'Z'.charCodeAt(0)

/**
 * 扩展协议一段里报错（如 Bind 时 jsonb 收到 `\u0000`）：PGlite 当场回 ErrorResponse +
 * ReadyForQuery，到 Sync 又回一个 ReadyForQuery。真 Postgres 只在 Sync 回那一个。多出来的
 * 那个让 node-postgres 的应答错一格 —— 下一条查询「成功」却拿到空结果（回滚后会话查不到、
 * 回执判「运行不存在」）。这里把 Sync 之前、报错之后的 ReadyForQuery 丢掉。
 *
 * 回包按块到达，一条消息可能跨块：`skip` 记上一块没走完的字节；块边界切在消息头里时
 * 放弃过滤（`lost`），原样透传。
 */
type ReplyFilterState = { sawError: boolean; skip: number; lost: boolean }

function dropEarlyReadyForQuery(
  data: Uint8Array,
  state: ReplyFilterState,
): Uint8Array {
  if (state.lost) return data
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const kept: Uint8Array[] = []
  let offset = Math.min(state.skip, data.length)
  state.skip -= offset
  if (offset > 0) kept.push(data.subarray(0, offset))
  while (offset < data.length) {
    const length = offset + 5 <= data.length ? view.getInt32(offset + 1) : -1
    if (length < 4) {
      state.lost = true
      kept.push(data.subarray(offset))
      break
    }
    const end = offset + 1 + length
    if (end > data.length) {
      state.skip = end - data.length
      kept.push(data.subarray(offset))
      break
    }
    const type = data[offset]
    if (type === ERROR_RESPONSE) state.sawError = true
    if (!(type === READY_FOR_QUERY && state.sawError)) {
      kept.push(data.subarray(offset, end))
    }
    offset = end
  }
  if (kept.length === 1 && kept[0]!.length === data.length) return data
  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of kept) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function containsSync(message: Uint8Array): boolean {
  const view = new DataView(
    message.buffer,
    message.byteOffset,
    message.byteLength,
  )
  let offset = 0
  while (offset + 5 <= message.length) {
    if (message[offset] === SYNC[0]) return true
    const length = view.getInt32(offset + 1)
    if (length < 4) return false
    offset += 1 + length
  }
  return false
}

type Pending = {
  handlerId: number
  message: Uint8Array
  onData: (data: Uint8Array) => void
  resolve: (bytes: number) => void
  reject: (error: unknown) => void
}

/**
 * 替换 `PGLiteSocketServer` 自带的排队（接口照它：enqueue / clearQueueForHandler /
 * clearTransactionIfNeeded / getQueueLength）。
 *
 * 自带的那个把**单条协议消息**当排队单位，事务外两条连接的 Parse / Bind / Execute 会交错到
 * PGlite 唯一的会话上——共用一个 unnamed statement、共用「报错后丢到 Sync 为止」：一条连接的
 * Bind 绑到另一条的 Parse 上（08P01），被连坐丢掉的那条只收到 ReadyForQuery，查询「成功」却
 * 什么都没做（multiview 三个角度并发派单，偶尔只派出一两个）。上游 electric-sql/pglite#1046、
 * #1192，pglite-socket 0.2.19 未修。
 *
 * 这里：一条连接从扩展协议的第一条消息起占住后端，直到它的 Sync；事务照旧整段占住。
 * 占着的连接断了，补一个 Sync 收掉半截批次、回滚它的事务，再放行别人。
 */
export class PGliteBatchQueue {
  private queue: Pending[] = []
  private processing = false
  private owner: { handlerId: number; batchOpen: boolean } | null = null
  private readonly gone = new Set<number>()

  constructor(private readonly db: PGlite) {}

  enqueue(
    handlerId: number,
    message: Uint8Array,
    onData: (data: Uint8Array) => void,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      this.queue.push({ handlerId, message, onData, resolve, reject })
      void this.processQueue()
    })
  }

  getQueueLength(): number {
    return this.queue.length
  }

  clearQueueForHandler(handlerId: number): void {
    this.gone.add(handlerId)
    this.queue = this.queue.filter((item) => {
      if (item.handlerId !== handlerId) return true
      item.reject(new Error('Handler disconnected'))
      return false
    })
  }

  async clearTransactionIfNeeded(handlerId: number): Promise<void> {
    if (this.owner?.handlerId === handlerId) await this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      for (;;) {
        if (this.owner && this.gone.has(this.owner.handlerId)) {
          await this.release()
        }
        const ownerId = this.owner?.handlerId
        const index =
          ownerId === undefined
            ? 0
            : this.queue.findIndex((item) => item.handlerId === ownerId)
        const item = index === -1 ? undefined : this.queue[index]
        if (!item) return
        this.queue.splice(index, 1)
        await this.run(item)
      }
    } finally {
      this.processing = false
    }
  }

  private async run(item: Pending): Promise<void> {
    let bytes = 0
    // 消息里自带 Sync 时，最后那个 ReadyForQuery 是 Sync 的应答，不能丢。
    const inBatch =
      BATCH_MESSAGES.has(item.message[0] ?? 0) && !containsSync(item.message)
    const errorState: ReplyFilterState = {
      sawError: false,
      skip: 0,
      lost: false,
    }
    try {
      await this.db.runExclusive(() =>
        this.db.execProtocolRawStream(item.message, {
          onRawData: (raw) => {
            const data = inBatch ? dropEarlyReadyForQuery(raw, errorState) : raw
            if (data.length === 0) return
            bytes += data.length
            item.onData(data)
          },
        }),
      )
      item.resolve(bytes)
    } catch (error) {
      item.reject(error)
    } finally {
      const batchOpen = BATCH_MESSAGES.has(item.message[0] ?? 0)
      this.owner =
        batchOpen || this.db.isInTransaction()
          ? { handlerId: item.handlerId, batchOpen }
          : null
    }
  }

  private async release(): Promise<void> {
    const owner = this.owner
    this.owner = null
    if (owner?.batchOpen) {
      await this.db.runExclusive(() => this.db.execProtocolRaw(SYNC))
    }
    if (this.db.isInTransaction()) await this.db.exec('ROLLBACK')
  }
}
