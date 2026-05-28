# Seedance 2.0 提示词工程参考

Node Studio 的 Seedance 视频规划 Agent 的领域知识库。改动 Seedance 规划/脚本拆解的 LLM 系统提示词时以此为依据。

## 文档

| 文件                                                                       | 内容                                                                              | 用途                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| [cinematography-terminology.md](cinematography-terminology.md)             | 镜头术语字典：景别 / 角度 / 运动 + 英文术语 + 进阶技法                            | 让规划输出专业镜头语言，而非泛泛描述    |
| [z-axis-depth-rules.md](z-axis-depth-rules.md)                             | Z 轴纵深规则：禁用「画面左右」，改用「镜头前后 / 四角入画 / 量化纵深」            | Seedance 专属技巧，命中率成倍提升的关键 |
| [seedance-official-cases.md](seedance-official-cases.md)                   | 官方多模态案例：`@图1` 首帧 / `@视频1` 复刻运镜 / `@音频1` 配乐、视频延长、一致性 | 多模态 `@reference` 编排的范式来源      |
| [seedance-system-prompt.md](seedance-system-prompt.md)                     | 总体工程提示词 v1：情绪锚定 → 镜头翻译 → 空间落地                                 | 系统提示词的结构骨架                    |
| [seedance-system-prompt-emotional.md](seedance-system-prompt-emotional.md) | 总体工程提示词 v2：叠加叙事架构（差向量 / 主题 / 意象 / 八步情感路径）            | 脚本拆解的情感工程参考                  |

## 代码触点

- `src/constants/seedance-prompt-plan.ts` — `SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT` 与输出契约
- `src/services/prompts/seedance-prompt-plan.service.ts` — 规划编排（idea → timeline + finalPrompt）
- `src/constants/script-breakdown.ts` — `SCRIPT_BREAKDOWN_SYSTEM_PROMPT`（叙事拆解）
- `src/components/business/node/inspector/SeedanceInspector.tsx` — 节点参数面板
