---
name: context-restore
description: Restore a previous session's context from the domain's resident doc in docs/references/ before continuing work. Use at the start of a session when the user says 继承上个会话 / 接着上次 / context-restore, or references a handoff doc.
---

# 接进度

## 读的顺序（不要跳）

1. **memory** 对应那条 —— 先定位是哪个域、落点在哪份文档
2. **该域的常驻文档** `docs/references/<域>.md`（或 `references/domains/` `references/pages/` 下对应那份）—— 正文是进度/需求/设计结论，末尾的「判断与教训」一节是判断链与教训，一次读完
3. 相邻域文档按需，做到哪块查哪块

⚠ **不存在独立的交接文件。** `docs/plans/` 已于 2026-09-01 整目录删除，`*-session-handoff-*.md` / `*-master-*.md` 全部不在了——别去找，也别新建，要旧件从 git 历史取。

## 开工前必做：核对实际状态

**文档会过期，尤其有并行会话时。** 别信文档说的"待办"，先验：

- `git log --oneline -5` 看最近提交
- 文档里标"未做"的事，实际查一次（可能已被别的会话做掉）
- 有真机可验的，开浏览器点两下比读代码快

核完发现文档过期，**先改文档再干活**，否则下一个会话继续被误导。

## 继承判断，不是继承结论

「判断与教训」里的「我判错三次」是最该认真读的——它告诉你**上个会话的盲区在哪**，那多半也是你的盲区。

已推翻的旧判断不要捡回来。那节里写了"先否后立"的，按后者。

## 别做的

- 不要重新推导已有结论（推理链在那一节里，直接用）
- 不要因为"我没参与那个决定"就重开设计讨论——owner 拍过板的按拍板走，要改先说清为什么
