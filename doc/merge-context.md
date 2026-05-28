# 合并上下文工程说明 / Merge Context Engineering

本文档描述 ChatTree 分支合并时的上下文构建机制，以及三种上下文策略的设计意图和提示词结构。

---

## 合并流程概览

```
用户选择 2+ 个节点 (handleMergeNode)
         │
         ▼
计算 LCA（最低公共祖先）
         │
         ▼
构建 pendingMerge 配置对象
  ├── globalMergeStrategy: "milestones" | "raw" | "summary"
  └── branches[]: { nodeId, messages, contextMode: "full" | "single" }
         │
用户在 InputPanel 中调整配置（可选）并输入合并指令
         │
         ▼
executePendingMerge(userPrompt)
         │
         ▼
buildMergedPrompt()
  1. LCA 之前的对话 → baseContext（直接作为 API 的历史消息）
  2. 各分支内容 → formatBranchMessages() → 注入到用户消息文本中
  3. 拼接 userPrompt
         │
         ▼
sendChatRequest([...baseContext, userMessageWithBranchContext], model)
```

---

## 提示词结构

最终发送给模型的**用户消息**（`messages[0].content`）结构如下：

```
You are continuing a conversation that has branched into {N} paths. Here are all branches:

=== BRANCH A ===
{formatBranchMessages(branchA.messages, contextMode, strategy)}

=== BRANCH B ===
{formatBranchMessages(branchB.messages, contextMode, strategy)}

[=== ARTIFACT: filename ===]       ← 若包含 text artifact
{artifactContent}

[=== IMAGES ===]                   ← 若包含 image artifact（视觉模型）
{N} image(s) attached below.

=== END BRANCHES ===               ← 或 END SOURCES（executePendingMerge 中）

{userPrompt}                       ← 用户输入的合并指令
```

**baseContext**（LCA 路径上的历史消息）作为独立的 `messages` 数组条目发送，不嵌入文本中，保持标准对话历史格式。

---

## 三种全局策略

### 1. `raw` — 原始完整记录

**适用场景**：对话较短，或需要模型看到完整推理过程。

**格式**：
```
USER: 第一条用户消息

ASSISTANT: 第一条 assistant 回复

USER: 第二条用户消息

ASSISTANT: 第二条 assistant 回复
```

**优点**：信息最完整，模型上下文最丰富。  
**缺点**：Token 消耗最大，长对话可能超出上下文窗口。

---

### 2. `milestones` — 里程碑模式（默认）

**适用场景**：多轮深度对话，只关心关键问题和最终结论。

**格式**：
```
(Milestones Mode - intermediate turns omitted)
USER Prompt 1: 第一个问题

USER Prompt 2: 第二个问题

ASSISTANT (Final Output): 最终回复
```

**原理**：保留所有 **user prompts**（记录探索路径）+ **最后一条 assistant 回复**（记录当前结论），丢弃中间的对话轮次。

**Token 节省**：相比 `raw`，通常可节省 60-80% 的 Token。

---

### 3. `summary` — 浓缩摘要

**适用场景**：超长对话，需要在有限上下文窗口内保留对话结构。

**格式**：
```
(Condensed Turn-by-turn Transcript)
USER: 前 250 个字符...
[Content condensed to fit context window]

ASSISTANT: 前 250 个字符...
[Content condensed to fit context window]
```

**原理**：保留完整的轮次结构，但每条消息内容截断到 250 字符。

**Token 节省**：相比 `raw`，可节省 30-70%（视原始消息长度而定）。

---

## 分支上下文深度

每个分支独立配置，不受全局策略影响：

| `contextMode` | 说明 | 适用场景 |
|------|------|------|
| `full`（∞） | 对该分支应用全局策略 | 分支内容重要，需要完整保留 |
| `single`（1） | 只取该分支最后一条 assistant 消息 | 该分支只是参考，不需要过程 |

`single` 模式忽略全局策略，始终输出：
```
(Latest message only)
ASSISTANT: {最后一条 assistant 消息}
```

---

## 编辑与重生成时的上下文重建

当编辑合并节点的用户消息，或重新生成合并节点时，系统会**从节点的 `data` 属性中读取保存的配置**重建提示词：

```js
node.data.globalMergeStrategy  // 保存的全局策略
node.data.mergeParents          // 参与合并的父节点 ID 列表
node.data.lcaId                 // 保存的 LCA 节点 ID
edge.data.contextMode           // 每条合并边上保存的分支深度
```

因此对合并节点的编辑会**保持原有的上下文配置**，除非用户主动修改。

---

## 语言适配

> 待实现：`formatBranchMessages` 和合并系统提示词目前为英文硬编码。  
> 计划根据 `settings.language === "zh"` 切换为中文版本的标签和说明。

---

## 扩展：添加新的合并策略

在 `src/hooks/useNodeOperations.js` 的 `formatBranchMessages()` 函数中添加新的 `else if` 分支：

```js
if (globalMergeStrategy === "your_new_strategy") {
  // 自定义格式化逻辑
  let text = "(Your Strategy Header)\n";
  // ...
  return text;
}
```

然后在 `src/components/InputPanel.js` 的策略选择按钮中添加对应选项。
