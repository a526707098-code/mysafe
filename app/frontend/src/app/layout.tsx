import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource/heebo/300.css";
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/heebo/700.css";
import "@fontsource/heebo/800.css";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { ToastProvider } from "@/components/ui/toast";
import { CspNonce } from "@/components/nonce";

export const metadata: Metadata = {
  title: "PRIVATE VAULT",
  description: "הכספת הפרטית שלך",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers opts every page into dynamic rendering, which the
  // nonce-based CSP in proxy.ts requires.
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <html lang="he" dir="rtl" className="dark">
      <body>
        <CspNonce nonce={nonce} />
        <ToastProvider>
          <SessionProvider>{children}</SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
