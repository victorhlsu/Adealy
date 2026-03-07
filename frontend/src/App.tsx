import { Switch, Route, Redirect } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PlannerPage from "@/pages/planner";
import ProfilePage from "@/pages/profile";
import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import AuthCallback from "@/pages/auth-callback";
import { AppStateProvider } from "@/state/app-state";

import { ThemeProvider } from "@/components/theme-provider";

function App() {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AppStateProvider>
            <Switch>
              <Route path="/">
                {isAuthenticated ? <Redirect to="/auth-callback" /> : <LandingPage />}
              </Route>
              <Route path="/auth-callback" component={AuthCallback} />
              <Route path="/onboarding" component={OnboardingPage} />
              <Route path="/planner">
                {!isAuthenticated ? <Redirect to="/" /> : <PlannerPage />}
              </Route>
              <Route path="/planner/:roomId">
                {(params) => !isAuthenticated ? <Redirect to="/" /> : <PlannerPage roomId={params.roomId} />}
              </Route>
              <Route path="/profile">
                {!isAuthenticated ? <Redirect to="/" /> : <ProfilePage />}
              </Route>
              <Route>
                <Redirect to="/" />
              </Route>
            </Switch>
          </AppStateProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
