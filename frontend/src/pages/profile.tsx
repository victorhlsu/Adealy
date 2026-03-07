import { useState } from "react";
import { useLocation } from "wouter";
import {
    User,
    CreditCard,
    FileText,
    Plane,
    ChevronLeft,
    Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";

import { useAppState } from "@/state/app-state";

export default function ProfilePage() {
    const [, setLocation] = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const { defaultCurrency, setDefaultCurrency } = useAppState();

    const handleSave = () => {
        setIsLoading(true);
        // Simulate save
        setTimeout(() => {
            setIsLoading(false);
            setLocation("/");
        }, 1000);
    };

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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Full Name</label>
                            <Input defaultValue="John Doe" className="bg-muted border-border h-10" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Email</label>
                            <Input defaultValue="john.doe@example.com" className="bg-muted border-border h-10" />
                        </div>
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
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Primary Passport</div>
                                <div className="text-lg font-bold flex items-center gap-2">
                                    United States of America <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">VALID</Badge>
                                </div>
                                <div className="text-sm text-muted-foreground font-mono">Expires: 12/2029</div>
                            </div>
                            <Button variant="outline" size="sm" className="bg-muted/50 border-white/10 hover:bg-muted">Edit</Button>
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
                            <Input defaultValue="JFK - John F. Kennedy Intl" className="bg-muted border-border h-10" />
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

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Preferred Airline Alliance</label>
                            <div className="flex gap-2">
                                <Badge variant="secondary" className="bg-blue-900/40 text-blue-200 hover:bg-blue-800/40 cursor-pointer border border-blue-500/30">Star Alliance</Badge>
                                <Badge variant="outline" className="border-border text-muted-foreground hover:text-foreground cursor-pointer">OneWorld</Badge>
                                <Badge variant="outline" className="border-border text-muted-foreground hover:text-foreground cursor-pointer">SkyTeam</Badge>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Hotel Tier</label>
                            <div className="flex gap-2">
                                <Badge variant="outline" className="border-border text-muted-foreground hover:text-foreground cursor-pointer">Budget</Badge>
                                <Badge variant="secondary" className="bg-purple-900/40 text-purple-200 hover:bg-purple-800/40 cursor-pointer border border-purple-500/30">Luxury</Badge>
                                <Badge variant="outline" className="border-border text-muted-foreground hover:text-foreground cursor-pointer">Boutique</Badge>
                            </div>
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
                            <div className="flex justify-between">
                                <label className="text-sm font-medium">Daily Spending Limit (per person)</label>
                                <span className="text-sm font-bold text-pink-400">$350</span>
                            </div>
                            <div className="h-2 bg-black rounded-full overflow-hidden">
                                <div className="h-full bg-pink-500 w-[40%]" />
                            </div>
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
