"use client";

import * as React from "react";
import { getImage } from "@/lib/idb";

// Returns an object URL for the IndexedDB blob keyed by `id`, or null if it
// doesn't exist on this device. Revokes the URL on unmount / id change.
export function useLocalImage(id: string | null | undefined) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(!!id);

  React.useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    if (!id) {
      setUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getImage(id)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          createdUrl = URL.createObjectURL(blob);
          setUrl(createdUrl);
        } else {
          setUrl(null);
        }
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id]);

  return { url, loading };
}
