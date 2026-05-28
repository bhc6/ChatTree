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

/**
 * Check if a model supports vision/image inputs based on model metadata
 * @param {string} modelId - The model ID to check
 * @param {Object} modelsData - Map of model ID to model metadata
 * @returns {string} - One of VISION_SUPPORT values
 */
export const getVisionSupport = (modelId, modelsData) => {
  if (!modelId || !modelsData) return VISION_SUPPORT.UNKNOWN;

  const modelData = modelsData[modelId];
  if (!modelData) return VISION_SUPPORT.UNKNOWN;

  const inputModalities = modelData.architecture?.input_modalities;
  if (!inputModalities || !Array.isArray(inputModalities)) {
    return VISION_SUPPORT.UNKNOWN;
  }

  // Check if "image" is in input modalities
  if (inputModalities.includes("image")) {
    return VISION_SUPPORT.SUPPORTED;
  }

  // If we have modality info but no image, it's not supported
  return VISION_SUPPORT.NOT_SUPPORTED;
};

/**
 * Check if a model supports vision/image inputs (boolean helper)
 * @param {string} modelId - The model ID to check
 * @param {Object} modelsData - Map of model ID to model metadata
 * @returns {boolean} - True if the model supports vision
 */
export const modelSupportsVision = (modelId, modelsData) => {
  const support = getVisionSupport(modelId, modelsData);
  if (support === VISION_SUPPORT.SUPPORTED) return true;
  if (support === VISION_SUPPORT.NOT_SUPPORTED) return false;

  // Fallback for common vision models when metadata is missing or unknown
  if (modelId) {
    const id = modelId.toLowerCase();
    return (
      id.includes("vision") ||
      id.includes("gpt-4o") ||
      id.includes("claude-3") ||
      id.includes("gemini") ||
      id.includes("pixtral") ||
      id.includes("llama-3.2-11b") ||
      id.includes("llama-3.2-90b") ||
      id.includes("qwen-vl") ||
      id.includes("qwen2.5-vl")
    );
  }

  return false;
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
