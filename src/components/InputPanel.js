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
import StopIcon from "@mui/icons-material/Stop";
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
  language = "en",
  isGenerating = false,
  onStopGeneration,
}) => {
  const { components, colors, mode, radius } = useAppTheme();
  const fileInputRef = React.useRef(null);
  const isZh = language === "zh";
  const [isFocused, setIsFocused] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragCounterRef = React.useRef(0);
  const [localMessage, setLocalMessage] = React.useState(inputMessage || "");

  React.useEffect(() => {
    setLocalMessage(inputMessage || "");
  }, [inputMessage]);

  // Translation dictionary
  const t = {
    cancelMerge: isZh ? "取消合并" : "Cancel merge",
    mergeConfig: isZh ? "合并配置" : "Merge Configuration",
    contextStrategy: isZh ? "上下文综合策略" : "Context Synthesis Strategy",
    contextStrategyDesc: isZh 
      ? "针对多分支长对话进行上下文压缩与精简，防范 Token 溢出与注意力分散" 
      : "Compress & condense context for multi-branch long conversations to prevent token overflow & distraction",
    raw: isZh ? "完整对话" : "Raw History",
    rawTitle: isZh ? "直接完整拼接所有分支的对话历史" : "Directly concatenate full conversation history of all branches",
    milestones: isZh ? "核心里程碑" : "Milestones",
    milestonesTitle: isZh ? "仅保留首句提问与最终答案，隐藏中间多轮交谈步骤（推荐）" : "Keep only first prompt and final response, omitting intermediate steps (Recommended)",
    summary: isZh ? "浓缩摘要" : "Summary",
    summaryTitle: isZh ? "保留所有轮次，但自动截断各段回答长度" : "Keep all turns but automatically condense response lengths",
    branchDepth: isZh ? "分支合并深度配置" : "Individual Branch Depth",
    fullHistory: isZh ? "完整历史" : "Full History",
    latestMessage: isZh ? "仅最新消息" : "Latest Only",
    attachFiles: isZh ? "上传文件 (PDF, Word, Excel, 图片, 文本)" : "Attach files (PDF, Word, Excel, Images, Text)",
    webSearchEnabled: isZh ? "已启用联网搜索" : "Web search enabled",
    enableWebSearch: isZh ? "启用联网搜索" : "Enable web search",
    parsing: isZh ? "解析中..." : "Parsing...",
    error: isZh ? "错误" : "Error",
  };

  // Get vision support info for tooltip
  const visionSupport = getVisionSupport(selectedModel, modelsData);
  const getVisionTooltip = () => {
    switch (visionSupport) {
      case VISION_SUPPORT.SUPPORTED:
        return isZh ? "✓ 支持图片" : "✓ Supports images";
      case VISION_SUPPORT.NOT_SUPPORTED:
        return isZh ? "✗ 不支持图片" : "✗ Does not support images";
      case VISION_SUPPORT.UNKNOWN:
        return isZh ? "? 视觉支持未知" : "? Vision support unknown";
      default:
        return "";
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const processFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

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
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await processFiles(Array.from(files));

    // Clear input so same file can be selected again
    e.target.value = "";
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToUpload = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          filesToUpload.push(file);
        }
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      await processFiles(filesToUpload);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await processFiles(Array.from(files));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const isParsing = attachedFiles.some((f) => f.status === "parsing");
    if (isParsing) return; // Prevent submission while parsing is in progress

    if (localMessage.trim() || attachedFiles.length > 0) {
      onSubmit(localMessage.trim(), attachedFiles);
    }
  };

  const handleKeyDown = (e) => {
    // Enter without Shift submits the form
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const isParsing = attachedFiles.some((f) => f.status === "parsing");
      if (isParsing) return;

      if (localMessage.trim() || attachedFiles.length > 0) {
        onSubmit(localMessage.trim(), attachedFiles);
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
      return isZh ? "输入合并后的指令..." : "Enter your merge prompt...";
    }
    if (isRootSelected) {
      return isZh ? "开始新对话..." : "Start a new conversation...";
    }
    return isZh ? "在此输入以继续或分叉对话..." : "Continue or branch from selected node...";
  };

  const isParsingFiles = attachedFiles.some((f) => f.status === "parsing");

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        border: isDragging
          ? `2px dashed ${colors.accent.blue}`
          : isFocused
          ? isPendingMerge
            ? `1px solid ${colors.accent.orange}`
            : `1px solid ${colors.accent.blue}`
          : isPendingMerge
          ? `1px solid ${colors.accent.orange}`
          : `1px solid ${colors.border.primary}`,
        boxShadow: isDragging
          ? `0 0 16px rgba(74, 158, 255, 0.25)`
          : isFocused
          ? isPendingMerge
            ? `0 0 12px rgba(255, 152, 0, 0.2)`
            : `0 0 12px rgba(74, 158, 255, 0.15)`
          : isPendingMerge
          ? `0 0 12px rgba(255, 152, 0, 0.15)`
          : "none",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, border-style 0.2s ease",
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
                {t.mergeConfig}
              </Typography>
            </Box>
            <Tooltip title={t.cancelMerge}>
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
                {t.contextStrategy}
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.muted, fontSize: "0.68rem" }}>
                {t.contextStrategyDesc}
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
              <ToggleButton value="raw" title={t.rawTitle}>{isZh ? "完整对话 (Raw)" : "Raw History"}</ToggleButton>
              <ToggleButton value="milestones" title={t.milestonesTitle}>{isZh ? "核心里程碑 (Milestones)" : "Milestones"}</ToggleButton>
              <ToggleButton value="summary" title={t.summaryTitle}>{isZh ? "浓缩摘要 (Summary)" : "Summary"}</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider sx={{ borderColor: "rgba(255, 152, 0, 0.1)", borderStyle: "dashed" }} />

          {/* Individual Branch Selection */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: colors.text.muted, fontSize: "0.72rem" }}>
              {t.branchDepth}
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
                      <ToggleButton value="full">{isZh ? "∞ 完整历史" : "∞ Full"}</ToggleButton>
                      <ToggleButton value="single">{isZh ? "1 仅最新消息" : "1 Latest"}</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}

      {/* File attachment preview tiles (Claude-style) */}
      {attachedFiles.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 1.25,
            mb: 1.5,
            width: "100%",
          }}
        >
          {attachedFiles.map((file, idx) => {
            const isImage = file.type?.startsWith("image/");
            const isParsing = file.status === "parsing";
            const isError = file.status === "error";

            const cardBg = isError
              ? "rgba(244, 67, 54, 0.04)"
              : mode === "light"
              ? "rgba(0, 0, 0, 0.015)"
              : "rgba(255, 255, 255, 0.02)";
            const cardBorder = isError
              ? `1px solid ${colors.accent.error}`
              : isParsing
              ? `1px solid ${colors.accent.blue}`
              : `1px solid ${colors.border.secondary}`;

            const getFileExt = (name) => {
              const dotIdx = name.lastIndexOf(".");
              return dotIdx !== -1 ? name.substring(dotIdx + 1).toUpperCase() : "";
            };
            const ext = getFileExt(file.name);

            return (
              <Box
                key={file.id || idx}
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  p: 1,
                  borderRadius: radius.md,
                  backgroundColor: cardBg,
                  border: cardBorder,
                  transition: "all 0.2s ease",
                  minWidth: 0,
                  "&:hover": {
                    borderColor: isError ? colors.accent.error : colors.accent.blue,
                    backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)",
                    "& .delete-btn": {
                      opacity: 1,
                    },
                  },
                }}
              >
                {/* Left Thumbnail or Icon Box */}
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: radius.sm,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)",
                    flexShrink: 0,
                    position: "relative",
                    border: `1px solid ${colors.border.secondary}`,
                  }}
                >
                  {isParsing ? (
                    <CircularProgress size={14} thickness={5} sx={{ color: colors.accent.blue }} />
                  ) : isImage && file.dataUrl ? (
                    <img
                      src={file.dataUrl}
                      alt={file.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.62rem",
                        color: isError ? colors.accent.error : colors.accent.blue,
                        letterSpacing: "0.5px",
                      }}
                    >
                      {ext || "FILE"}
                    </Typography>
                  )}
                </Box>

                {/* File Details (Middle) */}
                <Box sx={{ minWidth: 0, flexGrow: 1, pr: 2 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: colors.text.primary,
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "0.75rem",
                      lineHeight: 1.2,
                    }}
                    title={file.name}
                  >
                    {file.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: isError ? colors.accent.error : colors.text.muted,
                      fontSize: "0.65rem",
                      display: "block",
                      mt: 0.25,
                      lineHeight: 1,
                    }}
                  >
                    {isParsing
                      ? t.parsing
                      : isError
                      ? t.error
                      : `${ext || file.type?.split("/")[1]?.toUpperCase() || "FILE"} • ${(file.size / 1024).toFixed(1)} KB`}
                  </Typography>
                </Box>

                {/* Close Button (Top Right) */}
                <IconButton
                  className="delete-btn"
                  size="small"
                  onClick={() => onRemoveAttachedFile?.(idx)}
                  sx={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    backgroundColor: colors.bg.primary,
                    border: `1px solid ${colors.border.primary}`,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    p: 0.25,
                    opacity: 0,
                    transition: "opacity 0.15s ease, background-color 0.15s ease",
                    "&:hover": {
                      backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.1)",
                    },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 9, color: colors.text.primary }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
        <Tooltip title={t.attachFiles}>
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
          value={localMessage}
          onChange={(e) => setLocalMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onInputChange?.(localMessage);
          }}
          fullWidth
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: "transparent",
              color: colors.text.primary,
              fontSize: "1rem",
              p: 0,
              py: 0.5,
              "& fieldset": { border: "none" },
              "&:hover fieldset": { border: "none" },
              "&.Mui-focused fieldset": { border: "none" },
            },
            "& .MuiInputBase-input::placeholder": { color: colors.text.muted },
          }}
        />
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          modelsList={modelsList}
          language={language}
          visionTooltip={getVisionTooltip()}
        />
        <Tooltip
          title={webSearchEnabled ? t.webSearchEnabled : t.enableWebSearch}
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
        {isGenerating ? (
          <IconButton
            type="button"
            onClick={onStopGeneration}
            sx={{
              ...components.buttonPrimary,
              color: colors.accent.orange,
              "&:hover": {
                backgroundColor: mode === "light" ? "rgba(224, 123, 0, 0.08)" : "rgba(255, 152, 0, 0.1)",
              },
            }}
          >
            <StopIcon fontSize="small" />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            disabled={isParsingFiles || (!localMessage.trim() && attachedFiles.length === 0)}
            sx={components.buttonPrimary}
          >
            <KeyboardReturnIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Paper>
  );
};

export default InputPanel;
