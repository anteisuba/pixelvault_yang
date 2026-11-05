import {
  CHARACTER_BROWSE_SOURCE_IDS,
  CHARACTER_TOPIC_ROSTER,
  type CharacterBrowseSource,
} from '@/constants/character-browse'

/**
 * 出门见闻的链接 → 给人看的站名（话题那趟的小结丸子、标题下面那一行站名用）。
 * 先认话题名册里的网页站（`CHARACTER_TOPIC_ROSTER[].site`），再认现有来源的域名，认不出就留域名。
 * 来源名要跟着界面语言走，所以这里只回「是哪一类」，翻译交给 `useSiteName`。
 */

export type SiteName =
  | { kind: 'label'; label: string }
  | { kind: 'source'; source: CharacterBrowseSource }
  | { kind: 'host'; host: string }

/** 现有来源各自占哪些域名（⚠ 网页 `web` 没有固定域名，不在这里）。 */
const SOURCE_HOSTS: readonly {
  source: CharacterBrowseSource
  hosts: readonly string[]
}[] = [
  {
    source: CHARACTER_BROWSE_SOURCE_IDS.bilibili,
    hosts: ['bilibili.com', 'b23.tv'],
  },
  {
    source: CHARACTER_BROWSE_SOURCE_IDS.youtube,
    hosts: ['youtube.com', 'youtu.be'],
  },
  { source: CHARACTER_BROWSE_SOURCE_IDS.danbooru, hosts: ['donmai.us'] },
  { source: CHARACTER_BROWSE_SOURCE_IDS.civitai, hosts: ['civitai.com'] },
  { source: CHARACTER_BROWSE_SOURCE_IDS.x, hosts: ['x.com', 'twitter.com'] },
]

const underDomain = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`)

/** 只认 http(s) 链接的域名（去掉 www.）；别的写法（`javascript:` 之类）一律当不是链接。 */
export function webHostOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function resolveSiteName(host: string): SiteName {
  const entry = CHARACTER_TOPIC_ROSTER.find(
    (row) => row.site && underDomain(host, row.site),
  )
  if (entry?.site) return { kind: 'label', label: entry.label ?? entry.site }
  const source = SOURCE_HOSTS.find((row) =>
    row.hosts.some((domain) => underDomain(host, domain)),
  )
  if (source) return { kind: 'source', source: source.source }
  return { kind: 'host', host }
}
