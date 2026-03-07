import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const { user, isAuthenticated, isLoading } = useAuth0();
  const [, setLocation] = useLocation();

  useEffect(() => {
    async function checkProfile() {
      if (isLoading) return;

      if (!isAuthenticated || !user?.sub) {
        setLocation('/');
        return;
      }

      try {
        const res = await fetch(`/api/users/profile?auth0_id=${user.sub}`);
        
        if (res.ok) {
          const data = await res.json();
          if (data.exists) {
            // Profile exists, go to planner
            setLocation('/planner');
          } else {
            // New user, go to onboarding
            setLocation('/onboarding');
          }
        } else if (res.status === 404) {
          // New user, go to onboarding
          setLocation('/onboarding');
        } else {
          // Fallback on error
          console.error("Failed to fetch profile status");
          setLocation('/planner');
        }
      } catch (error) {
        console.error("Error checking profile:", error);
        setLocation('/planner');
      }
    }

    checkProfile();
  }, [user, isAuthenticated, isLoading, setLocation]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background space-y-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-muted-foreground animate-pulse">Setting up your account...</p>
    </div>
  );
}
