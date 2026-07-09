# CI/CD 参考 — 流水线与部署现状

> 定位：CI/CD 现状事实（按现状写，不引入新 CI——owner 2026-07-10 拍板）。本地闸门见 `testing.md`；环境红线见 `forbidden.md` CI/CD 节。

## GitHub Actions（5 workflows，2026-07-10 核验）

| Workflow                | 触发                                          | 内容                                                                                                         |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ci.yml`                | push main/feat/\* · PR→main                   | 两个 job：lint（prisma generate → `tsc --noEmit` → eslint）+ test（unit）；Node 22 + npm cache，各限时 5min  |
| `deploy-check.yml`      | deployment_status（仅 **Production** 成功后） | 等 45s CDN 传播 → post-deploy smoke；失败自动开 issue（preview 部署有保护不跑，恒 401）                      |
| `health-monitor.yml`    | cron `17 */6 * * *`（每 6 小时）+ 手动        | 健康监控，失败开 issue                                                                                       |
| `model-doc-monitor.yml` | cron `17 0 * * 1`（每周一）+ 手动             | `npm run models:check-docs`：模型文档/接口检查，报告进 job summary + artifact（用 OPENAI/GEMINI key 做探测） |
| `post-deploy-smoke.yml` | 被 deploy-check 调用                          | 冒烟测试本体                                                                                                 |

### ⚠ 已知缺口：model-doc-monitor 无基线运行

脚本对比路径 `docs/reference/api/model-doc-monitor.snapshot.json` **从未存在**（脚本容忍 ENOENT 当首跑）——每周只出"现状报告"，无法对比漂移。补法：跑一次 `npm run models:check-docs` 后把 `artifacts/model-doc-monitor/current.snapshot.json` 提交到该路径作基线，此后每周有 diff；建议纳入 `model-catalog.md` 月审动作（待 owner 决定）。

## 部署（Vercel）

- push main → Vercel 自动构建部署；构建对比**上一个 deployment**（fix `5552da9a`）。
- Production 部署成功 → `deploy-check` 自动冒烟；失败开 issue。
- 环境变量边界：`NEXT_PUBLIC_` 只准 Clerk public key / CDN domain / App URL；其余机密只进服务端。

## 状态查询与排障（agent 可直接执行，2026-07-10 验证可用）

- **GitHub 侧（gh CLI，本机已登录 anteisuba）**：`gh run list --limit 10`（最近运行）· `gh run view <id> --log-failed`（失败日志）· `gh pr list`（PR 积压）· `gh run watch`（push 后盯 CI）。
- **Vercel 侧（Vercel MCP 工具）**：team `team_L2sUE4zqPCy2CNhTByObDN9v` · project `pixelvault` = `prj_euIIwn2fBxBjwfy1IvGZqDQ5ERAf`；`list_deployments` 看部署状态（target=production 是生产），`get_deployment_build_logs`（errorsOnly）查构建失败。
- 生产异常时序：先看最新 production 部署 state → deploy-check / post-deploy smoke 结果 → 需要回滚找 `isRollbackCandidate` 的上一个 READY 部署。
- Vercel 计划：Hobby（cron 表达式受限，历史上因此炸过一次构建）。

## Dependabot 分流规则（2026-07-10 实践沉淀）

| 类型                                            | 处理                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| dev 依赖 minor/patch（jsdom / lint-staged 类）  | 本地 checkout → 全量 vitest → 绿即可合                                                        |
| 生产依赖 minor/patch 组升级                     | 同上，但出现 peer 冲突（如 three vs model-viewer）时把冲突包摘出组单独处理或等上游，不硬合    |
| **major 升级（尤其认证/框架级，如 Clerk 6→7）** | **绝不机器人式合并**——立专项任务按官方迁移指南做，走 `scenes/new-model.md` 同级的联网核验纪律 |
| CI ❌ + Vercel ERROR 的 PR                      | 不合，先诊断（`gh run view --log-failed`）                                                    |

## 本地闸门（与 CI 的关系）

pre-commit（lint-staged 格式化）→ pre-push（tsc + lint + 全量 vitest，~8–9min）→ CI 复跑 tsc + lint + unit。**本地过了 CI 才可能过**；跳过本地钩子（--no-verify）被禁止。

## 环境纪律

- owner 已开 dev（3000）→ 直接复用，绝不另起实例；要 server log 直接向 owner 要。
- dev 跑着不并行 build（污染 .next/Turbopack 缓存 → 嵌套路由 404，需删 .next 重启恢复）。
- 测试 key 一次性 dev 实例，严禁进生产。

## Source of Truth

- `.github/workflows/*.yml`（5 个）· `.husky/` · `package.json`（scripts）· `scripts/check-model-docs.mjs` · Vercel 项目设置

## Last Verified

- Date: 2026-07-10 · Method: 逐 workflow 读取触发与步骤；`models:check-docs` 基线缺口经 git ls-tree + 脚本 ENOENT 分支核验。
