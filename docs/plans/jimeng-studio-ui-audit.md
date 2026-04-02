# 即梦 UI / 操作流程研究与当前 Studio 简化方向

> Last updated: 2026-04-02
> Status: research complete, implementation pending

## 目的

这份文档只回答一个问题：

`为什么即梦看起来舒服，而我们现在的图片 / 视频创作流程开始变复杂？`

目标不是抄一层视觉皮肤，而是提炼：

- 即梦的舒服感来自哪些信息架构与交互顺序
- 当前仓库的 `studio` 复杂度主要堆积在哪里
- 后续应该先改什么，才能真正降复杂度

---

## 研究范围

### 外部参考

- 即梦官网 / 主入口：`https://jimeng.com/`
- 即梦创作入口：`https://jimeng.jianying.com/`

截至 `2026-04-02`，官网首页明确强调的能力结构是：

1. `视频生成`
2. `文生图 / 图生图`
3. `智能画布`
4. `探索`

官网文案重点不是模型名，而是收益表达：

- `灵感即刻成片`
- `流畅运镜，生动自然`
- `从首帧到尾帧，精准掌控`
- `中文创作，得心应手`
- `智能画布 多图AI融合`
- `创意涌动 灵感绽放`

这说明即梦把产品叙事建立在：

- 创作结果
- 可控性
- 语言友好
- 一站式编辑
- 社区灵感回流

而不是建立在 provider / adapter / route / technical model ID 上。

### 本地仓库研究对象

- `src/app/[locale]/(main)/studio/page.tsx`
- `src/components/business/StudioWorkspace.tsx`
- `src/components/business/ModelSelector.tsx`
- `src/components/business/VideoGenerateForm.tsx`
- `src/components/business/studio/StudioLeftColumn.tsx`
- `src/components/business/studio/StudioCenterColumn.tsx`
- `src/components/business/studio/StudioRightColumn.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/components/business/studio/StudioGenerateBar.tsx`
- `src/components/business/studio/StudioToolbarPanels.tsx`
- `src/components/business/studio/StudioApiRoutesSection.tsx`

---

## 结论先行

### 即梦的舒服感，主要不是“更少功能”

而是这 5 个设计决策：

1. 先让用户相信“我能做出东西”，再让用户理解“我能调什么”
2. 第一屏只保留少数关键动作，不把高级控制一次性摊开
3. 用收益语言解释能力，而不是用技术语言解释系统
4. 把创作、编辑、灵感获取串成一条连续路径，而不是分散成孤立模块
5. 视觉中心永远明确，用户能在 2 秒内看出当前主任务

### 当前仓库的复杂感，主要不是“功能太多”

而是这 4 个结构问题：

1. 图片模式和视频模式用了两套完全不同的工作区心智模型
2. 过多“配置型入口”出现在创作动作之前
3. 模型 / 路由 / 卡片 / 高级设置都具有接近的视觉权重
4. 历史、预览、灵感、管理信息没有被清楚分层

---

## 即梦到底哪里值得学

## 1. 结果优先，而不是参数优先

即梦首页的第一反应是：

- 我可以做视频
- 我可以做图片
- 我可以把首帧尾帧控住
- 我可以直接开始创作

而不是：

- 我可以选多少模型
- 我可以配置多少 provider
- 我可以绑定多少 route

这类设计会让用户把注意力放在“创作结果”上，而不是“系统结构”上。

### 对我们意味着什么

当前 `studio` 的第一优先级不应该是让用户看到更多设置位。
第一优先级应该是让用户立即进入：

- 选一个起步方式
- 写下想法
- 看结果会出现在哪里

## 2. 渐进暴露复杂度

即梦并不简单，它有首尾帧、智能画布、多图融合、编辑能力、社区入口。
但它没有把这些东西在第一屏平均展开。

它的策略是：

- 第一层：开始创作
- 第二层：增强控制
- 第三层：探索高级能力

### 对我们意味着什么

现在本地 `studio` 已经有：

- project selector
- quick route selector
- image / video mode switch
- quick / card workflow switch
- API route 管理
- model selector
- prompt enhancer
- reverse engineer
- advanced settings
- reference image
- Civitai token
- history
- preview

这些都是合理能力，但当它们同时接近首屏、同时拥有相似权重时，用户会觉得“每一步都要先做决定”。

## 3. 收益化文案

即梦强调的是：

- 流畅运镜
- 首尾帧可控
- 中文创作友好
- 多图层精细控制

它在卖“创作收益”，不是在卖“接口拼装”。

### 对我们意味着什么

当前仓库里，很多重要结构仍然偏工具心智：

- `saved route`
- `provider`
- `free quota`
- `advanced settings`
- `API key`

这些不是不该出现，而是不应成为主叙事。
主叙事应该是：

- 适合做什么
- 为什么选这个模型
- 结果会偏什么风格
- 下一步可以怎么继续创作

## 4. 创作和探索是一条链路

即梦把 `探索` 和 `创作同款` 放在同一生态里。
这会让“看别人的作品”直接变成“开始自己的创作”。

### 对我们意味着什么

当前仓库的 `HistoryPanel` 很像个人历史仓库，但不太像创作灵感层。

后续更合理的拆法是：

- `我的历史`
- `推荐起步`
- `最近成功配置`
- `灵感模板 / 创作同款`

而不是把所有过去结果都压成一个统一的“历史记录”概念。

---

## 当前 Studio 为什么开始变复杂

## 1. 图片模式和视频模式的结构断裂

当前 `StudioWorkspace` 的结构是：

- 图片模式：三栏工作区
- 视频模式：`StudioModeSelector + StudioApiRoutesSection + VideoGenerateForm + HistoryPanel`

这会带来一个核心问题：

`同一个 studio，切到 video 后，整套空间组织突然换了一套逻辑`

图片模式是：

- 左栏配置
- 中间创作
- 右栏预览 / 历史

视频模式是：

- 顶部堆叠
- 一张长表单
- 下面再看结果
- 再下面再看历史

这会造成用户在 image/video 之间来回切换时失去熟悉感。

## 2. 配置入口太靠前

当前 image mode 左栏包含：

- project
- quick route
- image / video
- quick / card
- model selector / card section

video mode 首屏又包含：

- model selector
- long video toggle
- duration
- aspect ratio
- resolution
- reference image
- prompt
- advanced settings
- submit

这意味着用户在真正开始生成前，往往要先处理多个选择题。

## 3. 视觉中心不够稳定

### 图片模式

当前图片模式的中心更接近“编辑工作台”，而不是“创作主舞台”。

问题不在三栏，而在中间区域现在是：

- prompt area
- generate bar
- toolbar panels

它是功能完整的，但“结果会出现在哪里”和“现在该做什么”不够强。

### 视频模式

视频模式更明显：

- 表单比结果更强
- 结果只在提交之后出现在页面下部
- 历史和当前结果没有明确主次

所以用户会感到视频模式像“填报表”，不像“创作影片”。

## 4. ModelSelector 太像模型数据库浏览器

`ModelSelector` 当前已经很强：

- 支持 style / provider 分组
- 支持搜索
- 支持 free / saved route 标记
- 支持显示 provider 与请求成本

但它默认的心智是：

`我要先理解模型系统，再开始创作`

这更像面向熟练用户的工具选择器，不像面向创作起步的入口。

即梦更接近：

- 先给推荐起点
- 再给完整能力浏览

## 5. API route / key 入口权重过高

当前仓库是 BYOK 产品，`API route` 和 `API key` 当然重要。
但它们属于“运行机制”，不是“创作主角”。

如果这一层过早进入主视觉，会让整个工作台显得像：

- 开发者控制面板
- 多 provider 路由系统

而不是：

- 创作工具

## 6. 图片模式内部也有两层流程竞争

image mode 里同时存在：

- quick workflow
- card workflow

这两个模式都有合理性，但它们和 output type 叠在一起后，用户要先做两次模式判断：

1. 我要图片还是视频
2. 我要 quick 还是 card

这会让第一步变成“决定工作流”，而不是“开始创作”。

---

## 对这个仓库最有价值的 UI 原则

## 原则 A：一个主任务，只能有一个主舞台

每种输出模式都必须在首屏只有一个最强中心：

- 图片模式：prompt + 当前画面预览
- 视频模式：prompt + 参考素材 + 当前视频预览

其他内容都应该是辅助层。

## 原则 B：首屏只放“起步必要项”

首屏应该保留：

- mode
- prompt
- 参考素材
- 最关键的模型入口
- 生成 CTA
- 当前结果 / 预览

以下内容不应该和首屏主任务抢注意力：

- API route 管理
- Civitai token
- 复杂高级参数
- 大量模型浏览逻辑
- 长历史列表

## 原则 C：配置不能消失，但必须退后

不是删功能，而是重新排序：

- 默认态：轻量
- 想深入时：展开
- 需要管理时：切换到管理层

## 原则 D：图片和视频应共享同一套工作区语法

用户应该感到：

- “我还在同一个工作台里”
- “只是当前输出物从 image 变成了 video”

而不是：

- “我切进了另一套产品”

## 原则 E：从“选模型”转向“选创作起点”

默认入口不应只是模型列表。
更好的起点是：

- 推荐模型
- 最近使用
- 场景化入口
  - 写实照片
  - 二次元角色
  - 快速预览
  - 视频片段

完整模型浏览仍然保留，但不该成为默认第一层。

---

## 推荐的结构重构方向

## 方向 1：统一成一个 Studio Shell

目标：

- image / video 共享同一套工作区布局
- 左侧负责轻量选择
- 中央负责创作
- 右侧负责当前结果与历史

视频模式不再单独退化成一张长表单。

## 方向 2：把 video mode 改成真正的创作工作区

当前 video mode 最大问题不是样式，而是结构。

建议改成：

- 顶部：轻量 mode + 关键模型入口
- 中部：大 prompt 区 + 参考素材区 + 单一主 CTA
- 右侧：当前结果预览
- 下层：高级参数抽屉 / 历史

而不是：

- 先长表单
- 再提交
- 再下滑看结果

## 方向 3：降权 API route

建议：

- API route 入口不再占据 video mode 主序列前列
- 保留入口，但放到：
  - secondary toolbar
  - settings drawer
  - model / route drawer

用户真正生成前，不需要先被系统配置打断。

## 方向 4：重新定义 ModelSelector 第一层

建议把 `ModelSelector` 分成两层：

### 第一层：策展化入口

- 推荐
- 最近使用
- 视频
- 写实
- 插画 / 二次元
- 低成本快速预览

### 第二层：完整浏览器

- provider 分组
- style 分组
- 搜索
- saved routes

这样既保留功能，又不让新用户第一眼掉进模型数据库。

## 方向 5：把历史与灵感拆开

建议后续不要再让 `HistoryPanel` 同时承担：

- 历史记录
- 当前选择
- 灵感来源
- 继续创作入口

更合理的是：

- `当前结果`
- `我的历史`
- `推荐起步 / 模板 / remix`

---

## 推荐的实施顺序

## P0：先统一信息架构，不急着做视觉大改

先做这些：

- 明确 image / video 的共同工作区骨架
- 确认哪些内容属于首屏，哪些属于展开层
- 确认 API route / token / advanced settings 的降权位置

## P1：先改 video mode，不先改 image mode 视觉

原因：

- 当前痛感最大的就是 video mode
- 它现在和 image mode 结构断裂最明显
- 只要先把 video mode 变成 workspace 而不是 form，复杂度会立刻下降

## P2：重做 ModelSelector 默认态

优先改“默认体验”，不是先改底层能力。

保留现有搜索 / provider / style 分组能力，但默认只露出：

- 推荐
- 最近
- 场景分类

## P3：把工具型入口放进设置层

包括：

- API route
- Civitai token
- 过深的 advanced settings

## P4：补灵感层

最后再加：

- prompt scaffold
- 推荐起步
- 最近成功配置
- remix / 创作同款

---

## 后续真正改页面时，建议先动哪些文件

### 第一批

- `src/components/business/StudioWorkspace.tsx`
- `src/components/business/VideoGenerateForm.tsx`
- `src/components/business/studio/StudioVideoMode.tsx`

目标：

- 先统一 video mode 的空间结构

### 第二批

- `src/components/business/ModelSelector.tsx`
- `src/components/business/studio/StudioLeftColumn.tsx`
- `src/components/business/studio/StudioApiRoutesSection.tsx`

目标：

- 降低配置型入口的首屏权重

### 第三批

- `src/components/business/studio/StudioCenterColumn.tsx`
- `src/components/business/studio/StudioPromptArea.tsx`
- `src/components/business/studio/StudioGenerateBar.tsx`
- `src/components/business/studio/StudioRightColumn.tsx`

目标：

- 强化创作主轴与结果主舞台

---

## 这轮研究的最终判断

### 可以明确学习的，不是“即梦长什么样”

而是：

- 它先讲结果
- 它先让人开始
- 它把高级功能藏在后面
- 它让探索直接回流到创作

### 当前仓库真正的问题，也不是“功能太多”

而是：

- 主任务不够聚焦
- 配置入口抢了创作入口的优先级
- 图片 / 视频工作区没有统一成同一种产品语言

所以后续最值得做的，不是先换视觉皮肤，而是先做：

`信息层级重构 + 工作区统一 + video mode 去表单化`

---

## 参考资料

- 即梦官网：<https://jimeng.com/>
- 即梦创作入口：<https://jimeng.jianying.com/>
- 本仓库 Studio 入口：`src/app/[locale]/(main)/studio/page.tsx`
- 本仓库工作区壳层：`src/components/business/StudioWorkspace.tsx`
