import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { supabase } from "@/lib/supabase";
import { Plus, Map as MapIcon, ChevronRight, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";

export default function DashboardPage() {
    const [, setLocation] = useLocation();
    const { user, isAuthenticated, isLoading, logout } = useAuth0();
    const [rooms, setRooms] = useState<any[]>([]);
    const [loadingRooms, setLoadingRooms] = useState(true);

    useEffect(() => {
        if (!isAuthenticated || !user?.sub) return;

        async function fetchRooms() {
            setLoadingRooms(true);
            const { data, error } = await supabase
                .from('room_members')
                .select(`
                    role,
                    rooms (
                        id, name, created_at
                    )
                `)
                .eq('user_id', user!.sub);

            if (data) {
                // Flatten structural relations
                const formattedRooms = data.map((membership: any) => ({
                    ...membership.rooms,
                    role: membership.role
                })).filter((r: any) => r.id); // Valid rooms only

                // Sort by relative creation date desc
                formattedRooms.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setRooms(formattedRooms);
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
        <div className="min-h-screen bg-white flex flex-col font-sans selection:bg-primary selection:text-white">
            {/* Header - Flat & Bold */}
            <header className="h-20 flex items-center justify-between px-8 border-b-4 border-gray-100 bg-white sticky top-0 z-50">
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setLocation("/")}>
                    <div className="h-12 w-12 bg-white rounded-md flex items-center justify-center border-2 border-gray-200 overflow-hidden transition-transform duration-200 group-hover:scale-110">
                        <img src="/logo.png" alt="Adealy" className="h-full w-full object-cover" />
                    </div>
                    <span className="font-black text-2xl tracking-tighter text-gray-900">Adealy</span>
                </div>
                <div className="flex items-center gap-4">
                    <ModeToggle />
                    <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="w-12 h-12 rounded-full hover:bg-gray-100 transition-all active:scale-95">
                        {user?.picture ? (
                            <img src={user.picture} alt="Profile" className="h-10 w-10 rounded-full border-2 border-gray-200" />
                        ) : (
                            <UserIcon className="h-6 w-6 text-gray-600" />
                        )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} className="w-12 h-12 rounded-md hover:bg-gray-100">
                        <LogOut className="h-6 w-6 text-gray-400 hover:text-red-500 transition-colors" />
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
                            onClick={() => setLocation("/planner")} 
                            className="h-16 px-8 text-lg font-black bg-white text-primary rounded-md transition-all duration-200 hover:scale-110 active:scale-95 border-none shadow-none group"
                        >
                            <Plus className="h-6 w-6 mr-2 group-hover:rotate-90 transition-transform duration-300" /> NEW JOURNEY
                        </Button>
                    </div>
                </section>

                {/* Content Area - Clean White Space */}
                <section className="max-w-5xl w-full mx-auto px-8 -mt-12 mb-24 relative z-20">
                    {rooms.length === 0 ? (
                        <div className="h-80 bg-white border-4 border-gray-100 rounded-lg flex flex-col items-center justify-center gap-6 p-10 text-center">
                            <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center border-2 border-gray-100">
                                <MapIcon className="h-10 w-10 text-gray-300" />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black text-gray-900 tracking-tight">NO TRIPS YET</h3>
                                <p className="text-gray-500 font-medium mt-2 max-w-sm">Create your first trip to start planning your next journey with Adealy.</p>
                            </div>
                            <Button onClick={() => setLocation("/planner")} className="h-14 px-10 font-black bg-primary text-white transition-all hover:scale-105 active:scale-95">
                                GET STARTED
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {rooms.map((room) => (
                                <Card 
                                    key={room.id}
                                    className="group relative overflow-hidden border-4 border-gray-100 bg-white hover:border-primary/30 transition-all cursor-pointer shadow-none p-0 flex flex-col rounded-lg"
                                    onClick={() => setLocation(`/planner/${room.id}`)}
                                >
                                    <div className="h-40 bg-gray-50 flex items-center justify-center relative border-b-2 border-gray-100 transition-colors group-hover:bg-blue-50">
                                        <MapIcon className="h-12 w-12 text-gray-200 group-hover:scale-125 group-hover:text-primary/20 transition-all duration-500" />
                                        <div className="absolute top-4 right-4">
                                            <Badge className="bg-gray-900 text-white border-none text-[10px] font-black uppercase tracking-widest px-2 py-1">
                                                {room.role}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col justify-between gap-6">
                                        <div>
                                            <h3 className="font-black text-2xl tracking-tighter text-gray-900 group-hover:text-primary transition-colors leading-tight uppercase">
                                                {room.name}
                                            </h3>
                                            <p className="text-[10px] font-black text-gray-400 mt-2 uppercase tracking-widest">
                                                EST. {new Date(room.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center justify-between text-xs font-black text-primary uppercase tracking-widest">
                                            <span>OPEN PLAN</span>
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
        </div>
    );
}
