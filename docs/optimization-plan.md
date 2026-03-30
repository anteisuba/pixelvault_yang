# PixelVault 优化计划

> 创建日期: 2026-03-29
> 状态: Phase 0-3 已完成，Phase 4 部分完成（CI + 限流头），Phase 5 待规模化时执行

## 目标

1. **生产稳定性** — 监控、错误追踪、重试与熔断
2. **高并发低延迟** — 分布式限流、缓存分层、连接池优化
3. **AI 质量保障** — 减少幻觉、prompt 校验、内容审核
4. **AI 可读性** — 让 AI 工具快速理解项目，减少生成代码的偏差

---

## Phase 0: AI 可读性与防幻觉基建（立即执行）

### 0.1 项目 AI 上下文文件体系
- [x] 创建 `.cursorrules` — Cursor IDE 项目规则
- [x] 创建 `.github/copilot-instructions.md` — GitHub Copilot 项目规则
- [x] 更新 `CLAUDE.md` — 补充关键架构约束和常见陷阱
- [x] 创建 `docs/ai-context.md` — AI 开发者速查手册（项目地图、数据流、关键接口）

### 0.2 代码自描述增强
- [x] 创建 `src/lib/invariants.ts` — 运行时断言工具（代替注释说明约束）
- [ ] 关键 service 入口添加 JSDoc（仅添加非显而易见的约束说明）

---

## Phase 1: 可观测性（第 1 周）

### 1.1 结构化日志
- [x] 创建 `src/lib/logger.ts` — 零依赖结构化日志（dev=pretty, prod=JSON）
- [x] 集成到 generate-image.service.ts、recipe-compiler、prompt-enhance
- [ ] API 路由添加请求级日志（requestId, userId, duration）
- [ ] Provider adapter 添加调用日志（model, latency, success/fail）

### 1.2 错误追踪
- [ ] 安装 @sentry/nextjs
- [ ] 创建 `sentry.client.config.ts` + `sentry.server.config.ts`
- [ ] `instrumentation.ts` 中初始化 Sentry
- [ ] Provider 错误标记 breadcrumb + context

---

## Phase 2: 韧性与错误恢复（第 1-2 周）

### 2.1 重试机制
- [x] 创建 `src/lib/with-retry.ts` — 指数退避 + 抖动
- [x] generate-image.service.ts provider 调用已包裹 withRetry
- [ ] R2 上传包裹 withRetry
- [ ] 其他 provider adapter 调用（视频生成等）

### 2.2 熔断器
- [x] 创建 `src/lib/circuit-breaker.ts` — 三状态熔断（closed/open/half-open）
- [x] generate-image.service.ts 已集成 per-provider 熔断

### 2.3 Provider 降级链
- [ ] 在 `src/constants/providers.ts` 定义 fallback 映射
- [ ] generate-image.service.ts 实现降级逻辑

---

## Phase 3: AI 输出质量保障（第 2-3 周）

### 3.1 Prompt 护栏
- [x] GenerateRequestSchema / VideoRequest / ArenaRequest 全部添加 `.max(4000)`
- [x] 创建 `src/lib/prompt-guard.ts` — prompt 注入检测 + 长度校验 + 关键词保留检查
- [x] generate-image.service.ts 集成 validatePrompt 预校验

### 3.2 LLM 输出校验
- [x] 创建 `src/lib/llm-output-validator.ts` — 统一 LLM 输出后处理
- [x] prompt-enhance 输出校验：meta-commentary / system leak / 长度检测，失败回退原始 prompt
- [x] recipe-compiler LLM fusion 输出校验：角色关键词保留率检查

### 3.3 内容审核（可选）
- [ ] 集成 OpenAI Moderation API 或本地规则
- [ ] 生成前审核 prompt，生成后审核图片 URL

---

## Phase 4: 高并发与缓存（第 3-4 周）

### 4.1 分布式限流
- [ ] 安装 @upstash/ratelimit + @upstash/redis
- [ ] 替换 src/lib/rate-limit.ts 为 Redis 实现
- [x] 添加限流响应头 X-RateLimit-* + Retry-After（/api/generate 已实现）
- [ ] 按 provider 独立限流

### 4.2 缓存分层
- [ ] R2 响应添加 Cache-Control 头
- [ ] 热门查询（画廊首页、模型列表）Redis 缓存
- [ ] Next.js unstable_cache + revalidateTag 按需失效

### 4.3 搜索优化
- [ ] PostgreSQL 全文搜索（tsvector + GIN 索引）
- [ ] 搜索结果缓存

---

## Phase 5: CI/CD 与测试（第 4 周）

### 5.1 GitHub Actions
- [x] 创建 `.github/workflows/ci.yml` — tsc + lint + test + build
- [x] PR 和 push 自动触发（main + feat/* 分支）

### 5.2 E2E 测试（推迟到核心功能冻结后）
- [ ] 安装 Playwright
- [ ] 生成流程 E2E 测试
- [ ] 画廊搜索 E2E 测试
- 注意：当前处于密集开发阶段，UI 频繁变更，E2E 维护成本高。建议核心功能稳定后再写。

---

## 执行优先级

```
Phase 0 (AI 可读性)  ←── 立即，影响后续所有开发质量
  ↓
Phase 1 (可观测性)   ←── 第 1 周，没有监控一切优化都是盲人摸象
  ↓
Phase 2 (韧性)       ←── 第 1-2 周，生产稳定性基础
  ↓
Phase 3 (AI 质量)    ←── 第 2-3 周，用户体验核心
  ↓
Phase 4 (高并发)     ←── 第 3-4 周，规模化准备
  ↓
Phase 5 (CI/CD)      ←── 第 4 周，工程化保障
```
