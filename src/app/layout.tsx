import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Source_Sans_3 } from "next/font/google";
import {
  ThemeProvider,
  THEME_BOOT_SCRIPT,
} from "@/components/theme-provider";
import "./globals.css";

const display = Libre_Franklin({
  variable: "--font-libre",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const sans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Prep — Your AI Interview Mentor",
  description:
    "Practice mock interviews, get grounded coaching, and walk into your panel ready.",
  applicationName: "AI Prep",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Prep",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/aiprep-logo.jpg", type: "image/jpeg" }],
    apple: [{ url: "/aiprep-logo.jpg", sizes: "180x180", type: "image/jpeg" }],
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
    { media: "(prefers-color-scheme: light)", color: "#0d9488" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
