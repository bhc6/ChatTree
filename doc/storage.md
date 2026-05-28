# 存储策略说明 / Storage Architecture

本文档描述 ChatTree 的数据持久化方案、localStorage 键结构和 `QuotaExceededError` 容灾机制。

---

## localStorage 键结构

| 键名 | 内容 | 说明 |
|------|------|------|
| `chattree-chats` | `ChatMeta[]` | 所有对话的元数据列表 |
| `chattree-active-chat` | `string` | 当前激活对话 ID |
| `chattree-settings` | `Settings` | 用户设置（不含 API Key） |
| `chattree-api-key` | `string` | API Key（仅当用户勾选保存时存在） |
| `chattree-recent-models` | `RecentModel[]` | 最近使用模型（最多 5 个） |
| `chattree-{chatId}` | `ChatState` | 单个对话完整状态（nodes + edges） |

### ChatMeta 结构
```json
{
  "id": "chat-1716000000000-abc123",
  "name": "第一个对话的摘要...",
  "createdAt": 1716000000000,
  "updatedAt": 1716000100000
}
```

### ChatState 结构
```json
{
  "nodes": [...],          // ReactFlow 节点数组（已剥离回调函数）
  "edges": [...],          // ReactFlow 边数组
  "selectedNodeId": "node-5",
  "nodeIdCounter": 12
}
```

---

## 节点保存时的清洗

`saveChatState()` 在写入前会对节点数据做清洗：

1. **剥离回调函数**：`onAddBranch`, `onEditNode`, `onDeleteNode`, `onMergeNode`, `onRegenerateMerge`, `isMergeSource` 均设为 `undefined`（函数不可序列化）
2. **图片文件**：保留 `dataUrl`（用于预览显示）
3. **非图片文件**：清除 `dataUrl`（PDF/Word 等文件原始二进制数据，非常大，只保留元信息）

---

## QuotaExceededError 容灾机制

localStorage 默认限制约 5MB（各浏览器略有差异）。当长对话树积累了大量内容或图片时，可能触发 `QuotaExceededError`。

### 容灾分层策略

`trySetItemWithFallback()` 实现了四级降级：

```
Tier 0 ──► 正常保存
    失败
Tier 1 ──► 剥离所有 files.dataUrl 和 files.content（图片 base64 往往是主要体积）
    失败
    ├──► 尝试驱逐最旧的一个历史对话，再试 Tier 1
    失败
Tier 2 ──► 截断所有消息内容到 500 字符，清除所有 files
    失败
    ├──► 尝试驱逐最旧对话，再试 Tier 2
    失败
Tier 3 ──► 只保存消息角色（role）和模型字段，内容替换为占位符
    失败
    ├──► 尝试驱逐最旧对话，再试 Tier 3
    失败
Final ──► console.error + 触发 CustomEvent "chattree:quota-exceeded"
          UI 层可监听此事件弹出用户提示
```

### 驱逐策略

`evictOldestChat(currentChatId)` 从 `chattree-chats` 列表中找到**最旧（按 updatedAt 排序）且非当前对话**的历史记录，删除其对应的 `chattree-{id}` 键并将其从列表中移除。

> ⚠️ 被驱逐的对话将**永久丢失**，无法恢复。

### 监听存储警告（可选扩展）

如需在 UI 层提示用户，可在根组件中监听：

```js
useEffect(() => {
  const handler = (e) => {
    console.warn("存储空间不足，部分历史对话内容可能已被压缩或清除。");
    // 可弹出 Snackbar 提示
  };
  window.addEventListener("chattree:quota-exceeded", handler);
  return () => window.removeEventListener("chattree:quota-exceeded", handler);
}, []);
```

---

## 分享链接编码

分享功能（`src/utils/sharing.js`）**不使用 localStorage**，而是将整棵对话树编码到 URL：

```
ChatState JSON → UTF-8 编码 → pako.deflate 压缩 → Base64 → URL-safe 替换
```

解码路径相反。生成的 URL 格式：

```
https://chattree.xyz/#shared=<base64url>
```

> ⚠️ 对于大型对话树，URL 可能超过几百 KB，部分邮件客户端或 IM 工具会截断长 URL。

---

## 数据隐私

- **API Key**：单独存储在 `chattree-api-key` 键，与对话数据分离
- **对话内容**：全部只存在本地浏览器，不上传任何服务器
- **分享链接**：接收方可完整解码对话内容，请谨慎分享敏感对话
