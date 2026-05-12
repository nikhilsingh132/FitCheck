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
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { apiFetch } from "@/lib/api-client";
import { BRAND_GRADIENT } from "@/lib/theme";
import {
  sanitizeVisitorName,
  VISITOR_NAME_LIMITS,
} from "@/lib/visitor-name";
import { useVisitorName } from "@/components/visitor-name";
import {
  GenderOptionsList,
  useGenderPref,
} from "@/components/gender-pref";
import type { GenderPref } from "@/lib/gender";

/**
 * Single first-visit modal that captures both the visitor's display name
 * AND the styling-audience preference in one step. Mounted at the providers
 * level so it can read both contexts without re-introducing any cross-
 * provider sequencing (the previous "name dialog → then gender dialog"
 * approach was fragile and added a second blocking modal on first load).
 *
 * Visibility rules:
 *   - Open only after BOTH provider hydrations complete (no SSR flash).
 *   - Open only if the user is missing EITHER the name OR the gender.
 *   - Non-dismissible (no Esc / backdrop close) — both fields are required.
 *
 * Existing visitors:
 *   - Have a gender but no name → dialog opens with gender pre-selected,
 *     they only have to type a name and confirm.
 *   - Have a name but no gender → dialog opens with name pre-filled, they
 *     only have to pick a gender.
 *   - Have both → dialog never renders.
 */
export default function OnboardingDialog() {
  const {
    name: storedName,
    hydrated: nameHydrated,
    setName: persistName,
  } = useVisitorName();
  const {
    gender: storedGender,
    hydrated: genderHydrated,
    setGender: persistGender,
  } = useGenderPref();

  // Local form state. We seed from stored values so partially-onboarded
  // returning users don't lose their existing answer.
  const [nameInput, setNameInput] = React.useState("");
  const [genderInput, setGenderInput] = React.useState<GenderPref | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const bothHydrated = nameHydrated && genderHydrated;
  const needsName = storedName === null;
  const needsGender = storedGender === null;
  const shouldOpen = bothHydrated && (needsName || needsGender);

  // Seed local form state on the first render where hydration completes.
  // We do this in an effect (not directly in useState) because the stored
  // values arrive AFTER the initial mount via VisitorNameProvider's effect.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current) return;
    if (!bothHydrated) return;
    seededRef.current = true;
    if (storedName) setNameInput(storedName);
    if (storedGender) setGenderInput(storedGender);
  }, [bothHydrated, storedName, storedGender]);

  const handleSubmit = async () => {
    // Validate gender first (cheaper than name, no API call needed).
    if (genderInput === null) {
      setSubmitError("Please pick who we're styling for.");
      return;
    }

    // Validate name only if it's actually missing — returning users who
    // already have a stored name skip the API call entirely.
    let finalName = storedName;
    if (needsName) {
      const sanitized = sanitizeVisitorName(nameInput);
      if (!sanitized.ok) {
        setNameError(sanitized.reason);
        return;
      }
      setNameError(null);

      setSubmitting(true);
      setSubmitError(null);
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
          setSubmitError(json.error || "Couldn't save name. Try again.");
          setSubmitting(false);
          return;
        }
        finalName = json.name ?? sanitized.value;
      } catch {
        setSubmitError("Network error. Check your connection and try again.");
        setSubmitting(false);
        return;
      }
    }

    // Persist locally. Gender first (synchronous, no API), then name.
    persistGender(genderInput);
    if (finalName) persistName(finalName);
    setSubmitting(false);
  };

  // Enter on the name field triggers submit so keyboard users can fly
  // through this. Skip when the gender hasn't been selected — submitting
  // would just bounce with an error.
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !submitting && genderInput !== null) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  // Don't render anything until we know the user actually needs the modal.
  // This avoids a hydration flash AND keeps the DOM clean for the (common)
  // returning-user case.
  if (!shouldOpen) return null;

  return (
    <Dialog
      open
      // Non-dismissible: both fields are required.
      onClose={(_, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
      }}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: { sx: { borderRadius: 3, overflow: "hidden" } },
      }}
    >
      <Box
        sx={{
          background: BRAND_GRADIENT,
          color: "white",
          p: { xs: 3, sm: 3.5 },
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
          <AutoFixHighIcon />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Welcome to FitCheck 👋
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.92, fontSize: 14 }}>
          Two quick things and we&apos;ll start styling.
        </Typography>
      </Box>

      <DialogContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack spacing={2.5}>
          {needsName && (
            <Box>
              <Typography
                variant="overline"
                sx={{
                  color: "text.secondary",
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  display: "block",
                  mb: 0.75,
                }}
              >
                1 · Your name
              </Typography>
              <TextField
                autoFocus
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onKeyDown={handleNameKeyDown}
                placeholder="e.g. Nikhil"
                fullWidth
                disabled={submitting}
                error={Boolean(nameError)}
                helperText={
                  nameError ??
                  `Letters only · ${VISITOR_NAME_LIMITS.min}–${VISITOR_NAME_LIMITS.max} characters`
                }
                slotProps={{
                  htmlInput: {
                    maxLength: VISITOR_NAME_LIMITS.max,
                    inputMode: "text",
                    autoComplete: "given-name",
                  },
                }}
              />
            </Box>
          )}

          <Box>
            <Typography
              variant="overline"
              sx={{
                color: "text.secondary",
                fontWeight: 700,
                letterSpacing: 0.6,
                display: "block",
                mb: 0.75,
              }}
            >
              {needsName ? "2 · " : ""}Who are we styling for?
            </Typography>
            <GenderOptionsList
              current={genderInput}
              onPick={(pref) => {
                setGenderInput(pref);
                if (submitError) setSubmitError(null);
              }}
              compact
            />
          </Box>

          {submitError && (
            <Typography variant="caption" color="error" sx={{ display: "block" }}>
              {submitError}
            </Typography>
          )}

          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              genderInput === null ||
              (needsName && nameInput.trim().length === 0)
            }
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
            {submitting ? "Saving…" : "Start styling"}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
