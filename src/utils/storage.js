/**
 * LocalStorage utilities for chat persistence and settings
 */

import { getChatName } from "./treeUtils";
import {
  CHATS_KEY,
  ACTIVE_CHAT_KEY,
  SETTINGS_KEY,
  API_KEY_STORAGE_KEY,
  RECENT_MODELS_KEY,
  MAX_RECENT_MODELS,
  initialNodes,
  initialEdges,
} from "./constants";

// Generate unique chat ID
export const generateChatId = () =>
  `chat-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// Generate unique group ID
export const generateGroupId = () =>
  `group-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// Load all chats list from localStorage
export const loadChatsList = () => {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(CHATS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load chats list:", e);
  }
  return [];
};

// Save chats list to localStorage
export const saveChatsList = (chatsList) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chatsList));
  } catch (e) {
    console.error("Failed to save chats list:", e);
  }
};

// Load a specific chat's state
export const loadChatState = (chatId) => {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(`chattree-${chatId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load chat state:", e);
  }
  return null;
};

/**
 * Evict the oldest chat from localStorage to free up space.
 * Returns true if a chat was evicted.
 */
export const evictOldestChat = (currentChatId) => {
  const chatsList = loadChatsList();
  // Sort by updatedAt ascending (oldest first), excluding the current chat
  const sorted = [...chatsList]
    .filter((c) => c.id !== currentChatId)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  if (sorted.length === 0) return false;
  const oldest = sorted[0];
  localStorage.removeItem(`chattree-${oldest.id}`);
  // Remove from chats list too
  saveChatsList(chatsList.filter((c) => c.id !== oldest.id));
  console.warn(`[storage] Evicted oldest chat "${oldest.name}" (${oldest.id}) to free localStorage space.`);
  return true;
};

/**
 * Try localStorage.setItem with progressive fallback on QuotaExceededError.
 * Tier 1: Strip image dataUrls from all messages.
 * Tier 2: Truncate long message text to 500 chars.
 * Tier 3: Save skeleton (metadata + message role only, no content).
 * Each tier also tries evicting the oldest chat first.
 */
const trySetItemWithFallback = (key, payload, chatId) => {
  const attempt = (data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        return false;
      }
      throw e;
    }
  };

  // --- Tier 0: normal save ---
  if (attempt(payload)) return;

  // --- Tier 1: strip all image dataUrls ---
  console.warn("[storage] QuotaExceeded: stripping image dataUrls and retrying.");
  const tier1 = {
    ...payload,
    nodes: payload.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        messages: n.data?.messages?.map((msg) => ({
          ...msg,
          files: msg.files?.map((f) => ({ ...f, dataUrl: undefined, content: undefined })),
        })),
      },
    })),
  };
  if (attempt(tier1)) return;

  // Try evicting oldest chat then retry tier1
  if (evictOldestChat(chatId) && attempt(tier1)) return;

  // --- Tier 2: truncate long message content to 500 chars ---
  console.warn("[storage] QuotaExceeded: truncating message content to 500 chars and retrying.");
  const MAX_CONTENT = 500;
  const tier2 = {
    ...tier1,
    nodes: tier1.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        messages: n.data?.messages?.map((msg) => ({
          ...msg,
          content:
            typeof msg.content === "string" && msg.content.length > MAX_CONTENT
              ? msg.content.slice(0, MAX_CONTENT) + "\n…[truncated to save storage]"
              : msg.content,
          files: undefined,
        })),
      },
    })),
  };
  if (attempt(tier2)) return;

  if (evictOldestChat(chatId) && attempt(tier2)) return;

  // --- Tier 3: skeleton only (no message content) ---
  console.warn("[storage] QuotaExceeded: saving metadata skeleton only (no message content).");
  const tier3 = {
    ...payload,
    nodes: payload.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        userMessage: n.data?.userMessage
          ? n.data.userMessage.slice(0, 80) + (n.data.userMessage.length > 80 ? "…" : "")
          : undefined,
        messages: n.data?.messages?.map((msg) => ({
          role: msg.role,
          content: "[Content not saved – localStorage full]",
          model: msg.model,
        })),
      },
    })),
  };
  if (attempt(tier3)) return;

  if (evictOldestChat(chatId) && attempt(tier3)) return;

  // Final failure: notify user
  console.error("[storage] All fallback tiers exhausted. Could not save chat state. Consider clearing old chats.");
  if (typeof window !== "undefined") {
    // Dispatch a custom event that the UI can listen to
    window.dispatchEvent(new CustomEvent("chattree:quota-exceeded", { detail: { chatId } }));
  }
};

// Save a specific chat's state
export const saveChatState = (
  chatId,
  nodes,
  edges,
  selectedNodeId,
  nodeIdCounter
) => {
  if (typeof window === "undefined") return;
  try {
    // Strip callbacks and massive non-image file dataUrls from nodes before saving
    const nodesToSave = nodes.map((node) => {
      const messagesToSave = node.data?.messages?.map((msg) => {
        if (!msg.files) return msg;
        const filesToSave = msg.files.map((file) => {
          const isImage = file.type?.startsWith("image/");
          return {
            ...file,
            dataUrl: isImage ? file.dataUrl : undefined, // Keep dataUrl only for images to show previews
          };
        });
        return {
          ...msg,
          files: filesToSave,
        };
      });

      return {
        ...node,
        data: {
          ...node.data,
          messages: messagesToSave,
          onAddBranch: undefined,
          onEditNode: undefined,
          onDeleteNode: undefined,
          onMergeNode: undefined,
          onRegenerateMerge: undefined,
          isMergeSource: undefined,
        },
      };
    });

    const payload = {
      nodes: nodesToSave,
      edges,
      selectedNodeId,
      nodeIdCounter,
    };

    trySetItemWithFallback(`chattree-${chatId}`, payload, chatId);

    // Also update chat name in list
    const chatsList = loadChatsList();
    const chatIndex = chatsList.findIndex((c) => c.id === chatId);
    if (chatIndex >= 0) {
      chatsList[chatIndex].name = getChatName(nodesToSave);
      chatsList[chatIndex].updatedAt = Date.now();
      saveChatsList(chatsList);
    }
  } catch (e) {
    console.error("Failed to save chat state:", e);
  }
};

// Delete a chat's state from localStorage
export const deleteChatState = (chatId) => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`chattree-${chatId}`);
};

// Get or create active chat ID
export const getActiveChatId = () => {
  if (typeof window === "undefined") return null;
  try {
    let activeId = localStorage.getItem(ACTIVE_CHAT_KEY);
    if (!activeId) {
      // Create initial chat
      activeId = generateChatId();
      localStorage.setItem(ACTIVE_CHAT_KEY, activeId);
      const chatsList = [
        {
          id: activeId,
          name: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      saveChatsList(chatsList);
    }
    return activeId;
  } catch (e) {
    console.error("Failed to get active chat:", e);
  }
  return generateChatId();
};

// Set active chat ID
export const setActiveChatId = (chatId) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
};

// Load settings from localStorage
export const loadSettings = () => {
  if (typeof window === "undefined")
    return {
      apiKey: "",
      apiUrl: "",
      saveApiKey: false,
      panOnScroll: true,
      lockScrollOnNodeFocus: false,
      language: "en",
      themeMode: "dark",
    };
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    const settings = saved
      ? JSON.parse(saved)
      : {
          apiUrl: "",
          saveApiKey: false,
          panOnScroll: true,
          lockScrollOnNodeFocus: false,
        };
    // Load API key separately if it was saved
    if (savedApiKey && settings.saveApiKey) {
      settings.apiKey = savedApiKey;
    } else {
      settings.apiKey = "";
    }
    // Default panOnScroll to true if not set
    if (settings.panOnScroll === undefined) {
      settings.panOnScroll = true;
    }
    // Default lockScrollOnNodeFocus to false if not set
    if (settings.lockScrollOnNodeFocus === undefined) {
      settings.lockScrollOnNodeFocus = false;
    }
    // Default language setting to browser language detection
    if (settings.language === undefined) {
      settings.language = (typeof navigator !== "undefined" && navigator.language?.startsWith("zh")) ? "zh" : "en";
    }
    // Default theme mode
    if (settings.themeMode === undefined) {
      settings.themeMode = "dark";
    }
    return settings;
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return {
    apiKey: "",
    apiUrl: "",
    saveApiKey: false,
    panOnScroll: true,
    lockScrollOnNodeFocus: false,
    language: "en",
  };
};

// Save settings to localStorage
export const saveSettings = (settings, shouldSaveApiKey) => {
  if (typeof window === "undefined") return;
  try {
    // Save non-sensitive settings
    const settingsToSave = {
      apiUrl: settings.apiUrl,
      saveApiKey: shouldSaveApiKey,
      panOnScroll: settings.panOnScroll,
      lockScrollOnNodeFocus: settings.lockScrollOnNodeFocus,
      language: settings.language || "en",
      themeMode: settings.themeMode || "dark",
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave));

    // Handle API key separately
    if (shouldSaveApiKey && settings.apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, settings.apiKey);
    } else {
      // Explicitly remove API key when unchecked
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
};

// Waitlist utilities
export const getWaitlistEmail = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`chattree-waitlist-email`);
};

export const saveWaitlistEmail = (email) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(`chattree-waitlist-email`, email);
};

// Load recent models from localStorage (sorted by last used, most recent first)
export const loadRecentModels = () => {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(RECENT_MODELS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load recent models:", e);
  }
  return [];
};

// Save a model as recently used (adds to top of stack)
export const saveRecentModel = (modelId) => {
  if (typeof window === "undefined" || !modelId) return;
  try {
    const recentModels = loadRecentModels();
    // Remove if already exists (will be re-added at top)
    const filtered = recentModels.filter((m) => m.id !== modelId);
    // Add to top with current timestamp
    const updated = [{ id: modelId, lastUsed: Date.now() }, ...filtered].slice(
      0,
      MAX_RECENT_MODELS
    );
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save recent model:", e);
  }
};
