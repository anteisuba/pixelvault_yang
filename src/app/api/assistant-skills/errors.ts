import 'server-only'

import { ApiRequestError } from '@/lib/errors'
import { AssistantSkillError } from '@/services/assistant-skill.service'

/** 技能服务那三种拒绝 → 带 i18n 键的 API 错误（界面照键出一句话）。 */
export async function assistantSkillErrors<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof AssistantSkillError) {
      throw new ApiRequestError(
        `ASSISTANT_SKILL_${error.code.toUpperCase()}`,
        error.code === 'unknownBuiltin' ? 404 : 409,
        `errors.assistantSkill.${error.code}`,
        error.message,
      )
    }
    throw error
  }
}
