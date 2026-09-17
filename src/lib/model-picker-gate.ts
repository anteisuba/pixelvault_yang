import { MODEL_PICKER_PENDING_STORAGE_KEY } from '@/constants/model-picker'

/**
 * 「选了型号但还没选渠道」这件事的**进程内单一事实源**，外加一条「把那个选择器
 * 打开」的请求总线。
 *
 * ⚠ 为什么不能只放在 `useModelPickerMemory` 的组件 state 里：判断「这一枪能不能
 * 打」的是**生成按钮**，写下这个状态的是**选择器**，两者是不同的组件树。各自读一遍
 * localStorage 只会各自看到自己最后写的那一份 —— 按钮说能生成、选择器写着「先选
 * 渠道」。所以状态住模块级，两边都用 `useSyncExternalStore` 订阅同一份。
 *
 * ⚠ 键是 **`scope:gateId`**，不是 scope。同一个 scope 底下可能同时挂着很多个选择器
 * （画布上几十张图片卡都是 `image`），它们各有各的生成按钮：只按 scope 存会让一张
 * 卡没选渠道把整块画布的生成全挡了。单选择器的宿主（工作台 / 助手栏 / 配音间）不传
 * `gateId`，键退化成 `scope:scope`，行为与直觉一致。
 */

type PendingMap = Record<string, string>

const listeners = new Set<() => void>()
const openListeners = new Map<string, Set<() => void>>()

let pending: PendingMap = {}
let hydrated = false

function read(): PendingMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(MODEL_PICKER_PENDING_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as PendingMap
  } catch {
    // 隐私窗口里 localStorage 会直接抛 —— 记不住而已，闸门本身照常工作。
    return {}
  }
}

function write(next: PendingMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      MODEL_PICKER_PENDING_STORAGE_KEY,
      JSON.stringify(next),
    )
  } catch {
    // 配额满 / 隐私模式：这一轮仍然挡得住，只是下次打开记不得了。
  }
}

/** 第一次被读到时补一次 localStorage —— SSR 阶段不碰 window。 */
function ensureHydrated(): void {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  pending = read()
}

/** 选择器与闸门共用的键。单选择器的宿主不必传 `gateId`。 */
export function modelPickerGateKey(scope: string, gateId?: string): string {
  return `${scope}:${gateId ?? scope}`
}

export function getPendingModel(key: string): string | null {
  ensureHydrated()
  return pending[key] ?? null
}

export function setPendingModel(key: string, modelKey: string | null): void {
  ensureHydrated()
  if ((pending[key] ?? null) === modelKey) return
  const next = { ...pending }
  if (modelKey) next[key] = modelKey
  else delete next[key]
  pending = next
  write(next)
  for (const listener of listeners) listener()
}

export function subscribePendingModels(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 「打开这一档的选择器并定位到那一行」。生成按钮在未选渠道时点下去走这条 ——
 * ⛔ 不是弹个 toast 叫人自己去找：那一行就在选择器里等着，没有理由让他再找一遍。
 */
export function requestModelPickerOpen(key: string): void {
  const set = openListeners.get(key)
  if (!set) return
  for (const listener of set) listener()
}

export function subscribeModelPickerOpen(
  key: string,
  listener: () => void,
): () => void {
  const set = openListeners.get(key) ?? new Set<() => void>()
  set.add(listener)
  openListeners.set(key, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) openListeners.delete(key)
  }
}

/** 测试用：清掉进程内的记忆（`beforeEach` 里连同 localStorage 一起清）。 */
export function resetModelPickerGate(): void {
  pending = {}
  hydrated = false
  listeners.clear()
  openListeners.clear()
}
