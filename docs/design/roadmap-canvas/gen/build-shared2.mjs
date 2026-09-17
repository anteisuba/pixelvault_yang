// Page 5 additions: channel selection solutions, reference-entry picker, spec chips.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', GREEN = '#16794c', AMBER = '#a04f00', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
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
const header = (title, sub) => `<div style="margin-bottom:24px;max-width:960px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · 共享组件 · 2026-09-17</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const label = (t) => `<div style="${MONO}font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:10px">${esc(t)}</div>`
const frame = (inner) => `<div style="padding:22px;background:#f5f5f5;border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:12px">${inner}</div>`
const caption = (t) => `<div style="font-size:12px;line-height:1.55;color:#525252;max-width:560px">${esc(t)}</div>`
const chev = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.6"><path d="M2 3.5 L5 6.5 L8 3.5"/></svg>`
const chip = (l, { sub, dark = false, h = 30, muted = false } = {}) => `<div style="display:inline-flex;align-items:center;gap:6px;height:${h}px;padding:0 10px 0 12px;border-radius:999px;background:${dark ? FG : '#fff'};color:${muted ? MUTED : dark ? '#fff' : FG};border:1px ${muted ? 'dashed' : 'solid'} ${dark ? FG : muted ? '#c4c4c4' : LINE};font-size:12px;font-weight:500;white-space:nowrap"><span>${esc(l)}</span>${sub ? `<span style="color:${dark ? 'rgba(255,255,255,.65)' : MUTED};font-weight:400">· ${esc(sub)}</span>` : ''}${chev}</div>`
const panel = (inner, w = 320) => `<div style="width:${w}px;background:#fff;border:1px solid ${LINE};border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:8px;display:flex;flex-direction:column;gap:2px">${inner}</div>`
const groupHead = (t) => `<div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};padding:8px 8px 4px">${esc(t)}</div>`
const row = (name, meta, { selected = false, tail = '' } = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;background:${selected ? '#f5f5f5' : 'transparent'}"><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500">${esc(name)}</div><div style="font-size:11.5px;color:${MUTED};margin-top:2px">${esc(meta)}</div></div>${tail}</div>`
const seg = (items) => `<div style="display:inline-flex;padding:3px;border-radius:9px;background:#ececec;gap:2px">${items.map(([t, on, sub]) => `<div style="padding:5px 10px;border-radius:7px;background:${on ? '#fff' : 'transparent'};box-shadow:${on ? '0 1px 2px rgba(0,0,0,.12)' : 'none'};font-size:12px;font-weight:${on ? 600 : 500};white-space:nowrap">${esc(t)}${sub ? `<span style="color:${MUTED};font-weight:400;${MONO}font-size:10.5px"> ${esc(sub)}</span>` : ''}</div>`).join('')}</div>`
const optCard = (t, rec, mock, how, pro, con) => `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;background:#fff;border:1px solid ${rec ? FG : LINE};border-radius:12px">
  <div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:15px;font-weight:600">${esc(t)}</div>${rec ? `<span style="${MONO}font-size:10.5px;padding:3px 7px;border-radius:999px;background:${FG};color:#fff">推荐</span>` : ''}</div>
  ${mock}<div style="font-size:12.5px;line-height:1.55;color:#404040">${esc(how)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;line-height:1.55"><div><div style="color:${GREEN};font-weight:600;margin-bottom:4px">好在</div>${pro.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div><div><div style="color:${RED};font-weight:600;margin-bottom:4px">代价</div>${con.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div></div>
</div>`

// ═══════════ Board 4 · 渠道选择 ═══════════
const chTag = (t, color = MUTED) => `<span style="${MONO}font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid ${color}55;color:${color};white-space:nowrap">${esc(t)}</span>`
const chRow = (name, price, tags, on = false) => `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:${on ? '#fff' : 'transparent'};border:1px solid ${on ? FG : 'transparent'}"><div style="width:14px;height:14px;border-radius:999px;border:1.5px solid ${on ? FG : '#c4c4c4'};display:flex;align-items:center;justify-content:center">${on ? `<div style="width:7px;height:7px;border-radius:999px;background:${FG}"></div>` : ''}</div><div style="flex:1;font-size:12.5px;font-weight:${on ? 600 : 500}">${esc(name)}</div><div style="display:flex;gap:4px">${tags}</div><div style="${MONO}font-size:11px;color:${FG};min-width:64px;text-align:right">${esc(price)}</div></div>`

const mock1 = frame(label('现状 · 行尾「N 渠道」二级单选') + panel(row('Seedance 2.5', 'BytePlus · 自动 · $0.23/s', { selected: true, tail: `<div style="${MONO}font-size:10.5px;padding:2px 7px;border-radius:999px;background:#ececec">3 渠道</div>` }) + `<div style="margin:4px;padding:6px;border-radius:8px;background:#f5f5f5">${chRow('fal', '$0.47/s', '')}${chRow('火山 Ark', '¥1.8/s', chTag('国内'))}${chRow('BytePlus', '$0.23/s', chTag('自己的 key', GREEN), true)}</div>`, 300))
const mock2 = frame(label('方案 ① 选中行原地展开 · 渠道 = 带理由的单选行') + panel(row('Seedance 2.5', '3 条渠道 · 自动选了 BytePlus', { selected: true }) + `<div style="margin:2px 4px 4px;padding:6px;border-radius:8px;background:#f5f5f5">${chRow('BytePlus', '$0.23/s', chTag('自己的 key', GREEN) + chTag('最便宜', GREEN), true)}${chRow('fal', '$0.47/s', chTag('平台额度'))}${chRow('火山 Ark', '¥1.8/s', chTag('国内直连') + chTag('缺 key', AMBER))}<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px 2px;font-size:11px;color:${MUTED}"><span>✓ 记住这个型号的选择</span><span style="text-decoration:underline">恢复自动</span></div></div>` + row('Seedance 2.0', 'fal · 自动 · $0.20/s'), 320))
const mock3 = frame(label('方案 ② 渠道升格成提示词栏第二颗 chip') + `<div style="display:flex;gap:8px;align-items:center">${chip('Seedance 2.5')}${chip('自动 · BytePlus', { sub: '$0.23/s' })}${chip('30s · 16:9 · 1080p')}</div>` + panel(groupHead('走哪条 · Seedance 2.5') + chRow('自动（自己的 key ＞ 免费额度 ＞ 最便宜）', '', chTag('当前 → BytePlus', GREEN), true) + chRow('BytePlus', '$0.23/s', chTag('自己的 key', GREEN)) + chRow('fal', '$0.47/s', '') + chRow('火山 Ark', '¥1.8/s', chTag('缺 key', AMBER)), 320))
const mock4 = frame(label('方案 ③ 策略而非逐次：全局「路线偏好」+ 例外才手改') + `<div style="display:flex;flex-direction:column;gap:8px"><div style="font-size:12px;color:${MUTED}">设置 · 路线偏好（按模态）</div>${seg([['自己的 key 优先', true], ['最便宜', false], ['最快', false], ['国内可达', false]])}<div style="font-size:11.5px;color:${MUTED}">选择器里每行只显示结果与理由：「BytePlus · 因为你的 key」；点理由才展开改，改了按型号记住。</div></div>`)

const B4 = header('方向 A 里的渠道选择：四种做法 · 已定 ①', '前提不变：渠道是「比价 + 有没有 key + 国内外可达」的执行细节，不是创作决策。所以目标不是让用户更方便地选渠道，而是让 90% 的人永远不用选、10% 的人一眼看懂为什么选了它并能一步改掉。') +
  `<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:14px;margin-top:8px">
    ${optCard('现状 · 行尾「N 渠道」', false, mock1, '型号行尾一枚计数胶囊，点开二级单选；chip 只在手改后附「· 渠道」。', ['信息藏得深，列表干净', '已实现'], ['「3 渠道」是数字不是意义，用户不知道为什么要点', '看不出当前这条是「因为你的 key」还是「因为最便宜」', '缺 key 的渠道混在列表里'])}
    ${optCard('① 选中行原地展开 + 理由标签', true, mock2, '只有当前选中的型号行会展开一段渠道区；每条渠道带理由标签（自己的 key / 平台额度 / 最便宜 / 国内直连 / 缺 key），当前自动选中的那条打勾并写「自动选了 X」。手改即记住，一行「恢复自动」。未选中的行只保留第二行的「渠道 · 自动 · 单价」。', ['把 resolveModelChannel 的 reason 直接变成 UI，用户看到的就是规则本身', '不多一层弹层，不多一颗 chip', '缺 key 的渠道在这里就能点进配置（Hard Rule 8）', '「恢复自动」解决了记忆记住一条坏渠道的问题'], ['选中行变高 ~90px，列表要给它让位（动效走 spring-slot）', '同时只有一个型号能展开，比价跨型号仍要看第二行'])}
    ${optCard('② 渠道升格成第二颗 chip', false, mock3, '提示词栏里模型 chip 旁再放一颗「自动 · BytePlus · $0.23/s」，点开是路线单选，第一项永远是「自动」。', ['渠道与价格永远可见，不用进模型弹层', '与「规格 chip」同一形态'], ['chip 上限 3 的画布通用语言被吃掉一颗', '多数模型只有一条渠道时这颗 chip 是空的或多余', '把执行细节抬到了与模型、规格同级'])}
    ${optCard('③ 全局路线偏好 + 例外手改', false, mock4, '在设置里按模态定一次「自己的 key 优先 / 最便宜 / 最快 / 国内可达」，选择器每行只显示结果与理由，点理由才能改。', ['一次设置，全站生效；国内用户选「国内可达」后火山 / MiniMax 国内站自动优先', '解释成本最低'], ['要新建一个设置项与四种策略的定义（「最快」缺数据）', '例外手改的入口反而更隐蔽', '可与 ① 叠加，不必单选'])}
  </div>` +
  sec('推荐：① 为主，③ 的「国内可达」作为唯一新增策略', '其余策略档目前没有数据支撑') +
  table(['要点', '做法'], [
    ['理由标签词表', 'userKey → 「自己的 key」· freeQuota → 「平台额度」· cheapest → 「最便宜」· manual → 「手选」；再加两枚不进排序的说明标：「国内直连」（volcengine / minimax_cn）· 「缺 key」（灰，可点进 QuickSetupDialog）'],
    ['展开规则', '只有选中行展开；仅 1 条渠道的型号不展开、不显示计数；tiedWith > 0 时在自动那条后加「并列，按清单顺序」'],
    ['价格口径', '第二行与渠道区都用 unit-prices 基准档（720p / 秒 / 含音频），缺价隐藏不占位；货币不换算，¥ 与 $ 并列显示并标货币'],
    ['记忆', '手改按型号 + 模态 scope 记住，只记能跑的；「恢复自动」清掉这条记忆；缺 key 后自动失效的记忆在展开区提示「上次选的 fal 已不可用，已回到自动」'],
    ['chip 显示', '自动时只显型号名；手改后附「· 渠道」；国内可达策略生效时不附（那是策略不是例外）'],
    ['键盘', '→ 展开渠道区 · ↑↓ 在渠道间移动 · Enter 选 · ← 收起；屏幕阅读器读「渠道 X，理由 Y，单价 Z」'],
    ['数据前提', '真实付费 smoke 之前不要显示未核实的价；fal / MiniMax / BytePlus 单价补齐随各自接入（canvas-video-card §6.6）'],
  ])

// ═══════════ Board 5 · 参考素材入口 ═══════════
const tile = (t, sub, w = 96, h = 72, dashed = false) => `<div style="width:${w}px;height:${h}px;border-radius:8px;background:${dashed ? '#fff' : 'linear-gradient(135deg,#e6e6e6,#f4f4f4)'};border:1px ${dashed ? 'dashed #c4c4c4' : 'solid ' + LINE};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;color:${dashed ? MUTED : FG}"><span style="font-weight:600">${esc(t)}</span>${sub ? `<span style="${MONO}font-size:9.5px;color:${MUTED}">${esc(sub)}</span>` : ''}</div>`
const refTabs = (active) => seg([['上传', active === 0], ['最近', active === 1], ['素材库', active === 2], ['粘贴 / 链接', active === 3]])
const refPanel = frame(label('统一弹层 · ReferencePicker（四选一 + 拖放 + 角色）') + panel(`<div style="padding:6px 6px 2px">${refTabs(2)}</div>` +
  `<div style="display:flex;gap:6px;padding:6px"><div style="flex:1;display:flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;background:#f5f5f5;font-size:12px;color:${MUTED}">搜素材 · 文件夹 · 类型</div>${seg([['图', true], ['视频', false], ['音', false]])}</div>` +
  `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">${tile('', '借伞 05')}${tile('', '角色锚')}${tile('', '台词 0:03')}${tile('', '街道')}${tile('', '图')}${tile('', '图')}${tile('', 'LoRA 样图')}${tile('+ 1,284', '还在库里', 96, 72, true)}</div>` +
  `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px 4px;border-top:1px solid ${LINE};font-size:12px"><div style="display:flex;gap:6px;align-items:center"><span style="color:${MUTED}">用途</span>${seg([['参考', true], ['首帧', false], ['尾帧', false], ['角色', false], ['风格', false]])}</div><div style="${MONO}font-size:11px;color:${MUTED}">已选 2 · 上限 9</div></div>`, 440) +
  caption('四个来源 tab 全站同一顺序；素材库页内带搜索 + 类型切换；底部「用途」段只在目标有具名槽时出现（视频关键帧 / 角色卡 / 风格卡），默认「参考」。拖文件到任何触发器上 = 直接走上传路径。'))
const refRail = frame(label('统一参考轨 · ReferenceRail（工作台顶部 / 画布卡下 / 助手附件）') + `<div style="display:flex;gap:8px;align-items:center;padding:8px;background:#fff;border:1px solid ${LINE};border-radius:12px">${tile('', '@1 · 参考', 64, 64)}${tile('', '@2 · 首帧', 64, 64)}${tile('♪', '@3 · 音', 64, 64)}${tile('+', '', 64, 64, true)}<div style="margin-left:auto;display:flex;flex-direction:column;gap:4px;font-size:11px;color:${MUTED};text-align:right"><span>图 2 / 9 · 视频 0 / 3 · 音 1 / 3</span><span style="color:${AMBER}">1 段视频在当前模式下不发送</span></div></div>` + caption('缩略 + 编号（提示词里 @N 引用同号）+ 用途角标；右侧读数带按模型 clamp 的上限；模式切换后不发送的素材保留并提示（canvas-video-card §6.5）。悬停出 移除 / 改用途 / 打开原图。'))

const B5 = header('参考素材入口 · 五份实现 → 一个弹层 + 一条参考轨', '「上传 / 最近 / 素材库 / 粘贴」这件事在工作台、画布、助手、LoRA、3D 各写了一份，四选一的顺序、素材库能不能搜、粘贴要不要按钮、能不能标用途都不一样。G1「参考图接不到素材库」只在部分入口修了。') +
  sec('现状 · 五份实现') +
  table(['入口', '组件', '来源', '差异'], [
    ['图片 / 视频工作台参考轨', 'StudioReferenceRail + ReferenceImageChip + AssetSelectorDialog', '上传 · 最近 · 素材库 · 粘贴', '素材库走独立 Dialog（有搜索 / 分类 / 收藏）；工作台顶部常驻轨'],
    ['画布节点参考轨', 'ReferenceLandingTabs（upload / asset / paste / canvas）', '上传 · 素材库 · 粘贴 · 画布内', '多一个「画布内」来源；粘贴不做按钮（⌘V）；用途靠连线落槽'],
    ['助手附件', 'AssistantReferencePicker', '上传 · 素材库', '与宿主参考轨共用列表（已同步），但入口形态是附件面板'],
    ['LoRA 参考图区', 'LoraWorkbench 自有', '上传 · 粘贴 · 最近 · 素材库', '大预览卡横排 + 全局参考强度；空态只留低高度入口'],
    ['3D 来源图', 'Studio3DWorkspace + AssetSelectorDialog', '素材库 · 本地上传', '单图；只有两个来源'],
  ]) +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px"><div>${refPanel}</div><div>${refRail}${sec('契约', '')}${table(['项', '约定'], [
    ['来源顺序', '上传 · 最近 · 素材库 · 粘贴 / 链接（画布多一个「画布内」，排最后）'],
    ['素材库', '同一个素材浏览器（搜索 / 文件夹 / 类型 / 收藏），弹层内嵌与整页共用组件'],
    ['用途 role', '可选段：参考 / 首帧 / 尾帧 / 角色 / 风格 / 场景，仅当目标有具名槽时出现；与画布 NODE_STUDIO_REFERENCE_ROLES 同一份词表'],
    ['上限', '按模型 send contract clamp；超限的显示为不可用而不是拒收'],
    ['粘贴 / 拖放', '⌘V 与拖放到任何触发器都直达上传路径；「链接」收 URL 与 YouTube（走 video-link 四分法）'],
    ['@ 引用', '进轨即分配编号；删除重排并同步提示词里的 @N'],
  ])}</div></div>`

// ═══════════ Board 6 · 规格 chip ═══════════
const slider = (min, max, val, ticks) => `<div style="width:260px"><div style="display:flex;justify-content:space-between;${MONO}font-size:10.5px;color:${MUTED}"><span>${esc(min)}</span><span style="color:${FG};font-weight:600">${esc(val)}</span><span>${esc(max)}</span></div><div style="position:relative;height:18px;margin-top:4px"><div style="position:absolute;left:0;right:0;top:8px;height:2px;background:#d4d4d4;border-radius:1px"></div>${ticks.map((p) => `<div style="position:absolute;left:${p}%;top:6px;width:2px;height:6px;background:#a3a3a3;border-radius:1px"></div>`).join('')}<div style="position:absolute;left:${ticks[ticks.length - 2]}%;top:2px;width:14px;height:14px;margin-left:-7px;border-radius:999px;background:#fff;border:1.5px solid ${FG};box-shadow:0 1px 2px rgba(0,0,0,.15)"></div></div></div>`
const specChips = frame(label('提示词栏 · 规格 = 一组 chip，每颗一个弹层') + `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${chip('16:9')}${chip('1080p')}${chip('12s')}${chip('有声', { dark: true })}${chip('×4')}${chip('高画质')}${chip('seed 20924', { muted: true })}</div>` + caption('chip 数量按模态裁：图 = 比例 · 尺寸 / 画质 · 张数（· seed 可选）；视频 = 比例 · 清晰度 · 时长 · 声音（· seed）；音频 = 格式 · 采样率 · 延迟；3D = 质量 · 格式。模型没有的档灰掉不藏（node-canvas-v2 §5）。'))
const specPop = frame(label('弹层示例 · 时长滑杆（视频）') + panel(`<div style="padding:10px 10px 6px">${slider('4s', '30s', '12s', [0, 12, 24, 38, 52, 66, 80, 100])}</div><div style="padding:0 10px 8px;font-size:11.5px;color:${MUTED}">按 Seedance 2.5 整秒档吸附 · Kling 上限 15s 时右端自动收到 15</div>`, 300) + label('') + label('弹层示例 · 比例 + 清晰度（一个弹层两段）') + panel(`<div style="padding:8px 10px 4px;${MONO}font-size:10.5px;color:${MUTED}">比例</div><div style="display:flex;gap:6px;padding:0 10px">${[['1:1', 20, 20], ['16:9', 28, 16], ['9:16', 16, 28], ['4:3', 26, 20], ['21:9', 32, 14]].map(([t, w, h], i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border-radius:8px;border:1px solid ${i === 1 ? FG : LINE};min-width:44px"><div style="width:${w}px;height:${h}px;border:1.5px solid ${FG};border-radius:2px"></div><span style="${MONO}font-size:10px">${t}</span></div>`).join('')}</div><div style="padding:10px 10px 4px;${MONO}font-size:10.5px;color:${MUTED}">清晰度</div><div style="padding:0 10px 10px">${seg([['480p', false, '$0.22/s'], ['720p', false, '$0.47/s'], ['1080p', true, '$1.16/s']])}</div>`, 320) + caption('档位从模型 capabilities 派生；档位带单价差（有价才显）；21:9 之类模型不支持的档灰显带「该模型不支持」。'))

const B6 = header('规格 chip · 五份实现 → 一组 chip + 按模态裁剪的弹层', '工作台用一个「规格」触发器合成弹层（比例 · 清晰度 · 时长），画布用逐颗 chip 各自弹层；时长滑杆只有画布有，声音开关只有视频卡有，音频 / 音乐 / 音效又各写一份 SpecPopover。目标：一份 chip 组件 + 一份「档位派生」逻辑，弹层内容按模态裁。') +
  sec('现状 · 五份实现') +
  table(['位置', '组件', '形态', '差异'], [
    ['图片 / 视频工作台参数栏', 'StudioSpecPopover + StudioSpecFields / StudioVideoSpecFields', '单一「规格」触发器 → 合成弹层（三档）', '一次改多项；没有时长滑杆（视频用档位按钮）'],
    ['工作台手机', 'StudioMobileSpecSheet', '底部 Sheet', '内容与桌面弹层不完全同构'],
    ['画布提示词栏', 'ChipPopover ×N', '每颗 chip 一个弹层；时长滑杆（按模型档吸附）；声音开关', '§5 规定 chip ≤3，实际参数多于 3 时怎么收未定'],
    ['音频 / 音效 / 音乐', 'StudioSfxSpecPopover · StudioMusicSpecPopover · 配音间朗读参数', '各一份', '格式 / 采样率 / 延迟 / 时长 / loop 各自排版'],
    ['3D', 'Studio3DWorkspace 参数区', '纵向下拉字段 + 高级折叠', '不是 chip 形态'],
  ]) +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px"><div>${specChips}${sec('契约', '')}${table(['项', '约定'], [
    ['chip 词表', '比例 · 尺寸 / 清晰度 · 时长 · 张数 · 画质 · 声音 · seed · 格式 · 采样率 · 延迟 · 质量；每模态取子集，顺序固定'],
    ['档位派生', '一律从模型 capabilities（supportedDurations / Resolutions / AspectRatios / resolutionDurationMatrix / audio）派生；模型换了档位跟着换，非法组合回默认（§6.5）'],
    ['chip ≤3 规则', '画布：比例 · 清晰度 · 时长 三颗常驻，声音 / seed / 张数收进第三颗的弹层「更多」段；工作台宽处可全部平铺'],
    ['价格', '档位旁显示单价差（有核实价才显）；chip 上不显价'],
    ['灰显', '模型不支持的档灰显可悬停看原因，不隐藏'],
    ['手机', '同一弹层 inline 进底部 Sheet；滑杆拇指 44px'],
  ])}</div><div>${specPop}</div></div>`

for (const [name, html] of [
  ['SharedChannel.dc.html', page('渠道选择四方案', B4)],
  ['SharedReference.dc.html', page('参考素材入口', B5 + reply(23, '最近和素材库是不是冲突了。以及点开还在库里是什么样式。', ['有重叠：「最近」= 最近 20 个被用作参考的东西（不管来自上传 / 粘贴 / 库），素材库 = 全库浏览。合并：去掉「最近」tab，把它变成素材库 tab 打开时的第一段「最近使用」（≤8 张），tab 收成 上传 · 素材库 · 粘贴 / 链接（画布多一个「画布内」）。', '「还在库里」的样式：参考 chip 右下角一枚 12px 库图标；hover 出「素材库 · 文件夹名 · 时间」；点击不换页，右侧滑出素材详情抽屉（与 /assets/[id] 同一组件），抽屉里能「替换为同文件夹另一张」。', '原件被删：chip 变虚线框 + 「原件已删」，仍可用已上传给 provider 的那张出图，但不能再进详情。', '上传 / 粘贴进来的参考自动进「未归档参考」文件夹，所以「还在库里」最终对所有来源成立。']))],
  ['SharedSpec.dc.html', page('规格 chip', B6 + reply(24, '这个我希望放在一个 chip 中。', ['改成一颗合成 chip：「1:1 · 2K · 5s」一颗 chip 显示当前规格摘要（工作台 StudioSpecPopover 的形态推平到画布），点开一个弹层分三段：比例 · 尺寸 / 清晰度 · 时长（视频）。', '声音 / seed / 张数 / 格式 / 采样率收进弹层底部「更多」折叠段；不再逐颗 chip 各自弹层。', '画布提示词栏因此只剩 模型 chip + 规格 chip（+ 参考轨），§5「chip ≤3」改写为 ≤2。', 'hover 显示完整规格与单价差；模型换了档位跟着换，非法组合回默认并在 chip 上闪一次提示。', '手机：同一弹层 inline 进底部 Sheet；三段变纵向。']))],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
