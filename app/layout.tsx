import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TermsGuard — Verifiable project commitments",
  description: "Monitor public promises, policies and project commitments with GenLayer consensus.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
