"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import WardrobeGrid from "@/components/wardrobe-grid";
import PageHeader from "@/components/page-header";
import EmptyWardrobe from "@/components/empty-wardrobe";
import { CATEGORIES } from "@/lib/constants";
import { BRAND_GRADIENT } from "@/lib/theme";
import { useDeleteItem } from "@/lib/use-delete-item";
import { apiFetch } from "@/lib/api-client";
import type { WardrobeItem } from "@/lib/types";

export default function Page() {
  return (
    <React.Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      }
    >
      <WardrobePage />
    </React.Suspense>
  );
}

function WardrobePage() {
  const params = useSearchParams();
  const router = useRouter();
  const activeCategory = params.get("category");

  const [items, setItems] = React.useState<WardrobeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/wardrobe", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load wardrobe");
      setItems(json.items as WardrobeItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const visible = activeCategory
    ? items.filter((i) => i.category === activeCategory)
    : items;

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (!it.category) continue;
      map.set(it.category, (map.get(it.category) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const { deleteItem } = useDeleteItem({
    onDeleted: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
  });

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

  if (items.length === 0) {
    return <EmptyWardrobe />;
  }

  return (
    // Bottom padding leaves room for the floating Upload button so the
    // last row of wardrobe cards isn't covered by it on mobile. On desktop
    // the floating bar is hidden (the sidebar handles Upload), so no extra
    // bottom space is needed.
    <Box sx={{ pb: { xs: 12, sm: 13, md: 0 } }}>
      <PageHeader
        eyebrow="Wardrobe"
        title="Your closet"
        subtitle={
          <>
            <strong>{items.length}</strong> item
            {items.length === 1 ? "" : "s"} tagged by Gemini
            {activeCategory ? (
              <>
                {" "}
                · filtered by <strong>{activeCategory}</strong>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              component={Link}
              href="/match"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              sx={{ flex: { xs: 1, md: "0 0 auto" } }}
            >
              Match a piece
            </Button>
            <Button
              component={Link}
              href="/dress-me"
              startIcon={<AutoFixHighIcon />}
              sx={{
                background: BRAND_GRADIENT,
                color: "white",
                flex: { xs: 1, md: "0 0 auto" },
                ":hover": {
                  background: BRAND_GRADIENT,
                  filter: "brightness(0.95)",
                },
              }}
            >
              Style me now
            </Button>
          </>
        }
      />

      <Stack
        direction="row"
        spacing={1}
        sx={{
          mb: 3,
          alignItems: "center",
          overflowX: "auto",
          pb: 1,
          mx: { xs: -2, md: 0 },
          px: { xs: 2, md: 0 },
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Chip
          label={`All · ${items.length}`}
          color={!activeCategory ? "primary" : "default"}
          variant={!activeCategory ? "filled" : "outlined"}
          onClick={() => router.push("/")}
          sx={{ flexShrink: 0, fontWeight: 600 }}
        />
        {CATEGORIES.map((c) => {
          const n = counts.get(c.value) ?? 0;
          return (
            <Chip
              key={c.value}
              label={`${c.label}${n ? ` · ${n}` : ""}`}
              color={activeCategory === c.value ? "primary" : "default"}
              variant={activeCategory === c.value ? "filled" : "outlined"}
              onClick={() => router.push(`/?category=${c.value}`)}
              disabled={n === 0 && c.value !== activeCategory}
              sx={{ flexShrink: 0, fontWeight: 500 }}
            />
          );
        })}
      </Stack>

      {visible.length === 0 ? (
        <Alert
          severity="info"
          action={
            <Button
              component={Link}
              href="/upload"
              size="small"
              variant="contained"
              startIcon={<CloudUploadIcon />}
            >
              Upload
            </Button>
          }
        >
          No items in {activeCategory}.
        </Alert>
      ) : (
        <WardrobeGrid items={visible} onDelete={deleteItem} />
      )}

      {/* Floating bottom Upload button — mobile only.
          On desktop (md+) the permanent sidebar already exposes "Upload" and
          "Style me now", so a fixed bottom CTA is redundant and looks awkward
          floating over the grid. On mobile there's no sidebar (it collapses
          into a drawer) so we keep the full-width frosted bar as the primary
          thumb-reachable CTA. */}
      <Box
        sx={{
          display: { xs: "block", md: "none" },
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          px: 2,
          pt: 1.5,
          pb: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          background:
            "linear-gradient(to top, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0) 100%)",
          backdropFilter: "blur(10px)",
          pointerEvents: "none",
        }}
      >
        <Box sx={{ pointerEvents: "auto" }}>
          <Button
            component={Link}
            href="/upload"
            startIcon={<CloudUploadIcon />}
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
            }}
          >
            Upload outfits
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
