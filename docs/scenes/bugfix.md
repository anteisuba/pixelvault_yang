# Scene · Bug 诊断修复（bugfix.md）

> 覆盖：报错 / 500 / 行为异常 / "怎么坏了"。**先诊断后动手**：靠猜的修复 = 禁止。执行循环用 `investigate` / `diagnosing-bugs` skill。checklist 用对应域（UI bug → ui.md，服务端 → backend.md…）。

## 专属 5 问（开工硬门）

1. **复现路径？**——精确步骤 + 环境（dev/prod、登录态、locale）+ 证据（console / network / server log 截取）。不能稳定复现 → 先拿证据再动手，不上来就改代码。需要 dev server 日志直接向 owner 要（不自己另起实例）。
2. **影响面与严重度？**——哪些用户/路由/数据受影响？数据损坏类先讨论止血方案（比如先下线入口）再慢修根因。
3. **根因确认了吗？**——症状 ≠ 根因；动手前必须能**一句话说清因果链**（"A 导致 B 导致用户看到 C"）。⚠ 自动 review/agent 给的 CSS 对比度、级联类结论要先确定性复核再采信。
4. **修复的建模层级对吗？**——就地补丁 vs 结构性修复，按长期建模选；局部省事但错配的捷径不接受；两难（成本 vs 正确性）时把选项摆给 owner。
5. **回归防护是什么？**——先写**复现该 bug 的测试（红）**，修完转绿；评估波及面要不要加测试。

## 本场景工作流

1. 问 5 问（1–3 问没答案 = 还在诊断阶段，别进修复阶段）。
2. 取证：claude-in-chrome 实跑复现（console / network）；服务端问题向 owner 要 log；GitHub Actions 失败看 job summary。
3. 诊断循环：`investigate` 或 `diagnosing-bugs` skill；读相关 `references/domains/<域>.md` 确认"正确行为"的定义。
4. 写复现测试，确认红。
5. 修复：最小改动面 + 匹配代码库约定；**不加防御性 try-catch 吞错来"消灭"症状**（那是掩埋不是修复）。
6. 验证：复现测试绿 → 全量 vitest → 原复现路径实跑确认。
7. 自检：对应域 checklist。
8. 交付报告：**根因一句话** + 因果链 + 改动清单 + 测试证据 + 手动验证步骤。

## 必读清单

相关 `references/domains/<域>.md`（正确行为的定义）· `references/backend.md` 或 `frontend.md`（按 bug 层）· 在飞任务包（bug 可能是在飞工作的已知副作用）

## 禁改范围默认值

不顺手重构无关代码（发现别的问题 → 报告或立 task，不混进本次 diff）· 不改产品行为来绕过 bug（行为变更 = 产品决定，问 owner）· 高风险模块修复也守向后兼容规则。

## 验证命令

复现测试 ×2（稳定红→稳定绿）→ 全量 vitest → 原路径 claude-in-chrome 实跑 + console 无新错误。
