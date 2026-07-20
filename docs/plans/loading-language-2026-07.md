# 加载态统一视觉语言 · 设计规格(2026-07-17)

> **性质**:Fable 视觉规格,交 **Sonnet 实现**。工程骨架(组件 API / 收编策略 / 算法框架 / 验收)以两份姊妹文档为准,本文只定视觉与动效,不重复工程内容:
>
> - `docs/plans/spinner-unify-2026-07.md`(抽 Spinner + 收编 60+ 散装)
> - `docs/plans/generating-progress-2026-07.md`(生成中混合阶段进度)
>
> 2026-07-19 治理更新：工程骨架继续有效；本文只定义中性 fallback 与状态可读性，不再锁定所有业务域的 loading 皮肤。业务域可以通过 component/domain variant 与 token 覆盖颜色、材质和动效性格，但不得改变状态语义、reduced-motion 与可访问性契约。

## 0. 统一语言(一句话)

**loading 是一条线:不确定时它绕圈(spinner),确定时它前进(进度条)。**

同一条线的三条不变量,两个组件共守:

| 不变量 | 值                                                                                        |
| ------ | ----------------------------------------------------------------------------------------- |
| 颜色   | 共享组件默认 `currentColor` / 语义 token；域级 variant 可覆盖，但必须维持对比度与状态语义 |
| 线帽   | 圆头(spinner = Loader2 自带 round cap;进度框线 `stroke-linecap: round`)                   |
| 曲线   | 状态切换用 `--ease-standard`;持续运动用 `linear`(匀速 = 诚实,缓动留给「到位」的瞬间)      |

中性 fallback 的分层：spinner 是低注意力反馈，进度条是等待过程的主要状态。具体视觉性格由页面所属业务域决定；不得用装饰掩盖真实进度，也不得让域级表现破坏 reduced-motion。

---

## 1. Spinner 规格

### 1.1 形态

- 图形 = `Loader2`(lucide 270° 弧,工程骨架已定,不换)。
- `strokeWidth` 全档默认 2(lucide viewBox 单位,渲染粗细随尺寸等比:sm≈1.2px / md≈1.3px / lg=2px),**不按档调粗细** —— 等比即一致。

### 1.2 尺寸档(三档,收编映射)

| 档   | 尺寸 | class      | 语义                                     | 收编现状                                                  |
| ---- | ---- | ---------- | ---------------------------------------- | --------------------------------------------------------- |
| `sm` | 14px | `size-3.5` | 密排行内:chips、树行、卡片角标、紧凑按钮 | `size-3` / `size-3.5` → sm(12px 弧线低分屏发碎,统一升 14) |
| `md` | 16px | `size-4`   | **默认档**:按钮、菜单项、对话框行内      | `size-4`(现状主流)→ md                                    |
| `lg` | 24px | `size-6`   | 区块 / 页面级居中                        | `size-5` / `size-6` / `size-8` → lg                       |

- 默认值 = `md`。
- **页面级不再用 32px 大转圈**:lg(24px)+ 下方 `text-xs text-muted-foreground` 一行文案(「加载中…」i18n)。放大 spinner 只会更吵,存在感交给文字。
- 特殊定位(`mr-1.5` 等)照旧走 `className`,不进尺寸档。

### 1.3 颜色

| 场景                     | 颜色                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 按钮 / 行内(默认)        | `currentColor` —— 什么都不写,继承上下文文字色(primary 按钮里自然是 `primary-foreground`)                           |
| 独立居中(区块 / 页面 lg) | `text-muted-foreground`                                                                                            |
| 禁止                     | 任何彩色 spinner;在非 primary 表面上用 `text-primary` 抢焦点(现状散装里的 `text-primary` 收编时一律降回上两行规则) |

### 1.4 动效

- 旋转 = `animate-spin` 原样(1s linear),**不新造时长 token**。匀速旋转是全行业肌肉记忆,任何"更有气质"的转法都是噪音。
- **reduced-motion**:`motion-reduce:animate-none` 停转,弧口定格在 Loader2 默认方向,整体降到 70% opacity(`motion-reduce:opacity-70`)。"仍在进行"的信息由 `role="status"` + label 文本承担,不做替代动画。

### 1.5 a11y

工程骨架已定(`role="status"` + `aria-label` 默认「加载中」i18n),视觉侧无追加。

---

## 2. 生成中进度规格 —— 「裱框显影」(owner 2026-07-17 二次拍板:高级 UI,A+B 杂交)

**核心隐喻:进度 = 画框沿边描画,框闭合 = 作品完成。** 进度不再是外挂的顶部细线,而是画纸边框本身;接装帧语言「裱框」。中心大数字 + 框内底部参数行提供仪表信息密度。

> ⚠ 范围提示:相比 `generating-progress-2026-07.md` 里"只换进度条那一层",本设计把 `GenerationStatusChrome` **整体重构**(双 chip 删除、信息移到中心与参数行、进度改 SVG 框线);阶段算法 / 常量 / 组件入参骨架照用不变。

### 2.1 结构(生成占位,无旧图)

```
┌─ stage card(dashed 外框 + shimmer 画纸,现状保留)─┐
│  ╭──────── 进度框线(SVG,沿画纸边描画)────╮      │
│  │                                          │      │
│  │              47 %   ← 大数字             │      │
│  │             渲染中   ← 阶段词             │      │
│  │                                          │      │
│  │      12s · anima XL · 1:1  ← 参数行      │      │
│  ╰──────────────────────────────────────────╯      │
└─────────────────────────────────────────────────────┘
```

- **底轨**:画纸边缘 1px 静态圆角框,`stroke: border/60` —— 未描到的部分有轨道感。
- **进度框线**:SVG `<rect>` 与画纸同尺寸同圆角(art box `rounded-xl` → `rx=12`),`pathLength=100` + `stroke-dasharray: 100` + `stroke-dashoffset: 100 − p`;`stroke: primary/85`,`stroke-width: 2`,`stroke-linecap: round`。起点 = 左上角顶边,顺时针描画。
- **中心 chrome**(垂直居中列):
  - 大数字:整数 %,`text-4xl font-light tabular-nums text-foreground`,`%` 符号小一号 `text-muted-foreground`;随 tick 500ms 更新,**不做逐帧 count-up**(节拍本身已有推进感,逐帧滚动是噪音)。
  - 阶段词:`text-sm text-muted-foreground`,复用 `generatingOverlayStages.*`;换字 crossfade(旧字 120ms `--duration-fast` 出、新字 200ms `--duration-base` `--ease-standard` 入)。
- **参数行**(B 基因,框内底部居中):`text-2xs text-muted-foreground tabular-nums`,格式 `{elapsed}s · {模型显示名} · {比例}`;数据全部来自现有 state(elapsed 已有,aspectRatio 组件已读,模型名走现有显示名)。
- **删除**:原顶部 hairline 进度线、左上 stage chip、右上 elapsed chip、`studio-generation-dot`(信息已全部收进中心 + 参数行)。
- **保留**:`studio-reveal-shimmer` 画纸质感(弱化即可,不动实现);**scan 删**(占位态运动感由框线取代)。
- 窄比例(9:16)周长在竖边走得久属预期,大数字兜底进度感知,不做特殊处理。

### 2.2 推进动效

| 参数         | 值                                                   | 说明                                                           |
| ------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| 数值节拍     | 500ms(`PROGRESS_TICK_MS`,进 constants)               | JS 每 tick 重算进度,写 `stroke-dashoffset` + 数字              |
| 平滑         | `transition: stroke-dashoffset 600ms linear`         | 略长于节拍消台阶;linear —— 匀速描画不做假加速                  |
| 段内缓动     | easeOutQuad:`p = p0 + (p1−p0) × (1−(1−x)²)`          | 区间首尾相接(0-20-45-88),阶段切换零跳变                        |
| waiting 渐近 | `88 + 7 × (1 − e^(−(t−45)/40))`                      | 时间常数 40s,永不到 95                                         |
| waiting 呼吸 | 框线 opacity `0.85 ↔ 0.55`,2.6s ease-in-out infinite | 仅 waiting 段激活,框几乎不动时告知「还活着」;非 waiting 不呼吸 |

### 2.3 完成 / 失败

- **完成**:dashoffset → 0(`transition: stroke-dashoffset 260ms var(--ease-standard)`,此刻切掉 linear)框闭合 → 停 140ms → 框线 + 中心 chrome + 参数行整体 `opacity` 320ms(`--duration-slow`)淡出,与 `studio-generation-image-in`(360ms)交叠 —— 框裱好,画浮现。**不做闪光/发光**(anti-slop)。
- **失败**:框线无红色态、不闪烁 —— chrome 直接被现有 error 态替换。

### 2.4 重生成 overlay(有旧结果,image/video/audio 补齐)

- **image / video**:`bg-background/35 + backdrop-blur-[1px]` dim(现状)+ 进度框线描在媒体容器边缘(同一 SVG 方案)+ 中心大数字缩小档(`text-2xl`)+ 阶段词;**参数行省略**(旧图上少压字);scan 删。
- **audio**:容器矮 —— 框线描容器边缘 + 中心数字与阶段词,同上,无 scan(维持前版拍板)。

### 2.4b LoRA 生成台(`LoraWorkbench` 结果框,2026-07-18 补接)

Studio 三模态之外,LoRA 生成台的结果框(固定 1:1)也消费同一 `StudioGeneratingProgress`,不再用裸 `Spinner`:

- **无旧图(首次生成)**:`full` 变体 —— `studio-reveal-shimmer` 底 + 裱框 + 中心大数字 + 参数行`{elapsed}s · {底模 displayName} · {比例}`。
- **有旧图(重新生成)**:`compact` 变体 —— `bg-background/35` dim + 裱框描旧图边 + 缩小档数字,无参数行。
- **完成节拍**:与 `GenerationPreview` 同款「渲染期调整 state」(非 useEffect),`isGenerating→false` 且有结果无错误时置 `isCompletingGeneration`,播 close→hold→fade 后回落。
- 模型名取 `selectedBase.displayName`,比例取 LoRA 台自有 `aspectRatio` state;`cornerRadiusVar='--radius-xl'`。
- 按钮级 sm spinner(生成按钮内、库加载)保持不动。

### 2.5 真进度路径(`realProgress`:视频 / 训练)

同一形态零分叉:p = 真值直接驱动框线与数字,阶段词换真实状态文案(现有)。多镜 `StudioSceneProgress` 照旧不动。

### 2.6 a11y / reduced-motion

- 容器 `role="progressbar"` + `aria-valuenow`(整数 %)+ `aria-valuemin=0` / `aria-valuemax=100`,`aria-label` = 阶段词;中心大数字 `aria-hidden`(避免双读)。
- **reduced-motion**:框线无 transition,离散跳段末值(20 / 45 / 88 / 95,完成 100);数字照常离散更新;shimmer / waiting 呼吸 / crossfade 全停;完成闭合无动画,淡出保留(纯 opacity)。

---

## 3. 落地清单(Sonnet 对接两份工程骨架)

### constants(`src/constants/`,无 magic value)

```ts
SPINNER_SIZE = { sm: 'size-3.5', md: 'size-4', lg: 'size-6' } // 或 cva variants
GENERATION_STAGE_PROGRESS = [
  { key: 'preparing', startSec: 0, endSec: 2, startPct: 0, endPct: 20 },
  { key: 'connecting', startSec: 2, endSec: 8, startPct: 20, endPct: 45 },
  { key: 'rendering', startSec: 8, endSec: 45, startPct: 45, endPct: 88 },
]
WAITING_ASYMPTOTE = { basePct: 88, spanPct: 7, tauSeconds: 40 }
PROGRESS_TICK_MS = 500
```

### globals.css 新增(放在现有 `studio-generation-*` 块旁)

- `.studio-generation-frame`(SVG 进度框线):`transition: stroke-dashoffset 600ms linear`;完成态切 `260ms var(--ease-standard)`(class 切换)。
- `.studio-generation-frame-track`:1px 静态底轨框样式。
- `@keyframes studio-generation-waiting-breath`(opacity 0.85↔0.55,2.6s)+ 对应 class(应用于框线)。
- 阶段词 crossfade 的两个小 keyframes(120ms out / 200ms in)。
- 全部包 `@media (prefers-reduced-motion: no-preference)` 或用 `motion-reduce:` 剥离。

### 删除

- `.studio-generation-status-line` + `@keyframes studio-generation-status-sweep`(无限滑动)。
- `.studio-generation-scan` + `@keyframes studio-generation-scan`(运动感由框线取代)。
- `.studio-generation-dot` + `@keyframes studio-generation-dot`(chip 随重构删除)。

### 验收追加(在两份工程骨架验收之上)

- 三档 spinner 并排目检:弧粗细观感一致、颜色全部随上下文。
- 生成全程目检:框线从左上角顺时针连续描画,0→20→45→88 无跳变;中心数字 500ms 节拍更新;>45s 框线呼吸、数字渐近 95;完成 260ms 闭合 → 140ms → 整体淡出与画面浮现交叠。
- 三种 aspect ratio(1:1 / 16:9 / 9:16)目检框线圆角贴合、参数行不溢出。
- 重生成 overlay(image/video/audio)三处一致:框描媒体边缘 + 中心缩小档数字,无参数行。
- `prefers-reduced-motion` 下:spinner 静止 70% opacity;框线离散跳段末值;无任何持续动画。

## 拍板记录(owner 2026-07-17)

1. lg 档:**24px + 文案**,size-8 大转圈收编,页面级不再放大 spinner;spinner 整体走极简克制版。
2. 生成中 UI:**升级为高级 UI,「裱框显影 + 参数行」(A+B 杂交)** —— 框描边 = 进度 + 中心大数字 + 框内参数行;取代第一版"顶部纯净单线"方案(该版连同段界刻度讨论一并作废)。
