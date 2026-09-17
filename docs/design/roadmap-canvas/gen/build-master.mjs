// Page 7 (改进进度表) + Page 8 (语音方案 · 草案)
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
`
const page = (title, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap">
  <style>${STYLE}</style>
</helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">
${body}
</div>
</x-dc>
</body>
</html>
`
const header = (eyebrow, title, sub) => `<div style="margin-bottom:24px;max-width:1100px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(eyebrow)}</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows, render = {}) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${render[i] ? render[i](c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`


const LINE2 = '#e5e5e5'
const tag = (t, c) => `<span style="display:inline-flex;align-items:center;white-space:nowrap;${MONO}font-size:10.5px;padding:2px 8px;border-radius:999px;border:1px solid ${c};color:${c}">${esc(t)}</span>`
const K = { '需设计': '#7c3aed', '需 spec': AMBER, '纯代码': GREEN, '待 owner': RED, '远期': MUTED, '已完成': FG }
const kt = (k) => tag(k, K[k] || MUTED)
const T = (cols, rows, ri) => `<div style="overflow:hidden;border:1px solid ${LINE2};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${ri && ri[i] ? ri[i](c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

// ═══════════ 总清单 ═══════════
const COLS = ['进度表 #', '要改什么', '类别', '需要具体设计的是什么（到这一步才画）', '前置']
const RI = { 2: kt }
const MASTER = header('PixelVault · 总清单 · 2026-09-17', '所有需要改的事 · 按类别分，标出哪些要先设计', '把第 7 页 59 条按「要不要先出设计」重新分组。规则：需设计 = 有用户看得见的新画面或新交互，必须走 反问 → 思维导图 → UI 设计 → 通过 → 代码；需 spec = 数据 / 接口契约先写、无新画面；纯代码 = 直接改；待 owner = 差一句拍板；远期 = 方向成立不排期。语音（29 · 48–51）按 owner 要求整体后置，豆包与自托管 TTS 都未定。') +
  `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">${Object.keys(K).map(kt).join('')}</div>` +
  sec('一 · 基础：美术与 UI 语言（所有组件的前置，先于任何单个组件）') +
  T(COLS, [
    ['新', '美术方向与图标体系', '已定', 'D1 ④ 通过；D1b：Phosphor 底子 · 抽象几何业务图标 · 黑白；品牌标 ANTI owner 另开 chat（参考 updream / libtv / 即梦，Grok bot 式角色感）', '—'],
    ['新', 'UI 与交互全清单（现有每个组件的交互 / 状态 / 手机形态）', '纯代码', '只读盘点，正在生成（Explore 子代理），落第 10 页；后续每个组件的优化建议挂在它上面', '—'],
    ['32 · 33', '皮肤脊柱：模态色一套 token · 等宽字只用于数值 / 代码 · 字号档收成一张表 · 灰底白卡推到画廊 / 素材库 · 状态色三档 · 空态大标题槽 · motion 语法合一', '需设计', 'token 表与用法规则（不是页面）：色 / 字 / 圆角 / 阴影 / 动效四张表', '美术方向'],
  ], RI) +
  sec('二 · 共享组件（第 5 页已有方向，落码前每个出实际尺寸三态画板）') +
  T(COLS, [
    ['10', '模型选择器统一：方向 A + 渠道方案 ①', '需设计', '行结构（名 · 第二行状态 / 专属能力 · 价）· 最近 / 搜索 · 渠道段 · 缺 key 行 · 手机 Sheet 形态 · 三态（默认 / hover / 缺 key）', '美术方向'],
    ['11', '能力驱动表单：通用区 + 模型专属 chip 行', '需设计', '专属 chip 行长什么样、切模型时的过渡与「已切到 X」提示、五家模型各一版专属行示例', '10'],
    ['12', '规格 chip 合成一颗', '需设计', 'chip 文案格式 · 三段弹层 · 更多折叠 · 灰显档位 hover · 手机 Sheet', '11'],
    ['13', 'API key 门 + /settings 页', '需设计', '面 1 弹层（一把 key）· /settings 整页（key · 额度 · 偏好 · 助手人设 · 记忆总览）· 侧栏 / 胶囊入口', '10'],
    ['14', '顶栏胶囊两态', '需设计', '首页浮岛 vs 应用内右上小胶囊 · 收成头像的动效 · 内含项排序', '13'],
    ['15', '参考素材入口一个弹层 + 「还在库里」chip', '需设计', 'tab 结构（上传 · 素材库[含最近] · 粘贴 / 链接 · 画布内）· chip 库图标与 hover · 原件已删态', '20'],
    ['16', '任务条（五态）', '需设计', '四种皮：画布节点 · 工作台 · Runner 冷启动 · 3D；每态文案与取消位置', '美术方向'],
    ['17', '动作注册表 + 结果去向菜单', '需设计', '三处菜单（画布 ⋯ / 右键 · 工作台结果卡四主动作 · 素材详情 ⋯）按媒体裁剪的完整词表与排序，含「转白模」「加入剪辑台」', '35 卡片总线（部分动作依赖）'],
    ['18', '命令入口改右键 / 双击', '需设计', '画布空白右键 = 添加节点列表 · 节点右键 = 去向菜单 · 工作台右键 · ⌘K 键盘版；列表视觉', '17'],
    ['19', '列表页页头 + 素材库文件夹', '需设计', '页头组件（标题 · 计数 · 分面 · 排序 · 密度）· 文件夹条 / 树 / 拖动移动 / 空文件夹态', '美术方向'],
    ['20', '/assets/[id] 详情路由 + ?folder=', '纯代码', '—', '—'],
    ['52', '空态与首次引导卡', '需设计', '工作台 / 画布 / 素材库 / 卡片页四种空态 + 新用户「先配 key」引导', '13 · 19'],
    ['54', '卡片选择器统一', '需设计', '角色 / 风格 / 背景 → 参考槽 的一份选择器；与 35 的 referenceSlots 对应', '35'],
    ['55', '移动端 composer + 参数抽屉统一 · 助手手机半屏', '需设计', '手机四个工作台同一 composer；抽屉层级；助手 Sheet', '12 · 22'],
  ], RI) +
  sec('三 · 助手（画布为基线）') +
  T(COLS, [
    ['21', '宿主 op 表：工作台 / LoRA / 配音间', '需 spec', 'op 表是契约不是画面；回执卡 / 确认卡沿用画布现有样式', '—'],
    ['22', '助手一张脸：右侧 dock 可收成按钮，四宿主同形态', '需设计', 'dock 收 / 展两态 · 四宿主差异区（只在内容不在壳）· 手机 Sheet', '21'],
    ['23', '反问替代报错（三种情形出问题卡）', '纯代码', '问题卡已有样式', '—'],
    ['24', '剧本节点：大纲 → 分镜 → 连线生成', '需设计', '节点卡形态 · 大纲 / 分镜两态 · 「→ 节点」连线动作 · 角色槽自动装填的显示', '21 · 35'],
    ['56', '助手记忆：即时写 · 总览页（进 /settings）· 联网搜索重设计 · 页面分析', '需设计', '记忆总览页（可见可编 · 来源可溯）· 搜索结果卡 / 引用锚', '13 · 21'],
    ['57', '清理旧助手 · 拆 operator service · Prompts 收敛', '纯代码', '—', '21 落地后'],
    ['05b', 'Claude memory 工具', '待 owner → 并入 21', 'owner 已答：记忆是项目级能力 → 并进助手重做，不单独接 Anthropic 原生 tool-use', '21'],
  ], RI) +
  sec('四 · 卡片（第 6 页卡片设计 · 之前漏排的都在这）') +
  T(COLS, [
    ['27', '角色卡字段迁移：voiceCardId · 参考图 role · 人设（行为写法）· 说话方式 · allowedStyleRange · provenance / version', '需 spec', '—', '—'],
    ['35', '卡片总线：referenceSlots{role, url, cardId} · 角色卡 → 任何节点自动装填', '需 spec', '—', '27'],
    ['新 · 卡 1', '建卡向导：主图（均匀光 · 中性表情）→ 自动补 front / side / back → 绑音色 → 精修 → 一致性检查 → STABLE', '需设计', '向导步骤条 · 每步画面 · 一致性检查结果如何呈现 · 从素材 / 剧本一键抽角色的入口', '27 · 35'],
    ['新 · 卡 2', '卡片详情页重排：文字 / 图片 / 声音 / 风格 四锚 + 状态（DRAFT / STABLE）+ 用途矩阵（哪些模型吃哪张图）', '需设计', '详情页布局 · 四锚区块 · 用途矩阵表格 · 编辑态', '27'],
    ['新 · 卡 3', '风格卡：改写不追加 · 风格图 role:style · 与角色卡的冲突护栏提示', '需设计', '风格卡卡面 · 冲突提示样式', '27'],
    ['新 · 卡 4', '场景 / 背景卡升级为可 @ 引用实体（参考槽 + 名字 + 时间 / 天气变体）', '需 spec → 需设计', '变体切换控件 · 卡面', '35'],
    ['新 · 卡 5', '卡片在生成时代表卡说话：编译成各 provider 参考槽 + @名字 + 音色；画廊 / 素材卡上的「来自哪张卡」标记', '需 spec', '—', '35'],
    ['31', '画廊卡片减负：静态只留媒体 + 时长', '需设计', '卡面三态（静态 / hover / 长按）', '美术方向'],
  ], RI) +
  sec('五 · 画布 / 视频 / 图片能力包') +
  T(COLS, [
    ['36', '审阅网格（包 6）', '需设计', '多镜并排 · 打分 · 选优回节点 的画面', '—'],
    ['37', '剪辑台一期：拼接 / 转场 / 字幕 / 导出', '需 spec → 需设计', '剪辑台 UI 已有 EditDesk，缺转场 / 字幕两块的控件', '—'],
    ['28 · 38', 'Kling O3 v2v edit 端点 → 「转白模」「改这段」动作', '纯代码 + 17', '动作进去向菜单，无新画面', '17'],
    ['39', 'Enhance 域落地（Topaz / SeedVR2）挂视频节点', '需 spec', '—', '—'],
    ['40', '反推接画布 · 项目级上下文卡', '需设计', '反推面板在画布的位置 · 上下文卡的卡面与「隐式输入」提示', '21'],
    ['42', '编辑线三分区重整（像素级 / 指令级 / 结构级）', '需设计', '编辑器入口重排 · 三分区 tab · 每工具的参数面', '17 · 美术方向'],
    ['43', 'StyleCard 资产化 · 参考图直连素材库 G1', '需 spec', 'G1 由 15 解掉', '15 · 27'],
    ['44', 'tag 模型专属输入面（NAI 质量标签 / UC / 权重语法）', '需设计', '就是 11 的 NAI 专属 chip 行', '11'],
    ['25 · 26', 'FLUX.2 max · Seedream 图层 / 组图 · NAI inpaint · PixAI', '纯代码', '字段挂 11 的专属行', '11'],
    ['45', 'LoRA：Z-Image Turbo 插槽 + 护栏重做', '需 spec', '—', '—'],
    ['34', 'LoRA 工作台 3188 行拆 Train 向导页', '需设计', 'Train 向导页步骤与画面', '美术方向'],
    ['46', '风格迁移', '需设计', '并入 42：编辑器「不框 + 整体一句话」= 新建 style-transfer 动作走整图指令编辑端点', '42'],
    ['47', 'Arena 删除 · Illustrious XL / FLUX LoRA 退役', '已完成', 'e8d4d551 · eaf3a88d；三张 Arena 表待 owner drop', '—'],
    ['41', '3D 机位作镜头控制', '远期', '—', '—'],
  ], RI) +
  sec('六 · 首页与旅程') +
  T(COLS, [
    ['30 · 31', '首页视觉滚动 B（scrub）· 功能卡整卡可点 · hover / 按压态 · <900px 与手机', '需设计', 'B 方案的段落结构、scrub 状态机的关键帧、目录进度；营销域可自由用 GSAP、不受 token 约束（demo 例外）', '美术方向'],
    ['53', '「继续上次项目」直落 · 发布后回画廊链', '纯代码', '—', '—'],
    ['58', '真实付费 smoke', '已完成', 'owner 已自跑', '—'],
  ], RI) +
  sec('七 · 语音（整体后置 · 豆包与自托管 TTS 未定）') +
  T(COLS, [
    ['29 · 48–51', '豆包 2.0 / Qwen3-TTS / 人声提取 / 情绪导演 / 播客拼接 / 音频编辑 / 造音色', '远期', '方案在第 8 页，等 owner 定供应商后再排', '—'],
  ], RI)

// ═══════════ 设计流程 ═══════════
const step = (n, t, d) => `<div style="flex:1;min-width:150px;padding:12px 14px;border:1px solid ${LINE2};border-radius:10px;background:#fff"><div style="${MONO}font-size:11px;color:${MUTED}">${esc(n)}</div><div style="font-size:14px;font-weight:600;margin-top:4px">${esc(t)}</div><div style="font-size:12px;line-height:1.55;color:#525252;margin-top:6px">${esc(d)}</div></div>`
const PROCESS = header('PixelVault · 设计流程 · 2026-09-17', '每个「需设计」项都走这五步 · 全部通过才改代码', 'owner 定的流程。我把它写死在这里，之后每一项的设计都在画布上按这五步留痕：反问卡 → 思维导图板 → UI 画板（三方向 / 三态 / 手机）→ 通过标记 → 才派子代理改代码。') +
  `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">${[
    step('① 反问', '确定设计思路', '我先问、你答。问题只问会改变画面的分岔，每次 ≤5 个，用选项而不是开放题。答案记在该项的「决策」块里。'),
    step('② 思维导图', '把思路画成树', '目标 → 用户 → 场景 → 结构 → 状态 → 例外。每个叶子都能对应到画板上的一块；你在树上批注，我改。'),
    step('③ 确认', '树上没有红点', '你说「可以」我才动 UI；有分歧的叶子回到 ①。'),
    step('④ UI 设计', '实际尺寸画板', '三方向并排（demo 例外，不受 token 约束）→ 你选 → 该方向出三态 + 手机 + 空 / 错 / 加载态。'),
    step('⑤ 通过 → 代码', '对稿验收', '全部画板通过后才派子代理；提交前对稿，偏差不清零不提交（已有规则）。'),
  ].join('')}</div>` +
  sec('设计队列 · 建议顺序', '基础先于组件，组件先于页面；每次只开一项') +
  T(['序', '项', '为什么排这里', '① 反问 我会问什么（预告）'], [
    ['D1', '美术方向与图标体系（新）+ 皮肤脊柱（32 · 33）', '所有组件的底色；先定它，后面每块画板才不用返工', '图标：线性 / 双色 / 填充？线宽 1.5 还是 2？圆角 R 与卡片 R 是否同一套？材质：磨砂玻璃用在哪几层？模态色保留几种？插画：要不要有角色化的空态插画？'],
    ['D2', '模型选择器（10）+ 能力驱动表单（11）+ 规格 chip（12）', '一条链，出图前的三件事；工作台与画布同时受益', '第二行放状态还是放专属能力？渠道段常驻还是折叠？规格 chip 里价格显不显？手机上 Sheet 还是全屏？'],
    ['D3', 'API key 门 + /settings（13）+ 胶囊（14）', 'D2 的缺 key 行要有去处', '/settings 是整页还是右侧大抽屉？记忆总览放这里还是助手里？胶囊里额度用数字还是环？'],
    ['D4', '结果去向菜单 + 右键（17 · 18）+ 任务条（16）', '生成后的两件事：等 与 去哪', '主动作四枚固定还是按媒体变？右键与 ⋯ 词表完全一致？任务条失败态给重试还是给原因？'],
    ['D5', '参考素材入口（15）+ 列表页头 + 文件夹（19）+ 空态（52）', '素材层', '最近使用段放第一屏几张？文件夹树常驻还是折叠？空态要不要插画？'],
    ['D6', '卡片：建卡向导 + 详情页 + 风格卡 + 场景卡（卡 1–4）+ 卡片选择器（54）', '卡片是串四模态的钥匙，spec（27 · 35）先行', '向导几步？一致性检查失败怎么呈现？详情页四锚是 tab 还是长页？'],
    ['D7', '助手一张脸（22）+ 剧本节点（24）+ 记忆 / 搜索（56）+ 反推 / 上下文卡（40）', '依赖 21 的 op 表 spec', 'dock 收起时露不露最近一条？剧本节点在画布上是一张卡还是一组？'],
    ['D8', '编辑线三分区（42）+ tag 专属面（44）+ 审阅网格（36）+ 剪辑台补件（37）+ LoRA Train 向导（34）', '能力包的画面', '编辑器入口在结果卡还是独立页？审阅网格几列？'],
    ['D9', '首页 B + 移动端统一（30 · 31 · 55）', '营销域最后动，且可自由发挥', 'scrub 每段几个关键帧？手机功能卡播结果态还是静态？'],
  ]) +
  `<div style="margin-top:22px;padding:12px 14px;border:1px dashed ${AMBER};border-radius:10px;font-size:12.5px;line-height:1.6;color:#525252">现在停在 D1 的 ① 之前。你在回复里答完 D1 的反问，我就画 D1 的思维导图。</div>`

// ═══════════ 美术设计方法 ═══════════
const ART = header('PixelVault · 美术 · 怎么设计（不是设计本身）· 2026-09-17', '图标与视觉资产：用什么方法、什么工具、做成什么样', '按 owner 要求先想清楚做法。三条线：图标 · 材质与色 · 插画 / 空态。每条给做法、工具、产物形态、验收标准；样式本身留到 D1 通过反问后再画。') +
  sec('现状（读码）') +
  T(['项', '现状', '问题'], [
    ['图标', 'lucide-react 一套线性图标，271 个组件文件引用；brand-mark 自绘；无自定义图标集', '通用图标表达不了业务对象（节点类型 · 卡片四锚 · 模态 · 任务态），现在靠文字兜'],
    ['材质与色', 'globals.css @theme inline token；模态色在首页 / 卡片 / 方向图三套；灰底白卡脊柱落了四个工作台', '同一模态三种色；磨砂 / 阴影没有层级定义'],
    ['插画 / 空态', '首页有 GSAP 演示与作品墙；应用内空态基本是文字 + lucide 图标', '空态没有识别度；owner 审美偏 Apple HIG 通则（材质 / 动效做底色）'],
  ]) +
  sec('图标 · 做法') +
  T(['步骤', '做什么', '工具', '产物'], [
    ['1 · 清单', '从 UI 全清单（第 10 页）抽出所有用到图标的位置，分三类：通用动作（沿用 lucide）· 业务对象（自绘）· 状态（自绘 + 动效）', '表格', '图标需求表：名 · 语义 · 尺寸档 · 出现处'],
    ['2 · 规格', '定网格（24 基准 · 16 / 20 / 24 / 32 四档）· 线宽（与 lucide 一致 2px 或改 1.75）· 端点 / 拐角圆角 · 光学修正规则；与 lucide 混排必须看不出两家', '一页规范', '图标规范卡'],
    ['3 · 草图', '业务对象图标先出「一个概念三种画法」：节点四类（文 / 图 / 声 / 视）· 卡片四锚 · 任务五态 · 渠道 / key 状态', 'Claude Design 画布上直接画 SVG（矢量、可编辑、可批注）；复杂形用 Figma 再导 SVG', '每个概念三方向 SVG 并排'],
    ['4 · 定稿', '选一方向 → 全套 SVG → 统一 currentColor · viewBox 24 · 去 stroke 冗余 → 生成 React 组件（与 lucide 同签名）', 'svgo + 一段生成脚本进 src/components/icons/', 'Icon 组件集 + 图标一览画板'],
    ['5 · 验收', '16px 下可辨 · 深浅底都行 · 与 lucide 混排一致 · 三语环境下不依赖文字', '画布 1:1 与 2x 两档截图对照', '通过标记'],
  ]) +
  sec('材质与色 · 做法') +
  T(['步骤', '做什么', '工具', '产物'], [
    ['1', '把现有 token 全部列表（globals.css）并标出用处；模态色三套合一', '读码 + 表格', 'token 现状表'],
    ['2', '定层级：底 / 卡 / 浮层 / 弹层 四层各自的背景 · 边 · 阴影 · 磨砂强度（HIG 思路：材质表达层级，颜色只做语义）', '画布上四层叠放示意', '层级规范卡'],
    ['3', '状态色三档（成功 / 风险 / 失败）+ 模态色（图 / 声 / 视 / 文 四色）各给深浅两版；只在 token 里定，不写 hex 进文档', 'oklch 生成脚本', 'token 提案表 + 对照图'],
  ]) +
  sec('插画 / 空态 · 做法') +
  T(['步骤', '做什么', '工具', '产物'], [
    ['1', '决定要不要有「角色化」空态（与 PixelVault 的画风生成属性相符）还是几何抽象；这是 D1 反问之一', '反问', '决策'],
    ['2', '若角色化：用项目自己的角色卡 + 图片模型批量生成同风格空态图（吃自己的狗粮），统一底色透明 · 单色调 · 尺寸 320×240；若几何：SVG 手绘', 'PixelVault 自身 / 画布 SVG', '空态图集'],
    ['3', '空态槽（批注 39 / 54）统一规格：插画 + 一句话 + 一枚主动作', '组件规范', '空态组件'],
  ]) +
  sec('实时更新 · 其他 AI 接手', '') +
  T(['项', '现状', '要做的'], [
    ['画布实时', '这份画布是线上 artifact，我每次改完就重发（今天 v30）；你在画布上的批注与删改我每轮先 extract 再合并，不会覆盖', '保持'],
    ['源码可接手', '生成画板的脚本与调研稿现在都在我的临时目录，别的 AI 拿不到', '把 build-*.mjs · flow-data.mjs · canvas-live.json · research/*.md · 重生成说明 放进仓库 docs/design/roadmap-canvas/（约 40 个文件，纯文本）。要你点头（新目录）'],
    ['交互原型调试（你发的 yui540 那种）', '.dc.html 画板可以带脚本变成可点的原型，在画布里实机演示', 'D2 起共享组件的 UI 画板同时出一版可交互原型（点开选择器 / 切模型 / 切 chip），手机框预览'],
  ])

for (const [name, html] of [
  ['MasterList.dc.html', page('总清单', MASTER)],
  ['DesignProcess.dc.html', page('设计流程', PROCESS)],
  ['ArtDirection.dc.html', page('美术设计方法', ART)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
