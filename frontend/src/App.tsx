import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PlannerPage from "@/pages/planner";
import ProfilePage from "@/pages/profile";
import { AppStateProvider } from "@/state/app-state";

import { ThemeProvider } from "@/components/theme-provider";

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AppStateProvider>
            <Switch>
              <Route path="/" component={PlannerPage} />
              <Route path="/profile" component={ProfilePage} />
              <Route component={PlannerPage} />
            </Switch>
          </AppStateProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
