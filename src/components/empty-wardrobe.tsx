"use client";

import Link from "next/link";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import BoltIcon from "@mui/icons-material/Bolt";
import { BRAND_GRADIENT, SOFT_GRADIENT } from "@/lib/theme";

const FEATURES = [
  {
    icon: <BoltIcon />,
    title: "Auto-tagged by Gemini",
    body: "Snap a photo — we detect category, color, style, material, and vibe.",
  },
  {
    icon: <AutoFixHighIcon />,
    title: "Outfits on demand",
    body: "Pick an occasion or a single piece — get a styled look in seconds.",
  },
];

export default function EmptyWardrobe() {
  return (
    <Card
      sx={{
        overflow: "hidden",
        background: SOFT_GRADIENT,
        border: "1px solid rgba(99,102,241,0.18)",
      }}
    >
      <Box
        sx={{
          p: { xs: 3, sm: 5, md: 6 },
          display: "grid",
          gap: { xs: 4, md: 6 },
          gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" },
          alignItems: "center",
        }}
      >
        <Box>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
              px: 1.25,
              py: 0.5,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "secondary.main",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              mb: 2,
            }}
          >
            <BoltIcon sx={{ fontSize: 14 }} /> Powered by Gemini 1.5 Flash
          </Box>
          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: 28, sm: 36, md: 44 },
              lineHeight: 1.1,
              mb: 1.5,
            }}
          >
            Your closet, made smart.
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, fontSize: { xs: 15, sm: 16 }, maxWidth: 520 }}
          >
            Upload a few photos of your clothes and FitCheck builds you a
            personal stylist that knows your wardrobe inside-out — for free.
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            <Button
              component={Link}
              href="/upload"
              size="large"
              startIcon={<CloudUploadIcon />}
              sx={{
                background: BRAND_GRADIENT,
                color: "white",
                px: 3,
                py: 1.5,
                fontSize: 16,
                ":hover": {
                  background: BRAND_GRADIENT,
                  filter: "brightness(0.95)",
                },
              }}
            >
              Upload your first piece
            </Button>
            <Button
              component={Link}
              href="/dress-me"
              size="large"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              sx={{ px: 3, py: 1.5, fontSize: 16 }}
            >
              See how it works
            </Button>
          </Stack>
        </Box>

        <Box
          sx={{
            position: "relative",
            display: { xs: "none", md: "flex" },
            justifyContent: "center",
          }}
        >
          <FloatingHero />
        </Box>
      </Box>

      <Box
        sx={{
          borderTop: "1px solid rgba(99,102,241,0.15)",
          bgcolor: "rgba(255,255,255,0.6)",
          p: { xs: 2, sm: 3 },
          display: "grid",
          gap: { xs: 2, sm: 3 },
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
        }}
      >
        {FEATURES.map((f) => (
          <Stack
            key={f.title}
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "flex-start" }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                background: BRAND_GRADIENT,
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {f.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                {f.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {f.body}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Box>
    </Card>
  );
}

function FloatingHero() {
  // Decorative stack of "garment" cards rendered with pure CSS — no asset needed.
  const cards = [
    { rotate: -10, top: 0, left: 0, color: "#ffffff" },
    { rotate: 4, top: 30, left: 80, color: "#f5f3ff" },
    { rotate: 14, top: 70, left: 160, color: "#eef2ff" },
  ];
  return (
    <Box sx={{ position: "relative", width: 280, height: 260 }}>
      {cards.map((c, i) => (
        <Box
          key={i}
          sx={{
            position: "absolute",
            top: c.top,
            left: c.left,
            width: 130,
            height: 170,
            borderRadius: 3,
            bgcolor: c.color,
            border: "1px solid rgba(99,102,241,0.18)",
            boxShadow: "0 18px 40px rgba(15,23,42,0.10)",
            transform: `rotate(${c.rotate}deg)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(99,102,241,0.5)",
          }}
        >
          <CheckroomIcon sx={{ fontSize: 56 }} />
        </Box>
      ))}
      <Box
        sx={{
          position: "absolute",
          bottom: -10,
          right: -10,
          px: 1.5,
          py: 0.75,
          bgcolor: "white",
          border: "1px solid #ececec",
          borderRadius: 2,
          boxShadow: "0 8px 24px rgba(15,23,42,0.10)",
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "#10b981",
          }}
        />
        Tagged in 2s
      </Box>
    </Box>
  );
}
