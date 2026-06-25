import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UniversalSearch } from "@/components/universal-search";

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
        <SidebarProvider>
          <TooltipProvider>
            <div className="flex min-h-screen w-full bg-sidebar">
              <AppSidebar />
              <div className="flex flex-1 flex-col overflow-hidden bg-background">
                <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger className="-ml-1" />
                    <div className="h-4 w-[1px] bg-border mx-2" />
                    <div className="flex items-center text-sm font-medium text-muted-foreground">
                      StackIOT Technologies Pvt. Ltd.
                    </div>
                  </div>
                  <UniversalSearch />
                </header>
                <main className="flex-1 overflow-y-auto p-6 md:p-8">
                  {children}
                </main>
              </div>
            </div>
          </TooltipProvider>
        </SidebarProvider>
      </body>
    </html>
  );
}

