import { repairUtf8Mojibake } from '@/lib/text-encoding-repair'

const CIVITAI_HASH_PATTERN = /^[0-9a-fA-F]{8,64}$/

/** Cap multi-query name resolve so one mount attempt cannot fan out unboundedly. */
export const CIVITAI_LORA_NAME_SEARCH_QUERY_MAX = 4

export function normalizeOptionalCivitaiHash(
  hash: string | null | undefined,
): string | undefined {
  const trimmed = hash?.trim()
  if (!trimmed || !CIVITAI_HASH_PATTERN.test(trimmed)) return undefined
  return trimmed.toLowerCase()
}

/**
 * ComfyUI / 整理过模型目录的作者，meta 里写的是带文件夹的相对路径
 * （`ANI/style/zi_lora-000004`、`ANI\others\x.safetensors`）。Civitai 只认
 * 文件名词干——路径不去掉，名字搜索搜不到、也认不出是不是 LoRA 自己。
 * 顺手去掉模型文件扩展名；大小写原样保留（要拿去显示）。
 */
export function stripLoraFolderPath(name: string): string {
  const trimmed = name.trim()
  const base = trimmed.split(/[\\/]/).pop()?.trim() || trimmed
  return base.replace(/\.(?:safetensors|ckpt|pt|bin)$/i, '')
}

export function toCivitaiModelSearchQuery(name: string): string {
  return repairUtf8Mojibake(name)
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
}

/**
 * Build ordered Civitai search queries for a local LoRA file/tag name.
 *
 * Full local stems (e.g. `illus01_style_collection_elpe_v0.22`) often miss
 * the public / meilisearch index; progressive stripping of version tokens and
 * pack prefixes recovers models whose published title is broader
 * ("Style Collection [IL]") while still starting from the most specific form.
 */
export function buildCivitaiLoraNameSearchQueries(name: string): string[] {
  const primary = toCivitaiModelSearchQuery(name)
  const queries: string[] = []
  const push = (raw: string) => {
    const q = raw.trim().replace(/\s+/g, ' ')
    if (q.length > 0 && !queries.includes(q)) queries.push(q)
  }

  push(primary)

  // Drop version-ish tokens: v0.22 / v1 / 0.22 / v1.198
  const withoutVersion = primary
    .replace(/\bv\d+(?:\.\d+)*\b/gi, ' ')
    .replace(/\b\d+\.\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  push(withoutVersion)

  const tokens = withoutVersion
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  // Drop leading pack/local prefixes like "illus01", "noobai01"
  const withoutLeadPack = tokens.filter(
    (token, index) =>
      !(
        index === 0 && /^(?:[a-z]{1,8}\d{1,4}|\d{1,4}[a-z]{1,8})$/i.test(token)
      ),
  )
  if (withoutLeadPack.length >= 2) {
    push(withoutLeadPack.join(' '))
  }

  // Progressive: keep the most contentful head when still long
  if (tokens.length >= 3) {
    push(tokens.slice(0, Math.max(2, tokens.length - 1)).join(' '))
  }
  if (withoutLeadPack.length >= 3) {
    push(
      withoutLeadPack
        .slice(0, Math.max(2, withoutLeadPack.length - 1))
        .join(' '),
    )
  }

  return queries.slice(0, CIVITAI_LORA_NAME_SEARCH_QUERY_MAX)
}
