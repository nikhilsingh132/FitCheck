"use client";

import * as React from "react";
import { useSnackbar } from "notistack";
import { deleteImage } from "@/lib/idb";
import { apiFetch } from "@/lib/api-client";
import type { WardrobeItem } from "@/lib/types";

type Options = {
  // Called after a successful delete so the caller can drop the item from
  // any local list/selection state it owns.
  onDeleted?: (id: string) => void;
  // Set to false to skip the native confirm() prompt (e.g. inline X buttons).
  confirm?: boolean;
};

// Shared wardrobe-item delete flow:
//  1. Optional confirm prompt.
//  2. DELETE /api/wardrobe?id=...
//  3. Remove the local IndexedDB blob.
//  4. Toast on success / error.
//  5. Call onDeleted so the caller can update its state.
export function useDeleteItem({ onDeleted, confirm = true }: Options = {}) {
  const { enqueueSnackbar } = useSnackbar();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const deleteItem = React.useCallback(
    async (item: WardrobeItem) => {
      if (confirm) {
        const ok = window.confirm("Delete this item from your wardrobe?");
        if (!ok) return false;
      }
      setDeletingId(item.id);
      try {
        const res = await apiFetch(`/api/wardrobe?id=${item.id}`, {
          method: "DELETE",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Delete failed");
        }
        // Best-effort local cleanup — failure here shouldn't fail the whole op.
        await deleteImage(item.id).catch(() => undefined);
        onDeleted?.(item.id);
        enqueueSnackbar("Item deleted", { variant: "success" });
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        enqueueSnackbar(msg, { variant: "error" });
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [confirm, enqueueSnackbar, onDeleted],
  );

  return { deleteItem, deletingId };
}
