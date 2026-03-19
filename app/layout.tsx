import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aria | Your Voice Assistant",
  description: "Aria is a voice-first assistant designed to help people with vision and hearing disabilities access news, music, email, and information hands-free.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
