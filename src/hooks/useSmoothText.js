"use client";
import { useState, useEffect, useRef } from "react";

/**
 * Custom hook to smooth out streamed text to prevent sudden visual jumping.
 * It queues incoming character additions and ease-renders them at frame rate.
 *
 * @param {string} targetText The raw text stream from the model.
 * @param {boolean} isStreaming Whether streaming is currently active.
 * @returns {string} The smoothed text to display in the UI.
 */
export const useSmoothText = (targetText, isStreaming) => {
  const [displayedText, setDisplayedText] = useState(targetText || "");
  const requestRef = useRef();
  const targetRef = useRef(targetText || "");
  const currentRef = useRef(targetText || "");

  targetRef.current = targetText || "";

  useEffect(() => {
    // If stream ends or is inactive, sync immediately and stop animation loop
    if (!isStreaming) {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      setDisplayedText(targetRef.current);
      currentRef.current = targetRef.current;
      return;
    }

    const animate = () => {
      const target = targetRef.current;
      const current = currentRef.current;

      if (current !== target) {
        const diff = target.length - current.length;
        if (diff > 0) {
          // Adaptive easing: large jumps update faster, small increments flow character-by-character
          const step = Math.max(1, Math.ceil(diff * 0.15));
          const nextText = target.slice(0, current.length + step);
          currentRef.current = nextText;
          setDisplayedText(nextText);
        } else {
          // Reset if target text shrinks or shifts
          currentRef.current = target;
          setDisplayedText(target);
        }
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isStreaming]);

  // Ensure content stays perfectly in sync when idle or updating post-stream
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(targetText || "");
      currentRef.current = targetText || "";
    }
  }, [targetText, isStreaming]);

  return displayedText;
};
