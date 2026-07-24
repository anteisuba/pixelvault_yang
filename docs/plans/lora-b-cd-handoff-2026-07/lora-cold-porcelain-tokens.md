# LoRA 域冷瓷灰白 token 建议（交工程侧落 `src/app/lora.css` · `.domain-lora` 作用域）

> 对应设计稿：`LoRA 装配台.dc.html` / `LoRA 装配台·移动端.dc.html` / `LoRA 域 Token 规格.dc.html`。
> 四轴定稿（2026-07-24）：冷瓷灰白 / 浮起纸面 / 石墨中性 / 柔顺连续。以下为细化 oklch 值。
> 红线复述：严格 `.domain-lora` 作用域；不改全局 `@theme`；不提升为全站默认。

## 1. 表面梯度（四级：page < well < panel < overlay）

| token            | 值                                 | 用途                                            |
| ---------------- | ---------------------------------- | ----------------------------------------------- |
| `--lora-page`    | `oklch(0.950 0.006 235)` ≈ #eaeef2 | 页面冷灰底                                      |
| `--lora-well`    | `oklch(0.935 0.007 235)`           | 凹槽：参数 well、结果图底、缩略底、segmented 槽 |
| `--lora-panel`   | `oklch(1 0 0)` #fff                | 浮起白面板（三栏、卡）                          |
| `--lora-overlay` | `oklch(1 0 0)` + shadow-modal      | modal / popover 浮层                            |
| `--lora-scrim`   | `oklch(0.29 0.022 255 / 0.38)`     | modal 遮罩                                      |

投影（极轻，蓝黑基 30,42,66）：

```
--lora-shadow-panel: 0 1px 2px rgba(30,42,66,.06), 0 6px 16px rgba(30,42,66,.10);
--lora-shadow-raise: 0 1px 3px rgba(30,42,66,.09);   /* 面板内抬升卡，配 1px hairline */
--lora-shadow-modal: 0 2px 8px rgba(30,42,66,.08), 0 16px 48px rgba(30,42,66,.18);
```

规则：白面板本体**不描边**（亮度差表纵深）；面板内的抬升卡（LoRA 栈项、底模卡、变更卡）用 hairline + raise；虚线边只给「添加」类空态入口。

## 2. 发丝线

| token                    | 值                                 | 用途                            |
| ------------------------ | ---------------------------------- | ------------------------------- |
| `--lora-hairline`        | `oklch(0.915 0.008 240)` ≈ #dde2e9 | 卡边、区块分隔                  |
| `--lora-hairline-strong` | `oklch(0.875 0.01 240)`            | hover 边、虚线入口、开关 off 底 |

## 3. 文本与数值

| token          | 值                                 | 用途                    |
| -------------- | ---------------------------------- | ----------------------- |
| `--lora-ink`   | `oklch(0.29 0.022 255)` ≈ #1f2733  | 石板墨字：标题 / 主内容 |
| `--lora-ink-2` | `oklch(0.44 0.02 252)`             | 次级正文、mono 数值主档 |
| `--lora-muted` | `oklch(0.565 0.018 250)` ≈ #6c7684 | 区块标签、辅助说明      |
| `--lora-faint` | `oklch(0.70 0.012 245)`            | 占位、计量脚注          |

排版：正文 13px；Prompt 主编辑 15px/1.75；区块标签 10–11px + letter-spacing .06–.08em + 500；**数值一律 Geist Mono**（权重 ×0.80、尺寸、Steps、CFG、Seed、容量计数、触发词 chip）11.5–12px。

## 4. 功能语义色（仅两组；无彩强调，效果图是唯一饱和色源）

```
--lora-ok:        oklch(0.62 0.095 158);   /* ≈ #3f9a6a 兼容点 */
--lora-ok-tint:   oklch(0.965 0.02 155);   /* 配方新增词底 */
--lora-warn:      oklch(0.68 0.115 75);    /* ≈ #c9922e 不兼容·NSFW·错误 */
--lora-warn-ink:  oklch(0.5 0.1 70);       /* 琥珀文字（浅底可读档） */
--lora-warn-tint: oklch(0.972 0.025 85);   /* 警示条/不兼容卡底 */
--lora-warn-line: oklch(0.88 0.055 82);    /* 警示边 */
```

兼容性不得只靠颜色：圆点必须配 title 与警示行文字（域契约 §7）。错误也走琥珀，不引入红。

## 5. 主动作与交互态

```
--lora-primary:     oklch(0.335 0.022 252);  /* ≈ #2b3441 石墨 */
--lora-primary-hi:  oklch(0.29 0.022 252);   /* hover：只加深 */
--lora-primary-fg:  #fff;
--lora-ring:        0 0 0 2px <所在表面色>, 0 0 0 4px oklch(0.565 0.04 250 / 0.6);
```

- 出图键：全页唯一大石墨块，46px 高 / radius 11 / 600 / 字距 .12em，只出现一次（中栏输入区）。
- 次级动作 ghost：hairline 边 + ink 文字；hover 换 hairline-strong / well 底。
- 选中态（换底模卡）：1.5px graphite 边 + `0 0 0 3px oklch(0.335 0.022 252 / .12)`，不做填充反白。
- disabled：opacity .5，不换色。开关 on = graphite，off = hairline-strong。

## 6. 半径 · 间距 · 密度 · 动效

- radius：面板 14 / 浮层 16 / 卡 10–12 / 控件 7–8 / chip 999（沿用全站 `--radius:10px` 基准 ±4）。
- spacing：面板 pad 14–20；三栏 gap 14；栈内 gap 8；chip 行 gap 6。
- 密度节奏：装配栏密（栈项 ~52px 行高、30px 缩略），结果监视疏（大图 + mono 元信息 5px 行距）。
- motion：220–280ms，`cubic-bezier(.22,1,.36,1)`；库 modal 从「＋添加」方向 transform-origin 长出、换底模 modal 从底模卡方向；结果 280ms 淡入；栈增删 220ms 原位滑入；`prefers-reduced-motion` 直切。

## 7. NSFW 浅底 gating（库 modal · 安全模式开关）

- 库 modal 顶部「安全模式」开关，默认开；沿用项目现有 NSFW gating 语义。
- 开：网格内 NSFW 封面降档显示（blur 14px + well 66% 压暗）+ 琥珀 NSFW 角标；进详情（inspector）可逐个揭示原图。
- 关：封面直接显示，不模糊；保留琥珀 NSFW 角标以示语义。
- 琥珀只作标识，不作大面积底，不裸露。

## 8. 语义脊柱映射（提槽不提皮）

| 全站语义槽                           | `.domain-lora` 值                 |
| ------------------------------------ | --------------------------------- |
| `--background`                       | `--lora-page`                     |
| `--card` / `--popover`               | `--lora-panel` / `--lora-overlay` |
| `--muted`                            | `--lora-well`                     |
| `--foreground`                       | `--lora-ink`                      |
| `--muted-foreground`                 | `--lora-muted`                    |
| `--border` / `--input`               | `--lora-hairline`                 |
| `--ring`                             | `oklch(0.565 0.04 250 / 0.6)`     |
| `--primary` / `--primary-foreground` | `--lora-primary` / #fff           |
| 半径梯度                             | 沿用全站 `--radius` 基准          |

不要提取/套用：全站 `ui/` 组件默认（深色）皮肤、其它域（Canvas/Studio/Assets）域级 token。
