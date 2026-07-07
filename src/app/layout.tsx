import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/top-bar";
import { WorkspaceTabs } from "@/components/workspace-tabs";
import { ModuleProvider } from "@/components/module-provider";
import { ModuleGate } from "@/components/module-gate";

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
    <html lang="en" className="h-full">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      >
        <ModuleProvider>
          <TooltipProvider>
            <div className="flex min-h-screen w-full flex-col bg-background">
              <TopBar />
              <WorkspaceTabs />
              <main className="flex-1 overflow-y-auto p-6 md:p-8">
                <ModuleGate>{children}</ModuleGate>
              </main>
            </div>
          </TooltipProvider>
        </ModuleProvider>
      </body>
    </html>
  );
}
