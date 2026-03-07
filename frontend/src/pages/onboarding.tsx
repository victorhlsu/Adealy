import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaneTakeoff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function OnboardingPage() {
  const { user, isAuthenticated, isLoading } = useAuth0();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    departureAirport: '',
    passportCountry: '',
    passportExpiryDate: '',
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.sub) return;

    setIsSubmitting(true);
    try {
      // In a real app we'd get the Auth0 token to send, but for hackathon we are bypassing robust backend auth check
      const response = await fetch('/api/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth0_id: user.sub,
          email: user.email,
          first_name: formData.firstName,
          last_name: formData.lastName,
          departure_airport: formData.departureAirport,
          passport_country: formData.passportCountry,
          passport_expiry_date: formData.passportExpiryDate,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save profile');
      }

      toast({
        title: "Profile saved!",
        description: "Your travel details have been successfully stored.",
      });
      
      setLocation('/planner');
      
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Could not save your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* Dynamic Background Map/Pattern */}
      <div className="absolute inset-0 z-0 bg-slate-900 border-border">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent"></div>
          {/* We can use a simplified map pattern here instead of a heavy map load */}
      </div>

      <div className="relative z-10 w-full max-w-xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8 backdrop-blur-sm bg-background/50 p-6 rounded-2xl border border-white/10 shadow-2xl">
          <div className="inline-flex bg-primary/20 p-3 rounded-full mb-4 shadow-inner">
            <PlaneTakeoff className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome to Adealy</h1>
          <p className="text-muted-foreground mt-2 text-md">
            Let's setup your traveler profile before we take off.
          </p>
        </div>

        <Card className="shadow-lg border-primary/20">
          <CardHeader>
            <CardTitle>Travel Details</CardTitle>
            <CardDescription>
              This information will be securely synced with your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input 
                    id="firstName" 
                    name="firstName" 
                    value={formData.firstName} 
                    onChange={handleChange} 
                    required 
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input 
                    id="lastName" 
                    name="lastName" 
                    value={formData.lastName} 
                    onChange={handleChange} 
                    required 
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="departureAirport">Home Airport (Code)</Label>
                <Input 
                  id="departureAirport" 
                  name="departureAirport" 
                  value={formData.departureAirport} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. JFK"
                  maxLength={3}
                  className="uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passportCountry">Passport Country of Origin</Label>
                <Input 
                  id="passportCountry" 
                  name="passportCountry" 
                  value={formData.passportCountry} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. United States"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passportExpiryDate">Passport Expiry Date</Label>
                <Input 
                  id="passportExpiryDate" 
                  name="passportExpiryDate" 
                  type="date"
                  value={formData.passportExpiryDate} 
                  onChange={handleChange} 
                  required 
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving Profile...
                  </>
                ) : (
                  'Save & Continue to Planner'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
