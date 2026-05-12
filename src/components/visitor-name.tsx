"use client";

import * as React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import { apiFetch } from "@/lib/api-client";
import { BRAND_GRADIENT } from "@/lib/theme";
import {
  getStoredVisitorName,
  sanitizeVisitorName,
  setStoredVisitorName,
  VISITOR_NAME_LIMITS,
} from "@/lib/visitor-name";

type VisitorNameContextValue = {
  /** null until the user has submitted a name OR until hydration finishes. */
  name: string | null;
  /** True while the first-visit blocking dialog is open. Other first-visit
   *  flows (e.g. the gender picker) can read this to defer themselves so
   *  the user only sees ONE blocking dialog at a time. */
  prompting: boolean;
};

const VisitorNameContext = React.createContext<VisitorNameContextValue | null>(
  null,
);

/**
 * Wraps the app and surfaces a blocking first-visit dialog when the local
 * "visitor name" hasn't been captured yet. The dialog is non-dismissible —
 * no Esc, no backdrop click, no close button — so the operator always gets
 * a name written to the visitors table the first time a new browser opens
 * the app.
 *
 * Trade-off: clearing localStorage will re-prompt. The server-side RPC
 * refuses to overwrite an existing name, so the operator's table view
 * stays stable even if the user types something different the second time.
 */
export function VisitorNameProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  // Same hydration dance as GenderPrefProvider: we never render the dialog
  // on the server / first client render to avoid a hydration mismatch.
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const stored = getStoredVisitorName();
    setName(stored);
    setHydrated(true);
    if (!stored) setOpen(true);
  }, []);

  const handleSubmit = React.useCallback((submitted: string) => {
    setStoredVisitorName(submitted);
    setName(submitted);
    setOpen(false);
  }, []);

  const value = React.useMemo<VisitorNameContextValue>(
    () => ({ name, prompting: open }),
    [name, open],
  );

  return (
    <VisitorNameContext.Provider value={value}>
      {children}
      {hydrated && <VisitorNameDialog open={open} onSubmit={handleSubmit} />}
    </VisitorNameContext.Provider>
  );
}

export function useVisitorName(): VisitorNameContextValue {
  const ctx = React.useContext(VisitorNameContext);
  if (!ctx) {
    throw new Error(
      "useVisitorName must be used within <VisitorNameProvider>",
    );
  }
  return ctx;
}

function VisitorNameDialog({
  open,
  onSubmit,
}: {
  open: boolean;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSave = async () => {
    const sanitized = sanitizeVisitorName(value);
    if (!sanitized.ok) {
      setError(sanitized.reason);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/visitors/name", {
        method: "POST",
        json: { name: sanitized.value },
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        name?: string;
      };
      if (!res.ok) {
        // Server-side validation is the source of truth for what gets
        // stored, but its messages mirror the client validator so we can
        // surface them directly.
        setError(json.error || "Couldn't save name. Try again.");
        return;
      }
      // Use whatever the server returned (it strips whitespace etc.) so
      // local storage and the DB always agree.
      onSubmit(json.name ?? sanitized.value);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit on Enter for keyboard users — but only when valid-looking so
  // we don't spam the API with obviously-bad payloads.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !submitting) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <Dialog
      open={open}
      // Fully non-dismissible: backdrop click and Esc are swallowed here so
      // the user MUST enter a name. (MUI v6 dropped the standalone
      // `disableEscapeKeyDown` prop; ignoring the reason in onClose is the
      // current canonical approach.)
      onClose={(_, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
      }}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: { borderRadius: 3, overflow: "hidden" },
        },
      }}
    >
      <Box
        sx={{
          background: BRAND_GRADIENT,
          color: "white",
          p: { xs: 3, sm: 4 },
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            mx: "auto",
            mb: 1.5,
            borderRadius: 2.5,
            bgcolor: "rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(8px)",
          }}
        >
          <PersonIcon />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Welcome to FitCheck 👋
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.92, fontSize: 14 }}>
          What should we call you? Just so we know who&apos;s trying the app.
        </Typography>
      </Box>

      <DialogContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack spacing={1.5}>
          <TextField
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Nikhil"
            label="Your name"
            fullWidth
            disabled={submitting}
            error={Boolean(error)}
            helperText={
              error ??
              `Letters only · ${VISITOR_NAME_LIMITS.min}–${VISITOR_NAME_LIMITS.max} characters`
            }
            slotProps={{
              htmlInput: {
                maxLength: VISITOR_NAME_LIMITS.max,
                // inputMode hints mobile keyboards toward the text layout
                // rather than email/search etc.
                inputMode: "text",
                autoComplete: "given-name",
              },
            }}
          />

          <Button
            onClick={handleSave}
            disabled={submitting || value.trim().length === 0}
            startIcon={
              submitting ? (
                <CircularProgress size={16} sx={{ color: "white" }} />
              ) : null
            }
            sx={{
              py: 1.25,
              background: BRAND_GRADIENT,
              color: "white",
              fontWeight: 700,
              ":hover": {
                background: BRAND_GRADIENT,
                filter: "brightness(0.95)",
              },
              "&.Mui-disabled": { background: "#e2e8f0", color: "#94a3b8" },
            }}
          >
            {submitting ? "Saving…" : "Continue"}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
