在浏览器中激活交互式元素检查器，点击页面元素后识别对应的 React 组件和源文件。$ARGUMENTS

请按以下步骤执行：

1. **连接浏览器**
   - 调用 `tabs_context_mcp`（createIfEmpty: true）获取当前标签页
   - 如果 $ARGUMENTS 包含 URL，先导航到该地址

2. **注入 Inspector 脚本**
   - 读取 `.claude/commands/inspect-script.js` 文件内容
   - 通过 `javascript_tool` 将完整脚本注入到当前页面
   - 告诉用户："Inspector 已激活。悬停高亮元素，点击捕获详情，Esc 取消。"

3. **等待用户操作**
   - 等待用户确认已点击目标元素

4. **读取捕获数据**
   - 调用 `read_console_messages`，pattern 设为 `CLAUDE_INSPECT`
   - 解析 `[CLAUDE_INSPECT]` 前缀后的 JSON 数据
   - 如果收到 `{"cancelled":true}` 则告知用户已取消并结束
   - 如果收到 `{"already_active":true}` 则先注入清理脚本再重新注入

5. **定位源文件**（按优先级尝试）
   - 如果 `react.debugSource.fileName` 存在，直接使用该路径
   - 否则用 Grep 搜索 `export function {componentName}` 在 `src/components/`
   - 再尝试 Glob 搜索 `**/{componentName}.tsx`
   - 最后在所有 `.tsx` 中搜索组件名

6. **清理 Inspector**
   - 通过 `javascript_tool` 执行：`window.__CLAUDE_INSPECTOR_CLEANUP && window.__CLAUDE_INSPECTOR_CLEANUP()`

7. **展示结果**，格式如下：
   ```
   ## 检查结果
   - **React 组件**: {componentName}（若无 fiber 则标注 "Server Component / HTML"）
   - **源文件**: {filePath}:{lineNumber}
   - **DOM 路径**: {domPath}
   - **尺寸**: {width} × {height}
   - **关键样式**:
     - color / backgroundColor / fontSize / padding / margin / borderRadius
   - **文本内容**: {前100字符}
   ```

8. **询问用户**："需要我读取或修改这个组件吗？"
   - 如果用户需要修改，读取源文件并进行编辑
   - 如果用户想继续检查其他元素，重新从步骤 2 开始
