import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Command Center",
  description: "Calendars, to-dos, and Z Design sales at a glance.",
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
