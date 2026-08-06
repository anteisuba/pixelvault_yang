# Task Packet: 统一 AI 对话助手

## Goal

- 将图片 Studio、视频 Studio、LoRA 与节点画布统一为共享浮卡、模型入口、历史、分享和最多 8 个图片/视频附件的真实多轮 AI 对话。

## Non-goals

- 不改媒体生成模型、计费、资产归档、LoRA 训练和画布写操作审批规则。
- 不让不支持视频的模型以封面或 URL 文本冒充视频分析。
- 不 commit、不 push。

## Task Scene / Type

- UI + service + provider/API + tests + docs。

## Read First

- `AGENTS.md`
- `docs/WORKFLOW.md`
- `docs/scenes/ui-page.md`
- `docs/scenes/service-change.md`
- `docs/scenes/api-endpoint.md`
- `docs/references/pages/assistant-shell.md`
- `docs/references/frontend.md`
- `docs/references/backend.md`
- `docs/references/providers.md`
- `docs/checklists/ui.md`
- `docs/checklists/backend.md`

## Source of Truth

- `src/components/business/assistant/AssistantShell.tsx`
- `src/components/business/node/StudioNodeAssistantDock.tsx`
- `src/components/business/node/AssistantConversation.tsx`
- `src/components/business/prompts/PromptAssistantPanel.tsx`
- `src/components/business/studio-shared/chrome/StudioAssistantDock.tsx`
- `src/components/business/studio/lora/LoraAssistantDock.tsx`
- `src/hooks/use-assistant-conversation.ts`
- `src/hooks/kernel/use-prompt-assistant.ts`
- `src/services/node/node-assistant.service.ts`
- `src/services/kernel/prompt-assistant.service.ts`
- `src/services/llm-text.service.ts`
- `src/constants/node-studio.ts`

## Allowed File Scope

- 上述助手组件、hooks、assistant/prompt types、常量、对应 API/service、api-client、三语消息与相关测试。
- `docs/references/pages/assistant-shell.md`、本任务包、`docs/status.md`。

## Forbidden File Scope

- `AGENTS.md`、`prisma/**`、credit/billing、媒体生成 adapter、认证语义与公开路由白名单。
- 与助手无关的现有未提交改动。

## Assumptions / Open Questions

- owner 已确认方向 A、360px 浮卡关键切片、最多 8 个图片/视频附件，以及图片域可分析视频。
- Gemini 是本切片唯一原生视频理解路由；OpenAI 当前只接图片，DeepSeek/Claude 当前只接文本。
- 使用现有已鉴权图片上传与参考视频上传路径，不新增公开上传路由或数据库 schema。

## Acceptance Criteria

- 四处普通对话助手共享头部顺序、模型注册表、历史/分享和 overlay 几何。
- Studio/LoRA 默认回复为正常对话；提示词/LoRA 结构化结果保留为显式动作。
- 单轮最多 8 个稳定 URL 图片/视频引用；图片域可通过 Gemini 分析真实视频。
- 不兼容模型阻止发送并明确提示切换；不静默降级。
- 桌面主工作区不被挤压，移动端近全屏抽屉可用。

## Validation / Evidence

- [x] `npm run typecheck` 通过；目标 ESLint 通过。
- [x] 全量 `npm run lint` 通过（0 error / 5 条既有 warning）。
- [x] 相关 service/component Vitest 10 files / 110 tests 通过；追加模型注册表/附件历史回归命令 3 files / 30 tests 通过。
- [x] 图片/视频附件按用户消息进入历史与只读分享，后续轮次继续引用稳定 URL；素材库图片/视频入口均已覆盖。
- [x] 模型菜单显示“图片＋视频 / 图片视觉 / 仅文本”，共享注册表仅含 OpenAI、Gemini、DeepSeek、Claude。
- [ ] 全量 Vitest 在 424 秒超时，未产出最终汇总；超时后的残留 Vitest 进程已停止。
- [x] 安装与本地命令统一使用 npm；未并行跑 build。
- [ ] 3000 端口仍由既有 Node dev 进程监听，但本轮浏览器显示“无法访问此站点”且 HTTP 冒烟请求超时；
      按仓库规则未重启或另起第二实例。待 owner 手动刷新或后续单独授权重启后验证 image/video/LoRA/node
      桌面与 375px 路径、模型弹层、历史/分享、多附件和视频能力阻断。

## Documentation Sync

- 完成后把稳定契约保留在 `docs/references/pages/assistant-shell.md`，覆盖更新 `docs/status.md`，并删除本 active task packet。
