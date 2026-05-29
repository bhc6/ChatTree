// Shared color tokens for dark and light modes.
// Use getColors(mode) in components — never import 'colors' directly.

// ─── Dark palette ────────────────────────────────────────────────────────────
const darkColors = {
  bg: {
    primary: "#1a1c1d",
    secondary: "#333738",
    tertiary: "#3a3d3e",
    hover: "#454849",
    input: "#1a1c1d",
    userMessage: "#2d3d4a",
  },
  border: {
    primary: "#777066",
    secondary: "#555048",
    subtle: "#3a3d3e",
  },
  text: {
    primary: "rgba(216, 215, 212, 0.87)",
    secondary: "#aaa59d",
    muted: "#999187",
    dim: "#777066",
    placeholder: "#777066",
  },
  accent: {
    blue: "#4a9eff",
    blueHover: "#3a8eef",
    orange: "#ff9800",
    orangeHover: "#ffb74d",
    green: "#81c784",
    userLabel: "#8ab4f8",
    error: "#f44336",
    delete: "#f44",
  },
  button: {
    primary: "#4a9eff",
    primaryHover: "#3a8eef",
    secondary: "#555048",
    secondaryHover: "#777066",
    danger: "#5c3a3a",
    dangerHover: "#7a4a4a",
    disabled: "#555048",
    disabledText: "#777066",
  },
  // Flow canvas
  flow: {
    background: "#1a1c1d",
    dot: "#3a3d3e",
  },
};

// ─── Light palette ───────────────────────────────────────────────────────────
const lightColors = {
  bg: {
    primary: "#f5f4f2",
    secondary: "#ffffff",
    tertiary: "#eeece8",
    hover: "#e4e1db",
    input: "#ffffff",
    userMessage: "#dbeafe",
  },
  border: {
    primary: "#c4bfb5",
    secondary: "#d8d3c9",
    subtle: "#eae6e0",
  },
  text: {
    primary: "#1a1a18",
    secondary: "#57534a",
    muted: "#78746a",
    dim: "#a09890",
    placeholder: "#a09890",
  },
  accent: {
    blue: "#1d6fe8",
    blueHover: "#1558c4",
    orange: "#e07b00",
    orangeHover: "#b86200",
    green: "#2e7d32",
    userLabel: "#1558c4",
    error: "#c62828",
    delete: "#c62828",
  },
  button: {
    primary: "#1d6fe8",
    primaryHover: "#1558c4",
    secondary: "#e4e1db",
    secondaryHover: "#d4d0c8",
    danger: "#fce8e8",
    dangerHover: "#f8d0d0",
    disabled: "#e4e1db",
    disabledText: "#a09890",
  },
  flow: {
    background: "#f0ede8",
    dot: "#d0ccc4",
  },
};

// ─── Exports ─────────────────────────────────────────────────────────────────
export const radius = {
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "10px",
  xl: "12px",
  xxl: "14px",
};

export const getColors = (mode = "dark") =>
  mode === "light" ? lightColors : darkColors;

// Legacy default export (dark) — kept so existing files don't break
// until they're migrated to use ThemeContext.
export const colors = darkColors;

// Build components object from a colors palette
export const getComponents = (c) => ({
  textField: {
    "& .MuiOutlinedInput-root": {
      borderRadius: radius.md,
      backgroundColor: "transparent",
      color: c.text.primary,
      "& fieldset": { borderColor: c.border.secondary },
      "&:hover fieldset": { borderColor: c.border.primary },
      "&.Mui-focused fieldset": { borderColor: c.accent.blue },
    },
    "& .MuiInputBase-input::placeholder": { color: c.text.muted },
  },
  textFieldWithLabel: {
    "& .MuiOutlinedInput-root": {
      borderRadius: radius.md,
      backgroundColor: "transparent",
      color: c.text.primary,
      "& fieldset": { borderColor: c.border.secondary },
      "&:hover fieldset": { borderColor: c.border.primary },
      "&.Mui-focused fieldset": { borderColor: c.accent.blue },
    },
    "& .MuiInputLabel-root": { color: c.text.muted },
    "& .MuiInputLabel-root.Mui-focused": { color: c.accent.blue },
  },
  select: {
    borderRadius: radius.md,
    backgroundColor: "transparent",
    color: c.text.primary,
    "& .MuiOutlinedInput-notchedOutline": { borderColor: c.border.secondary, borderRadius: radius.md },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: c.border.primary },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: c.accent.blue },
    "& .MuiSvgIcon-root": { color: c.text.muted },
  },
  panel: {
    backgroundColor: c.bg.secondary,
    border: `1px solid ${c.border.primary}`,
    borderRadius: radius.xl,
  },
  modal: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: c.bg.secondary,
    border: `1px solid ${c.border.primary}`,
    borderRadius: radius.xxl,
    p: 3,
    maxHeight: "90vh",
    overflowY: "auto",
    boxSizing: "border-box",
    scrollbarWidth: "thin",
    "&::-webkit-scrollbar": {
      width: "6px",
    },
    "&::-webkit-scrollbar-track": {
      backgroundColor: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: "rgba(128, 128, 128, 0.2)",
      borderRadius: radius.xs,
    },
  },
  buttonPrimary: {
    backgroundColor: "transparent",
    color: c.text.primary,
    "&:hover": { backgroundColor: `rgba(${c.accent.blue}, 0.1)` },
    "&.Mui-disabled": { color: c.button.disabledText },
  },
  buttonSecondary: {
    py: 1,
    backgroundColor: c.bg.tertiary,
    color: c.text.primary,
    textTransform: "none",
    fontWeight: 500,
    border: `1px solid ${c.border.secondary}`,
    "&:hover": {
      backgroundColor: c.bg.hover,
      borderColor: c.border.primary,
    },
    "&.Mui-disabled": {
      backgroundColor: c.bg.secondary,
      color: c.border.secondary,
      borderColor: c.border.subtle,
    },
  },
  iconButton: {
    backgroundColor: c.button.secondary,
    color: c.text.primary,
    width: 24,
    height: 24,
    "&:hover": { backgroundColor: c.button.secondaryHover },
  },
  iconButtonDanger: {
    backgroundColor: c.button.danger,
    color: c.accent.error,
    width: 24,
    height: 24,
    "&:hover": { backgroundColor: c.button.dangerHover },
  },
  divider: { borderColor: c.border.secondary },
  listItemButton: {
    borderRadius: radius.sm,
    py: 0.5,
    "&.Mui-selected": {
      backgroundColor: c.bg.tertiary,
      "&:hover": { backgroundColor: c.bg.hover },
    },
    "&:hover": { backgroundColor: c.bg.tertiary },
  },
  hoverBox: {
    "&:hover": { backgroundColor: c.bg.tertiary },
    borderRadius: radius.sm,
    cursor: "pointer",
  },
  iconButtonMuted: {
    color: c.text.muted,
    p: 0.5,
    "&:hover": { color: c.text.primary },
  },
  checkbox: {
    color: c.text.muted,
    "&.Mui-checked": { color: c.accent.blue },
  },
  iconButtonToggle: {
    base: {
      backgroundColor: "transparent",
      color: c.text.muted,
      "&:hover": { backgroundColor: "rgba(128,128,128,0.12)", color: c.text.muted },
      "& .MuiSvgIcon-root": { color: c.text.muted },
    },
    active: {
      backgroundColor: "rgba(128,128,128,0.14)",
      color: c.text.primary,
      "&:hover": { backgroundColor: "rgba(128,128,128,0.2)", color: c.text.primary },
      "& .MuiSvgIcon-root": { color: c.text.primary },
    },
  },
});

export const getTypography = (c) => ({
  primary: { color: c.text.primary },
  secondary: { color: c.text.secondary },
  muted: { color: c.text.muted },
  dim: { color: c.text.dim },
  accent: { color: c.accent.blue },
  error: { color: c.accent.error },
});

// Legacy static exports (dark mode defaults)
export const components = getComponents(darkColors);
export const typography = getTypography(darkColors);

const theme = { colors, components, typography, radius };
export default theme;
