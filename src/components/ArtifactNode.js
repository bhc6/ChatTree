"use client";
import React, { memo, useState } from "react";
import { Handle, Position } from "reactflow";
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ImageIcon from "@mui/icons-material/Image";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import MergeIcon from "@mui/icons-material/CallMerge";
import { useAppTheme } from "../styles/ThemeContext";

const ArtifactNode = ({ id, data, selected }) => {
  const { colors, components, radius } = useAppTheme();
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");

  const isImage = data.artifactType === "image";
  const isMergeSource = data.isMergeSource;
  const mergeSelectionCount = data.mergeSelectionCount || 0;

  const handleStartEdit = (e) => {
    e.stopPropagation();
    setEditName(data.name || "");
    setEditContent(data.content || "");
    setIsEditing(true);
  };

  const handleSaveEdit = (e) => {
    e.stopPropagation();
    data.onEditArtifact?.(id, { name: editName, content: editContent });
    setIsEditing(false);
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    data.onDeleteArtifact?.(id);
  };

  const handleMerge = (e) => {
    e.stopPropagation();
    data.onMergeNode?.(id, false);
  };

  const handleMergeDoubleClick = (e) => {
    e.stopPropagation();
    data.onMergeNode?.(id, true);
  };

  // Truncate function
  const truncate = (str, len = 20) => {
    if (!str) return "";
    return str.length > len ? str.substring(0, len) + "..." : str;
  };

  const isZh = data.language === "zh";

  // Tooltip content
  const tooltipTitle = (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="caption" sx={{ color: colors.accent.orange, fontWeight: "bold", display: "block", fontSize: "0.7rem" }}>
        {isZh ? "制品: " : "Artifact: "}{data.name || (isZh ? "未命名" : "Unnamed")} ({isZh ? (data.artifactType === "image" ? "图片" : "文本") : data.artifactType})
      </Typography>
      {isImage ? (
        <Box
          component="img"
          src={data.content}
          alt={data.name}
          sx={{
            maxWidth: "100%",
            maxHeight: 100,
            borderRadius: radius.sm,
            mt: 1,
            display: "block",
          }}
        />
      ) : (
        <Typography variant="caption" sx={{ color: colors.text.primary, whiteSpace: "pre-wrap", mt: 0.5, wordBreak: "break-word", fontSize: "0.75rem", display: "block" }}>
          {data.content}
        </Typography>
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
            ? `2px solid ${colors.accent.orange}`
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
            borderColor: colors.accent.orangeHover,
          },
        }}
      >
        {/* Action buttons on hover, absolute positioned above */}
        {(hovered || selected) && !isEditing && (
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
            {!isImage && (
              <Tooltip title={isZh ? "编辑制品" : "Edit artifact"}>
                <IconButton
                  size="small"
                  onClick={handleStartEdit}
                  sx={{ ...components.iconButton, width: 20, height: 20 }}
                >
                  <EditIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
            )}
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
            <Tooltip title={isZh ? "删除制品" : "Delete artifact"}>
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%", overflow: "hidden" }}>
          {isImage ? (
            <ImageIcon sx={{ fontSize: 16, color: colors.accent.orange, flexShrink: 0 }} />
          ) : (
            <TextFieldsIcon sx={{ fontSize: 16, color: colors.accent.orange, flexShrink: 0 }} />
          )}
          <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Typography
              variant="caption"
              sx={{
                color: colors.accent.orange,
                fontWeight: 600,
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {truncate(data.name || (isZh ? "制品" : "Artifact"), 12)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: colors.text.muted,
                fontSize: "0.62rem",
              }}
            >
              {isImage ? (isZh ? "图片制品" : "Image Artifact") : (isZh ? "文本制品" : "Text Artifact")}
            </Typography>
          </Box>
        </Box>

        {/* Output handle (bottom) */}
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: colors.accent.orange,
            width: 8,
            height: 8,
            border: "none",
          }}
        />

        {/* Edit Dialog */}
        {!isImage && (
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
              {isZh ? "编辑制品" : "Edit Artifact"}
            </DialogTitle>
            <DialogContent sx={{ py: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                label={isZh ? "制品名称" : "Artifact Name"}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                fullWidth
                variant="outlined"
                size="small"
                sx={components.textFieldWithLabel}
              />
              <TextField
                label={isZh ? "内容" : "Content"}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                multiline
                minRows={3}
                maxRows={6}
                fullWidth
                variant="outlined"
                size="small"
                sx={components.textFieldWithLabel}
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
                  backgroundColor: colors.accent.orange,
                  color: "#fff",
                  "&:hover": { backgroundColor: colors.accent.orangeHover },
                }}
              >
                {isZh ? "保存" : "Save"}
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </Box>
    </Tooltip>
  );
};

export default memo(ArtifactNode);
