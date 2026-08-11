import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym",
  description: "Workouts, goals, body composition, and food.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Gym",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
