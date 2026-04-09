# Studio 侧边栏 UX 优化

## 问题清单

### 1. 侧边栏组件体验差

- 当前组件操作麻烦，交互不直观
- 需要调研更合适的侧边栏组件或重新设计交互

### 2. 项目目录层级不明显

- 项目列表视觉上平铺，看不出层级关系
- "全部生成" 和具体项目之间没有视觉区分
- 多个 "New project" 命名不直观

### 3. 拖拽图片到项目

- 希望能从历史记录/Gallery 中拖动图片放入项目
- 需要实现 drag & drop 交互
- 拖拽目标：侧边栏的项目文件夹

## 优化方向

### 侧边栏重设计

- 项目文件夹用树形结构 + 缩进 + 折叠
- "全部生成" 作为特殊入口，视觉上与项目区分
- 项目图标 + 生成数量 badge
- 右键菜单：重命名、删除、移动

### 拖拽交互

- Gallery/历史中的图片卡支持 `draggable`
- 侧边栏项目文件夹作为 drop target
- 拖拽时高亮目标项目
- Drop 后调用 API 将图片移入项目

## 关键文件

| 文件                                               | 改动                    |
| -------------------------------------------------- | ----------------------- |
| `src/components/business/studio/StudioSidebar.tsx` | 重构侧边栏布局          |
| `src/components/business/studio/StudioGallery.tsx` | 图片卡添加 draggable    |
| `src/components/business/ImageCard.tsx`            | 支持 drag 事件          |
| `src/services/project.service.ts`                  | 添加"移动图片到项目"API |
