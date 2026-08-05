# 全局应用壳施工图 — app-shell

> **状态：施工基准（2026-07-31，owner 确认「全浅」）。**
> 此前这里是空白——`文档厘清与过期冲突清单` §2.4 点名「全局壳（侧栏等）尚无单一 page，**未立法**」。本文补上这个 SoT。
> 上游：壳色向 **A' 浅壳浅台**（2026-07-30 owner 拍板，见 `plans/research-landing-plan-2026-07-30.md` §0.1 #1）。
> 调研证据：`plans/research/UI与设计/UI首页画布与全局策略-2026-07.md`。
> 范围：**只管壳**——侧栏 / 移动 TabBar / 默认页面表面（`bg-background`）/ 全局语义槽。**不管**各业务域皮肤（画布 `canvas.css`、LoRA `lora.css`、首页 `home-v3.css`、legal `legal.css` 各自为政，见 `brand-dna.md`「共享行为不共享皮肤」）。

---

## 1 · 现状事实（2026-07-31 真机实测，非推演）

### 1.1 「全黑」来自**九处** `dark`，不是一个

> ⚠ **本节 2026-07-31 修正过一次。** 初稿写「两个 dark」，是只 grep 了 `layout/` 目录的结论；真机摘掉那两个之后仍有残留节点，全仓复查才发现 **`dark` + `bg-sidebar` 是一整套「深色表面」惯用法**，散在 business 各处。**别再按「两处」估算范围。**

| #   | 位置                                                | 性质                                                                                                                                                                                              | 本轮        |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| ①   | `src/app/layout.tsx:35` — `<html className="dark">` | 全局。让所有没有域皮肤的页面吃 `globals.css` 的 `.dark` 令牌块（369 行起）                                                                                                                        | ✅ 已移除   |
| ②   | `layout/AppSidebar.tsx:101`                         | 侧栏，**有意**。L94–95 原注释：\*dark theme … layered on top of the **light editorial main surface\***                                                                                            | ✅ 已移除   |
| ③   | `layout/MobileTabBar.tsx:277`                       | 移动竖 rail（`w-11 lg:hidden`）——**与 ② 是同一个导航概念的两个断点形态**                                                                                                                          | ⬜          |
| ④   | `business/cards/CardsPageContent.tsx:38`            | **整个 Cards 页**。注释：「套用 `dark` 类切到 Krea Overlay 表面 — 卡片缩略图为主体，匹配 sidebar」                                                                                                | ⬜          |
| ⑤   | `business/AssetSelectorDialog.tsx:95`               | 素材选择弹层。注释：「dark inner surface owns the full content area」                                                                                                                             | ⬜          |
| ⑥   | `business/studio/StudioCardSection.tsx`             | Studio 卡片抽屉                                                                                                                                                                                   | ⬜          |
| ⑦   | `app/[locale]/(main)/assets/loading.tsx`            | Assets 骨架屏（要跟 Assets 页最终色向一致）                                                                                                                                                       | ⬜          |
| ⑧   | `business/node/StudioNodeWorkbench.tsx`             | **画布工作台本体**（`bg-node-canvas`）——⚠ `canvas.css` 里 `.dark` 出现 0 次，说明 `--node-*` 令牌很可能来自 `globals.css` 的 `.dark` 块，**这个 `dark` 大概率是承重的**，动之前必须先确认令牌来源 | 🚫 本轮不动 |
| ⑨   | `business/node/CanvasImageEditWorkspace.tsx:731`    | 画布图编弹层（同 ⑧ 一族）                                                                                                                                                                         | 🚫 本轮不动 |

**关键推论（修正版）**：这个 app 早就迁移成了「**浅底 + 局部深色岛**」——多个表面**主动**选了深色，各有设计理由（缩略图为主体、内容区独占等）。而 ① 是遗留，它把所有**没**选深色的页面也一并拖黑。所以：

- 移除 ① = 让没选深色的页面回到它们本该有的浅色 ✅ **这就是 owner 痛点的直接解**
- 移除 ②–⑦ = **逐个推翻一条有理由的域级设计**，属于域设计决策，不是壳的清理
- ⑧⑨ 属画布域，有自己的皮肤 SoT（`canvas-skin-spec`），**壳无权处置**

### 1.2 全仓已经在跟 ① 打架

四张域皮肤里三张写了绕过 `.dark` 的代码：

| 文件             | 注释原话                                                |
| ---------------- | ------------------------------------------------------- |
| `home-v3.css:14` | Light page inside an app whose `<html>` carries `.dark` |
| `lora.css:8`     | 覆盖语义槽（更近祖先胜 `<html.dark>`）                  |
| `legal.css:11`   | Button here inherits the `.dark` palette's `--primary`… |
| `canvas.css`     | **零 `.dark` 依赖**（2026-07-27 已整域翻浅）            |

👉 **没有任何一个域还需要 `.dark`。** 它今天的唯一作用是让每个新域再绕一次。

### 1.3 其它结构事实

- 壳组件（`AppSidebar` / `MobileTabBar`）**零硬编码颜色**，全部走语义槽 —— 翻浅不需要改组件颜色代码
- `:root`（`globals.css:260` 起）已有整套浅色令牌，注释标 **Krea light tokens**；`--background: oklch(100% 0 0)` 纯白、`--primary: oklch(0% 0 0)` 纯黑
- `dark:` 变体绑的是 `@custom-variant dark (&:is(.dark *))`（`globals.css:11`）——**不是** `prefers-color-scheme`。移除 `.dark` 后全部失效、回落基础类
- `dark:` 用量：**79 处 / 20 文件**，其中 **10 个在 `components/ui/` 原语**（badge · button · dropdown-menu · input · number-ticker · select · switch · tabs · textarea）

---

## 2 · 决策（owner 2026-07-31）

**全浅：两个 `dark` 都移除。** 字面执行 A' 浅壳浅台。

对照过的另一个选项（**未采纳**）：只移 ①，保留侧栏深 rail —— 即 `AppSidebar` 注释里原本的设计意图。代价是侧栏与主区只剩发丝线、分区感弱；owner 选了全浅。

⚠ 因此本次**推翻** `AppSidebar.tsx:94–95` 记录的「深侧栏 layered on light main surface」设计意图。改动时把那段注释一并改写，别留下与代码矛盾的注释。

---

## 3 · 对比度基线（真机 canvas 解析实测，`/zh/studio/image`，1440×900）

> 方法：`getComputedStyle` 取色 → canvas 合成解析真实 RGB（含 alpha 叠底）→ WCAG 2.x 相对亮度。
> ⚠ **直接按字符串解析 `oklab(...)` 会得到完全错误的数字**（第一遍就是这么错的）。复算必须走 canvas 或等价的色彩空间转换。

| 元素                       | 前景               | 底                 | 比值     | 判定           |
| -------------------------- | ------------------ | ------------------ | -------- | -------------- |
| 侧栏语言 EN / JA（未选中） | `rgb(142,142,142)` | `rgb(250,250,250)` | **3.14** | ✗ 11px 需 ≥4.5 |
| eyebrow「图片工作台」      | `rgb(157,157,157)` | `rgb(255,255,255)` | **2.71** | ✗ 11px 需 ≥4.5 |
| 侧栏语言 ZH（选中）        | `rgb(10,10,10)`    | `rgb(250,250,250)` | 18.97    | ✅             |
| 主标题「描述你想要的画面」 | `rgb(115,115,115)` | `rgb(255,255,255)` | 4.74     | ✅             |
| 查看操作教程               | `rgb(10,10,10)`    | `rgb(255,255,255)` | 19.80    | ✅             |
| 示例 chip「胶片人像」      | `rgb(34,34,34)`    | `rgb(251,251,251)` | 15.37    | ✅             |
| 底栏「请先选择模型」       | `rgb(10,10,10)`    | `rgb(255,255,255)` | 19.80    | ✅             |

**两处失败同源**：`--muted-foreground`（`oklch(55.6% 0 0)`）本身在 16px 全不透明下是 4.74 ✅，但被 **带 alpha 使用**（`/70` 一类）叠白后掉到 2.7–3.1。

⚠ **别用「整体调暗 `--muted-foreground`」解决**：要让 70% alpha 叠白后达到 4.5:1，底色需降到约 `rgb(59)` —— 那会让所有全不透明的次要文字变得过重。**正确方向是消掉这两处的 alpha 用法**（或给小字号次要文字单独一个更暗的槽），逐处改，改前后都跑 `contrast-check`。

---

## 4 · 施工清单

### 4.1 · 壳本身（本轮范围）

| #   | 改动                                   | 落点                                     | 状态                                                                                                                                                      |
| --- | -------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 移除全局 `dark`                        | `layout.tsx:35`                          | ✅ 已改（未提交）                                                                                                                                         |
| 2   | 移除侧栏 `dark` + 改写 L94–95 注释     | `AppSidebar.tsx:101`                     | ✅ 已改（未提交）                                                                                                                                         |
| 3   | **`MobileTabBar.tsx:277` 必须跟 ②**    | `layout/MobileTabBar.tsx`                | ✅ 已改（未提交）。不做就是 bug：桌面侧栏浅、移动 rail 深，同一导航两副面孔。⚠ 仅**程序化**确认底色令牌已解析为 `lab(98.26 0 0)`；**渲染未目验**（见 §6） |
| 4   | 三张域皮肤拆「绕过 `.dark`」的双重否定 | `home-v3.css` · `lora.css` · `legal.css` | ⬜ 拆不是删，先证明去掉后表现不变                                                                                                                         |
| 5   | 两处对比度失败                         | 见 §3                                    | ⬜ 消 alpha，**不**整体调暗令牌                                                                                                                           |
| 6   | 79 处 `dark:` 变体                     | 20 文件（10 个在 `ui/`）                 | ⬜ **失效 ≠ 出错**：shadcn 原语的 `dark:` 本就是浅色基础类之上的补丁，回落通常正确。**真机逐页扫出真坏的，别盲改 79 处**                                  |

### 4.2 · 深色岛（**不属于壳，需逐个域决策**）

`CardsPageContent` · `AssetSelectorDialog` · `StudioCardSection` · `assets/loading` 各自有设计理由（见 §1.1 注释引文）。**壳翻浅不自动蕴含它们要翻浅**——每个都是「这个表面为什么当初选了深色、那个理由今天还成立吗」的独立问题。画布两处（⑧⑨）连问都不该在这里问，归 `canvas-skin-spec`。

**顺序建议**：1+2+3 先落齐（壳的一致性）→ 真机逐页扫 → 按扫出的实际损坏做 5、6 → 4 → 深色岛另开。

---

## 5 · 禁改 / 红线

- **不动各域皮肤的视觉答案**：画布已在最终色向（`color-scheme: light` · `--canvas-bg #f1f1f1`），壳翻浅**不构成**画布返工理由
- **不在一天内 globals 换肤 + 全站搜 class 替换**（`UI首页画布与全局策略` §3.2 明列禁令）
- **不把首页营销留白/大标题贴进工作台密度**
- 改任何颜色前跑 `contrast-check` skill，**禁目测、禁信 review agent 的算术**
- `dark:` 变体**不整批删**——先证明哪些真的坏了

## 6 · 验收

- [ ] 全站无 `.dark` 残留：`document.querySelectorAll('.dark').length === 0`
- [ ] 逐页真机目检 + 截图：Studio 图/视频/音频/3D · Assets · Gallery · Prompts · Cards · Profile · Settings
- [ ] 画布与 LoRA 两域**外观零变化**（它们有自己的皮肤，变了就说明脊柱漏进域里了）
- [ ] §3 表里 2 项失败转 ✅，且其余 6 项不回退
- [ ] **375 档**逐页复验 —— ⚠ 2026-07-31 那轮 `resize_window` 没切到视口（`innerWidth` 仍 1920），**移动档尚未验过，不得按已验处理**
- [ ] 全量 tsc + 全量 vitest（`full-gate`）

## Last Verified

**2026-07-31 · 已改代码（未提交）**：`layout.tsx` · `AppSidebar.tsx`（含注释改写）· `MobileTabBar.tsx`，共 3 文件、净 −2 行。

已验：

- 真机 `/zh/studio/image` 重新加载后 `document.querySelectorAll('.dark').length === 0`，页面整体浅色，布局/间距/缩略图无损
- 摘除前后各截图对照（现状全黑 → 只摘全局 → 全浅）
- 对比度 8 项，canvas 解析实测（§3）
- `grep` 核：79 处 `dark:` / 20 文件、四张域皮肤 `.dark` 引用、`@custom-variant` 定义、九处本地 `dark` 全量清单

**未验，不得按已验处理**：

- **移动档（<1024）渲染** —— `resize_window` 在本机对视口无效（`innerWidth` 恒为 1920），`MobileTabBar` 是 `lg:hidden` 所以桌面下不渲染。只程序化确认了它的底色令牌解析为近白
- 除 `/zh/studio/image` `/zh/cards` 外的其余页面
- 画布域与 LoRA 域外观是否零变化
- 全量 tsc / vitest 未跑
