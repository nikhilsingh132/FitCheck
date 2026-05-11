"use client";

import * as React from "react";
import {
  Box,
  Card,
  CardActionArea,
  Chip,
  IconButton,
  Stack,
  Typography,
  Tooltip,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import type { WardrobeItem } from "@/lib/types";
import { useLocalImage } from "@/lib/use-local-image";

export type ItemCardProps = {
  item: WardrobeItem;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: (item: WardrobeItem) => void;
  onDelete?: (item: WardrobeItem) => void;
};

export default function ItemCard({
  item,
  selected,
  selectable,
  onSelect,
  onDelete,
}: ItemCardProps) {
  const { url, loading } = useLocalImage(item.id);

  const handleClick = () => {
    if (selectable && onSelect) onSelect(item);
  };

  return (
    <Card
      sx={{
        position: "relative",
        overflow: "hidden",
        transition: "transform 120ms ease, border-color 120ms ease",
        borderColor: selected ? "primary.main" : undefined,
        borderWidth: selected ? 2 : 1,
        ":hover": { transform: "translateY(-2px)" },
      }}
    >
      <CardActionArea
        onClick={handleClick}
        disabled={!selectable && !onSelect}
        sx={{ display: "block" }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            bgcolor: "#f5f5f5",
            backgroundImage: url ? `url(${url})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#bbb",
          }}
        >
          {!url && !loading && (
            <Box sx={{ textAlign: "center", px: 1 }}>
              <ImageNotSupportedIcon />
              <Typography variant="caption" component="div">
                Image not on this device
              </Typography>
            </Box>
          )}
          {selected && (
            <CheckCircleIcon
              color="primary"
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                bgcolor: "white",
                borderRadius: "50%",
              }}
            />
          )}
        </Box>
        <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              mb: 0.5,
              flexWrap: "wrap",
              rowGap: 0.5,
              alignItems: "center",
            }}
          >
            {item.category && (
              <Chip
                size="small"
                label={item.category}
                color="primary"
                variant="outlined"
                sx={{ maxWidth: "100%", height: 22, "& .MuiChip-label": { px: 1 } }}
              />
            )}
            {item.color && (
              <Chip
                size="small"
                label={item.color}
                variant="outlined"
                sx={{ maxWidth: "100%", height: 22, "& .MuiChip-label": { px: 1 } }}
              />
            )}
          </Stack>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, fontSize: { xs: 13, sm: 14 } }}
            noWrap
            title={item.style ?? ""}
          >
            {item.style ?? "Untagged item"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={item.vibe ?? ""}
            component="div"
          >
            {item.vibe ?? ""}
            {item.material ? ` · ${item.material}` : ""}
          </Typography>
        </Box>
      </CardActionArea>

      {onDelete && (
        <Tooltip title="Delete">
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            sx={{
              position: "absolute",
              top: 6,
              left: 6,
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
    </Card>
  );
}
