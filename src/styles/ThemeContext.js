"use client";
/**
 * ThemeContext — provides live color/component/typography tokens
 * based on the current theme mode ("dark" | "light").
 *
 * Usage:
 *   const { colors, components, typography, mode } = useAppTheme();
 */
import React, { createContext, useContext, useMemo } from "react";
import { getColors, getComponents, getTypography } from "../styles/theme";

const ThemeContext = createContext(null);

export const AppThemeProvider = ({ mode = "dark", children }) => {
  const value = useMemo(() => {
    const c = getColors(mode);
    return {
      mode,
      colors: c,
      components: getComponents(c),
      typography: getTypography(c),
    };
  }, [mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

/** Hook to consume theme tokens anywhere in the tree. */
export const useAppTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback to dark for components that haven't been wrapped yet
    const c = getColors("dark");
    return { mode: "dark", colors: c, components: getComponents(c), typography: getTypography(c) };
  }
  return ctx;
};
