import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/toast";
import { getActiveProfile } from "@/lib/profile";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "jobspy",
  description: "Job search campaign manager",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const activeProfile = await getActiveProfile();

  return (
    <html lang="en" className={`h-full ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ToastProvider>
          <div className="app-shell">
            <Nav activeProfile={activeProfile} />
            <main className="app-main">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
