# 组件架构说明 / Component Architecture

本文档详细描述 `src/components/` 中每个组件的职责、接收的 Props 和与其他模块的关系。

---

## 组件树总览

```
TreeChat (主容器)
├── InfoPanel          左侧对话列表侧边栏
├── ReactFlow 画布
│   ├── ChatNode       普通对话节点
│   ├── ArtifactNode   文本/图片 Artifact 节点
│   └── MergeEdge      合并边（自定义 edge type）
├── LinearChatView     右侧线性聊天视图
│   └── 里程碑时间轴侧边栏（内嵌）
├── InputPanel         底部消息输入面板
├── SettingsModal      设置弹窗
├── ModelSelector      模型选择器（嵌入 InputPanel）
├── FocusModeOverlay   双击节点触发的全屏专注视图
└── WaitlistModal      等待列表弹窗（可选）
```

---

## TreeChat.js ★ 主应用容器

**文件**: `src/components/TreeChat.js`

### 职责
- 持有全局状态：`nodes`, `edges`, `selectedNodeId`, `settings`, `mergeMode`, `pendingMerge` 等
- 初始化所有自定义 Hooks（见 `doc/hooks.md`）
- 将 state 和回调分发给子组件
- 管理 ReactFlow 画布：viewport、拖拽、节点注册

### 关键状态
| 状态 | 类型 | 说明 |
|------|------|------|
| `nodes` | `Node[]` | ReactFlow 节点数组（含 chatNode、artifactNode） |
| `edges` | `Edge[]` | ReactFlow 边数组（含普通边、mergeEdge） |
| `selectedNodeId` | `string\|null` | 当前选中节点 ID，驱动线性视图 |
| `settings` | `Settings` | 全局设置（API Key、URL、语言等） |
| `mergeMode` | `object\|null` | 合并模式状态，`{ selectedNodeIds: string[] }` |
| `pendingMerge` | `object\|null` | 待执行合并配置，见合并流程说明 |

### 关键回调传递
- `onAddBranch` → `ChatNode` → `useNodeOperations.handleAddBranch`
- `onEditNode` → `ChatNode` / `LinearChatView` → `useNodeOperations.handleEditNode`
- `onMergeNode` → `ChatNode` → `useNodeOperations.handleMergeNode`
- `onSelectNode` → `ChatNode` → 更新 `selectedNodeId`

---

## ChatNode.js

**文件**: `src/components/ChatNode.js`

### 职责
- 渲染单个对话节点的卡片 UI
- 展示用户消息摘要 + 状态（loading / error / complete）
- 提供操作按钮：新建分支、进入专注、删除、合并选择

### 关键 Props
| Prop | 类型 | 说明 |
|------|------|------|
| `data.messages` | `Message[]` | 该节点的对话消息数组 |
| `data.status` | `'loading'\|'complete'\|'error'` | 节点当前状态 |
| `data.isMergedNode` | `boolean` | 是否为合并节点（用于样式区分） |
| `data.isRoot` | `boolean` | 是否为根节点（不可删除/编辑） |
| `data.onAddBranch` | `function` | 新建子分支回调 |
| `data.onMergeNode` | `function` | 进入合并选择模式回调 |

### 消息结构
```js
{
  role: "user" | "assistant",
  content: string | ContentPart[],  // 多模态时为数组
  model: string,
  files?: UploadedFile[],
  thinking?: string,  // 思维链内容（DeepSeek-R1 等）
}
```

---

## LinearChatView.js ★

**文件**: `src/components/LinearChatView.js`

### 职责
- 将选中路径（从 root 到 selectedNode）渲染为传统气泡聊天界面
- 支持流式输出、折叠思考块、内联消息编辑、消息复制
- 右侧内嵌**里程碑时间轴导航侧边栏**（条件渲染，可在设置中关闭）
- 侧边栏：滚动追踪高亮、分叉/合并标记、Tooltip、点击跳转

### 关键 Props
| Prop | 类型 | 说明 |
|------|------|------|
| `selectedNodeId` | `string` | 当前路径末端节点 |
| `nodes` / `edges` | `Node[]\|Edge[]` | 用于侧边栏拓扑分析（分叉/合并检测） |
| `onEditNode` | `function` | 触发消息编辑 |
| `language` | `'en'\|'zh'` | 控制界面文案语言 |
| `settings` | `Settings` | 含 `showMilestoneSidebar` 开关 |

### 里程碑侧边栏
- 默认开启，可在设置中关闭（`settings.showMilestoneSidebar`）
- 使用 `IntersectionObserver` 追踪当前可见的消息轮次
- 节点拓扑判断：
  - **分叉点**：`edges.filter(e => e.source === nodeId).length > 1`
  - **合并点**：`node.data.isMergedNode === true`

---

## InputPanel.js

**文件**: `src/components/InputPanel.js`

### 职责
- 多行文本输入框（支持 `Shift+Enter` 换行，`Enter` 发送）
- 文件上传入口（图片/PDF/Word/Excel/TXT）
- 合并配置卡（当 `pendingMerge` 存在时渲染）：
  - 全局策略选择：`raw` / `milestones` / `summary`
  - 每个分支的上下文深度：`∞ Full` / `1 Latest`
- 模型选择器嵌入

### 合并配置卡逻辑
```
pendingMerge != null
  ↓
渲染 MergeConfigCard
  ├── globalMergeStrategy: 下拉/按钮组选择
  └── branches[].contextMode: 每个分支独立切换 full/single
        ↓ 用户确认
executePendingMerge(userPrompt)
```

---

## MergeEdge.js

**文件**: `src/components/MergeEdge.js`

### 职责
- 自定义 ReactFlow 边类型 `mergeEdge`
- 渲染橙色贝塞尔曲线，中间附带上下文模式标签（`∞` / `1`）
- 点击标签切换该边的 `contextMode`（`CONTEXT_MODE.FULL` / `CONTEXT_MODE.SINGLE`）

### `CONTEXT_MODE` 枚举
```js
export const CONTEXT_MODE = {
  FULL: "full",    // 该分支完整上下文
  SINGLE: "single" // 仅该分支最新一条 assistant 消息
};
```

---

## MarkdownContent.js

**文件**: `src/components/MarkdownContent.js`

### 支持的内容类型
| 类型 | 处理方式 |
|------|---------|
| 普通 Markdown | `markdown-to-jsx` 解析 |
| 代码块 | 语法高亮 + 复制按钮 |
| `\`\`\`mermaid` | 动态加载 Mermaid CDN 渲染图表 |
| `\`\`\`svg` / `\`\`\`xml` | 直接渲染 SVG |
| `\`\`\`html` | iframe 沙箱渲染 |
| `$...$` / `$$...$$` | 动态加载 KaTeX CDN 渲染数学公式 |
| `[1](url)` 纯数字链接 | 渲染为 Gemini 风格引用角标 |

---

## SettingsModal.js

**文件**: `src/components/SettingsModal.js`

### 设置项说明
| 键名 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `apiKey` | `string` | `""` | API Key（可选择是否持久化） |
| `apiUrl` | `string` | `""` | 自定义 API 地址（留空 → OpenAI） |
| `saveApiKey` | `boolean` | `false` | 是否将 Key 存储到 localStorage |
| `language` | `'en'\|'zh'` | 自动检测 | 界面语言 |
| `panOnScroll` | `boolean` | `true` | 是否用滚轮平移画布 |
| `lockScrollOnNodeFocus` | `boolean` | `false` | 选中节点时是否锁定画布滚动 |
| `showMilestoneSidebar` | `boolean` | `true` | 是否显示里程碑时间轴侧边栏 |
| `webSearchEnabled` | `boolean` | `false` | 是否启用 OpenRouter Web Search 工具 |

---

## ArtifactNode.js

**文件**: `src/components/ArtifactNode.js`

### 职责
- 在 ReactFlow 画布上渲染独立的内容节点（非对话节点）
- 支持两种类型：`text`（文本/代码）和 `image`（图片 dataUrl）
- 可在 `ArtifactModal.js` 中编辑内容
- 选择进入合并时，内容会作为 `=== ARTIFACT: name ===` 块注入合并提示词

---

## FocusModeOverlay.js

**文件**: `src/components/FocusModeOverlay.js`

### 职责
- 全屏覆盖层，双击 ChatNode 触发
- 完整显示节点所有消息（含 Markdown 渲染）
- 支持键盘导航（← → 切换兄弟节点，↑ 回到父节点）
- 通过 `useFocusMode` Hook 管理导航逻辑
