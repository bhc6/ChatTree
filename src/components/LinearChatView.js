"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Paper,
  CircularProgress,
  TextField,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import MarkdownContent from "./MarkdownContent";
import { useAppTheme } from "../styles/ThemeContext";
import { renderMessageContent, getDisplayContent } from "../utils/treeUtils";

const ThinkingProcess = ({ thinking, language, isStreaming }) => {
  const { colors } = useAppTheme();
  const [collapsed, setCollapsed] = useState(true);
  const [hasManuallyToggled, setHasManuallyToggled] = useState(false);

  // Auto-expand when streaming and there is content, unless user manually toggled it
  useEffect(() => {
    if (isStreaming && thinking && !hasManuallyToggled) {
      setCollapsed(false);
    }
  }, [isStreaming, thinking, hasManuallyToggled]);

  // Reset manual toggle when streaming state changes
  useEffect(() => {
    setHasManuallyToggled(false);
  }, [isStreaming]);

  if (!thinking) return null;

  const headerLabel = language === "zh" ? "思考过程" : "Thinking Process";

  return (
    <Box
      sx={{
        borderLeft: `3.5px solid ${colors.border.secondary}`,
        pl: 1.5,
        my: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Box
        onClick={(e) => {
          e.stopPropagation();
          setCollapsed(!collapsed);
          setHasManuallyToggled(true);
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          userSelect: "none",
          color: colors.text.muted,
          "&:hover": {
            color: colors.text.primary,
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.68rem",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          {headerLabel}
          {isStreaming && (
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: colors.accent.blue,
                animation: "pulse 1.5s infinite ease-in-out",
                "@keyframes pulse": {
                  "0%": { transform: "scale(0.8)", opacity: 0.5 },
                  "50%": { transform: "scale(1.2)", opacity: 1 },
                  "100%": { transform: "scale(0.8)", opacity: 0.5 },
                },
              }}
            />
          )}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: "0.65rem", opacity: 0.7 }}>
          {collapsed ? "[+]" : "[-]"}
        </Typography>
      </Box>

      {!collapsed && (
        <Typography
          variant="body2"
          sx={{
            color: colors.text.muted,
            fontStyle: "italic",
            fontSize: "0.82rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            mt: 0.5,
          }}
        >
          {thinking}
        </Typography>
      )}
    </Box>
  );
};

const FilePreviews = ({ files }) => {
  const { colors, mode, radius } = useAppTheme();
  if (!files || files.length === 0) return null;

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
      {files.map((file, idx) => {
        const isImg = file.type?.startsWith("image/");
        return (
          <Box
            key={idx}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 0.75,
              borderRadius: radius.md,
              backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.08)",
              border: `1px solid ${colors.border.primary}`,
              maxWidth: 240,
            }}
          >
            {isImg ? (
              <Box
                component="img"
                src={file.dataUrl || file.content}
                alt={file.name}
                sx={{
                  width: 36,
                  height: 36,
                  objectFit: "cover",
                  borderRadius: radius.xs,
                }}
              />
            ) : (
              <AttachFileIcon sx={{ fontSize: 16, color: colors.text.muted }} />
            )}
            <Box sx={{ overflow: "hidden" }}>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: colors.text.primary,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {file.name}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", color: colors.text.muted, fontSize: "0.62rem" }}>
                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : file.type?.split("/")[1] || "file"}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

const LinearChatView = ({
  path = [],
  nodes = [],
  edges = [],
  selectedNodeId,
  onSelectNode,
  onEditNode,
  onDeleteNode,
  language = "en",
}) => {
  const { colors, components, mode, radius } = useAppTheme();
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editMessageText, setEditMessageText] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isProgrammaticScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  // Helper to trigger a programmatic scroll without being interrupted by handleScroll updates
  const startProgrammaticScroll = (scrollAction) => {
    isProgrammaticScrollingRef.current = true;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollAction();

    const container = chatContainerRef.current;
    
    const cleanup = () => {
      isProgrammaticScrollingRef.current = false;
      if (container) {
        container.removeEventListener("scrollend", cleanup);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };

    if (container) {
      container.addEventListener("scrollend", cleanup);
    }
    
    // Safety timeout of 1000ms in case scrollend doesn't fire (e.g. browser doesn't support or scroll already at target)
    scrollTimeoutRef.current = setTimeout(cleanup, 1000);
  };

  // Cleanup scroll timers on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom on selectedNodeId change (smooth on user action, instant on first load)
  useEffect(() => {
    if (messagesEndRef.current) {
      if (isFirstRenderRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "auto" });
        isFirstRenderRef.current = false;
      } else {
        const timer = setTimeout(() => {
          startProgrammaticScroll(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          });
        }, 100); // 100ms layout delay ensures DOM sizes and markdown layout have settled
        return () => clearTimeout(timer);
      }
    }
  }, [selectedNodeId]);

  // Also scroll when the last message is loading/updating (always instant to feel snappy and keep up with text generation chunks)
  const lastNode = path[path.length - 1];
  const lastMessageContent = lastNode?.data?.assistantMessage || "";
  const lastMessageStatus = lastNode?.data?.status;
  useEffect(() => {
    if (messagesEndRef.current && lastMessageStatus === "loading") {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [lastMessageContent, lastMessageStatus]);

  const handleStartEdit = (nodeId, content, messageIndex, e) => {
    e.stopPropagation();
    setEditingNodeId(`${nodeId}-${messageIndex}`);
    setEditMessageText(getDisplayContent(content));
  };

  const handleSaveEdit = (nodeId, messageIndex, e) => {
    e.stopPropagation();
    if (editMessageText.trim()) {
      onEditNode(nodeId, editMessageText.trim(), messageIndex);
    }
    setEditingNodeId(null);
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setEditingNodeId(null);
  };

  const handleCopyText = (content, messageId, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getDisplayContent(content));
    setCopiedId(messageId);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleNodeClick = (nodeId) => {
    if (onSelectNode) {
      onSelectNode(nodeId);
    }
  };

  // Convert the path into a list of messages with node metadata
  const chatMessages = [];
  path.forEach((node) => {
    if (node.data?.isRoot && (!node.data?.messages || node.data.messages.length === 0) && !node.data?.userMessage) return;

    if (node.data?.messages && Array.isArray(node.data.messages)) {
      node.data.messages.forEach((msg, msgIndex) => {
        chatMessages.push({
          id: `${node.id}-${msgIndex}-${msg.role}`,
          nodeId: node.id,
          messageIndex: msgIndex,
          role: msg.role,
          content: msg.content || "",
          status: msgIndex === node.data.messages.length - 1 ? node.data.status : "complete",
          model: msg.model || node.data.model,
          error: msgIndex === node.data.messages.length - 1 ? node.data.error : null,
          node,
          thinking: msg.thinking || "",
          files: msg.files || [],
        });
      });
    } else {
      // Legacy fallback
      if (node.data?.userMessage !== undefined) {
        chatMessages.push({
          id: `${node.id}-user`,
          nodeId: node.id,
          messageIndex: 0,
          role: "user",
          content: node.data.userMessage,
          node,
          thinking: "",
          files: node.data.files || [],
        });
      }

      if (
        node.data?.assistantMessage !== undefined ||
        node.data?.status === "loading" ||
        node.data?.error
      ) {
        chatMessages.push({
          id: `${node.id}-assistant`,
          nodeId: node.id,
          messageIndex: 1,
          role: "assistant",
          content: node.data.assistantMessage || "",
          status: node.data.status,
          model: node.data.model,
          error: node.data.error,
          node,
          thinking: node.data.thinking || "",
          files: [],
        });
      }
    }
  });

  const userMessages = chatMessages.filter((msg) => msg.role === "user");



  // Track scroll position to update active message dot
  const handleScroll = () => {
    if (isProgrammaticScrollingRef.current) return;
    if (!chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const containerRect = container.getBoundingClientRect();

    let closestMsgId = null;
    let minDistance = Infinity;

    userMessages.forEach((msg) => {
      const element = document.getElementById(`msg-${msg.id}`);
      if (element) {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerRect.top);
        if (distance < minDistance) {
          minDistance = distance;
          closestMsgId = msg.id;
        }
      }
    });

    if (closestMsgId && closestMsgId !== activeMessageId) {
      setActiveMessageId(closestMsgId);
    }
  };

  useEffect(() => {
    if (userMessages.length > 0) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      setActiveMessageId(lastUserMsg.id);
    }
  }, [path.length, chatMessages.length]);

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "row",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        width: "100%",
      }}
    >
      <Box
        ref={chatContainerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: "auto",
          pt: { xs: 3, md: 8 },
          pb: 16,
          px: { xs: 3, md: 8 },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: colors.bg.primary,
          height: "100%",
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": {
            width: "6px",
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "transparent",
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.1)",
            borderRadius: radius.xs,
          },
        }}
      >
        <Box
          sx={{
            maxWidth: 850,
            width: "100%",
            mx: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 3.5,
            flexGrow: 1,
          }}
        >
        {chatMessages.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: colors.text.muted,
              opacity: 0.7,
              textAlign: "center",
              p: 4,
            }}
          >
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
              {language === "zh" ? "开始新对话" : "Start a Conversation"}
            </Typography>
            <Typography variant="body2" sx={{ maxWidth: 400 }}>
              {language === "zh"
                ? "在下方输入以开始对话。您的对话分支与合并路径将自动在左侧树状图画布中实时呈现。"
                : "Type a message below to start. The conversation tree will be automatically visualized in the left sidebar."}
            </Typography>
          </Box>
        ) : (
          chatMessages.map((msg, index) => {
            const isUser = msg.role === "user";
            const isSelected = selectedNodeId === msg.nodeId;
            const isEditing = editingNodeId === `${msg.nodeId}-${msg.messageIndex}`;
            const isLastMessage = index === chatMessages.length - 1;

            return (
              <Box
                key={msg.id}
                id={`msg-${msg.id}`}
                onClick={() => handleNodeClick(msg.nodeId)}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  width: "100%",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {/* Optional branch indicators or merge headers */}
                {!isUser && msg.node.data?.isMergedNode && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      mb: 0.5,
                      ml: 0,
                      color: colors.accent.orange,
                    }}
                  >
                    <CallMergeIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>
                      Merged Branches
                    </Typography>
                  </Box>
                )}

                {/* Message Bubble Container */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    maxWidth: isUser ? "80%" : "100%",
                    gap: 0.5,
                    "&:hover .bubble-actions": {
                      opacity: 1,
                    },
                  }}
                >
                  {/* Bubble content */}
                  <Paper
                    elevation={0}
                    sx={{
                      p: isUser ? 2 : "8px 0px 8px 0px",
                      borderRadius: isUser
                        ? radius.xl
                        : "0px",
                      background: isUser
                        ? isSelected
                          ? mode === "light"
                            ? "linear-gradient(135deg, #dbeafe 0%, #f0f9ff 100%)"
                            : "linear-gradient(135deg, #323d4f 0%, #202834 100%)"
                          : mode === "light"
                          ? "linear-gradient(135deg, #f0f4f8 0%, #f8fafc 100%)"
                          : "linear-gradient(135deg, #282d37 0%, #1e222b 100%)"
                        : "transparent",
                      border: isUser
                        ? isSelected
                          ? mode === "light"
                            ? "1px solid #93c5fd"
                            : "1px solid rgba(74, 158, 255, 0.5)"
                          : mode === "light"
                          ? "1px solid #e2e8f0"
                          : "1px solid #2e3138"
                        : "none",
                      borderLeft: isUser ? undefined : "none",
                      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: isSelected && isUser
                        ? `0 0 12px rgba(74, 158, 255, 0.15)`
                        : "none",
                      position: "relative",
                    }}
                  >
                    {/* Assistant name/model header */}
                    {!isUser && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 0.75,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            color: colors.accent.green,
                            fontWeight: 600,
                          }}
                        >
                          {msg.model || "Assistant"}
                        </Typography>
                      </Box>
                    )}

                    {/* Message Text */}
                    {isUser && isEditing ? (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                          minWidth: 250,
                        }}
                      >
                        <TextField
                          value={editMessageText}
                          onChange={(e) => setEditMessageText(e.target.value)}
                          multiline
                          minRows={1}
                          maxRows={6}
                          size="small"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(msg.nodeId, msg.messageIndex, e);
                            } else if (e.key === "Escape") {
                              handleCancelEdit(e);
                            }
                          }}
                          sx={components.textField}
                        />
                        <Box
                          sx={{
                            display: "flex",
                            gap: 0.5,
                            justifyContent: "flex-end",
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={handleCancelEdit}
                            sx={components.iconButton}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={(e) => handleSaveEdit(msg.nodeId, msg.messageIndex, e)}
                            sx={{
                              ...components.buttonPrimary,
                              width: 24,
                              height: 24,
                            }}
                          >
                            <CheckIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      </Box>
                    ) : isUser ? (
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{
                            color: colors.text.primary,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                            fontSize: "1.0625rem",
                          }}
                        >
                          {getDisplayContent(msg.content)}
                        </Typography>
                        <FilePreviews files={msg.files} />
                      </Box>
                    ) : msg.status === "loading" && !msg.content ? (
                      <Box display="flex" flexDirection="column" gap={1}>
                        <ThinkingProcess
                          thinking={msg.thinking}
                          language={language}
                          isStreaming={true}
                        />
                        <Box display="flex" alignItems="center" gap={1.5} py={0.5}>
                          <CircularProgress size={16} sx={{ color: colors.accent.blue }} />
                          <Typography
                            variant="body2"
                            sx={{ color: colors.text.muted, fontStyle: "italic" }}
                          >
                            {language === "zh" ? "正在生成回复..." : "Generating response..."}
                          </Typography>
                        </Box>
                      </Box>
                    ) : msg.error ? (
                      <Typography
                        variant="body2"
                        sx={{ color: colors.accent.error }}
                      >
                        Error: {msg.error}
                      </Typography>
                    ) : (
                      <Box sx={{ position: "relative" }}>
                        <ThinkingProcess
                          thinking={msg.thinking}
                          language={language}
                          isStreaming={msg.status === "loading"}
                        />
                        <MarkdownContent>{getDisplayContent(msg.content)}</MarkdownContent>
                        {msg.status === "loading" && (
                          <Box
                             display="flex"
                             alignItems="center; gap: 1"
                             mt={1}
                             sx={{ opacity: 0.7 }}
                          >
                            <CircularProgress size={12} sx={{ color: colors.accent.blue }} />
                            <Typography variant="caption" sx={{ color: colors.text.muted }}>
                              {language === "zh" ? "输出中..." : "Streaming..."}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Paper>

                  {/* Actions below bubble */}
                  <Box
                    className="bubble-actions"
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      opacity: 0.4,
                      transition: "opacity 0.2s ease",
                      flexDirection: "row",
                      alignItems: "center",
                      mt: 0.5,
                    }}
                  >
                    {isUser && !isEditing && (
                      <>
                        <Tooltip title={language === "zh" ? "编辑消息 (重新生成分支)" : "Edit Message (Regenerate Branch)"}>
                          <IconButton
                            size="small"
                            onClick={(e) =>
                              handleStartEdit(msg.nodeId, msg.content, msg.messageIndex, e)
                            }
                            sx={components.iconButtonMuted}
                          >
                            <EditIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={language === "zh" ? "删除分支" : "Delete Branch"}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNode(msg.nodeId, msg.messageIndex);
                            }}
                            sx={{
                              color: colors.text.muted,
                              p: 0.5,
                              "&:hover": { color: colors.accent.delete },
                            }}
                          >
                            <DeleteIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {msg.content && (
                      <Tooltip title={copiedId === msg.id ? (language === "zh" ? "已复制" : "Copied!") : (language === "zh" ? "复制内容" : "Copy Content")}>
                        <IconButton
                          size="small"
                          onClick={(e) => handleCopyText(msg.content, msg.id, e)}
                          sx={components.iconButtonMuted}
                        >
                          {copiedId === msg.id ? (
                            <CheckIcon sx={{ fontSize: 13, color: colors.accent.green }} />
                          ) : (
                            <ContentCopyIcon sx={{ fontSize: 13 }} />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>
    </Box>

    {/* Vertical Timeline Navigation Bar (Grok-inspired Milestones Outline) */}
      {userMessages.length > 0 && (
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            alignItems: "center",
            width: 32,
            backgroundColor: mode === "light" ? "rgba(245, 244, 242, 0.45)" : "rgba(26, 28, 29, 0.45)",
            backdropFilter: "blur(8px)",
            py: 2,
            px: 0.5,
            borderRadius: radius.xl,
            border: `1px solid ${colors.border.subtle}`,
            height: "auto",
            maxHeight: "70%",
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            boxShadow: mode === "light" ? "0 4px 12px rgba(0,0,0,0.05)" : "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          {/* Vertical Track Line */}
          <Box
            sx={{
              position: "absolute",
              top: 16,
              bottom: 16,
              width: 2,
              background: `linear-gradient(to bottom, ${colors.accent.blue} 0%, ${colors.accent.orange || "#ff9800"} 100%)`,
              opacity: 0.3,
              zIndex: 1,
            }}
          />

          {/* Milestone Ticks List */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              py: 2,
              zIndex: 2,
              position: "relative",
              overflowY: "auto",
              maxHeight: "100%",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
            {userMessages.map((userMsg, idx) => {
              const isActive = activeMessageId === userMsg.id;
              const node = userMsg.node;
              
              // Detect branching / sibling count
              const childEdges = edges.filter(e => e.source === node.id);
              const hasMultipleBranches = childEdges.length > 1;
              const isMerged = node.data?.isMergedNode;
              
              // Get snippet content
              const displaySnippet = getDisplayContent(userMsg.content);
              const cleanSnippet = displaySnippet.replace(/\n/g, " ").trim();
              const tooltipSnippet = cleanSnippet.length > 150 
                ? cleanSnippet.substring(0, 150) + "..." 
                : cleanSnippet || (language === "zh" ? "空白提示词" : "Empty Prompt");

              const tooltipLabel = (
                <Box sx={{ p: 0.75, maxWidth: 220 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: "block", color: colors.accent.blue }}>
                    {language === "zh" ? `第 ${idx + 1} 轮对话` : `Turn ${idx + 1}`}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: "0.78rem", my: 0.5, color: mode === "light" ? colors.text.primary : "#fff", lineHeight: 1.4 }}>
                    "{tooltipSnippet}"
                  </Typography>
                  {isMerged && (
                    <Typography variant="caption" sx={{ color: colors.accent.orange || "#ff9800", fontWeight: 500, display: "block" }}>
                      🔀 {language === "zh" ? "合并分支节点" : "Merged Branch Node"}
                    </Typography>
                  )}
                  {hasMultipleBranches && (
                    <Typography variant="caption" sx={{ color: colors.accent.blue, fontWeight: 500, display: "block" }}>
                      🌿 {language === "zh" ? `产生分叉 (${childEdges.length} 分支)` : `Branch Fork (${childEdges.length} branches)`}
                    </Typography>
                  )}
                  {userMsg.model && (
                    <Typography variant="caption" sx={{ color: colors.text.muted, fontSize: "0.68rem", display: "block", mt: 0.5 }}>
                      Model: {userMsg.model}
                    </Typography>
                  )}
                </Box>
              );

              return (
                <Tooltip
                  key={userMsg.id}
                  title={tooltipLabel}
                  placement="left"
                  arrow
                  componentsProps={{
                    tooltip: {
                      sx: {
                        backgroundColor: mode === "light" ? "rgba(255, 255, 255, 0.98)" : "rgba(15, 23, 42, 0.95)",
                        border: `1px solid ${colors.border.primary}`,
                        borderRadius: radius.sm,
                        boxShadow: mode === "light" ? "0 4px 20px rgba(0,0,0,0.15)" : "0 4px 20px rgba(0,0,0,0.5)",
                      }
                    },
                    arrow: {
                      sx: {
                        color: mode === "light" ? "rgba(255, 255, 255, 0.98)" : "rgba(15, 23, 42, 0.95)",
                      }
                    }
                  }}
                >
                  <Box
                    onClick={() => {
                      const element = document.getElementById(`msg-${userMsg.id}`);
                      if (element) {
                        setActiveMessageId(userMsg.id);
                        startProgrammaticScroll(() => {
                          element.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                        });
                      }
                    }}
                    sx={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      backgroundColor: "transparent",
                      position: "relative",
                      "&:hover": {
                        transform: "scale(1.25)",
                      },
                    }}
                  >
                    {/* Visual Dot */}
                    <Box
                      sx={{
                        width: isActive ? 10 : 6,
                        height: isActive ? 10 : 6,
                        borderRadius: "50%",
                        backgroundColor: isActive
                          ? colors.accent.blue
                          : isMerged
                          ? colors.accent.orange || "#ff9800"
                          : hasMultipleBranches
                          ? "rgba(74, 158, 255, 0.7)"
                          : mode === "light"
                          ? "rgba(0, 0, 0, 0.25)"
                          : "rgba(255, 255, 255, 0.25)",
                        border: isActive
                          ? mode === "light"
                            ? `2px solid ${colors.bg.primary}`
                            : `2px solid #ffffff`
                          : isMerged
                          ? `1px solid ${colors.accent.orange || "#ff9800"}`
                          : `1px solid transparent`,
                        boxShadow: isActive
                          ? `0 0 10px 3px rgba(74, 158, 255, 0.5)`
                          : isMerged
                          ? `0 0 8px 1px rgba(255, 152, 0, 0.4)`
                          : "none",
                        transition: "all 0.25s ease",
                      }}
                    />

                    {/* Small Icon indicator if special */}
                    {(isMerged || hasMultipleBranches) && !isActive && (
                      <Box
                        sx={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          backgroundColor: isMerged ? (colors.accent.orange || "#ff9800") : colors.accent.blue,
                        }}
                      />
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default LinearChatView;
