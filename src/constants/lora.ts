import type { AspectRatio } from '@/constants/config'

export const LORA_WORKBENCH_SECTIONS = {
  // GENERATE 是新一等 surface（LoRA 域拥有生成，见 lora-domain-split）。
  // mine/community 保留为「库」tab 的两个子态（公开/我的），深链不破坏。
  GENERATE: 'generate',
  MINE: 'mine',
  TRAIN: 'train',
  COMMUNITY: 'community',
} as const

export type LoraWorkbenchSection =
  (typeof LORA_WORKBENCH_SECTIONS)[keyof typeof LORA_WORKBENCH_SECTIONS]

export const LORA_WORKBENCH_SECTION_VALUES = Object.values(
  LORA_WORKBENCH_SECTIONS,
)

export const DEFAULT_LORA_WORKBENCH_SECTION = LORA_WORKBENCH_SECTIONS.COMMUNITY

export const LORA_WORKBENCH_SEARCH_PARAM = 'section'

// D7③：生成页结果历史 filmstrip 的会话级上限。超过后 FIFO 丢最旧一张——
// 只在内存里存本会话结果，刷新清空（正片在素材库/画廊里另有长期归档）。
export const LORA_RESULT_HISTORY_MAX = 12

// P1-10（D7①）：生成页比例 chip 的值域与展示顺序。LoRA 出图主流是 3:4 立绘，
// 故 3:4 紧跟 1:1 排在前面（与 Studio 的 STUDIO_IMAGE_ASPECT_RATIOS 值域相同、
// 顺序不同——LoRA 域偏向竖构图）。默认值仍是 1:1，见 DEFAULT_ASPECT_RATIO。
export const LORA_GENERATE_ASPECT_RATIOS = [
  '1:1',
  '3:4',
  '4:3',
  '16:9',
  '9:16',
] as const satisfies readonly AspectRatio[]

// ── 库筛选深链（P1-5 方案 A + S1 §2.5 扩展）──────────────────────────────
// family/q/sort/nsfw/source 全部入 URL query，与上面的 section 参数同一套
// 「默认值不入 URL」约定：值等于默认时从 query 里删掉，保持深链干净。
export const LORA_LIBRARY_FAMILY_PARAM = 'family'
export const LORA_LIBRARY_SEARCH_PARAM = 'q'
export const LORA_LIBRARY_SORT_PARAM = 'sort'
export const LORA_LIBRARY_NSFW_PARAM = 'nsfw'
// source= 语义 = tab 切换（civitai/huggingface），默认 civitai 不入 URL。
export const LORA_LIBRARY_SOURCE_PARAM = 'source'
export const LORA_LIBRARY_SOURCES = {
  CIVITAI: 'civitai',
  HUGGINGFACE: 'huggingface',
} as const

export type LoraLibrarySource =
  (typeof LORA_LIBRARY_SOURCES)[keyof typeof LORA_LIBRARY_SOURCES]

export const DEFAULT_LORA_LIBRARY_SOURCE: LoraLibrarySource =
  LORA_LIBRARY_SOURCES.CIVITAI

export function isLoraLibrarySource(value: string): value is LoraLibrarySource {
  return Object.values(LORA_LIBRARY_SOURCES).includes(
    value as LoraLibrarySource,
  )
}

// ── 挂载可见性（M2a，docs/plans/lora-recipe-workflow.md）──────────────
// Studio chip 卡片 48px 缩略图请求宽度，96 覆盖 2x 屏。
export const LORA_CHIP_THUMBNAIL_WIDTH = 96
// 详细卡片来源图横滚条：图块 48×64，192 宽留出 2x + 裁切余量。
export const LORA_CARD_SOURCE_IMAGE_WIDTH = 192
// 挂载事件新鲜窗口：超过它的事件不再弹 toast（用户早已离开挂载现场）。
export const LORA_MOUNT_EVENT_FRESH_MS = 5 * 60 * 1000
// 挂载后触发按钮的高亮时长。
export const LORA_MOUNT_PULSE_MS = 4000
// LoRA 域 toast 统一停留时长（P2-2：此前部分 toast 无显式 duration，
// 观察到停留 >30s 不消失；显式设置消灭歧义）。
export const LORA_TOAST_DURATION_MS = 4000

// 收藏自愈回填：单次列表请求最多回填几行（每行一次 Civitai 请求，
// 限量避免旧收藏多的用户首次加载被拖慢；剩余行下次请求继续愈合）。
export const LORA_CIVITAI_BACKFILL_MAX_PER_REQUEST = 3

// 配方 extras 自动定位全部失败时的逃生口：跳 Civitai 站内搜索让用户自查。
export const CIVITAI_MODEL_SEARCH_URL = 'https://civitai.com/search/models'

// §4.2「常与它同挂」：聚合当前分组全部来源图配方的 extraLoras 共现计数，
// 取 Top N 且计数 ≥ 最小阈值——单例噪音（只在一张图里出现过一次）不显示。
export const LORA_OFTEN_MOUNTED_MIN_COUNT = 2
export const LORA_OFTEN_MOUNTED_MAX_RESULTS = 3

// P2-6：10 条/页在 2xl:6 列网格下永远残行；12 在 6/4/3/2 列下都能整行
// （5 列容忍最后一行留 2 空位）。
export const CIVITAI_LORA_PAGE_SIZE = 12

// Bug 修复（2026-07-18，owner 报「类型筛选后不满 12 张 + 下一页不可点」）：
// listCivitaiLorasByContentType 此前让 L1(tag)/L2(关键词) 两条 meilisearch
// 子 query 各自独立按 `offset=(page-1)*pageSize, limit=pageSize` 分页，
// 合并去重后再裁到一页——两个独立窗口有重叠时，去重会让当页凑不满
// pageSize（重叠越多缺得越多）。修复：两条子 query 改成每次都从 offset 0
// 扫到"当前页末尾 + 缓冲"，合并去重→全局重排→再按页切片，缓冲量吸收
// L1/L2 重叠造成的去重损耗。深页成本：这个策略随 page 增长线性变贵（子
// query limit = page×pageSize+缓冲），12/页 × 常见浏览深度（几十页内）仍
// 可接受；MAX_FETCH_LIMIT 兜底极端深页（如 URL 篡改 page=99999）不会打出
// 天价请求——触顶后深页可能提前报 hasNextPage=false，是已知取舍。
export const CIVITAI_LORA_CONTENT_TYPE_OVERFETCH_BUFFER = 24
export const CIVITAI_LORA_CONTENT_TYPE_MAX_FETCH_LIMIT = 480

// Hugging Face LoRA browser/import contract. The Hub remains the source of
// truth; PixelVault admits public image-diffusion SafeTensors adapters and
// caches the exact file selected by the user in R2.
export const HUGGINGFACE_LORA_API_BASE_URL = 'https://huggingface.co/api'
// 封面解析链（thumbnail → widget → 仓内图片文件 → 社交缩略图兜底）。社交
// 缩略图由 Hub 为每个公开 repo 自动生成，保证 HF 卡面 100% 有图可挂；
// 加载失败仍由 LoraCoverTile 的 onError 退回占位图标。
export const HUGGINGFACE_SOCIAL_THUMBNAIL_BASE_URL =
  'https://cdn-thumbnails.huggingface.co/social-thumbnails/models'
export const HUGGINGFACE_COVER_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
] as const
// 仓内多图时优先挑名字带这些词的（更像展示图而非训练素材）。
export const HUGGINGFACE_COVER_FILENAME_HINTS = [
  'cover',
  'preview',
  'thumb',
  'sample',
  'example',
  'showcase',
] as const

// 增量（2026-07-18，owner 追加：`lrzjason/Anything2Real` 这类 repo 落到了
// 社交横幅，但 README 里其实有真样例图——实测图片托管在
// cdn-uploads.huggingface.co（HF 网页附件上传，不在 siblings 清单里），
// README.md 用 `<img src>`/markdown `![]()` 两种形式内嵌）：封面链在「仓内
// 图片文件」与「社交缩略图」之间插一级——thumbnail/widget/仓内图三级全空
// 时才读 README 挖第一张图，读不到/解析失败静默退回社交横幅（README 是
// 增强，不能因为它失败就让整页发现结果炸掉）。
export const HUGGINGFACE_README_FILENAME = 'README.md'
// README 请求超时给比 HUGGINGFACE_REQUEST_TIMEOUT_MS（15s）更短的独立值：
// 这一级只在前三级都落空时才触发、又是并发批量发，单个请求拖太久会连累
// 一整批（HUGGINGFACE_LORA_DETAIL_CONCURRENCY 并发窗口内互不等待，但整页
// 请求要等最慢的那批完成）。
export const HUGGINGFACE_README_REQUEST_TIMEOUT_MS = 6_000
// README 正文读取上限（近似按字符数截断，多数模型卡远小于这个量级）：
// 防止个别仓库塞超大 README 拖慢解析，超限部分直接丢弃再解析。
export const HUGGINGFACE_README_MAX_READ_CHARS = 256 * 1024
// README 里的绝对图片 URL 只收这个白名单域（含子域，如
// cdn-uploads.huggingface.co）——README 是仓库作者可自由编辑的自由文本，
// 不像 cardData.thumbnail/widget 那样结构化，任意外链图片会变成对第三方
// 站点的热链（隐私/可用性风险），只收 HF 自己域下的图片。
export const HUGGINGFACE_README_ALLOWED_IMAGE_HOSTS = [
  'huggingface.co',
  'cdn-uploads.huggingface.co',
] as const

// 库侧封面渐进增强（README 挖掘从同步阻塞改客户端懒加载，owner 2026-07-18
// 拍板方案 B——根因：曾经的 `hydrateReadmeCoverImages` 在列表请求里 await
// 对每张落到社交横幅兜底的卡拉 README，N 个往返的尾延迟把 HF 库首屏拖到
// 5–31s；单仓库 README 往返实测只要 0.28s，瓶颈是"同步阻塞做 N 个往返"不
// 是"单个慢"）。列表改秒回，客户端对落空卡按需懒加载真图，见
// `getHuggingFaceRepoShowcase` + `/api/lora-assets/huggingface/showcase`。
export const HUGGINGFACE_SHOWCASE_CACHE_TTL_MS = 15 * 60 * 1000
export const HUGGINGFACE_SHOWCASE_REPO_ID_MAX_LENGTH = 200
export const HUGGINGFACE_SHOWCASE_REVISION_MAX_LENGTH = 200
// 客户端 IntersectionObserver 提前量——卡片进视口前这个距离就开始预取，
// 避免用户刚好滚到卡片时才看见骨架到真图的切换。与 GalleryGrid 的
// `rootMargin: '200px'` 同量级保持一致体感。
export const HUGGINGFACE_SHOWCASE_LAZY_LOAD_ROOT_MARGIN = '200px'

// H1 生成侧「样例参考」（lora-workbench.md §13）：README 提示词启发式提取
// 的候选条数上限——防止个别 README 塞几十个 fenced block/prompt 行把面板
// 撑爆，6 条足够覆盖常见「示例画廊配文案」场景。
export const HUGGINGFACE_README_PROMPT_CANDIDATE_MAX = 6

/**
 * 判定封面 URL 是否落在 Hub 社交缩略图兜底域——服务端 `resolveCoverImageUrl`
 * 精确按 repoId 拼出兜底 URL 做等值比较（见 huggingface-lora.service.ts 的
 * `isFallbackSocialThumbnail`），客户端只有最终 URL 字符串、没必要重新实
 * 现 repoId→URL 的编码逻辑，做域名前缀匹配即可——两种判法对同一个真实兜
 * 底 URL 结果一致。库卡片用这个决定是否需要懒加载 README showcase。
 */
export function isHuggingFaceSocialThumbnailCoverUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false
  return url.startsWith(`${HUGGINGFACE_SOCIAL_THUMBNAIL_BASE_URL}/`)
}

export const HUGGINGFACE_LORA_BASE_MODEL_FAMILY = 'anima-dit'
export const HUGGINGFACE_LORA_DEFAULT_FAMILY = 'all'
export const HUGGINGFACE_LORA_FAMILY_VALUES = [
  'all',
  'anima-dit',
  'illustrious',
  'pony',
  'sdxl',
  'flux',
  'sd15',
  'qwen-image',
  'z-image',
  'other',
] as const
export type HuggingFaceLoraFamily =
  (typeof HUGGINGFACE_LORA_FAMILY_VALUES)[number]
export const HUGGINGFACE_LORA_ANIMA_ADAPTER_FILTER =
  'base_model:adapter:circlestone-labs/Anima'
// Bug 修复（2026-07-18，owner 报「HF + Illustrious → 没有找到匹配的公开
// LoRA」）：非 anima-dit 家族的发现请求只传 `filter=lora` 全局盲扫
// （getDiscoveryFilter），在 HUGGINGFACE_LORA_MAX_CURSOR_SCANS 扫描窗口内
// 按下载量排完全没命中该家族就报空——但 Hub 供给其实存在（实测
// `?filter=lora&search=illustrious` 命中 calcuis/illustrious、
// OnomaAIResearch/Illustrious-xl-* 等大量仓库）。用家族关键词播种 Hub
// `search` 参数，把扫描窗口对准供给存在的页面；本地 inferBaseModelFamily
// 仍是最终闸门，种子词命中的非该家族仓库照常被滤掉，不会放宽准确性。
// 种子词与用户搜索词按空格拼接（HF Hub search 语义实测为 AND：多词必须
// 同时出现在 id/tags/等可搜字段里，见 2026-07-18 curl 实测：
// `search=illustrious naruto` 只返回同时匹配两个词的仓库）。
// 逐个实测（2026-07-18，`GET /api/models?filter=lora&search=<词>&limit=100`
// 取样核对 base_model 标签）：illustrious/pony/sdxl/flux/sd15/qwen-image/
// z-image 均命中良好、样本 base_model 与家族对应；'sd 1.5'（带空格）会连带
// 命中大量多家族混标仓库（噪音更高），改用无空格的 'sd15' 更准。'other'
// 是不属于任何命名家族的兜底桶，没有语义种子词，保持现状盲扫。
export const HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS: Partial<
  Record<Exclude<HuggingFaceLoraFamily, 'all'>, string>
> = {
  illustrious: 'illustrious',
  pony: 'pony',
  sdxl: 'sdxl',
  flux: 'flux',
  sd15: 'sd15',
  'qwen-image': 'qwen-image',
  'z-image': 'z-image',
}
export const HUGGINGFACE_LORA_CURATED_ANIMA_REPOS = [
  'circlestone-labs/Anima-Official-LoRAs',
] as const
export const HUGGINGFACE_LORA_DEFAULT_LIMIT = 12
export const HUGGINGFACE_LORA_MAX_LIMIT = 40
// A Hub page can contain non-image LoRAs or weights that fail our file-size
// verification. Continue through a bounded number of cursor pages to fill one
// PixelVault page without ever skipping accepted results.
export const HUGGINGFACE_LORA_MAX_CURSOR_SCANS = 8
export const HUGGINGFACE_LORA_MAX_SEARCH_LENGTH = 120
export const HUGGINGFACE_LORA_MAX_CURSOR_LENGTH = 4096
export const HUGGINGFACE_LORA_ALLOWED_EXTENSION = '.safetensors'
// Hub repositories are community-authored and can be mistagged as `lora`.
// Anima's complete UNET is ~4.18 GB while even the published rank-512
// extracted adapters stay below 2 GiB, so files above this boundary belong in
// the Runner base-model catalog rather than the user LoRA library.
export const HUGGINGFACE_LORA_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
export const HUGGINGFACE_LORA_DETAIL_CONCURRENCY = 4

// HF Hub `/api/models` 排序实测（2026-07-17，S1 开工验证，见
// docs/references/pages/lora-workbench.md §2.1/§10）：`sort=trending` 不被
// Hub 接受（400 Invalid sort parameter），真实的「推荐」排序参数是
// `trendingScore`；`downloads`/`lastModified` 均验证可用，且都能与
// `filter`/`search` 组合。三值全部实测生效，不需要「不支持不渲染」回落。
// UI 复用 civitai 排序的三个 labelKey（推荐/最多下载/最新），顺序对齐两个
// tab 保持视觉一致。`downloads` 是现状默认（服务端此前硬编码），保持不变。
export const HUGGINGFACE_LORA_SORT_VALUES = [
  'trendingScore',
  'downloads',
  'lastModified',
] as const

export type HuggingFaceLoraSort = (typeof HUGGINGFACE_LORA_SORT_VALUES)[number]

export const HUGGINGFACE_LORA_SORT_OPTIONS = [
  { value: 'trendingScore', labelKey: 'sortHighestRated' },
  { value: 'downloads', labelKey: 'sortMostDownloaded' },
  { value: 'lastModified', labelKey: 'sortNewest' },
] as const satisfies readonly {
  value: HuggingFaceLoraSort
  labelKey: string
}[]

export const DEFAULT_HUGGINGFACE_LORA_SORT: HuggingFaceLoraSort = 'downloads'

export function isHuggingFaceLoraSort(
  value: string,
): value is HuggingFaceLoraSort {
  return (HUGGINGFACE_LORA_SORT_VALUES as readonly string[]).includes(value)
}

export const MODEL_KEYWORD_LORA_KEYWORD_RAW_URL =
  'https://raw.githubusercontent.com/mix1009/model-keyword/main/lora-keyword.txt'

export const MODEL_KEYWORD_LORA_QUERY_MIN_LENGTH = 2

export const MODEL_KEYWORD_LORA_RESULT_LIMIT = 12

export const MODEL_KEYWORD_LORA_FETCH_TIMEOUT_MS = 8000

// Base model options exposed in the LoRA training form. `available: false`
// shows the option as "Coming Soon" so users see the roadmap but can't
// submit a job we don't have a trainer for. Add a Replicate/fal trainer
// route in lora-training.service.ts when flipping `available: true`.
export const LORA_TRAINING_BASE_MODELS = [
  {
    id: 'flux-1-d',
    label: 'FLUX.1 D',
    available: true,
    descriptionKey: 'baseModelFluxDescription',
  },
  {
    id: 'sdxl-1.0',
    label: 'SDXL 1.0',
    available: false,
    descriptionKey: 'baseModelSdxlDescription',
  },
  {
    id: 'illustrious',
    label: 'Illustrious',
    available: false,
    descriptionKey: 'baseModelIllustriousDescription',
  },
] as const

export type LoraTrainingBaseModel =
  (typeof LORA_TRAINING_BASE_MODELS)[number]['id']

export const LORA_TRAINING_BASE_MODEL_VALUES = LORA_TRAINING_BASE_MODELS.map(
  (m) => m.id,
) as readonly LoraTrainingBaseModel[]

export const DEFAULT_LORA_TRAINING_BASE_MODEL: LoraTrainingBaseModel =
  'flux-1-d'

export const CIVITAI_LORA_SORT_VALUES = [
  'Highest Rated',
  'Most Downloaded',
  'Newest',
] as const

export type CivitaiLoraSort = (typeof CIVITAI_LORA_SORT_VALUES)[number]

export const CIVITAI_LORA_SORT_OPTIONS = [
  { value: 'Highest Rated', labelKey: 'sortHighestRated' },
  { value: 'Most Downloaded', labelKey: 'sortMostDownloaded' },
  { value: 'Newest', labelKey: 'sortNewest' },
] as const satisfies readonly {
  value: CivitaiLoraSort
  labelKey: string
}[]

// 顺序决定 UI 上 filter chip 的展示顺序：Illustrious 排在最前（我们的首选
// anime 路径），然后是 Flux / SDXL 这些有 native 端点的，最后是只能跳走的
// Pony / SD 1.5 / Anima / 新家族。
//
// 2026-07-07 与 Civitai 全量 base model 清单对齐（数据驱动：按 meilisearch
// estimatedTotalHits 实测供给，≥1000 个 LoRA 的家族才配 named chip，其余全部
// 落进 'other' 兜底桶——保证任何 Civitai baseModel 值都可被过滤到，无枚举
// 遗漏）。实测（2026-07-07）：Z-Image 系 ~9.3k · NoobAI 8.4k（并入
// Illustrious 桶）· Qwen 1.7k · Chroma 1.1k；Flux.2 D 111 / Pony V7 65 /
// HiDream 65 / SD 3.5 ≈0 → 'other'。视频家族（Wan/Hunyuan Video 等）也归
// 'other'——本库是图像 LoRA 场景，不为视频家族占 chip 位。
export const CIVITAI_LORA_BASE_MODEL_VALUES = [
  'all',
  'Illustrious',
  'Flux.1 D',
  'SDXL 1.0',
  'Pony',
  'SD 1.5',
  'Anima',
  'Qwen',
  'Z-Image',
  'Chroma',
  'other',
] as const

export type CivitaiLoraBaseModel =
  (typeof CIVITAI_LORA_BASE_MODEL_VALUES)[number]

// Civitai 的 `baseModels` 过滤参数有 coverage bug：传 `baseModels=Illustrious`
// 时会漏掉很多 modelVersions[].baseModel === 'Illustrious' 的 LoRA（实测搜
// "Wuthering Waves" 时 30 → 4，丢 80%）。所以我们不传 baseModels 给 Civitai，
// 改成 over-fetch + 客户端按 family bucket 过滤。
//
// 每个 family 对应一组 Civitai 上常见的 baseModel 字符串，组内 LoRA 在推理时
// 可以互相兼容（共享底模架构），所以视为一个 family。
export const CIVITAI_BASE_MODEL_FAMILY_MEMBERS = {
  // NoobAI 是 Illustrious 衍生的 finetune，权重结构兼容，可共用 Replicate
  // delta-lock/noobai-xl 端点。
  Illustrious: ['Illustrious', 'NoobAI'],
  // Flux.1 Krea 是 Flux.1 dev 的同架构 drop-in 变体，LoRA 互通。
  'Flux.1 D': ['Flux.1 D', 'Flux.1 S', 'Flux.1 Krea'],
  // Lightning/Hyper/LCM 是 SDXL 1.0 的蒸馏/加速变体，LoRA 权重结构同源。
  'SDXL 1.0': [
    'SDXL 1.0',
    'SDXL 0.9',
    'SDXL Turbo',
    'SDXL Lightning',
    'SDXL Hyper',
    'SDXL 1.0 LCM',
  ],
  // 只收 SDXL 架构的 V6 系；Pony V7 是 AuraFlow 架构、权重不通，归 'other'。
  Pony: ['Pony'],
  'SD 1.5': ['SD 1.5', 'SD 1.5 LCM', 'SD 1.5 Hyper', 'SD 1.4'],
  Anima: ['Anima'],
  Qwen: ['Qwen'],
  // Turbo 是 Z-Image 的蒸馏版，浏览归同一家族桶（Civitai 上供给以 Turbo 为主）。
  'Z-Image': ['ZImageBase', 'ZImageTurbo'],
  Chroma: ['Chroma'],
} as const satisfies Record<
  Exclude<CivitaiLoraBaseModel, 'all' | 'other'>,
  readonly string[]
>

// 'other' 兜底桶的判定集合：不属于任何 named family 的 baseModel 都算 other。
export const CIVITAI_NAMED_BASE_MODEL_MEMBER_SET: ReadonlySet<string> = new Set(
  Object.values(CIVITAI_BASE_MODEL_FAMILY_MEMBERS).flat(),
)

// Civitai REST can filter by explicit baseModels but cannot express NOT IN.
// Keep the full complement check in service code, and use this curated long-tail
// set only to keep the "other" browse path from scanning broad all-model pages.
export const CIVITAI_OTHER_BASE_MODEL_MEMBERS = [
  'Pony V7',
  'Flux.2 D',
  'Flux.2 S',
  'HiDream',
  'SD 3.5',
  'SD 3',
  'SD 2.1',
  'SD 2.0',
  'AuraFlow',
  'Kolors',
  'PixArt a',
  'PixArt E',
  'Wan Video 14B t2v',
  'Wan Video 14B i2v 480p',
  'Wan Video 14B i2v 720p',
  'Hunyuan Video',
  'LTXV',
  'Mochi',
  'CogVideoX',
] as const

// 每个 base model family 在 PixelVault 上能不能跑生成：
//   - 'native':   有 native 端点，用户能在 PixelVault 内部生成
//   - 'external': 没有可用端点（权重结构不兼容 / license 限制 / 缺端点），
//                 引导用户去 Civitai 自己跑
//
// 判断依据：
//   Illustrious / SDXL 1.0：跑 delta-lock/noobai-xl (Replicate)，已验证
//   Flux.1 D：跑 fal-ai/flux-lora，已验证
//   Pony：Comfy Runner（RunPod）跑 Pony Diffusion V6 XL checkpoint，忠实复刻
//   SD 1.5：项目没有 SD 1.5 推理端点（runner 范围也不含，见 HANDOFF §4.2b）
//   Anima：作者 license 不授权第三方托管 hosted 端点，但 Comfy Runner 自建
//          环境跑同一 checkpoint 不受此限制，已转 native
//
// Pony / Anima 2026-07 随 comfy runner（RunPod）交付翻转为 native，见
// docs/plans/comfy-runner-HANDOFF-2026-07.md §4.2b。实际可生成性仍受
// FEATURE_FLAGS.comfyRunner 门控——flag 关闭时对应 AI_MODELS.available 为
// false，isCivitaiBaseModelGeneratable() 只反映"有 native 路径"，不代表
// flag 已开。
type CivitaiBaseModelGeneratability = 'native' | 'external'

export const CIVITAI_BASE_MODEL_GENERATABILITY = {
  Illustrious: 'native',
  'Flux.1 D': 'native',
  'SDXL 1.0': 'native',
  Pony: 'native',
  'SD 1.5': 'external',
  Anima: 'native',
  Qwen: 'external',
  'Z-Image': 'external',
  Chroma: 'external',
} as const satisfies Record<
  Exclude<CivitaiLoraBaseModel, 'all' | 'other'>,
  CivitaiBaseModelGeneratability
>

/**
 * 判断一个 LoRA 的 baseModel 字符串能不能在 PixelVault 内部生成。接受 Civitai
 * 返回的原始 baseModel（如 'Illustrious'、'NoobAI'、'Flux.1 D' 等），自动映射
 * 到 family bucket 后查 generatability。
 */
export function isCivitaiBaseModelGeneratable(rawBaseModel: string): boolean {
  for (const [family, members] of Object.entries(
    CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  )) {
    if ((members as readonly string[]).includes(rawBaseModel)) {
      return (
        CIVITAI_BASE_MODEL_GENERATABILITY[
          family as Exclude<CivitaiLoraBaseModel, 'all' | 'other'>
        ] === 'native'
      )
    }
  }
  return false
}

// ── 库 · 授权徽标（S3 统一详情抽屉，lora-workbench.md §2.4「P0-2 规范」）──
// Civitai `allowCommercialUse` 枚举值：'Image'（卖生成图）/ 'Rent'（任意
// 第三方推理服务）/ 'Sell'（出售模型本身）/ 'RentCivit'（仅限 Civitai 平台
// 内部租 GPU）。P0-2 的「可商用」判定只看前三个——RentCivit 是站内限定权
// 限，不构成用户理解的「可以拿去商用」。
export const CIVITAI_COMMERCIAL_USE_VALUES = ['Image', 'Rent', 'Sell'] as const

export function isCivitaiLoraCommerciallyUsable(
  allowCommercialUse: readonly string[],
): boolean {
  return allowCommercialUse.some((value) =>
    (CIVITAI_COMMERCIAL_USE_VALUES as readonly string[]).includes(value),
  )
}

// ── 库 · family slug 值域（S1 统一外壳，2026-07-17）─────────────────────
// docs/references/pages/lora-workbench.md §2.2：UI/URL 层统一用小写 slug；
// civitai/HF 各自的 API 层值域（CIVITAI_LORA_BASE_MODEL_VALUES /
// HUGGINGFACE_LORA_FAMILY_VALUES，above）保留不变、不动 service 契约——
// 这层只做纯翻译。'chroma' 只有 civitai 有供给，HF 端没有对应值。
export const LORA_LIBRARY_FAMILY_VALUES = [
  'all',
  'illustrious',
  'flux',
  'sdxl',
  'pony',
  'sd15',
  'anima',
  'qwen',
  'z-image',
  'chroma',
  'other',
] as const

export type LoraLibraryFamily = (typeof LORA_LIBRARY_FAMILY_VALUES)[number]

export function isLoraLibraryFamily(value: string): value is LoraLibraryFamily {
  return (LORA_LIBRARY_FAMILY_VALUES as readonly string[]).includes(value)
}

const CIVITAI_BASE_MODEL_TO_FAMILY_SLUG: Record<
  CivitaiLoraBaseModel,
  LoraLibraryFamily
> = {
  all: 'all',
  Illustrious: 'illustrious',
  'Flux.1 D': 'flux',
  'SDXL 1.0': 'sdxl',
  Pony: 'pony',
  'SD 1.5': 'sd15',
  Anima: 'anima',
  Qwen: 'qwen',
  'Z-Image': 'z-image',
  Chroma: 'chroma',
  other: 'other',
}

export function civitaiBaseModelToFamilySlug(
  value: CivitaiLoraBaseModel,
): LoraLibraryFamily {
  return CIVITAI_BASE_MODEL_TO_FAMILY_SLUG[value]
}

const FAMILY_SLUG_TO_CIVITAI_BASE_MODEL: Record<
  LoraLibraryFamily,
  CivitaiLoraBaseModel
> = {
  all: 'all',
  illustrious: 'Illustrious',
  flux: 'Flux.1 D',
  sdxl: 'SDXL 1.0',
  pony: 'Pony',
  sd15: 'SD 1.5',
  anima: 'Anima',
  qwen: 'Qwen',
  'z-image': 'Z-Image',
  chroma: 'Chroma',
  other: 'other',
}

export function familySlugToCivitaiBaseModel(
  slug: LoraLibraryFamily,
): CivitaiLoraBaseModel {
  return FAMILY_SLUG_TO_CIVITAI_BASE_MODEL[slug]
}

const HUGGINGFACE_FAMILY_TO_FAMILY_SLUG: Record<
  HuggingFaceLoraFamily,
  LoraLibraryFamily
> = {
  all: 'all',
  'anima-dit': 'anima',
  illustrious: 'illustrious',
  pony: 'pony',
  sdxl: 'sdxl',
  flux: 'flux',
  sd15: 'sd15',
  'qwen-image': 'qwen',
  'z-image': 'z-image',
  other: 'other',
}

export function huggingFaceFamilyToFamilySlug(
  value: HuggingFaceLoraFamily,
): LoraLibraryFamily {
  return HUGGINGFACE_FAMILY_TO_FAMILY_SLUG[value]
}

// HF 值域没有 chroma——落在这张表外的 slug（目前只有 'chroma'）统一回落
// HUGGINGFACE_LORA_DEFAULT_FAMILY（'all'），不抛错也不静默丢弃筛选状态。
const FAMILY_SLUG_TO_HUGGINGFACE_FAMILY: Partial<
  Record<LoraLibraryFamily, HuggingFaceLoraFamily>
> = {
  all: 'all',
  illustrious: 'illustrious',
  flux: 'flux',
  sdxl: 'sdxl',
  pony: 'pony',
  sd15: 'sd15',
  anima: 'anima-dit',
  qwen: 'qwen-image',
  'z-image': 'z-image',
  other: 'other',
}

export function familySlugToHuggingFaceFamily(
  slug: LoraLibraryFamily,
): HuggingFaceLoraFamily {
  return (
    FAMILY_SLUG_TO_HUGGINGFACE_FAMILY[slug] ?? HUGGINGFACE_LORA_DEFAULT_FAMILY
  )
}

// 每源在 chip 行里实际能筛的 slug 子集——§2.1「某源不支持的 family chip 在
// 该源下隐藏」。civitai 覆盖全集；HF 没有 chroma 供给。
export const LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE: Record<
  LoraLibrarySource,
  readonly LoraLibraryFamily[]
> = {
  [LORA_LIBRARY_SOURCES.CIVITAI]: LORA_LIBRARY_FAMILY_VALUES,
  [LORA_LIBRARY_SOURCES.HUGGINGFACE]: LORA_LIBRARY_FAMILY_VALUES.filter(
    (slug) => slug !== 'chroma',
  ),
}

// ── 库 · 内容类型筛选（S2，docs/references/pages/lora-workbench.md §3）───
// 7 类：人物/服装/表情/姿势/风格/概念/场景。civitaiTags 是三重兜底的 L1
// tag 下推候选；2026-07-17 S2 开工用 meilisearch estimatedTotalHits 实测
// （POST search-new.civitai.com/multi-search，filter `tags.name IN [...]` +
// `type = LoRA`，回写 lora-workbench.md §3.1）：
//   character 100000(封顶) · clothing 25838 · outfit 1220 · costume 1100 ·
//   expressions 46 · emotion 37 · poses 5059 · pose 1847 · style 100000(封顶)
//   · concept 45368 · background 6830 · scenery 1851
// 供给 <500 的 tag（expressions/emotion）从 civitaiTags 剔除，只靠
// nameKeywords（L2）+ override（L3）兜底——L2 用 meilisearch q= 全文近似
// 测得 expression/smile/face/emotion 分别 1388/6626/11004/164，合计供给
// 健康，未触发"三层合计供给仍稀薄"的首发隐藏门槛，故「表情」保留渲染
// （不并入「概念」，与文档草稿的默认假设不同——供给实测推翻了它）。
export const LORA_CONTENT_TYPES = [
  {
    id: 'character',
    labelKey: 'typeCharacter',
    civitaiTags: ['character'],
    hfTags: ['character'],
    nameKeywords: ['character', 'oc'],
    searchFallbackTerm: 'character',
  },
  {
    id: 'clothing',
    labelKey: 'typeClothing',
    civitaiTags: ['clothing', 'outfit', 'costume'],
    hfTags: [],
    nameKeywords: ['outfit', 'dress', 'uniform', 'costume'],
    searchFallbackTerm: 'outfit',
  },
  {
    id: 'expression',
    labelKey: 'typeExpression',
    // expressions(46) / emotion(37) 供给 <500，从 L1 下推集合剔除（上方
    // 注释），只靠 nameKeywords + override 兜底。
    civitaiTags: [],
    hfTags: [],
    nameKeywords: ['expression', 'smile', 'face', 'emotion'],
    searchFallbackTerm: 'expression',
  },
  {
    id: 'pose',
    labelKey: 'typePose',
    civitaiTags: ['poses', 'pose'],
    hfTags: [],
    nameKeywords: ['pose', 'posture', 'position'],
    searchFallbackTerm: 'pose',
  },
  {
    id: 'style',
    labelKey: 'typeStyle',
    civitaiTags: ['style'],
    hfTags: ['style'],
    nameKeywords: ['style', 'artstyle', 'aesthetic'],
    searchFallbackTerm: 'art style',
  },
  {
    id: 'concept',
    labelKey: 'typeConcept',
    civitaiTags: ['concept'],
    hfTags: ['concept'],
    nameKeywords: ['concept'],
    searchFallbackTerm: 'concept',
  },
  {
    id: 'scene',
    labelKey: 'typeScene',
    civitaiTags: ['background', 'scenery'],
    hfTags: [],
    nameKeywords: ['background', 'scenery', 'landscape'],
    searchFallbackTerm: 'background',
  },
] as const satisfies readonly {
  id: string
  labelKey: string
  civitaiTags: readonly string[]
  hfTags: readonly string[]
  nameKeywords: readonly string[]
  searchFallbackTerm: string
}[]

export type LoraContentTypeDefinition = (typeof LORA_CONTENT_TYPES)[number]
export type LoraContentTypeId = LoraContentTypeDefinition['id']
export type LoraContentType = LoraContentTypeId | 'all'

export const LORA_CONTENT_TYPE_VALUES = [
  'all',
  ...LORA_CONTENT_TYPES.map((definition) => definition.id),
] as const satisfies readonly LoraContentType[]

export const DEFAULT_LORA_CONTENT_TYPE: LoraContentType = 'all'

// URL `type=` 深链参数（§2.5）。
export const LORA_LIBRARY_TYPE_PARAM = 'type'

export function isLoraContentType(value: string): value is LoraContentType {
  return (LORA_CONTENT_TYPE_VALUES as readonly string[]).includes(value)
}

/** URL `type=` 解析：未知值静默按 'all'（沿用 family/P1-5 的约定）。 */
export function parseLoraLibraryTypeParam(
  raw: string | null | undefined,
): LoraContentType {
  if (!raw) return DEFAULT_LORA_CONTENT_TYPE
  const trimmed = raw.trim().toLowerCase()
  return isLoraContentType(trimmed) ? trimmed : DEFAULT_LORA_CONTENT_TYPE
}

export function getLoraContentTypeDefinition(
  type: LoraContentTypeId,
): LoraContentTypeDefinition {
  const found = LORA_CONTENT_TYPES.find((definition) => definition.id === type)
  if (!found) {
    throw new Error(`Unknown LoRA content type: ${type}`)
  }
  return found
}

// per-source 可用性（与 family 同机制，§2.1）：2026-07-17 HF 供给实测
// （Hub `/api/models?filter=lora&search=<关键词>` 近似，回写 §3.1）未发现
// 任何类型完全 0 供给（character 266 · outfit 115 · dress 155 · uniform 75
// · costume 41 · expression 31 · smile 31 · face 433 · emotion 81 · pose 95
// · posture 2 · style 1000(封顶) · concept 279 · background 83 · scenery 13
// · landscape 46）——7 类在 HF tab 下全部保留渲染，机制留着供未来实测收窄。
export const LORA_CONTENT_TYPE_VALUES_BY_SOURCE: Record<
  LoraLibrarySource,
  readonly LoraContentType[]
> = {
  [LORA_LIBRARY_SOURCES.CIVITAI]: LORA_CONTENT_TYPE_VALUES,
  [LORA_LIBRARY_SOURCES.HUGGINGFACE]: LORA_CONTENT_TYPE_VALUES,
}

// L3 自建映射（§3.2）：人工/挖掘维护的纠错层，优先级最高——L2 误报进
// exclude、L1/L2 都漏的热门模型进 override。首发允许空表，机制先立起来。
// civitai 用 modelId（数字，稳定）；HF 没有稳定数字 id，用 repoId。
export const LORA_CONTENT_TYPE_OVERRIDES: Record<number, LoraContentTypeId> = {}

export const LORA_CONTENT_TYPE_EXCLUDES: Record<number, LoraContentTypeId> = {}

export const LORA_CONTENT_TYPE_OVERRIDES_HF: Record<string, LoraContentTypeId> =
  {}

export const LORA_CONTENT_TYPE_EXCLUDES_HF: Record<string, LoraContentTypeId> =
  {}

// HF 类型检索播种（owner 2026-07-18 报告：HF「风格」类型每页只出 3-4
// 张）。根因：`buildDiscoverySearchTerm` 此前只对家族播种，类型无播种——
// 选某个类型时 Hub `search` 若为空就按下载量全局盲扫，本地
// `modelMatchesContentType` 再过滤该类型，盲扫窗口里该类型供给稀薄，凑不
// 满一页。实测（`GET /api/models?filter=lora&search=<词>&limit=100`）：类
// 型种子单用命中充足——style=100(封顶)/character=100/outfit=100/
// concept=100；家族+类型双种子 AND 也够用——pony style=100/
// illustrious art style=26/sdxl character=13，都远好于盲扫命中 0。风格用
// 单词 'style'（不是 searchFallbackTerm 的 'art style' 两词）——AND 组合
// 更宽（pony style=100 vs illustrious art style=26）。expression 供给
// <500（同上方 §3.1 表），播种反而在 AND 组合下拉空，不设种子、继续靠本
// 地 nameKeywords 兜底。
export const HUGGINGFACE_LORA_CONTENT_TYPE_SEARCH_SEEDS: Partial<
  Record<LoraContentTypeId, string>
> = {
  character: 'character',
  clothing: 'outfit',
  pose: 'pose',
  style: 'style',
  concept: 'concept',
  scene: 'background',
}

function normalizeFamilyMatchToken(value: string): string {
  return value.toLowerCase().replace(/[\s.]+/g, '')
}

/**
 * URL `family=` 解析：新深链直接是 slug；旧深链（P1-5 时代）存的是 civitai
 * 原始 baseModel 字符串（如 `Illustrious`、`Flux.1 D`）。大小写不敏感 +
 * 空格/点容错，未知值静默按 'all'（P1-5「非法值静默按默认」约定的延伸）。
 */
export function parseLoraLibraryFamilyParam(
  raw: string | null | undefined,
): LoraLibraryFamily {
  if (!raw) return 'all'
  const trimmed = raw.trim()
  if (!trimmed) return 'all'
  const normalized = normalizeFamilyMatchToken(trimmed)

  const slugMatch = LORA_LIBRARY_FAMILY_VALUES.find(
    (slug) => normalizeFamilyMatchToken(slug) === normalized,
  )
  if (slugMatch) return slugMatch

  const civitaiMatch = CIVITAI_LORA_BASE_MODEL_VALUES.find(
    (value) => normalizeFamilyMatchToken(value) === normalized,
  )
  if (civitaiMatch) return civitaiBaseModelToFamilySlug(civitaiMatch)

  const hfMatch = HUGGINGFACE_LORA_FAMILY_VALUES.find(
    (value) => normalizeFamilyMatchToken(value) === normalized,
  )
  if (hfMatch) return huggingFaceFamilyToFamilySlug(hfMatch)

  return 'all'
}

// 训练预设 — 给「我想训一个 X」的用户一个不用调任何 dial 的入口。点一张卡，
// 表单的 loraType / baseModel / 默认 triggerWord 一起被填上，用户只需要上传图
// 和起名字。3 列 × 2 行 = 6 张刚好填满桌面端。
//
// id 是稳定 key（i18n 名字按 nameKey 取）。`available: false` 的卡渲染成
// Coming Soon tooltip，点击不会触发 onSelect — 跟 LORA_TRAINING_BASE_MODELS
// 同一套门控逻辑。新增 preset 时如果 baseModel 不是 'flux-1-d'，要先把
// service 层的 trainer 端点接上再 flip available。
export const LORA_TRAINING_PRESETS = [
  {
    id: 'anime-character',
    available: true,
    loraType: 'subject',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_character',
    nameKey: 'presetAnimeCharacterName',
    descriptionKey: 'presetAnimeCharacterDescription',
    explanationKey: 'presetAnimeCharacterExplanation',
    icon: 'sparkles',
  },
  {
    id: 'realistic-portrait',
    available: true,
    loraType: 'subject',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_person',
    nameKey: 'presetRealisticPortraitName',
    descriptionKey: 'presetRealisticPortraitDescription',
    explanationKey: 'presetRealisticPortraitExplanation',
    icon: 'user',
  },
  {
    id: 'art-style',
    available: true,
    loraType: 'style',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_style',
    nameKey: 'presetArtStyleName',
    descriptionKey: 'presetArtStyleDescription',
    explanationKey: 'presetArtStyleExplanation',
    icon: 'palette',
  },
  {
    id: 'object',
    available: true,
    loraType: 'subject',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_object',
    nameKey: 'presetObjectName',
    descriptionKey: 'presetObjectDescription',
    explanationKey: 'presetObjectExplanation',
    icon: 'box',
  },
  {
    id: 'sdxl-coming-soon',
    available: false,
    loraType: 'subject',
    baseModel: 'sdxl-1.0',
    suggestedTriggerWord: '',
    nameKey: 'presetSdxlName',
    descriptionKey: 'presetSdxlDescription',
    explanationKey: 'presetSdxlExplanation',
    icon: 'image',
  },
  {
    id: 'illustrious-coming-soon',
    available: false,
    loraType: 'subject',
    baseModel: 'illustrious',
    suggestedTriggerWord: '',
    nameKey: 'presetIllustriousName',
    descriptionKey: 'presetIllustriousDescription',
    explanationKey: 'presetIllustriousExplanation',
    icon: 'wand',
  },
] as const satisfies readonly {
  id: string
  available: boolean
  loraType: 'subject' | 'style'
  baseModel: LoraTrainingBaseModel
  suggestedTriggerWord: string
  nameKey: string
  descriptionKey: string
  explanationKey: string
  icon: 'sparkles' | 'user' | 'palette' | 'box' | 'image' | 'wand'
}[]

export type LoraTrainingPreset = (typeof LORA_TRAINING_PRESETS)[number]
export type LoraTrainingPresetId = LoraTrainingPreset['id']

export function getLoraTrainingPreset(
  id: LoraTrainingPresetId,
): LoraTrainingPreset | undefined {
  return LORA_TRAINING_PRESETS.find((p) => p.id === id)
}

export function isLoraWorkbenchSection(
  value: string | null,
): value is LoraWorkbenchSection {
  return (
    typeof value === 'string' &&
    (LORA_WORKBENCH_SECTION_VALUES as readonly string[]).includes(value)
  )
}

export function isCivitaiLoraSort(value: string): value is CivitaiLoraSort {
  return (CIVITAI_LORA_SORT_VALUES as readonly string[]).includes(value)
}

export function isCivitaiLoraBaseModel(
  value: string,
): value is CivitaiLoraBaseModel {
  return (CIVITAI_LORA_BASE_MODEL_VALUES as readonly string[]).includes(value)
}

// P1-6（2026-07-04 三态分级；2026-07-06 owner 改回默认 safe）：
//   safe         — 默认。civitai `nsfw=false` + 名称词表兜底，封面/模型都干净。
//   unrestricted — 安全 + NSFW 混着显示，不额外过滤，封面放到 XXX。
//   nsfwOnly     — 仅 NSFW：过滤掉安全内容，只留 NSFW 内容。
// 数组顺序即 UI 循环点击顺序：unrestricted → nsfwOnly → safe → unrestricted；
// 默认从 safe 起步，首次点击进入 unrestricted。
export const LORA_NSFW_FILTER_VALUES = [
  'unrestricted',
  'nsfwOnly',
  'safe',
] as const

export type LoraNsfwFilter = (typeof LORA_NSFW_FILTER_VALUES)[number]

export const DEFAULT_LORA_NSFW_FILTER: LoraNsfwFilter = 'safe'

export function isLoraNsfwFilter(value: string): value is LoraNsfwFilter {
  return (LORA_NSFW_FILTER_VALUES as readonly string[]).includes(value)
}

// Issue C（docs/plans/lora-search-image-audit-2026-07.md）：civitai 搜索有
// 两条互不兼容的分页范式——meilisearch 走 offset（client 用 page 号算
// offset）、REST 回落走 cursor scan（client 用 cursorByPageRef 记录服务端
// 发的 cursor）。服务端 listCivitaiLoras 每次请求独立决定走哪条，中途从
// meilisearch 切到 REST（或反之）会让 page 号与 cursor map 不再自洽，翻页
// 出现重复/错位页。修复：一次搜索会话内锁定后端——首页决定用哪条，后续页
// 把锁定结果回传给服务端（这个 type），服务端据此跳过另一条、不再中途切。
export const CIVITAI_SEARCH_BACKEND_VALUES = ['meilisearch', 'rest'] as const

export type CivitaiSearchBackend =
  (typeof CIVITAI_SEARCH_BACKEND_VALUES)[number]

export function isCivitaiSearchBackend(
  value: string,
): value is CivitaiSearchBackend {
  return (CIVITAI_SEARCH_BACKEND_VALUES as readonly string[]).includes(value)
}

// P1-6：安全档下，civitai `nsfw=false` 已经把 NSFW 分级的封面挡成占位卡——
// 但模型名本身还在（比如标题带 "Hentai"），留着只剩一张无信息量的空卡。
// 名称词表按小写子串匹配，只过滤"这名字本身就是 NSFW 标签"的场景，不做
// 内容层面的判断（内容层面已经交给 civitai 的 nsfwLevel）。
export const LORA_NSFW_NAME_KEYWORDS = [
  'hentai',
  'nsfw',
  'r18',
  'r-18',
  'porn',
  'nudity',
  'nude',
  'ecchi',
  'lewd',
] as const

export function isNsfwNamedModel(name: string): boolean {
  const haystack = name.toLowerCase()
  return LORA_NSFW_NAME_KEYWORDS.some((keyword) => haystack.includes(keyword))
}
