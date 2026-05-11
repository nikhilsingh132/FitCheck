"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { useSnackbar } from "notistack";
import { OCCASIONS } from "@/lib/constants";
import PageHeader from "@/components/page-header";
import StylingOverlay from "@/components/styling-overlay";
import { BRAND_GRADIENT } from "@/lib/theme";
import { apiFetch } from "@/lib/api-client";
import { friendlyError } from "@/lib/friendly-error";
import { writeLatestOutfit } from "@/lib/outfit-store";
import { formatOutfitTitle } from "@/lib/outfit-title";
import type { WardrobeItem } from "@/lib/types";

type ApiResult = {
  occasion: string;
  reasoning: string;
  vibe: string;
  items: WardrobeItem[];
};

export default function DressMePage() {
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();
  const [occasion, setOccasion] = React.useState<string>("Office");
  const [custom, setCustom] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const submit = async (occ: string) => {
    if (!occ.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/dress-me", {
        method: "POST",
        json: { occasion: occ },
      });
      const json = (await res.json()) as ApiResult & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to generate outfit");
      // Stash and route to the dedicated result screen so the user lands
      // directly on the outfit instead of scrolling past the form.
      writeLatestOutfit({
        items: json.items,
        reasoning: json.reasoning,
        vibe: json.vibe,
        title: formatOutfitTitle(json.occasion),
        source: "dress-me",
        occasion: json.occasion,
      });
      router.push("/outfit?from=dress-me");
      // Keep the overlay visible until the new route takes over.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      enqueueSnackbar(friendlyError(msg), { variant: "error" });
      setLoading(false);
    }
  };

  return (
    <Box>
      <StylingOverlay
        open={loading}
        title="Styling your outfit"
        messages={[
          `Picking the perfect look for ${custom.trim() || occasion}…`,
          "Matching colors, fabrics, and silhouettes…",
          "Asking Gemini to play personal stylist…",
          "Almost there — adding the final touches…",
        ]}
      />
      <PageHeader
        eyebrow="Dress Me"
        title="Style me for an occasion"
        subtitle="Pick a vibe and Gemini will assemble a full outfit from your closet — with reasoning for every choice."
      />

      <Box
        sx={{
          display: "grid",
          gap: { xs: 1.25, sm: 2 },
          gridTemplateColumns: {
            xs: "repeat(3, 1fr)",
            sm: "repeat(3, 1fr)",
            md: "repeat(6, 1fr)",
          },
          mb: 3,
        }}
      >
        {OCCASIONS.map(({ value, label, icon: Icon }) => {
          const active = occasion === value;
          return (
            <Card
              key={value}
              sx={{
                borderColor: active ? "secondary.main" : undefined,
                borderWidth: active ? 2 : 1,
                background: active
                  ? "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.08) 100%)"
                  : undefined,
                transition: "all 150ms ease",
              }}
            >
              <CardActionArea
                onClick={() => setOccasion(value)}
                sx={{
                  p: { xs: 1.25, sm: 2 },
                  minHeight: 92,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active ? BRAND_GRADIENT : "rgba(99,102,241,0.08)",
                    color: active ? "white" : "secondary.main",
                  }}
                >
                  <Icon fontSize="small" />
                </Box>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontSize: { xs: 12, sm: 14 } }}
                >
                  {label}
                </Typography>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      {/*
        Custom-occasion row. On desktop we cap the input width so it
        doesn't sprawl across the full content column (which looked
        awkward with a tiny ~30-char input stretched to 1000+ px). The
        button sits next to it and aligns to the field — not the helper
        text — by anchoring both to `flex-start` and adding a top offset
        on the button so it lines up with the input's visual center.
      */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{
          mb: 3,
          alignItems: { xs: "stretch", sm: "flex-start" },
          maxWidth: { sm: 720 },
        }}
      >
        <TextField
          size="small"
          label="Or describe a custom occasion"
          placeholder="e.g. beach wedding"
          value={custom}
          onChange={(e) => setCustom(e.target.value.slice(0, 50))}
          fullWidth
          slotProps={{ htmlInput: { maxLength: 50 } }}
          helperText={`${custom.length}/50`}
          sx={{ maxWidth: { sm: 420 } }}
        />
        <Button
          startIcon={<AutoFixHighIcon />}
          disabled={loading}
          onClick={() => submit(custom.trim() || occasion)}
          sx={{
            width: { xs: "100%", sm: "auto" },
            minWidth: { sm: 180 },
            // Field with `size="small"` is ~40px tall; this matches and
            // keeps the button visually aligned with the input row even
            // though the helperText below adds extra space to the field.
            height: { sm: 40 },
            mt: { sm: "8px" },
            whiteSpace: "nowrap",
            background: BRAND_GRADIENT,
            color: "white",
            py: 1.25,
            ":hover": {
              background: BRAND_GRADIENT,
              filter: "brightness(0.95)",
            },
            "&.Mui-disabled": { background: "#e2e8f0", color: "#94a3b8" },
          }}
        >
          {loading ? "Styling…" : "Style my outfit"}
        </Button>
      </Stack>

      {!loading && (
        <Alert severity="info">
          Pick an occasion above (or type a custom one) and hit “Style my
          outfit”.
        </Alert>
      )}
    </Box>
  );
}
