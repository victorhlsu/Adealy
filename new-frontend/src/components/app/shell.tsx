import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Map, Settings, Sparkles, LogOut, Globe, ShieldCheck } from "lucide-react";
import { useAppState } from "@/state/app-state";
import { cn } from "@/lib/utils";

export default function AppShell({
  title,
  children,
  rightSlot,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  const [loc] = useLocation();
  const { passports, email, logout } = useAppState();

  return (
    <div className="min-h-screen paper grain">
      <header className="sticky top-0 z-40 border-b bg-background/65 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl border bg-card shadow-sm">
              <Globe className="h-4.5 w-4.5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Wayfarer</div>
              <div className="text-xs text-muted-foreground">Prompt-first travel planning</div>
            </div>
          </div>

          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
            <Link href="/app" data-testid="link-planner" className={cn("rounded-lg px-3 py-2 text-sm hover-elevate", loc === "/app" && "toggle-elevate toggle-elevated")}
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Planner
              </span>
            </Link>
            <Link
              href="/settings"
              data-testid="link-settings"
              className={cn(
                "rounded-lg px-3 py-2 text-sm hover-elevate",
                loc === "/settings" && "toggle-elevate toggle-elevated",
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Settings className="h-4 w-4" /> Account
              </span>
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="secondary" className="gap-1" data-testid="badge-passports-count">
                <ShieldCheck className="h-3.5 w-3.5" />
                {passports.length || 0} passport{passports.length === 1 ? "" : "s"}
              </Badge>
              <Separator orientation="vertical" className="mx-1 h-6" />
            </div>
            {rightSlot}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="hidden md:inline-flex"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
        {title ? (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xl font-semibold soft-stroke" data-testid="text-page-title">
                  {title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="text-user-email">
                  <span className="inline-flex items-center gap-1">
                    <Map className="h-3.5 w-3.5" />
                    Passport-aware messaging is mocked and updates instantly.
                  </span>
                  <span className="hidden sm:inline">\u00b7</span>
                  <span className="truncate">{email ?? "you@example.com"}</span>
                </div>
              </div>
              <div className="hidden md:block">{null}</div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-6">
        <div className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium">Frontend-only prototype</div>
              <div className="text-xs text-muted-foreground">
                No backend, no auth service, no APIs. Your changes live only in local state.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" data-testid="badge-mock-auth">Mock auth</Badge>
              <Badge variant="outline" data-testid="badge-mock-visa">Mock visa</Badge>
              <Badge variant="outline" data-testid="badge-mock-map">Mock map</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
