import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Source_Sans_3 } from "next/font/google";
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
  title: "AIPREP — KVS PRT Interview Mentor",
  description:
    "Personal AI exam and interview preparation OS for KVS PRT Interview 2026.",
  applicationName: "AIPREP",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AIPREP",
  },
  formatDetection: {
    telephone: false,
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
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
