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
https://yourdomain.com/#shared=<base64url>
```

> ⚠️ 对于大型对话树，URL 可能超过几百 KB，部分邮件客户端或 IM 工具会截断长 URL。

---

## 数据安全与隐私 / Data Security & Privacy

ChatTree 拥有强大的本地化隐私沙箱模型，确保敏感凭证（API Keys）的安全：

1. **凭证隔离与擦除**：
   - **API Key**：独立于任何对话数据，存储在专属的 `chattree-api-key` 键中。
   - **非持久化模式**：若未勾选设置面板的“保存 API Key”，Key 将在页面销毁或重载时自动从 `localStorage` 中移除。

2. **渲染沙箱与跨域隔离 (Anti-XSS)**：
   - **HTML 代码预览**：为防范 LLM 吐出包含恶意 JavaScript 的 HTML 内容（如在加载时向外部偷偷回传 localStorage 中的 API Keys），系统在 HTML Preview Tab 中渲染代码时，使用的是一个具有 `sandbox="allow-scripts"` 的 `<iframe srcDoc={code} />`。由于未授予 `allow-same-origin` 权限，该 iframe 被视为一个完全独立的唯一源（Unique Origin），哪怕执行 JS 也无法读取父级文档的 localStorage。
   - **SVG 代码渲染**：如果将未转义的 SVG 通过 `dangerouslySetInnerHTML` 渲染进主页面 DOM，其中包含的脚本（如 `<svg onload="...">`）会在主页面域（Same-Origin）中无限制运行。为了防止这一重大漏洞，ChatTree 在渲染 SVG 代码时将其编码为 Data URL 并通过 `<img>` 标签展示。根据规范，`<img>` 标签引用的 SVG 资源内部的一切脚本和网络加载都将被浏览器强制禁用，安全地实现了隔离预览。
   - **Mermaid 图表渲染**：Mermaid 解析器的安全策略被固定为 `"strict"`，以防在图表的节点文本中被注入 HTML 伪协议或 JS 操作节点，最大限度保证在呈现复杂拓扑树时的代码安全。
   - **Markdown 标签白名单**：在 Markdown 解析阶段，移除了 `script`, `iframe`, `embed`, `object`, `form` 等具有代码执行或页面欺骗特性的 HTML 标签。未包含在安全白名单中的标签都将自动被转义为纯文本，防止行内 HTML 注入。
