# 画布 · 域级令牌反转（`--node-*` → `--canvas-*`）

> owner 2026-07-27 拍板走**方向 B**：先做一次域级令牌反转，再按面精修。
> 数值唯一来源：[`canvas-skin-spec-2026-07-26.md`](canvas-skin-spec-2026-07-26.md)。

## 0 · 为什么是令牌层，不是 43 个文件

实读 `canvas.css`：

| 层                 | 内容                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `:root`            | `--node-panel: #191612` · `--node-foreground: #e8e6de` …… **旧深皮的值，至今是全局默认** |
| `.node-card-paper` | 局部把 `--node-*` 翻成纸色 —— **只挂在节点卡上**                                         |
| `.domain-canvas`   | 只**新增** `--canvas-*`，**从不重映射 `--node-*`**                                       |

所以：**凡是不在节点卡里、又还在用 `bg-node-* / text-node-*` 的地方，今天全是旧深皮** —— 43 文件 / 761 处。助手外壳翻白后壳内对话区仍近黑，就是这条的直接后果。

**项目自己验证过这条路**：`.node-card-paper` 的注释写明「卡内 281 处既有引用零改动，靠 Tailwind v4 `@theme inline` 单跳 `var(--node-panel)` 编译自动读到覆盖值 —— 已用 `getComputedStyle` 手工验证级联成立」。这次是同一手法，换个作用域。

## 1 · 映射表（在 `.domain-canvas` 内覆盖）

| `--node-*`                | 旧值                   | 语义          | → 新值                                              |
| ------------------------- | ---------------------- | ------------- | --------------------------------------------------- |
| `--node-panel`            | `#191612`              | chrome 面板底 | `var(--canvas-card-bg)` `#ffffff`                   |
| `--node-panel-inner`      | `#221f1b`              | 比面板深一档  | `var(--canvas-fill-control)`                        |
| `--node-panel-soft`       | `#1c1915`              | 面板柔和档    | `var(--canvas-bg)` `#f1f1f1`                        |
| `--node-foreground`       | `#e8e6de`              | 主文字        | `var(--canvas-ink)` `#0a0a0a`                       |
| `--node-muted`            | `#9a988f`              | 次级文字      | `var(--canvas-ink-regular)` `#525252`               |
| `--node-subtle`           | `#6f6a63`              | 三级文字      | `var(--canvas-ink-muted)` `#737373`                 |
| `--node-canvas`           | `#14120f`              | ⚠ 见 §2       | `#ffffff`                                           |
| `--node-focus-ring`       | `rgba(232,230,222,.4)` | 焦点环        | `rgba(10,10,10,.4)`                                 |
| `--node-shadow`           | `rgb(0 0 0 /.5)`       | 投影          | `rgba(0,0,0,.08)`                                   |
| `--node-status-failed`    | `#e5484d`              | 失败红        | `var(--canvas-danger)` `#c0342e`                    |
| `--node-status-failed-fg` | `#fadcdc`              | 红底上前景    | `#ffffff`                                           |
| `--node-status-done`      | `#1f3a2c`              | 完成底        | `color-mix` 出 `--canvas-ok` 的浅底（见 §3 要求算） |
| `--node-status-done-fg`   | `#7fc4a0`              | 完成前景      | `var(--canvas-ok)` `#16794c`                        |

## 2 · ⚠ `--node-canvas` 是双职令牌，单独说明

`canvas.css:15-16` 的注释写明它「also colors handles, scrims, and inverse button text」。深色时代它同时是：

1. **画布底**（已被 `--canvas-bg` 取代，这条职责已死）
2. **反白按钮文字**（`text-node-canvas` 配 `bg-node-foreground` = 浅底深字对）
3. **遮罩 scrim**（`bg-node-canvas/NN`）

翻成 `#ffffff` 三条都对：

- 职责 2：`--node-foreground` 已翻成墨 `#0a0a0a`，实底变深 → 上面的字必须变白，**这一对必须一起翻，翻一半就是黑吃黑**
- 职责 3：白 scrim 正是 v0.2 已定的浅色玻璃遮罩（`canvas-image-card.md` §5：`rgba(255,255,255,0.72)`，**不是黑纱**）

## 3 · ⛔ 故意要深的，**不许翻**

| 项                                                      | 为什么                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `--node-card-window` `#1b1917` + `.node-card-window` 块 | 媒体深窗。图/视频裱在深井里是对的，翻白会让所有缩略图漂在白上失去边界                            |
| `--node-monitor-frame` / `--node-monitor-matte`         | 视频监视器取景框与幕布，纯装饰的「监视器」语言                                                   |
| `.node-card-paper` 整块                                 | 节点卡自己的作用域，挂在更深的元素上，天然覆盖域级值。**别动它**，卡的皮走 `.canvas-card` 那条线 |
| `--node-blueprint-*`                                    | minimap 已改走 `.canvas-glass`，这组是死令牌，本轮**不清也不用**                                 |
| 端口色 `--node-port-*` 及 `-on-paper` 变体              | 卡上的东西，`.canvas-port` 已另立一套                                                            |

## 4 · 附带必做：硬编码字面量清扫

令牌反转治不了**写死的十六进制**。在 `.domain-canvas` 覆盖范围内搜这七个旧值并逐处判断：
`#e8e6de` · `#9a988f` · `#6f6a63` · `#191612` · `#221f1b` · `#1c1915` · `#14120f`

已知一例（本轮实测）：剧本工作区空态「还没有大纲」渲染成 `rgb(232,230,222)` 落在白底上，**1.25:1，基本看不见**。

## 4.5 · 连带：画布外观预设精简为浅色 ✅ owner 2026-07-27 拍板

反转后面板全变白，而 `NODE_STUDIO_CANVAS_APPEARANCE_PRESETS`（`constants/node-studio.ts:82`）**9 个底色里 6 个是深色** —— 用户选深底就是黑底白盒。v0.2 的深色档 CSS 写好了（`canvas.css:574` `.domain-canvas[data-scheme='dark']`），但**全仓没有一处设 `data-scheme`**，是死代码。

owner 选**精简预设**（而非接线深色档）：**只留浅色**。理由 = v0.2 定的就是浅色域，那 6 个深底是旧皮时代的遗产，删掉问题从根上不存在。

- 保留 `#FFFFFF` / `#F4F4F3`，并**补上默认值 `#F1F1F1`**（`NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT` 用它，却不在预设列表里 —— 现状不一致，顺手补齐）
- **已持久化的值不动**。owner 现有项目实测存的是 `#FFFFFF`（localStorage `pixelvault.nodeStudio.v3.*`），**无深色遗留数据**，所以没有迁移需求
- `.domain-canvas[data-scheme='dark']` 那块 CSS **保留不删** —— 它是 v0.2 规格的一部分，将来要做深色域时是现成的；只是今天没人接线。在它上面补一行注释说明「本轮起预设只给浅色，此块暂无激活路径」

## 4.6 · ⚠ 修订：反转挂 `:root`，不挂 `.domain-canvas`（2026-07-27 第二轮）

第一版挂在 `.domain-canvas` 上，真机暴露一个**系统性缺口**：

> **Radix 的 `Popover` / `Dialog` / `DropdownMenu` / `Select` 内容会传送到 `document.body`，那里在 `.domain-canvas` 的 DOM 子树之外 —— CSS 自定义属性不跨这个边界。**

实测「设置画布外观」的浮层：`closest('.domain-canvas')` = `null`，`--node-panel` 回退到 `:root` 的 `#191612`，浮层是深底浅字，和已翻白的周围环境打架。`grep` 出**14 个文件**有同类传送门。

**修法不是逐个文件加类，是把反转挂到 `:root`。** 前提已验证：

| `--node-*` 在画布目录外的消费者                         | 性质                                           |
| ------------------------------------------------------- | ---------------------------------------------- |
| `globals.css` `@theme inline`                           | 桥接定义，非消费                               |
| `studio-shared/pickers/CanvasRoutePicker.tsx`           | 画布路由选择器，名字即画布                     |
| `constants/node-studio.ts` · `constants/node-tokens.ts` | 画布常量                                       |
| `lib/health-status-utils.ts`                            | `getHealthDotClass(status, 'node')` 的画布变体 |

**`--node-*` 是画布独占词汇，全站没有第二个域在用** —— 所以挂 `:root` 没有跨域爆炸半径，而传送门继承的正是 `:root`，一次性修好那 13 个（第 14 个见下）。

局部覆盖不受影响，它们挂在更近的元素上，级联照样赢：`.node-card-paper` · `.node-card-window` · `.canvas-glass` · S3 连线块。

### 仍未解决的第二类：脊柱令牌传送门

`FishVoiceLibraryDialog` / `ProjectNameDialog` / `VoiceSelector` 等用的是**脊柱令牌**（`bg-card` / `text-foreground`），而 app 全局是 `<html class="dark">`，脊柱本来就是深的。挪 `--node-*` 到 `:root` **治不了这一类**。

根因：**画布是深色 app 里的一座浅色孤岛**，任何逃到 `document.body` 的东西都落回深色。

长期正解有先例可循 —— `lora.css:55-57` 里 `.domain-lora` **就重映射了脊柱令牌**（`--background: var(--lora-page)` / `--card: var(--lora-panel)`）。`.domain-canvas` 没做这件事，这才是缺口。彻底解 = `.domain-canvas` 同样重映射脊柱表面令牌 + 给画布一个自己的传送门容器（Radix `Portal container`）。

**本轮不做**，逐面精修时按面处理；这里记下架构判断，别下次又当新问题重新调查。

## 5 · 验收

1. **对比度全部用 `contrast-check` skill 算**，禁目测、禁心算、禁信 review agent 的算术
2. 真机逐面截图 + `getComputedStyle` 取值：助手对话区 · 剧本工作区 · 顶栏 · 底部胶囊 · 左侧面板 · 各 inspector · 添加菜单 · 外观面板 · 图像编辑工作区
3. **⚠ 整屏截图会改视口尺寸**（本轮实测 744→699→698），与 `getComputedStyle` 打架时**以区域放大 + 计算值为准**，别拿整屏截图当证据
4. 列出翻完之后**变得不可读或明显走样**的地方 —— 这是预期内的，本轮只负责报告不负责全修，逐面精修是后续轮次
5. 全量 tsc + 全量 vitest

## Last Verified

- 2026-07-27 · opus 5。三层令牌结构为 `canvas.css` 实读（`:root` L10-94 / `.node-card-paper` L115-130 / `.domain-canvas` L456-520）。761 处 / 43 文件为 `grep -c` 实测。`--node-canvas` 三职责引自其自身注释 L15-16。「还没有大纲」1.25:1 为真机 `getComputedStyle` + 确定性计算。
