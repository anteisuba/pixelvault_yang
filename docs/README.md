# Docs Directory

`docs/` 现在按职责分层整理，避免所有文档堆在同一层。

## 目录结构

- `api/`：第三方 AI Provider 接口参考与能力笔记
- `architecture/`：系统架构、技术地基、分层设计
- `backend/`：后端能力说明，如 API Key、Provider route、LoRA 集成
- `database/`：Prisma / PostgreSQL / 数据模型说明
- `design/`：外部设计参考与研究材料
- `frontend/`：组件、设计系统、视觉规范
- `guides/`：长期生效的项目规范文档
- `plans/`：执行计划，按 `frontend` / `backend` / `product` 细分
- `product/`：产品范围、路线图、长期开发说明、待办与决策
- `progress/`：当前状态审计与阶段进度
- `qa-screenshots/`：手动验收截图
- `tooling/`：AI/开发工具相关辅助文档

## 快速入口

- 前端规范：`frontend/design-system.md`
- 视觉规范：`frontend/visual-design-system.md`
- 系统架构：`architecture/system-architecture.md`
- 数据库：`database/database.md`
- 当前进度：`progress/phases.md`
- 产品路线图：`product/roadmap.md`
- 统一执行计划：`plans/product/unified-development-plan.md`

## 维护规则

- 新文档优先放入对应分类，不再直接堆到 `docs/` 顶层。
- 前后端执行计划放在 `docs/plans/` 下，再按子目录区分。
- 根目录默认只保留仓库入口类文档，如 `README.md`、`AGENTS.md`、`CLAUDE.md`。
