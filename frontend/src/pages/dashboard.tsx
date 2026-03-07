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
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
            {/* Header */}
            <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center shadow-lg overflow-hidden border border-border">
                        <img src="/logo.png" alt="Adealy" className="h-full w-full object-cover" />
                    </div>
                    <span className="font-bold text-lg tracking-tight">Adealy</span>
                </div>
                <div className="flex items-center gap-4">
                    <ModeToggle />
                    <Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} className="rounded-full">
                        {user?.picture ? (
                            <img src={user.picture} alt="Profile" className="h-8 w-8 rounded-full border border-border" />
                        ) : (
                            <UserIcon className="h-5 w-5" />
                        )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>
                        <LogOut className="h-5 w-5 text-muted-foreground" />
                    </Button>
                </div>
            </header>

            <main className="flex-1 w-full max-w-5xl mx-auto p-6 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold font-serif tracking-tight">Your Trips</h1>
                        <p className="text-muted-foreground mt-1 text-sm">Manage your collaborative travel spaces</p>
                    </div>
                    <Button onClick={() => setLocation("/planner")} className="bg-primary hover:bg-primary/90 shadow-lg group">
                        <Plus className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" /> New Trip
                    </Button>
                </div>

                {rooms.length === 0 ? (
                    <div className="h-64 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-4 p-6 text-center bg-muted/30">
                        <div className="h-12 w-12 bg-muted rounded-full flex items-center justify-center">
                            <MapIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">No trips yet</h3>
                            <p className="text-muted-foreground text-sm max-w-xs mt-1">Create your first trip to start planning your next journey with Adealy.</p>
                        </div>
                        <Button onClick={() => setLocation("/planner")} variant="secondary">
                            Get Started
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rooms.map((room) => (
                            <Card 
                                key={room.id}
                                className="group relative overflow-hidden border-border bg-card hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-xl p-0 flex flex-col"
                                onClick={() => setLocation(`/planner/${room.id}`)}
                            >
                                <div className="h-32 bg-gradient-to-br from-blue-900/60 to-purple-900/60 flex items-center justify-center relative">
                                    <MapIcon className="h-10 w-10 text-white/20 group-hover:scale-110 group-hover:text-white/40 transition-all duration-500" />
                                    <div className="absolute top-3 right-3">
                                        <Badge variant="secondary" className="bg-background/50 backdrop-blur-md text-foreground border-0 text-[10px] uppercase font-bold tracking-wider">
                                            {room.role}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{room.name}</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Created {new Date(room.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center text-xs font-medium text-primary group-hover:translate-x-1 transition-transform">
                                        Open Trip <ChevronRight className="h-3 w-3 ml-1" />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
