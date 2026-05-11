import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/providers";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = {
  title: "FitCheck — Your AI personal stylist",
  description:
    "Upload your wardrobe, let Gemini tag it, and get outfit recommendations on demand.",
  appleWebApp: { capable: true, title: "FitCheck", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
