# Task Packet: LoRA 生成页纯底模、高级参数与放大后处理

## Goal

- 在现有 `/studio/lora?section=generate` 内支持两种自然状态：未挂载 LoRA 时使用底模直接生成；挂载 LoRA 后在兼容底模上增强生成。
- 让用户能够手动配置 Runner 的 seed、steps、CFG、sampler、scheduler、width、height，并独立启用 `4x-AnimeSharp` 后处理。
- 在信息架构上严格区分底模、LoRA 权重和后处理模型。

## Non-goals

- 不新增“纯底模生成”顶级页签；仍是一个生成页面。
- 不把 Hugging Face URL 暴露为日常生成输入；HF URL 只属于资产首次导入链路。
- 不把 `4x-AnimeSharp` 当作底模或 LoRA，也不把单次 ESRGAN 放大描述成 hires diffusion refinement。
- 不改计费、鉴权、BYOK、图库归档或非 Runner provider。
- 不在本任务里部署 Execution Worker 或 RunPod 镜像。

## Task Scene / Type

- UI + service/business-logic wiring + QA

## Read First

- `AGENTS.md`
- `CLAUDE.md`
- `docs/WORKFLOW.md`
- `docs/scenes/ui-page.md`
- `docs/brand-dna.md`
- `docs/plans/lora-recipe-runner-v5.md`
- `docs/references/providers.md`

## Source of Truth

- `src/components/business/studio/lora/LoraWorkbench.tsx`
- `src/constants/lora-base-models.ts`
- `src/types/index.ts` (`AdvancedParamsSchema`)
- `src/lib/civitai-recipe-to-generation.ts`
- `workers/execution/src/models/runner/request-builder.ts`
- `workers/execution/src/models/runner/upscalers.ts`

## Allowed File Scope

- `src/components/business/studio/lora/**`
- Focused LoRA workbench hooks/helpers/tests under `src/hooks/**` and `src/lib/**`
- LoRA copy in `src/messages/{en,ja,zh}.json`
- This task packet and focused UI tests

## Forbidden File Scope

- `workers/**`（本任务包消费已存在的 Runner 契约，不重写 Runner）
- `prisma/**`
- credit/billing/auth code
- unrelated Studio, Canvas, Gallery, Prompt, or provider UI
- existing unrelated dirty-worktree changes

## Confirmed Product Decisions

1. **一个生成页，两种状态**
   - `stack.items.length === 0`：纯底模状态。
   - `stack.items.length > 0`：LoRA 增强状态。
   - 不增加新的顶级 tab，也不要求用户先去 LoRA 库选择资产。

2. **底模选择器始终存在**
   - 纯底模状态使用 `getBaseOnlyGenerationBases()`；默认 `getDefaultBaseOnlyGenerationBase()`，即固定 `Anima Base v1.0`。
   - LoRA 增强状态继续使用 `getCompatibleBases(loraFamily)`；不兼容底模不可选。
   - “来源图底模（自动）”只在已挂载 LoRA 且应用了 Civitai 来源图配方时有意义；纯底模状态不能出现。
   - 底模选择器不得列出 HF LoRA 仓库，HF LoRA 库也不得列出完整底模。

3. **LoRA 栈可以为空**
   - 移除 `hasLora` 对 `canGenerate` 的硬门。
   - 请求允许省略 `advancedParams.loras` 或发送空数组；不得伪挂一个 LoRA。
   - 空栈提示改成辅助操作：“可直接使用当前底模生成，也可以去库中添加 LoRA。”

4. **高级参数折叠区**
   - 默认折叠，入口显示非默认参数摘要；不要把完整参数墙常驻在主画布。
   - 字段：seed（十进制字符串、随机/锁定）、steps、CFG、sampler、scheduler、width、height。
   - seed 使用 `runnerSeed` 字符串传输，不能经过 `Number()` 丢失 64 位精度。
   - width/height 与比例预设双向同步；Anima 每边 512–1536、8 的倍数，错误就地显示。
   - sampler/scheduler 只提供 Runner allowlist；Civitai 原始值不支持时继续显示“未应用”，不静默替换。

5. **后处理独立成区**
   - 选项：`无`（默认）或 `4x-AnimeSharp`。
   - 启用时写入 `advancedParams.runnerUpscaler = '4x-AnimeSharp'`。
   - 显示“生成尺寸 → 最终 4× 尺寸”和显存/耗时提示；过大的最终尺寸需要明确警告。
   - 文案明确这是 VAE 解码后的 ESRGAN 放大，不是二次扩散修复；hires refinement 保持“尚未支持”。

6. **配方应用与手动搭配共用一套状态**
   - “一键同款”把可支持的 seed、steps、CFG、sampler、scheduler、width、height 写入同一组可编辑控件。
   - 用户随后可以逐项修改；卡片准确标记“已应用/未应用”。
   - 作者触发词/训练说明与来源图片完整 metadata 保持分区，不把作者描述称作完整复刻参数。

## Acceptance Criteria

- 未挂载任何 LoRA 时，生成页默认选择 `Anima Base v1.0`，输入 prompt 后可以点击出图。
- 纯底模请求不含伪 LoRA；Runner 收到空 LoRA 列表并生成不带 LoRA Loader 的图。
- 添加 LoRA 后，底模列表立即收窄到兼容家族；移除最后一把 LoRA 后恢复纯底模目录。
- 用户可以手动修改全部 8 个 Runner 参数，实际请求与控件值一致。
- `5536891017203` 在 UI、请求与回显中保持原值。
- 启用 `4x-AnimeSharp` 后请求携带 allowlisted upscaler；关闭时工作流保持 `VAEDecode → SaveImage`。
- UI 的“底模”“LoRA”“后处理”三个概念在中文、英文、日文中均不混用。
- 375px、768px 和桌面宽度下无截断；键盘可操作，错误和 disabled 原因可读。

## Validation / Evidence

- Focused Vitest：纯底模默认、空 LoRA 请求、挂载/卸载切换、高级字段映射、64 位 seed、upscaler 开关。
- `npx tsc --noEmit`。
- 在 owner 已运行的 `/zh/studio/lora?section=generate` 浏览器中手动验证：空 LoRA 直接生成、兼容底模收窄、参数可编辑、upscaler 摘要和三个响应式宽度。

## Documentation Sync

- UI 完成后更新 `docs/status.md`；部署完成后再更新 `docs/references/providers.md` 的运行状态。
- 未经真实 RunPod 作业验证，不得把“本地已实现”写成“线上可用”。

## Implementation Status (2026-07-14)

- Local UI implementation complete: zero-LoRA Anima Base generation, compatible-base switching, exact uint64 seed transport, editable Runner parameters, exact-dimension validation, and independent `4x-AnimeSharp` post-processing.
- Focused component/service/workflow tests and TypeScript checks pass locally.
- Not deployed: the current production Worker/fork image has not received these changes, and the physical RunPod volume still has no `models/upscale_models/4x-AnimeSharp.pth` until the first request through the deployed allowlisted path.
