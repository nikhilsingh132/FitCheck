"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import useMediaQuery from "@mui/material/useMediaQuery";
import { SnackbarProvider } from "notistack";
import theme from "@/lib/theme";
import { GenderPrefProvider } from "@/components/gender-pref";
import { VisitorNameProvider } from "@/components/visitor-name";

function ResponsiveSnackbarProvider({ children }: { children: React.ReactNode }) {
  const muiTheme = useTheme();
  const isXs = useMediaQuery(muiTheme.breakpoints.down("sm"));

  return (
    <SnackbarProvider
      // One toast at a time keeps the UI calm and matches user expectation:
      // each user action produces a single feedback message. New toasts
      // replace older ones rather than stacking.
      maxSnack={1}
      // Dedupe identical (message + variant) toasts within the autoHide
      // window so accidental double-fires (React strict mode, retries,
      // back-to-back state updates) don't surface as two toasts.
      preventDuplicate
      autoHideDuration={3500}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: isXs ? "center" : "right",
      }}
    >
      {children}
    </SnackbarProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ResponsiveSnackbarProvider>
          {/* VisitorNameProvider is outermost so its blocking first-visit
              dialog is gated independently of styling preferences. The
              GenderPrefProvider reads useVisitorName().prompting and holds
              back its own dialog until the name has been captured, so the
              user only ever sees ONE blocking modal at a time. */}
          <VisitorNameProvider>
            <GenderPrefProvider>{children}</GenderPrefProvider>
          </VisitorNameProvider>
        </ResponsiveSnackbarProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
