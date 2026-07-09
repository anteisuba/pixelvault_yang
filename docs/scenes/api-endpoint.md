# Scene · API route 新增/修改（api-endpoint.md）

> 覆盖：`src/app/api/**` 的 route 新增与修改。业务逻辑本体走 `service-change.md`；接模型走 `new-model.md`。对应 checklist：`checklists/backend.md`。

## 专属 5 问（开工硬门）

1. **新 route 还是改现有？路径 / 方法 / 鉴权级别？**——公开路由要进 `src/proxy.ts` 白名单 = **权限决定，必须先问 owner**；内部回调必须走签名验证（`createApiInternalRoute` + `signature-verifiers/`）。
2. **请求/响应 schema 是什么？**——Zod schema 放 `src/types/`；响应恒定 `{ success:true, data }` / `{ success:false, error, errorCode?, i18nKey? }`，不许自创格式。
3. **走哪个工厂？要不要限流/缓存头？**——从 `api-route-factory.ts` 八工厂选（见 `references/backend.md` 表）；GET 可缓存公开路由考虑 `skipAuth` + `cacheHeader`；写操作考虑用户维度 `rateLimit`。不用工厂手写 `auth()` = 架构决定，先问。
4. **service 落点？**——业务逻辑进哪个 service？扩现有还是新建（先 grep exports 确认没有现成的）？route 里零业务逻辑、零 Prisma。
5. **错误面有哪些？**——列出可能失败的形态 → 映射标准 errorCode（`constants/generation-errors`）→ i18n 三语文案；raw 错误不直达用户。

## 本场景工作流

1. 问 5 问。
2. 读规矩：`references/backend.md`（工厂契约 + 认证边界）→ `forbidden.md` 后端节 → `references/domains/<域>.md` → `src/app/api/CLAUDE.md`（就地规则）。
3. 起点：`templates/api-route.md` 骨架（未落地前抄仓库里最近的同类工厂路由）。
4. **新增 route 全链五件套，一个不少**：`route.ts`（工厂）→ schema 进 `src/types/` → endpoint 常量进 `constants/config.ts` → 客户端包装进 `lib/api-client.ts` → 同目录 `.test.ts` 五段（401 → 400 → service mock → success → 500）。
5. 错误映射：新错误形态补 errorCode + `getGenerationErrorI18nKey` 映射 + 三语文案。
6. 自检：`checklists/backend.md` 逐项。
7. 交付报告：改动清单 + 测试结果 + **手动验证步骤**（curl 示例 / DevTools 看哪个请求与响应字段）。

## 必读清单

`references/backend.md` · `forbidden.md`（后端/安全节）· `references/domains/<域>.md` · `src/app/api/CLAUDE.md` · 碰 provider 时加 `references/providers.md`

## 禁改范围默认值

不动认证边界与公开路由清单（要动 = 先问 owner）· 不动 `prisma/`（schema 变更走 `db-migration.md`）· route 内禁业务逻辑 / Prisma / provider 调用 / R2 / credit 计算。

## 验证命令

`npx vitest run <相关文件>` 开发中迭代 → **声称绿之前全量 vitest** → 全量 tsc（后台 + 显式 exit code）→ 手动 curl / claude-in-chrome 走一遍真实请求。
