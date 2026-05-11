"use client";

import * as React from "react";
import { Box, Stack, Typography, Chip } from "@mui/material";

type Props = {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: { label: string; icon?: React.ReactNode };
  actions?: React.ReactNode;
};

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  actions,
}: Props) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        mb: { xs: 3, md: 4 },
        alignItems: { md: "flex-end" },
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography
            variant="overline"
            sx={{
              color: "secondary.main",
              fontWeight: 700,
              letterSpacing: "0.12em",
              display: "block",
              mb: 0.5,
            }}
          >
            {eyebrow}
          </Typography>
        )}
        <Typography
          variant="h4"
          sx={{
            // Slightly smaller on phones so long titles like "Outfit for
            // beach wedding" don't break one-word-per-line. `text-wrap:
            // balance` distributes leftover words evenly across the last
            // two lines instead of leaving a stranded word, and
            // `overflow-wrap: anywhere` is a safety net for very long
            // unbroken tokens.
            fontSize: { xs: 22, sm: 30, md: 36 },
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            textWrap: "balance",
            overflowWrap: "anywhere",
            mb: subtitle ? 0.75 : 0,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 640, fontSize: { xs: 14, sm: 15 } }}
          >
            {subtitle}
          </Typography>
        )}
        {badge && (
          <Chip
            size="small"
            icon={badge.icon as React.ReactElement | undefined}
            label={badge.label}
            sx={{
              mt: 1.25,
              bgcolor: "rgba(99,102,241,0.10)",
              color: "secondary.main",
              fontWeight: 600,
              border: "1px solid rgba(99,102,241,0.25)",
            }}
          />
        )}
      </Box>
      {actions && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            width: { xs: "100%", md: "auto" },
            flexShrink: 0,
          }}
        >
          {actions}
        </Box>
      )}
    </Stack>
  );
}
