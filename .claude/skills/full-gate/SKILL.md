---
name: full-gate
description: Run the project's full type-check and test gates correctly before claiming green, committing, or pushing. Use at the end of every implementation slice.
---

# 全量闸门

**声称绿之前必须全量。** 定向子集会漏跨文件漂移（删一个 model 会波及 prompt/adapter/route 测试）。

## 跑法

两条都要，可并行后台跑：

```bash
npx tsc --noEmit > <scratchpad>/tsc.log 2>&1; echo "TSC_EXIT=$?"
npx vitest run > <scratchpad>/vitest.log 2>&1; echo "VITEST_EXIT=$?"
```

- 全量 tsc 约 **4 分钟**，全量 vitest 约 **6 分钟**。**禁止因超时跳过** —— 用后台任务 + 显式捕获 exit code。
- ⚠ **管道会吃退出码**，必须显式 `echo $?`。
- ⚠ 命令链末尾别放 `grep -c`：匹配到 0 行时它返回 1，会把成功报成失败（踩过）。

## 判绿

- tsc：**`src/` 零错误**。dev server 跑着时可能报 `.next/dev/types/routes.d.ts` 幻影错（TS1005/1109），不算。
- vitest：`FAIL` 行数为 0。只看结尾的 passed 计数不够，要 grep 一次 `FAIL`。

## 新增测试后

全量那轮若与你改测试文件同时起跑，**新断言可能没被跑到**。单跑那个文件确认一次，别把「文件存在」当成「断言执行过」。

## 提交

- pre-commit 钩子跑 prettier + eslint，文件多时**会超 2 分钟默认超时** → 提交命令给足 timeout（10 分钟）。
- 钩子会把原状态存进 lint-staged stash；被打断后要重新 `git add`（prettier 已改过文件）。
- ⚠ **有并行会话时 `git add` 别用整目录** —— 会把别人在飞的改动一起提交（踩过）。
- owner 点头才提交；**push main = 生产部署**，先过 `docs/checklists/release.md`。
