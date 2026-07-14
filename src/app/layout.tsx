import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModuleProvider } from "@/components/module-provider";
import { DataProvider } from "@/lib/data-provider";
import { UserProductsProvider } from "@/lib/user-products";
import { AppShell } from "@/components/app-shell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "StackIOT Technologies Pvt. Ltd. - Enterprise Suite",
  description: "Modern IoT production, inventory, and planning enterprise management system by StackIOT Technologies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        {/* No-flash theme: apply the saved (or system) theme before first paint.
            (next/script beforeInteractive logs a benign dev-only warning in this
            React version; it is stripped from production builds.) */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`}
        </Script>
        <TooltipProvider>
          <DataProvider>
            <ModuleProvider>
              <UserProductsProvider>
                <AppShell>{children}</AppShell>
              </UserProductsProvider>
            </ModuleProvider>
          </DataProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
