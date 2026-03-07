import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
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
    <div className="min-h-screen relative flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Bold Header / Poster background */}
      <div className="absolute top-0 left-0 w-full h-[40vh] bg-primary z-0">
        <div className="absolute top-10 -left-10 w-64 h-64 rounded-full bg-white opacity-5 pointer-events-none" />
        <div className="absolute top-20 right-10 w-32 h-32 rotate-12 bg-white opacity-10 pointer-events-none" />
      </div>

      <div className="relative z-10 w-full max-w-xl mx-auto px-4 sm:px-6 py-12 md:py-24">
        {/* Welcome Block - Flat & Bold */}
        <div className="text-center mb-12 bg-white p-10 rounded-lg border-b-8 border-gray-100">
          <div className="inline-flex bg-white p-1 rounded-full mb-6 shadow-none border-4 border-gray-100 w-20 h-20 items-center justify-center overflow-hidden transition-transform duration-200 hover:scale-110">
            <img src="/logo.png" alt="Adealy" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 uppercase">
            Welcome to Adealy
          </h1>
          <p className="text-gray-500 mt-3 text-lg font-medium">
            Let's setup your traveler profile before we take off.
          </p>
        </div>

        <Card className="shadow-none border-4 border-gray-100 bg-white p-2">
          <CardHeader className="pt-8 px-8 pb-4">
            <CardTitle className="text-2xl font-black tracking-tight text-gray-900">TRAVEL DETAILS</CardTitle>
            <CardDescription className="text-gray-500 font-medium">
              This information will be securely synced with your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4">
            <form onSubmit={handleSubmit} className="space-y-8">
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="firstName" className="text-xs font-black uppercase tracking-widest text-gray-400">First Name</Label>
                  <Input 
                    id="firstName" 
                    name="firstName" 
                    value={formData.firstName} 
                    onChange={handleChange} 
                    required 
                    placeholder="John"
                    className="h-14 bg-gray-100 border-none rounded-md px-6 font-bold text-gray-900 focus:bg-white focus:ring-0 focus:border-4 focus:border-primary transition-all"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="lastName" className="text-xs font-black uppercase tracking-widest text-gray-400">Last Name</Label>
                  <Input 
                    id="lastName" 
                    name="lastName" 
                    value={formData.lastName} 
                    onChange={handleChange} 
                    required 
                    placeholder="Doe"
                    className="h-14 bg-gray-100 border-none rounded-md px-6 font-bold text-gray-900 focus:bg-white focus:ring-0 focus:border-4 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="departureAirport" className="text-xs font-black uppercase tracking-widest text-gray-400">Home Airport (Code)</Label>
                <Input 
                  id="departureAirport" 
                  name="departureAirport" 
                  value={formData.departureAirport} 
                  onChange={handleChange} 
                  required 
                  placeholder="e.g. JFK"
                  maxLength={3}
                  className="h-14 bg-gray-100 border-none rounded-md px-6 font-bold text-gray-900 uppercase focus:bg-white focus:ring-0 focus:border-4 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="passportCountry" className="text-xs font-black uppercase tracking-widest text-gray-400">Passport Country of Origin</Label>
                <Input 
                  id="passportCountry" 
                  name="passportCountry" 
                  value={formData.passportCountry} 
                  onChange={handleChange} 
                  required 
                  placeholder="United States"
                  className="h-14 bg-gray-100 border-none rounded-md px-6 font-bold text-gray-900 focus:bg-white focus:ring-0 focus:border-4 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="passportExpiryDate" className="text-xs font-black uppercase tracking-widest text-gray-400">Passport Expiry Date</Label>
                <Input 
                  id="passportExpiryDate" 
                  name="passportExpiryDate" 
                  type="date"
                  value={formData.passportExpiryDate} 
                  onChange={handleChange} 
                  required 
                  className="h-14 bg-gray-100 border-none rounded-md px-6 font-bold text-gray-900 focus:bg-white focus:ring-0 focus:border-4 focus:border-primary transition-all"
                />
              </div>

              <Button type="submit" className="w-full h-16 text-xl font-black bg-primary text-white rounded-md transition-all duration-200 hover:scale-[1.03] active:scale-95 border-none shadow-none" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                    SAVING PROFILE...
                  </>
                ) : (
                  'COMPLETE PROFILE'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
