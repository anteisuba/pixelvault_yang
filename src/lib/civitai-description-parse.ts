/**
 * Civitai LoRA `model.description` 是 Tiptap/ProseMirror 输出的 HTML。
 * 大量 character LoRA 作者把「激活 prompt」放在 `<pre><code>...</code></pre>`
 * 块里（而非 API 的 `trainedWords` 字段），所以这是仅次于
 * `/api/v1/images?modelId=X` 的第二权威 trigger 来源。
 *
 * 真实样本（截图里的「鸣潮 || 达妮娅 (Denia)」LoRA）：
 *
 *   <p><strong>outfits:</strong></p>
 *   <p><strong>costume1</strong></p>
 *   <pre><code>purple eyes,pink pupils,...,c1,white hair ribbon,...</code></pre>
 *   <p><strong>costume2</strong></p>
 *   <pre><code>black halo,purple eyes,...,c2,black hair ribbon,...</code></pre>
 *
 * 真正的激活 token (`c1` / `c2`) 藏在 prompt 中间。`trainedWords` 是空的。
 * 我们不挑「单触发词」— 直接把整段 prompt 当 recommendedPrompt 透传给用户，
 * 由用户复制后粘到 Studio 即可正确激活 LoRA。
 *
 * 也支持 Markdown 三反引号 code fence 作为兜底（少数老内容用 md 格式）。
 */

interface CodeBlock {
  /**
   * 块的标签（来自前置 `<strong>` heading 或 `<p>` heading），用于多 outfit
   * LoRA 的 UI 选择器。例如 `'costume1'` / `'装束 1'`。空字符串表示无 label。
   */
  label: string
  /** 清洗后的 prompt 内容（HTML entities decoded、空白归一）。 */
  prompt: string
}

// 极简 HTML entity decode，覆盖 Civitai/Tiptap 实际产出的常见 entity。
// 完整 spec entity 表用不上 — 富文本编辑器不会塞奇异 entity。
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&[#a-zA-Z0-9]+;/g, (m) => HTML_ENTITIES[m] ?? m)
}

// 删除所有内联 HTML tag（不解析嵌套，对 code 块内的 `<span style="">` 也生效）。
function stripInlineTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

// 抽出紧邻 `<pre>` 块前面的 heading 文本作为 label。Civitai 富文本常见模式：
//   <p><strong>costume1</strong></p>
//   <pre><code>...</code></pre>
// 我们看 `<pre>` 之前最近 200 字符里最后一个 `<strong>...</strong>` 或
// `<h[1-6]>...</h[1-6]>`。匹配不到就返回空 label。
function extractLabelBefore(html: string, preStartIndex: number): string {
  const window = html.slice(Math.max(0, preStartIndex - 400), preStartIndex)
  const headingMatches = [
    ...window.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi),
    ...window.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi),
  ]
  if (headingMatches.length === 0) return ''
  const last = headingMatches[headingMatches.length - 1]
  if (!last || !last[1]) return ''
  return decodeHtmlEntities(stripInlineTags(last[1])).trim()
}

/**
 * 解析 Civitai LoRA description HTML 中的所有 `<pre><code>` 块和
 * markdown ` ``` ` 三反引号 code fence。每个块视为一个独立 outfit/variant
 * 的激活 prompt。
 *
 * 返回顺序与 description 中出现顺序一致。空 description / 无 code block →
 * 返回 `[]`。
 */
export function parseCivitaiDescriptionCodeBlocks(
  html: string | null | undefined,
): CodeBlock[] {
  if (!html) return []
  const blocks: CodeBlock[] = []

  // HTML <pre>...</pre> path (Civitai 主流格式)
  const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi
  let m: RegExpExecArray | null
  while ((m = preRe.exec(html)) !== null) {
    const inner = m[1] ?? ''
    const prompt = decodeHtmlEntities(stripInlineTags(inner))
      .replace(/\r/g, '')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (!prompt) continue
    const label = extractLabelBefore(html, m.index)
    blocks.push({ label, prompt })
  }

  // Markdown ```...``` path (兜底；少数老 description 用)。仅在 <pre> 没找到
  // 时走这条路径 —— Civitai 自己渲染时会把 markdown fence 转成 <pre>，所以
  // 这里只处理「作者贴的纯 markdown / 没经过编辑器解析」的边缘 case。
  if (blocks.length === 0) {
    const fenceRe = /```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g
    while ((m = fenceRe.exec(html)) !== null) {
      const inner = m[1] ?? ''
      const prompt = decodeHtmlEntities(inner).trim()
      if (!prompt) continue
      blocks.push({ label: '', prompt })
    }
  }

  return blocks
}

/**
 * 简化封装：只要第一个 code block 的 prompt 字符串。给「优先 trainedWords，
 * 退而求其次 description 第一段」的快速路径用。
 */
export function firstRecommendedPromptFromDescription(
  html: string | null | undefined,
): string | null {
  const blocks = parseCivitaiDescriptionCodeBlocks(html)
  return blocks[0]?.prompt ?? null
}
