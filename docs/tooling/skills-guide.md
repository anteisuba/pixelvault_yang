# Claude Code Skills & Plugins 使用指南

安装日期：2026-03-27

---

## 目录

1. [gstack](#1-gstack) — AI 开发工厂（21+ skills）
2. [web-access](#2-web-access) — 智能联网操作
3. [claude-mem](#3-claude-mem) — 跨会话持久记忆
4. [ui-ux-pro-max](#4-ui-ux-pro-max) — UI/UX 设计智能
5. [obsidian-skills](#5-obsidian-skills) — Obsidian 集成

---

## 1. gstack

**类型：** Skill 集合 | **位置：** `~/.claude/skills/gstack/` | **来源：** [garrytan/gstack](https://github.com/garrytan/gstack)

gstack 是一个 AI 开发工厂，将 Claude 组织成 CEO、工程师、设计师、QA 等专业角色，系统性地完成从产品规划到上线的完整流程。

### 推荐工作流

```
/office-hours → /plan-ceo-review → /plan-eng-review → /plan-design-review
→ /design-consultation → 开发 → /review → /qa → /ship
```

### 核心 Skills

#### 规划类

| 命令 | 用途 |
|------|------|
| `/office-hours` | **从这里开始。** 六个逼问式问题重新定义你的产品，生成产品设计文档到 `~/.gstack/projects/` |
| `/plan-ceo-review` | CEO 视角审查计划，四种模式：扩展/选择性扩展/保持范围/缩减 |
| `/plan-eng-review` | 工程师视角：架构、数据流、边界情况、测试覆盖 |
| `/plan-design-review` | 设计视角：对每个设计维度评分 0-10，指出改进方向 |
| `/autoplan` | 一键运行 CEO + 设计 + 工程三重审查 |

#### 设计类

| 命令 | 用途 |
|------|------|
| `/design-consultation` | 从零建立完整设计系统，生成视觉规范文档和 HTML 预览页 |
| `/design-review` | 视觉 QA：找出间距/层级/一致性问题，原子提交修复，截图对比 |

#### 开发类

| 命令 | 用途 |
|------|------|
| `/review` | 代码审查，找出能通过 CI 但会在生产环境爆炸的 bug，自动修复明显问题 |
| `/investigate` | 系统性根因调试，铁律：没有根因分析不动代码 |
| `/qa <url>` | 用真实浏览器测试应用，找 bug，原子提交修复，再次验证 |
| `/qa-only <url>` | 同 `/qa` 但只生成 bug 报告，不修改代码 |
| `/cso` | OWASP Top 10 + STRIDE 威胁建模安全审查 |

#### 发布类

| 命令 | 用途 |
|------|------|
| `/ship` | 同步 main → 跑测试 → 审查 diff → push → 创建 PR |
| `/land-and-deploy` | 合并 PR → 等待 CI/CD → 验证生产环境健康 |
| `/document-release` | 更新所有项目文档以匹配刚发布的内容 |
| `/retro` | 团队周回顾，按人员拆分贡献，发布趋势分析 |

#### 浏览器类

| 命令 | 用途 |
|------|------|
| `/browse` | 真实 Chromium 浏览器，真实点击，截图，~100ms/命令 |
| `/setup-browser-cookies` | 从真实浏览器（Chrome/Arc/Edge）导入 cookies 到无头会话 |
| `$B connect` | 启动有界面 Chrome 供实时观察 |
| `$B handoff` | 遇到验证码或需要手动登录时切换到可见浏览器 |
| `$B resume` | 手动操作后恢复自动化，保持会话 |

#### 安全工具类

| 命令 | 用途 |
|------|------|
| `/careful` | 执行危险命令前警告（`rm -rf`、`DROP TABLE`、`force-push` 等） |
| `/freeze <dir>` | 限制文件编辑只在指定目录内，防止意外改动 |
| `/guard` | 同时启用 `/careful` + `/freeze`，最高安全模式 |
| `/unfreeze` | 解除 `/freeze` 的目录限制 |

#### 其他工具

| 命令 | 用途 |
|------|------|
| `/codex` | 调用 OpenAI Codex CLI 进行独立代码审查（三种模式：review/challenge/consult） |
| `/benchmark` | 测量页面加载时间、Core Web Vitals，前后对比 |
| `/canary` | 部署后监控控制台错误、性能回归 |
| `/gstack-upgrade` | 升级 gstack 到最新版 |

### 生成文件位置

- `~/.gstack/projects/{项目名}/` — office-hours 等产出的设计文档
- `docs/frontend/visual-design-system.md` — design-consultation 产出
- `~/.gstack/analytics/` — 使用统计

---

## 2. web-access

**类型：** Skill | **位置：** `~/.claude/skills/web-access/` | **来源：** [eze-is/web-access](https://github.com/eze-is/web-access)

所有联网操作的统一入口，自动选择最合适的工具（WebSearch / WebFetch / curl / Jina / CDP），支持真实浏览器自动化。

### 触发方式

直接用自然语言描述需求，skill 自动判断使用哪种工具：

```
帮我搜索 Next.js 15 的最新变更
读一下这个页面：https://example.com
去小红书搜索 xxx 的账号
同时调研这 5 个产品的官网，给我对比摘要
帮我在平台发一篇图文
```

### 六大能力

| 能力 | 说明 |
|------|------|
| **智能工具选择** | 按场景自动选 WebSearch / WebFetch / curl / Jina / CDP |
| **浏览器自动化** | 直连 Chrome 保持登录态，支持动态页面和交互操作 |
| **三种点击方式** | JS click / 真实鼠标事件 / 文件上传 |
| **并行处理** | 多目标任务分发到子 Agent，共享一个 CDP Proxy，Tab 隔离 |
| **域名经验积累** | 存储各域名的操作模式和已知平台特性 |
| **媒体提取** | 直接从 DOM 提取图片/视频，或截取视频任意时间帧 |

### CDP Proxy API（高级）

需要 Chrome 开启远程调试（`chrome://inspect/#remote-debugging`）：

```
/new?url=[URL]              创建新标签页
/screenshot?target=ID       截图
/click?target=ID            JS 点击
/clickAt?target=ID          真实鼠标点击
/scroll?target=ID&direction=bottom  滚动
/eval?target=ID             执行 JavaScript
/setFiles?target=ID         上传文件
/close?target=ID            关闭标签页
```

---

## 3. claude-mem

**类型：** Plugin | **来源：** [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

Claude Code 的跨会话持久记忆系统，通过生命周期钩子自动捕获上下文，语义化压缩存储，智能检索，约节省 10 倍 token。

### 安装确认

重启 Claude Code 后，plugin 自动激活，无需手动操作。

### 使用方式

完全自动运行，无需命令。也可以主动查询：

```
# 搜索历史记忆（三层检索模式）
search(query="authentication bug", type="bugfix", limit=10)

# 获取指定记忆详情
get_observations(ids=[123, 456])
```

### 隐私控制

用 `<private>` 标签包裹不想被记忆的内容：

```
<private>
这段内容不会被 claude-mem 存储
</private>
```

### Web 查看器

运行后可在浏览器实时查看记忆流：

```
http://localhost:37777
```

### 配置文件

`~/.claude-mem/settings.json`（首次运行自动生成）：

| 配置项 | 说明 |
|--------|------|
| `model` | AI 模型选择 |
| `port` | Worker 端口（默认 37777） |
| `dataDir` | 数据存储路径 |
| `logLevel` | 日志级别 |

**环境要求：** Node.js 18+、Claude Code 最新版、Bun（自动安装）

---

## 4. ui-ux-pro-max

**类型：** Plugin | **来源：** [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

AI 驱动的 UI/UX 设计智能，包含 67 种设计风格、161 个行业推理规则、161 套配色方案、57 组字体搭配。

### 触发方式

描述 UI 需求时自动激活：

```
构建一个 SaaS 产品的 Landing Page
创建医疗健康分析仪表板
设计带暗黑模式的个人作品集网站
制作电商移动端 App UI
构建金融科技银行 App（深色主题）
```

### 设计系统数据库

| 类别 | 数量 | 说明 |
|------|------|------|
| UI 风格 | 67 种 | Glassmorphism、Claymorphism、Brutalism、Cyberpunk、AI-Native 等 |
| 行业推理规则 | 161 条 | 按产品类别自动生成设计系统 |
| 配色方案 | 161 套 | 按行业匹配 |
| 字体搭配 | 57 组 | 含 Google Fonts 导入 |
| UX 指南 | 99 条 | 无障碍与最佳实践 |
| 技术栈 | 13 种 | React、Vue、Svelte、SwiftUI、Flutter、shadcn/ui 等 |

### 命令行工具（高级）

```bash
# 生成完整设计系统
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa" --design-system

# 按风格搜索
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "glassmorphism" --domain style

# 按技术栈搜索指南
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form validation" --stack react

# 生成并持久化设计系统
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "SaaS" --design-system --persist
```

---

## 5. obsidian-skills

**类型：** Plugin | **来源：** [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)

在 Claude Code 中操作 Obsidian vault 的专用技能集，支持 Obsidian Flavored Markdown、数据库文件、Canvas 可视化等。

### 包含的 Skills

| Skill | 功能 |
|-------|------|
| **obsidian-markdown** | 创建 Obsidian 风格 Markdown：wikilinks、embeds、callouts、properties |
| **obsidian-bases** | 管理 `.base` 数据库文件：视图、筛选、公式、汇总 |
| **json-canvas** | 编辑 Canvas 可视化文件：节点、边、分组、连接 |
| **obsidian-cli** | Vault 交互：插件开发、主题开发工作流 |
| **defuddle** | 从网页提取干净的 Markdown，同时大幅减少 token 消耗 |

### 使用方式

在涉及 Obsidian vault 的任务中自动激活，或直接描述需求：

```
在我的 vault 中创建一个新笔记，用 wikilink 连接到 [[项目规划]]
把这个网页内容提取成干净的 Markdown 保存到 vault
创建一个 Canvas 可视化，展示这些概念之间的关系
查询我的 .base 数据库，筛选所有状态为"进行中"的项目
```

---

## 快速参考

| 场景 | 使用 |
|------|------|
| 开始一个新产品/功能 | `/office-hours` |
| 审查代码变更 | `/review` |
| 测试 Web 应用 | `/qa <url>` |
| 建立设计系统 | `/design-consultation` |
| 搜索网页/自动化浏览器 | `web-access`（自然语言） |
| 查看历史对话上下文 | `claude-mem`（自动） |
| 生成 UI 组件 | `ui-ux-pro-max`（自然语言描述） |
| 操作 Obsidian vault | `obsidian-skills`（自然语言） |
| 发布上线 | `/ship` → `/land-and-deploy` |
| 生产环境安全操作 | `/guard` |
