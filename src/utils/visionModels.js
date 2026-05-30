/**
 * Utility to check if a model supports vision/image inputs
 * Uses actual model metadata from the API
 */

// Vision support states
export const VISION_SUPPORT = {
  SUPPORTED: "supported",
  NOT_SUPPORTED: "not_supported",
  UNKNOWN: "unknown",
};

export const getVisionSupport = (modelId, modelsData) => {
  if (!modelId) return VISION_SUPPORT.UNKNOWN;

  if (modelsData && modelsData[modelId]) {
    const modelData = modelsData[modelId];
    const inputModalities = modelData.architecture?.input_modalities;
    if (inputModalities && Array.isArray(inputModalities)) {
      if (inputModalities.includes("image")) {
        return VISION_SUPPORT.SUPPORTED;
      }
      return VISION_SUPPORT.NOT_SUPPORTED;
    }
  }

  // Fallback for common vision models when metadata is missing or unknown
  const id = modelId.toLowerCase();
  const isKnownVision = (
    id.includes("vision") ||
    id.includes("gpt-4o") ||
    id.includes("claude-3") ||
    id.includes("gemini") ||
    id.includes("pixtral") ||
    id.includes("llama-3.2-11b") ||
    id.includes("llama-3.2-90b") ||
    id.includes("qwen-vl") ||
    id.includes("qwen2.5-vl") ||
    id.includes("qwen2-vl") ||
    id.includes("openrouter/free") ||
    id.includes("openrouter/auto") ||
    id.includes("-vl") ||
    id.includes("_vl") ||
    id.includes("llava") ||
    id.includes("internvl") ||
    id.includes("minicpm-v") ||
    id.includes("molmo") ||
    id.includes("cogvlm") ||
    id.includes("deepseek-vl")
  );

  if (isKnownVision) {
    return VISION_SUPPORT.SUPPORTED;
  }

  return VISION_SUPPORT.UNKNOWN;
};

/**
 * Check if a model supports vision/image inputs (boolean helper)
 * @param {string} modelId - The model ID to check
 * @param {Object} modelsData - Map of model ID to model metadata
 * @returns {boolean} - True if the model supports vision
 */
export const modelSupportsVision = (modelId, modelsData) => {
  const support = getVisionSupport(modelId, modelsData);
  return support === VISION_SUPPORT.SUPPORTED;
};

/**
 * Get a user-friendly message about vision support
 * @param {string} modelId - The model ID
 * @param {Object} modelsData - Map of model ID to model metadata
 * @returns {string|null} - Warning message if model doesn't support vision, null otherwise
 */
export const getVisionWarning = (modelId, modelsData) => {
  const support = getVisionSupport(modelId, modelsData);

  switch (support) {
    case VISION_SUPPORT.SUPPORTED:
      return null;
    case VISION_SUPPORT.NOT_SUPPORTED:
      return "This model does not support images. Images in context will be ignored.";
    case VISION_SUPPORT.UNKNOWN:
      return "Vision support unknown for this model. Images may be ignored.";
    default:
      return null;
  }
};
