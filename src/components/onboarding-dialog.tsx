"use client";

import * as React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { BRAND_GRADIENT } from "@/lib/theme";
import {
  GenderOptionsList,
  useGenderPref,
} from "@/components/gender-pref";
import type { GenderPref } from "@/lib/gender";

/**
 * First-visit modal that captures the styling-audience preference.
 *
 * Visibility rules:
 *   - Open only after gender hydration completes (no SSR flash).
 *   - Open only if the user is missing a gender preference.
 *   - Non-dismissible (no Esc / backdrop close) — the preference is required.
 *
 * Existing visitors:
 *   - Have a gender → dialog never renders.
 *   - Have no gender → dialog opens so they can pick a preference.
 */
export default function OnboardingDialog() {
  const {
    gender: storedGender,
    hydrated: genderHydrated,
    setGender: persistGender,
  } = useGenderPref();

  const [genderInput, setGenderInput] = React.useState<GenderPref | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const needsGender = storedGender === null;
  const shouldOpen = genderHydrated && needsGender;

  // Seed local form state on the first render where hydration completes.
  // We do this in an effect because the stored value arrives after mount.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current) return;
    if (!genderHydrated) return;
    seededRef.current = true;
    if (storedGender) setGenderInput(storedGender);
  }, [genderHydrated, storedGender]);

  const handleSubmit = () => {
    if (genderInput === null) {
      setSubmitError("Please pick who we're styling for.");
      return;
    }

    persistGender(genderInput);
  };

  // Don't render anything until we know the user actually needs the modal.
  // This avoids a hydration flash AND keeps the DOM clean for the (common)
  // returning-user case.
  if (!shouldOpen) return null;

  return (
    <Dialog
      open
      // Non-dismissible: a styling preference is required before continuing.
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
          Pick who we&apos;re styling for and we&apos;ll get started.
        </Typography>
      </Box>

      <DialogContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack spacing={2.5}>
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
              Who are we styling for?
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
            disabled={genderInput === null}
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
            Start styling
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
