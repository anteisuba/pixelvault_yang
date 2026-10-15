/**
 * 「只用所选那一家」（owner 2026-10-15：「会自动扣其他模型的token，用户还不知道」）。
 *
 * 一轮里每一次碰模型（主步、规划、看图……）或按厂商查 key，都记成一条 `ProviderUse`；
 * `expectSelectedProviderOnly` 只要有一条不是创作者选的那一家就失败，并点名是哪一跳。
 * 这是回放基线里「只用所选那一家」那一项的种子 —— 新的 v3 用例拿它当最后一道断言。
 *
 * ⚠ 认不出是哪一家的模型调用记成 `(unknown)`，同样不合格：说不清花了谁的 key 本身就是毛病。
 */
import { expect } from 'vitest'
import { z } from 'zod'

/** 一次碰模型 / 按厂商查 key：哪一跳、哪一家、哪把 key（有就记）。 */
export interface ProviderUse {
  readonly via: string
  readonly adapterType: string
  readonly apiKey?: string
}

export interface SelectedProvider {
  readonly adapterType: string
  /** 给了就连 key 也比：同一家换了一把别的 key 也算越界。 */
  readonly apiKey?: string
}

/** 只读调用记录 —— `vi.fn()` 的 `.mock` 结构上满足它。 */
interface CallRecorder {
  readonly mock: { readonly calls: readonly (readonly unknown[])[] }
}

const RouteLikeSchema = z.object({
  adapterType: z.string(),
  apiKey: z.string().optional(),
})

const WithRouteSchema = z.object({ route: RouteLikeSchema })

const KeyLookupSchema = z.object({
  where: z.object({ adapterType: z.string() }),
})

/** 参数里的路由：路由本身（`llmTextCompletion` 的入参、`resolveAssistantV3Model` 的第一个参数），或带 `route` 的对象。 */
function routeIn(value: unknown): z.infer<typeof RouteLikeSchema> | null {
  const direct = RouteLikeSchema.safeParse(value)
  if (direct.success) return direct.data
  const nested = WithRouteSchema.safeParse(value)
  return nested.success ? nested.data.route : null
}

/** 一个碰模型的桩：每次调用记一条（参数里认不出是哪一家 = `(unknown)`）。 */
export function providerUsesOf(mock: CallRecorder, via: string): ProviderUse[] {
  return mock.mock.calls.map((args) => {
    const route = args.map(routeIn).find((found) => found !== null)
    return route
      ? {
          via,
          adapterType: route.adapterType,
          ...(route.apiKey ? { apiKey: route.apiKey } : {}),
        }
      : { via, adapterType: '(unknown)' }
  })
}

/**
 * `db.userApiKey.findFirst` 这类按厂商查 key 的桩 → 每次按厂商查一条。
 * ⚠ 按 id 查的那一跳不记：它读的是调用方已经选定的那一把。
 */
export function keyLookupUsesOf(
  mock: CallRecorder,
  via = 'key lookup',
): ProviderUse[] {
  return mock.mock.calls.flatMap((args) => {
    const lookup = KeyLookupSchema.safeParse(args[0])
    return lookup.success
      ? [{ via, adapterType: lookup.data.where.adapterType }]
      : []
  })
}

/** 「只用所选那一家」：有一条不是就失败。 */
export function expectSelectedProviderOnly(
  uses: readonly ProviderUse[],
  selected: SelectedProvider,
): void {
  const strays = uses.filter(
    (use) =>
      use.adapterType !== selected.adapterType ||
      (selected.apiKey !== undefined &&
        use.apiKey !== undefined &&
        use.apiKey !== selected.apiKey),
  )
  expect(
    strays,
    `every model call and key lookup in the turn must use the selected provider (${selected.adapterType})`,
  ).toEqual([])
}
