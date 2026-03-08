import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { supabase } from "@/lib/supabase";
import { Plus, Map as MapIcon, ChevronRight, LogOut, User as UserIcon, Calendar, Plane, MapPin, Users as UsersIcon, X, Search, ArrowRight, ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
    const [, setLocation] = useLocation();
    const { user, isAuthenticated, isLoading, logout } = useAuth0();
    const [rooms, setRooms] = useState<any[]>([]);
    const [loadingRooms, setLoadingRooms] = useState(true);

    // Wizard State
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [destination, setDestination] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [travelers, setTravelers] = useState({ adults: 1, children: 0 });
    const [selectedFlight, setSelectedFlight] = useState<any>(null);
    const [flights, setFlights] = useState<any[]>([]);
    const [searchingFlights, setSearchingFlights] = useState(false);
    const [hasSearchedFlights, setHasSearchedFlights] = useState(false);
    const [fromAirports, setFromAirports] = useState<any[]>([]);
    const [toAirports, setToAirports] = useState<any[]>([]);
    const [fromAirport, setFromAirport] = useState("");
    const [toAirport, setToAirport] = useState("");
    const [creatingTrip, setCreatingTrip] = useState(false);
    const [flightType, setFlightType] = useState<'return' | 'one-way'>('return');
    const [wizardError, setWizardError] = useState<string | null>(null);

    // Budget State
    const [userDailyBudget, setUserDailyBudget] = useState(350);
    const [totalBudget, setTotalBudget] = useState(2500);
    const [isBudgetManuallyEdited, setIsBudgetManuallyEdited] = useState(false);

    // Dynamic budget calculation based on days and travelers
    useEffect(() => {
        if (!isBudgetManuallyEdited && startDate && endDate) {
            const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) || 1;
            const people = travelers.adults + travelers.children;
            setTotalBudget(userDailyBudget * days * people);
        }
    }, [startDate, endDate, travelers, userDailyBudget, isBudgetManuallyEdited]);

    const handleRemoveTrip = async (roomId: string, role: string) => {
        const isOwner = role === 'owner';
        if (!confirm(isOwner ? "Are you sure you want to permanently delete this trip for everyone?" : "Are you sure you want to leave this trip?")) return;

        // Optimistic UI update
        setRooms(prev => prev.filter(r => r.id !== roomId));

        try {
            if (isOwner) {
                // Delete the room entirely (assuming ON DELETE CASCADE for members, etc.)
                await supabase.from('rooms').delete().eq('id', roomId);
            } else {
                // Just remove membership
                await supabase.from('room_members').delete().match({ room_id: roomId, user_id: user?.sub });
            }
        } catch (e) {
            console.error("Failed to remove trip:", e);
        }
    };

    useEffect(() => {
        if (!isAuthenticated || !user?.sub) return;

        async function fetchRooms() {
            setLoadingRooms(true);
            const { data, error } = await supabase
                .from('room_members')
                .select(`
                    role,
                    rooms (
                        id, name, created_at,
                        room_state (
                            ai_status
                        )
                    )
                `)
                .eq('user_id', user!.sub);

            if (data) {
                // Flatten structural relations
                const formattedRooms = data.map((membership: any) => ({
                    ...membership.rooms,
                    role: membership.role,
                    ai_status: membership.rooms.room_state?.[0]?.ai_status || membership.rooms.room_state?.ai_status || 'idle'
                })).filter((r: any) => r.id); // Valid rooms only

                // Sort by relative creation date desc
                formattedRooms.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setRooms(formattedRooms);
            }

            // Also fetch user profile for default budget settings
            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('daily_budget')
                .eq('auth0_id', user!.sub)
                .single();
            if (profileData?.daily_budget) {
                setUserDailyBudget(profileData.daily_budget);
            }
            if (error) {
                console.error("Error fetching rooms", error);
            }
            setLoadingRooms(false);
        }

        fetchRooms();
    }, [isAuthenticated, user]);

    if (isLoading || loadingRooms) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary selection:text-white">
            {/* Header - Flat & Bold */}
            <header className="h-20 flex items-center justify-between px-8 border-b-4 border-border bg-background sticky top-0 z-50">
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setLocation("/")}>
                    <div className="h-12 w-12 bg-background rounded-md flex items-center justify-center border-2 border-border overflow-hidden transition-transform duration-200 group-hover:scale-110">
                        <img src="/logo.png" alt="Adealy" className="h-full w-full object-cover" />
                    </div>
                    <span className="font-black text-2xl tracking-tighter text-foreground">Adealy</span>
                </div>
                <div className="flex items-center gap-4">
                    <ModeToggle />
                    <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="w-12 h-12 rounded-full hover:bg-muted transition-all active:scale-95">
                        {user?.picture ? (
                            <img src={user.picture} alt="Profile" className="h-10 w-10 rounded-full border-2 border-border" />
                        ) : (
                            <UserIcon className="h-6 w-6 text-muted-foreground" />
                        )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} className="w-12 h-12 rounded-md hover:bg-muted">
                        <LogOut className="h-6 w-6 text-muted-foreground hover:text-red-500 transition-colors" />
                    </Button>
                </div>
            </header>

            <main className="flex-1 w-full flex flex-col">
                {/* Hero Section - Bold Primary Block */}
                <section className="bg-primary pt-16 pb-24 px-8 relative overflow-hidden">
                    {/* Decorative Shapes */}
                    <div className="absolute top-10 -right-20 w-80 h-80 rounded-full bg-white opacity-5 pointer-events-none" />
                    <div className="absolute -bottom-10 left-10 w-40 h-40 rotate-45 bg-white opacity-5 pointer-events-none" />

                    <div className="max-w-5xl mx-auto relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-widest">
                                <MapIcon className="w-3 h-3" />
                                <span>Travel Command Center</span>
                            </div>
                            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none">YOUR TRIPS</h1>
                            <p className="text-xl text-white/80 font-medium">Ready for your next adventure, {user?.given_name || 'Traveler'}?</p>
                        </div>
                        <Button
                            onClick={() => setShowWizard(true)}
                            className="h-16 px-8 text-lg font-black bg-white text-primary rounded-md transition-all duration-200 hover:scale-110 active:scale-95 border-none shadow-none group"
                        >
                            <Plus className="h-6 w-6 mr-2 group-hover:rotate-90 transition-transform duration-300" /> NEW JOURNEY
                        </Button>
                    </div>
                </section>

                {/* Content Area - Clean White Space */}
                <section className="max-w-5xl w-full mx-auto px-8 -mt-12 mb-24 relative z-20">
                    {rooms.length === 0 ? (
                        <div className="h-80 bg-card border-4 border-border rounded-lg flex flex-col items-center justify-center gap-6 p-10 text-center">
                            <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center border-2 border-border">
                                <MapIcon className="h-10 w-10 text-muted-foreground" />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black text-foreground tracking-tight">NO TRIPS YET</h3>
                                <p className="text-muted-foreground font-medium mt-2 max-w-sm">Create your first trip to start planning your next journey with Adealy.</p>
                            </div>
                            <Button onClick={() => setShowWizard(true)} className="h-14 px-10 font-black bg-primary text-white transition-all hover:scale-105 active:scale-95">
                                GET STARTED
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {rooms.map((room) => (
                                <Card
                                    key={room.id}
                                    onClick={() => setLocation(`/planner/${room.id}`)}
                                    className="group cursor-pointer hover:shadow-xl transition-all duration-300 border-2 border-border hover:border-primary/50 overflow-hidden flex flex-col bg-card"
                                >
                                    <div className="h-48 bg-muted relative border-b-2 border-border group-hover:bg-primary/5 transition-colors overflow-hidden">
                                        {/* Dynamic Trip Image */}
                                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110 opacity-30 dark:opacity-40" style={{ backgroundImage: `url('https://loremflickr.com/600/400/${encodeURIComponent(room.name.split(',')[0].replace(/ Trip/gi, '') || 'city')},landmark,travel/all?lock=${parseInt(room.id.substring(0, 8), 16)}')` }}></div>

                                        {/* Abstract map pattern overlay */}
                                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
                                        <div className="absolute inset-4 flex justify-between items-start">
                                            <Badge variant="secondary" className="font-black tracking-widest uppercase shadow-sm bg-background/90 backdrop-blur-md text-foreground border-2 border-border">
                                                {room.role}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full bg-background/90 backdrop-blur-md hover:bg-destructive hover:text-destructive-foreground text-foreground transition-all shadow-sm z-10 border-2 border-border"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveTrip(room.id, room.role);
                                                }}
                                                title={room.role === 'owner' ? "Delete Trip" : "Leave Trip"}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        {room.ai_status === 'booked' && (
                                            <div className="absolute bottom-4 left-4">
                                                <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-black tracking-widest uppercase shadow-lg border-2 border-emerald-700">
                                                    COMPLETED
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col justify-between gap-6 relative bg-card">
                                        <div>
                                            <h3 className="font-black text-2xl tracking-tighter text-foreground group-hover:text-primary transition-colors leading-tight uppercase line-clamp-2">
                                                {room.name}
                                            </h3>
                                            <p className="text-[10px] font-black text-muted-foreground mt-2 uppercase tracking-widest">
                                                EST. {new Date(room.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between text-xs font-black text-primary uppercase tracking-widest">
                                            <span>{room.ai_status === 'booked' ? "VIEW ARCHIVE" : "OPEN PLAN"}</span>
                                            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-2" />
                                        </div>
                                    </div>
                                    {/* Snappy Bottom Bar indicator */}
                                    <div className="h-2 w-full bg-primary transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200" />
                                </Card>
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {/* Trip Creation Wizard Modal */}
            {showWizard && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border-4 border-border rounded-lg w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Status Bar */}
                        <div className="h-2 w-full bg-muted flex">
                            {[1, 2, 3, 4].map((s) => (
                                <div
                                    key={s}
                                    className={cn(
                                        "flex-1 h-full transition-all duration-500",
                                        wizardStep >= s ? "bg-primary" : "bg-muted"
                                    )}
                                />
                            ))}
                        </div>

                        {/* Wizard Header */}
                        <div className="px-8 py-6 flex items-center justify-between border-b-2 border-border">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Step {wizardStep} of 4</p>
                                <h2 className="text-2xl font-black text-foreground tracking-tighter uppercase">
                                    {wizardStep === 1 && "Where are we going?"}
                                    {wizardStep === 2 && "When is the trip?"}
                                    {wizardStep === 3 && "Who is coming?"}
                                    {wizardStep === 4 && "Find your flights"}
                                </h2>
                            </div>
                            <button onClick={() => setShowWizard(false)} className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-muted transition-colors">
                                <X className="h-6 w-6 text-muted-foreground" />
                            </button>
                        </div>

                        {/* Wizard Content */}
                        <div className="flex-1 overflow-y-auto p-8 min-h-[400px]">
                            {wizardStep === 1 && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Destination City</Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                                            <Input
                                                value={destination}
                                                onChange={(e) => setDestination(e.target.value)}
                                                placeholder="e.g. Kyoto, Japan"
                                                className="h-14 pl-12 text-lg font-bold border-2 focus:border-primary shadow-none bg-background text-foreground"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-4 bg-primary/10 border-2 border-primary/20 rounded-lg">
                                        <p className="text-sm font-medium text-primary">Tip: Start with a specific city for the best flight and hotel options.</p>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 2 && (
                                <div className="space-y-6">
                                    <div className="flex bg-gray-100 p-1 rounded-lg">
                                        <button
                                            onClick={() => setFlightType('return')}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-md transition-all",
                                                flightType === 'return' ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
                                            )}
                                        >
                                            Round Trip
                                        </button>
                                        <button
                                            onClick={() => setFlightType('one-way')}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-md transition-all",
                                                flightType === 'one-way' ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
                                            )}
                                        >
                                            One Way
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black uppercase tracking-widest text-gray-500">Departure</Label>
                                            <div className="relative">
                                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                                <Input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                    className="h-14 pl-12 text-lg font-bold border-2 focus:border-primary shadow-none"
                                                />
                                            </div>
                                        </div>
                                        <div className={cn("space-y-2 transition-opacity", flightType === 'one-way' && "opacity-30 pointer-events-none")}>
                                            <Label className="text-xs font-black uppercase tracking-widest text-gray-500">Return</Label>
                                            <div className="relative">
                                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                                <Input
                                                    type="date"
                                                    disabled={flightType === 'one-way'}
                                                    value={startDate && !endDate && flightType === 'return' ? startDate : endDate}
                                                    onChange={(e) => setEndDate(e.target.value)}
                                                    className="h-14 pl-12 text-lg font-bold border-2 focus:border-primary shadow-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 3 && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black uppercase tracking-widest text-gray-500">Adults</Label>
                                            <div className="flex items-center gap-4">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setTravelers(prev => ({ ...prev, adults: Math.max(1, prev.adults - 1) }))}
                                                    className="h-12 w-12 text-xl font-bold border-2"
                                                >-</Button>
                                                <span className="text-2xl font-black">{travelers.adults}</span>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setTravelers(prev => ({ ...prev, adults: prev.adults + 1 }))}
                                                    className="h-12 w-12 text-xl font-bold border-2"
                                                >+</Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black uppercase tracking-widest text-gray-500">Children</Label>
                                            <div className="flex items-center gap-4">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setTravelers(prev => ({ ...prev, children: Math.max(0, prev.children - 1) }))}
                                                    className="h-12 w-12 text-xl font-bold border-2"
                                                >-</Button>
                                                <span className="text-2xl font-black">{travelers.children}</span>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setTravelers(prev => ({ ...prev, children: prev.children + 1 }))}
                                                    className="h-12 w-12 text-xl font-bold border-2"
                                                >+</Button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col md:flex-row items-center gap-4">
                                        <div className="flex-1 flex items-center gap-4 p-4 border-2 border-dashed border-border rounded-lg bg-card">
                                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                                <UsersIcon className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-foreground">{travelers.adults + travelers.children} Travelers</p>
                                                <p className="text-xs text-muted-foreground font-medium">Pricing will be adjusted per person.</p>
                                            </div>
                                        </div>

                                        <div className="flex-1 w-full space-y-2">
                                            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total Budget ($)</Label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                                                <Input
                                                    type="number"
                                                    value={totalBudget}
                                                    onChange={(e) => {
                                                        setTotalBudget(parseInt(e.target.value) || 0);
                                                        setIsBudgetManuallyEdited(true);
                                                    }}
                                                    className="h-14 pl-8 text-lg font-bold border-2 focus:border-primary shadow-none bg-background"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 4 && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 relative">
                                            <Label className="text-xs font-black uppercase tracking-widest text-gray-500">From Airport</Label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    value={fromAirport}
                                                    onChange={async (e) => {
                                                        const val = e.target.value;
                                                        setFromAirport(val);
                                                        if (val.length >= 2) {
                                                            try {
                                                                const res = await fetch('/api/data/airports', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ city: val, limit: 10 })
                                                                });
                                                                const data = await res.json();
                                                                setFromAirports(data.airports || []);
                                                            } catch (e) {
                                                                console.error("Failed to search from airports", e);
                                                            }
                                                        } else {
                                                            setFromAirports([]);
                                                        }
                                                    }}
                                                    placeholder="City or Airport Code"
                                                    className="h-12 pl-10 text-sm font-bold border-2 shadow-none"
                                                />
                                            </div>
                                            {fromAirports.length > 0 && fromAirport.length >= 2 && (
                                                <div className="absolute top-full left-0 w-full mt-1 bg-white border-2 border-gray-900 rounded-lg shadow-xl z-50 max-h-[150px] overflow-y-auto">
                                                    {fromAirports.map(a => (
                                                        <button
                                                            key={a.code}
                                                            onClick={() => { setFromAirport(a.code); setFromAirports([]); }}
                                                            className="w-full px-4 py-3 text-left hover:bg-gray-100 border-b border-gray-100 last:border-none group"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-black text-sm text-primary">{a.code}</span>
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase">{a.city}, {a.countryCode}</span>
                                                            </div>
                                                            <p className="text-[10px] font-medium text-gray-500 truncate">{a.name}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2 relative">
                                            <Label className="text-xs font-black uppercase tracking-widest text-gray-500">To Destination</Label>
                                            <div className="relative">
                                                <Plane className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                                <Input
                                                    value={toAirport}
                                                    onChange={async (e) => {
                                                        const val = e.target.value;
                                                        setToAirport(val);
                                                        if (val.length >= 2) {
                                                            try {
                                                                const res = await fetch('/api/data/airports', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                        city: val,
                                                                        countryName: destination.split(',').pop()?.trim(),
                                                                        limit: 10
                                                                    })
                                                                });
                                                                const data = await res.json();
                                                                setToAirports(data.airports || []);
                                                            } catch (e) {
                                                                console.error("Failed to search to airports", e);
                                                            }
                                                        } else {
                                                            setToAirports([]);
                                                        }
                                                    }}
                                                    placeholder="City or Airport Code"
                                                    className="h-12 pl-10 text-sm font-bold border-2 shadow-none"
                                                />
                                            </div>
                                            {toAirports.length > 0 && toAirport.length >= 2 && (
                                                <div className="absolute top-full left-0 w-full mt-1 bg-card border-2 border-border rounded-lg shadow-xl z-50 max-h-[150px] overflow-y-auto">
                                                    {toAirports.map(a => (
                                                        <button
                                                            key={a.code}
                                                            onClick={() => { setToAirport(a.code); setToAirports([]); }}
                                                            className="w-full px-4 py-3 text-left hover:bg-muted border-b border-border last:border-none group"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-black text-sm text-primary">{a.code}</span>
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase">{a.city}, {a.countryCode}</span>
                                                            </div>
                                                            <p className="text-[10px] font-medium text-muted-foreground truncate">{a.name}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        onClick={async () => {
                                            setSearchingFlights(true);
                                            setHasSearchedFlights(true);
                                            try {
                                                const res = await fetch('/api/data/flights', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        from: fromAirport,
                                                        to: toAirport,
                                                        date: startDate,
                                                        returnDate: flightType === 'return' ? endDate : undefined,
                                                        adults: travelers.adults,
                                                        children: travelers.children
                                                    })
                                                });
                                                const data = await res.json();
                                                setFlights(data.direct_flights || []);
                                            } catch (e) {
                                                console.error("Flight search failed", e);
                                            } finally {
                                                setSearchingFlights(false);
                                            }
                                        }}
                                        disabled={!fromAirport || !toAirport || searchingFlights}
                                        className="w-full h-12 font-black uppercase tracking-widest"
                                    >
                                        {searchingFlights ? "Searching..." : "Search Flights"}
                                    </Button>

                                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                                        {flights.length > 0 ? (
                                            flights.map((f, i) => (
                                                <div
                                                    key={i}
                                                    onClick={() => setSelectedFlight(f)}
                                                    className={cn(
                                                        "p-4 border-2 rounded-lg cursor-pointer transition-all flex items-center justify-between group",
                                                        selectedFlight === f ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center font-bold text-[10px] text-muted-foreground border border-border group-hover:bg-background transition-colors">
                                                            {f.name?.[0] || 'A'}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-foreground">{f.name}</p>
                                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">{f.departure} → {f.arrival}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-black text-primary">{f.price}</p>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{f.duration}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : !searchingFlights && (
                                            <div className="h-32 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
                                                <Plane className="h-8 w-8 mb-2 opacity-20" />
                                                <p className="text-xs font-bold uppercase tracking-widest">
                                                    {hasSearchedFlights ? "No flights found for this route" : "Enter route to search"}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Wizard Footer */}
                        <div className="px-8 py-6 bg-muted flex items-center justify-between border-t-2 border-border">
                            {wizardStep > 1 && (
                                <Button
                                    variant="ghost"
                                    onClick={() => setWizardStep(s => s - 1)}
                                    className="font-black text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                                </Button>
                            )}
                            <div className="ml-auto">
                                {wizardStep < 4 ? (
                                    <Button
                                        disabled={(wizardStep === 1 && !destination) || (wizardStep === 2 && (!startDate || (flightType === 'return' && !endDate)))}
                                        onClick={() => setWizardStep(s => s + 1)}
                                        className="h-12 px-8 font-black uppercase tracking-widest gap-2"
                                    >
                                        Next <ArrowRight className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={async () => {
                                            if (creatingTrip) return;
                                            setCreatingTrip(true);
                                            setWizardError(null);
                                            try {
                                                const { data: room, error: roomErr } = await supabase
                                                    .from('rooms')
                                                    .insert({
                                                        name: destination,
                                                        created_by: user!.sub
                                                    })
                                                    .select()
                                                    .single();

                                                if (roomErr) throw roomErr;
                                                if (!room) throw new Error("Failed to create room");

                                                // Create ownership immediately! (Bypass schema errors)
                                                try {
                                                    await supabase.from('room_members').insert({
                                                        room_id: room.id,
                                                        user_id: user!.sub,
                                                        role: 'owner',
                                                        can_prompt_ai: true
                                                    });
                                                } catch (e) {
                                                    console.warn("[Dashboard] room_members insertion skipped due to schema issues:", e);
                                                }

                                                // Pre-initialize room_state
                                                await supabase.from('room_state').insert({
                                                    room_id: room.id,
                                                    ai_status: 'idle'
                                                });

                                                // Insert initial message with flight data
                                                if (selectedFlight) {
                                                    const priceStr = (selectedFlight.price || "0").replace(/[^0-9]/g, '');
                                                    const price = parseInt(priceStr) || 0;

                                                    const flightCard = {
                                                        id: `flight_${Date.now()}`,
                                                        type: "transport",
                                                        layer: "transport",
                                                        day: 1,
                                                        name: `Flight to ${destination}`,
                                                        position: { lat: 0, lng: 0 }, // Will be fixed by AI later
                                                        data: {
                                                            mode: "flight",
                                                            price: price,
                                                            description: `${selectedFlight.name}: ${selectedFlight.departure} - ${selectedFlight.arrival}`,
                                                            startTime: selectedFlight.departure,
                                                            endTime: selectedFlight.arrival,
                                                            bookingUrl: selectedFlight.booking_url,
                                                            from: { name: fromAirport },
                                                            to: { name: toAirport }
                                                        }
                                                    };

                                                    const tripData = {
                                                        title: `${destination} Trip`,
                                                        destination: destination,
                                                        startDate,
                                                        endDate,
                                                        days: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) || 1,
                                                        summary: {
                                                            estimatedBudget: totalBudget || 2500,
                                                            budgetUsed: price,
                                                            travelers: travelers.adults + travelers.children
                                                        },
                                                        cards: [flightCard]
                                                    };

                                                    await supabase.from('messages').insert({
                                                        room_id: room.id,
                                                        content: `__TRIP_DATA__:${JSON.stringify(tripData)}`,
                                                        is_ai: true
                                                    });

                                                    await supabase.from('messages').insert({
                                                        room_id: room.id,
                                                        content: `Success! I've started your trip to ${destination} with the selected flight. Mention @Adealy to continue planning your itinerary.`,
                                                        is_ai: true
                                                    });

                                                    // [AUTO-PLANNING] Trigger Gemini immediately
                                                    const autoPrompt = `@Adealy I've just started my journey to ${destination}! Please architect a full ${tripData.days}-day itinerary for me, including stays, local transit, and daily hidden gems/activities. Use the flight I picked as the starting point!`;

                                                    // 1. Insert User Message
                                                    await supabase.from('messages').insert({
                                                        room_id: room.id,
                                                        sender_id: user!.sub,
                                                        content: autoPrompt,
                                                        is_ai: false
                                                    });

                                                    // 2. Trigger API (Fire and forget, we are redirecting anyway)
                                                    fetch('/api/chat', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            room_id: room.id,
                                                            prompt: autoPrompt,
                                                            auth0_id: user!.sub
                                                        })
                                                    }).catch(err => console.error("Auto-planning trigger failed:", err));
                                                }

                                                setLocation(`/planner/${room.id}`);
                                            } catch (err: any) {
                                                console.error("Failed to create trip:", err);
                                                setWizardError(err.message || 'Unknown error');
                                            } finally {
                                                setCreatingTrip(false);
                                            }
                                        }}
                                        disabled={!selectedFlight || creatingTrip}
                                        className="h-12 px-10 font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                    >
                                        {creatingTrip ? "Starting..." : "Create Trip"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {wizardError && (
                            <div className="bg-destructive/10 border-t-2 border-destructive/20 px-8 py-4 flex items-center justify-between gap-4">
                                <p className="text-xs font-bold text-destructive uppercase tracking-wider">
                                    Error: {wizardError}
                                </p>
                                <button onClick={() => setWizardError(null)} className="text-destructive/70 hover:text-destructive font-black text-xs uppercase">
                                    Dismiss
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
