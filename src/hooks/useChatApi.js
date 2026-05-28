/**
 * Custom hook for handling chat API calls with streaming support
 * Calls OpenAI-compatible APIs directly from the client (works with static hosting like GitHub Pages)
 */

import { useCallback } from "react";
import { modelSupportsVision } from "../utils/visionModels";

const DEFAULT_API_URL = "https://api.openai.com/v1";

/**
 * Parse and process streaming response from OpenAI API
 */
const processStreamingResponse = async (
  response,
  onChunk,
  onComplete,
  onError
) => {
  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let fullReasoning = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || "";
            const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning || parsed.choices?.[0]?.delta?.thinking || "";
            if (content || reasoning) {
              fullResponse += content;
              fullReasoning += reasoning;
              onChunk(fullResponse, fullReasoning);
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }

    onComplete(fullResponse, fullReasoning);
  } catch (error) {
    onError(error);
  }
};

/**
 * Check if the model supports tools/function calling on OpenRouter
 */
const modelSupportsTools = (modelName) => {
  if (!modelName) return false;
  const lowerName = modelName.toLowerCase();
  
  // List of substrings/names for models known NOT to support tools (function calling) on OpenRouter
  if (
    lowerName.includes("o1-mini") ||
    lowerName.includes("o1-preview") ||
    lowerName.includes("deepseek-r1") ||
    lowerName.includes("deepseek-reasoner") ||
    lowerName.includes("qwq") ||
    lowerName.includes("-r1") ||
    (lowerName.startsWith("o1-") && !lowerName.includes("o1-2024"))
  ) {
    return false;
  }
  
  return true;
};

/**
 * Hook for making chat API requests directly to OpenAI-compatible APIs
 * Works with static hosting (GitHub Pages) - no backend required
 */
export const useChatApi = (settings, options = {}) => {
  const { webSearchEnabled = false, modelsData = {} } = options;

  const sendChatRequest = useCallback(
    async (messages, model, onChunk, onComplete, onError) => {
      const apiKey = settings.apiKey;
      const apiUrl = settings.apiUrl || DEFAULT_API_URL;

      if (!apiKey) {
        onError(
          new Error(
            "API key not configured. Please add your OpenAI API key in Settings."
          )
        );
        return;
      }

      // Check if model supports streaming (o1 models don't support streaming)
      const supportsStreaming = !model.startsWith("o1");

      // Check if model supports vision
      const supportsVision = modelSupportsVision(model, modelsData);

      // Sanitize messages for non-vision models to ensure content is always a string
      let sanitizedMessages = messages;
      if (!supportsVision) {
        sanitizedMessages = messages.map((msg) => {
          if (typeof msg.content === "string") {
            return msg;
          }
          let textVal = "";
          if (Array.isArray(msg.content)) {
            const textParts = msg.content
              .filter((part) => part.type === "text")
              .map((part) => part.text);
            textVal = textParts.join("\n");
            
            // Append metadata of attachments
            const fileParts = msg.content
              .filter((part) => part.type === "file")
              .map((part) => `[Attachment File: ${part.file?.filename}]`);
            const imageParts = msg.content
              .filter((part) => part.type === "image_url")
              .map((part) => `[Attached Image]`);
              
            if (fileParts.length > 0 || imageParts.length > 0) {
              textVal += "\n" + [...fileParts, ...imageParts].join("\n");
            }
          } else if (typeof msg.content === "object" && msg.content) {
            textVal = msg.content.text || "";
          }
          return {
            ...msg,
            content: textVal,
          };
        });
      }

      // Build request body
      const requestBody = {
        model,
        messages: sanitizedMessages,
        //max_completion_tokens: 4000,
        stream: supportsStreaming,
      };

      const isOpenRouter = apiUrl.includes("openrouter.ai");
      if (isOpenRouter) {
        const tools = [];
        if (modelSupportsTools(model)) {
          if (webSearchEnabled) {
            tools.push({ type: "openrouter:web_search" });
          }
          
          // Check if the user prompt asks for image generation
          const lastMsg = messages[messages.length - 1];
          const lastMsgContent = typeof lastMsg?.content === "string" 
            ? lastMsg.content 
            : (Array.isArray(lastMsg?.content) ? (lastMsg.content.find(c => c.type === "text")?.text || "") : "");
          const lowerPrompt = lastMsgContent.toLowerCase();
          const asksForImage = 
            lowerPrompt.includes("generate image") || 
            lowerPrompt.includes("generate a picture") || 
            lowerPrompt.includes("generate a photo") || 
            lowerPrompt.includes("create an image") || 
            lowerPrompt.includes("create a picture") || 
            lowerPrompt.includes("draw ") || 
            lowerPrompt.includes("paint ") || 
            lowerPrompt.includes("生成图片") || 
            lowerPrompt.includes("画一张") || 
            lowerPrompt.includes("画个") || 
            lowerPrompt.includes("画图") || 
            lowerPrompt.includes("生成一张图片");

          if (asksForImage) {
            tools.push({ type: "openrouter:image_generation" });
          }
        }
        
        if (tools.length > 0) {
          requestBody.tools = tools;
        }
      } else {
        // Fallback for deprecated plugins on old endpoints
        if (webSearchEnabled) {
          requestBody.plugins = [{ id: "web" }];
        }
      }

      try {
        const response = await fetch(`${apiUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://chattree.xyz", // OpenRouter app attribution
            "X-Title": "ChatTree",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || `API error: ${response.status}`
          );
        }

        if (supportsStreaming) {
          await processStreamingResponse(
            response,
            onChunk,
            onComplete,
            onError
          );
        } else {
          // Non-streaming response (for o1 models)
          const data = await response.json();
          const responseText = data.choices?.[0]?.message?.content || "";
          onComplete(responseText);
        }
      } catch (error) {
        onError(error);
      }
    },
    [settings, webSearchEnabled]
  );

  return { sendChatRequest };
};

export default useChatApi;
