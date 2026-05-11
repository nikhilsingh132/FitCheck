"use client";

import * as React from "react";
import { Backdrop, Box, Fade, Stack, Typography } from "@mui/material";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { BRAND_GRADIENT } from "@/lib/theme";

type StylingOverlayProps = {
  open: boolean;
  /** Primary heading shown in the overlay (e.g. "Styling your outfit"). */
  title?: string;
  /**
   * Optional rotating sub-messages. If provided, we cycle through them every
   * ~2.4s so the user feels something is happening even on slow API calls.
   */
  messages?: string[];
  /** Static sub-message; used when `messages` isn't provided. */
  subtitle?: string;
};

const DEFAULT_MESSAGES = [
  "Hand-picking pieces from your closet…",
  "Matching colors and silhouettes…",
  "Asking Gemini for the perfect look…",
  "Almost there — adding the final touches…",
];

/**
 * Full-screen branded loader used during long styling flows (upload tagging,
 * "Style me now", "Complete the look"). Renders on top of everything via MUI
 * Backdrop so the user can't accidentally re-trigger the action.
 */
export default function StylingOverlay({
  open,
  title = "Styling in progress",
  messages,
  subtitle,
}: StylingOverlayProps) {
  const rotating = messages && messages.length > 0 ? messages : DEFAULT_MESSAGES;
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    if (!open || subtitle) return;
    setIdx(0);
    const interval = window.setInterval(() => {
      setIdx((i) => (i + 1) % rotating.length);
    }, 2400);
    return () => window.clearInterval(interval);
  }, [open, subtitle, rotating.length]);

  const sub = subtitle ?? rotating[idx];

  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: (t) => t.zIndex.modal + 10,
        color: "white",
        backdropFilter: "blur(10px)",
        backgroundColor: "rgba(15, 23, 42, 0.55)",
      }}
    >
      <Stack
        spacing={3}
        sx={{
          alignItems: "center",
          maxWidth: 320,
          textAlign: "center",
          px: 3,
        }}
      >
        <LoaderArt />

        <Box>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              letterSpacing: "-0.01em",
              fontSize: { xs: 18, sm: 20 },
              mb: 0.75,
            }}
          >
            {title}
          </Typography>

          {/* Crossfade the rotating sub-message so it feels alive. */}
          <Box sx={{ position: "relative", minHeight: 22 }}>
            <Fade key={sub} in timeout={400}>
              <Typography
                variant="body2"
                sx={{
                  opacity: 0.85,
                  fontSize: { xs: 13, sm: 14 },
                  position: "absolute",
                  left: 0,
                  right: 0,
                }}
              >
                {sub}
              </Typography>
            </Fade>
          </Box>
        </Box>
      </Stack>
    </Backdrop>
  );
}

/**
 * Pure CSS/SVG loader: a brand-gradient ring with a slow orbiting sparkle and
 * a "wardrobe" icon in the center. Avoids pulling in a Lottie/animation dep
 * for a single decorative element.
 */
function LoaderArt() {
  return (
    <Box
      sx={{
        position: "relative",
        width: 120,
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: BRAND_GRADIENT,
          opacity: 0.18,
          filter: "blur(18px)",
          animation: "fc-pulse 2s ease-in-out infinite",
        }}
      />

      <Box
        component="svg"
        viewBox="0 0 100 100"
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          animation: "fc-spin 1.6s linear infinite",
        }}
      >
        <defs>
          <linearGradient id="fc-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="4"
        />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="url(#fc-ring)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="80 200"
        />
      </Box>

      <Box
        sx={{
          position: "absolute",
          inset: 10,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.95) 0%, rgba(168,85,247,0.95) 100%)",
          boxShadow: "0 12px 30px rgba(99,102,241,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}
      >
        <CheckroomIcon sx={{ fontSize: 40 }} />
      </Box>

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          animation: "fc-orbit 2.4s linear infinite",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: -2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 22,
            height: 22,
            borderRadius: "50%",
            bgcolor: "white",
            color: "secondary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 14px rgba(15,23,42,0.25)",
          }}
        >
          <AutoFixHighIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>

      <Box
        component="style"
        // Scoped keyframes injected once with the component. Kept here so the
        // overlay is fully self-contained and doesn't depend on global CSS.
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes fc-spin { to { transform: rotate(360deg); } }
            @keyframes fc-orbit { to { transform: rotate(360deg); } }
            @keyframes fc-pulse {
              0%, 100% { opacity: 0.18; transform: scale(1); }
              50% { opacity: 0.35; transform: scale(1.06); }
            }
          `,
        }}
      />
    </Box>
  );
}
