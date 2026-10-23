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
