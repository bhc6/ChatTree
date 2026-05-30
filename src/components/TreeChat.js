"use client";
import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import ReactFlow, {
  Controls,
  ControlButton,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import { Box, Snackbar, Alert, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SettingsIcon from "@mui/icons-material/Settings";
import CloudIcon from "@mui/icons-material/Cloud";
import ShareIcon from "@mui/icons-material/Share";
import MenuIcon from "@mui/icons-material/Menu";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

// Components
// ... (omitting other imports for brevity but keeping line-by-line structure)
import ChatNode from "./ChatNode";
import ArtifactNode from "./ArtifactNode";
import MergeEdge from "./MergeEdge";
import SettingsModal from "./SettingsModal";
import WaitlistModal from "./WaitlistModal";
import InfoPanel from "./InfoPanel";
import InputPanel from "./InputPanel";
import PanScrollToggle from "./PanScrollToggle";
import LockScrollToggle from "./LockScrollToggle";
import LinearChatView from "./LinearChatView";

// Hooks
import { useChatApi } from "../hooks/useChatApi";
import {
  useChatManagement,
  TREE_HORIZONTAL_OFFSET,
} from "../hooks/useChatManagement";
import { useNodeOperations } from "../hooks/useNodeOperations";
import { useGroupedChats } from "../hooks/useGroupedChats";
import { useModels } from "../hooks/useModels";

// Utilities
import { AppThemeProvider, useAppTheme } from "../styles/ThemeContext";
import { initialNodes, initialEdges } from "../utils/constants";
import { getPathToNode, buildConversationFromPath, layoutTree } from "../utils/treeUtils";
import {
  loadChatState,
  saveChatState,
  loadSettings,
  saveSettings,
  loadChatsList,
  saveChatsList,
  generateChatId,
  setActiveChatId,
} from "../utils/storage";
import {
  generateShareUrl,
  getSharedChatFromUrl,
  clearShareHash,
} from "../utils/sharing";

const nodeTypes = {
  chatNode: ChatNode,
  artifactNode: ArtifactNode,
};

const edgeTypes = {
  mergeEdge: MergeEdge,
};

const TreeChatInner = () => {
  // Theme
  const { mode, colors, radius, components } = useAppTheme();

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chattree-history-expanded");
      return saved !== "false";
    }
    return true;
  });

  // Waitlist modal state
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  // Snackbar state
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // Pan on scroll state (true = scroll to pan, false = scroll to zoom)
  const [panOnScroll, setPanOnScroll] = useState(
    () => settings.panOnScroll !== false
  );

  // Lock scroll on node focus state
  const [lockScrollOnNodeFocus, setLockScrollOnNodeFocus] = useState(
    () => settings.lockScrollOnNodeFocus || false
  );

  // Web search toggle state
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // File uploads state
  const [attachedFiles, setAttachedFiles] = useState([]);
  const onAddAttachedFile = useCallback((file) => {
    setAttachedFiles((prev) => [...prev, file]);
  }, []);
  const onRemoveAttachedFile = useCallback((idx) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Merge state
  const [mergeMode, setMergeMode] = useState(null);
  const [pendingMerge, setPendingMerge] = useState(null);
  const [inputMessage, setInputMessage] = useState("");

  // Shared view state
  const [isSharedView, setIsSharedView] = useState(false);

  // Node ID counter ref
  const nodeIdCounterRef = useRef(1);

  // Models hook
  const {
    selectedModel,
    setSelectedModel,
    modelsList,
    setModelsList,
    modelsData,
    setModelsData,
  } = useModels(settings);

  // Chat API hook
  const { sendChatRequest } = useChatApi(settings, { webSearchEnabled, modelsData });

  const { fitView } = useReactFlow();

  // Initialize nodes/edges state - we need this before useChatManagement
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState("root");

  // Chat management hook
  const {
    activeChatId,
    setActiveChatIdState,
    chatsList,
    setChatsList,
    focusedChatId,
    setFocusedChatId,
    activeGroupInfo,
    switchToChat,
    focusChatInGroup,
    createNewChat,
    deleteChat,
    moveChat,
    mergeChats,
    refreshChatsList,
  } = useChatManagement({
    setNodes,
    setEdges,
    setSelectedNodeId,
    setMergeMode,
    setSnackbar,
    nodeIdCounterRef,
    isSharedView,
    setIsSharedView,
  });

  // Grouped chats computation
  const { groupedStates, combinedGroupState } = useGroupedChats({
    activeGroupInfo,
  });

  // Load initial state on mount/chat switch
  const savedState = useMemo(() => loadChatState(activeChatId), [activeChatId]);

  // Initialize state from saved or combined group state
  useEffect(() => {
    if (combinedGroupState) {
      setNodes(combinedGroupState.nodes);
      setEdges(combinedGroupState.edges);
      const savedNodeId = savedState?.selectedNodeId || "root";
      setSelectedNodeId(`${activeChatId}:${savedNodeId}`);
      nodeIdCounterRef.current = savedState?.nodeIdCounter || 1;
    } else if (savedState) {
      setNodes(savedState.nodes || initialNodes);
      setEdges(savedState.edges || initialEdges);
      setSelectedNodeId(savedState.selectedNodeId || "root");
      nodeIdCounterRef.current = savedState.nodeIdCounter || 1;
    }
  }, [activeChatId, savedState, combinedGroupState, setNodes, setEdges]);

  // Load shared chat from URL hash on mount
  const sharedChatLoadedRef = useRef(false);
  useEffect(() => {
    if (sharedChatLoadedRef.current) return;
    sharedChatLoadedRef.current = true;

    const sharedState = getSharedChatFromUrl();
    if (sharedState && sharedState.nodes) {
      setNodes(sharedState.nodes || initialNodes);
      setEdges(sharedState.edges || initialEdges);
      setSelectedNodeId(sharedState.selectedNodeId || "root");
      nodeIdCounterRef.current = sharedState.nodeIdCounter || 1;
      setIsSharedView(true);
      clearShareHash();
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    }
  }, [setNodes, setEdges, fitView]);

  // Commit shared chat to storage
  const commitSharedChat = useCallback(() => {
    if (!isSharedView) return;

    const newChatId = generateChatId();
    const newChat = {
      id: newChatId,
      name: "Shared Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updatedList = [newChat, ...chatsList];
    saveChatsList(updatedList);
    setChatsList(updatedList);
    setActiveChatId(newChatId);
    setActiveChatIdState(newChatId);
    setIsSharedView(false);

    saveChatState(
      newChatId,
      nodes,
      edges,
      selectedNodeId,
      nodeIdCounterRef.current
    );
    setChatsList(loadChatsList());
  }, [
    isSharedView,
    chatsList,
    nodes,
    edges,
    selectedNodeId,
    setChatsList,
    setActiveChatIdState,
  ]);

  // Auto-save to localStorage
  useEffect(() => {
    if (isSharedView) return;
    const timeoutId = setTimeout(() => {
      if (activeGroupInfo) {
        activeGroupInfo.members.forEach((member) => {
          const chatPrefix = `${member.id}:`;
          const prefixedNodes = nodes.filter((n) =>
            n.id.startsWith(chatPrefix)
          );
          if (prefixedNodes.length === 0) return;

          const chatNodes = prefixedNodes.map((n) => {
            const originalId = n.id.replace(chatPrefix, "");
            const state = groupedStates?.[member.id];
            const offset = state?.offset || { x: 0, y: 0 };
            return {
              ...n,
              id: originalId,
              position: {
                x: n.position.x - offset.x,
                y: n.position.y - offset.y,
              },
              data: { ...n.data, chatId: undefined },
            };
          });

          const chatEdges = edges
            .filter((e) => e.id.startsWith(chatPrefix))
            .map((e) => ({
              ...e,
              id: e.id.replace(chatPrefix, ""),
              source: e.source.replace(chatPrefix, ""),
              target: e.target.replace(chatPrefix, ""),
            }));

          const selectedForChat = selectedNodeId.startsWith(chatPrefix)
            ? selectedNodeId.replace(chatPrefix, "")
            : "root";

          saveChatState(
            member.id,
            chatNodes.length > 0 ? chatNodes : initialNodes,
            chatEdges,
            selectedForChat,
            nodeIdCounterRef.current
          );
        });
      } else {
        saveChatState(
          activeChatId,
          nodes,
          edges,
          selectedNodeId,
          nodeIdCounterRef.current
        );
      }
      setChatsList(loadChatsList());
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [
    nodes,
    edges,
    selectedNodeId,
    activeChatId,
    isSharedView,
    activeGroupInfo,
    groupedStates,
    setChatsList,
  ]);

  // Node operations hook
  const {
    sendMessage,
    handleAddBranch,
    handleEditNode,
    handleDeleteNode,
    handleToggleCollapse,
    handleToggleContextMode,
    handleRegenerateMerge,
    handleMergeNode,
    executePendingMerge,
  } = useNodeOperations({
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
  });

  // Auto layout handler to tidy nodes dynamically
  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => {
      const newNodes = layoutTree(nds, edges);
      // Let ReactFlow apply positions then fit the view smoothly
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 50);
      return newNodes;
    });
  }, [edges, setNodes, fitView]);

  // Save settings handler
  const handleSaveSettings = useCallback((newSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings, newSettings.saveApiKey);
    // Sync panOnScroll with settings
    setPanOnScroll(newSettings.panOnScroll !== false);
    // Sync lockScrollOnNodeFocus with settings
    setLockScrollOnNodeFocus(newSettings.lockScrollOnNodeFocus || false);
    // Apply theme to html element and notify outer provider
    const mode = newSettings.themeMode || "dark";
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", mode);
      window.dispatchEvent(new CustomEvent("chattree:theme-changed", { detail: { themeMode: mode } }));
    }
  }, []);

  const handleToggleLanguage = useCallback(() => {
    const nextLang = settings.language === "zh" ? "en" : "zh";
    const newSettings = { ...settings, language: nextLang };
    handleSaveSettings(newSettings);
  }, [settings, handleSaveSettings]);

  // Share current chat
  const handleShareChat = useCallback(() => {
    const nodesToShare = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onAddBranch: undefined,
        onEditNode: undefined,
        onDeleteNode: undefined,
        onMergeNode: undefined,
        onRegenerateMerge: undefined,
        onToggleCollapse: undefined,
        isMergeSource: undefined,
      },
    }));

    const chatState = {
      nodes: nodesToShare,
      edges,
      selectedNodeId,
      nodeIdCounter: nodeIdCounterRef.current,
    };

    const shareUrl = generateShareUrl(chatState);
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl).then(
        () => {
          setSnackbar({
            open: true,
            message: "Share link copied to clipboard!",
            severity: "success",
          });
        },
        (err) => {
          console.error("Failed to copy share URL:", err);
          window.prompt("Copy this share URL:", shareUrl);
        }
      );
    } else {
      setSnackbar({
        open: true,
        message: "Failed to generate share link",
        severity: "error",
      });
    }
  }, [nodes, edges, selectedNodeId]);

  // Confirm merge from the info panel without double-clicking a node
  const handleConfirmMerge = useCallback(() => {
    const selectedIds = mergeMode?.selectedNodeIds || [];
    if (selectedIds.length < 2) return;

    // Trigger the existing merge flow by simulating a double-click on the first selection
    handleMergeNode(selectedIds[0], true);
  }, [mergeMode, handleMergeNode]);

  // Create artifact node on canvas
  const handleCreateArtifact = useCallback(
    (artifact) => {
      const artifactId = `artifact-${crypto.randomUUID()}`;
      const newNode = {
        id: artifactId,
        type: "artifactNode",
        position: { x: 100, y: 100 },
        data: {
          name: artifact.name,
          artifactType: artifact.type,
          content: artifact.content,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Edit artifact node
  const handleEditArtifact = useCallback(
    (nodeId, updates) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updates } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Delete artifact node
  const handleDeleteArtifact = useCallback(
    (nodeId) => {
      setNodes((nds) =>
        nds
          .filter((n) => n.id !== nodeId)
          .map((n) => {
            // Clean up mergedArtifacts references in merged nodes
            if (n.data?.mergedArtifacts?.includes(nodeId)) {
              return {
                ...n,
                data: {
                  ...n.data,
                  mergedArtifacts: n.data.mergedArtifacts.filter(
                    (id) => id !== nodeId
                  ),
                },
              };
            }
            return n;
          })
      );
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
    },
    [setNodes, setEdges]
  );

  // Get the selected node
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  // Compute current path of nodes from root to selectedNodeId
  const currentPath = useMemo(() => {
    return getPathToNode(selectedNodeId, nodes, edges);
  }, [selectedNodeId, nodes, edges]);

  // Get conversation history for selected node
  const conversationHistory = useMemo(() => {
    return buildConversationFromPath(currentPath);
  }, [currentPath]);

  // Check if current active path has any conversation messages
  const hasMessages = useMemo(() => {
    return currentPath.some((node) => {
      if (node.data?.isRoot) {
        return (node.data.messages && node.data.messages.length > 0) || node.data.userMessage;
      }
      return true;
    });
  }, [currentPath]);

  // Inject callbacks into all nodes
  const nodesWithCallbacks = useMemo(() => {
    const selectedNodeIds = mergeMode?.selectedNodeIds || [];
    return nodes.map((node) => {
      if (node.type === "artifactNode") {
        return {
          ...node,
          data: {
            ...node.data,
            language: settings.language || "en",
            onEditArtifact: handleEditArtifact,
            onDeleteArtifact: handleDeleteArtifact,
            onMergeNode: handleMergeNode,
            onToggleCollapse: handleToggleCollapse,
            isMergeSource: selectedNodeIds.includes(node.id),
            mergeSelectionCount: selectedNodeIds.length,
            lockScrollOnNodeFocus,
          },
        };
      }
      return {
        ...node,
        data: {
          ...node.data,
          language: settings.language || "en",
          onAddBranch: handleAddBranch,
          onEditNode: handleEditNode,
          onDeleteNode: handleDeleteNode,
          onMergeNode: handleMergeNode,
          onRegenerateMerge: handleRegenerateMerge,
          onToggleCollapse: handleToggleCollapse,
          isMergeSource: selectedNodeIds.includes(node.id),
          mergeSelectionCount: selectedNodeIds.length,
          lockScrollOnNodeFocus,
        },
      };
    });
  }, [
    nodes,
    handleAddBranch,
    handleEditNode,
    handleDeleteNode,
    handleMergeNode,
    handleRegenerateMerge,
    handleToggleCollapse,
    handleEditArtifact,
    handleDeleteArtifact,
    mergeMode,
    lockScrollOnNodeFocus,
    settings.language,
  ]);

  // Inject callbacks into all edges
  const edgesWithCallbacks = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        language: settings.language || "en",
        onToggleContextMode: handleToggleContextMode,
      },
    }));
  }, [edges, handleToggleContextMode, settings.language]);

  // Handle form submit
  const handleSubmit = useCallback(
    (message, files) => {
      if (pendingMerge) {
        executePendingMerge(message);
      } else {
        sendMessage(selectedNodeId, message, files);
      }
      setInputMessage("");
      setAttachedFiles([]);
    },
    [pendingMerge, executePendingMerge, sendMessage, selectedNodeId]
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (_, node) => {
      setSelectedNodeId(node.id);
      if (node.data?.chatId) {
        setFocusedChatId(node.data.chatId);
      }
    },
    [setFocusedChatId]
  );

  // Handle node double click to focus/center on it
  const onNodeDoubleClick = useCallback(
    (_, node) => {
      fitView({ nodes: [{ id: node.id }], padding: 0.2, duration: 400, maxZoom: 1 });
    },
    [fitView]
  );

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        backgroundColor: colors.bg.primary,
        overflow: "hidden",
        position: "relative",
      }}
    >

      {/* Left Sidebar: InfoPanel + ReactFlow tree view */}
      <Box
        sx={{
          width: sidebarOpen ? 300 : 0,
          minWidth: sidebarOpen ? 300 : 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRight: sidebarOpen ? `1px solid ${colors.border.primary}` : "none",
          backgroundColor: colors.bg.secondary,
          transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
        }}
      >
        {/* Info Panel Wrapper with Floating Toggle */}
        <Box sx={{ position: "relative", width: "100%", flexShrink: 0 }}>
          <InfoPanel
            chatsList={chatsList}
            activeChatId={activeChatId}
            focusedChatId={focusedChatId}
            activeGroupId={activeGroupInfo?.groupId || null}
            onCreateNewChat={createNewChat}
            onSwitchChat={switchToChat}
            onFocusChatInGroup={focusChatInGroup}
            onDeleteChat={deleteChat}
            onMoveChat={moveChat}
            onMergeChats={mergeChats}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenWaitlist={() => setWaitlistOpen(true)}
            onShareChat={handleShareChat}
            mergeMode={mergeMode}
            onCancelMerge={() => setMergeMode(null)}
            onConfirmMerge={handleConfirmMerge}
            conversationHistoryLength={conversationHistory.length}
            language={settings.language || "en"}
            historyExpanded={historyExpanded}
            onToggleLanguage={handleToggleLanguage}
            onToggleSidebar={() => setSidebarOpen(false)}
          />
          {/* Vertical Toggle Button for History Panel */}
          <IconButton
            onClick={() => {
              const next = !historyExpanded;
              setHistoryExpanded(next);
              if (typeof window !== "undefined") {
                localStorage.setItem("chattree-history-expanded", String(next));
              }
            }}
            sx={{
              position: "absolute",
              bottom: -16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
              backgroundColor: colors.bg.secondary,
              border: `1px solid ${colors.border.primary}`,
              borderTop: "none",
              borderRadius: `0 0 ${radius.md} ${radius.md}`,
              width: 48,
              height: 16,
              boxShadow: "var(--shadow-sm)",
              color: colors.text.primary,
              p: 0,
              "&:hover": {
                backgroundColor: colors.bg.hover,
              },
            }}
            title={settings.language === "zh" ? (historyExpanded ? "折叠历史记录" : "展开历史记录") : (historyExpanded ? "Collapse History" : "Expand History")}
          >
            {historyExpanded ? (
              <ExpandLessIcon sx={{ fontSize: 12, mt: -0.25 }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: 12, mt: -0.25 }} />
            )}
          </IconButton>
        </Box>

        {/* Tree Canvas */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            width: "100%",
            height: "100%",
            backgroundColor: colors.flow.background,
          }}
        >
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edgesWithCallbacks}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.05}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={null}
            selectionKeyCode={null}
            panOnScroll={panOnScroll}
          >
            <Background color={colors.flow.dot} gap={20} />
            <Controls
              style={{
                backgroundColor: colors.bg.secondary,
                borderRadius: radius.md,
                border: `1px solid ${colors.border.primary}`,
              }}
              className="custom-controls"
              showInteractive={false}
            >
              <ControlButton
                onClick={() => setPanOnScroll((prev) => !prev)}
                title={
                  panOnScroll
                    ? "Scroll to pan (click to switch to zoom)"
                    : "Scroll to zoom (click to switch to pan)"
                }
              >
                <PanScrollToggle panOnScroll={panOnScroll} size="small" asIcon />
              </ControlButton>
              <ControlButton
                onClick={() => setLockScrollOnNodeFocus((prev) => !prev)}
                title={
                  lockScrollOnNodeFocus
                    ? "Canvas scroll locked on node hover (click to unlock)"
                    : "Canvas scroll unlocked (click to lock on node hover)"
                }
              >
                <LockScrollToggle
                  locked={lockScrollOnNodeFocus}
                  size="small"
                  asIcon
                />
              </ControlButton>
              <ControlButton
                onClick={handleAutoLayout}
                title={
                  settings.language === "zh"
                    ? "自动整理树状图"
                    : "Auto Layout / Tidy Tree"
                }
              >
                <AutoFixHighIcon sx={{ fontSize: 16 }} />
              </ControlButton>
            </Controls>
          </ReactFlow>
        </Box>
      </Box>

      {/* Right Main Chat Panel: message history list + input panel */}
      <Box
        sx={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: colors.bg.primary,
          position: "relative",
        }}
      >
        {/* Floating Sidebar Toggle Button (visible only when sidebar is closed) */}
        {!sidebarOpen && (
          <IconButton
            onClick={() => setSidebarOpen(true)}
            sx={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 110,
              color: colors.text.primary,
              width: 32,
              height: 32,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: radius.sm,
              backgroundColor: colors.bg.secondary,
              boxShadow: "var(--shadow-sm)",
              "&:hover": {
                backgroundColor: colors.bg.hover,
              },
            }}
            title="Open Sidebar"
          >
            <MenuIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}

        {/* Top fading gradient backdrop */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 48,
            zIndex: 105,
            background: mode === "light"
              ? "linear-gradient(180deg, #f5f4f2 0%, rgba(245, 244, 242, 0.7) 40%, rgba(245, 244, 242, 0) 100%)"
              : "linear-gradient(180deg, #1a1c1d 0%, rgba(26, 28, 29, 0.7) 40%, rgba(26, 28, 29, 0) 100%)",
            pointerEvents: "none",
            opacity: hasMessages ? 1 : 0,
            transition: "opacity 0.6s ease",
          }}
        />

        {/* Message Stream Wrapper */}
        <Box
          sx={{
            flex: hasMessages ? 1 : 0,
            height: hasMessages ? "100%" : 0,
            opacity: hasMessages ? 1 : 0,
            overflow: "hidden",
            transition: "opacity 0.6s ease, flex 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
            width: "100%",
            zIndex: 10,
          }}
        >
          <LinearChatView
            path={currentPath}
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onEditNode={handleEditNode}
            onDeleteNode={handleDeleteNode}
            language={settings.language || "en"}
          />
        </Box>

        {/* Unified Input Panel & Branding Container */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            pointerEvents: "none", // Allow clicks to pass through to scroll messages
          }}
        >
          {/* Top Spacer */}
          <Box
            sx={{
              flex: 1,
              transition: "flex 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15)",
            }}
          />

          {/* Branding & Greeting */}
          <Box
            sx={{
              opacity: hasMessages ? 0 : 1,
              maxHeight: hasMessages ? 0 : 400,
              overflow: "hidden",
              transition: "opacity 0.4s ease, max-height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15), margin-bottom 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              mb: hasMessages ? 0 : 4,
              pointerEvents: hasMessages ? "none" : "auto",
            }}
          >
            <Box
              component="img"
              src="/favicon.svg"
              alt="ChatTree Logo"
              sx={{
                width: 56,
                height: 56,
                filter: "drop-shadow(0 0 16px rgba(74, 158, 255, 0.25))",
                animation: "pulseLogo 4s infinite ease-in-out",
                "@keyframes pulseLogo": {
                  "0%": { transform: "scale(1)" },
                  "50%": { transform: "scale(1.04)" },
                  "100%": { transform: "scale(1)" },
                }
              }}
            />
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                background: mode === "light"
                  ? "linear-gradient(135deg, #1d6fe8 0%, #10b981 100%)"
                  : "linear-gradient(135deg, #4a9eff 0%, #10b981 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              ChatTree
            </Typography>
            <Typography
              variant="h5"
              sx={{
                color: colors.text.primary,
                fontWeight: 600,
                textAlign: "center",
                mt: 1,
                fontSize: { xs: "1.2rem", md: "1.4rem" },
              }}
            >
              {settings.language === "zh" ? "今天我能帮您些什么？" : "How can I help you today?"}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: colors.text.muted,
                textAlign: "center",
                maxWidth: 460,
                lineHeight: 1.6,
                fontSize: "0.85rem",
              }}
            >
              {settings.language === "zh"
                ? "在下方输入以开始对话。您的对话分支与合并路径将自动在左侧树状图画布中实时呈现。"
                : "Type a message below to start. Your conversation paths and branch merges will be automatically visualized on the left sidebar canvas."}
            </Typography>
          </Box>

          {/* Input panel wrapper */}
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: hasMessages ? 6 : 0,
              pb: hasMessages ? 4 : 0,
              pl: { xs: 3, md: 8 },
              pr: { xs: 3, md: "70px" },
              background: hasMessages
                ? (mode === "light"
                  ? "linear-gradient(180deg, rgba(245, 244, 242, 0) 0%, rgba(245, 244, 242, 0.9) 40%, #f5f4f2 100%)"
                  : "linear-gradient(180deg, rgba(26, 28, 29, 0) 0%, rgba(26, 28, 29, 0.9) 40%, #1a1c1d 100%)")
                : "transparent",
              transition: "background 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15), padding 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15)",
              pointerEvents: "auto", // Allow interactions with input panel
            }}
          >
            <Box
              sx={{
                width: "100%",
                maxWidth: 850,
              }}
            >
              <InputPanel
                inputMessage={inputMessage}
                onInputChange={setInputMessage}
                onSubmit={handleSubmit}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelsList={modelsList}
                modelsData={modelsData}
                isRootSelected={selectedNode?.data?.isRoot && (!selectedNode?.data?.messages || selectedNode.data.messages.length === 0) && !selectedNode?.data?.userMessage}
                isPendingMerge={!!pendingMerge}
                pendingMerge={pendingMerge}
                onUpdatePendingMerge={setPendingMerge}
                onCancelPendingMerge={() => {
                  setPendingMerge(null);
                  setInputMessage("");
                }}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={() => setWebSearchEnabled((prev) => !prev)}
                attachedFiles={attachedFiles}
                onAddAttachedFile={onAddAttachedFile}
                onRemoveAttachedFile={onRemoveAttachedFile}
                setAttachedFiles={setAttachedFiles}
                language={settings.language || "en"}
              />
            </Box>
          </Box>

          {/* Bottom Spacer */}
          <Box
            sx={{
              flex: hasMessages ? 0 : 1.2,
              height: hasMessages ? "0px" : "15vh",
              opacity: hasMessages ? 0 : 1,
              overflow: "hidden",
              transition: "flex 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15), height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15), opacity 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.15)",
            }}
          />
        </Box>
      </Box>



      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        modelsList={modelsList}
        setModelsList={setModelsList}
        setModelsData={setModelsData}
        setSelectedModel={setSelectedModel}
      />

      {/* Waitlist Modal */}
      <WaitlistModal
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        language={settings.language || "en"}
      />

      {/* Share Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          icon={false}
          sx={{
            backgroundColor: colors.bg.secondary,
            color: colors.text.primary,
            border: `1px solid ${colors.border.primary}`,
            borderRadius: radius.md,
            "& .MuiAlert-action": {
              color: colors.text.muted,
            },
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>


    </Box>
  );
};

const TreeChatWithTheme = () => {
  // Read stored theme before first render so Provider has correct mode
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const s = localStorage.getItem("chattree-settings");
      return s ? (JSON.parse(s).themeMode || "dark") : "dark";
    } catch { return "dark"; }
  });

  // Keep themeMode in sync with inner settings changes via custom event
  useEffect(() => {
    const handleThemeChange = (e) => setThemeMode(e.detail.themeMode || "dark");
    window.addEventListener("chattree:theme-changed", handleThemeChange);
    // Apply initial data-theme attr
    document.documentElement.setAttribute("data-theme", themeMode);
    return () => window.removeEventListener("chattree:theme-changed", handleThemeChange);
  }, [themeMode]);

  return (
    <AppThemeProvider mode={themeMode}>
      <ReactFlowProvider>
        <TreeChatInner onThemeChange={setThemeMode} />
      </ReactFlowProvider>
    </AppThemeProvider>
  );
};

const TreeChat = TreeChatWithTheme;
export default TreeChat;
