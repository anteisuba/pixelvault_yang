import { AI_MODELS } from '@/constants/models/enum'

const CN_SUFFIX = '_VOLCENGINE'
const INTL_SUFFIX = '_BYTEPLUS'

/**
 * 字节同一型号在两站的条目一一配对：枚举名 `X_VOLCENGINE` ↔ `X_BYTEPLUS`。
 * 只在一站有的型号（Seedream 5.0 基础款只在火山）不在表里。
 */
const STATION_TWINS: ReadonlyMap<string, string> = (() => {
  const enumByName = AI_MODELS as unknown as Record<string, string>
  const twins = new Map<string, string>()
  for (const [name, cnId] of Object.entries(enumByName)) {
    if (!name.endsWith(CN_SUFFIX)) continue
    const intlId =
      enumByName[`${name.slice(0, -CN_SUFFIX.length)}${INTL_SUFFIX}`]
    if (!intlId) continue
    twins.set(cnId, intlId)
    twins.set(intlId, cnId)
  }
  return twins
})()

/** 这个字节条目在另一站的同款；不是字节条目或另一站没有 = undefined。 */
export function getBytedanceStationTwin(modelId: string): string | undefined {
  return STATION_TWINS.get(modelId)
}
