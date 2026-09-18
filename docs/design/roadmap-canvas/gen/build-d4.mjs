// D4 · 结果去向菜单 + 右键 / 双击 + 任务条：① 反问（五题带选项 + 小线框 + 建议）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .q { margin-top:30px; border:1px solid ${BORDER}; border-radius:14px; padding:18px 20px 20px }
  .q h2 { margin:0; font-size:17px; font-weight:600 } .q .why { margin:6px 0 0; font-size:13px; color:#525252; line-height:1.55 }
  .opts { display:flex; gap:16px; margin-top:14px; align-items:stretch; flex-wrap:wrap }
  .opt { flex:1; min-width:300px; border:1px solid ${BORDER}; border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:10px; background:#fff }
  .opt.rec { border-color:${FG}; box-shadow:0 0 0 3px ${MUTEDBG} }
  .opt b { font-size:13.5px } .opt .desc { font-size:12.5px; color:#525252; line-height:1.55 }
  .mock { background:${WORKBENCH}; border-radius:10px; padding:12px; min-height:120px; position:relative; overflow:hidden }
  .rec-tag { ${MONO} font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:${FG}; border-radius:999px; padding:2px 8px; display:inline-block; margin-left:8px; vertical-align:middle }
  .pros { font-size:12px; color:#404040; line-height:1.55 }
  .menu { background:#fff; border:1px solid ${BORDER}; border-radius:10px; box-shadow:${SH_FLOAT}; padding:4px; font-size:11.5px; width:170px }
  .menu div { padding:5px 8px; border-radius:6px; display:flex; justify-content:space-between } .menu .sep { height:1px; background:${BORDER}; margin:3px 6px; padding:0 } .menu .k { color:${MUTED}; ${MONO} font-size:10px }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const opt = (letter, title, desc, mock, pros, rec = false) => `<div class="opt${rec ? ' rec' : ''}"><div><b>${esc(letter)} · ${esc(title)}</b>${rec ? '<span class="rec-tag">建议</span>' : ''}</div><div class="mock">${mock}</div><div class="desc">${esc(desc)}</div><div class="pros">${pros.map((p) => `<div>· ${esc(p)}</div>`).join('')}</div></div>`
const q = (n, title, why, opts) => `<div class="q"><h2>Q${n} · ${esc(title)}</h2><p class="why">${esc(why)}</p><div class="opts">${opts.join('')}</div></div>`
const menu = (items) => `<div class="menu">${items.map((i) => i === '-' ? '<div class="sep"></div>' : `<div><span>${esc(i[0])}</span>${i[1] ? `<span class="k">${esc(i[1])}</span>` : ''}</div>`).join('')}</div>`
const pill = (t, on = false) => `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font-size:11.5px;${on ? `background:${FG};color:#fff` : `border:1px solid ${BORDER};background:#fff`}">${esc(t)}</span>`
const card = (w = 200, h = 120, inner = '') => `<div style="width:${w}px;height:${h}px;border-radius:10px;background:linear-gradient(135deg,#dcdcd8,#c3c3bf);position:relative">${inner}</div>`

// Q1 主动作
const q1 = q(1, '工作台结果卡底部的主动作：固定四枚，还是按媒体变', '现在结果卡底部的按钮各页自写。注册表定好后，卡底能放 3–4 枚，其余进 ⋯。', [
  opt('A', '固定四枚，按媒体只换第三枚', '图：编辑 · 再来一张 · 生镜头 · 存为配方；视频：编辑 → 改这段 · 再来一段 · 续拍 · 存为配方；音频：加语气 · 再来一段 · 连到镜头 · 设为音色。位置固定，肌肉记忆不变。', `<div style="display:flex;flex-direction:column;gap:8px">${card(360, 60)}<div style="display:flex;gap:6px">${pill('编辑')}${pill('再来一张')}${pill('生镜头 →', true)}${pill('存为配方')}<span style="margin-left:auto">${pill('⋯')}</span></div></div>`, ['四个位置的语义固定：改 · 再来 · 去下一步 · 留下来', '媒体只换字面，不换位置', '注册表里给每个动作标「主动作槽位 1–4」即可'], true),
  opt('B', '完全按媒体与页面从注册表取前四', '注册表按分组顺序排，取前四个「适用」的；不同媒体 / 页面下枚数和位置都可能变。', `<div style="display:flex;flex-direction:column;gap:8px">${card(360, 60)}<div style="display:flex;gap:6px">${pill('编辑')}${pill('保留与改变')}${pill('再来一张')}${pill('生镜头 →')}<span style="margin-left:auto">${pill('⋯')}</span></div></div>`, ['零配置，注册表即真相', '同一颗「存为配方」在图卡是第 4 枚、在视频卡可能掉进 ⋯']),
  opt('C', '两枚主动作 + ⋯', '只留「再来一张」与「去下一步（生镜头 / 续拍 / 连到镜头）」两枚黑白按钮，其余全进 ⋯。', `<div style="display:flex;flex-direction:column;gap:8px">${card(360, 60)}<div style="display:flex;gap:6px">${pill('再来一张')}${pill('生镜头 →', true)}<span style="margin-left:auto">${pill('⋯')}</span></div></div>`, ['卡底最干净', '编辑与存配方要多点一次；编辑是图卡最高频动作']),
])

// Q2 右键 = ⋯ ?
const q2 = q(2, '右键菜单与 ⋯ 菜单的词表要完全一致吗', '批注 27 · 29：三处出现同一份注册表。剩下的问题是右键（鼠标党）与 ⋯（触屏 / 发现）是否一字不差。', [
  opt('A', '完全一致，同一个组件两种触发', '右键与 ⋯ 打开同一个菜单组件；只是锚点不同（右键跟鼠标、⋯ 跟按钮）。快捷键列两处都显示。', `<div style="display:flex;gap:16px;align-items:flex-start">${menu([['编辑…', 'E'], ['再来一张', 'R'], ['生镜头 →'], '-', ['存为配方'], ['设为角色卡'], '-', ['下载', '⌘S'], ['删除', '⌫']])}<div style="font-size:11px;color:${MUTED};padding-top:8px">右键 = ⋯<br>同一份 · 同一顺序</div></div>`, ['一份词表一份测试；用户在哪学会的在哪都能用', '手机没有右键只有 ⋯，词表一致就没有「手机少功能」'], true),
  opt('B', '右键多出「上下文项」', '右键在同一份之上，顶部多 1–2 条只在当前位置有意义的项（画布：对齐 / 置顶 / 复制这张卡；工作台：复制参数）。', `<div style="display:flex;gap:16px;align-items:flex-start">${menu([['复制这张卡'], ['拆出当前版本'], '-', ['编辑…', 'E'], ['再来一张', 'R'], '-', ['下载', '⌘S']])}<div style="font-size:11px;color:${MUTED};padding-top:8px">右键 ⊃ ⋯</div></div>`, ['右键更贴位置', '两份顺序要维护；手机永远拿不到顶部那两条']),
])

// Q3 失败态
const q3 = q(3, '任务条失败态：先给重试，还是先给原因', '失败三层文案（原文 / 错误码 / 翻译键）已持久化。任务条上一行能放的东西有限。', [
  opt('A', '一句原因 + 三动作（重试 · 换渠道 · 复制错误）', '首行一句翻译过的原因（「OpenAI 返回 401 · key 失效」），动作固定三枚；点原因展开原文。', `<div style="border:1px dashed ${RED}99;border-radius:10px;padding:10px 12px;background:#fff;font-size:12px;width:380px"><div style="display:flex;justify-content:space-between"><span style="font-weight:500">GPT Image 2.5 · 失败</span><span class="tok" style="color:${RED}">invalid_api_key</span></div><div style="color:#525252;margin-top:4px">OpenAI 返回 401 · key 失效，换一把或换渠道</div><div style="display:flex;gap:6px;margin-top:8px">${pill('重试')}${pill('换渠道', true)}${pill('复制错误')}</div></div>`, ['原因决定该点哪个动作：401 → 换渠道 / 换 key；超时 → 重试；内容拦截 → 改提示词', '「换渠道」直接开选择器的渠道面板（D2 已有）', '原因句从错误码表翻译，没有翻译就退原文一行'], true),
  opt('B', '只给「重试」，原因藏在 hover / 展开', '任务条上只有红点 + 重试；原因要 hover 或点开看。', `<div style="border:1px dashed ${RED}99;border-radius:10px;padding:10px 12px;background:#fff;font-size:12px;width:380px;display:flex;justify-content:space-between;align-items:center"><span style="font-weight:500">GPT Image 2.5 · 失败</span>${pill('重试', true)}</div>`, ['最短', '401 重试必然再失败，用户会连点三次']),
  opt('C', '按错误类型给不同的唯一动作', '401 → 「换一把 key」；超时 → 「重试」；内容拦截 → 「改提示词」；余额不足 → 「去 provider 充值 ↗」。一行一动作。', `<div style="border:1px dashed ${RED}99;border-radius:10px;padding:10px 12px;background:#fff;font-size:12px;width:380px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:500">GPT Image 2.5 · 失败</div><div style="color:#525252;margin-top:2px">OpenAI 返回 401 · key 失效</div></div>${pill('换一把 key', true)}</div>`, ['最省思考', '错误码 → 动作的映射表要维护；映射不到的还得退回 A']),
])

// Q4 画布空白处
const q4 = q(4, '画布空白处：右键还是双击出「添加节点」列表', '批注 29 说右键 / 双击都行。两种手势在画布上各有默认含义：右键 = 菜单，双击 = 缩放 / 编辑。', [
  opt('A', '右键出列表，双击不做事', '空白右键 = 添加节点（文本 / 图片 / 声音 / 视频 + 上传 + 问助手），节点右键 = 去向菜单；双击留给未来的「编辑名字 / 进卡」。', `<div style="display:flex;gap:16px">${menu([['文本节点', 'T'], ['图片节点', 'I'], ['声音节点', 'A'], ['视频节点', 'V'], '-', ['上传…', '⌘U'], ['问助手「…」'], '-', ['更多命令…', '⌘K']])}<div style="font-size:11px;color:${MUTED};padding-top:8px">空白右键</div></div>`, ['右键 = 菜单是所有画布工具的通识', '触屏：长按空白 = 同一列表', '双击误触率高（拖动中的双击）'], true),
  opt('B', '双击出列表，右键留给浏览器', '空白双击 = 添加节点；右键不拦截（保留浏览器默认菜单）。', `<div style="font-size:11px;color:${MUTED};padding:8px">空白双击 → 同一列表<br>右键 = 浏览器默认</div>`, ['不动右键，最保守', '节点右键去向菜单（批注 27）就做不了；两处手势不一致']),
  opt('C', '右键与双击都出列表', '两种手势同一列表；节点上右键 = 去向菜单，节点上双击 = 展开 / 进卡。', `<div style="font-size:11px;color:${MUTED};padding:8px">空白：右键 = 双击 = 添加节点<br>节点：右键 = 去向 · 双击 = 展开</div>`, ['两派用户都顺手', '双击与拖动结束的时序要处理；「双击 = 展开」与「双击 = 添加」在节点边缘会打架']),
])

// Q5 全局角标
const q5 = q(5, '任务条要不要「全局角标」（跨页可见后台任务）', '皮 3 是侧栏 / 顶栏一枚「3 个任务进行中 · 1 失败」。D3 刚定了侧栏不挂红点、不显额度。', [
  opt('A', '不做全局角标，任务只在发起的页面可见', '画布节点的裱框显影 + 工作台队列条就是全部；切页后回来再看。失败持久化在卡上，不会丢。', `<div style="font-size:11px;color:${MUTED};padding:8px">侧栏：只有导航 · 头像 · 设置<br>任务反馈只在卡 / 队列里</div>`, ['与 D3「侧栏不挂角标」一致', '视频 2–5 分钟的等待，用户切去画廊就不知道好了没'], false),
  opt('B', '只在有进行中任务时，侧栏「工具」组对应项后出一枚小进度点', '不加新行：图片工作台有任务 → 「图片」导航项右侧一个 8px 环；完成后消失，失败变红 3 秒后灰。点导航项进去看。', `<div style="width:150px;background:#f7f7f5;border-radius:8px;padding:8px;font-size:12px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between"><span>图片</span><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" stroke="${BORDER}" stroke-width="2" fill="none"/><circle cx="6" cy="6" r="4.5" stroke="${FG}" stroke-width="2" fill="none" stroke-dasharray="17 28" transform="rotate(-90 6 6)"/></svg></div><div style="display:flex;justify-content:space-between"><span>视频</span><span style="width:8px;height:8px;border-radius:50%;background:${RED};display:inline-block"></span></div><div>画布</div></div>`, ['跨页知道「哪里在跑 / 哪里失败了」，又不加一行新 UI', '这是进度不是未读，与 D3「不挂红点」不冲突——失败点 3 秒后变灰', '每个工具页要能上报自己的任务数（useGenerationTask 汇总）'], true),
  opt('C', '皮 3 原案：侧栏最底一行「N 个任务 · M 失败」，点开列表', '独立一行任务入口，点开是皮 1 列表。', `<div style="width:150px;background:#f7f7f5;border-radius:8px;padding:8px;font-size:12px"><div style="border-top:1px solid ${BORDER};padding-top:6px;color:#525252">● 3 个任务 · 1 失败</div><div style="margin-top:4px">⚙ 设置</div></div>`, ['最完整', '侧栏底部又多一行，与刚定的「最底只有设置」打架']),
])

const ASK = header('PixelVault · D4 · ① 反问 · 2026-09-18', '结果去向菜单 + 右键 / 双击 + 任务条 · 五题', '生成后的两件事：等（任务条 16）与去哪（去向菜单 17 · 右键 18）。第 5 页 SharedDestinations / SharedTaskBar / SharedCmdK 三块板 + 批注 25 · 27 · 29 已定：一份动作注册表三处出现；⌘K 只留键盘用户、入口改右键 / 双击、删 ShellCommandPalette；任务条一个状态模型多种皮。剩下五个要你拍的：主动作固定否 · 右键 = ⋯ 否 · 失败态给什么 · 空白处手势 · 全局角标。加黑边的是建议。') + q1 + q2 + q3 + q4 + q5

for (const [name, html] of [['DesignD4Ask.dc.html', page('D4 ① 反问', ASK)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
