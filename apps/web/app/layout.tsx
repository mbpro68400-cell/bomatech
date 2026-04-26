import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bomatech — Copilote financier pour TPE/PME",
  description:
    "Transforme tes données financières en vision claire, simulations what-if et insights actionnables.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
