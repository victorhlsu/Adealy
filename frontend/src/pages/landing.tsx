import { useAuth0 } from '@auth0/auth0-react';
import { Button } from '@/components/ui/button';
import { Globe, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';

export default function LandingPage() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex justify-between items-center border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-border overflow-hidden w-10 h-10 flex items-center justify-center">
            <img src="/logo.png" alt="Adealy" className="w-full h-full object-cover" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Adealy
          </span>
        </div>
        <nav>
          {isAuthenticated ? (
            <Link href="/planner">
              <Button>Go to Planner</Button>
            </Link>
          ) : (
            <div className="space-x-4">
              <Button variant="ghost" onClick={() => loginWithRedirect()}>
                Log In
              </Button>
              <Button onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}>
                Sign Up
              </Button>
            </div>
          )}
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-12 max-w-5xl mx-auto">
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Globe className="w-4 h-4" />
            <span>Your Next Adventure Awaits</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
            Seamless Travel, <br />
            <span className="text-primary">Effortless Planning.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Organize your itineraries, track visas, and fly hassle-free. The smartest way to manage your international travel.
          </p>
          
          <div className="pt-8">
            {isAuthenticated ? (
               <Link href="/planner">
                 <Button size="lg" className="h-14 px-8 text-lg rounded-full">
                   Continue Planning
                   <Globe className="ml-2 w-5 h-5" />
                 </Button>
               </Link>
            ) : (
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
              >
                Start Your Journey Now
              </Button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 pt-16 border-t w-full">
          <div className="flex flex-col items-center text-center space-y-3 p-6 rounded-2xl bg-card border shadow-sm">
            <div className="bg-primary/10 p-3 rounded-full">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Smart Itineraries</h3>
            <p className="text-sm text-muted-foreground">Keep all your flights and hotel bookings in one secure, easily accessible place.</p>
          </div>
          <div className="flex flex-col items-center text-center space-y-3 p-6 rounded-2xl bg-card border shadow-sm">
            <div className="bg-primary/10 p-3 rounded-full">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Travel Document Hub</h3>
            <p className="text-sm text-muted-foreground">Safely store your passport and visa details for quick reference anywhere in the world.</p>
          </div>
          <div className="flex flex-col items-center text-center space-y-3 p-6 rounded-2xl bg-card border shadow-sm">
            <div className="bg-primary/10 p-3 rounded-full">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Global Connectivity</h3>
            <p className="text-sm text-muted-foreground">Access your plans offline and get real-time updates when connected.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
