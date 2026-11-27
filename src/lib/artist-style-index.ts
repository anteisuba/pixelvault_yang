import {
  CURATED_NAI_ARTISTS,
  type ArtistStyleCategory,
  type CuratedNaiArtist,
} from '@/constants/artist-style-index'

/**
 * 轻量画风→画师反查引擎（纯函数，零网络依赖，<1ms）：
 * 把中/英/日氛围词或画风大类映射到 NovelAI 响应稳、辨识度高的 Danbooru 画师候选，
 * 并通过「同流派去重交错」避免每次全返回同一批顶流重厚涂画师。
 */

const CATEGORY_ALIASES: Readonly<
  Record<ArtistStyleCategory, readonly string[]>
> = {
  luminous: [
    '通透',
    '清透',
    '发光',
    '宝石',
    '星光',
    '逆光',
    '光感',
    '闪耀',
    '绚丽',
    '透明感',
    'luminous',
    'glow',
    'radiant',
    'jewel',
    'sparkle',
    'transparent',
    '透明',
  ],
  painterly: [
    '厚涂',
    '半厚涂',
    '油画',
    '笔触',
    '质感',
    '立体',
    '油彩',
    'painterly',
    'oil',
    'impasto',
    'brush',
    'rendered',
    '厚塗り',
  ],
  cel: [
    '赛璐璐',
    '赛璐珞',
    '动画',
    '番剧',
    '干净线稿',
    '清脆',
    '动漫',
    'cel',
    'anime',
    'clean line',
    'crisp',
    'アニメ',
  ],
  watercolor: [
    '水彩',
    '淡彩',
    '水墨',
    '空气感',
    '绘本',
    '童话',
    '治愈',
    '手绘',
    'watercolor',
    'watercolour',
    'airy',
    'storybook',
    '水彩画',
  ],
  flat_pop: [
    '平涂',
    '波普',
    '潮牌',
    '潮酷',
    '撞色',
    '海报',
    '高饱和',
    '平面',
    '时尚',
    'pop',
    'flat',
    'graphic',
    'vibrant',
    'poster',
    'stylish',
    'ポップ',
  ],
  cinematic: [
    '电影',
    '电影感',
    '故事感',
    '叙事',
    '大片',
    '景深',
    '冷暖对比',
    '雨夜',
    '夜景',
    '星空',
    '星海',
    '氛围',
    'cinematic',
    'film',
    'dramatic',
    'moody',
    'storytelling',
    'atmospheric',
    '映画',
  ],
  retro: [
    '复古',
    '怀旧',
    '胶片',
    '80年代',
    '90年代',
    '昭和',
    '古典',
    '老番',
    'retro',
    'vintage',
    '90s',
    '80s',
    'nostalgic',
    'classic',
    'レトロ',
  ],
  gothic_dark: [
    '暗黑',
    '哥特',
    '阴郁',
    '神秘',
    '冷峻',
    '暗调',
    '破碎',
    '忧郁',
    'gothic',
    'dark',
    'eerie',
    'somber',
    'melancholic',
    'noir',
    'ゴシック',
  ],
  sketch_ink: [
    '线稿',
    '速写',
    '墨线',
    '黑白',
    '漫画',
    '排线',
    '粗粝',
    'sketch',
    'ink',
    'lineart',
    'manga',
    'hatching',
    '線画',
  ],
  pastel_soft: [
    '粉嫩',
    '柔和',
    '温柔',
    '奶油',
    '淡雅',
    '甜美',
    '少女',
    '清新',
    'pastel',
    'soft',
    'gentle',
    'tender',
    'dreamy',
    'パステル',
  ],
  cyber_scifi: [
    '科幻',
    '赛博',
    '赛博朋克',
    '未来',
    '机能',
    '机械',
    '霓虹',
    '废土',
    'cyber',
    'scifi',
    'sci-fi',
    'futuristic',
    'neon',
    'techwear',
    'mecha',
    'サイバー',
  ],
  cute_moe: [
    '可爱',
    '萌',
    '软萌',
    '日系美少女',
    '青春',
    '校园',
    '日常',
    'cute',
    'moe',
    'kawaii',
    'youth',
    'slice of life',
    'かわいい',
  ],
}

/** 从自由查询里拆出中/英/日词元（支持逗号、顿号、空格、斜杠）。 */
function extractQueryTokens(query: string): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  const parts = normalized
    .split(/[\s,，、;；/|·]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
  return [...new Set([normalized, ...parts])]
}

/** 识别查询命中的画风大类。 */
export function matchArtistStyleCategories(
  query: string,
): ArtistStyleCategory[] {
  const lowered = query.trim().toLowerCase()
  if (!lowered) return []
  const matched: ArtistStyleCategory[] = []
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES) as [
    ArtistStyleCategory,
    readonly string[],
  ][]) {
    if (aliases.some((alias) => lowered.includes(alias))) {
      matched.push(category)
    }
  }
  return matched
}

export interface CuratedArtistMatch {
  readonly artist: CuratedNaiArtist
  readonly score: number
}

/**
 * 按画风氛围或画师名匹配精选 NAI 画师。
 * - 同时按「画风大类 + 双语氛围词 + role 描述 + 标签名」打分；
 * - 返回前按主风格交错排序，防止前 8 个全是同一种厚涂顶流导致画风同质化。
 */
export function searchCuratedArtists(
  query: string,
  options: {
    limit?: number
    excludeTags?: ReadonlySet<string>
  } = {},
): CuratedArtistMatch[] {
  const limit = Math.max(1, options.limit ?? 10)
  const lowered = query.trim().toLowerCase()
  if (!lowered) return []

  const tokens = extractQueryTokens(query)
  const categories = new Set(matchArtistStyleCategories(query))
  const seenTags = new Set<string>()
  const scored: CuratedArtistMatch[] = []

  for (const artist of CURATED_NAI_ARTISTS) {
    if (seenTags.has(artist.tag)) continue
    seenTags.add(artist.tag)
    if (options.excludeTags?.has(artist.tag)) continue

    let score = 0
    const tagSpaces = artist.tag.replace(/_/g, ' ')
    const roleLower = artist.role.toLowerCase()

    // 1. 直接点名画师名
    for (const token of tokens) {
      const slug = token.replace(/\s+/g, '_')
      if (artist.tag === slug || tagSpaces === token) score += 12
      else if (
        token.length >= 3 &&
        (artist.tag.includes(slug) || tagSpaces.includes(token))
      ) {
        score += 6
      }
    }

    // 2. 命中画风大类（主风格权重高于次风格）
    for (const [idx, style] of artist.styles.entries()) {
      if (categories.has(style)) score += idx === 0 ? 5 : 3
    }

    // 3. 命中双语氛围词 / 技法词（支持「电影感星海」子串包含「电影」「星海」）
    for (const vibe of artist.vibes) {
      const vibeLower = vibe.toLowerCase()
      if (lowered.includes(vibeLower)) {
        score += 4
      } else if (
        tokens.some(
          (token) =>
            token.length >= 2 &&
            (vibeLower.includes(token) || token.includes(vibeLower)),
        )
      ) {
        score += 2
      }
    }

    // 4. 命中英文职责描述
    for (const token of tokens) {
      if (
        token.length >= 3 &&
        /^[a-z0-9 -]+$/.test(token) &&
        roleLower.includes(token)
      ) {
        score += 2
      }
    }

    if (score > 0) scored.push({ artist, score })
  }

  if (scored.length === 0) return []

  scored.sort((a, b) => b.score - a.score)

  // 同主风格做轻微交错，保证候选既有主骨又有互补流派。
  const picked: CuratedArtistMatch[] = []
  const byPrimaryCount = new Map<ArtistStyleCategory, number>()
  const deferred: CuratedArtistMatch[] = []
  for (const item of scored) {
    const primary = item.artist.styles[0]!
    const count = byPrimaryCount.get(primary) ?? 0
    if (count < 3 || categories.size <= 1) {
      picked.push(item)
      byPrimaryCount.set(primary, count + 1)
      if (picked.length >= limit) break
    } else {
      deferred.push(item)
    }
  }
  for (const item of deferred) {
    if (picked.length >= limit) break
    picked.push(item)
  }
  return picked
}

/** 格式化为助手 `find tags` 可直接读的一行（含 NAI `artist:` 写法、建议权重与职责）。 */
export function formatCuratedArtistLine(
  artist: CuratedNaiArtist,
  tagPrefix: string,
): string {
  const naiTag = `artist:${artist.tag.replace(/_/g, ' ')}`
  return `${tagPrefix}${artist.tag} · artist (${naiTag}) · weight ${artist.weightHint} · [${artist.styles.join('/')}] ${artist.role}`
}
