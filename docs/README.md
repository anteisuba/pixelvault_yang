# PixelVault Docs

`docs/` 是本项目唯一的文档源。按**层次**组织 —— 一眼就能看出每类文档的角色。

## 目录结构

| 目录               | 角色                                                        |
| ------------------ | ----------------------------------------------------------- |
| `getting-started/` | 新人入口:产品定位、按角色的阅读路径                         |
| `architecture/`    | 系统架构:目录结构、技术栈、数据流(长期稳定)                 |
| `reference/`       | 参考类:API 提供商、数据库、组件、设计系统(需要查的时候来看) |
| `guides/`          | 工程工作流:Codex/Claude Code 流程、AI 上下文与技能          |
| `plans/`           | 活跃规划:执行中的计划、工作包(UI/功能/QA/后续)              |
| `progress/`        | 当前状态:开发阶段、完整产品状态审计                         |
| `product/`         | 产品定义:路线图、产品决策、未来待办                         |
| `infrastructure/`  | 基础设施:n8n 等部署相关                                     |

`qa-screenshots/` 和 `screenshots/` 保留供视觉验收使用。

## 快速开始

- 第一次看本项目 → [getting-started/overview.md](getting-started/overview.md)
- 按角色阅读 → [getting-started/reading-paths.md](getting-started/reading-paths.md)
- 想了解当前状态 → [progress/current-status-audit.md](progress/current-status-audit.md)
- 所有活跃规划 → [plans/README.md](plans/README.md)

## Studio 真相源

当前 Studio 实现以 [plans/frontend/studio-feature-map.md](plans/frontend/studio-feature-map.md) 为准。

[plans/unified-development-plan.md](plans/unified-development-plan.md) 是合并后的参考档案,**非真相源**。

## 文档更新规则

- 当前状态类文档(`progress/`、`architecture/`、`reference/`)保持与代码同步
- 新的规划、探索产出放到 `plans/` 下对应子目录
- 工程流程/规范类放到 `guides/`
- 任何规划一旦实现,对应文档要么更新为"当前状态"移到 `reference/` 或 `architecture/`,要么直接删除 —— 不在 plans/ 留过时文件
- 子目录 CLAUDE.md(在 `src/**`、`prisma/`)保持原位,不搬到 docs/ 下
