import { parseCivitaiDescriptionCodeBlocks } from './civitai-description-parse'
import {
  cleanRecommendedPrompt,
  cleanTriggerToken,
  splitAndCleanTrainedWord,
} from './lora-trigger-clean'

/**
 * Civitai trainedWords 在实际数据里有 5 种模式（参见 docs 调研）：
 *
 *  1. 空数组（~30%，最差情况）— 作者懒得填
 *  2. 单个长 comma-separated prompt（~50%）— 第一段是真触发词
 *  3. 包含 <lora:...> SD WebUI 语法（~10%）— 必须清掉
 *  4. 多个不同 outfit/variant（~10%）— 用户可能想选哪个
 *  5. 真正干净的单 token（<5%）— @bxz / aqualuz, watercolor
 *
 * 这个抽取函数把这些噪声归一成 4 个稳定字段。
 */

export type TriggerSource = 'official' | 'inferred'

/** 一个 outfit / variant 的完整激活 prompt。 */
export interface RecommendedPromptVariant {
  /**
   * 变体标签（`'costume1'` / `'装束 1'` / `'Variant A'`），从 description
   * 中 `<pre>` 前的 `<strong>` / `<h*>` 抽取。空字符串表示无 label。
   */
  label: string
  /** 完整 prompt 内容（清洗后）。 */
  prompt: string
}

export interface CivitaiTriggerExtraction {
  /** UI 主展示位的简短触发词。永远非空。 */
  trigger: string
  /**
   * 其他候选触发词（多 outfit / variant LoRA）。`trigger` 不会再出现在
   * 这里。空数组表示「只有一个 trigger，没有替代」。
   */
  alternates: string[]
  /**
   * 作者推荐的完整 prompt 起始段。优先级：
   *   1. trainedWords[0] 清洗后
   *   2. description 中第一个 `<pre><code>` 块
   *   3. null（fallback 到内部模板）
   */
  recommendedPrompt: string | null
  /**
   * 多 outfit / variant LoRA 的其余 prompt 变体（来自 description 的
   * 第 2+ 个 code block）。`recommendedPrompt` 已经包含第一个，这里只
   * 有后续的。空数组表示没有变体。
   */
  recommendedPromptAlternates: RecommendedPromptVariant[]
  /**
   * 'official' = trigger / recommendedPrompt 来自 Civitai 作者明确声明的
   * trainedWords 或 description code block。
   * 'inferred' = 从 model name 推断，UI 应加 badge 警示。
   */
  source: TriggerSource
}

// 99% 是分类标签而非触发词的 stop words，从 model name token 抽取时跳过。
// 大小写不敏感比较。
const GENERIC_NAME_STOP_WORDS = new Set([
  'lora',
  'loras',
  'character',
  'style',
  'styles',
  'anime',
  'realistic',
  'illustrious',
  'flux',
  'flux1',
  'fluxd',
  'sdxl',
  'sd15',
  'pony',
  'noobai',
  'anima',
  'woman',
  'women',
  'man',
  'men',
  'girl',
  'girls',
  'boy',
  'boys',
  'subject',
  'object',
  'mix',
  'v1',
  'v2',
  'v3',
  'v4',
  'v5',
])

// 模型名 token 抽取：匹配「连续字母数字或 CJK 字符」段。优先返回
// CJK 段（中文/日文角色名通常更具体），其次返回第一个非 stop-word
// 的英文 token。命名规律样本：
//   「鸣潮 (Wuthering Waves) || 达妮娅 (Denia)」 → 达妮娅 或 Denia
//   「Yor Forger SoloLoRA」                    → Yor
//   「[ILXL] Youji Kyougi 供犠羊司」           → Youji
const NAME_TOKEN_RE = /[A-Za-z぀-ヿ一-鿿][A-Za-z0-9぀-ヿ一-鿿_]*/g
const CJK_RE = /[぀-ヿ一-鿿]/

function inferTriggerFromName(name: string): string | null {
  const tokens = name.match(NAME_TOKEN_RE) ?? []
  // 第一遍：找 CJK token（中文/日文角色名）
  for (const tok of tokens) {
    if (CJK_RE.test(tok) && !GENERIC_NAME_STOP_WORDS.has(tok.toLowerCase())) {
      return tok
    }
  }
  // 第二遍：找第一个非 stop-word 的英文 token
  for (const tok of tokens) {
    if (tok.length < 2) continue
    if (GENERIC_NAME_STOP_WORDS.has(tok.toLowerCase())) continue
    return tok
  }
  return null
}

export interface ExtractInput {
  /** Civitai `version.trainedWords` 原数组 */
  trainedWords: string[] | undefined
  /** Civitai `model.name` 用于 fallback 抽取 */
  modelName: string
  /**
   * Civitai `model.description` HTML — 真触发词常嵌在这里的 `<pre><code>`
   * 块里（多 outfit LoRA 尤其常见）。可选。
   */
  descriptionHtml?: string | null
}

/**
 * 从 Civitai 原始数据抽出结构化触发词信息。永远返回非 null `trigger`。
 *
 * 优先级：
 *   1. trainedWords[0] 存在 → 主 trigger 是这段拆 comma 后的第一个 token，
 *      整段做 recommendedPrompt，剩下的 trainedWords 元素都加入 alternates。
 *   2. description 含 `<pre><code>` outfit prompts → recommendedPrompt 用第
 *      一个 block 整段，后续 blocks 进 recommendedPromptAlternates；trigger
 *      仍从 modelName 推断（outfit prompt 里挑不出单一激活词，整段才能用）。
 *      source = 'official'（来自作者写的 description）。
 *   3. trainedWords 全空 + 无 description blocks → 从 modelName 推断，
 *      source = 'inferred'。
 *   4. 都失败 → 用 modelName 的前 60 字符兜底。
 */
export function extractCivitaiTrigger({
  trainedWords,
  modelName,
  descriptionHtml,
}: ExtractInput): CivitaiTriggerExtraction {
  const allTrained = (trainedWords ?? [])
    .map((w) => w?.trim())
    .filter((w): w is string => Boolean(w && w.length > 0))

  // Priority 1: 作者明确声明的 trainedWords
  if (allTrained.length > 0) {
    const firstSegment = allTrained[0] ?? ''
    const tokens = splitAndCleanTrainedWord(firstSegment)
    const primaryTrigger = tokens[0] ?? cleanTriggerToken(firstSegment)
    if (primaryTrigger) {
      const altTriggers: string[] = []
      const seen = new Set<string>([primaryTrigger.toLowerCase()])
      for (let i = 1; i < allTrained.length; i += 1) {
        const segment = allTrained[i] ?? ''
        const altTokens = splitAndCleanTrainedWord(segment)
        const alt = altTokens[0]
        if (!alt) continue
        const key = alt.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        altTriggers.push(alt)
      }
      return {
        trigger: primaryTrigger,
        alternates: altTriggers,
        recommendedPrompt: cleanRecommendedPrompt(firstSegment) || null,
        recommendedPromptAlternates: [],
        source: 'official',
      }
    }
  }

  // Priority 2: description 里嵌的 <pre><code> outfit prompts
  // （Civitai 上 character LoRA 的常见模式 — 真激活 token 如 c1/c2 藏在
  // prompt 中间，无法可靠拆出单一触发词，所以整段作为 recommendedPrompt
  // 提供给用户。）
  const descBlocks = parseCivitaiDescriptionCodeBlocks(descriptionHtml)
  if (descBlocks.length > 0) {
    const inferredTrigger =
      (inferTriggerFromName(modelName) ?? modelName.trim().slice(0, 60)) ||
      'lora'
    return {
      trigger: inferredTrigger,
      alternates: [],
      recommendedPrompt: descBlocks[0]?.prompt ?? null,
      recommendedPromptAlternates: descBlocks.slice(1),
      // 来自作者写的 description，仍算 official — 用户复制 prompt 整段
      // 100% 能激活 LoRA。trigger 短词本身只是辅助显示。
      source: 'official',
    }
  }

  // Priority 3: 从 model name 推断
  const inferred = inferTriggerFromName(modelName)
  if (inferred) {
    return {
      trigger: inferred,
      alternates: [],
      recommendedPrompt: null,
      recommendedPromptAlternates: [],
      source: 'inferred',
    }
  }

  // Priority 4: model name 前 60 字符兜底
  return {
    trigger: modelName.trim().slice(0, 60) || 'lora',
    alternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    source: 'inferred',
  }
}
