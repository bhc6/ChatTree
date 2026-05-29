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
const formatUserMessageWithFiles = (text, files, selectedModel, modelsData, isOpenRouter = false) => {
  if (!files || files.length === 0) {
    return text;
  }

  const supportsVision = modelSupportsVision(selectedModel, modelsData);
  const imageFiles = files.filter(f => f.type?.startsWith("image/"));
  const documentFiles = files.filter(f => !f.type?.startsWith("image/"));

  // Build the text portion with all extracted document contents (PDF, Word, Excel, TXT, etc.)
  let textWithDocs = text || "";
  if (documentFiles.length > 0) {
    textWithDocs += "\n\n=== ATTACHED DOCUMENTS/FILES ===";
    documentFiles.forEach(tf => {
      const contentStr = tf.textContent || tf.content || "";
      textWithDocs += `\n\n[File: ${tf.name}]\n\`\`\`\n${contentStr}\n\`\`\``;
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
    textWithDocs += `\n\n[Warning: ${imageFiles.length} image(s) attached but the selected model "${selectedModel}" does not support vision. Images were omitted.]`;
  }

  return textWithDocs;
};

// Helper to format branch conversation history using different context engineering strategies
const formatBranchMessages = (messages, contextMode, globalMergeStrategy) => {
  if (!messages || messages.length === 0) return "";

  // If contextMode is SINGLE, only use the latest assistant message (or latest message overall if no assistant)
  if (contextMode === CONTEXT_MODE.SINGLE || contextMode === "single") {
    const lastMsg = [...messages].reverse().find(m => m.role === "assistant") || messages[messages.length - 1];
    return `(Latest message only)\n${lastMsg.role.toUpperCase()}: ${lastMsg.content}\n\n`;
  }

  // Full history formatting based on strategy
  if (globalMergeStrategy === "milestones") {
    // Milestones strategy: user prompts + last assistant response
    const userPrompts = messages.filter(m => m.role === "user");
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    
    let text = "(Milestones Mode - intermediate turns omitted)\n";
    userPrompts.forEach((up, idx) => {
      text += `USER Prompt ${idx + 1}: ${up.content}\n\n`;
    });
    if (lastAssistant) {
      text += `ASSISTANT (Final Output): ${lastAssistant.content}\n\n`;
    }
    return text;
  }

  if (globalMergeStrategy === "summary") {
    // Summary strategy: condensed versions of all messages
    let text = "(Condensed Turn-by-turn Transcript)\n";
    messages.forEach(msg => {
      const displayContent = msg.content.length > 250
        ? msg.content.substring(0, 250) + "...\n[Content condensed to fit context window]"
        : msg.content;
      text += `${msg.role.toUpperCase()}: ${displayContent}\n\n`;
    });
    return text;
  }

  // "raw" strategy: Full transcripts
  let text = "";
  messages.forEach(msg => {
    text += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
  });
  return text;
};

// Helper to split <think>...</think> thinking blocks and SSE reasoning deltas
const parseThinkingAndContent = (text, reasoningContent) => {
  let content = text || "";
  let thinking = reasoningContent || "";

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
}) => {
  const { fitView } = useReactFlow();

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

  // Track if cascade is active to prevent duplicate triggers
  const cascadeActiveRef = useRef(false);

  // Update node data
  const updateNodeData = useCallback(
    (nodeId, dataUpdate) => {
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
    },
    [setNodes]
  );

  // Generate a short 2-5 words title from dialogue turns using LLM
  const generateNodeTitle = useCallback(
    async (nodeId, nodeMessages) => {
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
            updateNodeData(nodeId, { title: cleanedTitle });
          },
          (error) => {
            console.error("Failed to generate title:", error);
          }
        );
      } catch (err) {
        console.error("Error in generateNodeTitle:", err);
      }
    },
    [selectedModel, sendChatRequest, updateNodeData, settings]
  );

  // Send message and create new node or append to current node
  const sendMessage = useCallback(
    async (parentNodeId, userMessage, files = []) => {
      if (isSharedView) commitSharedChat();

      const isRoot = parentNodeId === "root" || parentNodeId.endsWith(":root");
      const parentNode = nodes.find((n) => n.id === parentNodeId);
      const isArtifact = parentNode?.type === "artifactNode";

      if (isArtifact) {
        const colonIndex = parentNodeId.indexOf(":");
        const chatPrefix =
          colonIndex !== -1 ? parentNodeId.substring(0, colonIndex + 1) : "";

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
        let finalUserMessage = formatUserMessageWithFiles(finalUserText, files, selectedModel, modelsData, isOpenRouter);

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
            chatId: chatPrefix ? chatPrefix.slice(0, -1) : undefined,
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

        await sendChatRequest(
          requestMessages,
          selectedModel,
          (partialResponse, partialReasoning) => {
            const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
            updateNodeData(newNodeId, {
              messages: [newUserMessageObj, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }],
              status: "loading",
            });
          },
          (fullResponse, fullReasoning) => {
            const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
            const finalMessages = [newUserMessageObj, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }];
            updateNodeData(newNodeId, {
              messages: finalMessages,
              status: "complete",
              model: selectedModel,
            });
            generateNodeTitle(newNodeId, finalMessages);
          },
          (error) => {
            console.error(error);
            updateNodeData(newNodeId, {
              error: error.message,
              status: "error",
            });
          }
        );

        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
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
        const finalUserMessage = formatUserMessageWithFiles(userMessage, files, selectedModel, modelsData, isOpenRouter);
        const newUserMessageObj = { role: "user", content: finalUserMessage, model: selectedModel, files: files };
        const newAssistantMessageObj = { role: "assistant", content: "", model: selectedModel };
        const updatedMessages = [...initialMsgs, newUserMessageObj];
        const messagesWithAssistant = [...updatedMessages, newAssistantMessageObj];

        updateNodeData(parentNodeId, {
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

        await sendChatRequest(
          requestMessages,
          selectedModel,
          (partialResponse, partialReasoning) => {
            const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
            updateNodeData(parentNodeId, {
              messages: [...updatedMessages, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }],
              status: "loading",
            });
          },
          (fullResponse, fullReasoning) => {
            const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
            const finalMessages = [...updatedMessages, { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel }];
            updateNodeData(parentNodeId, {
              messages: finalMessages,
              status: "complete",
              model: selectedModel,
            });
            // Auto-summarize title on the first complete turn
            if (finalMessages.length === 2 && (!node.data?.title || node.data.title === "New Branch")) {
              generateNodeTitle(parentNodeId, finalMessages);
            }
          },
          (error) => {
            console.error(error);
            updateNodeData(parentNodeId, {
              error: error.message,
              status: "error",
            });
          }
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
      updateNodeData,
      fitView,
      sendChatRequest,
      isSharedView,
      commitSharedChat,
      setSelectedNodeId,
      nodeIdCounterRef,
      generateNodeTitle,
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
          chatId: chatPrefix ? chatPrefix.slice(0, -1) : undefined,
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
        fitView({ padding: 0.2, duration: 300 });
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
    ]
  );

  // Internal function to regenerate a single node and return a promise
  const regenerateNodeAsync = useCallback(
    (nodeId) => {
      return new Promise(async (resolve) => {
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
          const branchCount = branches.length;
          let mergedContext = `You are continuing a conversation that has branched into ${branchCount} paths. Here are all branches:\n\n`;

          branches.forEach((branch, index) => {
            const branchLabel = String.fromCharCode(65 + index); // A, B, C, D, ...
            mergedContext += `=== BRANCH ${branchLabel} ===\n`;
            const formattedText = formatBranchMessages(
              branch.messages,
              branch.contextMode || "full",
              globalMergeStrategy
            );
            mergedContext += formattedText;
          });

          mergedContext += "=== END BRANCHES ===\n\n";
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

            updateNodeData(nodeId, {
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
                  updateNodeData(nodeId, {
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
                  updateNodeData(nodeId, {
                    messages: currentMessages,
                    status: "loading",
                  });
                  res();
                },
                (error) => {
                  rej(error);
                }
              );
            });
          }

          // Move to next message
          await regenerateTurn(msgIndex + 1);
        };

        try {
          await regenerateTurn(0);
          updateNodeData(nodeId, {
            messages: currentMessages,
            status: "complete",
            model: selectedModel,
          });
          // Auto-summarize title if needed
          if (currentMessages.length === 2 && (!node.data?.title || node.data.title === "New Branch")) {
            await generateNodeTitle(nodeId, currentMessages);
          }
          resolve();
        } catch (error) {
          console.error(error);
          updateNodeData(nodeId, {
            error: error.message,
            status: "error",
          });
          resolve();
        }
      });
    },
    [selectedModel, updateNodeData, sendChatRequest, generateNodeTitle]
  );

  // Cascade regeneration to all descendants after a node is edited
  const cascadeRegenerateDescendants = useCallback(
    async (startNodeId) => {
      if (cascadeActiveRef.current) return;
      cascadeActiveRef.current = true;

      try {
        // Track all nodes that have been regenerated in this cascade
        const processedNodes = new Set([startNodeId]);

        // Track nodes that are part of the regeneration chain (affected by the edit)
        const affectedNodes = new Set([startNodeId]);

        // Queue for BFS traversal - process level by level
        let currentLevel = [startNodeId];

        while (currentLevel.length > 0) {
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
            processedNodes.add(childId);
            affectedNodes.add(childId);
            await regenerateNodeAsync(childId);
          }

          currentLevel = nextLevel;
        }
      } finally {
        cascadeActiveRef.current = false;
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
        const branchCount = branches.length;
        let mergedContext = `You are continuing a conversation that has branched into ${branchCount} paths. Here are all branches:\n\n`;

        branches.forEach((branch, index) => {
          const branchLabel = String.fromCharCode(65 + index); // A, B, C, D, ...
          mergedContext += `=== BRANCH ${branchLabel} ===\n`;
          const formattedText = formatBranchMessages(
            branch.messages,
            branch.contextMode || "full",
            globalMergeStrategy
          );
          mergedContext += formattedText;
        });

        mergedContext += "=== END BRANCHES ===\n\n";
        mergedContext += newUserMessage;

        const userMessageObj = { role: "user", content: mergedContext, model: selectedModel };
        const assistantMessageObj = { role: "assistant", content: "", model: selectedModel };

        updateNodeData(nodeId, {
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
            updateNodeData(nodeId, {
              messages: [userMessageObj, { role: "assistant", content: partialResponse, model: selectedModel }],
              status: "loading",
            });
          },
          async (fullResponse) => {
            const finalMessages = [userMessageObj, { role: "assistant", content: fullResponse, model: selectedModel }];
            updateNodeData(nodeId, {
              messages: finalMessages,
              status: "complete",
              model: selectedModel,
            });
            // Cascade to children after this node completes
            cascadeRegenerateDescendants(nodeId);
          },
          (error) => {
            console.error(error);
            updateNodeData(nodeId, {
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
      const formattedUserMessage = formatUserMessageWithFiles(newUserMessage, originalFiles, selectedModel, modelsData, isOpenRouter);
      
      const messagesBeforeEdit = currentMessages.slice(0, messageIndex);
      const newUserMessageObj = { role: "user", content: formattedUserMessage, model: selectedModel, files: originalFiles };
      const emptyAssistantMessageObj = { role: "assistant", content: "", model: selectedModel };

      updateNodeData(nodeId, {
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
          updateNodeData(nodeId, {
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
          updateNodeData(nodeId, {
            messages: finalMessages,
            status: "complete",
            model: selectedModel,
          });
          // Auto-summarize title if needed
          if (finalMessages.length === 2 && (!node.data?.title || node.data.title === "New Branch")) {
            generateNodeTitle(nodeId, finalMessages);
          }
          // Cascade to children after this node completes
          cascadeRegenerateDescendants(nodeId);
        },
        (error) => {
          console.error(error);
          updateNodeData(nodeId, {
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
      updateNodeData,
      sendChatRequest,
      isSharedView,
      commitSharedChat,
      cascadeRegenerateDescendants,
      generateNodeTitle,
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
      const branchCount = chatBranches.length + textArtifacts.length;
      let mergedPrompt = "";

      if (branchCount > 0) {
        mergedPrompt = `You are continuing a conversation that includes ${
          branchCount +
          (supportsVision && imageArtifacts.length > 0
            ? imageArtifacts.length
            : 0)
        } sources. Here are the sources:\n\n`;

        chatBranches.forEach((branch, index) => {
          const branchLabel = String.fromCharCode(65 + index);
          mergedPrompt += `=== BRANCH ${branchLabel} ===\n`;
          const formattedText = formatBranchMessages(
            branch.messages,
            branch.contextMode || "full",
            globalMergeStrategy
          );
          mergedPrompt += formattedText;
        });

        textArtifacts.forEach((branch) => {
          mergedPrompt += `=== ARTIFACT: ${branch.artifactName} ===\n`;
          mergedPrompt += `${branch.artifactContent}\n\n`;
        });

        if (supportsVision && imageArtifacts.length > 0) {
          mergedPrompt += `=== IMAGES ===\n`;
          mergedPrompt += `${imageArtifacts.length} image(s) attached below.\n\n`;
        }

        mergedPrompt += "=== END SOURCES ===\n\n";
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
          chatId: chatPrefix ? chatPrefix.slice(0, -1) : undefined,
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

      await sendChatRequest(
        conversationMessages,
        selectedModel,
        (partialResponse, partialReasoning) => {
          const parsed = parseThinkingAndContent(partialResponse, partialReasoning);
          updateNodeData(newNodeId, {
            messages: [
              userMessageObj,
              { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel },
            ],
            status: "loading",
          });
        },
        (fullResponse, fullReasoning) => {
          const parsed = parseThinkingAndContent(fullResponse, fullReasoning);
          const finalMessages = [
            userMessageObj,
            { role: "assistant", content: parsed.content, thinking: parsed.thinking, model: selectedModel },
          ];
          updateNodeData(newNodeId, {
            messages: finalMessages,
            status: "complete",
            model: selectedModel,
          });
          generateNodeTitle(newNodeId, finalMessages);
        },
        (error) => {
          console.error(error);
          updateNodeData(newNodeId, {
            error: error.message,
            status: "error",
          });
        }
      );

      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
    },
    [
      pendingMerge,
      nodes,
      edges,
      selectedModel,
      setNodes,
      setEdges,
      updateNodeData,
      fitView,
      sendChatRequest,
      setSelectedNodeId,
      setPendingMerge,
      nodeIdCounterRef,
      generateNodeTitle,
      modelsData,
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
  };
};
