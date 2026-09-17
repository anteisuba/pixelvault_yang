// Page 5 additions (task bar, result destinations) + page 6 (assistant / canvas / cards design trees).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
    .tree { display: flex; align-items: center; }
    .kids { display: flex; flex-direction: column; gap: 10px; position: relative; padding-left: 32px; }
    .kids::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1.5px solid #d4d4d4; }
    .br { display: flex; align-items: center; position: relative; }
    .br::before { content: ''; position: absolute; left: -33px; top: 50%; width: 33px; border-top: 1.5px solid #d4d4d4; z-index: 1; }
    .br:first-child::after, .br:last-child::after { content: ''; position: absolute; left: -34px; width: 5px; background: #fff; z-index: 0; }
    .br:first-child::after { top: 0; height: 50%; }
    .br:last-child::after { top: 50%; height: 50%; }
    .br:only-child::after { top: 0; height: 100%; }
    .tree > .br::before, .tree > .br::after { display: none; }
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
const header = (eyebrow, title, sub) => `<div style="margin-bottom:24px;max-width:980px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(eyebrow)}</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const legend = `<div style="display:flex;gap:16px;font-size:12px;color:${MUTED};margin-top:4px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;background:#f5f5f5"></span>已有</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${AMBER}"></span>部分 / 契约有实现待核</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${RED}"></span>缺，本设计新增</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG}"></span>你手绘里的项</span></div>`

// ── tree renderer ──
const dot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:8px;flex:none;vertical-align:1px"></span>`
const own = `<span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG};margin-right:8px;flex:none"></span>`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'sub') return `<div style="background:#fff;border:1px solid ${LINE};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:240px;flex:none">${esc(n.t)}</div>`
  if (n.k === 'chips') return `<div style="display:flex;flex-wrap:wrap;gap:6px;max-width:${n.w ?? 520}px;padding:8px 10px;background:#f5f5f5;border-radius:8px;flex:none">${n.items.map((c) => `<span style="${MONO}font-size:11.5px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid ${LINE};white-space:nowrap">${esc(c)}</span>`).join('')}</div>`
  const pre = n.s === 'gap' ? dot(RED) : n.s === 'partial' ? dot(AMBER) : ''
  const o = n.own ? own : ''
  const border = n.s === 'gap' ? `border:1px dashed ${RED}99;background:#fff;` : `background:#f5f5f5;`
  return `<div style="display:flex;align-items:baseline;${border}font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 460}px;flex:none">${o}${pre}<span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`

// ═══════════ 任务条 ═══════════
const stage = (t, on, done) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1"><div style="width:100%;height:4px;border-radius:2px;background:${done ? FG : on ? accent(292, 0.55, 0.13) : '#e5e5e5'}"></div><div style="font-size:11.5px;color:${on || done ? FG : MUTED};font-weight:${on ? 600 : 400}">${esc(t)}</div></div>`
const taskBar = (title, stages, right) => `<div style="display:flex;align-items:center;gap:14px;padding:10px 14px;background:#fff;border:1px solid ${LINE};border-radius:10px;width:560px"><div style="width:44px;height:44px;border-radius:8px;background:linear-gradient(135deg,#e6e6e6,#f4f4f4);flex:none"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="font-weight:600">${esc(title)}</span><span style="${MONO}font-size:11px;color:${MUTED}">${esc(right)}</span></div><div style="display:flex;gap:6px">${stages}</div></div><div style="${MONO}font-size:11px;padding:4px 8px;border-radius:999px;border:1px solid ${LINE};white-space:nowrap">取消</div></div>`
const frame = (inner) => `<div style="padding:22px;background:#f5f5f5;border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:12px">${inner}</div>`
const label = (t) => `<div style="${MONO}font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:6px">${esc(t)}</div>`
const cap = (t) => `<div style="font-size:12px;line-height:1.55;color:#525252;max-width:560px">${esc(t)}</div>`

const B_TASK = header('PixelVault · 共享组件 · 2026-09-17', '任务条 · 一个状态模型，四种皮', '生成中的反馈现在有五种表现（工作台进度环 / 画布裱框显影 / 视频队列条 / 3D 步骤条 / Runner 阶段词），取消入口位置不一。统一的是状态模型与文案，不是长相：卡上还是裱框显影，列表里是任务条。') +
  sec('状态模型', 'GenerationJobStatus 五态 + 阶段词') +
  table(['态', '用户看到', '可做', '来源'], [
    ['排队 QUEUED', '「排队中 · 第 N 位」或「等待 GPU」', '取消', 'job 创建 → worker 领单前'],
    ['冷启动（RUNNING 子阶段）', '「启动中 · 首次约 60–120s」+ 不确定进度', '取消', 'Runner 阶段词已接（b06968a2）；云端 provider 没有此阶段则跳过'],
    ['生成 RUNNING', '有真实进度 → 百分比 + 环 / 条；没有 → 45s 后呼吸态 + 估时文案', '取消', 'provider 回调 / 轮询；视频有真实进度就用真实的（§1.9）'],
    ['归档', '「保存到素材库…」', '—', '结果下载 → R2 → Generation 落库'],
    ['完成 COMPLETED', '描边收拢 → 停 → 内容缩放淡入；列表里条变绿一秒后消失', '去向菜单', ''],
    ['失败 FAILED', '原文 / 错误码 / 翻译键三层，持久化随项目（fe6d5930）', '重试 · 换渠道 · 复制错误', '失败原文保留在卡上直到下一次成功'],
    ['取消 CANCELLED', '「已取消 · 已完成的产物保留」', '重试', '取消终态停止轮询，迟到回包不复活（已定）'],
  ]) +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px">
    <div>${frame(label('皮 1 · 列表任务条（工作台队列 / 素材库上传队列 / 助手结果卡）') + taskBar('分镜 02 · 共伞 · Seedance 2.5', stage('排队', false, true) + stage('启动', false, true) + stage('生成 62%', true, false) + stage('归档', false, false), '约 40s · $0.47/s') + taskBar('LoRA 出图 · Anima DiT', stage('排队', false, true) + stage('冷启动 · 首次约 90s', true, false) + stage('生成', false, false) + stage('归档', false, false), 'Runner') + `<div style="display:flex;align-items:center;gap:14px;padding:10px 14px;background:#fff;border:1px dashed ${RED}99;border-radius:10px;width:560px"><div style="width:44px;height:44px;border-radius:8px;background:#f5f5f5;flex:none"></div><div style="flex:1;font-size:12.5px"><div style="font-weight:600">GPT Image 2.5 · 失败</div><div style="color:${RED};margin-top:2px">invalid_api_key · OpenAI 返回 401</div></div><div style="display:flex;gap:6px">${['重试', '换渠道', '复制错误'].map((t) => `<span style="${MONO}font-size:11px;padding:4px 8px;border-radius:999px;border:1px solid ${LINE}">${t}</span>`).join('')}</div></div>` + cap('四段分段条对应四态；有真实进度的段显示百分比，没有的段用不确定动画；右上估时与单价来自 capabilities / unit-prices；失败行用 status-risk 虚线边，三动作固定。'))}</div>
    <div>${frame(label('皮 2 · 卡上裱框显影（画布 / 工作台结果卡）') + `<div style="position:relative;width:300px;height:180px;border-radius:12px;background:linear-gradient(135deg,#ececec,#f7f7f7);border:3px solid ${accent(292, 0.55, 0.13)};border-right-color:#e5e5e5;border-bottom-color:#e5e5e5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px"><div style="font-size:28px;font-weight:600">62%</div><div style="font-size:12px;color:${MUTED}">生成中 · 约 40s</div></div>` + `<div style="display:flex;gap:8px;align-items:center;margin-top:6px"><div style="height:30px;padding:0 12px;border-radius:999px;background:#fff;border:1px solid ${LINE};display:flex;align-items:center;font-size:12px;color:${MUTED}">提示词栏收起变灰 · 取消</div></div>` + cap('沿卡边描边进度环 + 中心大百分比 + 阶段文案；矮卡（音频）走一条进度线。这是 node-canvas-v2 §1.9 已定的形态，工作台结果卡沿用同一份动画 token（GENERATION_COMPLETE_ANIMATION）。') + label('') + label('皮 3 · 全局角标（侧栏 / 顶栏）') + `<div style="display:flex;gap:8px;align-items:center"><div style="height:32px;padding:0 12px;border-radius:999px;background:${FG};color:#fff;display:flex;align-items:center;gap:8px;font-size:12px"><span style="width:8px;height:8px;border-radius:999px;background:${accent(292, 0.7, 0.13)};display:inline-block"></span>3 个任务进行中 · 1 失败</div></div>` + cap('跨页可见：切到别的页也知道后台在跑什么；点开是皮 1 的列表。'))}</div>
  </div>` +
  sec('契约') + table(['项', '约定'], [
    ['状态源', '一份 useGenerationTask（job 状态 + 阶段词 + 进度 + 估时 + 单价），三种皮只读它；助手 dock 的结果卡也读它'],
    ['估时', 'Runner：阶段词 + 首次冷启动提醒；云端：按模型 timeoutMs 与历史中位数给区间，宁可不给不给假数'],
    ['取消', '每态都有取消（归档除外），走服务端取消并保留已完成产物（29ea72a8 已定）'],
    ['失败', '三层文案（原文 / 错误码 / 翻译键）随项目持久化；「换渠道」直接打开模型选择器的渠道区（方案 ①）'],
    ['动效', '进度只动 transform / opacity；完成动画一份 token；reduced-motion 直接跳终态'],
    ['成本', '任务条右上显示本次估价，完成后换成实际扣费（有回调数据时）'],
  ])

// ═══════════ 结果去向菜单 ═══════════
const menu = (items) => `<div style="width:260px;background:#fff;border:1px solid ${LINE};border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:6px;display:flex;flex-direction:column;gap:1px">${items.map((it) => it === '—' ? `<div style="height:1px;background:${LINE};margin:4px 6px"></div>` : `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border-radius:8px;font-size:13px;${it.startsWith('·') ? `color:${MUTED};font-size:11px;${MONO}` : ''}"><span>${esc(it.replace(/^· /, ''))}</span>${it.includes('⌘') ? '' : ''}</div>`).join('')}</div>`
const B_DEST = header('PixelVault · 共享组件 · 2026-09-17', '结果去向菜单 · 一份动作注册表，按媒体与所在页裁剪', '同一张图在五个地方能做的事不一样：「存配方」只在两处有，「进画布」只有工作台有，「设为角色卡」只有画布有。目标：动作只定义一次（名字 · 图标 · 适用媒体 · 适用页 · 快捷键 · 副作用），每个页面从注册表取子集渲染成同一个菜单。') +
  sec('动作注册表 vs 五个表面', '✓ 今天有 · ○ 统一后有 · — 不适用') +
  table(['动作', '媒体', '工作台结果卡', '画布 ⋯ / 工具条', '素材详情', '画廊详情', '助手结果卡'], [
    ['编辑（重绘 / 替换 / 提取 / 去背景 / 超分）', '图', '✓ 就地', '✓ 全屏编辑器', '○ 深链画布编辑', '✓ 深链画布编辑', '○'],
    ['再来一张 / 变体（同参数换 seed）', '图 · 视频', '○（现靠重生成）', '○', '○ Remix', '—', '○'],
    ['保留与改变（局部锁定再生成）', '图', '✓', '○', '—', '—', '○'],
    ['生镜头 / 把这张动起来', '图', '○', '✓ 生镜头', '○', '—', '○'],
    ['续拍 / 抽帧', '视频', '—', '✓', '○', '—', '—'],
    ['进画布 · 附加到节点', '图 · 视频 · 音', '✓ handoff 横幅', '—', '○', '○', '○'],
    ['存为配方（提示词 + 模型 + 参数）', '图 · 视频', '✓', '○', '✓', '✓ 存为模板', '○'],
    ['设为角色卡 / 存为风格卡', '图', '○', '✓ 设为角色卡', '○', '—', '○'],
    ['设为音色 / 用这段', '音', '—', '✓', '○', '—', '—'],
    ['下载', '全部', '✓', '✓', '✓', '✓', '○'],
    ['发布到画廊 / 取消发布', '图 · 视频', '○', '—', '✓ 多选', '—', '—'],
    ['入项目 / 移到文件夹 · 收藏', '全部', '○', '—', '✓', '—', '○'],
    ['复制链接', '全部', '○', '—', '○（需 /assets/[id]）', '✓', '—'],
    ['来源 / 血缘（只读）', '全部', '○', '✓ 来源', '✓ 参数', '✓ 参数', '○ 证据'],
  ]) +
  `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:22px">
    <div>${frame(label('图片 · 工作台结果卡 ⋯') + menu(['编辑…', '再来一张', '保留与改变', '—', '生镜头 →', '附加到画布 →', '—', '存为配方', '设为角色卡', '存为风格卡', '—', '下载', '发布到画廊', '收藏 · 移到文件夹', '—', '· 已归档 · 查看来源']))}</div>
    <div>${frame(label('视频 · 画布卡 ⋯') + menu(['展开', '续拍', '抽帧 → 图片卡', '—', '再来一段', '加入剪辑台', '—', '存为配方', '下载', '—', '改名', '复制这张卡', '拆出当前版本', '—', '· 来源 · 生成 · Seedance 2.5 · BytePlus', '删除']))}</div>
    <div>${frame(label('音频 · 画布卡 ⋯ / 素材详情') + menu(['加语气', '裁剪', '转文字', '—', '连到镜头 →', '设为音色', '—', '下载', '移到文件夹', '—', '· 来源 · 用这段 · 配音间', '删除']) + cap('三张菜单共用同一注册表；分组顺序固定：生成后续 → 去向 → 资产化 → 文件 → 元信息 / 删除。主动作（工作台结果卡底部四枚）从同一表取前四。'))}</div>
  </div>` +
  sec('契约') + table(['项', '约定'], [
    ['注册表字段', 'id · 名 · 图标 · 适用媒体 · 适用表面 · 分组 · 快捷键 · 需要登录 / 需要写权限 · 副作用（跳页 / 弹层 / 就地）'],
    ['主动作四枚', '工作台结果卡底部固定：编辑 · 再来一张 · 生镜头（图）/ 续拍（视频）· 存为配方；其余进 ⋯'],
    ['深链形态', '进画布 / 生镜头 走 handoff（?canvasTool= / 节点 handoff），不再各页自写 URL'],
    ['归档提示', '结果自动入库，菜单末行只读显示「已归档 · 查看来源」，不做「入库」按钮（lora-generate 契约）'],
    ['素材详情路由', '复制链接依赖 /assets/[id]（UX 总结建议）；没有之前该项隐藏'],
    ['助手结果卡', '取子集：编辑 / 再来一张 / 存为配方 / 下载 / 进画布；「结果卡自动入库、去审核态」不变'],
  ])

// ═══════════ 助手设计 ═══════════
const ASSIST = {
  k: 'root', t: '助手',
  c: [
    { k: 'cat', t: '基线改成画布助手 · 为什么它体验更好（批注 30）', c: [
      { k: 'leaf', t: '① 结构化 op 而不是 30 个工具：画布助手只输出 JSON op（add_node / connect / set_prompt / set_model / set_params / attach_asset / generate / delete / plan_rerun_downstream …），客户端校验后落画布；工作台 Operator 让模型在 30 个工具里自选、一轮最多 8 步，会出「分析成功 → 仍要求分析 → 被拦 → 再确认」的循环（status.md 记过两次）', w: 560 },
      { k: 'leaf', t: '② 免费且可撤销的 op 自动落（NODE_ASSISTANT_AUTO_APPLY_OPS 8 条），只有花钱 / 破坏性的 generate / delete 才确认；工作台每 apply 一项一确认，来回多', w: 560 },
      { k: 'leaf', t: '③ 改动落在看得见的对象上：画布 op 直接变成节点出现 / 连线 / 参数变；工作台的改动落进表单，回执卡再复述一遍', w: 560 },
      { k: 'leaf', t: '④ 小服务、短提示：node-assistant.service 767 行 vs assistant-operator.service 8,975 行；画布提示词只描述画布状态 + op 表，不带几十个工具描述', w: 560 },
      { k: 'leaf', t: '⑤ 路由固定 Claude Fable 5.1（llm-capability.ts:71 / node-studio.ts:330）；工作台随用户选的文本模型走，Grok 高推理超时 / DeepSeek 空回复等都记在 status', w: 560 },
      { k: 'leaf', s: 'gap', t: '结论：「一个内核」保留 看 / 查 / 问 三样（画布也需要），「改」与「请求生成」按画布方式重做——每个宿主给一张 op 表（工作台 = 表单字段 op、LoRA = 挂载 / 参数 op、配音间 = 台词 / 语气 op），客户端校验落地、免费可撤销自动落、花钱才确认；Operator 的 30 工具收成 看 / 查 / 问 三类 + 宿主 op 表', w: 560 },
    ] },
    { k: 'cat', t: '原「一个内核 · 五动词」（保留作对照）', c: [
      { k: 'leaf', t: '问题 1 的答案：一个功能完整的助手内核（看 / 查 / 问 / 改 / 请求生成），专属层 = 「改」的 action 枚举 + 系统提示 + 结果卡差异；不是五个产品。v2 的 ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN 已经是这个形状', w: 520 },
      { k: 'leaf', t: '形态一种：右侧 dock 可收成按钮（画布现状），工作台 / LoRA / 配音间统一；手机半屏 Sheet', w: 520 },
      { k: 'leaf', t: '不做：助手不扣扳机（request_generation 只吐载荷）· 不拆钱闸', w: 520 },
    ] },
    { k: 'cat', t: '公共层 · 你画的左边六项', c: [
      { k: 'sub', t: '搜索（查）', own: true, c: [
        { k: 'leaf', t: '查证 + 找图两入口 · 来源白黑名单 · 证据 #eN' },
        { k: 'leaf', s: 'gap', t: '联网单独设计（便签 15）：正文预算分档 · 白黑名单下沉到 provider 原生搜索 · 引用改区间锚 citedText · 同源去重 · 深研档一次澄清 + 多轮' },
      ] },
      { k: 'sub', t: '识图（看）', own: true, c: [
        { k: 'leaf', t: 'analyze_references 只看指定图保留视觉事实 · critique_result 评审 · 参考图用途分工' },
        { k: 'leaf', s: 'gap', t: '图片 / 页面分析重设计（便签 16）：Gemini URL context 看网页 / PDF，其余回落 Jina；结构化分析补渲染方式 / 立体特征已做，缺「页面分析」动作' },
      ] },
      { k: 'sub', t: '视频分析（看）', own: true, c: [
        { k: 'leaf', t: '浏览器抽三帧 → 视觉线；YouTube 直传 Gemini；平台页只出元数据' },
        { k: 'leaf', s: 'partial', t: 'Gemini 原生视频 / 音频输入已接，其他路由提示切换；分镜级分析（逐镜 / 运镜 / 转场识别）未做' },
      ] },
      { k: 'sub', t: '反问（问）', own: true, c: [
        { k: 'leaf', t: '一次只问一个 · 问题卡单选 2–4 项 · 多步计划走 confirm(multistep)' },
        { k: 'leaf', s: 'gap', t: '问题 2：参考图审核冲突现在直接报错 → 改成「无法确定就反问」：分工失败 / 用途歧义 / 与上下文卡冲突三种情形都出问题卡，不阻断' },
        { k: 'leaf', s: 'gap', t: '澄清时机前移：检索改写前允许一次澄清（questionType general 且主体歧义）' },
      ] },
      { k: 'sub', t: 'skill 设定', own: true, c: [
        { k: 'leaf', t: '三档人设 + 文本模型选择（AssistantPersona）· 项目规则 ProjectRule · 上下文卡 提议 → 确认' },
        { k: 'leaf', s: 'gap', t: '/ skill 调用（2026-09-11 想法，未拍板）：把「做同款」「写分镜」「情绪标注」做成可点的 skill 卡，进输入区第二行' },
      ] },
      { k: 'sub', t: '自动填入（改）', own: true, c: [
        { k: 'leaf', t: 'apply 一次改一项、必带 inverse · set_prompt / set_model / set_specs / mount_reference / mount_lora …' },
        { k: 'leaf', t: '生成确认卡就地改参数 · 恢复到这一步 · 素材库四条写操作带撤销' },
      ] },
      { k: 'sub', t: '记忆与上下文（新增到公共层）', c: [
        { k: 'leaf', t: '每轮结账 rounds · 证据本 · 上下文卡' },
        { k: 'leaf', s: 'gap', t: '记忆即时写（用户明说的偏好）· 可见可编总览页 · 来源可溯 contextUsed · 敏感类目不记 · 隐身模式 · Claude memory 工具落 Prisma' },
      ] },
    ] },
    { k: 'cat', t: '专属层 · 你画的右边五个 + 音频', c: [
      { k: 'sub', t: '图片助手', own: true, c: [
        { k: 'leaf', t: '参考分工 · 对照矩阵选模型 · 规格 / 画质 · @ 引用参考图 · 草稿恢复' },
        { k: 'leaf', s: 'gap', t: '编辑意图识别（「把背景换掉」→ 编辑器动作而非重生成）· 生成后去向建议（存配方 / 生镜头）· tag 模型方言（NAI 质量标签 / UC）' },
      ] },
      { k: 'sub', t: '视频助手', own: true, c: [
        { k: 'leaf', t: 'set_video_specs · mount_audio_reference · set_sound · Seedance 提示词规划器' },
        { k: 'leaf', s: 'gap', t: '分镜 prompt（Kling multi_prompt / Seedance 时间戳）· 白模档建议 · 台词与语气进视频 · 参考视频怎么参考的解释' },
      ] },
      { k: 'sub', t: '画布助手（体验最好，作为基线）', own: true, c: [
        { k: 'leaf', t: '剧本脑 ScriptDoc → 投影节点 · 节点 op（新建 / 连线 / 改参数）· 一句话排片（剪辑台投便条）' },
        { k: 'leaf', s: 'gap', t: '剧本功能提取成剧本节点（便签 18）：助手写大纲 → 用户确认 → 每个分镜连线生成；角色槽由卡片总线自动装填' },
      ] },
      { k: 'sub', t: 'LoRA 助手（挂载 · 提示词优化 · 参数优化）', own: true, c: [
        { k: 'leaf', t: 'plan_lora_pick 推荐卡先出卡再挂 · 兼容判定 / 默认权重 · 家族方言表 · 读来源配方写 Runner 七项参数' },
        { k: 'leaf', s: 'partial', t: '来源配方 reliable=true 今天走不到 · 否定结论被记成事实导致拒绝复查（设计缺口待定）' },
      ] },
      { k: 'sub', t: '卡片助手（新）', own: true, c: [
        { k: 'leaf', s: 'gap', t: '建卡向导：从一张图 / 一段剧本抽角色 → 自动补三视图 → 绑音色 → 精修入 referenceImages → 一致性检查（跨图比对）→ STABLE' },
        { k: 'leaf', s: 'gap', t: '在生成时代表卡说话：把角色卡编译成各 provider 的参考槽 + @名字 + 音色；风格卡改写不追加' },
      ] },
      { k: 'sub', t: '音频助手（配音间，v2 未覆盖）', c: [
        { k: 'leaf', s: 'gap', t: 'L3 情绪导演：台词自动插 [tag]，只加标记不改词 · 多人对白编排（谁说哪句、基调）· A/B 变体并排试听' },
      ] },
    ] },
    { k: 'cat', t: '接下来', c: [
      { k: 'leaf', t: 'P0：反问替代报错 · 联网五条 · 记忆可见可编 → 这是公共层三件，五个助手同时受益', w: 520 },
      { k: 'leaf', t: 'P1：卡片助手 + 剧本节点（两者都靠卡片总线）· 音频助手进 v2 domains', w: 520 },
      { k: 'leaf', t: 'P2：/ skill 卡 · 拆 8,694 行 operator service · 删旧 prompt-assistant / node-assistant', w: 520 },
    ] },
  ],
}
const B_ASSIST = header('PixelVault · 设计 · 2026-09-17', '助手设计 · 补齐你的手绘', '你的判断成立：每个助手都应包含左边的公共功能，右边延伸专属功能。补的是三件：公共层多了「记忆与上下文」，专属层多了音频助手，以及每一项今天有 / 部分 / 缺的标注。黑色短条 = 你手绘里已有的项。') + legend + tree(ASSIST, 160)

// ═══════════ 画布设计 ═══════════
const CANVAS = {
  k: 'root', t: '画布',
  c: [
    { k: 'cat', t: '文字节点', c: [
      { k: 'sub', t: '剧本编写 · 分镜编写', own: true, c: [
        { k: 'leaf', t: '写作助手栏：续写 / 改写 / 写作模型；全屏文档 Markdown；@ 引用' },
        { k: 'leaf', s: 'gap', t: '剧本节点（包 7）：大纲 → 分镜列表 + 转场 → 每镜「→ 节点」连线生成；镜头带时长档、机位、转场方式' },
      ] },
      { k: 'sub', t: '剧情分析 · 反推', own: true, c: [
        { k: 'leaf', t: '视频分析（抽三帧）· 图片分析 · 剧本拆解 idea → 角色 / 场景 / beat / 镜头' },
        { k: 'leaf', s: 'gap', t: '反推：从成片 / 图反推 prompt 与分镜（ReverseEngineerPanel 存在于工作台，画布未接）' },
      ] },
      { k: 'sub', t: '分析 · 上下文记忆', own: true, c: [
        { k: 'leaf', t: '文本卡可作视频卡「镜头说明」输入；助手每轮结账进 rounds' },
        { k: 'leaf', s: 'gap', t: '项目级上下文卡（世界观 / 角色表 / 风格规则）作为所有节点的隐式输入' },
      ] },
    ] },
    { k: 'cat', t: '图片节点', c: [
      { k: 'sub', t: '放参考图', own: true, c: [
        { k: 'leaf', t: '上传 · 素材库 · 复制粘贴 ⌘V · @ 角色 / 风格卡；三条路都进提示词栏，卡面不显槽' },
        { k: 'leaf', s: 'partial', t: '统一 ReferencePicker（第五页）：带用途 role；参考图直连素材库 G1' },
      ] },
      { k: 'sub', t: '生成图片', own: true, c: [
        { k: 'leaf', t: '文字 → 图片 · 图片 → 图片；chip 画面（比例 / 质量 / 分辩率 / 张数 + 实时尺寸与单价）· chip 模型' },
        { k: 'leaf', s: 'gap', t: 'Seedream 组图（一次出一组关联图）· Gemini 多轮对话式编辑保真' },
      ] },
      { k: 'sub', t: '图片编辑（你说还没定，先按功能分区）', own: true, c: [
        { k: 'leaf', t: '已有：局部重绘 · 物体替换（标注）· 元素提取 · 去背景 · 超分（aura-sr / Clarity 2x）· 结果作新版本回卡' },
        { k: 'leaf', s: 'gap', t: '你提的「图片修改」= 指令式整图修改（GPT 2.5 连续修改 / Gemini 对话编辑）· 扩图 · 换背景 · 图层拆分（Seedream Pro，给节点拆成多张）' },
        { k: 'leaf', s: 'gap', t: '分区建议：① 像素级（重绘 / 扩图 / 去背景 / 超分）② 指令级（整图修改 / 替换 / 风格迁移）③ 结构级（提取 / 图层拆分 / 多视角）——编辑器按三区排，画布 / 工作台共用' },
      ] },
      { k: 'sub', t: '出口', c: [
        { k: 'leaf', t: '生镜头（首帧新建视频卡并连线）· 设为角色卡 · 下载 · 拆出版本' },
      ] },
    ] },
    { k: 'cat', t: '语音节点', c: [
      { k: 'sub', t: '参考语音', own: true, c: [
        { k: 'leaf', t: '语音库直接取（平台样本 / 我的历史 / 配音间 / 素材库 / 收藏，「用这段」不扣积分）· 上传 · 素材库取 · @ 角色卡取音色' },
      ] },
      { k: 'sub', t: '语音生成', own: true, c: [
        { k: 'leaf', t: '写台词回车 · chip 音色 / 模型（语音 / 配乐 / 音效三组）· 语气写进台词（加语气浮层 → Fish 方括号编译）' },
        { k: 'leaf', s: 'gap', t: '多人对白：一张卡多说话人（按 @角色 分句）· 情绪导演 L3 自动标注 · 豆包 / Gemini 的指令式情绪编译' },
      ] },
      { k: 'sub', t: '语音编辑', own: true, c: [
        { k: 'leaf', t: '裁剪（新建卡）· 转文字 · 连到镜头（连成音轨）' },
        { k: 'leaf', s: 'gap', t: '换音色重出（同台词换声）· 变速 / 静音段 · Step-Audio-EditX 类「改情绪不改词」' },
      ] },
    ] },
    { k: 'cat', t: '视频节点', c: [
      { k: 'sub', t: '放视频', own: true, c: [
        { k: 'leaf', t: '上传 · 素材库 · 连线 / 拖放都进参考轨（图作参考或首 / 尾帧，视频 = 参考视频，语音 = 音轨）' },
      ] },
      { k: 'sub', t: '视频生成', own: true, c: [
        { k: 'leaf', t: '文字 → 视频 · 图 → 视频（首帧 / 首尾帧）· 全能参考；模式由挂了什么推出，写在 chip 首位' },
        { k: 'leaf', s: 'gap', t: '视频 → 视频：Kling v2v / Seedance 编辑任务 / Omni edit 都未接；先接一条作「改这段」' },
        { k: 'leaf', s: 'gap', t: '分镜：Kling multi_prompt 镜头列表 · Seedance 时间戳分镜 · 白模档（白模参考视频作唯一运镜与调度参考）' },
      ] },
      { k: 'sub', t: '出口', c: [
        { k: 'leaf', t: '续拍（末帧作下一段首帧）· 抽帧（落成图片卡）· 加入剪辑台 · 来源只读' },
        { k: 'leaf', s: 'partial', t: '剪辑台：V / A / M / T 四轨 · 一句话排片 · 导出回画布 —— 契约已定实现待核' },
      ] },
    ] },
    { k: 'cat', t: '你画的三条箭头 = 连线矩阵', c: [
      { k: 'leaf', t: '文字 → 图片（正文作提示词 / 镜头说明）· 文字 → 视频（镜头说明）· 图片 → 视频（首帧 / 尾帧 / 参考）· 语音 → 视频（音轨）· 图片 → 图片（参考）· 视频 → 视频（参考视频 / 续拍）· 任何 → 剪辑台', w: 560 },
      { k: 'leaf', s: 'gap', t: '缺的两条：角色卡 → 任何节点（卡片总线：参考槽 + @名字 + 音色自动装填）· 剧本节点 → 多个视频卡（一次投影多镜）', w: 560 },
    ] },
  ],
}
const B_CANVAS = header('PixelVault · 设计 · 2026-09-17', '画布设计 · 补齐你的手绘', '你的四类节点与三条箭头都对，补的是：每项今天有 / 缺；你说「图片编辑还没定」——按像素级 / 指令级 / 结构级三区给了一个分法；以及两条缺的连线（角色卡 → 节点、剧本节点 → 多镜）。') + legend + tree(CANVAS, 255)

// ═══════════ 卡片设计 ═══════════
const CARDS = {
  k: 'root', t: '卡片',
  c: [
    { k: 'cat', t: '角色卡 · 你的四块', c: [
      { k: 'sub', t: '文字：角色设定', own: true, c: [
        { k: 'leaf', t: '已有：name · description（视觉描述）· tags · status（DRAFT → REFINING → STABLE）· 变体' },
        { k: 'leaf', s: 'gap', t: '补：人设（写具体行为不写形容词：「紧张时搓手指」）· 说话方式 / 口头禅 · 情境 · 开场白 · 范例对话 3–5 组（weavai 七块 + SillyTavern V3 字段）' },
      ] },
      { k: 'sub', t: '图片：角色形象', own: true, c: [
        { k: 'leaf', t: '已有：主图 + 三视图 sourceImageEntries{viewType} ≤10 · attributes 13 项 · characterPrompt · 精修 referenceImages ≤5 · stabilityScore · loras ≤5' },
        { k: 'leaf', s: 'gap', t: '补：参考图用途 role（identity / faceCloseup / costume / pose / prop，与画布 11 类同一词表）· 负面约束 · 允许画风范围 allowedStyleRange' },
      ] },
      { k: 'sub', t: '声音：角色声线', own: true, c: [
        { k: 'leaf', s: 'partial', t: 'VoiceCard 表已有（provider / voiceId / referenceAudio / tone / pace / pitch），但与 CharacterCard 零关联' },
        { k: 'leaf', s: 'gap', t: '补：voiceCardId 外键 + voiceProfile{emotions[{label, params}], sampleLines[]} · 情绪范围元数据（IndexTTS-2 向量或手标）' },
      ] },
      { k: 'sub', t: '风格：画风绑定', own: true, c: [
        { k: 'leaf', t: '风格卡 StyleCard 已有：stylePrompt · 12 属性 · 样张 · modelId / advancedParams' },
        { k: 'leaf', s: 'gap', t: '补：角色卡的 allowedStyleRange 白名单 · 风格图 role:style（MJ --sref / Gemini 风格槽）· 冲突护栏：风格改写视觉语言，角色负面约束最后覆盖，UI 提示「该风格会覆盖角色 artStyle」' },
      ] },
    ] },
    { k: 'cat', t: '其他卡', c: [
      { k: 'sub', t: '背景卡 → 场景元素', c: [
        { k: 'leaf', s: 'gap', t: '升级成可 @ 引用的场景实体（Kling 元素库把场景与角色平级）：参考图槽 + 名字 + 时间 / 天气变体，「同一条街道跨 8 镜」才稳' },
      ] },
      { k: 'sub', t: '音色卡', c: [
        { k: 'leaf', t: '来源三种：市场 / 克隆 / 临时参考；配音间 cast 引用' },
        { k: 'leaf', s: 'gap', t: 'designed 文字造音色 · 情绪范围 · 克隆引导（含情绪起伏的样本）' },
      ] },
      { k: 'sub', t: '配方卡 CardRecipe', c: [
        { k: 'leaf', t: '角色 + 背景 + 风格 + 自由词 → LLM 融合成单条 prompt（编译器已写对「风格是改写不是追加」）' },
        { k: 'leaf', s: 'gap', t: '参考图从平铺数组改 referenceSlots{role, url, cardId, cardName}，由各 adapter 映射到自家槽位 / 权重' },
      ] },
    ] },
    { k: 'cat', t: '生成时直接拿来用 · 三处', c: [
      { k: 'sub', t: '图片', c: [{ k: 'leaf', t: 'referenceSlots → Gemini 角色槽 ≤4–5 / 风格槽 ≤3 · MJ --oref / --sref · Runway {uri, tag} · NAI 角色提示；提示词里 @名字' }] },
      { k: 'sub', t: '视频', c: [{ k: 'leaf', s: 'gap', t: 'generate-video 只收 characterCardIds → 编译成 subjects{name, images ≤3, voice_id}：Vidu 原生 · Kling [@元素名] + create-voice · Hailuo 参考池 · Seedance 参考图 + @Image；名字 = card.name，音色 = voiceCardId' }] },
      { k: 'sub', t: '画布', c: [{ k: 'leaf', s: 'partial', t: '已有 cardId 绑定 · @名字 · referenceAssets[].role · loras；缺 voiceCardId 与配音间打通；卡片总线 = 角色卡 → 节点参考槽自动装填' }] },
      { k: 'sub', t: '配音间', c: [{ k: 'leaf', s: 'gap', t: 'cast 直接选角色卡 → 带出声线 + 情绪范围 + 示例台词' }] },
    ] },
    { k: 'cat', t: '建卡与血缘', c: [
      { k: 'leaf', s: 'gap', t: '建卡向导：主图（均匀光 · 中性表情，抄 Runway 验收标准）→ 自动补 front / side / back → 精修入 referenceImages → stabilityScore ≥ 0.75 转 STABLE → 绑音色', w: 560 },
      { k: 'leaf', s: 'gap', t: 'provenance{sourceGenerationIds, loraJobId, derivedFromCardVersion} + version；从素材 / 剧本一键抽角色（卡片助手）', w: 560 },
      { k: 'leaf', t: 'Prisma 迁移三件：voiceCardId · sourceImageEntries.role · 人设字段 —— 这是待拍板第 12 条', w: 560 },
    ] },
  ],
}
const B_CARDS = header('PixelVault · 设计 · 2026-09-17', '卡片设计 · 补齐你的手绘', '你的「文字 / 图片 / 声音 / 风格」四块正好对应角色卡的四个锚；调研发现现有 schema 三视图与属性已经很全，真正缺的是声音绑定、参考图用途分槽、人设行为字段，以及「生成时怎么拿来用」的编译层。') + legend + tree(CARDS, 320)

for (const [name, html] of [
  ['SharedTaskBar.dc.html', page('任务条', B_TASK + reply(25, '目前有这个设计吗。我没有印象。', ['没有。今天没有任何叫「任务条」的组件，生成中的反馈是五种散落表现：图片工作台进度环 · 画布节点裱框显影 · 视频镜头失败持久化（G4 刚补）· Runner 冷启动一句提示 · 3D spinner。', '任务条是本轮新设计，唯一复用的是后端已有的 GenerationJobStatus 五态 + 阶段词；UI 全新。', '落地顺序：先画布节点（裱框显影里加阶段词 + 取消）与图片工作台两处，再 Runner / 3D / 配音间。']))],
  ['SharedDestinations.dc.html', page('结果去向菜单', B_DEST + reply(27, '这边放在哪里。画布上吗。', ['不是画布上的独立面板，是同一份注册表在三处出现：① 画布卡的 ⋯ 按钮与节点右键（与批注 29 的右键列表同一份）；② 工作台结果卡底部四枚主动作 + ⋯；③ 素材详情 / 画廊详情右上 ⋯。', '助手结果卡取子集（编辑 / 再来一张 / 存为配方 / 下载 / 进画布）。', '按媒体 × 表面裁剪，见上表「✓ / ○ / —」。']))],
  ['DesignAssistant.dc.html', page('助手设计', B_ASSIST)],
  ['DesignCanvas.dc.html', page('画布设计', B_CANVAS)],
  ['DesignCards.dc.html', page('卡片设计', B_CARDS)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
