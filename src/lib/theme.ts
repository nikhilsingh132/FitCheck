"use client";

import { createTheme, alpha } from "@mui/material/styles";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "Arial"],
});

// Brand colors. Indigo+violet gradient for the hero/CTA, near-black for primary text.
const PRIMARY = "#0f172a"; // slate-900
const ACCENT_FROM = "#6366f1"; // indigo-500
const ACCENT_TO = "#a855f7"; // purple-500

export const BRAND_GRADIENT = `linear-gradient(135deg, ${ACCENT_FROM} 0%, ${ACCENT_TO} 100%)`;
export const SOFT_GRADIENT = `linear-gradient(135deg, ${alpha(ACCENT_FROM, 0.08)} 0%, ${alpha(ACCENT_TO, 0.08)} 100%)`;

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: {
      main: PRIMARY,
      contrastText: "#ffffff",
    },
    secondary: {
      main: ACCENT_FROM,
    },
    background: {
      default: "#fafaf7", // warm off-white
      paper: "#ffffff",
    },
    divider: "#ececec",
    text: {
      primary: "#0f172a",
      secondary: "#64748b",
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: inter.style.fontFamily,
    h1: { fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontWeight: 800, letterSpacing: "-0.02em" },
    h3: { fontWeight: 800, letterSpacing: "-0.02em" },
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid #ececec",
          boxShadow: "none",
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "transparent" },
      styleOverrides: {
        root: {
          backdropFilter: "blur(14px)",
          backgroundColor: "rgba(255,255,255,0.85)",
          borderBottom: "1px solid #ececec",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
  },
});

export default theme;
