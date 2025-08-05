import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VIT Navigator",
  description: "Smart Campus App for VIT Chennai",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`
          ${geistSans.variable} ${geistMono.variable}
          bg-black
          dark:bg-neutral-950
          text-gray-900 dark:text-gray-100
          min-h-screen
          font-sans
          antialiased
          transition-colors
        `}
      >
        {children}
      </body>
    </html>
  );
}
