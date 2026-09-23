# PLAYBOOK — 每类任务怎么开始（owner 起手式手册）

> 只需说明目标；agent 先读相关事实，在授权范围内完成工作，只询问会影响结果的缺口。交付包含改动与验证证据，图示和手动步骤按需提供。

## 创作与 UI

**1 · 重构/升级一个页面 UI（改版级）**
开口："重做 XX 页" / "XX 页太普通了，想让它有自己的特色"。
我先做：冻结整页代码改动 → 审计真实能力和全部关键状态 → 讨论域定义 → 每次只确认一个结构问题并同步决策账本 → 确认审美方法与禁区 → 用同一内容出三个结构方向 → 你选向后只深化一个关键切片 → 写 `references/pages/<页>.md` → 你授权后才实施。
流程：`scenes/ui-page.md` ｜ 新设计任务/可选 Fable 升级简报：`templates/ui-redesign-brief.md` ｜ 你拍：单项结构、三方向、关键切片、实现授权 ｜ 验收：`checklists/ui.md` 8 项 + 机器门；日常小任务用 `templates/ui-request.md` 需求卡，默认值读 `references/ui-defaults.md`。

**2 · 小 UI 调整（按钮/文案/间距，非改版）**
开口："XX 按钮太挤" / "这文案改成…"。
我先做：保持该页当前局部行为和外观，不借小改偷做新设计 → 直接改 → 机械检查 + 相关交互实跑。若目标是改版，则回到上一条逐域确认。
流程：`scenes/ui-page.md`（trivial 档，局部修复直接验证）。

**3 · 首页 / 营销页优化**
开口："首页 hero 加个惊艳层" / "加一个 XX section"。
流程：`scenes/ui-marketing.md`（pv-design-taste-frontend 定方向 → 实现 → 反 slop 审计）。

## 工程

**4 · 发现一个 bug**
开口：贴现象即可——"XX 报错了" + 复现步骤/截图（有 console 证据更快）。
我先做：复现取证 → **一句话根因** → 先写复现测试（红）→ 修（绿）→ 按影响面验证。数据损坏类先给止血方案。
流程：`scenes/bugfix.md` ｜ 红线：不能复现不动代码、不用 try-catch 掩埋。

**5 · 开始一个新功能（想法 → 上线）**
开口："我想加一个 XX 功能"。
我先做：①值不值得做/最小形态（对话+方案图）→ ②你拍板范围 → ③在对话记录目标/非目标/验收，需交接时用 task packet→ ④按 Feature dev order 穿场景执行（constants→types→service→route→hooks→UI）→ ⑤发布。
流程：`templates/task-packet.md` 串多个 scene ｜ 你拍：范围与验收。

**6 · 调查可行性 / 技术选型**
开口："调查下 XX 能不能做" / "对比 A、B 方案"。
我先做：先和你定**判据**和时间盒 → 官方资料核验 →（需要时）竞品实测 / 丢弃式原型 → 方案对比 + 明确推荐 + 选择框拍板。
流程：`scenes/research.md`（新增）｜ 产出是拍板依据，不动产品代码。

**7 · 接入 / 升级模型**
开口："接一下 XX" / "XX 出新版了升级下"（或等我月审报上来）。
我先做：官方 API 核验 → 通道判断（直连优先）→ 四件套 + Worker handler + 错误映射 → dev 一次性 key 端到端实测 → 回写 model-catalog。
流程：`scenes/new-model.md` ｜ 你拍：上架 / 下架。

**8 · 改数据库结构**
开口："XX 要加个字段 / 要记录 XX"。
我先做：先答"该不该拆表"（长期建模）→ 影响面 grep → 回滚 + 存量数据方案给你过目 → migrate 三步硬序。
流程：`scenes/db-migration.md`。

**9 · 补测试 / 修失败测试 / 换机更新视觉基线**
开口："给 XX 补测试" / "测试挂了" / "我换 Mac 了"。
流程：`scenes/testing.md` ｜ 修测试先定性：测试过时还是代码 bug。

## 运维与节奏

**10 · 发布上线**
开口："可以发了" / "commit 然后推"。
我先做：diff 夹带检查 → release P0 三闸 → commit（你点头的范围）→ push → 盯 CI + 生产冒烟 → 报告。出问题先 rollback 再按 bugfix 慢修。
流程：`scenes/deploy-release.md`。

**11 · 看状态 / 查部署 / dependabot**
开口："CI 咋样" / "生产正常吗" / "机器人 PR 怎么处理"。
我直接查（gh + Vercel MCP，手册 `references/cicd.md`）→ 出状态板 + 分流建议。

**12 · 性能问题**
开口："XX 页好卡"。
我先做：先测量（profile / network / LCP）再动手——性能问题 = 根因未知的 bug，禁止盲优化。
流程：`scenes/bugfix.md` 取证纪律 + web-perf skill。

**13 · 文档 / 规则更新**
开口："把 XX 写进文档" / "这条以后要遵守"。
我先做：找该事实**唯一的家**（不新建重复文档）→ 更新 + Last Verified；行为类规则进 forbidden / WORKFLOW / 对应 scene。

**14 · 模型阵容审计**
开口：“审计当前模型阵容”。定期审计需另有已授权自动化；文档说明不代表已安排。

## 与分工的关系

当前会话可完成已授权的设计与跨层实现，不绑定固定模型或强制交接。UI 改版仍须确认方向与关键切片；单会话任务不额外创建交接文件。
