# PixelVault 品牌与设计治理 — brand-dna.md

> 状态：**现行规则（2026-07-19 owner 逐项确认）**。
> 本文只定义全局品牌脊柱、设计权力边界与品质底线；不提供全站统一的视觉造型答案。

## 品牌脊柱

PixelVault 是以创作控制为核心的个人 AI 创作工作台：生成、永久归档、资产复用，并允许用户选择性公开作品。

全站共同身份只由以下内容构成：

- PixelVault 名称、Logo 与产品叙事。
- 应用壳、全局导航位置与导航行为。
- 文案语气、术语、图标体系和反馈语义。
- 可访问性、响应式、状态真实性与交互品质。

PixelVault 的一致性来自“这是同一个产品、拥有同一套可靠行为”，不来自所有页面使用同一种颜色、卡片、圆角或材质。

## 设计权力分层

```text
全局 primitive
  原始尺度与可用值，不表达页面性格
        ↓
全局 semantic
  状态、文本、表面、边界、焦点等用途语义
        ↓
业务域 token / component variant
  Canvas、LoRA、Image、Video、Audio、Assets、Cards、Prompts、Gallery、Homepage 各自定义
        ↓
页面与关键组件 token
  服务具体工作流、信息层级和交互关系
```

| 层级             | 负责什么                                                                 | 不负责什么                     |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Primitive        | 原始色阶、尺寸、间距、字体尺度、时长等可用值                             | 不决定任何页面风格             |
| Semantic         | foreground、surface、border、focus、success、warning、destructive 等用途 | 不强制某个域使用同一种视觉表达 |
| Domain           | 一个业务域的字体表达、颜色、材质、几何、密度、布局、动效性格             | 不外溢为全站默认               |
| Page / Component | 页面结构、标志性组件、状态细节和局部覆盖                                 | 不反向绑架其他页面             |

域和页面 token 可以引用全局 primitive/semantic，也可以在明确作用域内覆盖。第二个业务域需要同一视觉模式时，先分别验证，再讨论是否提取；不能因为代码已经共享就强迫视觉共享。

## 共享组件契约

共同组件必须统一：

- 行为、API、状态模型和数据语义。
- 键盘操作、焦点管理、ARIA 和读屏反馈。
- 响应式切换、触屏策略、错误与加载处理。
- disabled、loading、error、selected 等状态优先级。

共同组件不统一：

- 页面颜色、字体表达、材质、圆角、阴影和密度。
- 业务域布局、信息层级和动效性格。
- card、pill、panel chrome 等外观形态。

共享组件可以提供中性 fallback，但必须允许业务域通过 variant、slot、className、data attribute 和 domain/component token 覆盖外观。原则是：**复用行为和可访问性，不强制复用皮肤。**

## 业务域视觉身份

以下业务域可以形成彼此明显不同的视觉语言：

- Canvas
- LoRA
- Studio Image
- Studio Video
- Studio Audio
- Assets
- Cards
- Prompts
- Gallery
- Homepage

同一业务域内部保持连贯；不同业务域不需要像同一个模板的换色版本。差异应首先来自工作流、结构、比例、信息层级和交互关系，不能只依赖换颜色。

## 全局不规定的内容

本文不规定：

- 全站深色或浅色。
- 固定主色、暖纸、炭墨或任何材质主题。
- 统一圆角阶梯、pill、卡片、面板 chrome。
- 全站统一字体性格或手写/衬线方案。
- 固定动效时长与装饰语言。
- “AI 产品必须避免/必须使用”的某种流行视觉。

渐变、玻璃、强色、无彩、拟物、极简等都不是全局禁令或答案。是否使用由域级工作流和已确认的设计方向决定，并接受可读性、性能和可访问性验证。

## 全局品质底线

- 键盘可达、焦点可见、ARIA 完整；状态不能只靠颜色表达。
- 正常文本对比度至少 4.5:1，大字和 UI 边界至少 3:1。
- fine pointer 紧凑控件目标不小于 32px、常规控件不小于 36px；coarse pointer/touch 不小于 44px；任何目标不得低于 WCAG 2.2 AA 24px，除非满足 spacing/equivalent 例外并验证。
- 尊重 `prefers-reduced-motion`；动效必须服务状态、连续性或反馈。
- ResponsiveOverlay 行为、触屏软键盘策略与 focus return 不得破坏。
- 新用户可见文案 en/ja/zh 同步。
- loading、empty、error、disabled、success 等状态真实、清楚且可恢复。
- 不支持的能力不渲染，不用死按钮、假数据或静默失败伪装完成。

## 域级设计确认流程

1. 明确业务域负责什么、不负责什么，以及最高频任务。
2. 明确页面对象、信息架构、关键状态和与其他域的边界。
3. 定义该域的设计性格、三个标志性视觉组件和明确禁区。
4. 提出三个结构明显不同的概念方向，不以换色充当差异。
5. owner 选择后只做一个关键界面切片。
6. 真机验证辨识度、易用性、响应式和交互态。
7. 确认后写入 `references/pages/<page>.md`，再进入完整实现。
8. 至少两个真实页面证明共享价值后，才反向提取视觉组件或 token。

当前代码、历史页面、`archive/` 和 UI inspiration 只提供实现事实或参考证据，不能自动成为新设计方向。

## 工程气质

1. **长期建模优先**：属性归属性，结构正确优先于局部省事。
2. **失败大声暴露**：冲突与失败明确呈现，不静默成功。
3. **代码即事实源**：代码定义现状；文档记录代码读不出的契约、决策和验证。
4. **复用成熟行为**：改之前先查 exports 与调用方；复用不等于复制皮肤。
5. **确定性交给代码，判断交给模型**：路由、状态、重试和转换写成可测试代码。
6. **完成必须可核对**：报告改动、验证、手动步骤和未验证边界。

## 历史方向

旧 v1 双面模式、“工坊宅邸”、“工作手记”、暖纸炭墨、颜料纪律、手写字体地基和统一圆角/pill 均已废止为视觉规则。历史证据保存在：

- `archive/design/direction.md`
- `archive/design/design-direction-worknotes-2026-07.md`
- `archive/design/font-handwriting-foundation-2026-07.md`
- `archive/design/ui-design-governance-reset-2026-07.md`（本轮治理迁移记录）

它们不得作为新 UI 的生成或验收依据，也不要求对当前运行代码立即返工。

## Source of Truth

- 品牌与设计治理：本文。
- 技术实现事实与 token/组件边界：`references/frontend.md`。
- UI 执行流程：`scenes/ui-page.md`、`scenes/ui-marketing.md`。
- UI 质量底线：`forbidden.md`、`checklists/ui.md`。

## Last Verified

- 2026-07-19 · owner 逐项确认：薄品牌脊柱、业务域视觉身份、共享行为不共享皮肤、旧视觉规则整体退役、逐域确认后实施。
