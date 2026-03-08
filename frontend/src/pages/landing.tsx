import { useAuth0 } from '@auth0/auth0-react';
import { Button } from '@/components/ui/button';
import { Globe, ShieldCheck, Zap } from 'lucide-react';
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
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Header - Flat Bold */}
      <header className="px-6 py-6 flex justify-between items-center border-b-4 border-border bg-background sticky top-0 z-50">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="bg-background p-1 rounded-md border-2 border-border overflow-hidden w-12 h-12 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
            <img src="/logo.png" alt="Adealy" className="w-full h-full object-cover" />
          </div>
          <span className="text-2xl font-black tracking-tighter text-foreground">
            Adealy
          </span>
        </div>
        <nav className="flex items-center gap-6">
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button className="h-12 px-6 font-bold transition-all duration-200 hover:scale-105 active:scale-95">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" className="font-black text-primary border-2 border-primary hover:bg-primary hover:text-white transition-colors h-12 px-6" onClick={() => loginWithRedirect()}>
                Log In
              </Button>
              <Button
                className="h-12 px-8 font-black bg-primary text-white transition-all duration-200 hover:scale-105 active:scale-95 shadow-md"
                onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
              >
                Sign Up
              </Button>
            </div>
          )}
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {/* Hero Section - Bold Primary Block */}
        <section className="w-full bg-primary py-24 md:py-32 px-6 relative overflow-hidden flex flex-col items-center justify-center text-center">
          {/* Background Decorative Shapes */}
          <div className="absolute top-10 -left-20 w-80 h-80 rounded-full bg-white opacity-5 pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-white opacity-10 pointer-events-none" />
          <div className="absolute top-40 right-20 w-24 h-24 rotate-45 bg-white opacity-5 pointer-events-none" />

          <div className="max-w-4xl relative z-10 space-y-8 animate-in slide-in-from-bottom-12 duration-700">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-widest">
              <Globe className="w-4 h-4" />
              <span>Version 2.0 Is Here</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-[0.9]">
              Travel Planning,<br />
              <span className="text-white/70">Simplified.</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/90 font-medium max-w-2xl mx-auto leading-relaxed">
              The smartest way to design your international itineraries.
              Flat. Fast. Functional. Completely AI-driven.
            </p>

            <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <Button className="h-16 px-10 text-xl font-black bg-white text-primary rounded-md transition-all duration-200 hover:scale-110 active:scale-95 shadow-none border-none">
                    Continue Planning
                  </Button>
                </Link>
              ) : (
                <>
                  <Button
                    className="h-16 px-10 text-xl font-black bg-white text-primary rounded-md transition-all duration-200 hover:scale-110 active:scale-95 shadow-none border-none"
                    onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
                  >
                    Start Your Journey Now
                  </Button>
                  <Button
                    variant="outline"
                    className="h-16 px-10 text-xl font-black text-white bg-white/10 hover:bg-white hover:text-primary rounded-md transition-all duration-200 hover:scale-110 active:scale-95 border-2 border-white/50"
                    onClick={() => loginWithRedirect()}
                  >
                    Log In
                  </Button>
                </>
              )}
            </div>

          </div>
        </section>

        {/* Features Section - Solid White with Color Block Cards */}
        <section className="w-full py-24 md:py-32 px-6 bg-background flex flex-col items-center">
          <div className="max-w-6xl w-full grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-start text-left space-y-4 p-10 rounded-lg bg-card text-card-foreground transition-all duration-200 hover:scale-105 group cursor-pointer border-b-4 border-primary/20">
              <div className="bg-background p-4 rounded-full border-2 border-primary text-primary transition-transform duration-200 group-hover:scale-110">
                <Globe className="w-8 h-8" />
              </div>
              <h3 className="font-black text-2xl tracking-tight text-foreground">Smart Itineraries</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">
                Organize flights, hotels, and activities in a single, high-speed interface. No clutter, just travel.
              </p>
            </div>

            <div className="flex flex-col items-start text-left space-y-4 p-10 rounded-lg bg-card text-card-foreground transition-all duration-200 hover:scale-105 group cursor-pointer border-b-4 border-secondary/20">
              <div className="bg-background p-4 rounded-full border-2 border-secondary text-secondary transition-transform duration-200 group-hover:scale-110">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="font-black text-2xl tracking-tight text-foreground">Document Vault</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">
                Securely store passport and visa details. Access them instantly, anywhere in the world.
              </p>
            </div>

            <div className="flex flex-col items-start text-left space-y-4 p-10 rounded-lg bg-card text-card-foreground transition-all duration-200 hover:scale-105 group cursor-pointer border-b-4 border-amber-500/20">
              <div className="bg-background p-4 rounded-full border-2 border-amber-500 text-amber-500 transition-transform duration-200 group-hover:scale-110">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="font-black text-2xl tracking-tight text-foreground">AI Optimization</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">
                Powered by Gemini. Get real-time routing, optimized for speed and budget automatically.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section - Bold Amber Block */}
        <section className="w-full bg-amber-500 py-24 px-6 flex flex-col items-center text-center">
          <div className="max-w-3xl space-y-8">
            <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none">
              READY TO<br />DEPART?
            </h2>
            <p className="text-xl md:text-2xl text-white font-bold opacity-90">
              Join thousands of travelers planning with Adealy.
            </p>
            <Button
              className="h-16 px-12 text-xl font-black bg-gray-900 text-white rounded-md transition-all duration-200 hover:scale-110 active:scale-95 border-none"
              onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
            >
              Start Free Trial
            </Button>
          </div>
        </section>

        {/* Footer - Solid Dark Gray */}
        <footer className="w-full bg-gray-900 py-16 px-6 text-white flex flex-col items-center">
          <div className="max-w-6xl w-full flex flex-col md:flex-row justify-between items-center gap-8 border-b-2 border-white/5 pb-12">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1 rounded-md w-10 h-10 flex items-center justify-center">
                <img src="/logo.png" alt="Adealy" className="w-full h-full object-cover" />
              </div>
              <span className="text-2xl font-black tracking-tighter italic">Adealy</span>
            </div>
            <div className="flex gap-8 text-sm font-bold opacity-60">
              <span className="hover:opacity-100 cursor-pointer transition-opacity">Privacy</span>
              <span className="hover:opacity-100 cursor-pointer transition-opacity">Terms</span>
              <span className="hover:opacity-100 cursor-pointer transition-opacity">Twitter</span>
              <span className="hover:opacity-100 cursor-pointer transition-opacity">Status</span>
            </div>
          </div>
          <div className="pt-8 text-xs font-bold opacity-30 uppercase tracking-[0.2em]">
            © 2026 ADEALY LABS. ALL RIGHTS RESERVED.
          </div>
        </footer>
      </main>
    </div>
  );
}
