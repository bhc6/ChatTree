"use client";
import React, { useState, useMemo } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  Paper,
  Typography,
  Box,
  Button,
  IconButton,
  Collapse,
  List,
  Divider,
  TextField,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudIcon from "@mui/icons-material/Cloud";
import ShareIcon from "@mui/icons-material/Share";
import GitHubIcon from "@mui/icons-material/GitHub";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import DraggableChatItem from "./DraggableChatItem";
import { useAppTheme } from "../styles/ThemeContext";
import { renderMessageContent } from "../utils/treeUtils";

const InfoPanel = ({
  chatsList,
  activeChatId,
  focusedChatId,
  activeGroupId,
  onCreateNewChat,
  onSwitchChat,
  onFocusChatInGroup,
  onDeleteChat,
  onOpenSettings,
  onOpenWaitlist,
  onShareChat,
  onMoveChat,
  onMergeChats,
  mergeMode,
  onCancelMerge,
  onConfirmMerge,
  conversationHistoryLength,
  language = "en",
  historyExpanded = true,
  onToggleLanguage,
}) => {
  const { colors, components, typography } = useAppTheme();
  const [chatsExpanded, setChatsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const mergeSelectionCount = mergeMode?.selectedNodeIds?.length || 0;

  const filteredChatsList = useMemo(() => {
    if (!searchQuery.trim()) {
      return chatsList;
    }

    const query = searchQuery.toLowerCase().trim();

    return chatsList.filter((chat) => {
      // 1. Check chat name
      if (chat.name && chat.name.toLowerCase().includes(query)) {
        return true;
      }

      // 2. Check message contents in localStorage
      if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem(`chattree-${chat.id}`);
          if (saved) {
            const chatState = JSON.parse(saved);
            if (chatState && chatState.nodes && Array.isArray(chatState.nodes)) {
              for (const node of chatState.nodes) {
                // Check node title
                if (node.data?.title && node.data.title.toLowerCase().includes(query)) {
                  return true;
                }
                // Check legacy messages
                if (node.data?.userMessage && node.data.userMessage.toLowerCase().includes(query)) {
                  return true;
                }
                if (node.data?.assistantMessage && node.data.assistantMessage.toLowerCase().includes(query)) {
                  return true;
                }
                // Check messages array
                if (node.data?.messages && Array.isArray(node.data.messages)) {
                  for (const msg of node.data.messages) {
                    const contentStr = renderMessageContent(msg.content);
                    if (contentStr && contentStr.toLowerCase().includes(query)) {
                      return true;
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse chat state for search:", e);
        }
      }

      return false;
    });
  }, [chatsList, searchQuery]);

  // Organize chats into groups and ungrouped items
  // Groups are displayed with their members indented
  const organizedChats = useMemo(() => {
    const groups = {};
    const ungrouped = [];

    filteredChatsList.forEach((chat) => {
      if (chat.groupId) {
        if (!groups[chat.groupId]) {
          groups[chat.groupId] = [];
        }
        groups[chat.groupId].push(chat);
      } else {
        ungrouped.push(chat);
      }
    });

    // Sort each group by order
    Object.values(groups).forEach((group) => {
      group.sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    // If a "group" has only 1 member, treat it as ungrouped in the UI.
    // (This can happen after deleting a chat from a group.)
    Object.entries(groups).forEach(([groupId, members]) => {
      if (members.length < 2) {
        members.forEach((chat) => ungrouped.push(chat));
        delete groups[groupId];
      }
    });

    // Sort ungrouped by order
    ungrouped.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Build final list - groups first, then ungrouped
    const result = [];
    let flatIndex = 0;

    // Add group items
    const groupEntries = Object.entries(groups);
    groupEntries.forEach(([groupId, members], groupIndex) => {
      members.forEach((chat) => {
        result.push({
          kind: "chat",
          ...chat,
          isGrouped: true,
          groupId,
          flatIndex: flatIndex++,
        });
      });

      // Minimal dashed separator between groups, and between grouped + ungrouped.
      const hasMoreGroups = groupIndex < groupEntries.length - 1;
      const hasUngrouped = ungrouped.length > 0;
      if (hasMoreGroups || hasUngrouped) {
        result.push({
          kind: "separator",
          id: hasMoreGroups ? `sep-after-${groupId}` : "sep-grouped-ungrouped",
        });
      }
    });

    // Add ungrouped items
    ungrouped.forEach((chat) => {
      result.push({
        kind: "chat",
        ...chat,
        isGrouped: false,
        flatIndex: flatIndex++,
      });
    });

    return result;
  }, [filteredChatsList]);

  const handleSelectChat = (chat) => {
    if (activeGroupId && chat.groupId === activeGroupId && onFocusChatInGroup) {
      onFocusChatInGroup(chat.id);
      return;
    }
    onSwitchChat(chat.id);
  };

  return (
    <Paper
      sx={{
        ...components.panel,
        border: mergeMode
          ? `1px solid ${colors.accent.orange}`
          : `1px solid ${colors.border.primary}`,
        width: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header with settings */}
      <Box
        sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="subtitle2" sx={{ color: colors.accent.blue }}>
            ChatTree
          </Typography>
          <IconButton
            size="small"
            component="a"
            href="https://github.com/yourusername/ChatTree"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              ...components.iconButtonMuted,
              p: 0.25,
            }}
            title="View on GitHub"
          >
            <GitHubIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={onShareChat}
            sx={components.iconButtonMuted}
            title="Share Chat"
          >
            <ShareIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={onOpenWaitlist}
            sx={components.iconButtonMuted}
            title="Sync to Cloud (Coming Soon)"
          >
            <CloudIcon fontSize="small" />
          </IconButton>

          <IconButton
            size="small"
            onClick={onOpenSettings}
            sx={components.iconButtonMuted}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Collapse in={historyExpanded}>
        <Divider sx={components.divider} />

        {/* Search Input */}
      <Box sx={{ px: 1.5, py: 1 }}>
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === "zh" ? "搜索对话历史..." : "Search chat history..."}
          variant="outlined"
          size="small"
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <SearchIcon sx={{ color: colors.text.muted, fontSize: 16, mr: 1 }} />
              ),
              endAdornment: searchQuery && (
                <IconButton
                  size="small"
                  onClick={() => setSearchQuery("")}
                  sx={{ p: 0.25, color: colors.text.muted }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              ),
            },
          }}
          sx={{
            ...components.textField,
            "& .MuiOutlinedInput-root": {
              ...components.textField["& .MuiOutlinedInput-root"],
              borderRadius: "8px",
              py: 0.25,
            },
          }}
        />
      </Box>

      <Divider sx={components.divider} />

      {/* Collapsible Chats section */}
      <Box sx={{ p: 1 }}>
        <Box
          onClick={() => setChatsExpanded(!chatsExpanded)}
          sx={{
            ...components.hoverBox,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            py: 0.5,
            px: 0.5,
            mx: -0.5,
          }}
        >
          <Typography variant="caption" sx={typography.muted}>
            Chats
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onCreateNewChat();
              }}
              sx={{ color: colors.accent.blue, p: 0.25 }}
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
            {chatsExpanded ? (
              <ExpandLessIcon sx={{ fontSize: 16, color: colors.text.muted }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 16, color: colors.text.muted }} />
            )}
          </Box>
        </Box>
        <Collapse in={chatsExpanded}>
          <DndProvider backend={HTML5Backend}>
            <List dense sx={{ py: 0.5, maxHeight: 200, overflow: "auto" }}>
              {organizedChats.map((item) => {
                if (item.kind === "separator") {
                  return (
                    <Divider
                      key={item.id}
                      component="li"
                      sx={{
                        borderColor: colors.border.primary,
                        borderStyle: "dashed",
                        opacity: 0.35,
                        my: 0.5,
                        mx: 1,
                      }}
                    />
                  );
                }

                return (
                  <DraggableChatItem
                    key={item.id}
                    chat={item}
                    index={item.flatIndex}
                    isActive={
                      activeGroupId && item.groupId === activeGroupId
                        ? item.id === focusedChatId
                        : item.id === activeChatId
                    }
                    isGrouped={item.isGrouped}
                    canDelete={chatsList.length > 1}
                    onSwitchChat={() => handleSelectChat(item)}
                    onDeleteChat={onDeleteChat}
                    onMoveChat={onMoveChat}
                    onMergeChats={onMergeChats}
                  />
                );
              })}
            </List>
          </DndProvider>
        </Collapse>
      </Box>

      <Divider sx={components.divider} />

      {/* Info section - always visible */}
      <Box sx={{ p: 1.5 }}>
        {mergeMode ? (
          <>
            <Typography
              variant="caption"
              sx={{
                color: colors.accent.orange,
                display: "block",
                fontWeight: 500,
              }}
            >
              🔀 Merge Mode ({mergeSelectionCount} nodes selected)
            </Typography>
            <Typography
              variant="caption"
              sx={{ ...typography.muted, display: "block", mt: 0.5 }}
            >
              {mergeSelectionCount < 2
                ? "Click more nodes to add to selection"
                : "Click Merge or double-click a node merge icon to confirm"}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
              <Button
                size="small"
                onClick={onCancelMerge}
                sx={{
                  color: colors.accent.orange,
                  borderColor: colors.accent.orange,
                  "&:hover": {
                    borderColor: colors.accent.orangeHover,
                    backgroundColor: "rgba(255,152,0,0.1)",
                  },
                }}
                variant="outlined"
              >
                Cancel
              </Button>
              <Button
                size="small"
                onClick={onConfirmMerge}
                disabled={mergeSelectionCount < 2}
                sx={{
                  color: colors.text.primary,
                  backgroundColor: colors.accent.orange,
                  "&:hover": {
                    backgroundColor: colors.accent.orangeHover,
                  },
                  "&.Mui-disabled": {
                    color: colors.text.muted,
                    backgroundColor: "rgba(255,255,255,0.06)",
                  },
                }}
                variant="contained"
              >
                Merge
              </Button>
            </Box>
          </>
        ) : (
          <Typography
            variant="caption"
            sx={{ ...typography.muted, display: "block" }}
          >
            (+) branch • Edit/Delete on hover • Merge icon to combine
          </Typography>
        )}
        {conversationHistoryLength > 0 && (
          <Typography
            variant="caption"
            sx={{ ...typography.dim, display: "block", mt: 0.5 }}
          >
            Context: {conversationHistoryLength} messages
          </Typography>
        )}
      </Box>
    </Collapse>
  </Paper>
  );
};

export default InfoPanel;
