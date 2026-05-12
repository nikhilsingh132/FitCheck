"use client";

import * as React from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import HistoryIcon from "@mui/icons-material/History";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import PageHeader from "@/components/page-header";
import { apiFetch } from "@/lib/api-client";
import { BRAND_GRADIENT } from "@/lib/theme";
import { CATEGORIES } from "@/lib/constants";
import { useLocalImage } from "@/lib/use-local-image";
import type { OutfitRecord, WardrobeItem } from "@/lib/types";

// Order categories appear within each outfit card. Matches the wardrobe nav.
const CATEGORY_ORDER = CATEGORIES.map((c) => c.value);

type HydratedOutfit = OutfitRecord & {
  // Wardrobe items resolved from item_ids against the live wardrobe.
  // Missing entries are dropped here; we surface a "n missing" hint per
  // card so the user knows the outfit is no longer fully rebuildable.
  resolvedItems: WardrobeItem[];
  missingCount: number;
};

type DayBucket = {
  // Stable key derived from the local-date (YYYY-MM-DD). Outfits inside
  // are already newest-first thanks to the server's order().
  key: string;
  label: string;
  outfits: HydratedOutfit[];
};

// "Today" / "Yesterday" / "Wed, May 7" — locale-aware but day-stable.
function formatDayLabel(date: Date): string {
  const today = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(today) - startOfDay(date)) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function HistoryPage() {
  const [outfits, setOutfits] = React.useState<OutfitRecord[]>([]);
  const [wardrobe, setWardrobe] = React.useState<WardrobeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Parallel fetch: history + wardrobe (needed to resolve item_ids).
      const [hRes, wRes] = await Promise.all([
        apiFetch("/api/outfits", { cache: "no-store" }),
        apiFetch("/api/wardrobe", { cache: "no-store" }),
      ]);
      const [hJson, wJson] = await Promise.all([hRes.json(), wRes.json()]);
      if (!hRes.ok) throw new Error(hJson.error || "Failed to load history");
      if (!wRes.ok) throw new Error(wJson.error || "Failed to load wardrobe");
      setOutfits(hJson.outfits as OutfitRecord[]);
      setWardrobe(wJson.items as WardrobeItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Index wardrobe by id once so per-outfit resolution stays O(1).
  const wardrobeById = React.useMemo(() => {
    const m = new Map<string, WardrobeItem>();
    for (const it of wardrobe) m.set(it.id, it);
    return m;
  }, [wardrobe]);

  // Group outfits by local day, preserving newest-first within each bucket.
  const days = React.useMemo<DayBucket[]>(() => {
    const map = new Map<string, DayBucket>();
    for (const o of outfits) {
      const created = new Date(o.created_at);
      const key = dayKey(created);
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          key,
          label: formatDayLabel(created),
          outfits: [],
        };
        map.set(key, bucket);
      }
      const resolvedItems = o.item_ids
        .map((id) => wardrobeById.get(id))
        .filter((it): it is WardrobeItem => Boolean(it));
      bucket.outfits.push({
        ...o,
        resolvedItems,
        missingCount: o.item_ids.length - resolvedItems.length,
      });
    }
    // Newest day first (rows are already sorted by created_at desc, but
    // re-sort the *bucket keys* to be defensive against future changes).
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [outfits, wardrobeById]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={load} size="small">
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (outfits.length === 0) {
    return (
      <Box>
        <PageHeader
          eyebrow="History"
          title="No outfits yet"
          subtitle="Style something with Dress Me or Match and it'll show up here, grouped by day."
        />
        <Button
          component={Link}
          href="/dress-me"
          startIcon={<AutoFixHighIcon />}
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
          Style my first outfit
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        eyebrow="History"
        title="Your outfit timeline"
        subtitle={`${outfits.length} outfit${outfits.length === 1 ? "" : "s"} styled — grouped by day, newest first.`}
      />

      <Stack spacing={{ xs: 3, sm: 4 }}>
        {days.map((day) => (
          <Box key={day.key}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ mb: 1.5, alignItems: "center" }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  background: "rgba(99,102,241,0.1)",
                  color: "secondary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HistoryIcon fontSize="small" />
              </Box>
              <Box>
                <Typography
                  variant="h6"
                  sx={{ fontSize: { xs: 17, sm: 19 }, lineHeight: 1.2 }}
                >
                  {day.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {day.outfits.length} outfit
                  {day.outfits.length === 1 ? "" : "s"}
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={{ xs: 1.5, sm: 2 }}>
              {day.outfits.map((o) => (
                <OutfitHistoryCard key={o.id} outfit={o} />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function OutfitHistoryCard({ outfit }: { outfit: HydratedOutfit }) {
  // Group items by category, ordered to match the rest of the app.
  const grouped = React.useMemo(() => {
    const map = new Map<string, WardrobeItem[]>();
    for (const it of outfit.resolvedItems) {
      const key = it.category ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    const ordered: { category: string; items: WardrobeItem[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = map.get(cat);
      if (items?.length) ordered.push({ category: cat, items });
    }
    // Surface any "Other" / unknown-category bucket at the end so nothing
    // silently disappears if a category is renamed later.
    if (map.has("Other")) {
      ordered.push({ category: "Other", items: map.get("Other")! });
    }
    return ordered;
  }, [outfit.resolvedItems]);

  const time = new Date(outfit.created_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const title =
    outfit.source === "dress-me"
      ? outfit.occasion
        ? `Styled for ${outfit.occasion}`
        : "Dress Me outfit"
      : "Matched outfit";

  return (
    <Card sx={{ p: { xs: 1.75, sm: 2.25 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          mb: 1.25,
          alignItems: { xs: "flex-start", sm: "center" },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, fontSize: { xs: 15, sm: 16 } }}
          >
            {title}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              {time}
            </Typography>
            <Chip
              size="small"
              label={outfit.source === "dress-me" ? "Dress Me" : "Match"}
              variant="outlined"
              sx={{ height: 20, "& .MuiChip-label": { px: 1, fontSize: 11 } }}
            />
            {outfit.vibe && (
              <Chip
                size="small"
                label={outfit.vibe}
                color="secondary"
                variant="outlined"
                sx={{ height: 20, "& .MuiChip-label": { px: 1, fontSize: 11 } }}
              />
            )}
          </Stack>
        </Box>
      </Stack>

      {outfit.reasoning && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 1.5,
            fontStyle: "italic",
            // Keep card heights bounded so the timeline scans cleanly.
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          “{outfit.reasoning}”
        </Typography>
      )}

      {outfit.resolvedItems.length === 0 ? (
        <Alert severity="info" icon={<ImageNotSupportedIcon />}>
          All pieces from this outfit have been removed from your closet.
        </Alert>
      ) : (
        <Stack spacing={1.25}>
          {grouped.map(({ category, items }) => (
            <Box key={category}>
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "center", mb: 0.75 }}
              >
                <Divider sx={{ flex: 1 }} />
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    fontSize: 10,
                  }}
                >
                  {category}
                </Typography>
                <Divider sx={{ flex: 1 }} />
              </Stack>
              <Box
                sx={{
                  display: "grid",
                  gap: { xs: 1, sm: 1.25 },
                  gridTemplateColumns: {
                    xs: "repeat(3, 1fr)",
                    sm: "repeat(4, 1fr)",
                    md: "repeat(6, 1fr)",
                  },
                }}
              >
                {items.map((it) => (
                  <HistoryItemTile key={it.id} item={it} />
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {outfit.missingCount > 0 && outfit.resolvedItems.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1.25 }}
        >
          {outfit.missingCount} piece
          {outfit.missingCount === 1 ? "" : "s"} no longer in your closet.
        </Typography>
      )}
    </Card>
  );
}

// Compact image-only tile for the history grid. We deliberately don't reuse
// ItemCard here because /history is dense — one row may show 6+ items per
// outfit across multiple outfits, and the full ItemCard's chips/text would
// make the page noisy. The tooltip-on-hover keeps detail accessible.
function HistoryItemTile({ item }: { item: WardrobeItem }) {
  const { url } = useLocalImage(item.id);
  const label = item.style ?? item.category ?? "Item";

  return (
    <Box
      title={`${label}${item.color ? ` · ${item.color}` : ""}`}
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "#f5f5f5",
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "flex-end",
        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.06)",
      }}
    >
      {!url && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#bbb",
          }}
        >
          <ImageNotSupportedIcon fontSize="small" />
        </Box>
      )}
      {item.color && (
        <Box
          sx={{
            width: "100%",
            p: 0.5,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
            color: "white",
          }}
        >
          <Typography
            variant="caption"
            noWrap
            sx={{ display: "block", fontSize: 10, fontWeight: 600 }}
          >
            {item.color}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
