# 产品范围

最后更新：2026-06-01

本文档记录用户确认过的产品方向。它不记录实现细节，也不替代代码事实源。

长期开发主线见 `docs/product/mainline.md`。本文档记录产品范围，主线文档记录后续开发时应持续参考的功能分工、媒体方向和取舍顺序。

## Product Positioning

Personal AI Gallery 的核心定位是：

- 个人 AI 创作工作台
- 多模型生成与归档平台

以下方向属于创作中或创作后的分支能力，而不是当前阶段的主定位：

- 创作者作品展示/社交平台
- AI 视觉资产管理系统

这意味着产品优先服务完整创作闭环，而不是优先做公开社区、排行榜、运营增长或泛社交网络。

## Target Users

当前第一用户是项目 owner 自己。

下一阶段用户是创作者：需要稳定生成、比较、管理、复用作品和创作资产的人。

更长期目标是降低门槛，让一般用户也能简单生成自己的作品。但这不应牺牲当前阶段的创作控制能力、生成质量、归档可靠性和模型/API 正确性。

## Primary User Path

第一主路径是：

```text
选择模型 -> 输入 prompt/参考图 -> 生成 -> 持久保存 -> 管理/复用作品
```

这个路径优先级高于公开展示、社交、排行榜、storyboard 和 3D 支线。

开发时如果出现路线冲突，默认优先保护这条主路径的可靠性和清晰度。

## Feature Priority

### Core

当前核心能力：

- `Studio`
- `Node workflow`
- `LoRA`

这些能力直接服务创作控制、生成编排和模型/素材复用。

### Secondary

次级能力：

- `Gallery`
- `Profile`
- `Cards`
- 项目管理

这些能力服务创作后的浏览、整理、展示和资产化，但不应抢在主生成链路稳定之前主导开发方向。

### Branch

支线能力：

- `3D`

3D 当前作为支线处理，不进入短期主推进范围。

### Later Research

后置研究能力：

- `Arena`
- `Storyboard`

这两个方向等核心链路、次级管理展示能力稳定后再研究。

## Short-Term Non-Goals

短期明确不做：

- 社交扩张
- 公开排行榜
- 3D 主线推进
- Arena 主线推进
- Storyboard 主线推进

这些能力可以保留已有代码和入口，但不作为近期路线设计的默认优先级。

## Product Decision Rules

- 方向不明确时停止问 owner，不由 AI 自行补全路线。
- 主路径优先于分支能力。
- 创作控制优先于社交扩张。
- 多模型/API 正确性优先于界面包装。
- 归档、管理和复用能力必须服务创作闭环。
- 面向一般用户的低门槛体验是长期目标，不应提前削弱创作者工作台的控制力。

## Source of Truth

- User-confirmed product direction in the 2026-06-01 documentation redesign discussion.
- `src/app/[locale]/(main)/studio/page.tsx`
- `src/app/[locale]/(main)/studio/node/page.tsx`
- `src/app/[locale]/(main)/studio/lora/page.tsx`
- `src/app/[locale]/(main)/gallery/page.tsx`
- `src/app/[locale]/(main)/u/[username]/page.tsx`
- `src/app/[locale]/(main)/cards/page.tsx`
- `src/app/[locale]/(main)/studio/3d/page.tsx`
- `src/app/[locale]/(main)/arena/page.tsx`
- `src/app/[locale]/(main)/storyboard/page.tsx`
- `src/services/studio-generate.service.ts`
- `src/services/node/node-workflow.service.ts`
- `src/services/lora-asset.service.ts`
- `src/services/project.service.ts`

## Last Verified

- Date: 2026-06-01
- Method: owner direction confirmation plus code route/service inspection
- External docs: not required for product scope
