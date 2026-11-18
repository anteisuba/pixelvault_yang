/**
 * 同一步里的只读调用一起跑（11-18）。
 *
 * 模型一步里常一口气调好几个 find / look（查库 + 联网找图 + 看两张）。它们只读、互不依赖，串着跑就是
 * 白等几次往返。Anthropic 的并行工具文档写明：执行顺序由我们定，结果放在同一条消息里、每个调用一条
 * （<https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use>）。
 *
 * 规则：
 *  · 连着的一串只读调用（`find` / `look`）一起跑；其余（edit / ask / generate / open …）照原顺序一个一个跑，
 *    并且把前后两串只读隔开 —— edit 之后的 look 要看改完的样子。
 *  · 结果照模型调用的顺序收（调用方按 `planToolBatches` 的顺序 settle），⛔ 按谁先跑完。
 *  · 一起跑时各自的事件（步骤行「正在找…」）随到随发，⛔ 等全部跑完再一次倒出来。
 */

export interface ToolBatch<T> {
  /** true = 这一串一起跑。 */
  readonly concurrent: boolean
  readonly items: readonly T[]
}

/** 按顺序切成几串：连着的只读调用并成一串，其余每个单独一串。 */
export function planToolBatches<T>(
  items: readonly T[],
  isReadOnly: (item: T) => boolean,
): ToolBatch<T>[] {
  const batches: ToolBatch<T>[] = []
  for (const item of items) {
    const last = batches[batches.length - 1]
    if (isReadOnly(item) && last?.concurrent) {
      batches[batches.length - 1] = {
        concurrent: true,
        items: [...last.items, item],
      }
      continue
    }
    batches.push({ concurrent: isReadOnly(item), items: [item] })
  }
  return batches
}

type Step<E, R> = { index: number; result: IteratorResult<E, R> }

/**
 * 几个生成器一起跑：事件随到随交出去，全部跑完按传进来的顺序交回各自的返回值。
 * ⚠ 一个抛错 = 整体抛错（同串着跑时一样），剩下没跑完的收掉（`return()`）。
 * ⚠ 外面提前停下（`return()`）也把没跑完的收掉。
 */
export async function* runConcurrently<E, R>(
  generators: readonly AsyncGenerator<E, R>[],
): AsyncGenerator<E, R[]> {
  const results = new Array<R>(generators.length)
  const pending = new Map<number, Promise<Step<E, R>>>()
  const pull = (index: number) => {
    const generator = generators[index]!
    pending.set(
      index,
      generator.next().then((result) => ({ index, result })),
    )
  }
  generators.forEach((_, index) => pull(index))
  try {
    while (pending.size > 0) {
      const { index, result } = await Promise.race(pending.values())
      if (result.done) {
        pending.delete(index)
        results[index] = result.value
        continue
      }
      pull(index)
      yield result.value
    }
    return results
  } finally {
    // 没跑完的那几个：它们手上那一步的结果没人等了（报错也别变成未处理的拒绝），再收掉。
    for (const [index, step] of pending) {
      step.catch(() => undefined)
      await generators[index]!.return(undefined as R).catch(() => undefined)
    }
  }
}
