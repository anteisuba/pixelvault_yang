/**
 * 助手这一轮是「问答」还是「动手」——纯函数，服务端主循环和测试共用。
 *
 * 判据只看创作者**最后一句**。动作词一旦出现，整句按动手处理：
 * 「改成什么画风」是改表单，不是问句。
 */

const ACTION_PATTERN =
  /改成|换成|挂上|出图|生成|覆盖|写入|设为|改提示词|帮我改|请改|apply|generate|mount\b|overwrite|set_prompt|set the prompt|write the prompt|arm the button/i

const QUESTION_PATTERN =
  /[？?]|\bwhat\b|\bwhy\b|\bwhich\b|\bhow\b|什么|怎么|为什么|为啥|哪个|哪里|哪张|吗|嘛|是不是|看看|看下|分析|穿的什么|是什么画风|什么样/i

export function isAssistantActionTurn(text: string): boolean {
  return ACTION_PATTERN.test(text.trim())
}

export function isAssistantQuestionTurn(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isAssistantActionTurn(trimmed)) return false
  return QUESTION_PATTERN.test(trimmed)
}

/**
 * 开口前要不要强制视觉分析。
 *
 * 只在「这句是问句、点了图、而且当前脑子看不见图」时预跑。
 * 动手轮交给模型自己调 look；能看图的模型直接把图附上。
 */
export function shouldPrefetchReferenceAnalysis(args: {
  questionTurn: boolean
  hasPointedReferences: boolean
  modelSeesImages: boolean
}): boolean {
  return args.questionTurn && args.hasPointedReferences && !args.modelSeesImages
}

/**
 * 从不完整 JSON 里抠 `"key": "…"` 已经写出来的那段字符串。
 * 键还没闭合时返回已写出的部分，供收尾轮边生成边显示。
 */
export function extractJsonStringValue(
  raw: string,
  key: string,
): string | null {
  const matched = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"`).exec(raw)
  if (!matched) return null
  let index = matched.index + matched[0].length
  let value = ''
  while (index < raw.length) {
    const char = raw[index]
    if (char === '\\') {
      const next = raw[index + 1]
      if (next === undefined) {
        return value
      }
      if (next === 'u' && raw.length >= index + 6) {
        const hex = raw.slice(index + 2, index + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          value += String.fromCharCode(Number.parseInt(hex, 16))
          index += 6
          continue
        }
      }
      const escaped: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        b: '\b',
        f: '\f',
        '"': '"',
        '\\': '\\',
        '/': '/',
      }
      value += escaped[next] ?? next
      index += 2
      continue
    }
    if (char === '"') return value
    value += char
    index += 1
  }
  return value
}

/** 模型这一轮是不是已经开始写工具调用（不是 `"tool": null`）。 */
export function jsonHasToolObject(raw: string): boolean {
  return /"tool"\s*:\s*\{/.test(raw)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
