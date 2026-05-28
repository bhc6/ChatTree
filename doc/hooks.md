# Hooks 说明 / Custom Hooks Reference

本文档详细描述 `src/hooks/` 中每个自定义 Hook 的职责、参数和返回值。

---

## useNodeOperations.js ★ 核心业务 Hook

**文件**: `src/hooks/useNodeOperations.js`

### 职责
节点的全部 CRUD 操作和 LLM 请求逻辑都在此 Hook 中，是整个应用最重要的文件（~1500 行）。

### 参数
```js
useNodeOperations({
  nodes, edges,                    // ReactFlow 状态
  setNodes, setEdges,
  selectedNodeId, setSelectedNodeId,
  selectedModel, modelsData,       // 当前模型及模型元数据
  nodeIdCounterRef,                // 节点 ID 自增计数器（useRef）
  sendChatRequest,                 // 来自 useChatApi
  isSharedView, commitSharedChat,  // 分享视图状态
  mergeMode, setMergeMode,
  pendingMerge, setPendingMerge,
  setInputMessage,
  settings,                        // 全局设置（含 language）
})
```

### 返回值
| 函数 | 说明 |
|------|------|
| `sendMessage(text, files)` | 向选中节点发送消息并创建子节点 |
| `handleAddBranch(nodeId)` | 从指定节点新建空分支 |
| `handleEditNode(nodeId, msgIndex, newText)` | 编辑指定节点指定轮次消息，触发级联重生成 |
| `handleDeleteNode(nodeId, msgIndex?)` | 删除节点（或截断到指定轮次） |
| `handleToggleCollapse(nodeId)` | 折叠/展开节点 |
| `handleToggleContextMode(edgeId)` | 切换合并边的上下文模式 |
| `handleMergeNode(nodeId)` | 进入/更新合并选择模式 |
| `handleRegenerateMerge(nodeId)` | 重新生成合并节点 |
| `executePendingMerge(userPrompt)` | 执行合并：创建新节点并发送 LLM 请求 |

### 关键内部函数

#### `formatBranchMessages(messages, contextMode, globalMergeStrategy)`
根据策略格式化单个分支的消息，用于构建合并提示词：

| `contextMode` | `globalMergeStrategy` | 输出内容 |
|------|------|------|
| `"single"` | 任意 | 仅最新 assistant 消息 |
| `"full"` | `"raw"` | 完整逐条对话记录 |
| `"full"` | `"milestones"` | 所有 user prompts + 最后 assistant 回复 |
| `"full"` | `"summary"` | 所有消息但内容截断到 250 字符 |

详见 [`doc/merge-context.md`](merge-context.md)。

#### `regenerateNodeAsync(nodeId)` → `Promise`
异步重新生成单个节点（保留原有消息结构），对合并节点会重建合并提示词。

#### `cascadeRegenerateDescendants(nodeId)`
深度优先遍历所有下游子节点，顺序触发重新生成（等待上游完成后再触发下游）。

---

## useChatApi.js

**文件**: `src/hooks/useChatApi.js`

### 职责
封装 LLM API 请求，支持 SSE 流式输出和非流式（o1 模型）。

### 返回值
```js
const { sendChatRequest } = useChatApi(settings, { webSearchEnabled, modelsData });
```

#### `sendChatRequest(messages, model, onChunk, onComplete, onError)`
- `messages`: `{ role, content }[]` — 完整对话历史
- `onChunk(fullResponse, fullReasoning)`: 每个 SSE chunk 回调
- `onComplete(fullResponse, fullReasoning)`: 流结束时回调
- `onError(error)`: 错误回调

### 特性
- 自动检测是否启用流式（o1 模型不支持流式）
- 自动检测 OpenRouter 并配置工具（`openrouter:web_search`, `openrouter:image_generation`）
- 自动过滤不支持工具的推理模型（`deepseek-r1`, `qwq` 等）
- 多模态内容自动处理（非视觉模型时将图片内容转为文本描述）

### 思维链解析
```js
// DeepSeek-R1 / QwQ 等模型返回 <think>...</think> 标签
// useChatApi 将 reasoning_content 字段传递给 onChunk/onComplete
// useNodeOperations 中的 parseThinkingAndContent() 进一步解析
```

---

## useChatManagement.js

**文件**: `src/hooks/useChatManagement.js`

### 职责
对话列表（左侧面板）的增删改查和持久化。

### 返回值
| 函数/状态 | 说明 |
|------|------|
| `chatsList` | 所有对话的元数据数组 `{ id, name, updatedAt }[]` |
| `activeChatId` | 当前激活对话 ID |
| `createChat()` | 新建对话并切换 |
| `switchChat(id)` | 切换到指定对话（保存当前、加载目标） |
| `deleteChat(id)` | 删除对话（含 localStorage） |
| `renameChat(id, name)` | 重命名对话 |
| `reorderChats(fromIdx, toIdx)` | 拖拽重排 |

---

## useModels.js

**文件**: `src/hooks/useModels.js`

### 职责
从 API 拉取并缓存可用模型列表，管理最近使用模型。

### 返回值
| 函数/状态 | 说明 |
|------|------|
| `modelsData` | `{ [modelId]: ModelInfo }` — 含 `context_length`, `supported_modalities` 等 |
| `availableModels` | `string[]` — 可用模型 ID 列表 |
| `fetchModels()` | 从 `${apiUrl}/models` 拉取模型列表 |
| `recentModels` | 最近使用的模型（最多 5 个） |

---

## useFocusMode.js

**文件**: `src/hooks/useFocusMode.js`

### 职责
专注模式的节点导航逻辑：计算兄弟节点、父节点，响应键盘事件。

### 返回值
| 函数/状态 | 说明 |
|------|------|
| `focusNodeId` | 当前专注节点 ID |
| `openFocus(nodeId)` | 打开专注模式 |
| `closeFocus()` | 关闭专注模式 |
| `navigateToParent()` | ↑ 跳到父节点 |
| `navigateToPrev()` | ← 跳到前一兄弟节点 |
| `navigateToNext()` | → 跳到后一兄弟节点 |

---

## useGroupedChats.js

**文件**: `src/hooks/useGroupedChats.js`

### 职责
将多个对话合并到同一 ReactFlow 画布上展示（分组/多工作区功能）。
每个对话的节点 ID 都带有 `chatId:` 前缀以避免冲突。

### 返回值
```js
const { groupedNodes, groupedEdges } = useGroupedChats(chatsList, settings);
```
