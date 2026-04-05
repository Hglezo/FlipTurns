import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PreferencesProvider } from "@/components/preferences-provider";
import { ViewportPreviewProvider } from "@/components/viewport-preview-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { LangAttribute } from "@/components/lang-attribute";
import { AuthProvider } from "@/components/auth-provider";
import { getSiteUrl } from "@/lib/site-url";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const metadataBaseUrl = getSiteUrl();

/** Bumps when favicon / PWA art changes so browsers and crawlers refetch. */
const iconCacheBust = "?v=2";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "FlipTurns - Workout Tracker",
  description: "Coach and swimmer workout calendar",
  applicationName: "FlipTurns",
  icons: {
    icon: [
      { url: `/icon-16.png${iconCacheBust}`, sizes: "16x16", type: "image/png" },
      { url: `/icon-32.png${iconCacheBust}`, sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: `/apple-touch-icon.png${iconCacheBust}`, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FlipTurns",
  },
  openGraph: {
    type: "website",
    siteName: "FlipTurns",
    title: "FlipTurns - Workout Tracker",
    description: "Coach and swimmer workout calendar",
    images: [
      { url: `/icon-512.png${iconCacheBust}`, width: 512, height: 512, alt: "FlipTurns" },
    ],
  },
  twitter: {
    card: "summary",
    title: "FlipTurns - Workout Tracker",
    description: "Coach and swimmer workout calendar",
    images: [`/icon-512.png${iconCacheBust}`],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const themeScript = `
  (function() {
    var theme = localStorage.getItem('swim-theme');
    if (theme !== 'light' && theme !== 'dark') {
      try {
        var prefs = JSON.parse(localStorage.getItem('swim-preferences') || '{}');
        theme = prefs.defaultTheme === 'light' ? 'light' : 'dark';
      } catch (_) { theme = 'dark'; }
    }
    document.documentElement.classList.toggle('dark', theme !== 'light');
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AuthProvider>
          <PreferencesProvider>
            <ViewportPreviewProvider>
              <I18nProvider>
              <LangAttribute />
              {children}
              </I18nProvider>
            </ViewportPreviewProvider>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
