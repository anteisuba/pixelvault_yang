# Studio 侧边栏 UX 优化 v2

## 已完成

- [x] TreeView 替换 shadcn SidebarMenu（树形折叠项目列表）
- [x] 项目名 "Parent / Child" 自动解析为嵌套树
- [x] "全部生成" 作为顶部特殊入口
- [x] API Keys 紧凑列表
- [x] 项目操作按钮（重命名/子项目/删除）hover 显示
- [x] TopBar 侧边栏收缩按钮保留（SidebarProvider offcanvas）
- [x] TopBar 模型/API 指示器始终显示
- [x] 拖拽图片到项目（基础版：拖到项目树区域 = 移入当前选中项目）
- [x] PATCH /api/generations/[id]/project API route

## 待优化 TODO

### 拖拽体验优化

- [ ] 精确 drop 到具体项目节点（目前只能 drop 到当前选中的项目）
- [ ] 用 Pragmatic DnD 替换 HTML5 drag API（更好的视觉反馈）
- [ ] 拖拽时每个项目节点独立高亮（而非整个树区域高亮）
- [ ] 拖拽预览缩略图（drag ghost image）

### 项目管理优化

- [ ] 项目生成数量 badge 显示在每个节点右侧
- [ ] 重命名改为 inline 编辑（不用 prompt 弹窗）
- [ ] 删除前确认弹窗
- [ ] 右键菜单（替代 hover 按钮，移动端更友好）
- [ ] 新建项目时自动进入重命名状态

### 视觉优化

- [ ] 项目文件夹图标区分有/无子项目
- [ ] 选中项目时左侧彩色指示条
- [ ] 空项目占位提示
- [ ] 侧边栏收起时显示 mini 图标模式

### 移动端

- [ ] 手机端侧边栏用 Sheet 弹出（目前直接隐藏）
- [ ] 底部 Tab 加项目入口

## 技术方案

- **Tree View**: `src/components/ui/tree-view.tsx` (shadcn-tree-view)
- **Drag & Drop**: `@atlaskit/pragmatic-drag-and-drop`（已安装未使用，当前用 HTML5 API）
- **API**: `PATCH /api/generations/[id]/project` (已完成)
