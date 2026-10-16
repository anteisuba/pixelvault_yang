import type { StudioOperatorChatRequest } from '@/hooks/use-studio-operator-store'

/**
 * 开场白里的宏（`{{char}}` / `{{user}}`，老卡写 `<BOT>` / `<USER>`）换成名字再放进时间线
 * （附录L）。与服务端进提示词那一份同一套写法；卡上原文不改。
 */
export function fillOperatorChatMacros(
  chat: StudioOperatorChatRequest,
  userName: string,
): StudioOperatorChatRequest {
  const fill = (text: string) =>
    text
      .replace(/\{\{char\}\}|<BOT>/gi, chat.character.name)
      .replace(/\{\{user\}\}|<USER>/gi, userName)
  return {
    ...chat,
    opening: fill(chat.opening),
    ...(chat.alternateOpenings
      ? { alternateOpenings: chat.alternateOpenings.map(fill) }
      : {}),
  }
}
