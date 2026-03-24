# lvyovo-wiki.tech/pictures 图库页面分析

> 参考站点: https://lvyovo-wiki.tech/pictures
> 分析日期: 2026-03-24
> 目的: 为 PixelVault 图库管理提供交互参考

---

## 1. 整体视觉风格

**「散落拍立得」风格** — 图片以物理拍立得照片的形式，随机角度散落堆叠在桌面上。

| 属性 | 值 |
|------|-----|
| 背景 | 渐变色 Canvas（全屏 `<canvas>` 元素，薄荷绿渐变） |
| 页面结构 | 全屏无滚动，所有图片在视口内堆叠 |
| 卡片总数 | 17 张图片 |
| 框架 | Next.js 16 (App Router + Turbopack + RSC) |

---

## 2. 图片存储方式

### 2.1 URL 结构
```
/images/pictures/{hash}.jpg
/images/pictures/{hash}.png
```
- 文件名: 16 位十六进制 hash（如 `89b8b876b14a01b9.jpg`）
- 存储位置: 同域名 `/images/pictures/` 目录下（静态资源）
- 格式: jpg / png 混用，未做 WebP 优化
- Avatar 使用 Next.js Image 优化: `/_next/image?url=%2Fimages%2Favatar.png&w=96&q=75`

### 2.2 加载策略
- **无懒加载** — 图片 `loading` 属性为 `auto`（仅 avatar 使用 `lazy`）
- **无 srcset** — 图片直接使用 `<img src="...">`，未做响应式图片
- 图片统一渲染宽度 `200px`，高度按比例计算
- 所有图片一次性加载（17 张，适合小体量图库）

---

## 3. 布局方案 — 绝对定位 + 随机旋转

### 3.1 卡片容器
```html
<main class="relative z-10 h-full">
  <!-- 17 个图片卡片 -->
  <div class="pointer-events-auto absolute origin-center -translate-1/2
              cursor-pointer shadow-xl transition-[scale] hover:scale-105"
       style="width: 200px; height: 133px; border-width: 8px;
              z-index: 3; left: 343px; top: 289px;
              opacity: 1; transform: rotate(24deg);
              user-select: none; touch-action: none;">
    <img draggable="false"
         class="h-full w-full object-cover select-none"
         src="/images/pictures/xxx.jpg">
  </div>
</main>
```

### 3.2 布局核心原理

| 属性 | 实现方式 |
|------|---------|
| **定位** | `position: absolute` + `left` / `top` 内联样式 |
| **居中偏移** | Tailwind `-translate-1/2`（向左上偏移自身50%） |
| **随机旋转** | `transform: rotate(Xdeg)` — 每张卡片不同角度（-26° ~ +24°） |
| **堆叠层级** | `z-index: 0~16` — 递增，后面的卡片叠在上面 |
| **拍立得边框** | `border: 8px solid white` — 白色粗边框模拟拍立得相纸 |
| **阴影** | Tailwind `shadow-xl` 营造物理感 |
| **变换原点** | `origin-center` — 旋转围绕中心点 |

### 3.3 卡片尺寸
- 宽度统一: `200px`
- 高度按原图比例: 约 `117px ~ 240px`
- 正方形图片: `200x200px`
- 横向图片: `200x133px`（3:2 比例）
- 纵向图片: `200x240px`

---

## 4. 交互行为

### 4.1 Hover 效果
```css
/* Tailwind class: transition-[scale] hover:scale-105 */
transition-property: scale;
&:hover {
  scale: 1.05;  /* 轻微放大 */
}
```

### 4.2 点击展开（核心交互）

点击图片后的变化:

| 属性 | 默认状态 | 展开状态 |
|------|---------|---------|
| 尺寸 | `200px × ~133px` | `~478px × ~572px`（约 2.4x 放大） |
| 边框 | `8px solid white` | `~23.5px solid white`（等比放大） |
| z-index | `0~16` | `9999` |
| 旋转 | `rotate(24deg)` 等 | `rotate(~0.27deg)`（几乎摆正） |
| 位移 | 原始位置 | `translateX(251px) translateY(39px)`（移向中心） |

#### 展开动画特征:
1. **尺寸放大** — 从 200px 放大到 ~478px
2. **旋转归零** — 从随机角度平滑归正到接近 0°
3. **位移居中** — translate 到屏幕中央偏右
4. **边框等比** — 白色边框从 8px 放大到 ~23.5px
5. **z-index 提升** — 跳到 9999 确保在最上层
6. **其他卡片退后** — 背景卡片可能有位移避让

### 4.3 信息浮层

展开图片时，旁边浮现一个彩色信息卡片:

```html
<div class="fixed min-h-[150px] w-[200px] cursor-pointer p-6 shadow"
     style="background-color: rgb(136, 230, 229);
            z-index: 10000;
            right: 213px; top: 315px;
            opacity: 0; transform: scale(1.01);
            user-select: none; touch-action: none;">
  <div class="text-secondary mb-2 text-xs">2026-03-10 14:53</div>
  <div class="text-sm">omg是小猫</div>
</div>
```

| 属性 | 值 |
|------|-----|
| 背景色 | `rgb(136, 230, 229)`（青绿色，每张图片可能不同） |
| 定位 | `fixed`，出现在展开图片旁边 |
| z-index | `10000`（高于展开图片的 9999） |
| 内容 | 日期时间 + 图片标题 |
| 尺寸 | 宽 200px，最小高度 150px |
| 可拖拽 | `touch-action: none; user-select: none` |

### 4.4 拖拽行为

所有卡片都支持拖拽:
- `user-select: none` — 防止文字选中
- `touch-action: none` — 禁用浏览器默认触摸行为
- `cursor-pointer` — 鼠标指针
- 图片 `draggable="false"` — 防止浏览器默认图片拖拽

拖拽通过自定义 JS 实现（基于 pointer/touch 事件），不依赖外部手势库。

### 4.5 关闭/收起

点击空白区域或其他图片时，展开的图片回到原始位置:
- 存在全屏遮罩层: `<div class="bg-card fixed inset-0 z-50 backdrop-blur-xl" style="opacity: 0">`
- 遮罩层在展开时可能变为半透明

---

## 5. 背景效果

```html
<div class="fixed inset-0 z-0 overflow-hidden">
  <canvas class="h-full w-full" width="1920" height="946"></canvas>
</div>
```

- 使用 `<canvas>` 绘制全屏渐变背景
- 薄荷绿 → 浅绿 渐变色调
- `fixed` 定位，`z-0` 在最底层
- Canvas 分辨率匹配屏幕（1920x946）

---

## 6. 导航栏

```html
<div class="card squircle overflow-hidden flex items-center gap-6 p-3"
     style="left: 24px; top: 16px; width: 340px; height: 64px;">
  <!-- 头像 + 5个导航图标 -->
</div>
```

| 属性 | 值 |
|------|-----|
| 位置 | 左上角 `(24px, 16px)` |
| 样式 | 毛玻璃卡片 (`.card` 类) |
| 圆角 | `squircle` 超椭圆圆角 (40px + corner-shape) |
| 背景 | `#ffffff66` 半透明白 + `backdrop-filter: blur(4px)` |
| 导航项 | 头像 → Blog → Projects → About → Share → Bloggers |
| 滑动指示器 | 圆形渐变高亮当前页 |

右上角有一个「编辑」按钮:
```html
<button class="rounded-xl border bg-white/60 px-6 py-2 text-sm
               backdrop-blur-sm transition-colors hover:bg-white/80">
  编辑
</button>
```

---

## 7. 技术栈总结

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 渲染 | React Server Components (RSC) |
| 样式 | Tailwind CSS |
| 动画 | CSS transition + 自定义 JS (touch/pointer events) |
| 拖拽 | 原生 pointer events（非第三方手势库） |
| 背景 | Canvas 2D 渐变 |
| Toast | Sonner |
| 状态 | 自定义 store（类 Zustand） |

---

## 8. 可借鉴的设计模式

### 适合 PixelVault 图库的模式:

1. **拍立得风格卡片**
   - 白色粗边框 → 改为符合设计系统的 `#faf9f5` 色调
   - 随机旋转角度增加趣味性
   - 阴影营造物理堆叠感

2. **点击展开交互**
   - 图片放大 + 旋转归正 + 居中定位
   - 信息浮层显示元数据（生成日期、提示词、模型等）
   - 背景模糊遮罩聚焦注意力

3. **拖拽重排**
   - 用户可以拖拽翻看堆叠照片
   - 增加探索乐趣

### 需要调整的地方:

| 原站特征 | PixelVault 适配 |
|---------|----------------|
| 17 张固定图片 | 需支持动态加载 + 分页/无限滚动 |
| 无懒加载 | 大量图片需要虚拟化 + 懒加载 |
| 静态文件存储 | 保持 Cloudflare R2 CDN |
| 单一堆叠视图 | 可增加网格/瀑布流切换 |
| Canvas 渐变背景 | 使用设计系统 `#faf9f5` 背景 |
| 青绿色信息卡 | 使用 accent `#d97757` |  顏色不變
