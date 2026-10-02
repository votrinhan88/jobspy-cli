import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/toast";
import { getActiveProfile } from "@/lib/profile";
import "./globals.css";

export const metadata: Metadata = {
  title: "jobspy",
  description: "Job search campaign manager",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const activeProfile = await getActiveProfile();

  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
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
