import type { Metadata } from "next";
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
    "Personal AI exam and interview preparation operating system. Phase 1: documents, memory foundation, and grounded mentor chat.",
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
