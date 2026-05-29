"use client";
import React, { useState, useCallback } from "react";
import {
  Modal,
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  Divider,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useAppTheme } from "../styles/ThemeContext";
import { defaultModels } from "../utils/constants";
import PanScrollToggle from "./PanScrollToggle";
import LockScrollToggle from "./LockScrollToggle";

const SettingsModal = ({
  open,
  onClose,
  settings,
  onSave,
  modelsList,
  setModelsList,
  setModelsData,
  setSelectedModel,
}) => {
  const { colors, components, typography } = useAppTheme();
  const [tempSettings, setTempSettings] = useState({ ...settings });
  const [isLoadingModels, setIsLoadingLoadingModels] = useState(false);

  // Reset temp settings when modal opens
  React.useEffect(() => {
    if (open) {
      setTempSettings({ ...settings });
    }
  }, [open, settings]);

  // Fetch models from API
  const fetchModels = useCallback(async () => {
    setIsLoadingLoadingModels(true);
    try {
      const url = tempSettings.apiUrl || "https://api.openai.com/v1";

      const response = await fetch(`${url}/models`, {
        headers: tempSettings.apiKey
          ? { Authorization: `Bearer ${tempSettings.apiKey}` }
          : {},
      });

      if (!response.ok) {
        throw new Error("Failed to fetch models");
      }

      const data = await response.json();

      // Build models data map and list
      const modelsMap = {};
      const fetchedModels =
        data.data
          ?.filter(
            (m) =>
              m.id &&
              !m.id.includes("embedding") &&
              !m.id.includes("whisper") &&
              !m.id.includes("tts") &&
              !m.id.includes("dall-e")
          )
          ?.map((m) => {
            modelsMap[m.id] = m;
            return m.id;
          })
          ?.sort() || [];

      if (fetchedModels.length > 0) {
        setModelsList(fetchedModels);
        setModelsData?.(modelsMap);
        setSelectedModel((current) =>
          fetchedModels.includes(current) ? current : fetchedModels[0]
        );
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
    } finally {
      setIsLoadingLoadingModels(false);
    }
  }, [tempSettings, setModelsList, setModelsData, setSelectedModel]);

  const handleSave = () => {
    onSave(tempSettings);
    onClose();
  };

  const isLight = tempSettings.themeMode === "light";

  const segBtnSx = (active) => ({
    ...components.buttonSecondary,
    flex: 1,
    py: 0.5,
    backgroundColor: active ? colors.bg.hover : colors.bg.tertiary,
    borderColor: active ? colors.accent.blue : colors.border.secondary,
    color: active ? colors.accent.blue : colors.text.secondary,
    fontWeight: active ? 700 : 500,
  });

  return (
    <Modal open={open} onClose={onClose}>
      <Paper
        sx={{
          ...components.modal,
          width: "calc(100% - 32px)",
          maxWidth: 500,
        }}
      >
        <Typography variant="h6" sx={{ color: colors.text.primary, mb: 2 }}>
          Settings / 设置
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="API Key / API密钥"
            type="password"
            className="ph-no-capture"
            value={tempSettings.apiKey}
            onChange={(e) =>
              setTempSettings({ ...tempSettings, apiKey: e.target.value })
            }
            placeholder="sk-... (required)"
            fullWidth
            size="small"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            sx={components.textFieldWithLabel}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={tempSettings.saveApiKey}
                onChange={(e) =>
                  setTempSettings({
                    ...tempSettings,
                    saveApiKey: e.target.checked,
                  })
                }
                sx={components.checkbox}
              />
            }
            label={
              <Typography variant="body2" sx={typography.secondary}>
                🙈 Save API key in browser / 保存密钥在浏览器
              </Typography>
            }
          />
          <Typography variant="caption" sx={typography.dim}>
            Your API key is stored locally in your browser and sent directly to
            the provider. We never see or store your key on any server.
            <br />
            您的API密钥储存在本地浏览器中，直接发送给服务商。我们不会在服务器端保存或获取您的密钥。
          </Typography>
          <Box
            sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 1 }}
          >
            <TextField
              label="OpenAI Compatible URL / API地址"
              className="ph-no-capture"
              value={tempSettings.apiUrl}
              onChange={(e) =>
                setTempSettings({ ...tempSettings, apiUrl: e.target.value })
              }
              placeholder="https://api.openai.com/v1 (leave empty for default)"
              fullWidth
              size="small"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              sx={components.textFieldWithLabel}
            />
            <IconButton
              onClick={fetchModels}
              disabled={isLoadingModels}
              sx={{
                mt: 0.5,
                color: colors.text.muted,
                "&:hover": {
                  backgroundColor: "rgba(128, 128, 128, 0.1)",
                  color: colors.text.primary,
                },
                "&.Mui-disabled": { color: colors.text.dim },
                animation: isLoadingModels ? "spin 1s linear infinite" : "none",
                "@keyframes spin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              }}
              title="Fetch models from API / 获取可用模型"
            >
              <SyncIcon />
            </IconButton>
          </Box>
          {modelsList.length > 0 && modelsList !== defaultModels && (
            <Typography variant="caption" sx={typography.accent}>
              ✓ Loaded {modelsList.length} models / 已加载 {modelsList.length} 个模型
            </Typography>
          )}

          <Divider sx={{ borderColor: colors.border.secondary, my: 1 }} />

          {/* ── Theme ── */}
          <Typography variant="subtitle2" sx={{ color: colors.text.primary }}>
            Appearance / 外观
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              size="small"
              startIcon={<DarkModeIcon sx={{ fontSize: 15 }} />}
              onClick={() => setTempSettings({ ...tempSettings, themeMode: "dark" })}
              sx={segBtnSx(!isLight)}
            >
              Dark / 深色
            </Button>
            <Button
              size="small"
              startIcon={<LightModeIcon sx={{ fontSize: 15 }} />}
              onClick={() => setTempSettings({ ...tempSettings, themeMode: "light" })}
              sx={segBtnSx(isLight)}
            >
              Light / 浅色
            </Button>
          </Box>

          <Divider sx={{ borderColor: colors.border.secondary, my: 1 }} />

          {/* ── Language ── */}
          <Typography variant="subtitle2" sx={{ color: colors.text.primary }}>
            Language / 语言
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              size="small"
              onClick={() => setTempSettings({ ...tempSettings, language: "en" })}
              sx={segBtnSx(tempSettings.language !== "zh")}
            >
              English
            </Button>
            <Button
              size="small"
              onClick={() => setTempSettings({ ...tempSettings, language: "zh" })}
              sx={segBtnSx(tempSettings.language === "zh")}
            >
              简体中文
            </Button>
          </Box>

          <Divider sx={{ borderColor: colors.border.secondary, my: 1 }} />

          {/* ── Canvas Controls ── */}
          <Typography variant="subtitle2" sx={{ color: colors.text.primary }}>
            Canvas Controls / 画布控制
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PanScrollToggle
              panOnScroll={tempSettings.panOnScroll !== false}
              onToggle={() =>
                setTempSettings({
                  ...tempSettings,
                  panOnScroll: !tempSettings.panOnScroll,
                })
              }
            />
            <Typography variant="body2" sx={typography.secondary}>
              {tempSettings.panOnScroll !== false
                ? "Scroll set to pan / 滚轮拖拽画布"
                : "Scroll set to zoom / 滚轮缩放画布"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <LockScrollToggle
              locked={tempSettings.lockScrollOnNodeFocus || false}
              onToggle={() =>
                setTempSettings({
                  ...tempSettings,
                  lockScrollOnNodeFocus: !tempSettings.lockScrollOnNodeFocus,
                })
              }
            />
            <Typography variant="body2" sx={typography.secondary}>
              {tempSettings.lockScrollOnNodeFocus
                ? "Lock scroll on node hover / 鼠标悬浮节点锁定滚轮"
                : "Scroll passes through nodes / 滚轮穿透节点"}
            </Typography>
          </Box>

          <Divider sx={{ borderColor: colors.border.secondary, my: 1 }} />

          <Typography
            component="a"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{
              color: colors.text.muted,
              textDecoration: "underline",
              "&:hover": { color: colors.accent.blue },
            }}
          >
            Privacy Policy / 隐私政策
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              justifyContent: "flex-end",
              mt: 1,
            }}
          >
            <Button onClick={onClose} sx={components.buttonSecondary}>
              Cancel / 取消
            </Button>
            <Button onClick={handleSave} sx={components.buttonSecondary}>
              Save / 保存
            </Button>
          </Box>
        </Box>
      </Paper>
    </Modal>
  );
};

export default SettingsModal;
