import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import {
    User,
    CreditCard,
    FileText,
    Plane,
    ChevronLeft,
    Save,
    Camera
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";

import { useAppState } from "@/state/app-state";

export default function ProfilePage() {
    const [, setLocation] = useLocation();
    const { user, isAuthenticated, isLoading: authLoading } = useAuth0();
    
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingProfile, setIsFetchingProfile] = useState(true);
    const [isEditingPassport, setIsEditingPassport] = useState(false);
    const [profileData, setProfileData] = useState<any>(null);
    const { defaultCurrency, setDefaultCurrency } = useAppState();


    useEffect(() => {
        async function loadProfile() {
            if (!isAuthenticated || !user?.sub) {
                setIsFetchingProfile(false);
                return;
            }
            
            try {
                const res = await fetch(`/api/users/profile?auth0_id=${user.sub}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.exists) {
                        setProfileData(data.data);
                    }
                }
            } catch (e) {
                console.error("Failed to load profile", e);
            } finally {
                setIsFetchingProfile(false);
            }
        }
        
        loadProfile();
    }, [isAuthenticated, user]);

    const handleChange = (field: string, value: string | number) => {
        setProfileData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!user?.sub) return;
        
        setIsLoading(true);
        try {
            const res = await fetch('/api/users/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auth0_id: user.sub,
                    first_name: profileData?.first_name || user.given_name || (user.name ? user.name.split(' ')[0] : ""),
                    last_name: profileData?.last_name || user.family_name || (user.name ? user.name.split(' ').slice(1).join(' ') : ""),
                    departure_airport: profileData?.departure_airport || "",
                    passport_country: profileData?.passport_country || "",
                    passport_expiry_date: profileData?.passport_expiry_date || "",
                    avatar_url: profileData?.avatar_url || user.picture || ""
                })
            });
            
            if (res.ok) {
                const data = await res.json();
                setProfileData(data.data);
                setLocation("/");
            }
        } catch (e) {
            console.error("Save failed", e);
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading || isFetchingProfile) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-muted-foreground animate-pulse text-sm">Loading profile...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center">

            {/* Header */}
            <header className="w-full max-w-4xl h-16 flex items-center justify-between px-6 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="hover:bg-accent text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="font-bold text-lg">Profile & Preferences</h1>
                </div>
                <div className="flex items-center gap-3">
                    <ModeToggle />
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 border border-border" />
                </div>
            </header>

            <main className="w-full max-w-3xl p-6 py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* Personal Info */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/20">
                            <User className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Personal Details</h2>
                            <p className="text-sm text-gray-500">Your basic traveler identity.</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-center mb-6 space-y-3">
                        <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-border relative group cursor-pointer" onClick={() => {
                            const url = prompt("Enter new Avatar URL:");
                            if (url) handleChange("avatar_url", url);
                        }}>
                           {(profileData?.avatar_url || user?.picture) ? (
                               <img src={profileData?.avatar_url || user?.picture} alt="Avatar" className="w-full h-full object-cover" />
                           ) : (
                               <div className="w-full h-full bg-muted flex items-center justify-center">
                                   <User className="h-10 w-10 text-muted-foreground" />
                               </div>
                           )}
                           <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                               <Camera className="h-6 w-6 text-white" />
                           </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Click to update avatar</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">First Name</label>
                            <Input 
                                value={profileData?.first_name || user?.given_name || (user?.name?.split(' ')[0]) || ""} 
                                onChange={(e) => handleChange("first_name", e.target.value)}
                                className="bg-muted border-border h-10" 
                                placeholder="John"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Last Name</label>
                            <Input 
                                value={profileData?.last_name || user?.family_name || (user?.name?.split(' ').slice(1).join(' ')) || ""} 
                                onChange={(e) => handleChange("last_name", e.target.value)}
                                className="bg-muted border-border h-10" 
                                placeholder="Doe"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">Email Address</label>
                        <Input 
                            value={user?.email || ""} 
                            readOnly
                            disabled
                            className="bg-muted border-border h-10 opacity-70 cursor-not-allowed" 
                        />
                    </div>
                </section>

                {/* Travel Documents */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 bg-orange-600/20 rounded-lg flex items-center justify-center border border-orange-500/20">
                            <FileText className="h-5 w-5 text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Travel Documents</h2>
                            <p className="text-sm text-gray-500">Manage your passports and visas.</p>
                        </div>
                    </div>

                    <Card className="bg-card border-border p-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <FileText className="h-24 w-24" />
                        </div>
                        <div className="flex justify-between items-start relative z-10">
                            <div className="space-y-1 w-full max-w-sm">
                                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Primary Passport</div>
                                {isEditingPassport ? (
                                    <select
                                        value={profileData?.passport_country || ""}
                                        onChange={(e) => handleChange("passport_country", e.target.value)}
                                        className="w-full bg-muted border border-border h-10 rounded-md px-3 mt-2 text-sm text-foreground focus:outline-none"
                                    >
                                        <option value="" disabled>Select a country</option>
                                        <option value="USA">United States</option>
                                        <option value="CAN">Canada</option>
                                        <option value="GBR">United Kingdom</option>
                                        <option value="AUS">Australia</option>
                                        <option value="IND">India</option>
                                        <option value="DEU">Germany</option>
                                        <option value="FRA">France</option>
                                    </select>
                                ) : (
                                    <>
                                        <div className="text-lg font-bold flex items-center gap-2">
                                            {profileData?.passport_country || "Not specified"} <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">VALID</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground font-mono">
                                            Expires: {profileData?.passport_expiry_date ? new Date(profileData.passport_expiry_date).toLocaleDateString() : "Unknown"}
                                        </div>
                                    </>
                                )}
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="bg-muted/50 border-white/10 hover:bg-muted"
                                onClick={() => setIsEditingPassport(!isEditingPassport)}
                            >
                                {isEditingPassport ? 'Done' : 'Edit'}
                            </Button>
                        </div>
                    </Card>

                    <div className="bg-muted/30 border border-dashed border-border rounded-lg p-4 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-all">
                        <span className="text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" /> Add another passport</span>
                    </div>
                </section>

                {/* Preferences */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 bg-emerald-600/20 rounded-lg flex items-center justify-center border border-emerald-500/20">
                            <Plane className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Travel Preferences</h2>
                            <p className="text-sm text-gray-500">Customize your default trip parameters.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Home Airport</label>
                            <Input 
                                value={profileData?.departure_airport || ""} 
                                onChange={(e) => handleChange("departure_airport", e.target.value)}
                                className="bg-muted border-border h-10 uppercase" 
                                maxLength={3} 
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Default Currency</label>
                            <select
                                value={defaultCurrency}
                                onChange={(e) => setDefaultCurrency(e.target.value)}
                                className="w-full bg-muted border border-border h-10 rounded-md px-3 text-sm text-foreground focus:outline-none"
                            >
                                <option>USD - US Dollar</option>
                                <option>CAD - Canadian Dollar</option>
                                <option>EUR - Euro</option>
                                <option>JPY - Japanese Yen</option>
                            </select>
                        </div>
                    </div>
                </section>

                {/* Global Budget */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 bg-pink-600/20 rounded-lg flex items-center justify-center border border-pink-500/20">
                            <CreditCard className="h-5 w-5 text-pink-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Budget Settings</h2>
                            <p className="text-sm text-muted-foreground">Set your spending comfort zone.</p>
                        </div>
                    </div>

                    <Card className="bg-card border-border p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium">Daily Spending Limit (per person)</label>
                                <span className="text-sm font-bold text-pink-400">${profileData?.daily_budget || 350}</span>
                            </div>
                            
                            <input 
                                type="range" 
                                min="50" 
                                max="2000" 
                                step="50"
                                value={profileData?.daily_budget || 350}
                                onChange={(e) => handleChange("daily_budget", parseInt(e.target.value))}
                                className="w-full accent-pink-500 cursor-pointer h-2 bg-muted rounded-lg appearance-none"
                            />
                            
                            <p className="text-xs text-muted-foreground">Includes food, transport, and activities. Excludes flights and accommodation.</p>
                        </div>
                    </Card>
                </section>

                <div className="pt-6 flex justify-end gap-3 border-t border-border">
                    <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => setLocation("/")}>Cancel</Button>
                    <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 min-w-[120px]">
                        {isLoading ? "Saving..." : <><Save className="h-4 w-4 mr-2" /> Save Changes</>}
                    </Button>
                </div>

            </main>
        </div>
    );
}

function Plus({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}
