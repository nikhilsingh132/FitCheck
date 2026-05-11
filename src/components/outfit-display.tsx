"use client";

import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import type { WardrobeItem } from "@/lib/types";
import { useLocalImage } from "@/lib/use-local-image";

type Props = {
  items: WardrobeItem[];
  reasoning?: string;
  vibe?: string;
  title?: string;
  onDelete?: (item: WardrobeItem) => void;
};

export default function OutfitDisplay({
  items,
  reasoning,
  vibe,
  title,
  onDelete,
}: Props) {
  if (!items.length) return null;

  // When the parent (e.g. /outfit page) already shows the outfit title in
  // a PageHeader above, it omits `title` so we don't render a redundant
  // heading. We still render the vibe chip though — it's useful context
  // next to the reasoning.
  const showHeading = Boolean(title) || Boolean(vibe);

  return (
    <Card sx={{ mt: 3, bgcolor: "background.paper" }}>
      <CardContent>
        {showHeading && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 1.5 }}
            sx={{
              mb: 1.5,
              alignItems: { sm: "center" },
            }}
          >
            {title && (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  alignItems: "center",
                }}
              >
                <AutoAwesomeIcon color="secondary" sx={{ flexShrink: 0 }} />
                <Typography
                  variant="h6"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    // Tighter sizing on mobile + `text-wrap: balance` keeps
                    // long titles like "Outfit for beach wedding" from
                    // wrapping one-word-per-line.
                    fontSize: { xs: 16, sm: 18 },
                    lineHeight: 1.3,
                    textWrap: "balance",
                    overflowWrap: "anywhere",
                  }}
                >
                  {title}
                </Typography>
              </Stack>
            )}
            {vibe && (
              <Chip
                label={vibe}
                color="secondary"
                variant="outlined"
                sx={{ alignSelf: { xs: "flex-start", sm: "center" } }}
              />
            )}
          </Stack>
        )}

        {reasoning && (
          <Alert severity="info" icon={false} sx={{ mb: 2 }}>
            {reasoning}
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gap: { xs: 1.25, sm: 2 },
            gridTemplateColumns: {
              xs: `repeat(${Math.min(items.length, 2)}, 1fr)`,
              sm: `repeat(${Math.min(items.length, 3)}, 1fr)`,
              md: `repeat(${Math.min(items.length, 4)}, 1fr)`,
              lg: `repeat(${Math.min(items.length, 5)}, 1fr)`,
            },
          }}
        >
          {items.map((it) => (
            <OutfitTile key={it.id} item={it} onDelete={onDelete} />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function OutfitTile({
  item,
  onDelete,
}: {
  item: WardrobeItem;
  onDelete?: (item: WardrobeItem) => void;
}) {
  const { url } = useLocalImage(item.id);
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid #eee",
        bgcolor: "#fff",
      }}
    >
      <Box
        sx={{
          width: "100%",
          aspectRatio: "1 / 1",
          backgroundImage: url ? `url(${url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          bgcolor: "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#bbb",
        }}
      >
        {!url && <ImageNotSupportedIcon />}
      </Box>
      {onDelete && (
        <Tooltip title="Delete">
          <IconButton
            size="small"
            onClick={() => onDelete(item)}
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              p: 0.75,
              bgcolor: "rgba(255,255,255,0.9)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              ":hover": { bgcolor: "white" },
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Box sx={{ p: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {item.category}
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600 }}
          noWrap
          title={item.style ?? ""}
        >
          {item.style ?? "Item"}
        </Typography>
      </Box>
    </Box>
  );
}
