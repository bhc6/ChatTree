/**
 * Hook for node and edge operations - send messages, edit, delete, merge
 */
import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "reactflow";
import { CONTEXT_MODE } from "../components/MergeEdge";
import { modelSupportsVision } from "../utils/visionModels";
import {
  getPathToNode,
  buildConversationFromPath,
  findLowestCommonAncestor,
  findLowestCommonAncestorMultiple,
  getDescendants,
} from "../utils/treeUtils";
import { loadChatState, saveChatState } from "../utils/storage";

// Helper to get immediate children of a node
const getImmediateChildren = (nodeId, edges) => {
  return edges.filter((e) => e.source === nodeId).map((e) => e.target);
};

// Default vertical gap between nodes
const NODE_VERTICAL_GAP = 50;

// Get node height from measured dimensions or use default
const getNodeHeight = (node) => {
  return node?.measured?.height || node?.height || 52;
};

// Default prompt for merge operations
export const DEFAULT_MERGE_PROMPT =
  "Please synthesize insights from both branches and continue the conversation, acknowledging key points from each path.";
export const DEFAULT_MERGE_PROMPT_EN =
  "Please synthesize insights from both branches and continue the conversation, acknowledging key points from each path.";
export const DEFAULT_MERGE_PROMPT_ZH =
  "请结合两个分支的观点并继续对话，指出每个分支的关键点。";

// Helper to format user message content, integrating uploaded files
const formatUserMessageWithFiles = (text, files, selectedModel, modelsData, isOpenRouter = false, lang = "en") => {
  if (!files || files.length === 0) {
    return text;
  }

  const supportsVision = modelSupportsVision(selectedModel, modelsData);
  const imageFiles = files.filter(f => f.type?.startsWith("image/"));
  const documentFiles = files.filter(f => !f.type?.startsWith("image/"));
  const isZh = lang === "zh";

  // Build the text portion with all extracted document contents (PDF, Word, Excel, TXT, etc.)
  let textWithDocs = text || "";
  if (documentFiles.length > 0) {
    textWithDocs += isZh ? "\n\n=== 已附带的文档/文件 ===" : "\n\n=== ATTACHED DOCUMENTS/FILES ===";
    documentFiles.forEach(tf => {
      const contentStr = tf.textContent || tf.content || "";
      textWithDocs += isZh 
        ? `\n\n[文件: ${tf.name}]\n\`\`\`\n${contentStr}\n\`\`\``
        : `\n\n[File: ${tf.name}]\n\`\`\`\n${contentStr}\n\`\`\``;
    });
  }

  // If there are image files and the model supports vision, return a multimodal array
  if (imageFiles.length > 0 && supportsVision) {
    const content = [{ type: "text", text: textWithDocs }];
    imageFiles.forEach(img => {
      content.push({
        type: "image_url",
        image_url: { url: img.dataUrl || img.content },
      });
    });
    return content;
  }

  // Otherwise, return a simple text string (with warning if images were omitted)
  if (imageFiles.length > 0 && !supportsVision) {
    textWithDocs += isZh
      ? `\n\n[警告: 附带了 ${imageFiles.length} 张图片，但所选模型 "${selectedModel}" 不支持视觉(Vision)。图片已被忽略。]`
      : `\n\n[Warning: ${imageFiles.length} image(s) attached but the selected model "${selectedModel}" does not support vision. Images were omitted.]`;
  }

  return textWithDocs;
};

// Helper to format branch conversation history using different context engineering strategies
const formatBranchMessages = (messages, contextMode, globalMergeStrategy, lang = "en") => {
  if (!messages || messages.length === 0) return "";
  const isZh = lang === "zh";

  // If contextMode is SINGLE, only use the latest assistant message (or latest message overall if no assistant)
  if (contextMode === CONTEXT_MODE.SINGLE || contextMode === "single") {
    const lastMsg = [...messages].reverse().find(m => m.role === "assistant") || messages[messages.length - 1];
    return isZh
      ? `(仅限最新消息)\n${lastMsg.role === "user" ? "用户" : "助手"}: ${lastMsg.content}\n\n`
      : `(Latest message only)\n${lastMsg.role.toUpperCase()}: ${lastMsg.content}\n\n`;
  }

  // Full history formatting based on strategy
  if (globalMergeStrategy === "milestones") {
    // Milestones strategy: user prompts + last assistant response
    const userPrompts = messages.filter(m => m.role === "user");
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    
    let text = isZh ? "(核心里程碑模式 - 已忽略中间对话轮次)\n" : "(Milestones Mode - intermediate turns omitted)\n";
    userPrompts.forEach((up, idx) => {
      text += isZh ? `用户提问 ${idx + 1}: ${up.content}\n\n` : `USER Prompt ${idx + 1}: ${up.content}\n\n`;
    });
    if (lastAssistant) {
      text += isZh ? `助手最终回答: ${lastAssistant.content}\n\n` : `ASSISTANT (Final Output): ${lastAssistant.content}\n\n`;
    }
    return text;
  }

  if (globalMergeStrategy === "summary") {
    // Summary strategy: condensed versions of all messages
    let text = isZh ? "(缩略对话副本)\n" : "(Condensed Turn-by-turn Transcript)\n";
    messages.forEach(msg => {
      const displayContent = msg.content.length > 250
        ? msg.content.substring(0, 250) + (isZh ? "...\n[为适配上下文窗口已进行缩略处理]" : "...\n[Content condensed to fit context window]")
        : msg.content;
      text += isZh
        ? `${msg.role === "user" ? "用户" : "助手"}: ${displayContent}\n\n`
        : `${msg.role.toUpperCase()}: ${displayContent}\n\n`;
    });
    return text;
  }

  // "raw" strategy: Full transcripts
  let text = "";
  messages.forEach(msg => {
    text += isZh
      ? `${msg.role === "user" ? "用户" : "助手"}: ${msg.content}\n\n`
      : `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
  });
  return text;
};

// Helper to split <think>...</think> thinking blocks and SSE reasoning deltas
const parseThinkingAndContent = (text, reasoningContent) => {
  let content = text || "";
  let thinking = reasoningContent || "";

  // Strip trailing partial HTML tags to prevent tag leak and flickering during streaming
  const partialTagMatch = content.match(/<[a-zA-Z0-9/:-]*$/);
  if (partialTagMatch) {
    content = content.slice(0, partialTagMatch.index);
  }

  if (content.includes("<think>")) {
    const parts = content.split("<think>");
    const beforeThink = parts[0];
    const rest = parts.slice(1).join("<think>");
    
    if (rest.includes("</think>")) {
      const thinkParts = rest.split("</think>");
      const thinkContent = thinkParts[0];
      const afterThink = thinkParts.slice(1).join("</think>");
      
      thinking = (thinking ? thinking + "\n" : "") + thinkContent.trim();
      content = beforeThink + afterThink;
    } else {
      thinking = (thinking ? thinking + "\n" : "") + rest.trim();
      content = beforeThink;
    }
  }

  // Clean leaked tags from content
  const cleanModelOutput = (str) => {
    if (typeof str !== "string") return str;
    let cleaned = str;
    cleaned = cleaned.replace(/^\s*<assistant>\s*/i, "");
    cleaned = cleaned.replace(/\s*<\/assistant>\s*$/i, "");
    cleaned = cleaned.replace(/^\s*<thought>\s*/i, "");
    cleaned = cleaned.replace(/\s*<\/thought>\s*$/i, "");
    cleaned = cleaned.replace(/^\s*<system>\s*/i, "");
    cleaned = cleaned.replace(/\s*<\/system>\s*$/i, "");
    cleaned = cleaned.replace(/^\s*<user>\s*/i, "");
    cleaned = cleaned.replace(/\s*<\/user>\s*$/i, "");
    return cleaned;
  };

  return {
    content: cleanModelOutput(content).trim(),
    thinking: thinking.trim() || undefined
  };
};

export const useNodeOperations = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  selectedNodeId,
  setSelectedNodeId,
  selectedModel,
  modelsData,
  nodeIdCounterRef,
  sendChatRequest,
  isSharedView,
  commitSharedChat,
  mergeMode,
  setMergeMode,
  pendingMerge,
  setPendingMerge,
  setInputMessage,
  settings,
  activeChatId,
}) => {
  const { fitView } = useReactFlow();
  const abortControllersRef = useRef({});

  const stopGeneration = useCallback((nodeId) => {
    if (nodeId) {
      if (abortControllersRef.current[nodeId]) {
        abortControllersRef.current[nodeId].abort();
        delete abortControllersRef.current[nodeId];
      }
    } else {
      Object.keys(abortControllersRef.current).forEach((id) => {
        abortControllersRef.current[id].abort();
      });
      abortControllersRef.current = {};
    }
  }, []);

  // Track the current activeChatId to prevent stale closures and cross-talk during background stream updates
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Keep refs to latest nodes/edges for use in async callbacks
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  // Update refs when nodes/edges change
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Track active cascade nodes
  const activeCascadesRef = useRef(new Set());

  // Background update buffering for localStorage
  const pendingSaveTimeouts = useRef({});
  const pendingUpdates = useRef({});

  // Flush all buffered updates for a specific chat ID to localStorage
  const flushPendingUpdates = useCallback((chatId) => {
    if (pendingSaveTimeouts.current[chatId]) {
      clearTimeout(pendingSaveTimeouts.current[chatId]);
      delete pendingSaveTimeouts.current[chatId];
    }

    const updates = pendingUpdates.current[chatId];
    if (!updates) return;
    delete pendingUpdates.current[chatId];

    const state = loadChatState(chatId);
    if (!state || !state.nodes) return;

    let stateChanged = false;
    const updatedNodes = state.nodes.map((node) => {
      const nodeUpdate = updates[node.id];
      if (nodeUpdate) {
        stateChanged = true;
        return {
          ...node,
          data: { ...node.data, ...nodeUpdate },
        };
      }
      return node;
    });

    if (stateChanged) {
      saveChatState(
        chatId,
        updatedNodes,
        state.edges,
        state.selectedNodeId,
        state.nodeIdCounter
      );
    }
  }, []);

  // Update node data helper that filters updates to active React state and queues localStorage saves
  const updateNodeDataWithChatId = useCallback(
    (targetChatId, nodeId, dataUpdate) => {
      // 1. Update React state if the target chat matches the current active view
      if (activeChatIdRef.current === targetChatId) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: { ...node.data, ...dataUpdate },
              };
            }
            return node;
          })
        );
      }

      // 2. Buffer for localStorage update
      if (!pendingUpdates.current[targetChatId]) {
        pendingUpdates.current[targetChatId] = {};
      }
      pendingUpdates.current[targetChatId][nodeId] = {
        ...pendingUpdates.current[targetChatId][nodeId],
        ...dataUpdate,
      };

      if (dataUpdate.status === "complete" || dataUpdate.status === "error") {
        flushPendingUpdates(targetChatId);
      } else {
        if (!pendingSaveTimeouts.current[targetChatId]) {
          pendingSaveTimeouts.current[targetChatId] = setTimeout(() => {
            flushPendingUpdates(targetChatId);
          }, 600);
        }
      }
    },
    [setNodes, flushPendingUpdates]
  );

  // Clean up timeouts and flush remaining updates on unmount
  useEffect(() => {
    return () => {
      Object.keys(pendingUpdates.current).forEach((chatId) => {
        flushPendingUpdates(chatId);
      });
    };
  }, [flushPendingUpdates]);

  // Update node data fallback delegating to activeChatId
  const updateNodeData = useCallback(
    (nodeId, dataUpdate) => {
      updateNodeDataWithChatId(activeChatIdRef.current, nodeId, dataUpdate);
    },
    [updateNodeDataWithChatId]
  );

  // Generate a short 2-5 words title from dialogue turns using LLM
  const generateNodeTitle = useCallback(
    async (nodeId, nodeMessages, targetChatId) => {
      const chatTarget = targetChatId || activeChatIdRef.current;
      if (!nodeMessages || nodeMessages.length === 0) return;
      const model = selectedModel;

      const lang = settings?.language || "en";
      const summaryPrompt = lang === "zh"
        ? "用2到5个字总结对话主题。只返回总结后的标题，不要有任何其他内容。不要包含引号、Markdown或多余的标点符号。"
        : "Summarize the conversation topic in 2 to 5 words. Return ONLY the summarized title, nothing else. Do not include quotes, markdown, or extra punctuation.";

      const summaryMessages = [
        ...nodeMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })).slice(-4),
        {
          role: "user",
          content: summaryPrompt,
        }
      ];

      try {
        await sendChatRequest(
          summaryMessages,
          model,
          () => {}, // no chunk needed
          (fullResponse) => {
            const cleanedTitle = fullResponse.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "");
            updateNodeDataWithChatId(chatTarget, nodeId, { title: cleanedTitle });
          },
          (error) => {
            console.error("Failed to generate title:", error);
            // Local fallback title from user prompt!
            const userMsgObj = nodeMessages.find(m => m.role === "user");
            let userPrompt = "";
            if (userMsgObj) {
              if (typeof userMsgObj.content === "string") {
                userPrompt = userMsgObj.content;
              } else if (Array.isArray(userMsgObj.content)) {
                userPrompt = userMsgObj.content.find(c => c.type === "text")?.text || "";
              }
            }
            const cleanPrompt = userPrompt.trim();
            const fallbackTitle = cleanPrompt
              ? cleanPrompt.slice(0, 15) + (cleanPrompt.length > 15 ? "..." : "")
              : (lang === "zh" ? "对话分支" : "Chat Branch");
            updateNodeDataWithChatId(chatTarget, nodeId, { title: fallbackTitle });
          }
        );
      } catch (err) {
        console.error("Error in generateNodeTitle:", err);
      }
    },
    [selectedModel, sendChatRequest, updateNodeDataWithChatId, settings]
  );

  // Send message and create new node or append to current node
  const sendMessage = useCallback(
    async (parentNodeId, userMessage, files = []) => {
      if (isSharedView) commitSharedChat();

      const isRoot = parentNodeId === "root" || parentNodeId.endsWith(":root");
      const parentNode = nodes.find((n) => n.id === parentNodeId);
      const isArtifact = parentNode?.type === "artifactNode";

      const colonIndex = parentNodeId.indexOf(":");
      const chatPrefix =
        colonIndex !== -1 ? parentNodeId.substring(0, colonIndex + 1) : "";
      const targetChatId = chatPrefix
        ? chatPrefix.slice(0, -1)
        : (parentNode?.data?.chatId || activeChatId);

      const updateThisNode = (nodeId, dataUpdate) => {
        updateNodeDataWithChatId(targetChatId, nodeId, dataUpdate);
      };

      if (isArtifact) {
        const newNodeId = `${chatPrefix}node-${nodeIdCounterRef.current++}`;
        const existingChildren = edges.filter((e) => e.source === parentNodeId);
        const xOffset = existingChildren.length * 160;
        const parentHeight = getNodeHeight(parentNode);

        // Prepend artifact content to userMessage if parent is an artifact
        let finalUserText = userMessage;
        if (isArtifact) {
          const isImage = parentNode.data?.artifactType === "image";
          const supportsVision = modelSupportsVision(selectedModel, modelsData);

          if (isImage && supportsVision) {
            finalUserText = `[Artifact: ${parentNode.data?.name || "Image"}]`;
          } else if (isImage) {
            finalUserText = `[Artifact: ${parentNode.data?.name || "Image"} - image not included as model doesn't support vision]\n${userMessage}`;
          } else {
            finalUserText = `[Artifact: ${parentNode.data?.name || "Text"}]\n${parentNode.data?.content || ""}\n\n${userMessage}`;
          }
        }

        // Format user message with uploaded files
        const isOpenRouter = settings?.apiUrl?.includes("openrouter.ai");
        let finalUserMessage = formatUserMessageWithFiles(finalUserText, files, selectedModel, modelsData, isOpenRouter, settings?.language || "en");

        // Append artifact image if applicable and model supports vision
        if (isArtifact && parentNode.data?.artifactType === "image" && modelSupportsVision(selectedModel, modelsData)) {
          if (Array.isArray(finalUserMessage)) {
            finalUserMessage.push({
              type: "image_url",
              image_url: { url: parentNode.data?.content },
            });
          } else {
            finalUserMessage = [
              { type: "text", text: finalUserMessage },
              { type: "image_url", image_url: { url: parentNode.data?.content } }
            ];
          }
        }

        const newUserMessageObj = { role: "user", content: finalUserMessage, model: selectedModel, files: files };
        const newAssistantMessageObj = { role: "assistant", content: "", model: selectedModel };

        const newNode = {
          id: newNodeId,
          type: "chatNode",
          position: {
            x:
              parentNode.position.x +
              xOffset -
              (existingChildren.length > 0 ? 80 : 0),
            y: parentNode.position.y + parentHeight + NODE_VERTICAL_GAP,
          },
          data: {
            messages: [newUserMessageObj, newAssistantMessageObj],
            title: typeof userMessage === "string" ? (userMessage.substring(0, 20) + (userMessage.length > 20 ? "..." : "")) : "New Chat",
            status: "loading",
            isRoot: false,
            chatId: targetChatId,
          },
        };

        setNodes((nds) => [...nds, newNode]);
        setEdges((eds) => [
          ...eds,
          {
            id: `${chatPrefix}edge-${parentNodeId.replace(
              chatPrefix,
              ""
            )}-${newNodeId.replace(chatPrefix, "")}`,
            source: parentNodeId,
            target: newNodeId,
            type: "smoothstep",
            style: { stroke: "var(--accent-blue)", strokeWidth: 2 },
          },
        ]);

        setSelectedNodeId(newNodeId);

        // Build conversation history context up to this node
        const path = getPathToNode(parentNodeId, nodes, edges);
        const conversationMessages = buildConversationFromPath(path);
        const requestMessages = [...conversationMessages, { role: "user", content: finalUserMessage }];

        if (abortControllersRef.current[newNodeId]) {
          abortControllersRef.current[newNodeId].abort();
        }
        const controller = new AbortController();
        abortControllersRef.current[newNodeId] = controller;
        const signal = controller.signal;

        await sendChatRequest(
          requestMessages,
          selectedModel,
          (partialResponse, partialReasoning) => {
            const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
            updateThisNode(newNodeId, {
              messages: [newUserMessageObj, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }],
              status: "loading",
            });
          },
          (fullResponse, fullReasoning) => {
            if (abortControllersRef.current[newNodeId] === controller) {
              delete abortControllersRef.current[newNodeId];
            }
            const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
            const finalMessages = [newUserMessageObj, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }];
            updateThisNode(newNodeId, {
              messages: finalMessages,
              status: "complete",
              model: selectedModel,
            });
            generateNodeTitle(newNodeId, finalMessages, targetChatId);
          },
          (error) => {
            if (abortControllersRef.current[newNodeId] === controller) {
              delete abortControllersRef.current[newNodeId];
            }
            if (error.name !== "AbortError") {
              console.error(error);
            }
            if (error.name === "AbortError") {
              updateThisNode(newNodeId, {
                status: "complete",
              });
            } else {
              updateThisNode(newNodeId, {
                error: error.message,
                status: "error",
              });
            }
          },
          signal
        );

        setTimeout(() => fitView({ nodes: [{ id: parentNodeId }, { id: newNodeId }], padding: 0.2, duration: 300, maxZoom: 1 }), 100);
      } else {
        // Appending to existing chatNode parentNodeId
        const node = nodes.find((n) => n.id === parentNodeId);
        let initialMsgs = [];
        if (node?.data?.messages && Array.isArray(node.data.messages)) {
          initialMsgs = [...node.data.messages];
        } else if (node) {
          if (node.data.userMessage) {
            initialMsgs.push({ role: "user", content: node.data.userMessage });
          }
          if (node.data.assistantMessage) {
            initialMsgs.push({ role: "assistant", content: node.data.assistantMessage, model: node.data.model });
          }
        }

        const isOpenRouter = settings?.apiUrl?.includes("openrouter.ai");
        const finalUserMessage = formatUserMessageWithFiles(userMessage, files, selectedModel, modelsData, isOpenRouter, settings?.language || "en");
        const newUserMessageObj = { role: "user", content: finalUserMessage, model: selectedModel, files: files };
        const newAssistantMessageObj = { role: "assistant", content: "", model: selectedModel };
        const updatedMessages = [...initialMsgs, newUserMessageObj];
        const messagesWithAssistant = [...updatedMessages, newAssistantMessageObj];

        updateThisNode(parentNodeId, {
          messages: messagesWithAssistant,
          status: "loading",
        });

        // Build conversation history context
        const path = getPathToNode(parentNodeId, nodes, edges);
        // Exclude the current node itself from the path since we are manually appending the messages inside it
        const parentPath = path.slice(0, -1);
        const parentContext = buildConversationFromPath(parentPath);
        const cleanUpdatedMessages = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
        const requestMessages = [...parentContext, ...cleanUpdatedMessages];

        if (abortControllersRef.current[parentNodeId]) {
          abortControllersRef.current[parentNodeId].abort();
        }
        const controller = new AbortController();
        abortControllersRef.current[parentNodeId] = controller;
        const signal = controller.signal;

        await sendChatRequest(
          requestMessages,
          selectedModel,
          (partialResponse, partialReasoning) => {
            const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
            updateThisNode(parentNodeId, {
              messages: [...updatedMessages, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }],
              status: "loading",
            });
          },
          (fullResponse, fullReasoning) => {
            if (abortControllersRef.current[parentNodeId] === controller) {
              delete abortControllersRef.current[parentNodeId];
            }
            const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
            const finalMessages = [...updatedMessages, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }];
            updateThisNode(parentNodeId, {
              messages: finalMessages,
              status: "complete",
              model: selectedModel,
            });
            // Auto-summarize title on the first complete turn
            if (finalMessages.length === 2 && (!node.data?.title || node.data.title === "New Branch")) {
              generateNodeTitle(parentNodeId, finalMessages, targetChatId);
            }
          },
          (error) => {
            if (abortControllersRef.current[parentNodeId] === controller) {
              delete abortControllersRef.current[parentNodeId];
            }
            if (error.name !== "AbortError") {
              console.error(error);
            }
            if (error.name === "AbortError") {
              updateThisNode(parentNodeId, {
                status: "complete",
              });
            } else {
              updateThisNode(parentNodeId, {
                error: error.message,
                status: "error",
              });
            }
          },
          signal
        );
      }
    },
    [
      nodes,
      edges,
      selectedModel,
      modelsData,
      setNodes,
      setEdges,
      updateNodeDataWithChatId,
      fitView,
      sendChatRequest,
      isSharedView,
      commitSharedChat,
      setSelectedNodeId,
      nodeIdCounterRef,
      generateNodeTitle,
      activeChatId,
    ]
  );

  // Handle adding a branch from a node
  const handleAddBranch = useCallback(
    (nodeId) => {
      if (isSharedView) commitSharedChat();

      const colonIndex = nodeId.indexOf(":");
      const chatPrefix =
        colonIndex !== -1 ? nodeId.substring(0, colonIndex + 1) : "";

      const newNodeId = `${chatPrefix}node-${nodeIdCounterRef.current++}`;

      const parentNode = nodes.find((n) => n.id === nodeId);
      const existingChildren = edges.filter((e) => e.source === nodeId);
      const xOffset = existingChildren.length * 160;
      const parentHeight = getNodeHeight(parentNode);

      const newNode = {
        id: newNodeId,
        type: "chatNode",
        position: {
          x:
            parentNode.position.x +
            xOffset -
            (existingChildren.length > 0 ? 80 : 0),
          y: parentNode.position.y + parentHeight + NODE_VERTICAL_GAP,
        },
        data: {
          messages: [],
          title: "New Branch",
          status: "complete",
          isRoot: false,
          chatId: chatPrefix ? chatPrefix.slice(0, -1) : activeChatId,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [
        ...eds,
        {
          id: `${chatPrefix}edge-${nodeId.replace(
            chatPrefix,
            ""
          )}-${newNodeId.replace(chatPrefix, "")}`,
          source: nodeId,
          target: newNodeId,
          type: "smoothstep",
          style: { stroke: "var(--accent-blue)", strokeWidth: 2 },
        },
      ]);

      setSelectedNodeId(newNodeId);
      setTimeout(() => {
        document.getElementById("message-input")?.focus();
        fitView({ nodes: [{ id: nodeId }, { id: newNodeId }], padding: 0.2, duration: 300, maxZoom: 1 });
      }, 100);
    },
    [
      nodes,
      edges,
      setNodes,
      setEdges,
      setSelectedNodeId,
      nodeIdCounterRef,
      isSharedView,
      commitSharedChat,
      fitView,
      activeChatId,
    ]
  );

  // Internal function to regenerate a single node and return a promise
  const regenerateNodeAsync = useCallback(
    (nodeId, parentSignal) => {
      return new Promise(async (resolve) => {
        if (parentSignal?.aborted) {
          resolve();
          return;
        }

        let signal = parentSignal;
        let controller = null;

        if (!signal) {
          if (abortControllersRef.current[nodeId]) {
            abortControllersRef.current[nodeId].abort();
          }
          controller = new AbortController();
          abortControllersRef.current[nodeId] = controller;
          signal = controller.signal;
        }
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;

        const node = currentNodes.find((n) => n.id === nodeId);
        if (!node || node.data?.isRoot) {
          resolve();
          return;
        }

        // Get parent path and context
        const parentEdge = currentEdges.find((e) => e.target === nodeId);
        const parentNodeId = parentEdge?.source || "root";
        const path = getPathToNode(parentNodeId, currentNodes, currentEdges);
        const parentContext = buildConversationFromPath(path);

        const targetChatId = node.data?.chatId || activeChatId;
        const updateThisNode = (nId, dataUpdate) => {
          updateNodeDataWithChatId(targetChatId, nId, dataUpdate);
        };

        // Retrieve existing messages array or fallbacks
        let messages = [];
        if (node.data?.messages && Array.isArray(node.data.messages)) {
          messages = [...node.data.messages];
        } else {
          // Fallback legacy support
          if (node.data.userMessage) {
            messages.push({ role: "user", content: node.data.userMessage });
          }
          if (node.data.assistantMessage) {
            messages.push({ role: "assistant", content: node.data.assistantMessage, model: node.data.model });
          }
        }

        if (messages.length === 0) {
          resolve();
          return;
        }

        // If it's a merged node, rebuild the first user message content (messages[0])
        if (node.data?.isMergedNode && node.data.mergeParents) {
          const mergeParents = node.data.mergeParents;
          const lcaId = node.data.lcaId;
          const globalMergeStrategy = node.data?.globalMergeStrategy || "milestones";

          // Build branches for all parent nodes with their context modes
          const branches = mergeParents.map((parentId) => {
            const edge = currentEdges.find(
              (e) => e.source === parentId && e.target === nodeId
            );
            const contextMode = edge?.data?.contextMode || CONTEXT_MODE.FULL;

            const path = getPathToNode(parentId, currentNodes, currentEdges);
            const lcaIndex = path.findIndex((n) => n.id === lcaId);
            const branch = path.slice(lcaIndex + 1);

            return {
              nodeId: parentId,
              messages: buildConversationFromPath(branch),
              contextMode,
            };
          });

          // Get base context from LCA
          const path1 = getPathToNode(
            mergeParents[0],
            currentNodes,
            currentEdges
          );
          const lcaIndex1 = path1.findIndex((n) => n.id === lcaId);
          const lcaPath = path1.slice(0, lcaIndex1 + 1);
          const baseContextForMerge = buildConversationFromPath(lcaPath);

          // Build merged context with all branches
          const isZh = settings?.language === "zh";
          const branchCount = branches.length;
          let mergedContext = isZh
            ? `您正在继续一个已分叉为 ${branchCount} 条路径的对话。以下是所有分支的上下文：\n\n`
            : `You are continuing a conversation that has branched into ${branchCount} paths. Here are all branches:\n\n`;

          branches.forEach((branch, index) => {
            const branchLabel = String.fromCharCode(65 + index); // A, B, C, D, ...
            mergedContext += isZh ? `=== 分支 ${branchLabel} ===\n` : `=== BRANCH ${branchLabel} ===\n`;
            const formattedText = formatBranchMessages(
              branch.messages,
              branch.contextMode || "full",
              globalMergeStrategy,
              settings?.language || "en"
            );
            mergedContext += formattedText;
          });

          mergedContext += isZh ? "=== 分支结束 ===\n\n" : "=== END BRANCHES ===\n\n";
          // node.data.userMessage is the original instruction
          mergedContext += node.data.userMessage || (typeof messages[0]?.content === 'string' ? messages[0].content : JSON.stringify(messages[0].content));

          messages[0] = {
            ...messages[0],
            content: mergedContext,
          };
        }

        // Now, we sequentially regenerate all assistant messages in `messages`
        // We will execute them in a loop.
        let currentMessages = [...messages];

        const regenerateTurn = async (msgIndex) => {
          if (msgIndex >= currentMessages.length) {
            return;
          }

          if (currentMessages[msgIndex].role === "assistant") {
            // This is an assistant message. We need to regenerate it.
            currentMessages[msgIndex] = {
              ...currentMessages[msgIndex],
              content: "",
              model: selectedModel,
            };

            updateThisNode(nodeId, {
              messages: currentMessages,
              status: "loading",
              error: null,
            });

            // Build request context: parentContext + currentMessages[0...msgIndex - 1]
            const contextBefore = currentMessages.slice(0, msgIndex);
            
            let baseContextForMergedNode = [];
            if (node.data?.isMergedNode && node.data.mergeParents) {
              const path1 = getPathToNode(node.data.mergeParents[0], currentNodes, currentEdges);
              const lcaIndex1 = path1.findIndex((n) => n.id === node.data.lcaId);
              const lcaPath = path1.slice(0, lcaIndex1 + 1);
              baseContextForMergedNode = buildConversationFromPath(lcaPath);
            }

            const prefixContext = (node.data?.isMergedNode && node.data.mergeParents)
              ? baseContextForMergedNode
              : parentContext;

            const requestMessages = [
              ...prefixContext,
              ...contextBefore.map((m) => ({ role: m.role, content: m.content })),
            ];

            await new Promise((res, rej) => {
              if (signal.aborted) {
                rej(new DOMException("Aborted", "AbortError"));
                return;
              }
              sendChatRequest(
                requestMessages,
                selectedModel,
                (partialResponse, partialReasoning) => {
                  const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
                  currentMessages[msgIndex] = {
                    ...currentMessages[msgIndex],
                    content: parsed.content,
                    thinking: parsed.thinking,
                  };
                  updateThisNode(nodeId, {
                    messages: currentMessages,
                    status: "loading",
                  });
                },
                (fullResponse, fullReasoning) => {
                  const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
                  currentMessages[msgIndex] = {
                    ...currentMessages[msgIndex],
                    content: parsed.content,
                    thinking: parsed.thinking,
                  };
                  updateThisNode(nodeId, {
                    messages: currentMessages,
                    status: "loading",
                  });
                  res();
                },
                (error) => {
                  rej(error);
                },
                signal
              );
            });
          }

          // Move to next message
          await regenerateTurn(msgIndex + 1);
        };

        try {
          await regenerateTurn(0);
          if (controller && abortControllersRef.current[nodeId] === controller) {
            delete abortControllersRef.current[nodeId];
          }
          updateThisNode(nodeId, {
            messages: currentMessages,
            status: "complete",
            model: selectedModel,
          });
          // Auto-summarize title if needed
          if (currentMessages.length === 2 && (!node.data?.title || node.data.title === "New Branch")) {
            await generateNodeTitle(nodeId, currentMessages, targetChatId);
          }
          resolve();
        } catch (error) {
          if (controller && abortControllersRef.current[nodeId] === controller) {
            delete abortControllersRef.current[nodeId];
          }
          if (error.name !== "AbortError") {
            console.error(error);
          }
          if (error.name === "AbortError") {
            updateThisNode(nodeId, {
              messages: currentMessages,
              status: "complete",
              model: selectedModel,
            });
          } else {
            updateThisNode(nodeId, {
              error: error.message,
              status: "error",
            });
          }
          resolve();
        }
      });
    },
    [selectedModel, updateNodeDataWithChatId, sendChatRequest, generateNodeTitle, activeChatId]
  );

  // Cascade regeneration to all descendants after a node is edited
  const cascadeRegenerateDescendants = useCallback(
    async (startNodeId) => {
      if (activeCascadesRef.current.has(startNodeId)) return;
      activeCascadesRef.current.add(startNodeId);

      const controller = new AbortController();
      abortControllersRef.current[startNodeId] = controller;
      const signal = controller.signal;

      try {
        // Track all nodes that have been regenerated in this cascade
        const processedNodes = new Set([startNodeId]);

        // Track nodes that are part of the regeneration chain (affected by the edit)
        const affectedNodes = new Set([startNodeId]);

        // Queue for BFS traversal - process level by level
        let currentLevel = [startNodeId];

        while (currentLevel.length > 0) {
          if (signal.aborted) {
            break;
          }
          const nextLevel = [];

          // Collect all children of current level nodes
          for (const nodeId of currentLevel) {
            const children = getImmediateChildren(nodeId, edgesRef.current);
            for (const childId of children) {
              if (processedNodes.has(childId)) continue;

              const childNode = nodesRef.current.find((n) => n.id === childId);
              if (!childNode) continue;

              // For merged nodes, we regenerate if ANY parent was affected
              // (not waiting for all parents - the other parent wasn't changed)
              if (childNode.data?.isMergedNode && childNode.data.mergeParents) {
                const anyParentAffected = childNode.data.mergeParents.some(
                  (pid) => affectedNodes.has(pid)
                );
                if (anyParentAffected) {
                  nextLevel.push(childId);
                }
              } else {
                // Regular node - add to next level
                nextLevel.push(childId);
              }
            }
          }

          if (nextLevel.length === 0) break;

          // Regenerate all nodes in this level sequentially
          for (const childId of nextLevel) {
            if (signal.aborted) {
              break;
            }
            processedNodes.add(childId);
            affectedNodes.add(childId);
            await regenerateNodeAsync(childId, signal);
          }

          currentLevel = nextLevel;
        }
      } finally {
        if (abortControllersRef.current[startNodeId] === controller) {
          delete abortControllersRef.current[startNodeId];
        }
        activeCascadesRef.current.delete(startNodeId);
      }
    },
    [regenerateNodeAsync]
  );

  // Handle editing a node's user message (regenerates response and cascades to children)
  const handleEditNode = useCallback(
    async (nodeId, newUserMessage, messageIndex = 0) => {
      if (!newUserMessage.trim()) return;

      if (isSharedView) commitSharedChat();

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const targetChatId = node.data?.chatId || activeChatId;
      const updateThisNode = (nId, dataUpdate) => {
        updateNodeDataWithChatId(targetChatId, nId, dataUpdate);
      };

      // Check if this is a merged node AND the first message is being edited
      if (node?.data?.isMergedNode && node.data.mergeParents && messageIndex === 0) {
        const mergeParents = node.data.mergeParents;
        const lcaId = node.data.lcaId;
        const globalMergeStrategy = node.data?.globalMergeStrategy || "milestones";

        // Build branches for all parent nodes with their context modes
        const branches = mergeParents.map((parentId) => {
          const edge = edges.find(
            (e) => e.source === parentId && e.target === nodeId
          );
          const contextMode = edge?.data?.contextMode || CONTEXT_MODE.FULL;

          const path = getPathToNode(parentId, nodes, edges);
          const lcaIndex = path.findIndex((n) => n.id === lcaId);
          const branch = path.slice(lcaIndex + 1);

          return {
            nodeId: parentId,
            messages: buildConversationFromPath(branch),
            contextMode,
          };
        });

        // Get base context from LCA
        const path1 = getPathToNode(mergeParents[0], nodes, edges);
        const lcaIndex1 = path1.findIndex((n) => n.id === lcaId);
        const lcaPath = path1.slice(0, lcaIndex1 + 1);
        const baseContext = buildConversationFromPath(lcaPath);

        // Build merged context with all branches
        const isZh = settings?.language === "zh";
        const branchCount = branches.length;
        let mergedContext = isZh
          ? `您正在继续一个已分叉为 ${branchCount} 条路径 of 对话。以下是所有分支的上下文：\n\n`
          : `You are continuing a conversation that has branched into ${branchCount} paths. Here are all branches:\n\n`;

        branches.forEach((branch, index) => {
          const branchLabel = String.fromCharCode(65 + index); // A, B, C, D, ...
          mergedContext += isZh ? `=== 分支 ${branchLabel} ===\n` : `=== BRANCH ${branchLabel} ===\n`;
          const formattedText = formatBranchMessages(
            branch.messages,
            branch.contextMode || "full",
            globalMergeStrategy,
            settings?.language || "en"
          );
          mergedContext += formattedText;
        });

        mergedContext += isZh ? "=== 分支结束 ===\n\n" : "=== END BRANCHES ===\n\n";
        mergedContext += newUserMessage;

        const userMessageObj = { role: "user", content: mergedContext, model: selectedModel };
        const assistantMessageObj = { role: "assistant", content: "", model: selectedModel };

        updateThisNode(nodeId, {
          userMessage: newUserMessage,
          messages: [userMessageObj, assistantMessageObj],
          status: "loading",
          error: null,
        });

        const conversationMessages = [
          ...baseContext,
          userMessageObj,
        ];

        await sendChatRequest(
          conversationMessages,
          selectedModel,
          (partialResponse) => {
            updateThisNode(nodeId, {
              messages: [userMessageObj, { role: "assistant", content: partialResponse, model: selectedModel }],
              status: "loading",
            });
          },
          async (fullResponse) => {
            const finalMessages = [userMessageObj, { role: "assistant", content: fullResponse, model: selectedModel }];
            updateThisNode(nodeId, {
              messages: finalMessages,
              status: "complete",
              model: selectedModel,
            });
            // Cascade to children after this node completes
            cascadeRegenerateDescendants(nodeId);
          },
          (error) => {
            if (error.name !== "AbortError") {
              console.error(error);
            }
            updateThisNode(nodeId, {
              error: error.message,
              status: "error",
            });
          }
        );
        return;
      }

      // Regular node or sequential message edit inside a node
      const parentEdge = edges.find((e) => e.target === nodeId);
      const parentNodeId = parentEdge ? parentEdge.source : null;

      const path = parentNodeId ? getPathToNode(parentNodeId, nodes, edges) : [];
      const parentContext = buildConversationFromPath(path);

      // Truncate messages in this node to messageIndex
      let currentMessages = [];
      if (node.data?.messages && Array.isArray(node.data.messages)) {
        currentMessages = [...node.data.messages];
      } else {
        if (node.data.userMessage) {
          currentMessages.push({ role: "user", content: node.data.userMessage });
        }
        if (node.data.assistantMessage) {
          currentMessages.push({ role: "assistant", content: node.data.assistantMessage, model: node.data.model });
        }
      }

      const editedMessageOriginal = currentMessages[messageIndex];
      const originalFiles = editedMessageOriginal?.files || [];
      const isOpenRouter = settings?.apiUrl?.includes("openrouter.ai");
      const formattedUserMessage = formatUserMessageWithFiles(newUserMessage, originalFiles, selectedModel, modelsData, isOpenRouter, settings?.language || "en");
      
      const messagesBeforeEdit = currentMessages.slice(0, messageIndex);
      const newUserMessageObj = { role: "user", content: formattedUserMessage, model: selectedModel, files: originalFiles };
      const emptyAssistantMessageObj = { role: "assistant", content: "", model: selectedModel };

      updateThisNode(nodeId, {
        messages: [...messagesBeforeEdit, newUserMessageObj, emptyAssistantMessageObj],
        status: "loading",
        error: null,
      });

      const requestMessages = [
        ...parentContext,
        ...messagesBeforeEdit.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: formattedUserMessage },
      ];

      await sendChatRequest(
        requestMessages,
        selectedModel,
        (partialResponse, partialReasoning) => {
          const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
          updateThisNode(nodeId, {
            messages: [
              ...messagesBeforeEdit,
              newUserMessageObj,
              { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel },
            ],
            status: "loading",
          });
        },
        async (fullResponse, fullReasoning) => {
          const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
          const finalMessages = [
            ...messagesBeforeEdit,
            newUserMessageObj,
            { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel },
          ];
          updateThisNode(nodeId, {
            messages: finalMessages,
            status: "complete",
            model: selectedModel,
          });
          // Auto-summarize title if needed
          if (finalMessages.length === 2 && (!node.data?.title || node.data.title === "New Branch")) {
            generateNodeTitle(nodeId, finalMessages, targetChatId);
          }
          // Cascade to children after this node completes
          cascadeRegenerateDescendants(nodeId);
        },
        (error) => {
          if (error.name !== "AbortError") {
            console.error(error);
          }
          updateThisNode(nodeId, {
            error: error.message,
            status: "error",
          });
        }
      );
    },
    [
      nodes,
      edges,
      selectedModel,
      updateNodeDataWithChatId,
      sendChatRequest,
      isSharedView,
      commitSharedChat,
      cascadeRegenerateDescendants,
      generateNodeTitle,
      activeChatId,
    ]
  );

  // Handle deleting a node and its descendants
  const handleDeleteNode = useCallback(
    (nodeId, messageIndex = 0) => {
      if (nodeId === "root" || nodeId.endsWith(":root")) return;

      if (isSharedView) commitSharedChat();

      const node = nodes.find((n) => n.id === nodeId);
      if (node && messageIndex > 0) {
        // Truncate messages in this node to messageIndex
        const currentMessages = node.data?.messages || [];
        const truncatedMessages = currentMessages.slice(0, messageIndex);
        updateNodeData(nodeId, {
          messages: truncatedMessages,
          status: "complete",
        });
        return;
      }

      const descendants = getDescendants(nodeId, nodes, edges);
      const nodesToRemove = new Set([nodeId, ...descendants]);

      // Abort controllers for deleted nodes
      nodesToRemove.forEach((id) => {
        if (abortControllersRef.current[id]) {
          abortControllersRef.current[id].abort();
          delete abortControllersRef.current[id];
        }
      });

      const parentEdge = edges.find((e) => e.target === nodeId);
      const colonIndex = nodeId.indexOf(":");
      const chatPrefix =
        colonIndex !== -1 ? nodeId.substring(0, colonIndex + 1) : "";
      const parentId = parentEdge?.source || `${chatPrefix}root`;

      setNodes((nds) => nds.filter((n) => !nodesToRemove.has(n.id)));
      setEdges((eds) =>
        eds.filter(
          (e) => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
        )
      );

      setSelectedNodeId(parentId);
    },
    [
      nodes,
      edges,
      setNodes,
      setEdges,
      isSharedView,
      commitSharedChat,
      setSelectedNodeId,
      updateNodeData,
    ]
  );

  // Handle toggling collapsed state on a node message
  const handleToggleCollapse = useCallback(
    (nodeId, messageType, collapsed) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const collapsedKey =
              messageType === "user"
                ? "userMessageCollapsed"
                : messageType === "assistant"
                ? "assistantMessageCollapsed"
                : "contentCollapsed";
            return {
              ...node,
              data: {
                ...node.data,
                [collapsedKey]: collapsed,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Toggle context mode on an edge
  const handleToggleContextMode = useCallback(
    (edgeId) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            const currentMode = edge.data?.contextMode || CONTEXT_MODE.FULL;
            const newMode =
              currentMode === CONTEXT_MODE.FULL
                ? CONTEXT_MODE.SINGLE
                : CONTEXT_MODE.FULL;
            return {
              ...edge,
              data: {
                ...edge.data,
                contextMode: newMode,
              },
            };
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  // Regenerate a merged node with current edge context settings
  const handleRegenerateMerge = useCallback(
    async (nodeId) => {
      await regenerateNodeAsync(nodeId);
    },
    [regenerateNodeAsync]
  );

  // Handle merge - clicks add/remove nodes from selection, double-click or confirm triggers merge
  const handleMergeNode = useCallback(
    (nodeId, isDoubleClick = false) => {
      if (nodeId === "root" || nodeId.endsWith(":root")) return;

      // If no merge mode, start it with this node
      if (!mergeMode) {
        setMergeMode({ selectedNodeIds: [nodeId] });
        return;
      }

      const selectedNodeIds = mergeMode.selectedNodeIds || [];
      const isSelected = selectedNodeIds.includes(nodeId);

      // If double-clicking or we have 2+ nodes and clicking a selected one, trigger merge
      if (isDoubleClick && selectedNodeIds.length >= 2) {
        // Proceed to pending merge
        if (isSharedView) commitSharedChat();

        // Separate artifact nodes from chat nodes
        const artifactNodeIds = selectedNodeIds.filter((id) => {
          const node = nodes.find((n) => n.id === id);
          return node?.type === "artifactNode";
        });
        const chatNodeIds = selectedNodeIds.filter((id) => {
          const node = nodes.find((n) => n.id === id);
          return node?.type !== "artifactNode";
        });

        // Find LCA only among chat nodes (artifacts don't have paths)
        const lcaId =
          chatNodeIds.length > 0
            ? findLowestCommonAncestorMultiple(chatNodeIds, nodes, edges)
            : "root";

        // Build branches for chat nodes
        const branches = chatNodeIds.map((id, index) => {
          const path = getPathToNode(id, nodes, edges);
          const lcaIndex = path.findIndex((n) => n.id === lcaId);
          const branch = path.slice(lcaIndex + 1);
          
          const messages = buildConversationFromPath(branch);
          let lastMsg = messages[messages.length - 1];
          if (!lastMsg && path.length > 0) {
            const fullMessages = buildConversationFromPath(path);
            lastMsg = fullMessages[fullMessages.length - 1];
          }
          const rawSnippet = lastMsg ? (typeof lastMsg.content === "string" ? lastMsg.content : JSON.stringify(lastMsg.content)) : "";
          const cleanSnippet = rawSnippet.replace(/\n/g, " ").trim();
          const snippet = cleanSnippet.length > 40 ? cleanSnippet.substring(0, 40) + "..." : cleanSnippet;

          return {
            nodeId: id,
            label: `Branch ${String.fromCharCode(65 + index)}: "${snippet || "New Chat"}"`,
            messages: messages,
            isArtifact: false,
            contextMode: "full",
          };
        });

        // Add artifact nodes as special branches
        artifactNodeIds.forEach((id) => {
          const node = nodes.find((n) => n.id === id);
          if (!node || !node.data || node.data.artifactType == null) {
            return;
          }
          branches.push({
            nodeId: id,
            label: `Artifact: "${node.data.name || "Unnamed"}"`,
            messages: [],
            isArtifact: true,
            artifactName: node.data.name,
            artifactType: node.data.artifactType,
            artifactContent: node.data.content,
            contextMode: "full",
          });
        });

        const firstParentId = selectedNodeIds[0];
        const colonIndex = firstParentId ? firstParentId.indexOf(":") : -1;
        const chatPrefix =
          colonIndex !== -1 ? firstParentId.substring(0, colonIndex + 1) : "";
        const finalLcaId = lcaId === "root" && chatPrefix ? `${chatPrefix}root` : lcaId;

        setPendingMerge({
          selectedNodeIds,
          lcaId: finalLcaId,
          branches,
          globalMergeStrategy: "milestones", // default context engineering strategy
        });

        const defaultPrompt = settings?.language === "zh" ? DEFAULT_MERGE_PROMPT_ZH : DEFAULT_MERGE_PROMPT_EN;
        setInputMessage(defaultPrompt);
        setMergeMode(null);

        setTimeout(() => {
          document.getElementById("message-input")?.focus();
        }, 100);
        return;
      }

      // Toggle node selection
      if (isSelected) {
        // Remove from selection
        const newSelection = selectedNodeIds.filter((id) => id !== nodeId);
        if (newSelection.length === 0) {
          // Cancel merge mode if no nodes left
          setMergeMode(null);
        } else {
          setMergeMode({ selectedNodeIds: newSelection });
        }
      } else {
        // Add to selection
        setMergeMode({ selectedNodeIds: [...selectedNodeIds, nodeId] });
      }
    },
    [
      mergeMode,
      nodes,
      edges,
      isSharedView,
      commitSharedChat,
      setMergeMode,
      setPendingMerge,
      setInputMessage,
      settings,
    ]
  );

  // Execute pending merge with user-provided prompt
  const executePendingMerge = useCallback(
    async (userPrompt) => {
      if (!pendingMerge) return;

      const { selectedNodeIds, lcaId, branches } = pendingMerge;
      const globalMergeStrategy = pendingMerge.globalMergeStrategy || "milestones";

      // Check if model supports vision
      const supportsVision = modelSupportsVision(selectedModel, modelsData);

      // Get the base context from LCA path (only if we have chat nodes)
      const chatNodeIds = selectedNodeIds.filter((id) => {
        const node = nodes.find((n) => n.id === id);
        return node?.type !== "artifactNode";
      });

      let baseContext = [];
      if (chatNodeIds.length > 0) {
        const path1 = getPathToNode(chatNodeIds[0], nodes, edges);
        const lcaIndex1 = path1.findIndex((n) => n.id === lcaId);
        const lcaPath = path1.slice(0, lcaIndex1 + 1);
        baseContext = buildConversationFromPath(lcaPath);
      }

      // Separate text and image artifacts
      const textArtifacts = branches.filter(
        (b) => b.isArtifact && b.artifactType === "text"
      );
      const imageArtifacts = branches.filter(
        (b) => b.isArtifact && b.artifactType === "image"
      );
      const chatBranches = branches.filter((b) => !b.isArtifact);

      // Build merged prompt with text content
      const isZh = settings?.language === "zh";
      const branchCount = chatBranches.length + textArtifacts.length;
      let mergedPrompt = "";

      if (branchCount > 0) {
        const totalSources = branchCount + (supportsVision && imageArtifacts.length > 0 ? imageArtifacts.length : 0);
        mergedPrompt = isZh
          ? `您正在继续一个包含 ${totalSources} 个参考来源的对话。以下是参考资料：\n\n`
          : `You are continuing a conversation that includes ${totalSources} sources. Here are the sources:\n\n`;

        chatBranches.forEach((branch, index) => {
          const branchLabel = String.fromCharCode(65 + index);
          mergedPrompt += isZh ? `=== 分支 ${branchLabel} ===\n` : `=== BRANCH ${branchLabel} ===\n`;
          const formattedText = formatBranchMessages(
            branch.messages,
            branch.contextMode || "full",
            globalMergeStrategy,
            settings?.language || "en"
          );
          mergedPrompt += formattedText;
        });

        textArtifacts.forEach((branch) => {
          mergedPrompt += isZh ? `=== 文本制品: ${branch.artifactName} ===\n` : `=== ARTIFACT: ${branch.artifactName} ===\n`;
          mergedPrompt += `${branch.artifactContent}\n\n`;
        });

        if (supportsVision && imageArtifacts.length > 0) {
          mergedPrompt += isZh ? `=== 图片制品 ===\n` : `=== IMAGES ===\n`;
          mergedPrompt += isZh
            ? `下方附带了 ${imageArtifacts.length} 张图片。\n\n`
            : `${imageArtifacts.length} image(s) attached below.\n\n`;
        }

        mergedPrompt += isZh ? "=== 参考资料结束 ===\n\n" : "=== END SOURCES ===\n\n";
      }

      mergedPrompt += userPrompt;

      // Build the user message content - can be multimodal for vision models
      let userMessageContent;

      if (supportsVision && imageArtifacts.length > 0) {
        // Build multimodal content array for vision models
        const contentParts = [{ type: "text", text: mergedPrompt }];

        // Add images
        for (const imgArtifact of imageArtifacts) {
          const imageUrl = imgArtifact.artifactContent;
          contentParts.push({
            type: "image_url",
            image_url: { url: imageUrl },
          });
        }

        userMessageContent = contentParts;
      } else {
        // Text-only content
        userMessageContent = mergedPrompt;
      }

      const userMessageObj = { role: "user", content: userMessageContent, model: selectedModel };
      const assistantMessageObj = { role: "assistant", content: "", model: selectedModel };

      const firstParentId = selectedNodeIds[0];
      const colonIndex = firstParentId ? firstParentId.indexOf(":") : -1;
      const chatPrefix =
        colonIndex !== -1 ? firstParentId.substring(0, colonIndex + 1) : "";

      const targetChatId = chatPrefix ? chatPrefix.slice(0, -1) : activeChatId;
      const updateThisNode = (nId, dataUpdate) => {
        updateNodeDataWithChatId(targetChatId, nId, dataUpdate);
      };

      const newNodeId = `${chatPrefix}node-${nodeIdCounterRef.current++}`;

      // Calculate position - average x, max (y + height) + gap
      const parentNodes = selectedNodeIds.map((id) =>
        nodes.find((n) => n.id === id)
      );
      const avgX =
        parentNodes.reduce((sum, n) => sum + n.position.x, 0) /
        parentNodes.length;
      const maxYWithHeight = Math.max(
        ...parentNodes.map((n) => n.position.y + getNodeHeight(n))
      );

      const newNode = {
        id: newNodeId,
        type: "chatNode",
        position: {
          x: avgX,
          y: maxYWithHeight + NODE_VERTICAL_GAP,
        },
        data: {
          userMessage: userPrompt,
          messages: [userMessageObj, assistantMessageObj],
          title: "Merged Branch",
          status: "loading",
          isRoot: false,
          isMergedNode: true,
          chatId: targetChatId,
          mergeParents: chatNodeIds, // Only chat nodes as parents for tree structure
          mergedArtifacts: selectedNodeIds.filter((id) => {
            const node = nodes.find((n) => n.id === id);
            return node?.type === "artifactNode";
          }),
          lcaId: lcaId,
          globalMergeStrategy: globalMergeStrategy, // Save global strategy in data
        },
      };

      // Create edges only from chat nodes (artifacts are standalone)
      const chatEdges = chatNodeIds.map((parentId) => {
        const branchObj = branches.find((b) => b.nodeId === parentId);
        const mode = branchObj?.contextMode || CONTEXT_MODE.FULL;

        return {
          id: `${chatPrefix}edge-${parentId.replace(chatPrefix, "")}-${newNodeId.replace(chatPrefix, "")}`,
          source: parentId,
          target: newNodeId,
          type: "mergeEdge",
          style: { stroke: "var(--accent-orange)", strokeWidth: 2 },
          data: {
            isMergeEdge: true,
            contextMode: mode, // Set contextMode from user configuration
          },
        };
      });

      // Create edges from artifacts (different style)
      const artifactNodeIds = selectedNodeIds.filter((id) => {
        const node = nodes.find((n) => n.id === id);
        return node?.type === "artifactNode";
      });
      const artifactEdges = artifactNodeIds.map((parentId) => ({
        id: `${chatPrefix}edge-${parentId.replace(chatPrefix, "")}-${newNodeId.replace(chatPrefix, "")}`,
        source: parentId,
        target: newNodeId,
        type: "smoothstep",
        style: { stroke: "var(--accent-orange)", strokeWidth: 2, strokeDasharray: "5,5" },
        data: {
          isArtifactEdge: true,
        },
      }));

      const newEdges = [...chatEdges, ...artifactEdges];

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, ...newEdges]);

      setSelectedNodeId(newNodeId);
      setPendingMerge(null);

      const conversationMessages = [
        ...baseContext,
        userMessageObj,
      ];

      if (abortControllersRef.current[newNodeId]) {
        abortControllersRef.current[newNodeId].abort();
      }
      const controller = new AbortController();
      abortControllersRef.current[newNodeId] = controller;
      const signal = controller.signal;

      await sendChatRequest(
        conversationMessages,
        selectedModel,
        (partialResponse, partialReasoning) => {
          const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
          updateThisNode(newNodeId, {
            messages: [
              userMessageObj,
              { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel },
            ],
            status: "loading",
          });
        },
        (fullResponse, fullReasoning) => {
          if (abortControllersRef.current[newNodeId] === controller) {
            delete abortControllersRef.current[newNodeId];
          }
          const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
          const finalMessages = [
            userMessageObj,
            { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel },
          ];
          updateThisNode(newNodeId, {
            messages: finalMessages,
            status: "complete",
            model: selectedModel,
          });
          generateNodeTitle(newNodeId, finalMessages, targetChatId);
        },
        (error) => {
          if (abortControllersRef.current[newNodeId] === controller) {
            delete abortControllersRef.current[newNodeId];
          }
          if (error.name !== "AbortError") {
            console.error(error);
          }
          if (error.name === "AbortError") {
            updateThisNode(newNodeId, {
              status: "complete",
            });
          } else {
            updateThisNode(newNodeId, {
              error: error.message,
              status: "error",
            });
          }
        },
        signal
      );

      setTimeout(() => {
        const nodesToFit = [...selectedNodeIds.map(id => ({ id })), { id: newNodeId }];
        fitView({ nodes: nodesToFit, padding: 0.2, duration: 300, maxZoom: 1 });
      }, 100);
    },
    [
      pendingMerge,
      nodes,
      edges,
      selectedModel,
      setNodes,
      setEdges,
      updateNodeDataWithChatId,
      fitView,
      sendChatRequest,
      setSelectedNodeId,
      setPendingMerge,
      nodeIdCounterRef,
      generateNodeTitle,
      modelsData,
      activeChatId,
    ]
  );

  return {
    sendMessage,
    handleAddBranch,
    handleEditNode,
    handleDeleteNode,
    handleToggleCollapse,
    handleToggleContextMode,
    handleRegenerateMerge,
    handleMergeNode,
    executePendingMerge,
    stopGeneration,
  };
};
