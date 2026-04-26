import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ThemeProvider } from "@/components/theme-provider";
import { TweaksPanel } from "@/components/tweaks-panel";

/**
 * App shell using the `.app` grid from @bomatech/ui/app.css.
 * ThemeProvider drives data-theme / data-density / accent on <html>.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div className="app">
        <Sidebar />
        <div className="main">
          <Topbar />
          <section className="content">{children}</section>
        </div>
        <TweaksPanel />
      </div>
    </ThemeProvider>
  );
}
