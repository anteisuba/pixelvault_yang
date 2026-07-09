# Testing 参考 — 测试策略与现状事实

> 定位：测试体系的现状事实与纪律。检查项见 `checklists/`（各域 P0 都含测试项）；红线见 `forbidden.md` 测试节。

## 命令与闸门（2026-07-10 核验）

| 闸门                              | 内容                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test` / `test:run`       | Vitest（watch / 单次）                                                                                                                                                                                                          |
| pre-commit（husky + lint-staged） | `*.{ts,tsx}` → prettier + eslint --fix；`*.{json,css,md}` → prettier                                                                                                                                                            |
| **pre-push（husky）**             | `tsc --noEmit` → `npm run lint` → `npx vitest run --reporter=verbose`——**三关全过才能推**（本机实测 2026-07-10：tsc 185s + lint 350s + vitest 412s ≈ **合计 15.8 分钟**，比旧口径"约 8–9 分钟"慢近一倍；不许 --no-verify 跳过） |
| CI `ci.yml`                       | push/PR 再跑 tsc + lint + unit，另有 audit（npm audit + Prisma drift）与生产 build 两个 job（见 cicd.md）                                                                                                                       |

- **全量纪律**：声称"绿"之前必须全量 vitest（本机实测 ~412s / 6.9min，旧口径 ~4.5min 已过时）——定向子集抓不住跨文件漂移；全量 tsc（本机实测 ~185s / 3.1min，旧口径 ~4min）后台跑 + 显式捕获 exit code（管道会吃退出码），禁止因超时跳过。lint 本机实测 ~350s / 5.8min，此前文档未记录该项耗时。

## 单元 / 组件测试（Vitest + @testing-library/react）

- 测试与源文件**同目录**；新增/修改功能必须带对应 `.test.ts(x)`。
- API route 助手：`src/test/api-helpers.ts`；route 必测五段：**401 → 400 → service mock → success → 500**。
- 分层测法：Service 测业务逻辑边界 · Hook 测状态变化与 API mock · Component 测渲染与交互。
- Zod schema 用 `.safeParse()` 测有效 / 无效 / 边界（不用 `.parse()`）。
- i18n 守护测试：`src/i18n/completeness.test.ts`（三语键齐全 + AI_MODELS 标签 + providers 文案）。

## E2E / 视觉回归（Playwright，`e2e/` 2026-07-10 清点）

| spec                                                   | 用途                                                  |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `auth.setup.ts` / `global.setup.ts`                    | 登录态与全局准备                                      |
| `landing.spec.ts` / `gallery.spec.ts` / `i18n.spec.ts` | 主路径 + locale 路由                                  |
| `mobile.spec.ts`                                       | 移动端主路径（`--project=mobile`，UI 改动必跑）       |
| `visual.spec.ts` + snapshots                           | 全站视觉基线                                          |
| `studio.visual.spec.ts` + snapshots                    | Studio 视觉基线（**依赖测试用户状态**，含 mask 方案） |
| `studio-auth.spec.ts`                                  | Studio 鉴权路径                                       |

- **视觉基线按 OS 分套**（`-win32` / `-darwin` / `-linux`，Playwright 自动选）：Mac + PC 双机开发，换机先 `--update-snapshots` 生成该 OS 的套；两套各自提交。
- 有意改动 UI 时更新基线并在报告里点名改了哪些快照——截图不是断言的替代品，具体值用 `toHaveCSS` / `toHaveClass` / `getByRole` 断。

## 环境与安全

- 测试用 key / 账号必须一次性 / dev 实例 / 限额；**严禁生产 key**。
- 本机 preview\_\* 浏览器连不上 localhost：UI 实跑用 claude-in-chrome；owner 已开 dev（3000）直接复用，绝不另起实例。
- dev server 跑着时不 build（毁 .next）。

## Source of Truth

- `vitest.config.ts` · `playwright.config.ts` · `e2e/` · `.husky/{pre-commit,pre-push}` · `package.json`（scripts + lint-staged）· `src/test/api-helpers.ts` · `src/i18n/completeness.test.ts`

## Last Verified

- Date: 2026-07-10 · Method: scripts / husky 钩子 / e2e spec 清点读取；时长数字为本机实测（`npx tsc --noEmit`=185s、`npm run lint`=350s、`npx vitest run --reporter=verbose`=412s，各自独立计时，非并行），仅代表当次机器状态，非跨机器承诺值。
