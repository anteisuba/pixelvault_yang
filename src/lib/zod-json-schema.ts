import { z } from 'zod'

/**
 * provider 的 function 参数就是一份 JSON Schema。
 *
 * ⛔ **不许手抄。** 工具入参的唯一事实是 `ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS`
 * 里那些 zod —— 再手写一份发给 provider，两份迟早漂移，而漂移的表现是「模型按
 * 我们发出去的形状填了参数，然后被我们自己的 zod 拒了」，日志上看起来像模型在
 * 犯病。生成，不抄。
 */
export type JsonSchemaObject = Record<string, unknown>

/**
 * 把一份 zod schema 变成能塞进 provider 请求体的 JSON Schema。
 *
 * - `io: 'input'` —— 我们描述的是**模型要写什么**（输入侧）。带 `transform` /
 *   `default` 的字段在输出侧形状不同，用输出侧会把可选说成必填。
 * - `target: 'draft-7'` —— OpenAI 的 function parameters 与 Gemini 的
 *   `function_declarations` 都按 draft-7 的子集读。
 * - `unrepresentable: 'any'` —— zod 里表达得出、JSON Schema 里表达不出的东西
 *   （`z.unknown()` 之类）降级成「任意」，而不是整张表直接抛。⚠ 这是**这一处**
 *   的取舍：一个字段描述得糙一点，好过整个工具表发不出去。
 */
export function toToolParametersJsonSchema(
  schema: z.ZodType,
): JsonSchemaObject {
  return z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-7',
    unrepresentable: 'any',
  }) as JsonSchemaObject
}
