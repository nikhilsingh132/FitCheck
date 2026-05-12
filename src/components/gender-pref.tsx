"use client";

import * as React from "react";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Dialog,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import MaleIcon from "@mui/icons-material/Male";
import FemaleIcon from "@mui/icons-material/Female";
import WcIcon from "@mui/icons-material/Wc";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import {
  GENDER_OPTIONS,
  getStoredGender,
  setStoredGender,
  type GenderPref,
} from "@/lib/gender";
import { BRAND_GRADIENT } from "@/lib/theme";
import { useVisitorName } from "@/components/visitor-name";

type GenderContextValue = {
  /** null until the user has picked. Components should treat null as "unisex". */
  gender: GenderPref | null;
  /** Programmatically open the picker (e.g. from a header dropdown). */
  openPicker: () => void;
  /** Update the preference. Persists to localStorage. */
  setGender: (pref: GenderPref) => void;
};

const GenderContext = React.createContext<GenderContextValue | null>(null);

/**
 * Wraps the app so any component can read/change the styling-audience
 * preference. Auto-opens a first-visit picker the first time we don't find a
 * stored value.
 */
export function GenderPrefProvider({ children }: { children: React.ReactNode }) {
  const [gender, setGenderState] = React.useState<GenderPref | null>(null);
  const [open, setOpen] = React.useState(false);
  // We avoid showing the dialog on the server / first render to prevent a
  // hydration flicker — only decide what to render after the client mount.
  const [hydrated, setHydrated] = React.useState(false);

  // The visitor-name dialog runs ahead of us on first visit. We never want
  // two blocking modals stacked, so this provider tracks whether IT thinks
  // gender should be asked, and the actual <Dialog open=…> defers to the
  // name flow until that's finished.
  const { name: visitorName, prompting: namePrompting } = useVisitorName();

  React.useEffect(() => {
    const stored = getStoredGender();
    setGenderState(stored);
    setHydrated(true);
    if (!stored) setOpen(true);
  }, []);

  // Once a returning user finishes the name dialog (or already had a name
  // stored), `namePrompting` flips to false. If they still don't have a
  // gender, the gender dialog opens here — never simultaneously with name.
  React.useEffect(() => {
    if (!hydrated) return;
    if (namePrompting) return;
    if (visitorName === null) return;
    if (gender === null) setOpen(true);
  }, [hydrated, namePrompting, visitorName, gender]);

  const handleSet = React.useCallback((pref: GenderPref) => {
    setStoredGender(pref);
    setGenderState(pref);
    setOpen(false);
  }, []);

  const value = React.useMemo<GenderContextValue>(
    () => ({
      gender,
      setGender: handleSet,
      openPicker: () => setOpen(true),
    }),
    [gender, handleSet],
  );

  return (
    <GenderContext.Provider value={value}>
      {children}
      {hydrated && (
        <GenderPickerDialog
          // Gate on namePrompting so we never stack two modals: if the
          // user is still mid-name-entry, gender stays hidden. As soon as
          // they submit a name, this re-renders with open=true.
          open={open && !namePrompting}
          current={gender}
          dismissible={gender !== null}
          onClose={() => setOpen(false)}
          onPick={handleSet}
        />
      )}
    </GenderContext.Provider>
  );
}

export function useGenderPref(): GenderContextValue {
  const ctx = React.useContext(GenderContext);
  if (!ctx) {
    throw new Error("useGenderPref must be used within <GenderPrefProvider>");
  }
  return ctx;
}

const ICONS: Record<GenderPref, React.ReactElement> = {
  men: <MaleIcon />,
  women: <FemaleIcon />,
  unisex: <WcIcon />,
};

const DESCRIPTIONS: Record<GenderPref, string> = {
  men: "Outfits, vibe words, and reasoning tuned for men's fashion.",
  women: "Outfits, vibe words, and reasoning tuned for women's fashion.",
  unisex: "Use the whole closet, no gender bias. Great if you share an account.",
};

function GenderPickerDialog({
  open,
  current,
  dismissible,
  onClose,
  onPick,
}: {
  open: boolean;
  current: GenderPref | null;
  dismissible: boolean;
  onClose: () => void;
  onPick: (pref: GenderPref) => void;
}) {
  return (
    <Dialog
      open={open}
      // Only honor close events when the user already has a preference.
      // On first visit we ignore backdrop click / Esc so they have to pick.
      onClose={(_, reason) => {
        if (!dismissible) return;
        if (reason === "backdropClick" || reason === "escapeKeyDown") {
          onClose();
        }
      }}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            overflow: "hidden",
          },
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
          <AutoFixHighIcon />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Who are we styling for?
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.92, fontSize: 14 }}>
          We tune outfit picks and vibe words to your audience. You can change
          this any time from the top bar.
        </Typography>
      </Box>

      <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={1.5}>
          {GENDER_OPTIONS.map((opt) => {
            const active = current === opt.value;
            return (
              <Card
                key={opt.value}
                variant="outlined"
                sx={{
                  borderColor: active ? "secondary.main" : undefined,
                  borderWidth: active ? 2 : 1,
                  background: active
                    ? "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.06) 100%)"
                    : undefined,
                }}
              >
                <CardActionArea
                  onClick={() => onPick(opt.value)}
                  sx={{ p: 2 }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: "center" }}
                  >
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        background: active
                          ? BRAND_GRADIENT
                          : "rgba(99,102,241,0.10)",
                        color: active ? "white" : "secondary.main",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {ICONS[opt.value]}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {opt.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {DESCRIPTIONS[opt.value]}
                      </Typography>
                    </Box>
                  </Stack>
                </CardActionArea>
              </Card>
            );
          })}
        </Stack>

        {dismissible && (
          <Box sx={{ textAlign: "right", mt: 2 }}>
            <Button onClick={onClose} color="inherit">
              Cancel
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small icon helper used by the header chip. */
export function GenderIcon({ pref }: { pref: GenderPref | null }) {
  if (!pref) return ICONS.unisex;
  return ICONS[pref];
}
