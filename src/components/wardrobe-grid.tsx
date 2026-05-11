"use client";

import * as React from "react";
import { Box } from "@mui/material";
import ItemCard, { type ItemCardProps } from "./item-card";
import type { WardrobeItem } from "@/lib/types";

type Props = {
  items: WardrobeItem[];
  selectedIds?: Set<string>;
  selectable?: boolean;
  onSelect?: ItemCardProps["onSelect"];
  onDelete?: ItemCardProps["onDelete"];
};

export default function WardrobeGrid({
  items,
  selectedIds,
  selectable,
  onSelect,
  onDelete,
}: Props) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: { xs: 1.25, sm: 2 },
        gridTemplateColumns: {
          xs: "repeat(2, 1fr)",
          sm: "repeat(3, 1fr)",
          md: "repeat(4, 1fr)",
          lg: "repeat(5, 1fr)",
        },
      }}
    >
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          selected={selectedIds?.has(item.id)}
          selectable={selectable}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </Box>
  );
}
