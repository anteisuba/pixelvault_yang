# Studio 运行态手动验证清单

> 适用场景：本地 `next dev` 能启动，但 `/`、`/en/sign-in`、`/zh/studio` 页面响应不稳定，Codex 无法在当前环境完成可信的浏览器验收。

---

## 背景

当前代码侧的 `vitest`、`eslint`、`tsc` 已通过，但本地运行态还存在一个独立问题：

- `next dev` 可以启动并监听 `127.0.0.1:3000`
- `/zh/studio` 早期探测能看出会进入 Clerk 鉴权链，并出现过跳转目标 `/en/clerk_...`
- 但后续完整页面请求偶发卡住，`/`、`/en/sign-in`、`/zh/studio` 可能在 30 到 180 秒内没有稳定返回内容

这份清单的目标，是让你手动确认问题到底是：

1. 只影响 Codex 的探测链路
2. 只影响未登录态
3. 还是本地 dev server 本身就存在页面挂起

---

## 启动命令

在仓库根目录执行：

```powershell
npm.cmd run dev -- --hostname=127.0.0.1 --port=3000
```

注意：

- Windows 下这里要用 `--hostname=127.0.0.1 --port=3000`
- 不要写成 `--hostname 127.0.0.1 --port 3000`，否则 Next 可能把 `127.0.0.1` 误判成项目目录参数

---

## 监听确认

另开一个 PowerShell 窗口，执行：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 }
```

预期结果：

- 能看到 `127.0.0.1:3000` 或 `0.0.0.0:3000` 的监听记录

如果这里没有监听，不要继续测页面，先看 dev server 终端有没有启动错误。

---

## 手动页面检查

按下面顺序在浏览器中打开：

1. `http://127.0.0.1:3000/`
2. `http://127.0.0.1:3000/en/sign-in`
3. `http://127.0.0.1:3000/zh/studio`

### 你需要记录的结果

每个地址都记录这 4 件事：

- 是否在 10 秒内打开
- 最终 URL 是什么
- 页面是否有完整内容，还是一直白屏/空白加载
- 浏览器 Console 或 Network 是否报错

---

## `/zh/studio` 的预期

未登录时，`/zh/studio` 进入鉴权链是正常的。

你重点确认的是：

- 是否稳定跳到 Clerk 相关地址
- 是否最终进入 `/en/sign-in` 或某个 `clerk_...` 中间地址
- 跳转后页面是否能正常渲染，而不是卡住不返回

如果你看到的是下面这种行为，说明“鉴权链存在，但页面响应不稳定”的判断仍然成立：

- 地址栏发生跳转
- 但页面长时间白屏、空白、旋转不结束，或 Network 一直 pending

---

## DevTools 建议检查项

在 Chrome DevTools 里优先看这几项：

### Network

- 是否有 document 请求一直 pending
- 最后一个成功响应是哪个 URL
- 卡住的是 HTML、RSC、JS chunk，还是 auth 相关请求

### Console

- 是否出现 middleware、Clerk、hydration、fetch、chunk load 相关错误

### Timing

- 如果请求超过 30 秒还没完成，直接记为异常

---

## 建议截图或回传信息

如果你手测后要把结果回给 Codex，最好带上这些信息：

1. dev server 终端最后 50 行日志
2. `/`、`/en/sign-in`、`/zh/studio` 三个地址各自的最终 URL
3. 哪一个地址开始挂起
4. Network 面板里挂起请求的名称和类型
5. Console 第一条明显报错

---

## 当前代码验收边界

在运行态问题未排干净前，这一轮 Studio 改动建议按两层验收：

### 已可接受

- `vitest`
- `eslint`
- `tsc --noEmit`
- 组件级和状态逻辑 review

### 仍需手动补验

- 卡片管理面板的搜索、排序、复制
- 历史预览 → Remix / Use as reference
- 最近配置回填
- 未登录态访问 `/zh/studio` 的跳转与渲染稳定性

---

## 结论判断

你手测后可以直接按下面三种结论之一反馈：

1. `页面能正常打开`
说明 Codex 之前失败更像自动探测链路问题，可以继续按正常 UI 验收推进。

2. `只有 /zh/studio 挂起，/ 和 /en/sign-in 正常`
说明重点应转到 studio 页面本身或其数据依赖，而不是 Clerk 基础链路。

3. `/`、`/en/sign-in`、`/zh/studio` 都不稳定`
说明优先级应切到本地 `next dev` 运行时问题，先排中间件、Clerk 或 dev server 卡死，再做 UI 验收。
