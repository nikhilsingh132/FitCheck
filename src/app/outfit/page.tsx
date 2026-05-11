"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Box, Button, Stack } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useSnackbar } from "notistack";
import OutfitDisplay from "@/components/outfit-display";
import PageHeader from "@/components/page-header";
import StylingOverlay from "@/components/styling-overlay";
import { BRAND_GRADIENT } from "@/lib/theme";
import { useDeleteItem } from "@/lib/use-delete-item";
import { apiFetch } from "@/lib/api-client";
import { friendlyError } from "@/lib/friendly-error";
import {
  readLatestOutfit,
  writeLatestOutfit,
  type StoredOutfit,
} from "@/lib/outfit-store";
import { formatOutfitTitle } from "@/lib/outfit-title";
import type { WardrobeItem } from "@/lib/types";

// Where this outfit came from, used to label the back button and decide
// which API to hit when the user wants a different outfit. Defaults to
// "dress-me" if the param is missing or unrecognized — it's the most
// common entry point.
type Source = "match" | "dress-me";

function parseSource(raw: string | null): Source {
  return raw === "match" ? "match" : "dress-me";
}

const SOURCE_META: Record<
  Source,
  { backHref: string; backLabel: string; eyebrow: string }
> = {
  match: {
    backHref: "/match",
    backLabel: "Back to Match",
    eyebrow: "Match",
  },
  "dress-me": {
    backHref: "/dress-me",
    backLabel: "Back to Dress Me",
    eyebrow: "Dress Me",
  },
};

type ReshuffleResponse = {
  items?: WardrobeItem[];
  reasoning?: string;
  vibe?: string;
  occasion?: string;
  error?: string;
  no_alternative?: boolean;
  reason?: string;
};

export default function OutfitResultPage() {
  // useSearchParams() must be inside a Suspense boundary in the App Router.
  return (
    <React.Suspense fallback={<Box sx={{ minHeight: 200 }} />}>
      <OutfitResultContent />
    </React.Suspense>
  );
}

function OutfitResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const source = parseSource(params.get("from"));
  const meta = SOURCE_META[source];

  // Hydrate from sessionStorage on mount only. We mirror it into local
  // state so deletions update the UI without re-reading storage.
  const [outfit, setOutfit] = React.useState<StoredOutfit | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [shuffling, setShuffling] = React.useState(false);

  React.useEffect(() => {
    setOutfit(readLatestOutfit());
    setHydrated(true);
  }, []);

  const { deleteItem } = useDeleteItem({
    onDeleted: (id) => {
      setOutfit((prev) => {
        if (!prev) return prev;
        const next: StoredOutfit = {
          ...prev,
          items: prev.items.filter((i) => i.id !== id),
        };
        // Keep storage in sync so a refresh doesn't resurrect the deleted item.
        writeLatestOutfit(next);
        return next;
      });
    },
  });

  // Re-roll the outfit in place using the same form inputs the user
  // submitted originally (occasion for Dress Me, pinned ids for Match).
  // The previous outfit's ids go in `exclude_item_ids` so the API knows
  // to swap at least half.
  const shuffle = React.useCallback(async () => {
    if (!outfit || shuffling) return;

    // For Dress Me we need a remembered occasion. For Match we need at
    // least one seed id. If either is missing (e.g. stale storage from
    // before this feature shipped), send the user back to the form.
    if (source === "dress-me" && !outfit.occasion) {
      router.push(meta.backHref);
      return;
    }
    if (source === "match" && (!outfit.seedIds || outfit.seedIds.length === 0)) {
      router.push(meta.backHref);
      return;
    }

    setShuffling(true);
    try {
      const excludeIds = outfit.items.map((i) => i.id);
      const endpoint =
        source === "dress-me" ? "/api/dress-me" : "/api/match";
      const payload =
        source === "dress-me"
          ? { occasion: outfit.occasion, exclude_item_ids: excludeIds }
          : { item_ids: outfit.seedIds, exclude_item_ids: excludeIds };

      const res = await apiFetch(endpoint, { method: "POST", json: payload });
      const json = (await res.json()) as ReshuffleResponse;
      if (!res.ok) throw new Error(json.error || "Failed to reshuffle");

      if (json.no_alternative || !json.items || json.items.length === 0) {
        enqueueSnackbar(
          json.reason ??
            "No new combinations — add more items to your closet for more variety.",
          { variant: "info" },
        );
        return;
      }

      const next: StoredOutfit = {
        ...outfit,
        items: json.items,
        reasoning: json.reasoning ?? outfit.reasoning,
        vibe: json.vibe ?? outfit.vibe,
        title:
          source === "dress-me"
            ? formatOutfitTitle(json.occasion ?? outfit.occasion ?? "")
            : outfit.title,
      };
      setOutfit(next);
      writeLatestOutfit(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reshuffle failed";
      enqueueSnackbar(friendlyError(msg), { variant: "error" });
    } finally {
      setShuffling(false);
    }
  }, [outfit, shuffling, source, meta.backHref, router, enqueueSnackbar]);

  // Pre-hydration render: keep the page calm so we don't flash the empty
  // state for users coming from a fresh /match or /dress-me submission.
  if (!hydrated) {
    return <Box sx={{ minHeight: 200 }} />;
  }

  if (!outfit || outfit.items.length === 0) {
    return (
      <Box>
        <PageHeader
          eyebrow={meta.eyebrow}
          title="No outfit yet"
          subtitle="It looks like you landed here directly. Head back and generate a look first."
        />
        <Button
          component={Link}
          href={meta.backHref}
          startIcon={<ArrowBackIcon />}
          sx={{
            background: BRAND_GRADIENT,
            color: "white",
            py: 1.25,
            px: 2.5,
            ":hover": {
              background: BRAND_GRADIENT,
              filter: "brightness(0.95)",
            },
          }}
        >
          {meta.backLabel}
        </Button>
      </Box>
    );
  }

  // Disable shuffle if we lack the context to refire the API. (Older
  // sessionStorage payloads from before this feature won't have it.)
  const canShuffle =
    source === "dress-me"
      ? Boolean(outfit.occasion)
      : Boolean(outfit.seedIds && outfit.seedIds.length > 0);

  return (
    // pb leaves room for the fixed shuffle bar at the bottom so the last
    // outfit card never gets hidden behind it. Tuned for the bar's ~72px
    // height plus a little breathing room.
    <Box sx={{ pb: { xs: 12, sm: 13 } }}>
      <StylingOverlay
        open={shuffling}
        title="Restyling your outfit"
        messages={[
          "Reshuffling your closet for a fresh look…",
          "Swapping pieces while keeping the vibe…",
          "Asking Gemini for a different combination…",
          "Almost there — finalizing the new outfit…",
        ]}
      />

      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 1.5, alignItems: "center" }}
      >
        <Button
          onClick={() => router.push(meta.backHref)}
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          sx={{
            color: "secondary.main",
            borderColor: "rgba(99,102,241,0.4)",
            bgcolor: "rgba(99,102,241,0.06)",
            ":hover": {
              borderColor: "secondary.main",
              bgcolor: "rgba(99,102,241,0.12)",
            },
          }}
        >
          {meta.backLabel}
        </Button>
      </Stack>

      <PageHeader
        eyebrow={meta.eyebrow}
        title={outfit.title ?? "Your outfit"}
        subtitle={
          source === "match"
            ? "Here's the look Gemini built around your selected pieces."
            : "Here's the look Gemini styled for your occasion."
        }
      />

      {/* No `title` here on purpose: the PageHeader above already shows
          the outfit title. Repeating it inside the card caused two large
          headings to stack on mobile and wrap word-by-word. */}
      <OutfitDisplay
        items={outfit.items}
        reasoning={outfit.reasoning}
        vibe={outfit.vibe}
        onDelete={deleteItem}
      />

      {/* Fixed bottom action bar so "Try a different outfit" is always
          reachable without scrolling — important on long outfit pages on
          mobile. We pin to the viewport, blur the background behind it,
          and respect the iOS safe-area inset. */}
      <Box
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          px: { xs: 2, md: 4 },
          pt: 1.5,
          pb: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          background:
            "linear-gradient(to top, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0) 100%)",
          backdropFilter: "blur(10px)",
          pointerEvents: "none",
        }}
      >
        <Box
          sx={{
            maxWidth: 1400,
            mx: "auto",
            pointerEvents: "auto",
          }}
        >
          <Button
            onClick={shuffle}
            startIcon={<ShuffleIcon />}
            disabled={!canShuffle || shuffling}
            fullWidth
            sx={{
              background: BRAND_GRADIENT,
              color: "white",
              py: 1.4,
              fontWeight: 600,
              boxShadow: "0 10px 30px rgba(99,102,241,0.35)",
              ":hover": {
                background: BRAND_GRADIENT,
                filter: "brightness(0.95)",
              },
              "&.Mui-disabled": { background: "#e2e8f0", color: "#94a3b8" },
            }}
          >
            {shuffling ? "Restyling…" : "Try a different outfit"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
