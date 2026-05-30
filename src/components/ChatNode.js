"use client";
import React, { memo, useState } from "react";
import { Handle, Position } from "reactflow";
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  TextField,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import MergeIcon from "@mui/icons-material/CallMerge";
import RefreshIcon from "@mui/icons-material/Refresh";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { useAppTheme } from "../styles/ThemeContext";
import { renderMessageContent, getDisplayContent } from "../utils/treeUtils";

const ChatNode = ({ id, data, selected }) => {
  const { colors, components, radius } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editUserMessage, setEditUserMessage] = useState("");

  const isLoading = data.status === "loading";
  const isRoot = data.isRoot;
  const isMergeSource = data.isMergeSource;
  const isMergedNode = data.isMergedNode;

  const handleStartEdit = (e) => {
    e.stopPropagation();
    const firstUserMsg = getDisplayContent((data.messages && data.messages[0]?.content) || data.userMessage || "");
    setEditUserMessage(firstUserMsg);
    setIsEditing(true);
  };

  const handleSaveEdit = (e) => {
    e.stopPropagation();
    data.onEditNode?.(id, editUserMessage, 0);
    setIsEditing(false);
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    data.onDeleteNode?.(id);
  };

  const handleMerge = (e) => {
    e.stopPropagation();
    data.onMergeNode?.(id, false);
  };

  const handleMergeDoubleClick = (e) => {
    e.stopPropagation();
    data.onMergeNode?.(id, true);
  };

  const handleRegenerateMerge = (e) => {
    e.stopPropagation();
    data.onRegenerateMerge?.(id);
  };

  const mergeSelectionCount = data.mergeSelectionCount || 0;

  // Truncate function
  const truncate = (str, len = 25) => {
    if (!str) return "";
    return str.length > len ? str.substring(0, len) + "..." : str;
  };

  const isZh = data.language === "zh";

  // Tooltip content
  const tooltipTitle = (
    <Box sx={{ p: 0.5 }}>
      {isRoot ? (
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, color: colors.accent.blue, display: "block", mb: 0.25 }}>
            {data.title || (isZh ? "对话树节点" : "ChatTree Node")}
          </Typography>
          <Typography variant="caption" sx={{ fontStyle: "italic", color: colors.text.muted, fontSize: "0.72rem", display: "block" }}>
            {isZh ? "对话开始" : "Start of conversation"}
          </Typography>
        </Box>
      ) : data.messages && Array.isArray(data.messages) ? (
        data.messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <Box key={idx} sx={{ mb: idx === data.messages.length - 1 ? 0 : 1 }}>
              <Typography
                variant="caption"
                sx={{
                  color: isUser ? colors.accent.userLabel : colors.accent.green,
                  fontWeight: "bold",
                  display: "block",
                  fontSize: "0.7rem",
                }}
              >
                {isUser ? (isZh ? "用户" : "User") : `${isZh ? "助手" : "Assistant"} (${msg.model || data.model})`}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.text.primary,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.75rem",
                  display: "block",
                }}
              >
                {getDisplayContent(msg.content) || (msg.role === "assistant" && data.status === "loading" ? (isZh ? "生成中..." : "Generating...") : "")}
              </Typography>
            </Box>
          );
        })
      ) : (
        <>
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ color: colors.accent.userLabel, fontWeight: "bold", display: "block", fontSize: "0.7rem" }}>
              {isZh ? "用户" : "User"}
            </Typography>
            <Typography variant="caption" sx={{ color: colors.text.primary, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem", display: "block" }}>
              {data.userMessage}
            </Typography>
          </Box>
          {data.assistantMessage && (
            <Box>
              <Typography variant="caption" sx={{ color: colors.accent.green, fontWeight: "bold", display: "block", fontSize: "0.7rem" }}>
                {isZh ? "助手" : "Assistant"} ({data.model})
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.primary, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem", display: "block" }}>
                {data.assistantMessage}
              </Typography>
            </Box>
          )}
        </>
      )}
    </Box>
  );

  return (
    <Tooltip
      title={tooltipTitle}
      placement="right"
      arrow
      slotProps={{
        tooltip: {
          sx: {
            backgroundColor: colors.bg.secondary,
            border: `1px solid ${colors.border.primary}`,
            color: colors.text.primary,
            boxShadow: "var(--shadow-lg)",
            maxWidth: 240,
            maxHeight: 150,
            overflowY: "auto",
            p: 1.5,
            "&::-webkit-scrollbar": {
              width: "4px",
            },
            "&::-webkit-scrollbar-track": {
              background: "transparent",
            },
            "&::-webkit-scrollbar-thumb": {
              background: colors.border.primary,
              borderRadius: radius.xs,
            },
            "&::-webkit-scrollbar-thumb:hover": {
              background: colors.text.muted,
            },
          },
        },
        arrow: {
          sx: {
            color: colors.bg.secondary,
            "&::before": {
              borderColor: colors.border.primary,
              backgroundColor: colors.bg.secondary,
            },
          },
        },
      }}
    >
      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        sx={{
          position: "relative",
          width: 140,
          height: 52,
          backgroundColor: selected ? colors.bg.tertiary : colors.bg.secondary,
          border: isMergeSource
            ? `2px solid ${colors.accent.orange}`
            : selected
            ? `2px solid ${colors.accent.blue}`
            : `1px solid ${colors.border.primary}`,
          borderRadius: radius.xl,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          px: 1,
          py: 0.5,
          boxSizing: "border-box",
          cursor: "pointer",
          transition: "all 0.2s ease",
          "&:hover": {
            borderColor: isMergeSource
              ? colors.accent.orangeHover
              : colors.text.muted,
          },
        }}
      >
        {/* Input handle (top) - not for root */}
        {!isRoot && (
          <Handle
            type="target"
            position={Position.Top}
            style={{
              background: colors.accent.blue,
              width: 8,
              height: 8,
              border: "none",
            }}
          />
        )}

        {/* Action buttons on hover, absolute positioned above */}
        {(hovered || selected) && !isRoot && (
          <Box
            sx={{
              position: "absolute",
              top: -26,
              right: 0,
              display: "flex",
              gap: 0.5,
              zIndex: 10,
              backgroundColor: colors.bg.secondary,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: radius.sm,
              p: 0.25,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <Tooltip title={isZh ? (isMergedNode ? "编辑合并提示词" : "编辑消息") : (isMergedNode ? "Edit merge prompt" : "Edit message")}>
              <IconButton
                size="small"
                onClick={handleStartEdit}
                sx={{ ...components.iconButton, width: 20, height: 20 }}
              >
                <EditIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
            {isMergedNode && !isLoading && (
              <Tooltip title={isZh ? "重新生成合并" : "Regenerate merge"}>
                <IconButton
                  size="small"
                  onClick={handleRegenerateMerge}
                  sx={{
                    backgroundColor: colors.accent.orange,
                    color: colors.text.primary,
                    width: 20,
                    height: 20,
                    "&:hover": { backgroundColor: colors.accent.orangeHover },
                  }}
                >
                  <RefreshIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            )}
            {!isLoading && (
              <Tooltip
                title={
                  isMergeSource && mergeSelectionCount >= 2
                    ? (isZh ? "双击以合并" : "Double-click to merge")
                    : (isZh ? "加入合并选择" : "Add to merge selection")
                }
              >
                <IconButton
                  size="small"
                  onClick={handleMerge}
                  onDoubleClick={handleMergeDoubleClick}
                  sx={{
                    ...components.iconButton,
                    width: 20,
                    height: 20,
                    ...(isMergeSource && {
                      backgroundColor: colors.accent.orange,
                      "&:hover": { backgroundColor: colors.accent.orangeHover },
                    }),
                  }}
                >
                  <MergeIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={isZh ? "删除节点" : "Delete node"}>
              <IconButton
                size="small"
                onClick={handleDelete}
                sx={{ ...components.iconButtonDanger, width: 20, height: 20 }}
              >
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Node Content */}
        {isRoot ? (
          <Typography
            variant="caption"
            sx={{
              color: colors.text.primary,
              fontWeight: 600,
              textAlign: "center",
              fontSize: "0.75rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data.title || getDisplayContent(data.messages && data.messages[0]?.content) || getDisplayContent(data.userMessage) || (isZh ? "根节点" : "Root Node")}
          </Typography>
        ) : (() => {
          const hasFiles = data.messages?.some(m => m.files && m.files.length > 0);
          const fileNames = data.messages?.flatMap(m => m.files || []).map(f => f.name).join(", ");
          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.1, width: "100%", overflow: "hidden" }}>
              <Typography
                variant="caption"
                sx={{
                  color: colors.text.primary,
                  fontWeight: 600,
                  fontSize: "0.72rem",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {truncate(data.title || getDisplayContent(data.messages && data.messages[0]?.content) || getDisplayContent(data.userMessage) || (isZh ? "新分支" : "New Branch"), 14)}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.25 }}>
                {isLoading ? (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <CircularProgress size={10} sx={{ color: colors.accent.blue }} />
                    <Typography variant="caption" sx={{ color: colors.text.muted, fontSize: "0.62rem" }}>
                      {isZh ? "生成中..." : "Generating..."}
                    </Typography>
                  </Box>
                ) : (
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.accent.green,
                      fontSize: "0.62rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "70%",
                    }}
                  >
                    {data.model || (isZh ? "助手" : "Assistant")}
                  </Typography>
                )}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                  {hasFiles && (
                    <Tooltip title={isZh ? `已附带文件: ${fileNames}` : `Attached: ${fileNames}`}>
                      <AttachFileIcon sx={{ fontSize: 10, color: colors.text.muted }} />
                    </Tooltip>
                  )}
                  {isMergedNode && (
                    <MergeIcon sx={{ fontSize: 10, color: colors.accent.orange }} />
                  )}
                </Box>
              </Box>
            </Box>
          );
        })()}

        {/* Add branch button underneath */}
        {(hovered || selected) && !isLoading && (
          <Box
            sx={{
              position: "absolute",
              bottom: -12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
            }}
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                data.onAddBranch?.(id);
              }}
              sx={{
                ...components.buttonPrimary,
                width: 20,
                height: 20,
                backgroundColor: colors.bg.secondary,
                border: `1px solid ${colors.border.primary}`,
                "&:hover": {
                  backgroundColor: colors.bg.hover,
                },
              }}
            >
              <AddIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Box>
        )}

        {/* Output handle (bottom) */}
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: colors.accent.blue,
            width: 8,
            height: 8,
            border: "none",
          }}
        />

        {/* Edit Dialog */}
        <Dialog
          open={isEditing}
          onClose={handleCancelEdit}
          onClick={(e) => e.stopPropagation()}
          PaperProps={{
            sx: {
              backgroundColor: colors.bg.secondary,
              border: `1px solid ${colors.border.primary}`,
              color: colors.text.primary,
              minWidth: 320,
            },
          }}
        >
          <DialogTitle sx={{ pb: 1, fontSize: "0.95rem", fontWeight: 600 }}>
            {isZh ? (isMergedNode ? "编辑合并提示词" : "编辑消息") : (isMergedNode ? "Edit Merge Prompt" : "Edit Message")}
          </DialogTitle>
          <DialogContent sx={{ py: 1 }}>
            <TextField
              value={editUserMessage}
              onChange={(e) => setEditUserMessage(e.target.value)}
              multiline
              minRows={3}
              maxRows={6}
              fullWidth
              variant="outlined"
              size="small"
              autoFocus
              sx={components.textField}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button size="small" onClick={handleCancelEdit} sx={{ color: colors.text.muted }}>
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              size="small"
              onClick={handleSaveEdit}
              variant="contained"
              sx={{
                backgroundColor: colors.accent.blue,
                color: "#fff",
                "&:hover": { backgroundColor: colors.accent.blueHover },
              }}
            >
              {isZh ? "保存" : "Save"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Tooltip>
  );
};

export default memo(ChatNode);

