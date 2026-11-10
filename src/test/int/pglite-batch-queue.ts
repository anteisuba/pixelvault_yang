import type { PGlite } from '@electric-sql/pglite'

/** 扩展协议里要等到 Sync 才算一段的消息：Parse / Bind / Describe / Execute / Close / Flush。 */
const BATCH_MESSAGES = new Set(
  ['P', 'B', 'D', 'E', 'C', 'H'].map((type) => type.charCodeAt(0)),
)
const SYNC = new Uint8Array([0x53, 0, 0, 0, 4])

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
    try {
      await this.db.runExclusive(() =>
        this.db.execProtocolRawStream(item.message, {
          onRawData: (data) => {
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
