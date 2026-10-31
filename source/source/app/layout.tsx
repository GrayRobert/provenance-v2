import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistration from "@/components/shared/ServiceWorkerRegistration";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "@/components/shared/Toaster";
import { ChatUnreadProvider } from "@/lib/chatUnreadContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Provenance",
  description: "Write songs and keep them on your device",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

/** Inline script to set data-theme before first paint (avoids flash). Runs in browser only. */
const themeScript = `
(function() {
  var key = 'provenance-app-theme';
  try {
    var stored = localStorage.getItem(key);
    var theme = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'dark';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/provenance-v2/manifest.webmanifest" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ChatUnreadProvider>{children}</ChatUnreadProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
        <Toaster />
      </body>
    </html>
  );
}
