import { z } from 'zod'

/**
 * 一位角色这一次**带哪几张图**（工作台「角色」弹层 / 画布镜头里 @她 的勾图，owner 09-27）。
 * 卡上的图按参考槽 id，「用她出的」按生成记录 id；服务端各自按本人校验。
 *
 * ⚠ 单独成文件：`@/types`（index）与 `@/types/node-workflow` 都要它，而 index 本身
 * 引着 node-workflow —— 放在任一边都会成环。
 */
export const CharacterImagePickSchema = z.union([
  z.object({ slotId: z.string().trim().min(1).max(64) }),
  z.object({ generationId: z.string().trim().min(1).max(64) }),
])
export type CharacterImagePick = z.infer<typeof CharacterImagePickSchema>

/**
 * 每位在场角色用**哪套造型**（角色④，键 = 角色卡 id，值 = 造型 id）。没有键 = 默认造型。
 * 服务端在本人的卡上认，认不出也回到默认造型。
 */
export const CharacterLookIdsSchema = z.record(
  z.string().trim().min(1).max(64),
  z.string().trim().min(1).max(64),
)
export type CharacterLookIds = z.infer<typeof CharacterLookIdsSchema>
