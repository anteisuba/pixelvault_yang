# 项目状态

最后更新：2026-07-28

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## Current Focus

- **画布视频节点“纯视频卡 + 固定右侧编排器”已按 owner 确认切片完成本地实现。**
  视频卡只保留名称、媒体与真实状态；编排器在单选时以 React Flow
  `NodeToolbar` 固定于右侧，紧凑态消费现有 `useVideoComposer` 真值，
  详细态在原锚点向右展开并复用既有模型、参数、素材管理和生成链。
- **公开体验第一批安全门禁与 Execution & Billing Reliability 第一批修复已完成本地实现并满足 commit 门禁；原始 review 尚未全部完成。**
- 安全门禁：Next 16.2.11；`sharp` 0.35.3（含 Next 嵌套依赖 override）；集中日志递归脱敏与 prompt/LLM 原文日志清理；生产 fail-closed 的平台生成总开关；原子全局日预算 500、用户日额度 20、用户活动 Job 上限 2；Execution v1 签名绑定时间、nonce、方法、路径与 body hash，并以 Upstash Redis 防重放。
- Clerk Production instance 已完成自定义域名 DNS/SSL、Vercel Production/Preview 密钥拆分和 `user.created` / `user.updated` / `user.deleted` webhook 配置；首次公开部署保持 `PLATFORM_GENERATION_ENABLED=false`。已验证主邮箱可把旧数据库账户安全重绑定到新的 Production Clerk ID，只更新 `clerkId`，保留内部 `User.id`、图库、生成记录和个人资料；Preview/Development 不允许反向覆盖该映射。
- 本批 Reliability 修复统一了回调终态 CAS、Worker `runId` 幂等、模糊派发保活、DB-first 模型执行目录、Runner 月额度原子化、图片服务端计费单位、lazy stale reconciliation、预览 Outbox 有界重试、上传/内存限额、开发认证边界、结构化公开错误和部分 CI 闸门。
- 主生成链路现在以 `GenerationJob.id` 作为 Worker 实例 ID；超时/网络/5xx/无效 ACK 不再把可能已执行的任务误标为失败。失败回调、成功回调和 Sweeper 不能覆盖已经进入其他终态的 Job。
- 数据库 `ModelConfig` 的 availability、adapter、external model ID、cost、timeout 和 provider config 已进入真实执行面；后台变更会主动失效模型缓存。
- `workers/execution/wrangler.jsonc` 的现有本地修改属于 owner，本轮未修改、未覆盖。

## Validation

- 画布视频编排：`npx tsc --noEmit` 通过；相关 ESLint 通过；
  `VideoComposer.test.tsx` 37/37 通过。复用 owner 的 3000 实例真机确认：
  桌面右侧间距 24px、顶差 0px，详细态 320px → 440px，节点坐标/尺寸
  不变，取消选择后侧栏隐藏，侧栏不重复渲染视频。
- `npx tsc --noEmit`、全量 `npm run lint`、Next 16.2.11 production build：通过；构建包含 TypeScript、173 个静态页面与路由收集。
- 第一批安全回归：日志/prompt/provider 51/51；免费体验预算与管理员统计 28/28；内部签名/路由/派发 43/43；Execution Worker 67/67；`sharp` 真实图片处理 57/57。
- Clerk 用户映射定向回归 30/30；本轮最终 `npx tsc --noEmit`、全量 `npm run lint`、全量应用 Vitest（退出码 0）与 Execution Worker 67/67 均通过。
- Playwright mobile 根因已确认并修复：本地 `next start` 加载了 `vercel env pull` 写入的 `VERCEL_ENV=production`，CSP 将 localhost CSS 从 HTTP 强制升级为 HTTPS，导致 Gallery 无样式。`upgrade-insecure-requests` 现在仅在具有部署专属 `VERCEL_URL` 的 Vercel Production/Preview 构建启用；375px Gallery 隔离回归连续两次 3/3，通过完整 mobile 单 worker 23/23。
- `npm audit`：0 critical、9 high、15 moderate、2 low；Next 指定 advisory 与 `sharp`/libvips 4 个 2026 CVE 已移除。剩余高危均为 Clerk/Vite/Hono 等间接依赖链，留待按各上游兼容版本分批升级。
- `npx prisma validate`、CI YAML/`vercel.json` 解析、最终 `git diff --check`：通过。

## Next

- 画布下一轮按串行顺序继续：先核验各视频模型的真实发送计划与 provider
  差异，再处理“所有节点的快速定位”卡匣；节点详情页和按钮动效最后收口。
- push `main` 前按 release P0 完成 Clerk Production 的注册策略、Bot protection、邮箱验证与 OAuth 配置复核，再做 Production redeploy、真实同邮箱注册/图库继承 smoke、Playwright mobile smoke 和 GitHub CI。
- 第二批安全建议：用户原始资产改私有 bucket + 短时签名 URL；API key 密文 `version + kid + AAD` 轮换；高成本接口按 Redis 故障 fail-closed 分级；上传文件内容嗅探/解码沙箱；管理员权限与审计日志收紧；继续升级 Clerk/Vite/Hono 等间接依赖。
- 原 review 的剩余高优先级工作：成功回调先抢占 `FINALIZING` 再做下载/上传；图像主派发进入可靠 Outbox；`ExecutionOutbox` 一对多迁移（主派发 + 预览衍生）；免费额度 reservation/release；计费字段拆分（billing units / provider requests / attempts / USD cost）；高成本接口 Redis 故障 fail-closed。
- 第二批治理：API key `version + kid + AAD` 轮换；大型资产 R2 直传与内容嗅探；multipart/API Route Factory 统一；Execution/Audio 领域拆分与边界规则；CI 增加 Playwright smoke、关键域 coverage threshold，并让 high-risk dependency audit 真正阻断。

## Blocked

- 音频 provider 在接收结果未知时没有官方幂等键或按客户端 run ID 查询能力；自动重提可能双扣费，因此当前保留 Job 供人工/后续 reconciliation，不做不安全自动重试。
- Hobby Vercel Cron 不能提高到分钟级；当前通过状态查询 lazy reconciliation 补偿，若要 5–10 分钟集中 sweep，需要升级计划或引入外部调度器，由 owner 决定。
