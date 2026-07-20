# 节点画布关系呈现范式 · 业界调研（2026-07）

> 性质：**canvas-relationship-v3 决策的证据输入**（2026-07-17，owner 要求"再去网上调查"后的补充调研）。结论服务三问：①关系范式 ②「关系线」开关 ③端口视觉。施工以 `docs/plans/canvas-relationship-v3-2026-07.md` 为准，本文只存证据。

## 一句话结论

**业界没有任何主流工具默认全隐连线**（PixelVault 现状是孤例）；也没有工具靠"更多常显线"管理复杂度——专业工具的收敛答案恰是"两类关系分层：主流可见、参考按需"（Houdini 双层先例最完整）。

## 1 · 逐工具证据

| 工具                            | 连线默认                                                                                                                    | 复杂度管理手段                                                                                    | 端口                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Krea Nodes**（AI 画布头部）   | 常显                                                                                                                        | Section 分组 / node groups / 便签                                                                 | 类型色 handle 左入右出，**拖线是核心手势**（"drag from any handle to see a list of connectable nodes"）                     |
| **ComfyUI**                     | 常显（Spline 默认）                                                                                                         | Link Render Mode 四档：Straight/Linear/Spline/**Hidden**；Canvas 菜单可临时隐藏全部连线；subgraph | 类型色端口；**Hidden 模式下仅"已连接"的端点保留彩点**（"when links are connected the colours appear on the joined points"） |
| **Fal Workflows**               | 常显（"colored connection lines between nodes"）                                                                            | —（被批参数全裸露、无预览 = 乱）                                                                  | 类型色                                                                                                                      |
| **Invoke**                      | 常显（"color-coded node connections"）                                                                                      | Form Builder 把节点图折叠成简化界面                                                               | 类型色                                                                                                                      |
| **Figma Weave (Weavy)**         | 常显                                                                                                                        | 工作流可转"app mode"简化视图                                                                      | 未详                                                                                                                        |
| **Flora**                       | 常显（轻量）                                                                                                                | 模板/结构化 flow                                                                                  | 弱化；评测点名"Connecting assets to generation nodes can be confusing"——连接 affordance 不清晰直接挨批                      |
| **Houdini 网络编辑器**          | wires 常显（**永不可隐**）；**dependency links（参考关系）三档：不显示 / 仅选中节点 / 全部节点**（View ▸ Dependency links） | 双层关系分离 + network box                                                                        | 参考线粉棕色、入左出右（方向纪律与 wire 一致）                                                                              |
| **Unreal Blueprint / Material** | 常显                                                                                                                        | **Hide Unrelated**（4.23 起工具栏钮）：选中节点 → 无关节点全部变暗                                | 类型色 pin                                                                                                                  |
| **FigJam / 白板系**             | 常显（connector 是内容）                                                                                                    | —                                                                                                 | **无常驻端口**：hover 意图区（四向锚点/边缘/任意点）到悬停时才显现                                                          |

## 2 · 对三问的含义

### ① 范式：证据支持「装配 + 两级墨线」（融合），反对两个极端

- **反对维持全隐**：九个工具零先例。关系不可见的直接后果在 Flora 评测里可见（连接困惑被点名）——而 Flora 还是有线的，PixelVault 现状连线都没有。
- **反对全量常显（纯 A）**：Fal 是反面教材——全裸露被评"混乱"；工具们的应对全是"分层/折叠"（Invoke Form Builder、Weave app mode、Krea groups、UE Hide Unrelated），没有人靠裸奔全部关系取胜。
- **两级正是专业工具的收敛点**：Houdini 把关系分成 wires（生产主流，常显、永不可隐）与 dependency links（参考关系，默认收起、按选中/全部分档显示）——与 v3 的「骨干边常显 / 成分边选中显」逐条同构，连方向纪律（入左出右）都一致。UE Hide Unrelated 则验证"选中驱动的关系聚焦"是一线专业功能而非小众技巧。

### ② 「关系线」开关：有先例，推荐**双态**（不做"全隐"档）

- 先例：Houdini 依赖线三档菜单、ComfyUI Canvas 菜单临时隐藏连线、UE Hide Unrelated 工具栏钮——"关系显示档位"是行业标准 affordance。
- 但 **Houdini 从不允许隐藏 wires**，只让"参考层"分档。对应到 PixelVault：骨干边（制片流）应像 wires 一样不可隐——若提供"全隐"档，「关系可追溯」承诺就退化成可选项，正好退回 owner 的痛点。
- 推荐：**双态 toggle**——默认档（骨干常显+成分选中显）↔ 全显档（诊断）。不做三态。

### ③ 端口：推荐**锚点化退场**，证据两面夹击

- 保留类型色端口的工具（Krea/ComfyUI/Fal/Invoke/UE）保留它只有一个理由：**拖线是它们的绑定手势**，端口 = 手势的 affordance。PixelVault 绑定手势是吞噬（拖卡落卡/快投），端口不再承担任何手势——留着就是误导性 affordance（看得见、拖不动）。
- 绑定不走端口的工具（FigJam/白板系）的答案一致：**无常驻端口**，需要时按意图显现。
- 残余信号的精确先例 = ComfyUI Hidden 模式：**只有已连接的端点保留彩点**——即 v3 的"锚点墨点只在有可见边处出现"。类型合法性反馈由拖拽时的张口/摇头承担（比色配对更强的即时反馈，已实现）。

## 3 · 边界与不采纳

- 不照搬 Houdini 粉棕参考线色——PixelVault 成分显现线走石绿（落点③选中态），骨干走中性墨（--node-edge）。
- 不引入 UE 式"无关节点变暗"整屏 dimming——画布卡片承载媒体内容，整屏变暗与"作品发色"冲突；选中聚焦由石绿描边+显现线表达即可（后续若需要可作增强档评估）。
- 不做 ComfyUI 式连线渲染样式偏好设置（straight/linear/spline 用户可选）——一种墨线，样式是身份不是偏好。

## Source of Truth

- Houdini dependency links：https://www.sidefx.com/docs/houdini/network/dependencies.html （三档菜单、粉棕线、入左出右）
- ComfyUI links / Link Render Mode：https://docs.comfy.org/development/core-concepts/links · https://weirdwonderfulai.art/comfyui/tip-workflow-link-noodle-settings/ · https://comfyui-wiki.com/en/interface/settings/lite-graph
- UE Hide Unrelated：https://www.coconutlizard.co.uk/blog/blueprint-extension-hide-unrelated-nodes/
- Krea Nodes 文档：https://www.krea.ai/docs/user-guide/features/nodes
- 横评（Fal/Invoke/Weave/Flora/Freepik）：https://www.krea.ai/blog/top-node-based-ai-workflow-apps
- Flora 评测（连接困惑）：https://www.banani.co/blog/flora-ai-review
- FigJam connector 意图区：https://help.figma.com/hc/en-us/articles/1500004414542 · forum.figma.com 相关帖

## Last Verified

- Date: 2026-07-17 · Method: WebSearch + WebFetch 逐源核读（Houdini/ComfyUI 官方文档、Krea 官方文档与博客、UE 社区实现文、Figma 官方帮助与论坛、第三方评测两篇）；未登录实测的部分（Weave/Flora 画布内连线视觉细节）在表中标"未详"，不硬造。
