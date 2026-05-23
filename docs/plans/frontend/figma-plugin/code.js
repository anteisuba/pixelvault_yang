figma.showUI(__html__, { width: 360, height: 480, visible: false });

const FONTS = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Medium' },
  { family: 'Inter', style: 'Semi Bold' },
  { family: 'Inter', style: 'Bold' },
];

const ALL_FRAME_NAMES = [
  '02 Empty Canvas',
  '03 Generated Workflow',
  '04 Assistant Dock States',
  '05 Node Anatomy',
  '06 Node State Matrix',
  '07 Composer State Matrix',
  '08 Dock & Topbar Detail',
  '09 Edge States',
  '10 Mobile Stack',
  '11 Mobile Bottom Sheet',
  '12 Connection Topology',
  '13 Hub Node Anatomy',
  '14 Agent Distribute',
  '15 Inspector Variants',
  '16 Model Picker States',
  '17 Default Copy Matrix',
];

const BATCH_TASKS = [
  { name: '06 Node State Matrix', fn: createFrame06, w: 1440, h: 900, replace: true },
  { name: '12 Connection Topology', fn: createFrame12, w: 1440, h: 900, replace: true },
  { name: '13 Hub Node Anatomy', fn: createFrame13, w: 1440, h: 900, replace: true },
  { name: '14 Agent Distribute', fn: createFrame14, w: 1440, h: 900, replace: true },
  { name: '15 Inspector Variants', fn: createFrame15, w: 1440, h: 900, replace: true },
  { name: '16 Model Picker States', fn: createFrame16, w: 1440, h: 900, replace: true },
  { name: '17 Default Copy Matrix', fn: createFrame17, w: 1440, h: 900, replace: true },
];

const FRAME02_NAMES = ['02 Empty Canvas', '02 Desktop A - Empty Canvas'];
const REPORT_WARNINGS = ['颜色使用固定 paint，未绑定 Figma Variables'];

const TOKEN = {
  canvasBg: hex('#0b0b0a'),
  railBg: hex('#030303'),
  panel: hex('#181716'),
  panelInset: hex('#1f1d1b'),
  chip: hex('#22211f'),
  chipHover: hex('#2d2b28'),
  preview: hex('#2d2b28'),
  hairline: withAlpha(hex('#f4f1ea'), 0.08),
  hairline2: withAlpha(hex('#f4f1ea'), 0.15),
  hairline3: withAlpha(hex('#f4f1ea'), 0.25),
  text1: hex('#f4f1ea'),
  text2: hex('#a6a098'),
  text3: hex('#6f6a63'),
  textOnLight: hex('#0d0c0b'),
  amber: hex('#f59e0b'),
  emerald: hex('#22c55e'),
  rose: hex('#e11d48'),
  slate: hex('#94a3b8'),
  violet: hex('#a78bfa'),
  ctaBg: hex('#f4f1ea'),
  ctaBgHover: hex('#ffffff'),
};

const R = {
  card: 22,
  pill: 23,
  chip: 999,
  inner: 16,
  dockItem: 12,
  iconPlate: 10,
};

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'run') return;

  try {
    await runGenerator(msg.overwrite === true);
    figma.ui.postMessage({ type: 'done' });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: String((e && e.message) || e) });
  }
};

void autoRun();

async function autoRun() {
  try {
    const reports = await runGenerator(false);
    if (reports.length) {
      const lines = reports.map((report) => {
        return report.frameName + ' / ' + report.nodeId + ' / 元素数 ' + report.elementCount;
      });
      const summary = lines.join('\n');
      figma.notify(summary, { timeout: 30000 });
      figma.closePlugin(summary);
      return;
    }
    figma.closePlugin('未创建或找到目标 frame');
  } catch (e) {
    const message = String((e && e.message) || e);
    figma.notify('Frame 06/12-17 生成失败: ' + message, { error: true, timeout: 10000 });
    figma.closePlugin('Frame 06/12-17 生成失败: ' + message);
  }
}

function log(text) {
  figma.ui.postMessage({ type: 'log', text });
}

async function loadFonts() {
  for (const f of FONTS) {
    await figma.loadFontAsync(f);
  }
}

async function runGenerator(overwrite) {
  await loadFonts();
  log('字体加载完成');
  log('当前批次生成: ' + BATCH_TASKS.map((task) => task.name).join(' / '));

  const page = figma.currentPage;
  const targetNames = BATCH_TASKS.map((task) => task.name);
  const reports = [];

  for (const task of BATCH_TASKS) {
    const existingFrame = page.children.find((child) => child.name === task.name);
    let position = null;

    if (existingFrame && (overwrite || task.replace)) {
      position = { x: existingFrame.x, y: existingFrame.y };
      existingFrame.remove();
      log('已替换旧 frame: ' + task.name);
    } else if (existingFrame && !overwrite) {
      selectFrame(existingFrame);
      const report = {
        frameName: existingFrame.name,
        nodeId: existingFrame.id,
        elementCount: countElements(existingFrame) - 1,
        warnings: ['已存在，未重复创建'].concat(REPORT_WARNINGS),
      };
      reports.push(report);
      figma.ui.postMessage({ type: 'frame-report', report });
      continue;
    }

    log('生成中: ' + task.name);
    if (!position) {
      position = getNextFramePosition(page, task.w || 1440);
    }
    const frame = await task.fn(page, position.x, position.y);
    selectFrame(frame);
    const report = {
      frameName: frame.name,
      nodeId: frame.id,
      elementCount: countElements(frame) - 1,
      warnings: REPORT_WARNINGS,
    };
    reports.push(report);
    figma.ui.postMessage({ type: 'frame-report', report });
    log('完成 ' + task.name + ' / node-id: ' + frame.id);
  }

  const created = page.children.filter((child) => targetNames.includes(child.name));
  if (created.length) {
    figma.viewport.scrollAndZoomIntoView(created);
  }

  return reports;
}

function selectFrame(frame) {
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

function getFrame03Position(page) {
  const frame02 = page.children.find((child) => FRAME02_NAMES.includes(child.name));
  if (frame02) {
    return { x: frame02.x, y: frame02.y + frame02.height + 60 };
  }

  return { x: 0, y: 960 };
}

function getNextFramePosition(page, width) {
  const candidates = page.children.filter((child) => {
    return 'width' in child && 'height' in child && ALL_FRAME_NAMES.includes(child.name);
  });

  if (!candidates.length) {
    return getFrame03Position(page);
  }

  let bottomFrame = candidates[0];
  for (const child of candidates) {
    if (child.y + child.height > bottomFrame.y + bottomFrame.height) {
      bottomFrame = child;
    }
  }

  let nextX = bottomFrame.x;
  if (width < bottomFrame.width) {
    nextX = bottomFrame.x + (bottomFrame.width - width) / 2;
  }

  return { x: nextX, y: bottomFrame.y + bottomFrame.height + 60 };
}

function countElements(node) {
  let count = 1;
  if ('children' in node) {
    for (const child of node.children) {
      count += countElements(child);
    }
  }
  return count;
}

function hex(h, a = 1) {
  const m = h.replace('#', '');
  return {
    r: parseInt(m.slice(0, 2), 16) / 255,
    g: parseInt(m.slice(2, 4), 16) / 255,
    b: parseInt(m.slice(4, 6), 16) / 255,
    a,
  };
}

function withAlpha(color, a) {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a,
  };
}

function fill(color, opacity) {
  const alpha = opacity === undefined ? color.a : opacity;
  return [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: alpha }];
}

function stroke(color, opacity) {
  const alpha = opacity === undefined ? color.a : opacity;
  return [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: alpha }];
}

function makeFrame({ name, x, y, w, h, fillColor, radius, strokeColor, strokeWidth = 1, parent }) {
  const f = figma.createFrame();
  f.name = name;
  f.x = x;
  f.y = y;
  f.resize(w, h);
  f.fills = fillColor ? fill(fillColor) : [];

  if (radius !== undefined) {
    f.cornerRadius = radius;
  }

  if (strokeColor) {
    f.strokes = stroke(strokeColor);
    f.strokeWeight = strokeWidth;
  }

  f.clipsContent = true;

  if (parent) {
    parent.appendChild(f);
  }

  return f;
}

async function makeText({
  x,
  y,
  w,
  h,
  characters,
  fontSize,
  fontFamily = 'Inter',
  fontStyle = 'Regular',
  color,
  opacity = 1,
  align = 'LEFT',
  parent,
  lineHeight,
  letterSpacing,
}) {
  await figma.loadFontAsync({ family: fontFamily, style: fontStyle });

  const t = figma.createText();
  t.fontName = { family: fontFamily, style: fontStyle };
  t.characters = characters;
  t.fontSize = fontSize;
  t.fills = fill(color, opacity);
  t.x = x;
  t.y = y;

  if (w !== undefined) {
    t.resize(w, h || fontSize + 6);
    t.textAutoResize = 'HEIGHT';
  }

  if (align === 'CENTER') {
    t.textAlignHorizontal = 'CENTER';
  }

  if (align === 'RIGHT') {
    t.textAlignHorizontal = 'RIGHT';
  }

  if (lineHeight) {
    t.lineHeight = { value: lineHeight, unit: 'PIXELS' };
  }

  if (letterSpacing) {
    t.letterSpacing = { value: letterSpacing, unit: 'PIXELS' };
  }

  if (parent) {
    parent.appendChild(t);
  }

  return t;
}

function makePill({ name, x, y, w, h, parent }) {
  return makeFrame({
    name,
    x,
    y,
    w,
    h,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
}

function shadow() {
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.5 },
    offset: { x: 0, y: 20 },
    radius: 60,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  };
}

function popShadow() {
  return {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.6 },
    offset: { x: 0, y: 24 },
    radius: 80,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  };
}

function makeCircle({ name, x, y, size, fillColor, strokeColor, strokeWidth = 1, opacity = 1, parent }) {
  const c = figma.createEllipse();
  c.name = name;
  c.x = x;
  c.y = y;
  c.resize(size, size);
  c.fills = fillColor ? fill(fillColor, opacity) : [];

  if (strokeColor) {
    c.strokes = stroke(strokeColor);
    c.strokeWeight = strokeWidth;
  }

  if (parent) {
    parent.appendChild(c);
  }

  return c;
}

function makeLine({ name, from, to, color, strokeWidth = 1, parent }) {
  const v = figma.createVector();
  v.name = name;
  v.vectorPaths = [{
    windingRule: 'NONE',
    data: 'M ' + from.x + ' ' + from.y + ' L ' + to.x + ' ' + to.y,
  }];
  v.strokes = stroke(color);
  v.strokeWeight = strokeWidth;

  if (parent) {
    parent.appendChild(v);
  }

  return v;
}

function setDashed(node, pattern) {
  if ('dashPattern' in node) {
    node.dashPattern = pattern;
  }
}

async function makeChip({ parent, x, y, w, h, label, fillColor = TOKEN.chip, textColor = TOKEN.text2 }) {
  const chip = makeFrame({
    name: 'Chip / ' + label,
    x,
    y,
    w,
    h,
    fillColor,
    radius: R.chip,
    strokeColor: TOKEN.hairline,
    parent,
  });

  await makeText({
    parent: chip,
    x: 0,
    y: Math.round((h - 14) / 2),
    w,
    h: 16,
    characters: label,
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: textColor,
    align: 'CENTER',
  });

  return chip;
}

async function makeIconButton({ parent, x, y, size, label, fillColor = TOKEN.chip, textColor = TOKEN.text2, radius = R.dockItem }) {
  const button = makeFrame({
    name: 'Icon Button / ' + label,
    x,
    y,
    w: size,
    h: size,
    fillColor,
    radius,
    strokeColor: fillColor === TOKEN.ctaBg ? undefined : TOKEN.hairline,
    parent,
  });

  await makeText({
    parent: button,
    x: 0,
    y: Math.round((size - 16) / 2),
    w: size,
    h: 18,
    characters: label,
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: textColor,
    align: 'CENTER',
  });

  return button;
}

async function createFrame02(parent, baseX, baseY) {
  const art = makeFrame({
    name: '02 Empty Canvas',
    x: baseX,
    y: baseY,
    w: 1440,
    h: 900,
    fillColor: TOKEN.canvasBg,
    radius: R.card,
    strokeColor: TOKEN.chipHover,
    parent,
  });
  art.effects = [popShadow()];

  await createCanvasBackground(art);
  await createSidebar(art, 0, 0);
  await createTopBar(art, 247, 21, {
    projectName: '未命名项目',
    eyebrow: '节点工作流',
    nodeCount: '2 个节点',
  });

  await createEdge(
    art,
    { x: 446 + 280, y: 400 },
    { x: 546 + 180, y: 110 + 240 },
    { animated: true, color: TOKEN.hairline3 }
  );

  await createComposerNode(art, 446, 400, {
    placeholder: '输入你的创意或请求，可添加上游连线以引入参考素材',
    sendDisabled: true,
  });

  await createAgentNode(art, 546, 110, { state: 'empty' });
  await createAssistantDock(art, 1440 - 20 - 336, 20, { state: 'empty' });
  await createBottomDock(art, (1440 - 332) / 2, 900 - 20 - 50, {
    activeMode: 'pointer',
    zoomPercent: 100,
  });
  await createMinimap(art, 20, 900 - 20 - 132);
}

async function createCanvasBackground(parent) {
  const glow = makeCircle({
    name: 'Canvas amber glow',
    x: 940,
    y: -240,
    size: 660,
    fillColor: TOKEN.amber,
    opacity: 0.08,
    parent,
  });
  glow.effects = [{
    type: 'LAYER_BLUR',
    radius: 100,
    visible: true,
  }];

  for (let x = 236; x < 1068; x += 56) {
    for (let y = 0; y < 900; y += 56) {
      makeCircle({
        name: 'Canvas grid dot',
        x,
        y,
        size: 1,
        fillColor: TOKEN.text1,
        opacity: 0.12,
        parent,
      });
    }
  }
}

async function createSidebar(parent, x, y) {
  const sidebar = makeFrame({
    name: 'Sidebar',
    x,
    y,
    w: 226,
    h: 900,
    fillColor: TOKEN.railBg,
    parent,
  });

  await makeText({
    parent: sidebar,
    x: 15,
    y: 23,
    characters: 'PixelVault',
    fontSize: 28,
    fontStyle: 'Bold',
    color: TOKEN.text1,
  });

  await makeText({
    parent: sidebar,
    x: 190,
    y: 31,
    characters: '‹',
    fontSize: 20,
    fontStyle: 'Medium',
    color: TOKEN.text2,
  });

  const mainNav = [
    { icon: '□', label: '画廊' },
    { icon: '⌗', label: '提示词' },
    { icon: '◫', label: '素材' },
    { icon: '▤', label: '卡片管理' },
  ];

  for (let i = 0; i < mainNav.length; i += 1) {
    await createSidebarItem(sidebar, 17, 96 + i * 34, mainNav[i], false);
  }

  makeLine({
    name: 'Sidebar divider',
    from: { x: 14, y: 282 },
    to: { x: 212, y: 282 },
    color: TOKEN.hairline,
    parent: sidebar,
  });

  await makeText({
    parent: sidebar,
    x: 15,
    y: 303,
    characters: '工具',
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1.1,
  });

  const toolNav = [
    { icon: '□', label: '图像' },
    { icon: '▱', label: '视频' },
    { icon: '♪', label: '音频' },
    { icon: '◈', label: '3D' },
    { icon: '✎', label: '编辑' },
    { icon: '◎', label: 'LoRA' },
    { icon: '⌬', label: '节点编辑' },
    { icon: '⚔', label: '竞技场' },
  ];

  for (let i = 0; i < toolNav.length; i += 1) {
    await createSidebarItem(sidebar, 17, 332 + i * 34, toolNav[i], toolNav[i].label === '节点编辑');
  }

  await createSidebarCredits(sidebar);
  await createLanguageSwitch(sidebar);
}

async function createSidebarItem(parent, x, y, item, active) {
  if (active) {
    makeFrame({
      name: 'Sidebar active item',
      x: 9,
      y: y - 7,
      w: 206,
      h: 30,
      fillColor: TOKEN.chip,
      radius: R.dockItem,
      parent,
    });
  }

  await makeText({
    parent,
    x,
    y,
    characters: item.icon,
    fontSize: 16,
    fontStyle: 'Medium',
    color: active ? TOKEN.text1 : TOKEN.text2,
  });

  await makeText({
    parent,
    x: x + 24,
    y: y + 1,
    characters: item.label,
    fontSize: 13,
    fontStyle: 'Medium',
    color: active ? TOKEN.text1 : TOKEN.text2,
  });
}

async function createSidebarCredits(parent) {
  const card = makeFrame({
    name: 'Credits card',
    x: 9,
    y: 723,
    w: 206,
    h: 54,
    fillColor: TOKEN.canvasBg,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });

  await makeText({
    parent: card,
    x: 14,
    y: 9,
    characters: '334',
    fontSize: 13,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });

  await makeText({
    parent: card,
    x: 14,
    y: 29,
    characters: '今日免费',
    fontSize: 11,
    fontStyle: 'Medium',
    color: TOKEN.text2,
  });

  await makeText({
    parent: card,
    x: 145,
    y: 29,
    characters: '20 / 20',
    fontSize: 11,
    fontStyle: 'Medium',
    color: TOKEN.text2,
  });
}

async function createLanguageSwitch(parent) {
  const lang = makeFrame({
    name: 'Language switch',
    x: 9,
    y: 811,
    w: 206,
    h: 50,
    fillColor: TOKEN.chip,
    radius: R.pill,
    parent,
  });

  const labels = ['EN', 'JA', 'ZH'];

  for (let i = 0; i < labels.length; i += 1) {
    const itemX = 10 + i * 62;

    if (i === 0) {
      makeFrame({
        name: 'Language active',
        x: itemX,
        y: 6,
        w: 38,
        h: 38,
        fillColor: TOKEN.text1,
        radius: R.chip,
        parent: lang,
      });
    }

    await makeText({
      parent: lang,
      x: itemX,
      y: 17,
      w: 38,
      h: 14,
      characters: labels[i],
      fontSize: 11,
      fontStyle: 'Semi Bold',
      color: i === 0 ? TOKEN.textOnLight : TOKEN.text2,
      align: 'CENTER',
    });
  }
}

async function createTopBar(parent, x, y, props) {
  await createProjectPill(parent, x, y, props);

  const actionX = x + 272;
  const actionWidth = props.includeWorkflow ? 390 : 282;
  await createActionGroup(parent, actionX, y, props);

  const creditsX = actionX + actionWidth + 12;
  await createCreditsPill(parent, creditsX, y);

  await createRoutePill(parent, creditsX + 82 + 12, y);
}

async function createProjectPill(parent, x, y, props) {
  const pill = makePill({ name: 'Project pill', x, y, w: 260, h: 56, parent });

  makeFrame({
    name: 'Project icon plate',
    x: 14,
    y: 11,
    w: 34,
    h: 34,
    fillColor: TOKEN.chip,
    radius: R.iconPlate,
    parent: pill,
  });

  await makeText({
    parent: pill,
    x: 14,
    y: 20,
    w: 34,
    h: 16,
    characters: 'N',
    fontSize: 14,
    fontStyle: 'Bold',
    color: TOKEN.amber,
    align: 'CENTER',
  });

  await makeText({
    parent: pill,
    x: 58,
    y: 11,
    characters: props.eyebrow,
    fontSize: 10,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1,
  });

  await makeText({
    parent: pill,
    x: 58,
    y: 28,
    w: 116,
    h: 18,
    characters: props.projectName,
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });

  makeLine({
    name: 'Project pill divider',
    from: { x: 190, y: 14 },
    to: { x: 190, y: 42 },
    color: TOKEN.hairline,
    parent: pill,
  });

  await makeText({
    parent: pill,
    x: 204,
    y: 22,
    characters: props.nodeCount,
    fontSize: 11,
    fontStyle: 'Medium',
    color: TOKEN.text2,
  });
}

async function createActionGroup(parent, x, y, props = {}) {
  const group = makeFrame({
    name: 'Top action group',
    x,
    y: y + 5,
    w: props.includeWorkflow ? 390 : 282,
    h: 46,
    fillColor: TOKEN.panel,
    radius: R.pill,
    strokeColor: TOKEN.hairline,
    parent,
  });

  await makeTopActionButton(group, 6, 6, 96, '+ 添加节点', TOKEN.ctaBg, TOKEN.textOnLight);
  await makeTopActionButton(group, 106, 6, 82, '⤧ 整理', TOKEN.chip, TOKEN.text2);
  await makeTopActionButton(group, 192, 6, 84, '💾 草稿', TOKEN.chip, TOKEN.text2);

  if (props.includeWorkflow) {
    await makeTopActionButton(group, 280, 6, 104, '导出工作流', TOKEN.chip, TOKEN.text2);
  }
}

async function makeTopActionButton(parent, x, y, w, label, fillColor, textColor) {
  const button = makeFrame({
    name: 'Top action / ' + label,
    x,
    y,
    w,
    h: 34,
    fillColor,
    radius: R.chip,
    parent,
  });

  await makeText({
    parent: button,
    x: 0,
    y: 10,
    w,
    h: 14,
    characters: label,
    fontSize: 12,
    fontStyle: 'Semi Bold',
    color: textColor,
    align: 'CENTER',
  });
}

async function createCreditsPill(parent, x, y) {
  const pill = makeFrame({
    name: 'Credits pill',
    x,
    y: y + 5,
    w: 82,
    h: 46,
    fillColor: TOKEN.panel,
    radius: R.pill,
    strokeColor: TOKEN.hairline,
    parent,
  });

  await makeText({
    parent: pill,
    x: 17,
    y: 16,
    characters: '✦',
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: TOKEN.amber,
  });

  await makeText({
    parent: pill,
    x: 36,
    y: 16,
    characters: '1.0K',
    fontSize: 12,
    fontStyle: 'Semi Bold',
    color: TOKEN.text2,
  });
}

async function createRoutePill(parent, x, y) {
  const pill = makeFrame({
    name: 'Route pill',
    x,
    y: y + 5,
    w: 176,
    h: 46,
    fillColor: TOKEN.panel,
    radius: R.pill,
    strokeColor: TOKEN.hairline,
    parent,
  });

  makeCircle({
    name: 'Route status',
    x: 16,
    y: 19,
    size: 8,
    fillColor: TOKEN.emerald,
    parent: pill,
  });

  await makeText({
    parent: pill,
    x: 32,
    y: 16,
    w: 132,
    h: 16,
    characters: 'API 路由 · 13 个启用',
    fontSize: 12,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });
}

async function createComposerNode(parent, x, y, props) {
  const node = makeFrame({
    name: 'Composer node',
    x,
    y,
    w: 560,
    h: 180,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  node.clipsContent = false;
  node.effects = [shadow()];

  const attach = makeFrame({
    name: 'Attach slot',
    x: 12,
    y: 12,
    w: 48,
    h: 48,
    fillColor: TOKEN.panelInset,
    radius: R.inner,
    strokeColor: TOKEN.hairline2,
    parent: node,
  });
  setDashed(attach, [4, 4]);

  await makeText({
    parent: attach,
    x: 0,
    y: 15,
    w: 48,
    h: 18,
    characters: '□',
    fontSize: 16,
    fontStyle: 'Medium',
    color: TOKEN.text3,
    align: 'CENTER',
  });

  await makeText({
    parent: node,
    x: 530,
    y: 14,
    w: 18,
    h: 18,
    characters: '⤢',
    fontSize: 16,
    fontStyle: 'Regular',
    color: TOKEN.text2,
    align: 'CENTER',
  });

  await makeText({
    parent: node,
    x: 78,
    y: 48,
    w: 396,
    h: 60,
    characters: props.prompt || props.placeholder,
    fontSize: 14,
    fontStyle: 'Regular',
    color: props.prompt ? TOKEN.text1 : TOKEN.text3,
    lineHeight: 22,
  });

  await makeChip({
    parent: node,
    x: 12,
    y: 140,
    w: 102,
    h: 28,
    label: '⌗ Agent 模式 ▾',
  });

  await makeChip({
    parent: node,
    x: 122,
    y: 140,
    w: 82,
    h: 28,
    label: '💬 询问 ▾',
  });

  await makeChip({
    parent: node,
    x: 212,
    y: 140,
    w: 78,
    h: 28,
    label: '✨ 技能库',
  });

  const sendFill = props.sendDisabled ? TOKEN.ctaBg : TOKEN.ctaBgHover;
  const send = makeFrame({
    name: 'Send button',
    x: 512,
    y: 128,
    w: 36,
    h: 36,
    fillColor: sendFill,
    radius: R.chip,
    parent: node,
  });
  send.opacity = props.sendDisabled ? 0.35 : 1;

  await makeText({
    parent: send,
    x: 0,
    y: 9,
    w: 36,
    h: 18,
    characters: props.loading ? '⟳' : '↑',
    fontSize: 16,
    fontStyle: 'Bold',
    color: TOKEN.textOnLight,
    opacity: props.sendDisabled ? 0.6 : 1,
    align: 'CENTER',
  });

  createPort(node, -5, 85);
  createPort(node, 555, 85);

  return node;
}

async function createAgentNode(parent, x, y, props) {
  const node = makeFrame({
    name: 'Agent node',
    x,
    y,
    w: 360,
    h: 240,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: props.selected ? TOKEN.ctaBg : TOKEN.hairline,
    strokeWidth: props.selected ? 1.5 : 1,
    parent,
  });
  node.clipsContent = false;
  node.effects = [shadow()];

  const inner = makeFrame({
    name: 'Agent inner card',
    x: 9,
    y: 9,
    w: 340,
    h: 222,
    fillColor: TOKEN.preview,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: node,
  });

  await makeChip({
    parent: inner,
    x: 8,
    y: 8,
    w: 74,
    h: 24,
    label: '🤖 Agent',
  });

  if (props.state === 'empty') {
    await createAgentEmptyState(inner);
  } else if (props.state === 'done') {
    await createAgentDoneState(inner, props);
  } else {
    throw new Error('Agent state not implemented in batch 1: ' + props.state);
  }

  createPort(node, -5, 115);
  createPort(node, 355, 115);

  return node;
}

async function createAgentDoneState(parent, props) {
  await makeIconButton({
    parent,
    x: 304,
    y: 8,
    size: 28,
    label: '⤢',
    fillColor: TOKEN.preview,
    textColor: TOKEN.text2,
  });

  await makeText({
    parent,
    x: 18,
    y: 50,
    w: 304,
    h: 36,
    characters: props.logline,
    fontSize: 12,
    fontStyle: 'Regular',
    color: TOKEN.text1,
    lineHeight: 18,
  });

  const counters = props.counters || [
    { label: '角色', value: '3' },
    { label: '场景', value: '4' },
    { label: '行为', value: '7' },
    { label: '段落', value: '8' },
    { label: '镜头', value: '12' },
  ];

  for (let i = 0; i < counters.length; i += 1) {
    const card = makeFrame({
      name: 'Counter / ' + counters[i].label,
      x: 18 + i * 62,
      y: 108,
      w: 52,
      h: 40,
      fillColor: TOKEN.panel,
      radius: R.dockItem,
      strokeColor: withAlpha(TOKEN.text1, 0.06),
      parent,
    });

    await makeText({
      parent: card,
      x: 0,
      y: 6,
      w: 52,
      h: 12,
      characters: counters[i].label,
      fontSize: 10,
      fontStyle: 'Regular',
      color: TOKEN.text3,
      align: 'CENTER',
    });

    await makeText({
      parent: card,
      x: 0,
      y: 22,
      w: 52,
      h: 12,
      characters: counters[i].value,
      fontSize: 11,
      fontStyle: 'Semi Bold',
      color: TOKEN.text1,
      align: 'CENTER',
    });
  }

  makeLine({
    name: 'Agent footer divider',
    from: { x: 18, y: 166 },
    to: { x: 322, y: 166 },
    color: TOKEN.hairline,
    parent,
  });

  await makeText({
    parent,
    x: 18,
    y: 180,
    w: 120,
    h: 14,
    characters: props.planner || 'Gemini 3 Pro',
    fontSize: 10,
    fontStyle: 'Medium',
    color: TOKEN.text1,
  });

  await makeChip({
    parent,
    x: 270,
    y: 174,
    w: 48,
    h: 24,
    label: props.copyRisk || '原创',
  });
}

async function createAgentEmptyState(parent) {
  await makeText({
    parent,
    x: 0,
    y: 74,
    w: 340,
    h: 38,
    characters: '🤖',
    fontSize: 34,
    fontStyle: 'Regular',
    color: TOKEN.text1,
    align: 'CENTER',
  });

  await makeText({
    parent,
    x: 0,
    y: 123,
    w: 340,
    h: 16,
    characters: '等待 Composer 输入',
    fontSize: 12,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
    align: 'CENTER',
  });

  await makeText({
    parent,
    x: 40,
    y: 147,
    w: 260,
    h: 34,
    characters: '把 Composer 节点连接到这里，发送后会在这显示 Agent 拆解的剧本结构。',
    fontSize: 11,
    fontStyle: 'Regular',
    color: TOKEN.text2,
    align: 'CENTER',
    lineHeight: 16,
  });
}

function createPort(parent, x, y) {
  makeCircle({
    name: 'Node port',
    x,
    y,
    size: 10,
    fillColor: TOKEN.chip,
    strokeColor: TOKEN.hairline3,
    parent,
  });
}

async function createAssistantDock(parent, x, y, props) {
  if (props.state !== 'empty') {
    throw new Error('Assistant dock state not implemented in batch 1: ' + props.state);
  }

  const dock = makeFrame({
    name: 'Assistant dock / empty',
    x,
    y,
    w: 336,
    h: 860,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  dock.effects = [shadow()];

  await createAssistantDockHeader(dock);
  makeLine({
    name: 'Assistant divider',
    from: { x: 0, y: 60 },
    to: { x: 336, y: 60 },
    color: TOKEN.hairline,
    parent: dock,
  });
  await createAssistantGreeting(dock);
  await createAssistantSubLinks(dock);
  await createAssistantComposer(dock);
}

async function createAssistantDockInspector(parent, x, y) {
  const dock = makeFrame({
    name: 'Assistant dock / inspector',
    x,
    y,
    w: 336,
    h: 860,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  dock.effects = [shadow()];

  await makeText({
    parent: dock,
    x: 13,
    y: 22,
    characters: '✺',
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: TOKEN.amber,
  });

  await makeText({
    parent: dock,
    x: 34,
    y: 21,
    characters: 'updream',
    fontSize: 13,
    fontStyle: 'Bold',
    color: TOKEN.text1,
  });

  await makeChip({
    parent: dock,
    x: 110,
    y: 13,
    w: 92,
    h: 34,
    label: '+ 新建对话',
  });

  await makeChip({
    parent: dock,
    x: 208,
    y: 13,
    w: 92,
    h: 34,
    label: '⚙ 检查器',
  });

  await makeIconButton({
    parent: dock,
    x: 302,
    y: 16,
    size: 28,
    label: '×',
    fillColor: TOKEN.panel,
    textColor: TOKEN.text2,
  });

  makeLine({
    name: 'Inspector divider',
    from: { x: 0, y: 60 },
    to: { x: 336, y: 60 },
    color: TOKEN.hairline,
    parent: dock,
  });

  const selected = makeFrame({
    name: 'Selected node card',
    x: 12,
    y: 76,
    w: 312,
    h: 60,
    fillColor: TOKEN.panelInset,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: dock,
  });

  await makeChip({
    parent: selected,
    x: 12,
    y: 10,
    w: 74,
    h: 24,
    label: '🤖 Agent',
  });
  makeCircle({
    name: 'Selected node status',
    x: 282,
    y: 18,
    size: 8,
    fillColor: TOKEN.emerald,
    parent: selected,
  });
  await makeText({
    parent: selected,
    x: 12,
    y: 36,
    w: 140,
    h: 14,
    characters: '未命名 Agent',
    fontSize: 13,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });

  await makeText({
    parent: dock,
    x: 18,
    y: 160,
    characters: 'PROMPT',
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1,
  });

  const prompt = makeFrame({
    name: 'Prompt textarea',
    x: 12,
    y: 180,
    w: 312,
    h: 108,
    fillColor: TOKEN.panelInset,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: dock,
  });

  await makeText({
    parent: prompt,
    x: 14,
    y: 14,
    w: 268,
    h: 44,
    characters: '三个角色在废弃车站发现会预言未来的旧相机',
    fontSize: 12,
    fontStyle: 'Regular',
    color: TOKEN.text2,
    lineHeight: 18,
  });

  await makeText({
    parent: dock,
    x: 18,
    y: 314,
    characters: 'PLANNER MODEL',
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1,
  });

  await makeChip({
    parent: dock,
    x: 12,
    y: 334,
    w: 148,
    h: 34,
    label: 'Gemini 3 Pro ▾',
    textColor: TOKEN.text1,
  });

  await makeText({
    parent: dock,
    x: 18,
    y: 404,
    characters: 'BREAKDOWN',
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1,
  });

  const breakdown = makeFrame({
    name: 'Breakdown counters',
    x: 12,
    y: 424,
    w: 312,
    h: 92,
    fillColor: TOKEN.panelInset,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: dock,
  });

  const values = ['3', '4', '7', '8', '12'];
  const labels = ['角色', '场景', '行为', '段落', '镜头'];
  for (let i = 0; i < values.length; i += 1) {
    await makeText({
      parent: breakdown,
      x: 18 + i * 56,
      y: 22,
      w: 32,
      h: 18,
      characters: values[i],
      fontSize: 16,
      fontStyle: 'Bold',
      color: TOKEN.text1,
      align: 'CENTER',
    });
    await makeText({
      parent: breakdown,
      x: 18 + i * 56,
      y: 50,
      w: 32,
      h: 14,
      characters: labels[i],
      fontSize: 10,
      fontStyle: 'Regular',
      color: TOKEN.text3,
      align: 'CENTER',
    });
  }

  const open = makeFrame({
    name: 'Open full structure button',
    x: 24,
    y: 540,
    w: 150,
    h: 34,
    fillColor: TOKEN.ctaBg,
    radius: R.chip,
    parent: dock,
  });

  await makeText({
    parent: open,
    x: 0,
    y: 10,
    w: 150,
    h: 14,
    characters: '查看完整结构 →',
    fontSize: 12,
    fontStyle: 'Semi Bold',
    color: TOKEN.textOnLight,
    align: 'CENTER',
  });

  await makeText({
    parent: dock,
    x: 18,
    y: 604,
    characters: 'OUTPUT HISTORY',
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1,
  });

  for (let i = 0; i < 3; i += 1) {
    const row = makeFrame({
      name: 'Output history row ' + (i + 1),
      x: 12,
      y: 628 + i * 46,
      w: 312,
      h: 36,
      fillColor: TOKEN.panelInset,
      radius: R.dockItem,
      strokeColor: TOKEN.hairline,
      parent: dock,
    });
    makeFrame({
      name: 'Output history thumb',
      x: 12,
      y: 6,
      w: 24,
      h: 24,
      fillColor: TOKEN.chip,
      radius: 6,
      parent: row,
    });
    await makeText({
      parent: row,
      x: 48,
      y: 11,
      w: 92,
      h: 14,
      characters: '今天 20:' + String(40 + i),
      fontSize: 11,
      fontStyle: 'Regular',
      color: TOKEN.text2,
    });
  }

  const composer = makeFrame({
    name: 'Inspector composer',
    x: 12,
    y: 738,
    w: 312,
    h: 110,
    fillColor: TOKEN.panelInset,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: dock,
  });

  await makeText({
    parent: composer,
    x: 12,
    y: 12,
    w: 248,
    h: 34,
    characters: '对这个 Agent 提问、要求修改…',
    fontSize: 12,
    fontStyle: 'Regular',
    color: TOKEN.text3,
    lineHeight: 17,
  });

  await makeChip({
    parent: composer,
    x: 176,
    y: 70,
    w: 76,
    h: 28,
    label: '💬 询问 ▾',
  });

  await makeIconButton({
    parent: composer,
    x: 264,
    y: 68,
    size: 32,
    label: '↑',
    fillColor: TOKEN.ctaBg,
    textColor: TOKEN.textOnLight,
    radius: R.chip,
  });
}

async function createAssistantDockHeader(parent) {
  await makeText({
    parent,
    x: 13,
    y: 22,
    characters: '✺',
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: TOKEN.amber,
  });

  await makeText({
    parent,
    x: 34,
    y: 21,
    characters: 'updream',
    fontSize: 13,
    fontStyle: 'Bold',
    color: TOKEN.text1,
  });

  await makeChip({
    parent,
    x: 110,
    y: 13,
    w: 92,
    h: 34,
    label: '+ 新建对话',
  });

  await makeChip({
    parent,
    x: 208,
    y: 13,
    w: 92,
    h: 34,
    label: 'AI 助手 ▾',
  });

  await makeIconButton({
    parent,
    x: 302,
    y: 16,
    size: 28,
    label: '×',
    fillColor: TOKEN.panel,
    textColor: TOKEN.text2,
  });
}

async function createAssistantGreeting(parent) {
  await makeText({
    parent,
    x: 0,
    y: 329,
    w: 336,
    h: 40,
    characters: '👋',
    fontSize: 32,
    fontStyle: 'Regular',
    color: TOKEN.text1,
    align: 'CENTER',
  });

  await makeText({
    parent,
    x: 48,
    y: 380,
    w: 240,
    h: 18,
    characters: '你好！输入你的创意',
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
    align: 'CENTER',
  });

  await makeText({
    parent,
    x: 48,
    y: 406,
    w: 240,
    h: 42,
    characters: '我来帮你完成剧本、分镜、角色设计等工作。',
    fontSize: 14,
    fontStyle: 'Regular',
    color: TOKEN.text2,
    align: 'CENTER',
    lineHeight: 21,
  });
}

async function createAssistantSubLinks(parent) {
  const links = ['✨ 技能库', '🌐 技能社区', '🎨 风格指导'];

  for (let i = 0; i < links.length; i += 1) {
    await makeText({
      parent,
      x: 16 + i * 104,
      y: 697,
      w: 96,
      h: 18,
      characters: links[i],
      fontSize: 12,
      fontStyle: 'Medium',
      color: TOKEN.text2,
      align: i === 0 ? 'LEFT' : 'CENTER',
    });
  }
}

async function createAssistantComposer(parent) {
  const composer = makeFrame({
    name: 'Assistant composer',
    x: 12,
    y: 738,
    w: 312,
    h: 110,
    fillColor: TOKEN.panelInset,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent,
  });

  await makeText({
    parent: composer,
    x: 12,
    y: 12,
    w: 248,
    h: 34,
    characters: '输入你的创意或请求，可拖拽/粘贴图片...',
    fontSize: 12,
    fontStyle: 'Regular',
    color: TOKEN.text3,
    lineHeight: 17,
  });

  await makeText({
    parent: composer,
    x: 12,
    y: 76,
    characters: '□',
    fontSize: 16,
    fontStyle: 'Regular',
    color: TOKEN.text2,
  });

  await makeText({
    parent: composer,
    x: 36,
    y: 76,
    characters: '▤',
    fontSize: 16,
    fontStyle: 'Regular',
    color: TOKEN.text2,
  });

  await makeChip({
    parent: composer,
    x: 176,
    y: 70,
    w: 76,
    h: 28,
    label: '💬 询问 ▾',
  });

  await makeIconButton({
    parent: composer,
    x: 264,
    y: 68,
    size: 32,
    label: '↑',
    fillColor: TOKEN.ctaBg,
    textColor: TOKEN.textOnLight,
    radius: R.chip,
  });
}

async function createBottomDock(parent, x, y, props) {
  const dock = makeFrame({
    name: 'Bottom dock',
    x,
    y,
    w: 332,
    h: 50,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  dock.effects = [shadow()];

  const buttons = [
    { key: 'pointer', label: '⌖', w: 30 },
    { key: 'hand', label: '✋', w: 30 },
    { key: 'connect', label: '⌁', w: 30 },
    { key: 'cut', label: '✂', w: 30 },
    { key: 'zoomOut', label: '−', w: 30 },
    { key: 'zoom', label: String(props.zoomPercent) + '%', w: 52 },
    { key: 'zoomIn', label: '+', w: 30 },
    { key: 'undo', label: '↺', w: 30, disabled: true },
    { key: 'redo', label: '↻', w: 30, disabled: true },
  ];

  let cursorX = 8;

  for (const button of buttons) {
    const active = button.key === props.activeMode;
    const item = makeFrame({
      name: 'Dock item / ' + button.key,
      x: cursorX,
      y: 8,
      w: button.w,
      h: 34,
      fillColor: active ? TOKEN.ctaBg : TOKEN.chip,
      radius: R.dockItem,
      parent: dock,
    });

    item.opacity = button.disabled ? 0.4 : 1;

    await makeText({
      parent: item,
      x: 0,
      y: button.key === 'zoom' ? 11 : 9,
      w: button.w,
      h: 16,
      characters: button.label,
      fontSize: button.key === 'zoom' ? 11 : 16,
      fontStyle: 'Semi Bold',
      color: active ? TOKEN.textOnLight : TOKEN.text1,
      align: 'CENTER',
    });

    cursorX += button.w + 4;
  }
}

async function createMinimap(parent, x, y) {
  const minimap = makeFrame({
    name: 'Minimap',
    x,
    y,
    w: 184,
    h: 132,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  minimap.effects = [shadow()];

  await makeText({
    parent: minimap,
    x: 12,
    y: 12,
    characters: '小地图',
    fontSize: 11,
    fontStyle: 'Semi Bold',
    color: TOKEN.text2,
  });

  const area = makeFrame({
    name: 'Minimap area',
    x: 12,
    y: 34,
    w: 160,
    h: 78,
    fillColor: TOKEN.chip,
    radius: R.inner,
    parent: minimap,
  });

  makeFrame({
    name: 'Minimap composer mark',
    x: 48,
    y: 46,
    w: 44,
    h: 14,
    fillColor: TOKEN.text2,
    radius: 4,
    parent: area,
  }).opacity = 0.2;

  makeFrame({
    name: 'Minimap agent mark',
    x: 72,
    y: 18,
    w: 32,
    h: 22,
    fillColor: TOKEN.text2,
    radius: 4,
    parent: area,
  }).opacity = 0.2;

  makeFrame({
    name: 'Minimap viewport',
    x: 42,
    y: 22,
    w: 78,
    h: 36,
    fillColor: TOKEN.ctaBg,
    radius: 6,
    strokeColor: TOKEN.hairline3,
    parent: area,
  }).opacity = 0.18;
}

async function createPlaceholderNode(parent, x, y, props) {
  const node = makeFrame({
    name: props.name,
    x,
    y,
    w: 320,
    h: 220,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  node.clipsContent = false;
  node.effects = [shadow()];

  const inner = makeFrame({
    name: props.title + ' preview',
    x: 9,
    y: 9,
    w: 302,
    h: 202,
    fillColor: TOKEN.preview,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: node,
  });

  await makeChip({
    parent: inner,
    x: 8,
    y: 8,
    w: props.typeLabel.length > 4 ? 82 : 70,
    h: 24,
    label: props.typeLabel,
    textColor: props.accent,
  });

  await makeText({
    parent: inner,
    x: 20,
    y: 48,
    w: 240,
    h: 18,
    characters: props.title,
    fontSize: 14,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });

  if (props.state === 'running') {
    await makeText({
      parent: inner,
      x: 20,
      y: 82,
      w: 140,
      h: 18,
      characters: '生成中…',
      fontSize: 12,
      fontStyle: 'Regular',
      color: TOKEN.text2,
    });

    makeFrame({
      name: 'Progress track',
      x: 20,
      y: 124,
      w: 248,
      h: 4,
      fillColor: TOKEN.chip,
      radius: R.chip,
      parent: inner,
    });

    makeFrame({
      name: 'Progress value',
      x: 20,
      y: 124,
      w: 156,
      h: 4,
      fillColor: props.accent,
      radius: R.chip,
      parent: inner,
    });
  } else if (props.state === 'done') {
    const thumb = makeFrame({
      name: props.title + ' thumbnail',
      x: 20,
      y: 82,
      w: 248,
      h: 78,
      fillColor: props.accent,
      radius: R.dockItem,
      strokeColor: TOKEN.hairline,
      parent: inner,
    });
    thumb.opacity = 0.78;

    await makeText({
      parent: thumb,
      x: 0,
      y: 30,
      w: 248,
      h: 18,
      characters: '已生成缩略图',
      fontSize: 12,
      fontStyle: 'Medium',
      color: TOKEN.textOnLight,
      align: 'CENTER',
    });
  } else {
    await makeText({
      parent: inner,
      x: 20,
      y: 86,
      w: 140,
      h: 18,
      characters: '等待生成',
      fontSize: 12,
      fontStyle: 'Regular',
      color: TOKEN.text2,
    });
  }

  createPort(node, -5, 105);
  createPort(node, 315, 105);
  return node;
}

async function createEdge(parent, from, to, opts) {
  const v = figma.createVector();
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

  v.name = 'Edge';
  v.vectorPaths = [{
    windingRule: 'NONE',
    data: 'M ' + from.x + ' ' + from.y + ' C ' + from.x + ' ' + mid.y + ' ' + to.x + ' ' + mid.y + ' ' + to.x + ' ' + to.y,
  }];
  v.strokes = stroke(opts.color);
  v.strokeWeight = 1.5;

  if (opts.animated) {
    setDashed(v, [5, 5]);
  }

  parent.appendChild(v);
  return v;
}

async function createFrame03(parent, baseX, baseY) {
  const art = makeFrame({
    name: '03 Generated Workflow',
    x: baseX,
    y: baseY,
    w: 1440,
    h: 900,
    fillColor: TOKEN.canvasBg,
    radius: R.card,
    strokeColor: TOKEN.chipHover,
    parent,
  });
  art.effects = [popShadow()];

  await createCanvasBackground(art);
  await createSidebar(art, 0, 0);
  await createTopBar(art, 247, 21, {
    projectName: '未命名项目',
    eyebrow: '节点工作流',
    nodeCount: '7 个节点',
    includeWorkflow: true,
  });

  await createComposerNode(art, 286, 588, {
    prompt: '三个角色在废弃车站发现会预言未来的旧相机',
    sendDisabled: false,
  });

  await createAgentNode(art, 500, 324, {
    state: 'done',
    selected: true,
    logline: '三个朋友在废弃车站偶遇老式相机，相机的快门声响起后立刻浮现各自最深的秘密。',
    counters: [
      { label: '角色', value: '3' },
      { label: '场景', value: '4' },
      { label: '行为', value: '7' },
      { label: '段落', value: '8' },
      { label: '镜头', value: '12' },
    ],
    planner: 'Gemini 3 Pro',
    copyRisk: '原创',
  });

  await createPlaceholderNode(art, 770, 208, {
    name: 'Image node / 角色 1',
    typeLabel: '□ 图片',
    title: '角色 1',
    accent: TOKEN.emerald,
    state: 'done',
  });

  await createPlaceholderNode(art, 770, 468, {
    name: 'Image node / 角色 2',
    typeLabel: '□ 图片',
    title: '角色 2',
    accent: TOKEN.emerald,
    state: 'done',
  });

  await createPlaceholderNode(art, 1014, 208, {
    name: 'Video node / 镜头 1',
    typeLabel: '▱ 视频',
    title: '镜头 1 - 开场推镜',
    accent: TOKEN.violet,
    state: 'done',
  });

  await createPlaceholderNode(art, 1014, 468, {
    name: 'Video node / 镜头 2',
    typeLabel: '▱ 视频',
    title: '镜头 2 - 特写',
    accent: TOKEN.violet,
    state: 'running',
  });

  await createPlaceholderNode(art, 1014, 700, {
    name: 'Audio node / 旁白',
    typeLabel: '♪ 音频',
    title: '旁白',
    accent: TOKEN.amber,
    state: 'empty',
  });

  await createEdge(art, { x: 846, y: 678 }, { x: 500, y: 444 }, {
    animated: true,
    color: TOKEN.hairline3,
  });
  await createEdge(art, { x: 860, y: 424 }, { x: 770, y: 318 }, {
    animated: true,
    color: TOKEN.hairline3,
  });
  await createEdge(art, { x: 860, y: 444 }, { x: 770, y: 578 }, {
    animated: true,
    color: TOKEN.hairline3,
  });
  await createEdge(art, { x: 1090, y: 318 }, { x: 1014, y: 318 }, {
    animated: true,
    color: TOKEN.hairline3,
  });
  await createEdge(art, { x: 1090, y: 578 }, { x: 1014, y: 578 }, {
    animated: true,
    color: TOKEN.hairline3,
  });
  await createEdge(art, { x: 860, y: 464 }, { x: 1014, y: 810 }, {
    animated: true,
    color: TOKEN.hairline3,
  });

  await createAssistantDockInspector(art, 1440 - 20 - 336, 20);
  await createBottomDock(art, (1440 - 332) / 2, 900 - 20 - 50, {
    activeMode: 'pointer',
    zoomPercent: 76,
  });
  await createMinimap(art, 20, 900 - 20 - 132);

  return art;
}

async function createDesignFrame(parent, name, x, y, w, h) {
  const art = makeFrame({
    name,
    x,
    y,
    w,
    h,
    fillColor: TOKEN.canvasBg,
    radius: R.card,
    strokeColor: TOKEN.chipHover,
    parent,
  });
  art.effects = [popShadow()];
  await createCanvasBackground(art);
  return art;
}

async function createFrameTitle(parent, title, subtitle) {
  await makeText({
    parent,
    x: 48,
    y: 34,
    characters: title,
    fontSize: 18,
    fontStyle: 'Bold',
    color: TOKEN.text1,
  });

  await makeText({
    parent,
    x: 48,
    y: 62,
    w: 640,
    h: 20,
    characters: subtitle,
    fontSize: 12,
    fontStyle: 'Regular',
    color: TOKEN.text2,
  });
}

async function createColumnLabel(parent, x, y, title, subtitle) {
  await makeText({
    parent,
    x,
    y,
    characters: title,
    fontSize: 13,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });
  await makeText({
    parent,
    x,
    y: y + 20,
    w: 300,
    h: 18,
    characters: subtitle,
    fontSize: 11,
    fontStyle: 'Regular',
    color: TOKEN.text2,
  });
}

async function createCollapsedDock(parent, x, y) {
  const rail = makeFrame({
    name: 'Assistant dock / collapsed guide',
    x,
    y,
    w: 336,
    h: 860,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  rail.opacity = 0.26;

  const button = makeFrame({
    name: 'Assistant dock / collapsed',
    x: x + 272,
    y: y + 20,
    w: 44,
    h: 44,
    fillColor: TOKEN.panel,
    radius: R.chip,
    strokeColor: TOKEN.hairline,
    parent,
  });
  button.effects = [shadow()];

  await makeText({
    parent: button,
    x: 0,
    y: 12,
    w: 44,
    h: 20,
    characters: '✺',
    fontSize: 18,
    fontStyle: 'Semi Bold',
    color: TOKEN.amber,
    align: 'CENTER',
  });

  await makeText({
    parent,
    x: x + 66,
    y: y + 412,
    w: 210,
    h: 40,
    characters: '折叠态只保留右上角圆形入口',
    fontSize: 12,
    fontStyle: 'Medium',
    color: TOKEN.text2,
    align: 'CENTER',
  });
}

async function createFrame04(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '04 Assistant Dock States', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Assistant Dock 三个状态', 'Empty greeting / Inspector mode / Collapsed');
  await createColumnLabel(art, 72, 98, 'A · Empty Greeting', '默认右侧 AI 助手');
  await createColumnLabel(art, 552, 98, 'B · Inspector Mode', '选中 Agent 节点后的检查器');
  await createColumnLabel(art, 1032, 98, 'C · Collapsed', '收起为单一入口');

  await createAssistantDock(art, 72, 128, { state: 'empty' });
  await createAssistantDockInspector(art, 552, 128);
  await createCollapsedDock(art, 1032, 128);

  return art;
}

async function createAnnotation(parent, from, to, label) {
  makeLine({
    name: 'Anatomy callout / ' + label,
    from,
    to,
    color: TOKEN.hairline3,
    parent,
  });
  await makeText({
    parent,
    x: to.x + 8,
    y: to.y - 8,
    w: 150,
    h: 18,
    characters: label,
    fontSize: 11,
    fontStyle: 'Medium',
    color: TOKEN.text2,
  });
}

async function createCompactPlaceholder(parent, x, y, props) {
  const node = makeFrame({
    name: props.name,
    x,
    y,
    w: 236,
    h: 158,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  node.clipsContent = false;
  node.effects = [shadow()];

  const inner = makeFrame({
    name: props.name + ' inner',
    x: 8,
    y: 8,
    w: 220,
    h: 142,
    fillColor: TOKEN.preview,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: node,
  });

  await makeChip({
    parent: inner,
    x: 8,
    y: 8,
    w: 86,
    h: 24,
    label: props.typeLabel,
    textColor: props.accent,
  });

  await makeText({
    parent: inner,
    x: 0,
    y: 60,
    w: 220,
    h: 28,
    characters: props.icon,
    fontSize: 28,
    fontStyle: 'Regular',
    color: props.accent,
    align: 'CENTER',
  });

  await makeText({
    parent: inner,
    x: 0,
    y: 102,
    w: 220,
    h: 18,
    characters: props.title,
    fontSize: 12,
    fontStyle: 'Medium',
    color: TOKEN.text2,
    align: 'CENTER',
  });

  createPort(node, -5, 74);
  createPort(node, 231, 74);
}

async function createFrame05(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '05 Node Anatomy', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Node Anatomy & Variants', 'Composer / Agent / Placeholder anatomy + placeholder type variants');

  const composer = await createComposerNode(art, 72, 132, {
    placeholder: '输入你的创意或请求，可添加上游连线以引入参考素材',
    sendDisabled: true,
  });
  composer.name = 'Composer anatomy node';
  await createAnnotation(art, { x: 100, y: 150 }, { x: 58, y: 110 }, 'Attach slot');
  await createAnnotation(art, { x: 280, y: 190 }, { x: 360, y: 98 }, 'Textarea');
  await createAnnotation(art, { x: 210, y: 284 }, { x: 86, y: 338 }, 'Chip bar');
  await createAnnotation(art, { x: 604, y: 270 }, { x: 642, y: 338 }, 'Send button');
  await createAnnotation(art, { x: 628, y: 222 }, { x: 675, y: 222 }, 'Handle');

  await createAgentNode(art, 610, 112, {
    state: 'done',
    logline: '完成剧本拆解后，Agent 节点展示 logline、计数、模型和原创风险。',
    planner: 'Gemini 3 Pro',
    copyRisk: '原创',
  });
  await createAnnotation(art, { x: 632, y: 130 }, { x: 566, y: 96 }, 'Type chip');
  await createAnnotation(art, { x: 780, y: 228 }, { x: 816, y: 96 }, 'Breakdown');
  await createAnnotation(art, { x: 896, y: 292 }, { x: 984, y: 318 }, 'Footer');

  await createPlaceholderNode(art, 1044, 112, {
    name: 'Placeholder anatomy node',
    typeLabel: '□ 图片',
    title: '产物预览',
    accent: TOKEN.emerald,
    state: 'done',
  });
  await createAnnotation(art, { x: 1068, y: 132 }, { x: 1010, y: 96 }, 'Type chip');
  await createAnnotation(art, { x: 1168, y: 236 }, { x: 1280, y: 96 }, 'Preview');

  await makeText({
    parent: art,
    x: 72,
    y: 548,
    characters: '节点类型',
    fontSize: 16,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });

  const types = [
    { name: 'Image type', typeLabel: '□ 图片', title: '等待生成', icon: '□', accent: TOKEN.emerald },
    { name: 'Video type', typeLabel: '▱ 视频', title: '等待生成', icon: '▱', accent: TOKEN.violet },
    { name: 'Audio type', typeLabel: '♪ 音频', title: '等待生成', icon: '♪', accent: TOKEN.amber },
    { name: 'Text type', typeLabel: 'T 文本', title: '等待生成', icon: 'T', accent: TOKEN.slate },
    { name: 'Model type', typeLabel: '🎛 模型', title: '等待配置', icon: '🎛', accent: TOKEN.text2 },
  ];

  for (let i = 0; i < types.length; i += 1) {
    await createCompactPlaceholder(art, 72 + i * 262, 600, types[i]);
  }

  return art;
}

async function createStateNode(parent, x, y, props) {
  const node = makeFrame({
    name: 'State node / ' + props.stateName,
    x,
    y,
    w: 300,
    h: 190,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  node.clipsContent = false;
  node.opacity = props.disabled ? 0.42 : 1;
  node.effects = [shadow()];

  const inner = makeFrame({
    name: props.stateName + ' inner',
    x: 8,
    y: 8,
    w: 284,
    h: 174,
    fillColor: TOKEN.preview,
    radius: R.inner,
    strokeColor: TOKEN.hairline,
    parent: node,
  });

  await makeChip({
    parent: inner,
    x: 10,
    y: 10,
    w: 78,
    h: 24,
    label: '🤖 Agent',
  });

  makeCircle({
    name: props.stateName + ' status dot',
    x: 260,
    y: 18,
    size: 8,
    fillColor: props.statusColor,
    parent: inner,
  });

  if (props.banner) {
    const banner = makeFrame({
      name: props.stateName + ' banner',
      x: 16,
      y: 44,
      w: 252,
      h: 28,
      fillColor: TOKEN.chip,
      radius: R.dockItem,
      strokeColor: TOKEN.hairline,
      parent: inner,
    });
    await makeText({
      parent: banner,
      x: 0,
      y: 8,
      w: 252,
      h: 14,
      characters: props.banner,
      fontSize: 11,
      fontStyle: 'Medium',
      color: props.statusColor,
      align: 'CENTER',
    });
  }

  await makeText({
    parent: inner,
    x: 20,
    y: props.banner ? 84 : 62,
    w: 244,
    h: 42,
    characters: props.body,
    fontSize: 12,
    fontStyle: 'Regular',
    color: props.statusColor === TOKEN.rose ? TOKEN.rose : TOKEN.text1,
    align: 'CENTER',
    lineHeight: 18,
  });

  if (props.progress) {
    makeFrame({
      name: props.stateName + ' progress track',
      x: 28,
      y: 132,
      w: 228,
      h: 4,
      fillColor: TOKEN.chip,
      radius: R.chip,
      parent: inner,
    });
    makeFrame({
      name: props.stateName + ' progress value',
      x: 28,
      y: 132,
      w: 136,
      h: 4,
      fillColor: props.statusColor,
      radius: R.chip,
      parent: inner,
    });
  }

  if (props.buttonLabel) {
    await makeChip({
      parent: inner,
      x: 94,
      y: 132,
      w: 96,
      h: 28,
      label: props.buttonLabel,
      textColor: TOKEN.text1,
    });
  }
}

async function createFrame06(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '06 Node State Matrix', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Node State Matrix', '9 种节点类型 × 7 种状态；done 态直接定义各类型预览样式');

  const types = getReviewNodeDefs();
  const states = getReviewStateDefs();

  for (let i = 0; i < types.length; i += 1) {
    await makeText({
      parent: art,
      x: 92 + i * 148,
      y: 104,
      w: 128,
      h: 18,
      characters: types[i].shortLabel,
      fontSize: 11,
      fontStyle: 'Semi Bold',
      color: types[i].accent,
      align: 'CENTER',
    });
  }

  for (let row = 0; row < states.length; row += 1) {
    await makeText({
      parent: art,
      x: 30,
      y: 166 + row * 96,
      w: 52,
      h: 18,
      characters: states[row].label,
      fontSize: 10,
      fontStyle: 'Semi Bold',
      color: states[row].color,
      align: 'RIGHT',
    });

    for (let col = 0; col < types.length; col += 1) {
      await createExpandedStateCard(
        art,
        92 + col * 148,
        146 + row * 96,
        types[col],
        states[row]
      );
    }
  }

  await makeText({
    parent: art,
    x: 92,
    y: 842,
    w: 1240,
    h: 22,
    characters: 'Done 态规范：图片节点显示 16:9 缩略图；Voice 显示播放/波形/时长；ShotText 显示文本片段；Seedance 显示视频帧+播放叠加；Shot Hub 显示素材拼贴。',
    fontSize: 11,
    fontStyle: 'Medium',
    color: TOKEN.text2,
    align: 'CENTER',
  });

  return art;
}

function getReviewNodeDefs() {
  return [
    { type: 'composer', shortLabel: 'Composer', glyph: '⌗', accent: TOKEN.text2 },
    { type: 'agent', shortLabel: 'Agent', glyph: 'A', accent: TOKEN.amber },
    { type: 'shot', shortLabel: 'Shot Hub', glyph: 'S', accent: TOKEN.amber },
    { type: 'shotText', shortLabel: 'Shot Text', glyph: 'T', accent: TOKEN.slate },
    { type: 'characterImage', shortLabel: 'Character', glyph: 'C', accent: TOKEN.emerald },
    { type: 'backgroundImage', shortLabel: 'Background', glyph: 'B', accent: TOKEN.emerald },
    { type: 'frameImage', shortLabel: 'Frame Image', glyph: 'F', accent: TOKEN.emerald },
    { type: 'voice', shortLabel: 'Voice', glyph: 'V', accent: TOKEN.amber },
    { type: 'seedance', shortLabel: 'Seedance', glyph: 'O', accent: TOKEN.violet },
  ];
}

function getReviewStateDefs() {
  return [
    { key: 'empty', label: 'empty', color: TOKEN.text3 },
    { key: 'ready', label: 'ready', color: TOKEN.emerald },
    { key: 'running', label: 'running', color: TOKEN.amber },
    { key: 'done', label: 'done', color: TOKEN.emerald },
    { key: 'failed', label: 'failed', color: TOKEN.rose },
    { key: 'stale', label: 'stale', color: TOKEN.amber },
    { key: 'disabled', label: 'disabled', color: TOKEN.text3 },
  ];
}

async function createExpandedStateCard(parent, x, y, typeDef, stateDef) {
  const card = makeFrame({
    name: 'State matrix / ' + typeDef.type + ' / ' + stateDef.key,
    x,
    y,
    w: 132,
    h: 82,
    fillColor: TOKEN.panel,
    radius: 14,
    strokeColor: stateDef.key === 'done' ? typeDef.accent : TOKEN.hairline,
    parent,
  });
  card.opacity = stateDef.key === 'disabled' ? 0.45 : 1;

  makeFrame({
    name: typeDef.type + ' tiny icon plate',
    x: 8,
    y: 8,
    w: 22,
    h: 22,
    fillColor: TOKEN.chip,
    radius: 8,
    parent: card,
  });

  await makeText({
    parent: card,
    x: 8,
    y: 13,
    w: 22,
    h: 12,
    characters: typeDef.glyph,
    fontSize: 10,
    fontStyle: 'Semi Bold',
    color: typeDef.accent,
    align: 'CENTER',
  });

  makeCircle({
    name: typeDef.type + ' state dot',
    x: 114,
    y: 14,
    size: 6,
    fillColor: stateDef.color,
    parent: card,
  });

  await makeText({
    parent: card,
    x: 34,
    y: 11,
    w: 72,
    h: 12,
    characters: stateDef.key,
    fontSize: 9,
    fontStyle: 'Semi Bold',
    color: stateDef.color,
  });

  if (stateDef.key === 'done') {
    await createTinyDonePreview(card, typeDef);
  } else if (stateDef.key === 'running') {
    await createTinyRunningPreview(card, typeDef.accent);
  } else if (stateDef.key === 'failed') {
    await makeText({ parent: card, x: 0, y: 44, w: 132, h: 14, characters: '失败 · 可重试', fontSize: 10, fontStyle: 'Medium', color: TOKEN.rose, align: 'CENTER' });
  } else if (stateDef.key === 'stale') {
    await makeText({ parent: card, x: 0, y: 44, w: 132, h: 14, characters: '上游已变更', fontSize: 10, fontStyle: 'Medium', color: TOKEN.amber, align: 'CENTER' });
  } else if (stateDef.key === 'ready') {
    await makeText({ parent: card, x: 0, y: 44, w: 132, h: 14, characters: '可生成', fontSize: 10, fontStyle: 'Medium', color: TOKEN.emerald, align: 'CENTER' });
  } else {
    await makeText({ parent: card, x: 14, y: 42, w: 104, h: 24, characters: stateDef.key === 'disabled' ? '缺 API Key / 权限' : '等待输入或上游', fontSize: 9, fontStyle: 'Regular', color: TOKEN.text2, align: 'CENTER', lineHeight: 12 });
  }
}

async function createTinyDonePreview(parent, typeDef) {
  if (typeDef.type === 'voice') {
    await makeText({ parent, x: 18, y: 44, w: 14, h: 14, characters: '▶', fontSize: 9, fontStyle: 'Semi Bold', color: typeDef.accent, align: 'CENTER' });
    for (let i = 0; i < 8; i += 1) {
      makeFrame({ name: 'Tiny waveform', x: 40 + i * 7, y: 48 - (i % 3) * 3, w: 3, h: 10 + (i % 3) * 6, fillColor: typeDef.accent, radius: 2, parent }).opacity = 0.75;
    }
    await makeText({ parent, x: 90, y: 48, w: 30, h: 10, characters: '00:08', fontSize: 8, fontStyle: 'Medium', color: TOKEN.text2, align: 'RIGHT' });
    return;
  }

  if (typeDef.type === 'shotText') {
    await makeText({ parent, x: 16, y: 40, w: 100, h: 28, characters: '推镜到旧相机，角色停下脚步…', fontSize: 9, fontStyle: 'Regular', color: TOKEN.text1, lineHeight: 12 });
    return;
  }

  if (typeDef.type === 'seedance') {
    const preview = makeFrame({ name: 'Tiny video frame', x: 22, y: 38, w: 88, h: 30, fillColor: TOKEN.chipHover, radius: 6, strokeColor: TOKEN.hairline, parent });
    makeFrame({ name: 'Tiny video band', x: 0, y: 0, w: 88, h: 10, fillColor: typeDef.accent, radius: 6, parent: preview }).opacity = 0.45;
    await makeText({ parent: preview, x: 0, y: 8, w: 88, h: 14, characters: '▶', fontSize: 12, fontStyle: 'Bold', color: TOKEN.text1, align: 'CENTER' });
    await makeText({ parent, x: 78, y: 58, w: 30, h: 8, characters: '00:06', fontSize: 7, fontStyle: 'Medium', color: TOKEN.text1, align: 'RIGHT' });
    return;
  }

  if (typeDef.type === 'shot') {
    const labels = ['T', 'C', 'B', 'F', 'V'];
    for (let i = 0; i < labels.length; i += 1) {
      const tile = makeFrame({ name: 'Tiny shot collage ' + labels[i], x: 18 + i * 19, y: 42, w: 16, h: 16, fillColor: i === 4 ? TOKEN.amber : TOKEN.chipHover, radius: 4, strokeColor: TOKEN.hairline, parent });
      tile.opacity = i === 4 ? 0.75 : 1;
      await makeText({ parent: tile, x: 0, y: 4, w: 16, h: 8, characters: labels[i], fontSize: 7, fontStyle: 'Bold', color: TOKEN.text1, align: 'CENTER' });
    }
    return;
  }

  if (typeDef.type === 'agent') {
    await makeText({ parent, x: 20, y: 42, w: 92, h: 10, characters: '3 角色 · 4 场景', fontSize: 9, fontStyle: 'Semi Bold', color: TOKEN.text1, align: 'CENTER' });
    await makeText({ parent, x: 20, y: 56, w: 92, h: 10, characters: '12 镜头', fontSize: 9, fontStyle: 'Semi Bold', color: TOKEN.text2, align: 'CENTER' });
    return;
  }

  if (typeDef.type === 'composer') {
    await makeText({ parent, x: 18, y: 42, w: 96, h: 20, characters: 'Prompt 已发送', fontSize: 9, fontStyle: 'Medium', color: TOKEN.text1, align: 'CENTER' });
    return;
  }

  const thumb = makeFrame({ name: 'Tiny image thumbnail', x: 22, y: 38, w: 88, h: 36, fillColor: TOKEN.chipHover, radius: 6, strokeColor: TOKEN.hairline, parent });
  makeFrame({ name: 'Tiny image sky', x: 0, y: 0, w: 88, h: 13, fillColor: typeDef.accent, radius: 6, parent: thumb }).opacity = 0.5;
  makeFrame({ name: 'Tiny image ground', x: 0, y: 25, w: 88, h: 11, fillColor: TOKEN.amber, radius: 6, parent: thumb }).opacity = 0.35;
}

async function createTinyRunningPreview(parent, accent) {
  makeFrame({ name: 'Tiny progress track', x: 18, y: 52, w: 96, h: 4, fillColor: TOKEN.chip, radius: R.chip, parent });
  makeFrame({ name: 'Tiny progress value', x: 18, y: 52, w: 58, h: 4, fillColor: accent, radius: R.chip, parent });
  await makeText({ parent, x: 0, y: 36, w: 132, h: 10, characters: '生成中', fontSize: 9, fontStyle: 'Medium', color: accent, align: 'CENTER' });
}

async function createComposerState(parent, x, y, props) {
  const node = await createComposerNode(parent, x, y, {
    placeholder: props.placeholder || '输入你的创意或请求，可添加上游连线以引入参考素材',
    prompt: props.prompt,
    sendDisabled: props.sendDisabled,
    loading: props.loading,
  });
  node.name = 'Composer state / ' + props.name;
  node.opacity = props.dimmed ? 0.62 : 1;

  if (props.tooltip) {
    const tip = makeFrame({
      name: 'Composer tooltip / ' + props.name,
      x: 392,
      y: 100,
      w: 156,
      h: 30,
      fillColor: TOKEN.panel,
      radius: R.dockItem,
      strokeColor: TOKEN.hairline,
      parent: node,
    });
    await makeText({
      parent: tip,
      x: 0,
      y: 8,
      w: 156,
      h: 14,
      characters: props.tooltip,
      fontSize: 11,
      fontStyle: 'Medium',
      color: TOKEN.text2,
      align: 'CENTER',
    });
  }

  if (props.dropdown) {
    const menu = makeFrame({
      name: 'Composer chip dropdown',
      x: 12,
      y: 174,
      w: 240,
      h: 120,
      fillColor: TOKEN.panel,
      radius: R.card,
      strokeColor: TOKEN.hairline,
      parent: node,
    });
    menu.effects = [shadow()];
    const rows = ['Agent · 调用 Agent 拆解剧本', 'Chat · 直接对话', 'Generate · 调用媒体生成'];
    for (let i = 0; i < rows.length; i += 1) {
      await makeText({
        parent: menu,
        x: 14,
        y: 16 + i * 32,
        w: 210,
        h: 14,
        characters: rows[i],
        fontSize: 11,
        fontStyle: i === 0 ? 'Semi Bold' : 'Regular',
        color: i === 0 ? TOKEN.text1 : TOKEN.text2,
      });
    }
  }

  if (props.attachFilled) {
    makeFrame({
      name: 'Filled attach thumbnail',
      x: 12,
      y: 12,
      w: 48,
      h: 48,
      fillColor: TOKEN.emerald,
      radius: R.inner,
      strokeColor: TOKEN.hairline3,
      parent: node,
    }).opacity = 0.75;
    await makeIconButton({
      parent: node,
      x: 48,
      y: 6,
      size: 20,
      label: '×',
      fillColor: TOKEN.panel,
      textColor: TOKEN.text1,
      radius: R.chip,
    });
  }
}

async function createFrame07(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '07 Composer State Matrix', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Composer State Matrix', 'Composer 节点的输入、发送、下拉和附件状态');

  const states = [
    { name: 'empty', label: 'empty', x: 70, y: 120, sendDisabled: true },
    { name: 'typing', label: 'typing', x: 760, y: 120, prompt: '三个角色在废弃车站发现会预言未来的旧相机', sendDisabled: false },
    { name: 'typing + no downstream', label: 'typing + no downstream', x: 70, y: 360, prompt: '一个镜头从远景缓慢推进到旧相机', sendDisabled: true, tooltip: '请先连接到一个 Agent 节点' },
    { name: 'sending', label: 'sending', x: 760, y: 360, prompt: '将这个创意拆成镜头脚本', sendDisabled: true, loading: true, dimmed: true },
    { name: 'chip dropdown open', label: 'chip dropdown open', x: 70, y: 600, prompt: '选择 Agent 模式继续', sendDisabled: false, dropdown: true },
    { name: 'attach filled', label: 'attach filled', x: 760, y: 600, prompt: '参考这张角色图生成镜头脚本', sendDisabled: false, attachFilled: true },
  ];

  for (let i = 0; i < states.length; i += 1) {
    await createComposerState(art, states[i].x, states[i].y, states[i]);
    await makeText({
      parent: art,
      x: states[i].x,
      y: states[i].y - 28,
      w: 560,
      h: 18,
      characters: states[i].label,
      fontSize: 12,
      fontStyle: 'Semi Bold',
      color: TOKEN.text2,
      align: 'CENTER',
    });
  }

  return art;
}

async function createDockStateButton(parent, x, y, label, state) {
  let fillColor = TOKEN.chip;
  let textColor = TOKEN.text1;
  let opacity = 1;

  if (state === 'hover') {
    fillColor = TOKEN.chipHover;
  }
  if (state === 'active') {
    fillColor = TOKEN.ctaBg;
    textColor = TOKEN.textOnLight;
  }
  if (state === 'disabled') {
    opacity = 0.4;
  }

  const item = makeFrame({
    name: 'Dock button / ' + label + ' / ' + state,
    x,
    y,
    w: label === '76%' ? 58 : 42,
    h: 34,
    fillColor,
    radius: R.dockItem,
    parent,
  });
  item.opacity = opacity;

  await makeText({
    parent: item,
    x: 0,
    y: label === '76%' ? 11 : 8,
    w: label === '76%' ? 58 : 42,
    h: 16,
    characters: label,
    fontSize: label === '76%' ? 11 : 15,
    fontStyle: 'Semi Bold',
    color: textColor,
    align: 'CENTER',
  });
}

async function createAddMenu(parent, x, y) {
  const menu = makeFrame({
    name: 'Add node menu',
    x,
    y,
    w: 240,
    h: 240,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  menu.effects = [popShadow()];

  await makeText({
    parent: menu,
    x: 16,
    y: 14,
    characters: '新建节点',
    fontSize: 10,
    fontStyle: 'Semi Bold',
    color: TOKEN.text3,
    letterSpacing: 1,
  });
  await makeText({
    parent: menu,
    x: 210,
    y: 12,
    characters: '×',
    fontSize: 14,
    fontStyle: 'Medium',
    color: TOKEN.text2,
  });

  const rows = [
    { icon: '⌗', label: 'Composer', color: TOKEN.text2 },
    { icon: '🤖', label: 'Agent', color: TOKEN.text2 },
    { icon: '□', label: 'Image', color: TOKEN.emerald },
    { icon: '▱', label: 'Video', color: TOKEN.violet },
    { icon: '♪', label: 'Audio', color: TOKEN.amber },
    { icon: 'T', label: 'Text', color: TOKEN.slate },
  ];

  for (let i = 0; i < rows.length; i += 1) {
    const row = makeFrame({
      name: 'Add menu item / ' + rows[i].label,
      x: 8,
      y: 42 + i * 32,
      w: 224,
      h: 30,
      fillColor: i === 2 ? TOKEN.chipHover : TOKEN.panel,
      radius: R.dockItem,
      parent: menu,
    });
    makeFrame({
      name: rows[i].label + ' icon plate',
      x: 6,
      y: 1,
      w: 28,
      h: 28,
      fillColor: TOKEN.chip,
      radius: R.dockItem,
      parent: row,
    });
    await makeText({
      parent: row,
      x: 6,
      y: 7,
      w: 28,
      h: 14,
      characters: rows[i].icon,
      fontSize: 13,
      fontStyle: 'Semi Bold',
      color: rows[i].color,
      align: 'CENTER',
    });
    await makeText({
      parent: row,
      x: 46,
      y: 7,
      w: 120,
      h: 14,
      characters: rows[i].label,
      fontSize: 14,
      fontStyle: 'Medium',
      color: TOKEN.text1,
    });
    makeCircle({
      name: rows[i].label + ' accent dot',
      x: 204,
      y: 14,
      size: 4,
      fillColor: rows[i].color,
      parent: row,
    });
  }
}

async function createFrame08(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '08 Dock & Topbar Detail', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Dock & Topbar Detail', 'Top bar hover / bottom dock button states / add menu');

  await makeText({ parent: art, x: 70, y: 116, characters: 'Top bar 默认', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text2 });
  await createTopBar(art, 70, 140, { projectName: '未命名项目', eyebrow: '节点工作流', nodeCount: '7 个节点', includeWorkflow: true });
  await makeText({ parent: art, x: 70, y: 220, characters: 'Top bar hover / active', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text2 });
  await createTopBar(art, 70, 244, { projectName: '未命名项目', eyebrow: '节点工作流', nodeCount: '7 个节点', includeWorkflow: true });
  makeFrame({ name: 'Hover highlight / arrange', x: 70 + 272 + 106, y: 244 + 11, w: 82, h: 34, fillColor: TOKEN.chipHover, radius: R.chip, parent: art }).opacity = 0.42;

  await makeText({ parent: art, x: 70, y: 340, characters: 'Bottom dock button states', fontSize: 16, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  const labels = ['⌖', '✋', '⌁', '✂', '−', '76%', '+', '↺', '↻'];
  const states = ['default', 'hover', 'active', 'disabled'];
  for (let row = 0; row < states.length; row += 1) {
    await makeText({ parent: art, x: 70, y: 394 + row * 58, w: 70, h: 14, characters: states[row], fontSize: 11, fontStyle: 'Medium', color: TOKEN.text2 });
    for (let col = 0; col < labels.length; col += 1) {
      await createDockStateButton(art, 170 + col * 76, 384 + row * 58, labels[col], states[row]);
    }
  }

  await makeText({ parent: art, x: 70, y: 660, characters: 'Add Menu', fontSize: 16, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await createAddMenu(art, 70, 696);

  await makeText({
    parent: art,
    x: 380,
    y: 700,
    w: 380,
    h: 70,
    characters: '菜单项 hover 使用 chip-hover；右侧色点沿用节点类型 accent。\nBottom dock 的 active 状态统一使用 cta-bg。',
    fontSize: 12,
    fontStyle: 'Regular',
    color: TOKEN.text2,
    lineHeight: 20,
  });

  return art;
}

async function createEdgeStatePanel(parent, x, y, props) {
  const panel = makeFrame({
    name: 'Edge state / ' + props.name,
    x,
    y,
    w: 600,
    h: 235,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  panel.effects = [shadow()];

  await makeText({
    parent: panel,
    x: 20,
    y: 16,
    characters: props.name,
    fontSize: 13,
    fontStyle: 'Semi Bold',
    color: TOKEN.text1,
  });
  await makeText({
    parent: panel,
    x: 20,
    y: 38,
    w: 300,
    h: 16,
    characters: props.desc,
    fontSize: 11,
    fontStyle: 'Regular',
    color: TOKEN.text2,
  });

  const left = makeFrame({ name: props.name + ' source node', x: 70, y: 98, w: 130, h: 70, fillColor: TOKEN.preview, radius: R.inner, strokeColor: TOKEN.hairline, parent: panel });
  await makeText({ parent: left, x: 0, y: 26, w: 130, h: 16, characters: 'Composer', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text1, align: 'CENTER' });
  const right = makeFrame({ name: props.name + ' target node', x: 400, y: 98, w: 130, h: 70, fillColor: TOKEN.preview, radius: R.inner, strokeColor: TOKEN.hairline, parent: panel });
  await makeText({ parent: right, x: 0, y: 26, w: 130, h: 16, characters: 'Agent', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text1, align: 'CENTER' });
  createPort(left, 125, 30);
  createPort(right, -5, 30);

  const edge = await createEdge(panel, { x: 200, y: 133 }, { x: 400, y: 133 }, { animated: props.dashed, color: props.color });
  edge.strokeWeight = props.strokeWidth || 1.5;

  if (props.invalid) {
    await makeText({ parent: panel, x: 292, y: 114, w: 20, h: 20, characters: '×', fontSize: 18, fontStyle: 'Bold', color: TOKEN.rose, align: 'CENTER' });
  }
}

async function createFrame09(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '09 Edge States', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Edge & Connection States', '默认 / 数据流 / hover / selected / connecting / invalid');

  const panels = [
    { name: 'default', desc: 'hairline-3 1.5px', color: TOKEN.hairline3 },
    { name: 'animated data flowing', desc: '虚线表示数据流', color: TOKEN.hairline3, dashed: true },
    { name: 'hover', desc: 'hover 时变为 amber', color: TOKEN.amber, strokeWidth: 2 },
    { name: 'selected', desc: '选中时变为 cta-bg', color: TOKEN.ctaBg, strokeWidth: 2 },
    { name: 'connecting drag', desc: '拖拽中使用 text-2 dashed', color: TOKEN.text2, dashed: true },
    { name: 'invalid mismatch', desc: '目标类型不匹配', color: TOKEN.rose, strokeWidth: 2, invalid: true },
  ];

  for (let i = 0; i < panels.length; i += 1) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    await createEdgeStatePanel(art, 70 + col * 690, 116 + row * 250, panels[i]);
  }

  return art;
}

async function createFrame10(parent, baseX, baseY) {
  const phone = makeFrame({
    name: '10 Mobile Stack',
    x: baseX,
    y: baseY,
    w: 390,
    h: 844,
    fillColor: TOKEN.canvasBg,
    radius: 32,
    strokeColor: TOKEN.chipHover,
    parent,
  });
  phone.effects = [popShadow()];
  await createMobileChrome(phone, false);
  return phone;
}

async function createFrame11(parent, baseX, baseY) {
  const phone = makeFrame({
    name: '11 Mobile Bottom Sheet',
    x: baseX,
    y: baseY,
    w: 390,
    h: 844,
    fillColor: TOKEN.canvasBg,
    radius: 32,
    strokeColor: TOKEN.chipHover,
    parent,
  });
  phone.effects = [popShadow()];
  await createMobileChrome(phone, true);
  return phone;
}

async function createMobileChrome(parent, expanded) {
  await makeText({ parent, x: 26, y: 18, characters: '9:41', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeText({ parent, x: 294, y: 18, characters: '▰ ▰ ◉', fontSize: 10, fontStyle: 'Regular', color: TOKEN.text2 });
  await makeText({ parent, x: 16, y: 62, characters: '← 返回', fontSize: 14, fontStyle: 'Medium', color: TOKEN.text1 });
  await makeText({ parent, x: 130, y: 62, w: 130, h: 18, characters: '未命名项目', fontSize: 14, fontStyle: 'Semi Bold', color: TOKEN.text1, align: 'CENTER' });
  await makeText({ parent, x: 350, y: 57, characters: '⋯', fontSize: 20, fontStyle: 'Bold', color: TOKEN.text1 });

  const tabs = makeFrame({ name: 'Mobile list canvas tabs', x: 70, y: 102, w: 250, h: 34, fillColor: TOKEN.chip, radius: R.chip, parent });
  makeFrame({ name: expanded ? 'Mobile inactive segment' : 'Mobile active segment', x: 2, y: 2, w: 123, h: 30, fillColor: TOKEN.text1, radius: R.chip, parent: tabs });
  await makeText({ parent: tabs, x: 0, y: 10, w: 125, h: 14, characters: '列表', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.textOnLight, align: 'CENTER' });
  await makeText({ parent: tabs, x: 125, y: 10, w: 125, h: 14, characters: '画布', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text2, align: 'CENTER' });

  const rows = [
    { icon: '⌗', type: 'Composer', title: '创意输入', sub: '已输入 prompt', color: TOKEN.text2 },
    { icon: '🤖', type: 'Agent', title: '剧本拆解', sub: '12 个镜头', color: TOKEN.emerald },
    { icon: '□', type: 'Image', title: '角色 1', sub: '已生成', color: TOKEN.emerald },
    { icon: '□', type: 'Image', title: '角色 2', sub: '已生成', color: TOKEN.emerald },
    { icon: '▱', type: 'Video', title: '镜头 1', sub: '开场推镜', color: TOKEN.violet },
  ];

  for (let i = 0; i < rows.length; i += 1) {
    await createMobileRow(parent, 12, 156 + i * 96, rows[i], expanded ? 0.35 : 1);
  }

  if (expanded) {
    makeFrame({ name: 'Mobile dimmer', x: 0, y: 0, w: 390, h: 844, fillColor: TOKEN.railBg, parent }).opacity = 0.56;
    await createMobileSheet(parent, 244, 600);
  } else {
    await createMobileCollapsedSheet(parent);
  }

  await createMobileBottomNav(parent);
}

async function createMobileRow(parent, x, y, row, opacity) {
  const card = makeFrame({
    name: 'Mobile node row / ' + row.title,
    x,
    y,
    w: 366,
    h: 88,
    fillColor: TOKEN.panel,
    radius: R.card,
    strokeColor: TOKEN.hairline,
    parent,
  });
  card.opacity = opacity;

  const plate = makeFrame({ name: row.title + ' icon plate', x: 14, y: 24, w: 40, h: 40, fillColor: TOKEN.chip, radius: R.iconPlate, parent: card });
  await makeText({ parent: plate, x: 0, y: 11, w: 40, h: 16, characters: row.icon, fontSize: 16, fontStyle: 'Semi Bold', color: row.color, align: 'CENTER' });
  await makeText({ parent: card, x: 68, y: 18, w: 140, h: 12, characters: row.type.toUpperCase(), fontSize: 10, fontStyle: 'Semi Bold', color: TOKEN.text3, letterSpacing: 1 });
  await makeText({ parent: card, x: 68, y: 36, w: 190, h: 18, characters: row.title, fontSize: 14, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeText({ parent: card, x: 68, y: 60, w: 190, h: 16, characters: row.sub, fontSize: 12, fontStyle: 'Regular', color: TOKEN.text2 });
  makeCircle({ name: row.title + ' mobile status', x: 316, y: 38, size: 8, fillColor: row.color, parent: card });
  await makeText({ parent: card, x: 340, y: 34, characters: '›', fontSize: 22, fontStyle: 'Medium', color: TOKEN.text2 });
}

async function createMobileCollapsedSheet(parent) {
  makeFrame({ name: 'Mobile sheet handle', x: 167, y: 682, w: 56, h: 4, fillColor: TOKEN.text3, radius: R.chip, parent }).opacity = 0.5;
  const sheet = makeFrame({ name: 'Mobile bottom sheet collapsed', x: 0, y: 704, w: 390, h: 48, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline, parent });
  await makeText({ parent: sheet, x: 16, y: 16, characters: '💬 询问 Agent', fontSize: 14, fontStyle: 'Medium', color: TOKEN.text2 });
  await makeIconButton({ parent: sheet, x: 342, y: 8, size: 32, label: '↑', fillColor: TOKEN.ctaBg, textColor: TOKEN.textOnLight, radius: R.chip });
}

async function createMobileSheet(parent, y, h) {
  const sheet = makeFrame({ name: 'Mobile bottom sheet expanded', x: 0, y, w: 390, h, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline, parent });
  makeFrame({ name: 'Expanded sheet handle', x: 177, y: 10, w: 36, h: 4, fillColor: TOKEN.text3, radius: R.chip, parent: sheet }).opacity = 0.5;
  const tabs = makeFrame({ name: 'Sheet Assistant Inspector tabs', x: 12, y: 30, w: 366, h: 44, fillColor: TOKEN.chip, radius: R.chip, parent: sheet });
  makeFrame({ name: 'Sheet active tab', x: 3, y: 3, w: 178, h: 38, fillColor: TOKEN.text1, radius: R.chip, parent: tabs });
  await makeText({ parent: tabs, x: 0, y: 14, w: 183, h: 14, characters: 'Assistant', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.textOnLight, align: 'CENTER' });
  await makeText({ parent: tabs, x: 183, y: 14, w: 183, h: 14, characters: 'Inspector', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text2, align: 'CENTER' });
  await makeText({ parent: sheet, x: 0, y: 156, w: 390, h: 38, characters: '👋', fontSize: 32, fontStyle: 'Regular', color: TOKEN.text1, align: 'CENTER' });
  await makeText({ parent: sheet, x: 58, y: 210, w: 274, h: 18, characters: '你好！输入你的创意', fontSize: 14, fontStyle: 'Semi Bold', color: TOKEN.text1, align: 'CENTER' });
  await makeText({ parent: sheet, x: 58, y: 238, w: 274, h: 42, characters: '我来帮你完成剧本、分镜、角色设计等工作。', fontSize: 14, fontStyle: 'Regular', color: TOKEN.text2, align: 'CENTER', lineHeight: 20 });
  const composer = makeFrame({ name: 'Mobile expanded composer', x: 12, y: 472, w: 366, h: 110, fillColor: TOKEN.panelInset, radius: R.inner, strokeColor: TOKEN.hairline, parent: sheet });
  await makeText({ parent: composer, x: 12, y: 12, w: 292, h: 34, characters: '输入你的创意或请求，可拖拽/粘贴图片...', fontSize: 12, fontStyle: 'Regular', color: TOKEN.text3, lineHeight: 17 });
  await makeChip({ parent: composer, x: 218, y: 70, w: 76, h: 28, label: '💬 询问 ▾' });
  await makeIconButton({ parent: composer, x: 306, y: 68, size: 32, label: '↑', fillColor: TOKEN.ctaBg, textColor: TOKEN.textOnLight, radius: R.chip });
}

async function createMobileBottomNav(parent) {
  const nav = makeFrame({ name: 'Mobile bottom nav', x: 0, y: 780, w: 390, h: 64, fillColor: TOKEN.railBg, strokeColor: TOKEN.hairline, parent });
  const tabs = ['□', '⌬', '▤', '●', '人'];
  for (let i = 0; i < tabs.length; i += 1) {
    await makeText({ parent: nav, x: i * 78, y: 20, w: 78, h: 18, characters: tabs[i], fontSize: 16, fontStyle: 'Semi Bold', color: i === 1 ? TOKEN.text1 : TOKEN.text3, align: 'CENTER' });
  }
}

async function createFrame12(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '12 Connection Topology', baseX, baseY, 1440, 900);
  await createFrameTitle(art, '连接拓扑总览', '显式定义哪些节点可以连接，以及每条线的 channel 名');

  const composer = await createTopologyNode(art, 88, 184, { label: 'Composer', sub: '用户创意', glyph: '⌗', accent: TOKEN.text2 });
  const agent = await createTopologyNode(art, 314, 184, { label: 'Agent', sub: '剧本拆解', glyph: 'A', accent: TOKEN.amber });
  const shot = await createTopologyNode(art, 574, 350, { label: 'Shot Hub', sub: '镜头中心 / 非终点', glyph: 'S', accent: TOKEN.amber, hub: true });
  const shotText = await createTopologyNode(art, 910, 118, { label: 'ShotText', sub: '镜头文本', glyph: 'T', accent: TOKEN.slate });
  const character = await createTopologyNode(art, 910, 238, { label: 'CharacterImage', sub: '角色图', glyph: 'C', accent: TOKEN.emerald });
  const background = await createTopologyNode(art, 910, 358, { label: 'BackgroundImage', sub: '背景图', glyph: 'B', accent: TOKEN.emerald });
  const frame = await createTopologyNode(art, 910, 478, { label: 'FrameImage', sub: '起 / 中 / 末关键帧', glyph: 'F', accent: TOKEN.emerald });
  const voice = await createTopologyNode(art, 910, 598, { label: 'Voice', sub: 'MP3 / 本地声音 / TTS', glyph: 'V', accent: TOKEN.amber });
  const seedance = await createTopologyNode(art, 1190, 350, { label: 'Seedance', sub: '单镜头视频出口', glyph: 'O', accent: TOKEN.violet, hub: true });

  await createLabeledConnection(art, composer, agent, 'idea');
  await createLabeledConnection(art, agent, shot, 'distribute');
  await createLabeledConnection(art, shot, shotText, 'shotText');
  await createLabeledConnection(art, shot, character, 'character');
  await createLabeledConnection(art, shot, background, 'background');
  await createLabeledConnection(art, shot, frame, 'keyframes 1/2/3');
  await createLabeledConnection(art, shot, voice, 'voice');
  await createLabeledConnection(art, shotText, seedance, 'prompt');
  await createLabeledConnection(art, character, seedance, 'character ref');
  await createLabeledConnection(art, background, seedance, 'background ref');
  await createLabeledConnection(art, frame, seedance, 'frame ref');
  await createLabeledConnection(art, voice, seedance, 'audio ref');

  await createRulePanel(art, 88, 620);

  await makeText({
    parent: art,
    x: 574,
    y: 706,
    w: 720,
    h: 56,
    characters: '规则：Composer 只向 Agent 发送 idea；Agent 不直接生成媒体，而是把 breakdown 分发成 Shot Hub；Shot Hub 是素材组织中心；Seedance 是最终视频出口。',
    fontSize: 13,
    fontStyle: 'Medium',
    color: TOKEN.text1,
    lineHeight: 22,
  });

  return art;
}

async function createTopologyNode(parent, x, y, props) {
  const w = props.hub ? 210 : 170;
  const h = props.hub ? 118 : 74;
  const node = makeFrame({ name: 'Topology node / ' + props.label, x, y, w, h, fillColor: TOKEN.panel, radius: R.card, strokeColor: props.accent, parent });
  node.clipsContent = false;
  const plate = makeFrame({ name: props.label + ' topology icon', x: 12, y: 14, w: 34, h: 34, fillColor: TOKEN.chip, radius: R.iconPlate, parent: node });
  await makeText({ parent: plate, x: 0, y: 9, w: 34, h: 14, characters: props.glyph, fontSize: 13, fontStyle: 'Bold', color: props.accent, align: 'CENTER' });
  await makeText({ parent: node, x: 58, y: 14, w: w - 70, h: 16, characters: props.label, fontSize: 13, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeText({ parent: node, x: 58, y: 38, w: w - 70, h: 32, characters: props.sub, fontSize: 11, fontStyle: 'Regular', color: TOKEN.text2, lineHeight: 16 });

  if (props.hub) {
    const slots = props.label === 'Shot Hub' ? ['T', 'C', 'B', 'F', 'V'] : ['T', 'C', 'B', 'F', 'V'];
    for (let i = 0; i < slots.length; i += 1) {
      const tile = makeFrame({ name: props.label + ' channel ' + slots[i], x: 14 + i * 36, y: 80, w: 28, h: 24, fillColor: TOKEN.chip, radius: 8, strokeColor: TOKEN.hairline, parent: node });
      await makeText({ parent: tile, x: 0, y: 7, w: 28, h: 10, characters: slots[i], fontSize: 9, fontStyle: 'Bold', color: props.accent, align: 'CENTER' });
    }
  }

  createPort(node, -5, Math.round(h / 2));
  createPort(node, w - 5, Math.round(h / 2));
  return { x, y, w, h, node };
}

async function createLabeledConnection(parent, fromNode, toNode, label) {
  const from = { x: fromNode.x + fromNode.w, y: fromNode.y + fromNode.h / 2 };
  const to = { x: toNode.x, y: toNode.y + toNode.h / 2 };
  await createEdge(parent, from, to, { animated: true, color: TOKEN.hairline3 });
  const lx = (from.x + to.x) / 2 - 46;
  const ly = (from.y + to.y) / 2 - 13;
  const chip = makeFrame({ name: 'Edge channel / ' + label, x: lx, y: ly, w: 92, h: 26, fillColor: TOKEN.panel, radius: R.chip, strokeColor: TOKEN.hairline2, parent });
  await makeText({ parent: chip, x: 0, y: 8, w: 92, h: 10, characters: label, fontSize: 9, fontStyle: 'Semi Bold', color: TOKEN.text1, align: 'CENTER' });
}

async function createRulePanel(parent, x, y) {
  const panel = makeFrame({ name: 'Connection rule matrix', x, y, w: 410, h: 202, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline, parent });
  await makeText({ parent: panel, x: 18, y: 16, characters: '连接规则矩阵', fontSize: 14, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  const rows = [
    ['Composer', 'Agent', 'idea'],
    ['Agent', 'Shot Hub', 'distribute'],
    ['Shot Hub', 'ShotText / C / B / F / V', 'branch'],
    ['ShotText / C / B / F / V', 'Seedance', 'render inputs'],
    ['Seedance', '终点', 'video output'],
  ];
  for (let i = 0; i < rows.length; i += 1) {
    await createRuleRow(panel, 18, 48 + i * 28, rows[i]);
  }
}

async function createRuleRow(parent, x, y, row) {
  await makeText({ parent, x, y, w: 112, h: 14, characters: row[0], fontSize: 11, fontStyle: 'Medium', color: TOKEN.text1 });
  await makeText({ parent, x: x + 128, y, w: 18, h: 14, characters: '→', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3, align: 'CENTER' });
  await makeText({ parent, x: x + 156, y, w: 148, h: 14, characters: row[1], fontSize: 11, fontStyle: 'Medium', color: TOKEN.text2 });
  await makeChip({ parent, x: x + 310, y: y - 5, w: 76, h: 24, label: row[2] });
}

async function createFrame13(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '13 Hub Node Anatomy', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Shot / Seedance Hub Anatomy', '420×300 Hub 节点内部布局、slots、折叠态和关键帧顺序');

  await createHubNodeLarge(art, 92, 132, {
    title: 'Shot Hub · 镜头 01',
    subtitle: '中心节点：组织文本、图片、语音分支',
    accent: TOKEN.amber,
    outputMode: false,
  });
  await createHubNodeLarge(art, 606, 132, {
    title: 'Seedance Hub · 出片',
    subtitle: '出口节点：收集素材并生成视频',
    accent: TOKEN.violet,
    outputMode: true,
  });
  await createCollapsedHub(art, 1120, 156);

  await makeText({ parent: art, x: 92, y: 492, characters: 'Slot 规则', fontSize: 16, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  const rules = [
    '虚线 slot = 未连接，但可以拖入素材节点',
    '实线 thumbnail = 已连接，显示来源节点预览',
    'FrameImage 支持 ① 起始帧 / ② 中间帧 / ③ 结束帧',
    'Shot Hub 折叠到 340×120 时保留 title、状态、5 个 channel mini chip',
  ];
  for (let i = 0; i < rules.length; i += 1) {
    await makeText({ parent: art, x: 112, y: 532 + i * 30, w: 600, h: 16, characters: '• ' + rules[i], fontSize: 12, fontStyle: 'Regular', color: TOKEN.text2 });
  }

  return art;
}

async function createHubNodeLarge(parent, x, y, props) {
  const hub = makeFrame({ name: 'Hub anatomy / ' + props.title, x, y, w: 420, h: 300, fillColor: TOKEN.panel, radius: R.card, strokeColor: props.accent, parent });
  hub.effects = [shadow()];
  await makeText({ parent: hub, x: 18, y: 18, w: 260, h: 18, characters: props.title, fontSize: 15, fontStyle: 'Bold', color: TOKEN.text1 });
  await makeText({ parent: hub, x: 18, y: 44, w: 300, h: 16, characters: props.subtitle, fontSize: 11, fontStyle: 'Regular', color: TOKEN.text2 });
  await makeChip({ parent: hub, x: 314, y: 16, w: 82, h: 28, label: props.outputMode ? '出口' : '中心', textColor: props.accent });

  const labels = props.outputMode
    ? ['Text', 'Character', 'Background', 'Frame ①②③', 'Voice']
    : ['ShotText', 'Character', 'Background', 'Frame ①②③', 'Voice'];
  for (let i = 0; i < labels.length; i += 1) {
    await createSlotCard(hub, 18 + (i % 2) * 194, 82 + Math.floor(i / 2) * 58, labels[i], i, props.accent, props.outputMode || i < 3);
  }

  const footer = makeFrame({ name: props.title + ' footer preview', x: 18, y: 248, w: 384, h: 34, fillColor: TOKEN.panelInset, radius: R.dockItem, strokeColor: TOKEN.hairline, parent: hub });
  await makeText({ parent: footer, x: 12, y: 10, w: 230, h: 12, characters: props.outputMode ? 'Seedance 2.0 · 6s · 1080p' : '镜头 01 · 6s · slow push-in', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeText({ parent: footer, x: 300, y: 10, w: 68, h: 12, characters: props.outputMode ? 'Render' : 'Expand', fontSize: 11, fontStyle: 'Semi Bold', color: props.accent, align: 'RIGHT' });
}

async function createSlotCard(parent, x, y, label, index, accent, connected) {
  const slot = makeFrame({ name: 'Hub slot / ' + label, x, y, w: 178, h: 46, fillColor: connected ? TOKEN.panelInset : TOKEN.chip, radius: R.dockItem, strokeColor: connected ? TOKEN.hairline2 : TOKEN.hairline3, parent });
  if (!connected) {
    setDashed(slot, [4, 4]);
  }
  makeFrame({ name: label + ' slot thumb', x: 8, y: 8, w: 30, h: 30, fillColor: connected ? accent : TOKEN.panel, radius: 8, strokeColor: TOKEN.hairline, parent: slot }).opacity = connected ? 0.6 : 1;
  await makeText({ parent: slot, x: 48, y: 10, w: 110, h: 12, characters: label, fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeText({ parent: slot, x: 48, y: 26, w: 110, h: 10, characters: connected ? '已连接' : '等待拖入', fontSize: 9, fontStyle: 'Medium', color: connected ? TOKEN.text2 : TOKEN.text3 });
  if (label.indexOf('Frame') >= 0) {
    await makeText({ parent: slot, x: 142, y: 15, w: 26, h: 12, characters: '①②③', fontSize: 9, fontStyle: 'Bold', color: accent, align: 'RIGHT' });
  }
  void index;
}

async function createCollapsedHub(parent, x, y) {
  const card = makeFrame({ name: 'Hub collapsed 340x120', x, y, w: 340, h: 120, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline2, parent });
  card.effects = [shadow()];
  await makeText({ parent: card, x: 18, y: 18, w: 180, h: 18, characters: 'Shot Hub · 折叠态', fontSize: 14, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeText({ parent: card, x: 18, y: 44, w: 210, h: 14, characters: '340×120 摘要，适合 6-10 个镜头并排', fontSize: 11, fontStyle: 'Regular', color: TOKEN.text2 });
  const chips = ['T', 'C', 'B', 'F①②③', 'V'];
  for (let i = 0; i < chips.length; i += 1) {
    await makeChip({ parent: card, x: 18 + i * 58, y: 76, w: i === 3 ? 54 : 34, h: 24, label: chips[i], textColor: i === 4 ? TOKEN.amber : TOKEN.text1 });
  }
}

async function createFrame14(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '14 Agent Distribute', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Agent Distribute', 'Agent 拆解后不直接铺满画布：先确认，再按 Shot lane 自动分发');

  const before = makeFrame({ name: 'Before distribute panel', x: 70, y: 124, w: 600, h: 650, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline, parent: art });
  const after = makeFrame({ name: 'After distribute panel', x: 770, y: 124, w: 600, h: 650, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline, parent: art });
  await makeText({ parent: before, x: 24, y: 22, characters: '分发前', fontSize: 15, fontStyle: 'Bold', color: TOKEN.text1 });
  await makeText({ parent: after, x: 24, y: 22, characters: '分发后', fontSize: 15, fontStyle: 'Bold', color: TOKEN.text1 });

  await createTopologyNode(before, 52, 150, { label: 'Composer', sub: '故事创意已发送', glyph: '⌗', accent: TOKEN.text2 });
  await createTopologyNode(before, 310, 150, { label: 'Agent', sub: '3 角色 · 4 场景 · 12 镜头', glyph: 'A', accent: TOKEN.amber, hub: true });
  const expand = makeFrame({ name: 'Expand to nodes button', x: 210, y: 370, w: 180, h: 38, fillColor: TOKEN.ctaBg, radius: R.chip, parent: before });
  await makeText({ parent: expand, x: 0, y: 12, w: 180, h: 14, characters: '+ 展开为镜头节点', fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.textOnLight, align: 'CENTER' });
  await makeText({ parent: before, x: 112, y: 440, w: 380, h: 56, characters: '用户可以取消部分角色/场景节点化；默认按镜头 lane 展开，避免一次性生成 20+ 个节点导致画布拥挤。', fontSize: 12, fontStyle: 'Regular', color: TOKEN.text2, align: 'CENTER', lineHeight: 20 });

  for (let i = 0; i < 3; i += 1) {
    const laneY = 86 + i * 176;
    await makeText({ parent: after, x: 24, y: laneY + 42, w: 66, h: 14, characters: 'Shot 0' + (i + 1), fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.amber });
    const shot = await createTopologyNode(after, 94, laneY, { label: 'Shot Hub', sub: i === 0 ? '开场推镜' : i === 1 ? '角色特写' : '镜头转场', glyph: 'S', accent: TOKEN.amber, hub: true });
    const text = await createTopologyNode(after, 346, laneY - 24, { label: 'Text', sub: '镜头描述', glyph: 'T', accent: TOKEN.slate });
    const image = await createTopologyNode(after, 346, laneY + 70, { label: 'Image refs', sub: 'C / B / F', glyph: 'F', accent: TOKEN.emerald });
    await createLabeledConnection(after, shot, text, 'text');
    await createLabeledConnection(after, shot, image, 'assets');
  }

  return art;
}

async function createFrame15(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '15 Inspector Variants', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Inspector Variants', '9 种节点对应不同右侧检查器字段，避免 Agent-only inspector 落代码不完整');

  const cards = [
    { title: 'Composer', accent: TOKEN.text2, fields: ['prompt', 'planner model', 'attach refs', 'send mode'] },
    { title: 'Agent', accent: TOKEN.amber, fields: ['idea summary', 'planner model', 'breakdown counters', '展开为节点'] },
    { title: 'Shot', accent: TOKEN.amber, fields: ['shot name', 'duration', 'cameraMotion', 'slot health'] },
    { title: 'ShotText', accent: TOKEN.slate, fields: ['startState', 'endState', 'motion beat', 'prompt lock'] },
    { title: 'CharacterImage', accent: TOKEN.emerald, fields: ['name / role', 'personality', 'goal', '参考图 slot'] },
    { title: 'BackgroundImage', accent: TOKEN.emerald, fields: ['location', 'time', 'mood', 'lighting'] },
    { title: 'FrameImage', accent: TOKEN.emerald, fields: ['keyframe order', 'composition', 'aspect ratio', 'source refs'] },
    { title: 'Voice', accent: TOKEN.amber, fields: ['MP3 upload', 'voice card picker', 'TTS model', '试听'] },
    { title: 'Seedance', accent: TOKEN.violet, fields: ['resolution', 'duration', 'motion strength', 'render route'] },
  ];

  for (let i = 0; i < cards.length; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    await createInspectorVariantCard(art, 62 + col * 454, 126 + row * 242, cards[i]);
  }

  return art;
}

async function createInspectorVariantCard(parent, x, y, props) {
  const card = makeFrame({ name: 'Inspector variant / ' + props.title, x, y, w: 410, h: 206, fillColor: TOKEN.panel, radius: R.card, strokeColor: props.accent, parent });
  card.effects = [shadow()];
  await makeText({ parent: card, x: 18, y: 18, w: 170, h: 18, characters: props.title, fontSize: 14, fontStyle: 'Bold', color: TOKEN.text1 });
  await makeChip({ parent: card, x: 292, y: 14, w: 92, h: 28, label: 'Inspector', textColor: props.accent });

  for (let i = 0; i < props.fields.length; i += 1) {
    const field = makeFrame({ name: props.title + ' field / ' + props.fields[i], x: 18, y: 56 + i * 34, w: 374, h: 28, fillColor: TOKEN.panelInset, radius: R.dockItem, strokeColor: TOKEN.hairline, parent: card });
    await makeText({ parent: field, x: 12, y: 8, w: 190, h: 12, characters: props.fields[i], fontSize: 11, fontStyle: 'Medium', color: TOKEN.text1 });
    makeCircle({ name: props.fields[i] + ' field dot', x: 348, y: 11, size: 6, fillColor: props.accent, parent: field });
  }
}

async function createFrame16(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '16 Model Picker States', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Model Picker Candidate Sets', '不同节点打开模型选择器时展示不同候选集；Shot Hub 不应有生成模型');

  const pickers = [
    { title: 'CharacterImage', mode: '图像模型', accent: TOKEN.emerald, items: ['Flux 2 Pro', 'Nano Banana', 'SDXL'] },
    { title: 'BackgroundImage', mode: '图像模型', accent: TOKEN.emerald, items: ['Seedream 4.5', 'Flux Kontext', 'Recraft'] },
    { title: 'FrameImage', mode: '图像模型', accent: TOKEN.emerald, items: ['Gemini Image', 'Flux 2 Max', 'Ideogram'] },
    { title: 'Voice', mode: 'TTS / Voice', accent: TOKEN.amber, items: ['Fish Audio S2', 'F5-TTS', '本地声音'] },
    { title: 'Seedance', mode: '视频模型', accent: TOKEN.violet, items: ['Seedance 2.0', 'Kling v3', 'Hailuo / MiniMax'] },
    { title: 'ShotText', mode: 'Planner', accent: TOKEN.slate, items: ['Gemini 3 Pro', 'GPT-5.1', 'Auto route'] },
    { title: 'Shot Hub', mode: 'No model', accent: TOKEN.amber, items: ['不显示 picker', '只配置 slots', '由下游 Seedance 渲染'] },
  ];

  for (let i = 0; i < pickers.length; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    await createModelPickerPanel(art, 62 + col * 338, 132 + row * 320, pickers[i]);
  }

  await makeText({ parent: art, x: 62, y: 798, w: 900, h: 20, characters: '实现含义：modelOptionsByType 中 shot 应改为无模型或禁用态；shotText / composer / agent 使用 planner；图片、语音、视频按类型隔离候选集。', fontSize: 12, fontStyle: 'Medium', color: TOKEN.text2 });
  return art;
}

async function createModelPickerPanel(parent, x, y, props) {
  const panel = makeFrame({ name: 'Model picker / ' + props.title, x, y, w: 300, h: 260, fillColor: TOKEN.panel, radius: R.card, strokeColor: TOKEN.hairline, parent });
  panel.effects = [shadow()];
  await makeText({ parent: panel, x: 18, y: 18, w: 150, h: 18, characters: props.title, fontSize: 14, fontStyle: 'Bold', color: TOKEN.text1 });
  await makeChip({ parent: panel, x: 184, y: 14, w: 92, h: 28, label: props.mode, textColor: props.accent });

  for (let i = 0; i < props.items.length; i += 1) {
    const item = makeFrame({ name: props.title + ' model option / ' + props.items[i], x: 16, y: 62 + i * 48, w: 268, h: 38, fillColor: i === 0 ? TOKEN.chipHover : TOKEN.panelInset, radius: R.dockItem, strokeColor: TOKEN.hairline, parent: panel });
    makeCircle({ name: props.items[i] + ' model dot', x: 12, y: 15, size: 8, fillColor: props.accent, parent: item });
    await makeText({ parent: item, x: 32, y: 11, w: 172, h: 14, characters: props.items[i], fontSize: 12, fontStyle: i === 0 ? 'Semi Bold' : 'Medium', color: TOKEN.text1 });
    await makeText({ parent: item, x: 216, y: 11, w: 36, h: 14, characters: i === 0 ? '默认' : '可选', fontSize: 10, fontStyle: 'Semi Bold', color: i === 0 ? props.accent : TOKEN.text3, align: 'RIGHT' });
  }

  if (props.mode === 'No model') {
    makeFrame({ name: props.title + ' disabled overlay', x: 16, y: 200, w: 268, h: 34, fillColor: TOKEN.chip, radius: R.dockItem, strokeColor: TOKEN.hairline, parent: panel }).opacity = 0.72;
    await makeText({ parent: panel, x: 16, y: 210, w: 268, h: 12, characters: 'Hub 只组织素材，不直接调用模型', fontSize: 11, fontStyle: 'Medium', color: TOKEN.text2, align: 'CENTER' });
  }
}

async function createFrame17(parent, baseX, baseY) {
  const art = await createDesignFrame(parent, '17 Default Copy Matrix', baseX, baseY, 1440, 900);
  await createFrameTitle(art, 'Default / Empty Copy Matrix', '9 种节点的中文默认文案、chip 和 footer，供 i18n keys 直接落地');

  const rows = [
    ['Composer', '输入', '输入你的创意或请求，可添加上游连线以引入参考素材', 'Agent 模式 / 询问 / 技能库', '输入入口'],
    ['Agent', '等待', '把 Composer 节点连接到这里，发送后显示 Agent 拆解的剧本结构', '剧本拆解 / 结构编辑 / 展开为节点', 'Planner'],
    ['Shot', '中心', '把一个镜头的文本、图片、语音和最终视频收束到同一个任务中心', '分出文本图片语音 / 追踪依赖 / 汇入出片', '镜头中心'],
    ['ShotText', '草稿', '负责镜头描述、动作节奏和 Seedance 提示词，可引用图片与语音分支', '调用角色图 / 调用背景图和镜头图 / 绑定语音轨', '文本支路'],
    ['CharacterImage', '参考', '生成或接入角色定妆，保证后续镜头里的角色身份稳定', '角色外观 / 服装与表情 / 角色卡', '图片支路'],
    ['BackgroundImage', '参考', '定义镜头所在空间、光线和时代感，为镜头图提供环境约束', '场景空间 / 光线氛围 / 背景一致性', '图片支路'],
    ['FrameImage', '参考', '整合角色和背景，生成最接近最终镜头构图的关键画面', '镜头构图 / 角色入画 / 视频首帧参考', '图片支路'],
    ['Voice', '音频', '接入 MP3 上传、本地语音或 TTS，作为镜头对白、旁白或音效参考', '上传 MP3 / 本地声音生成 / 对白旁白音效', '语音支路'],
    ['Seedance', '出口', '收集镜头文本、图片和语音后，通过视频模型生成单个镜头片段', 'Seedance 路由 / 参考素材锁定 / 输出镜头片段', '视频出口'],
  ];

  await makeText({ parent: art, x: 64, y: 118, w: 120, h: 14, characters: '节点', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3 });
  await makeText({ parent: art, x: 208, y: 118, w: 70, h: 14, characters: 'status', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3 });
  await makeText({ parent: art, x: 300, y: 118, w: 470, h: 14, characters: 'body', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3 });
  await makeText({ parent: art, x: 800, y: 118, w: 370, h: 14, characters: 'chips', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3 });
  await makeText({ parent: art, x: 1196, y: 118, w: 120, h: 14, characters: 'footer', fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3 });

  for (let i = 0; i < rows.length; i += 1) {
    await createCopyMatrixRow(art, 54, 148 + i * 74, rows[i], i);
  }

  return art;
}

async function createCopyMatrixRow(parent, x, y, row, index) {
  const card = makeFrame({ name: 'Copy matrix row / ' + row[0], x, y, w: 1328, h: 58, fillColor: index % 2 === 0 ? TOKEN.panel : TOKEN.panelInset, radius: R.dockItem, strokeColor: TOKEN.hairline, parent });
  await makeText({ parent: card, x: 12, y: 16, w: 126, h: 14, characters: row[0], fontSize: 12, fontStyle: 'Semi Bold', color: TOKEN.text1 });
  await makeChip({ parent: card, x: 154, y: 14, w: 70, h: 28, label: row[1] });
  await makeText({ parent: card, x: 246, y: 10, w: 462, h: 34, characters: row[2], fontSize: 11, fontStyle: 'Regular', color: TOKEN.text2, lineHeight: 16 });
  await makeText({ parent: card, x: 744, y: 18, w: 360, h: 14, characters: row[3], fontSize: 11, fontStyle: 'Medium', color: TOKEN.text1 });
  await makeText({ parent: card, x: 1142, y: 18, w: 132, h: 14, characters: row[4], fontSize: 11, fontStyle: 'Semi Bold', color: TOKEN.text3, align: 'RIGHT' });
}

void ALL_FRAME_NAMES;
