# 04. 分阶段 TODO

## Phase 0：整理现有工程

- [ ] 统一品牌命名，决定到底叫 `Personal AI Gallery` 还是别的名字。
- [ ] 清理重复目录，比如根目录 `components/` 和 `src/components/` 的职责。
- [ ] 补一份干净可用的 `.env.example`。
- [ ] 修正 Provider 命名和环境变量命名混乱。
- [ ] 把 README 和开发文档整理成统一编码、统一语言风格。

## Phase 1：打好公开发布的后端地基

- [x] 抽出 Provider Adapter 层。
- [ ] 建立 `providers` 和 `model_catalog` 配置中心。
- [ ] 增加 `generation_jobs`，让生成流程支持状态机。
- [ ] 增加 `api_usage_ledger`，把每次真实 API 调用做成可追踪流水。
- [ ] 明确记录 provider / adapter / model / 请求次数 / 图像尺寸 / 响应时长 / 是否成功。
- [ ] 为 API usage 增加按日、按用户、按 provider 的聚合查询。
- [ ] 增加基础限流和防刷。
- [ ] 增加错误监控和日志追踪。

## Phase 2：做出能发给别人用的 Web Beta

- [x] Landing Page。
- [x] Studio 页面增强。
- [x] My Library 页面。
- [x] Gallery 页面。
- [ ] 图片发布/取消发布。
- [ ] 失败提示、重试、空状态、加载状态。
- [ ] 手机端响应式打磨。

## Phase 3：补 Prompt 资产层

- [ ] 增加 `prompt_events`。
- [ ] 增加 `prompt_templates`。
- [ ] 做模板推荐区。
- [ ] 做热门意图卡片。
- [ ] 做模板复制和一键套用。
- [ ] 加入 Prompt 是否参与推荐的用户同意开关。

## Phase 4：准备商业化

- [ ] 明确是否彻底废弃站内积分体系，迁移为纯 API usage 记录。
- [ ] 接入支付前先补 usage 对账能力，而不是先做套餐 UI。
- [ ] 建立成本面板，能看每个 Provider / Model / User 的实际消耗。
- [ ] 设计普通用户、BYOK 用户、管理员的权限差异。
- [ ] 决定是否支持 BYOK。

## Phase 5：移动端路线

- [ ] 先把 Web 做成移动端体验合格。
- [ ] 评估是否要做 PWA。
- [ ] 等 Web 数据稳定后，再决定原生 App 或封装方案。

## 推荐的实际开工顺序

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

## 现在最值得马上开始的三个任务

1. 设计 `generation_jobs` 和 `api_usage_ledger`。
2. 把现有 credits 逻辑迁移为 usage 记录与展示。
3. 做图片发布/取消发布、失败重试、移动端细化。
