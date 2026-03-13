# 03. Prompt 数据与推荐系统设计

这是这个产品最容易做偏、但也最可能做出壁垒的一层。

## 核心原则

- 用户 Prompt 默认是私有资产。
- 社区推荐必须建立在明确同意之上。
- 推荐给别人的，优先是“模板”和“意图”，不是直接搬运原文。
- 分析数据和展示数据要分开存。

## 不建议的做法

- 不要把所有用户原始 Prompt 直接做成热门榜。
- 不要默认公开用户 Prompt。
- 不要把推荐系统建立在脏数据和未清洗文本上。

## 建议的数据拆分

### `generations`

用途：保留用户自己的真实生成记录。

建议保留：

- raw prompt
- selected model
- provider
- image url
- generation result

### `prompt_events`

用途：做统计、推荐、分析，不直接面向用户展示。

建议字段：

- userId
- generationId
- normalizedPrompt
- normalizedPromptHash
- language
- intentCategory
- styleTags
- subjectTags
- modelId
- providerId
- wasSuccessful
- consentToRecommend

### `prompt_templates`

用途：真正给用户展示和复用的 Prompt 资产库。

建议字段：

- title
- description
- category
- templateText
- variablesSchema
- exampleOutputUrl
- popularityScore
- sourceType

## 推荐系统的正确起点

第一阶段不要做复杂 AI 推荐，先做这三层就够了：

### 第一层：人工整理模板

- 风景图
- 二次元角色
- 商品图
- Logo/海报概念图
- 写实人像

这是最稳定、最容易把体验做好的方式。

### 第二层：基于同意数据做热门意图

不是显示“别人用了哪句 Prompt”，而是显示：

- 大家最近常生成什么类型
- 某一类图常用哪些结构
- 哪种模型更适合哪类需求

### 第三层：个人化推荐

根据用户自己的历史，推荐：

- 相似模板
- 常搭配的风格词
- 在另一模型上可尝试的 Prompt 版本

## 隐私和风控建议

- Gallery 发布和 Prompt 分享分成两个独立开关。
- 默认只公开图片，不公开完整 Prompt。
- 只有用户手动勾选，Prompt 才能参与社区推荐。
- 后台必须支持删除、隐藏、下架推荐模板。
- 敏感词、违规内容和版权风险要有基础审核策略。

## 这层和商业化的关系

Prompt 数据不只是推荐功能，它未来还能支持：

- 模板市场
- 高级 Prompt 包
- 行业场景包
- 个人历史搜索
- 结果复刻和变体生成

## 我对第一版的建议

- 先做“模板库 + 热门意图卡片”。
- 先不做“直接复用别人完整 Prompt”。
- 先不做复杂排序模型。
- 先把数据结构和同意机制设计对。
