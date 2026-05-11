"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AppBar,
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  Divider,
  Stack,
  Button,
  Tooltip,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import JoinFullIcon from "@mui/icons-material/JoinFull";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import { CATEGORIES } from "@/lib/constants";
import { BRAND_GRADIENT } from "@/lib/theme";
import { apiFetch } from "@/lib/api-client";
import { GENDER_OPTIONS, type GenderPref } from "@/lib/gender";
import { useGenderPref, GenderIcon } from "@/components/gender-pref";

const DRAWER_WIDTH = 272;

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "Wardrobe", href: "/", icon: <HomeIcon /> },
  { label: "Upload", href: "/upload", icon: <CloudUploadIcon /> },
  { label: "Dress Me", href: "/dress-me", icon: <AutoFixHighIcon /> },
  { label: "Match My Selection", href: "/match", icon: <JoinFullIcon /> },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const visitorCount = useVisitorCount();

  const handleNav = (href: string) => {
    router.push(href);
    if (!isDesktop) setMobileOpen(false);
  };

  const handleCategoryNav = (cat: string) => {
    router.push(`/?category=${encodeURIComponent(cat)}`);
    if (!isDesktop) setMobileOpen(false);
  };

  const drawerContent = (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#fafaf7",
      }}
    >
      <Box sx={{ p: 2.5, pb: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              background: BRAND_GRADIENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              boxShadow: "0 6px 16px rgba(99,102,241,0.35)",
            }}
          >
            <CheckroomIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.01em",
              }}
              noWrap
            >
              FitCheck
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              Your AI personal stylist
            </Typography>
          </Box>
        </Stack>
      </Box>
      <Divider />

      <List sx={{ px: 1.5, pt: 1.5 }}>
        {PRIMARY_NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href);
          return (
            <ListItemButton
              key={item.href}
              selected={!!active}
              onClick={() => handleNav(item.href)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 48,
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "& .MuiListItemIcon-root": { color: "primary.contrastText" },
                  "&:hover": { bgcolor: "primary.main" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{ primary: { sx: { fontWeight: 600 } } }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Divider sx={{ my: 1.5 }} />
      <Typography
        variant="overline"
        sx={{
          px: 3,
          color: "text.secondary",
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
        Categories
      </Typography>
      <List sx={{ px: 1.5, pt: 0.5 }}>
        {CATEGORIES.map(({ value, label, icon: Icon }) => (
          <ListItemButton
            key={value}
            onClick={() => handleCategoryNav(value)}
            sx={{ borderRadius: 2, mb: 0.25, minHeight: 40 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={label}
              slotProps={{ primary: { sx: { fontSize: 14 } } }}
            />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ flex: 1 }} />
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          startIcon={<AutoFixHighIcon />}
          component={Link}
          href="/dress-me"
          sx={{
            background: BRAND_GRADIENT,
            color: "white",
            py: 1.25,
            ":hover": {
              background: BRAND_GRADIENT,
              filter: "brightness(0.95)",
            },
          }}
        >
          Style me now
        </Button>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            mt: 1.5,
            px: 1,
            alignItems: "center",
            color: "text.secondary",
          }}
        >
          <PeopleAltOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {visitorCount === null
              ? "Loading stylists…"
              : `${visitorCount.toLocaleString()} ${
                  visitorCount === 1 ? "stylist has" : "stylists have"
                } tried FitCheck`}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );

  const activeLabel =
    PRIMARY_NAV.find((n) =>
      n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href),
    )?.label ?? "FitCheck";

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          color: "text.primary",
        }}
      >
        {/*
          Mobile-only brand strip: a thin row above the main toolbar that
          shows the hanger icon + "FitCheck" so visitors see the brand
          even when the page label below says "Upload"/"Wardrobe"/etc.
          Hidden on md+ because the permanent sidebar there already
          carries the branding.
        */}
        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            alignItems: "center",
            justifyContent: "center",
            gap: 0.75,
            px: 2,
            py: 0.5,
            borderBottom: "1px solid rgba(15,23,42,0.06)",
          }}
        >
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: 1,
              background: BRAND_GRADIENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              flexShrink: 0,
            }}
          >
            <CheckroomIcon sx={{ fontSize: 12 }} />
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "0.02em",
              lineHeight: 1,
            }}
          >
            FitCheck
          </Typography>
        </Box>

        <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen((v) => !v)}
            sx={{ display: { md: "none" } }}
            aria-label="open navigation"
          >
            <MenuIcon />
          </IconButton>
          <Typography
            noWrap
            sx={{
              flex: 1,
              minWidth: 0,
              fontWeight: 700,
              fontSize: { xs: 16, sm: 18 },
              letterSpacing: "-0.01em",
            }}
          >
            {activeLabel}
          </Typography>

          <GenderSwitcher />

          {/* Hide the top-right Upload shortcut on the home route. A new
              user landing there has no context for what the icon does;
              the home page renders its own floating bottom-pinned Upload
              button so the action is still one tap away (and far more
              obvious). Every other page keeps this shortcut. */}
          {pathname !== "/" && (
            <Button
              startIcon={<CloudUploadIcon />}
              component={Link}
              href="/upload"
              sx={{
                background: BRAND_GRADIENT,
                color: "white",
                px: { xs: 1.25, sm: 2.25 },
                "& .MuiButton-startIcon": { mr: { xs: 0, sm: 1 } },
                ":hover": {
                  background: BRAND_GRADIENT,
                  filter: "brightness(0.95)",
                },
              }}
            >
              <Box
                component="span"
                sx={{ display: { xs: "none", sm: "inline" } }}
              >
                Upload
              </Box>
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              width: { xs: "85vw", sm: DRAWER_WIDTH },
              maxWidth: 320,
              boxSizing: "border-box",
              borderRight: "1px solid #ececec",
            },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              borderRight: "1px solid #ececec",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: "100%", md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minWidth: 0,
          minHeight: "100vh",
        }}
      >
        {/*
          Spacer matches the fixed AppBar height. On mobile the AppBar is
          taller because of the brand strip above the toolbar — bump the
          spacer accordingly so the first row of page content isn't hidden
          behind it.
        */}
        <Toolbar sx={{ minHeight: { xs: 56 + 27, sm: 64 } }} />
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: "auto" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Compact chip + dropdown in the top bar. Lets the user change the styling
 * audience (Men / Women / Unisex) at any time. The first-visit dialog still
 * lives in <GenderPrefProvider>; this is just for changes afterwards.
 */
function GenderSwitcher() {
  const { gender, setGender } = useGenderPref();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  // Until the user has picked, the provider's dialog is open and we have no
  // useful label to show; render a neutral placeholder instead of "Unisex"
  // which would be misleading.
  const current: GenderPref | null = gender;
  const currentLabel =
    GENDER_OPTIONS.find((o) => o.value === current)?.label ?? "Styling for…";

  return (
    <>
      <Tooltip title="Change styling audience">
        <Chip
          icon={<GenderIcon pref={current} />}
          label={
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: "center" }}
            >
              <Box
                component="span"
                sx={{
                  display: { xs: "none", sm: "inline" },
                  color: "text.secondary",
                  fontWeight: 500,
                  mr: 0.25,
                }}
              >
                For:
              </Box>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {currentLabel}
              </Box>
              <ExpandMoreIcon sx={{ fontSize: 16, ml: 0.25, opacity: 0.7 }} />
            </Stack>
          }
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            cursor: "pointer",
            bgcolor: "rgba(99,102,241,0.08)",
            borderColor: "rgba(99,102,241,0.25)",
            color: "text.primary",
            "& .MuiChip-icon": { color: "secondary.main" },
            "&:hover": { bgcolor: "rgba(99,102,241,0.14)" },
            height: 34,
            px: 0.5,
          }}
          variant="outlined"
        />
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: { sx: { minWidth: 200, mt: 0.5, borderRadius: 2 } },
        }}
      >
        {GENDER_OPTIONS.map((opt) => {
          const selected = current === opt.value;
          return (
            <MenuItem
              key={opt.value}
              selected={selected}
              onClick={() => {
                setGender(opt.value);
                setAnchorEl(null);
              }}
              sx={{ py: 1.1, gap: 1.25 }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1.5,
                  bgcolor: selected
                    ? "secondary.main"
                    : "rgba(99,102,241,0.10)",
                  color: selected ? "white" : "secondary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <GenderIcon pref={opt.value} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                {opt.label}
              </Typography>
              {selected && (
                <CheckIcon fontSize="small" color="secondary" />
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

// Fires a one-shot visitor ping (so this browser is counted exactly once per
// session) and then loads the global unique-visitor count for display. We
// guard the ping with sessionStorage to avoid hitting the DB on every nav.
function useVisitorCount(): number | null {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const alreadyPinged =
          typeof window !== "undefined" &&
          window.sessionStorage.getItem("fitcheck_visitor_pinged") === "1";

        if (!alreadyPinged) {
          await apiFetch("/api/visitors/ping", { method: "POST" }).catch(
            () => undefined,
          );
          try {
            window.sessionStorage.setItem("fitcheck_visitor_pinged", "1");
          } catch {
            // sessionStorage may be unavailable — worst case we ping again.
          }
        }

        const res = await fetch("/api/visitors/count", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { count?: number };
        if (!cancelled && typeof json.count === "number") {
          setCount(json.count);
        }
      } catch {
        // Silent — the badge just won't show a number.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
