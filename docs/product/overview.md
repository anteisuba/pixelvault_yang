# Product Documentation Overview

这组文档的目标，不是再写一份空泛的产品说明，而是把你现在这套代码库，推进成一个真正能公开发布的 AI 图片产品地基。

## 我对这个项目的判断

- 方向是成立的：多家图片 API 切换、统一生成体验、沉淀 Prompt 资产，这三个点组合起来有真实价值。
- 现在最大的风险不是“能不能生成图”，而是“能不能稳定、可控、可持续地公开给别人用”。
- 最需要先补的不是支付，而是中间层抽象、成本控制、Prompt 隐私策略、公开发布时的风控。

## 建议的第一版定位

- 产品形态：Web 优先，先做手机响应式网页，不急着原生 App。
- 发布方式：先做可公开访问的 Beta 版，而不是一步到位做完整商业化平台。
- 产品核心：一个可以切换不同模型和 Provider 的 AI 图片生成站，带个人作品库、公开画廊、Prompt 模板推荐。
- Prompt 策略：先做“模板推荐 + 热门意图”，不要直接公开复用别人的原始 Prompt。
- 支付策略：先不急着接支付，但从第一天就把积分账本和套餐能力预留好。

## 阅读顺序

1. [当前项目体检](../progress/current-status-audit.md)
2. [产品范围与第一版边界](./product-scope.md)
3. [技术架构与地基设计](../architecture/foundation-architecture.md)
4. [Prompt 数据与推荐系统设计](./prompt-data-and-recommendation.md)
5. [分阶段 TODO](./staged-roadmap.md)
6. [需要拍板的关键决定](./key-product-decisions.md)

## 一句话结论

你现在已经有“生成引擎”的雏形了，但还没有“公开产品”的地基。接下来应该先把项目重心从“调 API”切到“做一个可靠的多模型图片生成平台”。
