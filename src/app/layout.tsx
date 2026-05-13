import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Local Resume Editor",
  description: "Local ATS resume editor with SQLite versioning and PDF/DOCX downloads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
