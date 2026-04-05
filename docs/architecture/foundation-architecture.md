# 02. 技术架构与地基设计

## 架构原则

- 保留你现有栈，不推倒重来。
- Route 层变薄，业务逻辑下沉到服务层。
- Provider 必须抽象成统一接口，不能继续堆在一个 API 文件里。
- 生成流程要“异步就绪”，哪怕第一版先同步执行，也要把数据结构设计成以后能挂队列。
- Prompt 推荐和计费要从第一天开始留接口，不要后补。

## 建议继续沿用的技术栈

- 前端：Next.js App Router
- 类型：TypeScript
- 数据库：PostgreSQL + Prisma
- 对象存储：Cloudflare R2
- 认证：Clerk
- 部署：Vercel
- 队列：先预留任务表，公开测试后接 Vercel Queues 或 Upstash QStash

## 推荐的模块划分

### 1. App 层

- Landing
- Studio
- My Library
- Gallery
- Prompt Templates
- Admin Lite

### 2. API 层

- `POST /api/generate`
- `GET /api/models`
- `GET /api/gallery`
- `GET /api/me/generations`
- `POST /api/generations/:id/publish`
- `GET /api/prompt-templates`
- `POST /api/prompt-feedback`

### 3. Domain 层

- auth
- generation
- provider-registry
- prompt-intelligence
- credits-and-ledger
- moderation
- analytics

## Provider 中间层怎么设计

现在最重要的，是把 Provider 逻辑从 `src/app/api/generate/route.ts` 里拆出来。

建议抽象成类似下面的结构：

```ts
export interface ImageProvider {
  id: string
  label: string
  listModels(): ProviderModel[]
  estimateCost(modelId: string, input: GenerateImageInput): number
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>
  supports(feature: ProviderFeature): boolean
}
```

这样做的好处：

- 新增 Provider 时不改主流程。
- 不同 Provider 的错误能统一格式。
- 模型配置、可用性、价格能集中管理。
- 后面支持禁用某个 Provider、灰度发布、降级切换会轻松很多。

## 生成流程应该怎么走

建议的标准流程：

1. 用户提交生成请求。
2. 后端创建一条 `generation_jobs` 记录，状态为 `PENDING`。
3. 预扣积分或冻结额度。
4. 调用 Provider Adapter。
5. 成功后上传到 R2。
6. 写入 `generations`。
7. 结算积分流水。
8. 写入 Prompt 事件和埋点。
9. 更新任务状态为 `COMPLETED` 或 `FAILED`。

第一版如果你想快一点，可以先不接真实队列，但数据库和状态机一定要先有。这样以后从同步改异步，不用推翻前端协议。

## 数据库建议补充的表

- `providers`
- `model_catalog`
- `generation_jobs`
- `usage_ledger`
- `prompt_events`
- `prompt_templates`
- `rate_limit_events`
- `moderation_events`

你现在已有的 `users` 和 `generations` 可以继续保留，但需要围绕它们补齐这些支撑表。

## 当前代码最值得优先重构的地方

- `src/app/api/generate/route.ts`
- `src/constants/models.ts`
- `src/services/generation.service.ts`
- `src/components/business/GenerateForm.tsx`
- `src/components/layout/Navbar.tsx`

## 为什么这套地基适合公开发布

- 能接更多模型，不会越来越乱。
- 能控制成本，不怕用户一多就炸。
- 能做 Prompt 推荐，不用后面重构数据库。
- 能接支付，但不会被支付绑住当前节奏。
- 能先做 Web，再平滑扩到移动端。
