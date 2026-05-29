"use client";
import React from "react";
import {
  Paper,
  TextField,
  IconButton,
  Chip,
  Box,
  Tooltip,
  CircularProgress,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
} from "@mui/material";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import CloseIcon from "@mui/icons-material/Close";
import MergeIcon from "@mui/icons-material/CallMerge";
import LanguageIcon from "@mui/icons-material/Language";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ImageIcon from "@mui/icons-material/Image";
import { useAppTheme } from "../styles/ThemeContext";
import ModelSelector from "./ModelSelector";
import { getVisionSupport, VISION_SUPPORT } from "../utils/visionModels";
import { parseFile } from "../utils/fileParser";

const MAX_ROWS = 12;

const InputPanel = ({
  inputMessage,
  onInputChange,
  onSubmit,
  selectedModel,
  onModelChange,
  modelsList,
  modelsData,
  isRootSelected,
  isPendingMerge,
  pendingMerge,
  onUpdatePendingMerge,
  onCancelPendingMerge,
  webSearchEnabled,
  onWebSearchToggle,
  attachedFiles = [],
  onAddAttachedFile,
  onRemoveAttachedFile,
  setAttachedFiles,
}) => {
  const { components, colors, mode, radius } = useAppTheme();
  const fileInputRef = React.useRef(null);

  // Get vision support info for tooltip
  const visionSupport = getVisionSupport(selectedModel, modelsData);
  const getVisionTooltip = () => {
    switch (visionSupport) {
      case VISION_SUPPORT.SUPPORTED:
        return "✓ Supports images";
      case VISION_SUPPORT.NOT_SUPPORTED:
        return "✗ Does not support images";
      case VISION_SUPPORT.UNKNOWN:
        return "? Vision support unknown";
      default:
        return "";
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);

    // 1. Create file objects with parsing status and add them to the parent state
    const initialFiles = fileList.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      status: "parsing",
    }));

    initialFiles.forEach((fileObj) => onAddAttachedFile?.(fileObj));

    // 2. Parse files asynchronously in the background and update their contents
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const initialObj = initialFiles[i];

      try {
        const parsed = await parseFile(file);
        setAttachedFiles?.((prev) =>
          prev.map((f) => (f.id === initialObj.id ? { ...f, ...parsed, status: "parsed" } : f))
        );
      } catch (err) {
        console.error("Failed to parse file:", err);
        setAttachedFiles?.((prev) =>
          prev.map((f) => (f.id === initialObj.id ? { ...f, status: "error", error: err.message } : f))
        );
      }
    }

    // Clear input so same file can be selected again
    e.target.value = "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const isParsing = attachedFiles.some((f) => f.status === "parsing");
    if (isParsing) return; // Prevent submission while parsing is in progress

    if (inputMessage.trim() || attachedFiles.length > 0) {
      onSubmit(inputMessage.trim(), attachedFiles);
    }
  };

  const handleKeyDown = (e) => {
    // Enter without Shift submits the form
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const isParsing = attachedFiles.some((f) => f.status === "parsing");
      if (isParsing) return;

      if (inputMessage.trim() || attachedFiles.length > 0) {
        onSubmit(inputMessage.trim(), attachedFiles);
      }
    }
    // Escape cancels pending merge
    if (e.key === "Escape" && isPendingMerge) {
      e.preventDefault();
      e.stopPropagation();
      onCancelPendingMerge?.();
    }
    // Shift+Enter allows default behavior (new line)
  };

  const getPlaceholder = () => {
    if (isPendingMerge) {
      return "Enter your merge prompt...";
    }
    if (isRootSelected) {
      return "Start a new conversation...";
    }
    return "Continue or branch from selected node...";
  };

  const isParsingFiles = attachedFiles.some((f) => f.status === "parsing");

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      sx={{
        ...components.panel,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 1.5,
        width: "100%",
        maxWidth: 850,
        mx: "auto",
        mb: 0,
      }}
    >
      {pendingMerge && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            p: 2,
            mb: 1,
            borderRadius: radius.xl,
            border: `1px solid ${colors.accent.orange}`,
            backgroundColor: "rgba(255, 152, 0, 0.04)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <MergeIcon sx={{ color: colors.accent.orange, fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: colors.text.primary, fontSize: "0.85rem" }}>
                合并配置 (Merge Configuration)
              </Typography>
            </Box>
            <Tooltip title="Cancel merge">
              <IconButton size="small" onClick={onCancelPendingMerge} sx={{ color: colors.text.muted, p: 0.5 }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <Divider sx={{ borderColor: "rgba(255, 152, 0, 0.15)" }} />

          {/* Global Strategy Selection */}
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box sx={{ mr: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: "block", color: colors.accent.orange, fontSize: "0.75rem" }}>
                上下文综合策略 (Context Synthesis Strategy)
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.muted, fontSize: "0.68rem" }}>
                针对多分支长对话进行上下文压缩与精简，防范 Token 溢出与注意力分散
              </Typography>
            </Box>
            <ToggleButtonGroup
              value={pendingMerge.globalMergeStrategy || "milestones"}
              exclusive
              onChange={(e, val) => {
                if (val && onUpdatePendingMerge) {
                  onUpdatePendingMerge({
                    ...pendingMerge,
                    globalMergeStrategy: val,
                  });
                }
              }}
              size="small"
              sx={{
                border: `1px solid rgba(255, 152, 0, 0.2)`,
                height: 28,
                "& .MuiToggleButton-root": {
                  color: colors.text.muted,
                  borderColor: "transparent",
                  fontSize: "0.68rem",
                  py: 0.25,
                  px: 1,
                  textTransform: "none",
                  "&.Mui-selected": {
                    backgroundColor: "rgba(255, 152, 0, 0.15)",
                    color: colors.accent.orange,
                    fontWeight: 600,
                  },
                  "&:hover": {
                    backgroundColor: "rgba(255, 152, 0, 0.08)",
                  }
                }
              }}
            >
              <ToggleButton value="raw" title="直接完整拼接所有分支的对话历史">完整对话 (Raw)</ToggleButton>
              <ToggleButton value="milestones" title="仅保留首句提问与最终答案，隐藏中间多轮交谈步骤（推荐）">核心里程碑 (Milestones)</ToggleButton>
              <ToggleButton value="summary" title="保留所有轮次，但自动截断各段回答长度">浓缩摘要 (Summary)</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider sx={{ borderColor: "rgba(255, 152, 0, 0.1)", borderStyle: "dashed" }} />

          {/* Individual Branch Selection */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: colors.text.muted, fontSize: "0.72rem" }}>
              分支合并深度配置 (Individual Branch Depth)
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {pendingMerge.branches?.map((branch) => {
                if (branch.isArtifact) return null;

                return (
                  <Box
                    key={branch.nodeId}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)",
                      borderRadius: radius.sm,
                      py: 0.5,
                      px: 1,
                      border: `1px solid ${colors.border.secondary}`,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: colors.text.primary,
                        fontSize: "0.72rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "60%",
                      }}
                      title={branch.label}
                    >
                      {branch.label}
                    </Typography>

                    <ToggleButtonGroup
                      value={branch.contextMode || "full"}
                      exclusive
                      onChange={(e, val) => {
                        if (val && onUpdatePendingMerge) {
                          onUpdatePendingMerge({
                            ...pendingMerge,
                            branches: pendingMerge.branches.map((b) =>
                              b.nodeId === branch.nodeId ? { ...b, contextMode: val } : b
                            ),
                          });
                        }
                      }}
                      size="small"
                      sx={{
                        height: 22,
                        "& .MuiToggleButton-root": {
                          fontSize: "0.62rem",
                          py: 0,
                          px: 0.75,
                          textTransform: "none",
                          color: colors.text.muted,
                          borderColor: colors.border.secondary,
                          "&.Mui-selected": {
                            backgroundColor: branch.contextMode === "full" ? "rgba(255, 152, 0, 0.15)" : (mode === "light" ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.08)"),
                            color: branch.contextMode === "full" ? colors.accent.orange : colors.text.primary,
                            fontWeight: 600,
                          },
                        },
                      }}
                    >
                      <ToggleButton value="full">∞ 完整历史 (Full)</ToggleButton>
                      <ToggleButton value="single">1 仅最新消息 (Latest)</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}

      {/* File attachment preview chips */}
      {attachedFiles.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
          {attachedFiles.map((file, idx) => {
            const isImage = file.type?.startsWith("image/");
            const isParsing = file.status === "parsing";
            const isError = file.status === "error";

            let icon = isImage ? <ImageIcon sx={{ fontSize: 14 }} /> : <AttachFileIcon sx={{ fontSize: 14 }} />;
            if (isParsing) {
              icon = <CircularProgress size={12} sx={{ color: colors.accent.blue }} />;
            } else if (isError) {
              icon = <CloseIcon sx={{ fontSize: 12, color: colors.accent.error }} />;
            }

            let label = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            if (isParsing) {
              label = `${file.name} (Parsing...)`;
            } else if (isError) {
              label = `${file.name} (Error)`;
            }

            return (
              <Chip
                key={file.id || idx}
                icon={icon}
                label={label}
                size="small"
                onDelete={() => onRemoveAttachedFile?.(idx)}
                deleteIcon={<CloseIcon sx={{ fontSize: 12 }} />}
                sx={{
                  backgroundColor: isError ? "rgba(244, 67, 54, 0.1)" : colors.bg.tertiary,
                  color: isError ? colors.accent.error : colors.text.primary,
                  border: `1px solid ${isError ? colors.accent.error : colors.border.secondary}`,
                  "& .MuiChip-icon": { color: isError ? colors.accent.error : colors.accent.blue },
                  "& .MuiChip-deleteIcon": {
                    color: colors.text.muted,
                    "&:hover": { color: colors.text.primary },
                  },
                }}
              />
            );
          })}
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
        <Tooltip title="Attach files (PDF, Word, Excel, Images, Text)">
          <IconButton
            onClick={triggerFileSelect}
            sx={components.iconButtonToggle.base}
          >
            <AttachFileIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept="image/*,text/*,.md,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.csv,.pdf,.docx,.xlsx,.xls"
          style={{ display: "none" }}
        />

        <TextField
          id="message-input"
          className="ph-no-capture"
          placeholder={getPlaceholder()}
          variant="outlined"
          size="small"
          multiline
          minRows={1}
          maxRows={MAX_ROWS}
          value={inputMessage}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          fullWidth
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          sx={components.textField}
        />
        <Tooltip title={getVisionTooltip()} arrow placement="top">
          <Box>
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              modelsList={modelsList}
            />
          </Box>
        </Tooltip>
        <Tooltip
          title={webSearchEnabled ? "Web search enabled" : "Enable web search"}
        >
          <IconButton
            onClick={onWebSearchToggle}
            sx={
              webSearchEnabled
                ? components.iconButtonToggle.active
                : components.iconButtonToggle.base
            }
          >
            <LanguageIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton
          type="submit"
          disabled={isParsingFiles || (!inputMessage.trim() && attachedFiles.length === 0)}
          sx={components.buttonPrimary}
        >
          <KeyboardReturnIcon fontSize="small" />
        </IconButton>
      </Box>
    </Paper>
  );
};

export default InputPanel;
