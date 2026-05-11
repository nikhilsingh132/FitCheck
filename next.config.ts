import type { NextConfig } from "next";

// Security headers applied to every response. These don't replace input
// validation in API routes, but they make a stolen XSS or a clickjack attempt
// much less useful to an attacker.
//
// Notes on choices:
//   - We don't ship a strict Content-Security-Policy because MUI uses inline
//     styles and Next.js injects inline scripts at hydration time. A real CSP
//     would require per-request nonces, which is more plumbing than this
//     project warrants today. The other headers below still meaningfully
//     reduce attack surface.
const SECURITY_HEADERS = [
  // Don't let other sites iframe us — kills clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // Tell the browser to honor declared content types instead of sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Trim the Referer we send to third parties (e.g. when users click an
  // outbound link) so we don't leak full URLs / query params.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Block APIs that we don't use. Camera/mic/geolocation aren't needed.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Cross-origin isolation. Lets us avoid being embedded as a resource on
  // attacker sites; same-origin-allow-popups is the safest practical value
  // for an interactive app.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
