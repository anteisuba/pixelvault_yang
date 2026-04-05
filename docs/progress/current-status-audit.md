# 00. 当前项目体检

这份体检不是从零想象，而是基于你仓库里已经存在的代码来判断。

## 已经有的基础

- 已有 Web 技术栈：`Next.js 16 + React 19 + TypeScript + Prisma + PostgreSQL + Clerk + Cloudflare R2`。
- 已有图片生成主流程：`src/app/api/generate/route.ts` 已经能调用 Provider、上传 R2、写入数据库。
- 已有用户和积分基础：`src/services/user.service.ts`、`src/app/api/credits/route.ts`。
- 已有公开数据接口：`src/app/api/images/route.ts` 已经能返回公开作品列表。
- 已有模型配置中心：`src/constants/models.ts`。

## 现在还缺的关键层

- 缺真正的产品层：
  - 只有 `studio` 页面，缺个人作品库、公开画廊页面、Prompt 推荐入口。
- 缺可扩展的 Provider 层：
  - 现在 Provider 逻辑直接写在 `src/app/api/generate/route.ts` 里，后面接更多 API 会越来越难维护。
- 缺异步任务层：
  - 当前生成是同步请求，公开发布后更容易遇到超时、重试、重复扣费、失败难追踪的问题。
- 缺 Prompt 数据层：
  - 目前只有 `Generation.prompt`，还没有“推荐系统需要的结构化数据”。
- 缺风控和运营层：
  - 还没有速率限制、内容审核、错误监控、成本监控、后台运营入口。
- 缺商业化预留层：
  - 没有积分流水、套餐、充值、退款、对账这些后续一定会需要的数据结构。

## 我看到的具体问题

- `src/app/api/generate/route.ts` 同时负责鉴权、扣积分、调 Provider、上传文件、写数据库，职责太重。
- Gemini 相关逻辑现在调用的是 Google 的接口，但环境变量名称还是 `SILICONFLOW_API_KEY`，这会给后面维护带来混乱。
- `src/components/layout/Navbar.tsx` 还没有真正体现公开产品的信息架构，目前更像内部工具导航。
- `src/components/business/GenerateForm.tsx` 还偏 MVP，只有最基本的模型切换和 Prompt 输入。
- 项目根目录里同时存在 `components/` 和 `src/components/`，这类重复目录后面容易让人迷路。
- README 和部分中文文档存在编码/可读性问题，不利于后续协作和公开维护。

## 对当前阶段的判断

这不是一个“从零开始”的项目，而是一个“需要从功能雏形升级为产品底座”的项目。

## 先别急着做的事

- 先别做完整支付。
- 先别做原生手机 App。
- 先别接太多模型。
- 先别把用户的原始 Prompt 直接做成社区推荐。

## 现在最该做的事

- 统一产品定位和信息架构。
- 抽出 Provider 中间层。
- 把生成流程改造成“异步就绪”的架构。
- 为 Prompt 推荐和未来计费补好数据地基。
- 补上公开发布必需的风控、监控和运营能力。
