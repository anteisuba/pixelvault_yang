---
name: context-restore
description: Restore a previous session's context from its handoff document before continuing work. Use at the start of a session when the user says 继承上个会话 / 接着上次 / context-restore, or references a handoff doc.
---

# 接进度

## 读的顺序（不要跳）

1. **交接文档** `docs/plans/*-session-handoff-*.md` —— 判断链与教训，一次读完
2. **入口/主文档** `docs/plans/*-master-*.md` —— 进度、需求、设计结论
3. **memory** 对应那条
4. 分册按需，做到哪块查哪块

## 开工前必做：核对实际状态

**文档会过期，尤其有并行会话时。** 别信文档说的"待办"，先验：

- `git log --oneline -5` 看最近提交
- 交接里标"未做"的事，实际查一次（可能已被别的会话做掉）
- 有真机可验的，开浏览器点两下比读代码快

核完发现文档过期，**先改文档再干活**，否则下一个会话继续被误导。

## 继承判断，不是继承结论

交接里的「我判错三次」那节是最该认真读的——它告诉你**上个会话的盲区在哪**，那多半也是你的盲区。

已推翻的旧判断不要捡回来。交接里写了"先否后立"的，按后者。

## 别做的

- 不要重新推导已有结论（推理链在交接里，直接用）
- 不要因为"我没参与那个决定"就重开设计讨论——owner 拍过板的按拍板走，要改先说清为什么
