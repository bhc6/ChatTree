"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Paper,
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
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MarkdownContent from "./MarkdownContent";
import { useAppTheme } from "../styles/ThemeContext";
import { renderMessageContent, getDisplayContent } from "../utils/treeUtils";
import { useSmoothText } from "../hooks/useSmoothText";

const ThinkingProcess = ({ thinking, language, isStreaming }) => {
  const { colors } = useAppTheme();
  const [collapsed, setCollapsed] = useState(true);
  const [hasManuallyToggled, setHasManuallyToggled] = useState(false);
  const displayedThinking = useSmoothText(thinking, isStreaming);

  // Auto-expand during streaming and auto-collapse when done (unless manually toggled)
  useEffect(() => {
    if (thinking && !hasManuallyToggled) {
      if (isStreaming) {
        setCollapsed(false);
      } else {
        setCollapsed(true);
      }
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

      <Box
        sx={{
          maxHeight: collapsed ? "0px" : "2000px",
          opacity: collapsed ? 0 : 1,
          overflow: "hidden",
          transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-in-out, margin-top 0.3s ease-in-out",
          mt: collapsed ? 0 : 0.5,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: colors.text.muted,
            fontStyle: "italic",
            fontSize: "0.82rem",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {displayedThinking}
        </Typography>
      </Box>
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

const TypingIndicator = () => {
  const { colors } = useAppTheme();
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.6,
        py: 1,
        px: 0.5,
        height: 20,
      }}
    >
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: colors.accent.blue,
            animation: "typing-bounce 1.4s infinite ease-in-out both",
            animationDelay: `${i * 0.16}s`,
            "@keyframes typing-bounce": {
              "0%, 80%, 100%": {
                transform: "scale(0.6)",
                opacity: 0.4,
              },
              "40%": {
                transform: "scale(1)",
                opacity: 1,
              },
            },
          }}
        />
      ))}
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
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isProgrammaticScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const isFirstRenderRef = useRef(true);
  const isNearBottomRef = useRef(true);

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

  // Also scroll when the last message is loading/updating (only if user is already looking at the bottom)
  const lastNode = path[path.length - 1];
  const lastNodeMessages = lastNode?.data?.messages;
  const lastMsg = lastNodeMessages && lastNodeMessages.length > 0
    ? lastNodeMessages[lastNodeMessages.length - 1]
    : null;
  const lastMsgContent = lastMsg?.content || lastNode?.data?.assistantMessage || "";
  const lastMsgThinking = lastMsg?.thinking || lastNode?.data?.thinking || "";
  const lastMsgStatus = lastNode?.data?.status;

  useEffect(() => {
    if (messagesEndRef.current && lastMsgStatus === "loading" && isNearBottomRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [lastMsgContent, lastMsgThinking, lastMsgStatus]);

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

  const handleScrollToBottom = () => {
    startProgrammaticScroll(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    isNearBottomRef.current = true;
    setShowScrollButton(false);
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



  // Track scroll position to update active message dot and scroll-to-bottom button
  const handleScroll = () => {
    if (isProgrammaticScrollingRef.current) return;
    if (!chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const containerRect = container.getBoundingClientRect();

    // Check if scrolled near the bottom (120px threshold)
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNear = scrollBottom <= 120;
    isNearBottomRef.current = isNear;
    setShowScrollButton(!isNear);

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
                        ? colors.bg.secondary
                        : "transparent",
                      border: isUser
                        ? isSelected
                          ? `1px solid ${colors.accent.blue}`
                          : `1px solid ${colors.border.primary}`
                        : "none",
                      borderLeft: isUser ? undefined : "none",
                      transition: "border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
                      boxShadow: "none",
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
                    ) : msg.error ? (
                      <Typography
                        variant="body2"
                        sx={{ color: colors.accent.error }}
                      >
                        Error: {msg.error}
                      </Typography>
                    ) : (
                      <Box sx={{ position: "relative", display: "flex", flexDirection: "column", gap: 1 }}>
                        <ThinkingProcess
                          thinking={msg.thinking}
                          language={language}
                          isStreaming={msg.status === "loading"}
                        />
                        {msg.content ? (
                          <MarkdownContent isStreaming={msg.status === "loading"}>
                            {getDisplayContent(msg.content)}
                          </MarkdownContent>
                        ) : (
                          msg.status === "loading" && !msg.thinking && <TypingIndicator />
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

      {/* Floating scroll to bottom button (Grok/ChatGPT inspired) */}
      {showScrollButton && (
        <IconButton
          onClick={handleScrollToBottom}
          sx={{
            position: "absolute",
            bottom: 24,
            right: userMessages.length > 0 ? { xs: 24, md: 64 } : 24,
            zIndex: 1000,
            backgroundColor: colors.bg.secondary,
            border: `1px solid ${colors.border.primary}`,
            color: colors.text.primary,
            boxShadow: mode === "light" ? "0 4px 12px rgba(0,0,0,0.08)" : "0 4px 12px rgba(0,0,0,0.3)",
            width: 36,
            height: 36,
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: colors.bg.hover,
              borderColor: colors.accent.blue,
              transform: "translateY(-2px)",
            },
            animation: "bounceIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
            "@keyframes bounceIn": {
              "0%": { transform: "scale(0.3) translateY(20px)", opacity: 0 },
              "100%": { transform: "scale(1) translateY(0)", opacity: 1 },
            },
          }}
        >
          <Box sx={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ArrowDownwardIcon sx={{ fontSize: 18 }} />
            {lastMsgStatus === "loading" && (
              <Box
                sx={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: colors.accent.blue,
                  boxShadow: `0 0 0 2px ${colors.bg.secondary}`,
                  animation: "pulsing-badge 1.5s infinite ease-in-out",
                  "@keyframes pulsing-badge": {
                    "0%": { transform: "scale(0.8)", opacity: 0.5 },
                    "50%": { transform: "scale(1.2)", opacity: 1 },
                    "100%": { transform: "scale(0.8)", opacity: 0.5 },
                  },
                }}
              />
            )}
          </Box>
        </IconButton>
      )}
    </Box>

    {/* Vertical Timeline Navigation Bar (Grok-inspired Milestones Outline) */}
      {userMessages.length > 0 && (
        <Box
          onMouseEnter={() => setIsTimelineHovered(true)}
          onMouseLeave={() => setIsTimelineHovered(false)}
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            alignItems: "stretch",
            width: isTimelineHovered ? 220 : 32,
            backgroundColor: mode === "light"
              ? isTimelineHovered ? "rgba(255, 255, 255, 0.85)" : "rgba(245, 244, 242, 0.45)"
              : isTimelineHovered ? "rgba(18, 18, 18, 0.85)" : "rgba(26, 28, 29, 0.45)",
            backdropFilter: "blur(20px)",
            py: 1,
            px: 0.5,
            borderRadius: radius.xl,
            border: `1px solid ${isTimelineHovered ? colors.border.primary : colors.border.subtle}`,
            height: "auto",
            maxHeight: "75%",
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            boxShadow: isTimelineHovered ? "var(--shadow-lg)" : "var(--shadow-sm)",
            transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
            overflow: "hidden",
          }}
        >
          {/* Scroll Up Arrow */}
          <IconButton
            onClick={() => {
              if (chatContainerRef.current) {
                startProgrammaticScroll(() => {
                  chatContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
                });
              }
            }}
            size="small"
            sx={{
              alignSelf: "flex-end",
              mr: "6px",
              width: 20,
              height: 20,
              opacity: isTimelineHovered ? 0.7 : 0,
              pointerEvents: isTimelineHovered ? "auto" : "none",
              transition: "all 0.2s ease",
              color: colors.text.muted,
              "&:hover": {
                color: colors.accent.blue,
                opacity: 1,
                backgroundColor: mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              },
              mb: 0.5,
            }}
          >
            <KeyboardArrowUpIcon sx={{ fontSize: 16 }} />
          </IconButton>

          {/* Scrollable Timeline Area */}
          <Box
            sx={{
              position: "relative",
              width: "100%",
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
              py: 1.5,
            }}
          >
            {/* Absolute Track Wrapper */}
            <Box
              sx={{
                position: "absolute",
                right: 11,
                top: 24, // first dot center
                bottom: 24, // last dot center
                width: 2,
                zIndex: 1,
                pointerEvents: "none",
              }}
            >
              {/* Background Track Line */}
              <Box
                sx={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: 2,
                  transform: "translateX(-50%)",
                  backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)",
                }}
              />

              {/* Active Progress Fill Line & Sliding Indicator */}
              {(() => {
                const activeIndex = Math.max(0, userMessages.findIndex(m => m.id === activeMessageId));
                const pct = userMessages.length > 1 ? (activeIndex / (userMessages.length - 1)) * 100 : 0;
                return (
                  <>
                    <Box
                      sx={{
                        position: "absolute",
                        left: "50%",
                        top: 0,
                        width: 2,
                        height: `${pct}%`,
                        transform: "translateX(-50%)",
                        background: `linear-gradient(to bottom, ${colors.accent.blue} 0%, ${colors.accent.orange || "#ff9800"} 100%)`,
                        transition: "height 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                      }}
                    />
                    {/* Sliding Elevator Active Marker Dot */}
                    <Box
                      sx={{
                        position: "absolute",
                        left: "50%",
                        top: `${pct}%`,
                        transform: "translate(-50%, -50%)",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: colors.accent.blue,
                        boxShadow: mode === "light"
                          ? `0 0 8px 2px rgba(74, 158, 255, 0.4)`
                          : `0 0 10px 3px rgba(74, 158, 255, 0.5)`,
                        transition: "top 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                        zIndex: 2,
                      }}
                    />
                  </>
                );
              })()}
            </Box>

            {/* Milestone Rows List */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: "16px",
                position: "relative",
                zIndex: 2,
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

                const itemContent = (
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
                      height: 24,
                      position: "relative",
                      width: "100%",
                      userSelect: "none",
                    }}
                  >
                    {/* Text Snippet Outline (Fades in when timeline is expanded) */}
                    <Box
                      sx={{
                        position: "absolute",
                        right: 32, // Left of the dot container (20px dot + 12px gap)
                        opacity: isTimelineHovered ? 1 : 0,
                        transform: isTimelineHovered ? "translateX(0)" : "translateX(-8px)",
                        transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                        pointerEvents: isTimelineHovered ? "auto" : "none",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontSize: "0.72rem",
                        fontWeight: isActive ? 600 : 400,
                        color: isActive 
                          ? colors.accent.blue 
                          : mode === "light" 
                          ? "rgba(0, 0, 0, 0.65)" 
                          : "rgba(255, 255, 255, 0.65)",
                        maxWidth: 160,
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        textAlign: "right",
                        justifyContent: "flex-end",
                      }}
                    >
                      {isMerged && (
                        <Box component="span" sx={{ color: colors.accent.orange || "#ff9800", fontSize: "0.8rem", display: "inline-flex" }}>
                          🔀
                        </Box>
                      )}
                      {hasMultipleBranches && (
                        <Box component="span" sx={{ color: colors.accent.blue, fontSize: "0.8rem", display: "inline-flex" }}>
                          🌿
                        </Box>
                      )}
                      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cleanSnippet}
                      </Box>
                    </Box>

                    {/* Milestone Tick Dot Container */}
                    <Box
                      sx={{
                        position: "absolute",
                        right: 2, // Pinned so dot center is at exactly right: 12px (matches track at right: 11px with width: 2, centered relative to outer capsule)
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "transform 0.2s ease",
                        "&:hover": {
                          transform: "scale(1.2)",
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: isMerged
                            ? colors.accent.orange || "#ff9800"
                            : hasMultipleBranches
                            ? "rgba(74, 158, 255, 0.8)"
                            : mode === "light"
                            ? "rgba(0, 0, 0, 0.2)"
                            : "rgba(255, 255, 255, 0.2)",
                          transition: "all 0.2s ease",
                        }}
                      />
                    </Box>
                  </Box>
                );

                return isTimelineHovered ? (
                  <Box key={userMsg.id}>{itemContent}</Box>
                ) : (
                  <Tooltip
                    key={userMsg.id}
                    title={tooltipLabel}
                    placement="left"
                    arrow
                  >
                    <Box>{itemContent}</Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>

          {/* Scroll Down Arrow */}
          <IconButton
            onClick={() => {
              if (chatContainerRef.current) {
                startProgrammaticScroll(() => {
                  chatContainerRef.current.scrollTo({
                    top: chatContainerRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                });
              }
            }}
            size="small"
            sx={{
              alignSelf: "flex-end",
              mr: "6px",
              width: 20,
              height: 20,
              opacity: isTimelineHovered ? 0.7 : 0,
              pointerEvents: isTimelineHovered ? "auto" : "none",
              transition: "all 0.2s ease",
              color: colors.text.muted,
              "&:hover": {
                color: colors.accent.blue,
                opacity: 1,
                backgroundColor: mode === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              },
              mt: 0.5,
            }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      )}
    </Box>
  );
};

export default LinearChatView;
