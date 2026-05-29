/**
 * Toggle icon for lock scroll on node focus
 */
import React from "react";
import { IconButton } from "@mui/material";
import ExpandIcon from "@mui/icons-material/Expand";
import WebAssetOffIcon from "@mui/icons-material/WebAssetOff";
import { useAppTheme } from "../styles/ThemeContext";

const LockScrollToggle = ({
  locked,
  onToggle,
  size = "medium",
  asIcon = false,
}) => {
  const { colors } = useAppTheme();
  const iconSize = size === "small" ? 16 : 20;

  const icon = locked ? (
    <ExpandIcon sx={{ fontSize: iconSize, color: colors.text.muted }} />
  ) : (
    <WebAssetOffIcon sx={{ fontSize: iconSize, color: colors.text.muted }} />
  );

  // When used inside ControlButton, just return the icon
  if (asIcon) {
    return icon;
  }

  return (
    <IconButton
      onClick={onToggle}
      size={size}
      title={locked ? "(click to unlock)" : "(click to lock on node hover)"}
      sx={{
        color: colors.text.muted,
        "&:hover": {
          backgroundColor: colors.bg.hover,
          color: colors.text.primary,
        },
      }}
    >
      {icon}
    </IconButton>
  );
};

export default LockScrollToggle;
