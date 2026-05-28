/**
 * Constants used across the chat application
 */

// Storage keys
export const CHATS_KEY = "chattree-chats";
export const ACTIVE_CHAT_KEY = "chattree-active-chat";
export const SETTINGS_KEY = "chattree-settings";
export const API_KEY_STORAGE_KEY = "chattree-api-key";
export const RECENT_MODELS_KEY = "chattree-recent-models";
export const ARTIFACTS_KEY = "chattree-artifacts";
export const MAX_RECENT_MODELS = 5;

// Default models list
export const defaultModels = [
  "chatgpt-4o-latest",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "o1-preview",
  "o1-mini",
];

// Initial tree state
export const initialNodes = [
  {
    id: "root",
    type: "chatNode",
    position: { x: 400, y: 50 },
    data: {
      isRoot: true,
      userMessage: "",
      assistantMessage: "",
      status: "complete",
    },
  },
];

export const initialEdges = [];
