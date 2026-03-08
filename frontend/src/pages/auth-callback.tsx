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

      const deriveNames = () => {
        const fullName = (user as any)?.name ? String((user as any).name) : '';
        const given = (user as any)?.given_name ? String((user as any).given_name) : '';
        const family = (user as any)?.family_name ? String((user as any).family_name) : '';

        const looksLikeEmail = (s: string) => /@/.test(String(s || ''));
        const clean = (s: string) => String(s || '').trim().replace(/^,+|,+$/g, '');

        const parseFullName = (s: string) => {
          const name = clean(s);
          if (!name) return { first_name: '', last_name: '' };
          if (looksLikeEmail(name)) return { first_name: '', last_name: '' };

          // Handle: "Last, First" (common)
          if (name.includes(',')) {
            const [left, right] = name.split(',', 2).map(clean);
            // If left side is an email or empty, don't treat it as a last name.
            if (looksLikeEmail(left)) return { first_name: '', last_name: right || '' };
            return { first_name: right || '', last_name: left || '' };
          }

          const parts = name.split(/\s+/).filter(Boolean);
          if (parts.length === 1) return { first_name: parts[0], last_name: '' };
          return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
        };

        if (given || family) {
          return { first_name: clean(given), last_name: clean(family) };
        }

        return parseFullName(fullName);
      };

      const isCompleteForApp = (profile: any) => {
        // Gate onboarding on travel-critical fields; identity fields can be auto-filled.
        return Boolean(
          profile?.first_name &&
          profile?.last_name &&
          profile?.departure_airport &&
          profile?.passport_country &&
          profile?.passport_expiry_date
        );
      };

      const maybeSyncIdentityProfile = async (existingProfile: any | null) => {
        const email = (user as any)?.email ? String((user as any).email) : '';
        const picture = (user as any)?.picture ? String((user as any).picture) : '';
        const { first_name, last_name } = deriveNames();

        const needsEmail = email && !existingProfile?.email;
        const needsAvatar = picture && !existingProfile?.avatar_url;
        const needsNames = (first_name && !existingProfile?.first_name) || (last_name && !existingProfile?.last_name);

        // Also create the profile row if it doesn't exist yet.
        if (!existingProfile || needsEmail || needsAvatar || needsNames) {
          try {
            await fetch('/api/users/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auth0_id: user.sub,
                ...(email ? { email } : {}),
                ...(first_name ? { first_name } : {}),
                ...(last_name ? { last_name } : {}),
                ...(picture ? { avatar_url: picture } : {}),
              }),
            });
          } catch (e) {
            console.warn('[AuthCallback] Failed to sync identity profile:', e);
          }
        }
      };

      try {
        const res = await fetch(`/api/users/profile?auth0_id=${user.sub}`);

        if (res.ok) {
          const data = await res.json();
          const profile = data?.exists ? data.data : null;
          await maybeSyncIdentityProfile(profile);

          if (data.exists) {
            setLocation(isCompleteForApp(profile) ? '/dashboard' : '/onboarding');
          } else {
            setLocation('/onboarding');
          }
          return;
        }

        if (res.status === 404) {
          await maybeSyncIdentityProfile(null);
          setLocation('/onboarding');
          return;
        }

        console.error("Failed to fetch profile status");
        setLocation('/dashboard');
      } catch (error) {
        console.error("Error checking profile:", error);
        setLocation('/dashboard');
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
