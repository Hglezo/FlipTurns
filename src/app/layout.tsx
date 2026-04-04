import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PreferencesProvider } from "@/components/preferences-provider";
import { ViewportPreviewProvider } from "@/components/viewport-preview-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { LangAttribute } from "@/components/lang-attribute";
import { AuthProvider } from "@/components/auth-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FlipTurns - Workout Tracker",
  description: "Coach and swimmer workout calendar",
  applicationName: "FlipTurns",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FlipTurns",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
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
    let theme = localStorage.getItem('swim-theme');
    if (!theme) {
      try {
        const prefs = JSON.parse(localStorage.getItem('swim-preferences') || '{}');
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
