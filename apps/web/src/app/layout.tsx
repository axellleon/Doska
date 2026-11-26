import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doska — Интерактивная бесконечная онлайн-доска",
  description:
    "Быстрая бесконечная доска для брейнштормов, архитектурных схем и визуальной работы команды",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
