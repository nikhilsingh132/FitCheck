"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
} from "@mui/material";
import JoinFullIcon from "@mui/icons-material/JoinFull";
import { useSnackbar } from "notistack";
import WardrobeGrid from "@/components/wardrobe-grid";
import PageHeader from "@/components/page-header";
import StylingOverlay from "@/components/styling-overlay";
import { CATEGORIES } from "@/lib/constants";
import { BRAND_GRADIENT } from "@/lib/theme";
import { useDeleteItem } from "@/lib/use-delete-item";
import { apiFetch } from "@/lib/api-client";
import { friendlyError } from "@/lib/friendly-error";
import { writeLatestOutfit } from "@/lib/outfit-store";
import type { WardrobeItem } from "@/lib/types";

type ApiResult = {
  reasoning: string;
  vibe: string;
  items: WardrobeItem[];
};

export default function MatchPage() {
  const { enqueueSnackbar } = useSnackbar();
  const router = useRouter();
  const [items, setItems] = React.useState<WardrobeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<string | null>(null);
  const [matching, setMatching] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch("/api/wardrobe", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setItems(json.items as WardrobeItem[]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        enqueueSnackbar(friendlyError(msg), { variant: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [enqueueSnackbar]);

  const { deleteItem } = useDeleteItem({
    onDeleted: (id) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const toggle = (item: WardrobeItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        if (next.size >= 2) {
          enqueueSnackbar("Pick at most 2 items.", { variant: "warning" });
          return prev;
        }
        next.add(item.id);
      }
      return next;
    });
  };

  const findMatch = async () => {
    if (selected.size === 0) return;
    setMatching(true);
    try {
      const res = await apiFetch("/api/match", {
        method: "POST",
        json: { item_ids: Array.from(selected) },
      });
      const json = (await res.json()) as ApiResult & { error?: string };
      if (!res.ok) throw new Error(json.error || "Match failed");
      // Stash the result and hand off to a dedicated screen so the user
      // doesn't have to scroll back up after the loader finishes.
      writeLatestOutfit({
        items: json.items,
        reasoning: json.reasoning,
        vibe: json.vibe,
        title: "Completed look",
        source: "match",
        seedIds: Array.from(selected),
      });
      router.push("/outfit?from=match");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Match failed";
      enqueueSnackbar(friendlyError(msg), { variant: "error" });
      setMatching(false);
    }
    // Note: we intentionally leave `matching` true on success so the overlay
    // stays up until the new route renders, avoiding a flash of the old page.
  };

  const visible = filter ? items.filter((i) => i.category === filter) : items;

  return (
    <Box>
      <StylingOverlay
        open={matching}
        title="Completing the look"
        messages={[
          `Building an outfit around your ${selected.size === 1 ? "piece" : "pieces"}…`,
          "Pairing colors, materials, and proportions…",
          "Asking Gemini to finish the look…",
          "Almost there — putting it together…",
        ]}
      />
      <PageHeader
        eyebrow="Match"
        title="Complete the look"
        subtitle="Pick 1 or 2 pieces from your wardrobe — Gemini will assemble the rest of the outfit around them."
      />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ mb: 2, alignItems: { sm: "center" } }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            flex: 1,
            alignItems: "center",
            overflowX: "auto",
            pb: { xs: 0.5, sm: 0 },
            mx: { xs: -2, md: 0 },
            px: { xs: 2, md: 0 },
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          <Chip
            label="All"
            color={!filter ? "primary" : "default"}
            variant={!filter ? "filled" : "outlined"}
            onClick={() => setFilter(null)}
            sx={{ flexShrink: 0 }}
          />
          {CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              color={filter === c.value ? "primary" : "default"}
              variant={filter === c.value ? "filled" : "outlined"}
              onClick={() => setFilter(c.value)}
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Stack>
        <Button
          startIcon={<JoinFullIcon />}
          disabled={selected.size === 0 || matching}
          onClick={findMatch}
          sx={{
            width: { xs: "100%", sm: "auto" },
            minWidth: { sm: 200 },
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
          {matching
            ? "Finding match…"
            : selected.size === 0
              ? "Pick 1–2 items"
              : `Complete the look (${selected.size})`}
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Alert severity="info">
          Upload some items first, then come back to match outfits.
        </Alert>
      ) : (
        <WardrobeGrid
          items={visible}
          selectable
          selectedIds={selected}
          onSelect={toggle}
          onDelete={deleteItem}
        />
      )}
    </Box>
  );
}
