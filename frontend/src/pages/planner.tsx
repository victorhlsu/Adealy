import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import {
  Map as MapIcon,
  Calendar,
  Settings,
  Share2,
  MoreVertical,
  Plus,
  Zap,
  LayoutGrid,
  CreditCard,
  Train,
  BedDouble,
  Camera,
  Send,
  ShoppingBag,
  ArrowRight,
  UserPlus,
  Mail,
  Users,
  Lock,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, MapControls, MapMarker, MarkerContent, MarkerPopup } from "@/components/ui/map";
import { CountryLayer } from "@/components/map/CountryLayer";
import { RoutesLayer } from "@/components/map/RoutesLayer";
import { cn } from "@/lib/utils";
import type { Trip, TripCard } from "@/types/trip";
import { ModeToggle } from "@/components/mode-toggle";
import { supabase } from "@/lib/supabase";

export default function PlannerPage({ roomId }: { roomId?: string }) {
  const [, setLocation] = useLocation();

  // State
  const [prompt, setPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'cooldown'>('idle');
  const [members, setMembers] = useState<any[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [roomName, setRoomName] = useState("New Trip");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [cards, setCards] = useState<TripCard[]>([]);
  const [cart, setCart] = useState<TripCard[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [profileData, setProfileData] = useState<any>(null);

  const { user, isAuthenticated } = useAuth0();

  useEffect(() => {
    async function loadProfile() {
      if (!isAuthenticated || !user?.sub) return;
      try {
        const res = await fetch(`/api/users/profile?auth0_id=${user.sub}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exists) setProfileData(data.data);
        }
      } catch (e) {
        console.error("Failed to load profile", e);
      }
    }
    loadProfile();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!roomId && user?.sub) {
       supabase.from('rooms').insert({ name: 'New Trip', created_by: user.sub }).select().single().then(({ data }: any) => {
         if (data) {
           setLocation(`/planner/${data.id}`);
         }
       });
    }
  }, [roomId, user?.sub, setLocation]);

  // UI State
  const [viewMode, setViewMode] = useState<'map' | 'timeline'>('map');
  const [activeTab, setActiveTab] = useState<'design' | 'saved' | 'config'>('design');
  const [selectedDay, setSelectedDay] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId || !user?.sub) return;
    let channel: any;

    const initRoom = async () => {
      // 1. Load members FIRST to check access
      const { data: memData } = await supabase.from('room_members').select('*').eq('room_id', roomId);
      if (memData) {
         const me = memData.find((m: any) => m.user_id === user.sub);
         if (!me) {
           setAccessDenied(true);
           return;
         }
         setMembers(memData);
         if (me.role === 'owner') setIsOwner(true);
      } else {
        setAccessDenied(true);
        return;
      }

      // 2. Load room details
      const { data: rData } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (rData) setRoomName(rData.name);

      // 3. Load history
      const { data: history } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (history) {
        const parsedMsgs: any[] = [];
        for (const msg of history) {
           if (msg.content.startsWith('__TRIP_DATA__:')) {
             try {
                const tripData = JSON.parse(msg.content.replace('__TRIP_DATA__:', ''));
                setTrip(tripData);
                setCards(tripData.cards || []);
             } catch(e) {}
           } else {
             parsedMsgs.push(msg);
           }
        }
        setMessages(parsedMsgs);
      } else {
        setMessages([{ is_ai: true, content: "Hi! I'm your Adealy travel architect. Where shall we go next?" }]);
      }

      // 4. Load room_state
      const { data: stateData } = await supabase.from('room_state').select('*').eq('room_id', roomId).single();
      if (stateData) {
         setAiStatus(stateData.ai_status || 'idle');
         if (stateData.focused_view) setViewMode(stateData.focused_view as any);
      } else {
         await supabase.from('room_state').insert({ room_id: roomId });
      }

      // 5. Subscribe to Realtime
      channel = supabase.channel(`room_${roomId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload: any) => {
          const newMsg = payload.new;
          if (newMsg.content.startsWith('__TRIP_DATA__:')) {
             try {
               const tripData = JSON.parse(newMsg.content.replace('__TRIP_DATA__:', ''));
               setTrip(tripData);
               setCards(tripData.cards || []);
             } catch(e) {}
          } else {
             setMessages(prev => [...prev, newMsg]);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_state', filter: `room_id=eq.${roomId}` }, (payload: any) => {
           const newState = payload.new;
           setAiStatus(newState.ai_status || 'idle');
           if (newState.focused_view) setViewMode(newState.focused_view as any);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, () => {
           supabase.from('room_members').select('*').eq('room_id', roomId).then(({data}: any) => {
              if (data) {
                 setMembers(data);
                 const me = data.find((m: any) => m.user_id === user.sub);
                 if (me && me.role === 'owner') setIsOwner(true);
              }
           });
        })
        .subscribe();
    }
    initRoom();
    return () => { if (channel) supabase.removeChannel(channel); }
  }, [roomId, user?.sub]);

  const handleGenerate = async () => {
    if (!prompt.trim() || aiStatus !== 'idle') return;

    const currentPrompt = prompt;
    setPrompt("");

    await supabase.from('messages').insert({
        room_id: roomId,
        sender_id: user?.sub,
        content: currentPrompt,
        is_ai: false
    });

    if (currentPrompt.includes('@Adealy')) {
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: roomId, prompt: currentPrompt, auth0_id: user?.sub })
        }).catch(console.error);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !roomId || !user?.sub) return;
    setIsInviting(true);
    setInviteMessage(null);
    try {
      const res = await fetch('/api/rooms/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, email: inviteEmail.trim().toLowerCase(), auth0_id: user.sub }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMessage({ type: 'success', text: data.message });
        setInviteEmail('');
      } else {
        setInviteMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setInviteMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsInviting(false);
    }
  };

  const handleAddToCart = (card: TripCard) => {
    if (!cart.find(c => c.id === card.id)) {
      setCart([...cart, card]);
      setActiveTab('saved');
    }
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(c => c.id !== id));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Derived state
  const displayedCards = selectedDay === 0 ? cards : cards.filter(c => c.day === selectedDay);
  const budgetProgress = trip && trip.summary ? (trip.summary.budgetUsed / trip.summary.estimatedBudget) * 100 : 0;

  // Access Denied Screen
  if (accessDenied) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center flex-col gap-4">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground text-sm text-center max-w-xs">You have not been invited to this room. Ask the room owner to invite you by email.</p>
        <Button onClick={() => setLocation('/planner')} size="sm" className="mt-2">Go to My Planner</Button>
      </div>
    );
  }



  return (
    <div className="h-screen w-screen bg-background text-foreground flex overflow-hidden font-sans">

      {/* 1. Left Sidebar - Layers & Overview */}
      <aside className="w-[280px] bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 z-20">
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-primary-foreground font-bold">A</span>
            </div>
            <span className="font-bold text-lg tracking-tight">Adealy</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* Layers Section */}
          <div>
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Layers</h3>
              <button className="text-gray-500 hover:text-white"><Plus className="h-3 w-3" /></button>
            </div>

            <div className="space-y-1">
              <LayerItem icon={LayoutGrid} label="Itinerary" count={trip?.days || 0} active />
              <LayerItem icon={BedDouble} label="Stays" count={cards.filter(c => c.type === 'stay').length} color="text-orange-400" />
              <LayerItem icon={Camera} label="Activities" count={cards.filter(c => c.type === 'activity').length} color="text-blue-400" />
              <LayerItem icon={Train} label="Transport" count={cards.filter(c => c.type === 'transport').length} color="text-emerald-400" />
              <LayerItem icon={CreditCard} label="Budget" value={trip?.summary ? `$${trip.summary.budgetUsed}` : '-'} color="text-purple-400" />
            </div>
          </div>

          {/* Trip Overview Section (Days) */}
          {trip && (
            <div>
              <div className="flex items-center justify-between mb-3 px-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Trip Overview</h3>
              </div>
              <div className="space-y-1">
                <button
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                    selectedDay === 0 ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  onClick={() => setSelectedDay(0)}
                >
                  <span className="font-medium">All Days</span>
                </button>
                {Array.from({ length: trip.days }).map((_, i) => (
                  <button
                    key={i}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                      selectedDay === i + 1 ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                    onClick={() => setSelectedDay(i + 1)}
                  >
                    <span className="font-medium">Day {i + 1}</span>
                    <span className="text-xs text-muted-foreground">Kyoto</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 cursor-pointer group hover:bg-sidebar-accent/10 p-2 rounded-lg transition-colors" onClick={() => setLocation("/profile")}>
            {user?.picture ? (
                <img src={user.picture} alt="Profile" className="h-8 w-8 rounded-full border border-sidebar-border" />
            ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 border border-sidebar-border" />
            )}
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                  {profileData?.first_name ? `${profileData.first_name} ${profileData.last_name || ''}` : user?.name || "Guest"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                  {profileData?.passport_country ? `${profileData.passport_country} Passport` : "Complete Profile"}
              </p>
            </div>
            <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 flex flex-col relative min-w-0">

        {/* Top Header */}
        <header className="h-14 bg-background/80 backdrop-blur-md border-b border-border absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4">
          {/* Trip Title & Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm tracking-wide">{trip?.title || roomName}</h1>
              <Badge variant="secondary" className="bg-muted text-muted-foreground border-0 text-[10px] px-1.5 h-5">LIVE</Badge>
            </div>
          </div>

          {/* Center Toggles */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-muted p-1 rounded-lg border border-border/50">
            <button
              onClick={() => {
                 setViewMode('map');
                 if (roomId) supabase.from('room_state').update({ focused_view: 'map' }).eq('room_id', roomId).then();
              }}
              className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-2", viewMode === 'map' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <MapIcon className="h-3 w-3" /> Map
            </button>
            <button
              onClick={() => {
                 setViewMode('timeline');
                 if (roomId) supabase.from('room_state').update({ focused_view: 'timeline' }).eq('room_id', roomId).then();
              }}
              className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-2", viewMode === 'timeline' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Calendar className="h-3 w-3" /> Timeline
            </button>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Budget Bar */}
            {trip && trip.summary && (
              <div className="hidden lg:flex items-center gap-3 bg-muted px-3 py-1.5 rounded-full border border-border/10">
                <div className="text-xs font-medium">
                  <span className="text-foreground">${trip.summary.budgetUsed}</span>
                  <span className="text-muted-foreground"> / ${trip.summary.estimatedBudget}</span>
                </div>
                <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${budgetProgress}%` }} />
                </div>
              </div>
            )}

            <ModeToggle />

            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs gap-2">
              <Share2 className="h-3 w-3" /> Share
            </Button>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 relative bg-background pt-14">
          {viewMode === 'map' ? (
            <Map
              center={[135.7681, 35.0116]} // Default to Kyoto for demo
              zoom={12}
              className="w-full h-full"
              styles={{
                dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
              }}
            >
              <MapControls position="bottom-right" />
              <CountryLayer mode="destination" />
              <RoutesLayer cards={cards} enabled={true} visibleDay={selectedDay} />

              {/* Dynamic Markers */}
              {displayedCards.map((card) => (
                card.position && (
                  <MapMarker
                    key={card.id}
                    latitude={card.position.lat}
                    longitude={card.position.lng}
                  >
                    <MarkerContent>
                      <div className={cn(
                        "relative group/marker cursor-pointer transition-transform hover:scale-110",
                        card.type === 'stay' ? "z-10" : "z-20"
                      )}>
                        <div className={cn(
                          "h-8 w-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-xs font-bold text-white relative",
                          card.type === 'stay' ? "bg-orange-500" :
                            card.type === 'activity' ? "bg-blue-500" : "bg-emerald-500"
                        )}>
                          {card.type === 'stay' ? <BedDouble className="h-4 w-4" /> :
                            card.type === 'activity' ? <Camera className="h-4 w-4" /> :
                              <Train className="h-4 w-4" />
                          }
                        </div>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/50" />
                      </div>
                    </MarkerContent>
                    <MarkerPopup className="bg-[#1e1e1e] border border-white/10 p-4 rounded-xl shadow-2xl min-w-[220px]">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={cn(
                          "text-[10px] uppercase border-0 bg-opacity-20",
                          card.type === 'stay' ? "bg-orange-500 text-orange-400" :
                            card.type === 'activity' ? "bg-blue-500 text-blue-400" : "bg-emerald-500 text-emerald-400"
                        )}>
                          {card.type}
                        </Badge>
                        <span className="text-[10px] text-gray-500">Day {card.day}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">{card.name}</h4>
                      {card.data.price && <p className="text-xs text-gray-400 mb-2">${card.data.price} per person</p>}

                      <Button size="sm" variant="secondary" className="w-full text-xs h-7 bg-white/10 hover:bg-white/20 text-white" onClick={() => handleAddToCart(card)}>
                        <Plus className="h-3 w-3 mr-1.5" /> Add to Saved
                      </Button>
                    </MarkerPopup>
                  </MapMarker>
                )
              ))}

              {/* Floating Progress Status */}
              {aiStatus === 'thinking' && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md border border-white/20">
                    <Zap className="h-4 w-4 animate-pulse fill-current" />
                    <span className="text-xs font-bold uppercase tracking-wide">Adealy is designing your trip...</span>
                  </div>
                </div>
              )}
              {aiStatus === 'cooldown' && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-orange-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md border border-white/20">
                    <span className="text-xs font-bold uppercase tracking-wide">Cooling down...</span>
                  </div>
                </div>
              )}
            </Map>
          ) : (
            // Timeline View (Editorial Style)
            <div className="w-full h-full overflow-y-auto bg-background">
              <div className="max-w-3xl mx-auto py-12 px-6 md:px-12 space-y-12">

                {/* Visual Trip Header */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="space-y-4 text-center mb-16"
                >
                  <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 px-3 py-1 text-xs uppercase tracking-widest font-bold mb-4 inline-block rounded-full">
                    Itinerary Draft
                  </Badge>
                  <h1 className="font-serif text-5xl md:text-7xl font-light text-foreground tracking-tight leading-[0.9]">
                    {trip?.title || "Kyoto, Japan"}
                  </h1>
                  <p className="text-lg md:text-xl text-muted-foreground font-light max-w-lg mx-auto leading-relaxed">
                    A curated journey through the ancient capital, blending modern aesthetics with traditional charm.
                  </p>

                  <div className="flex justify-center gap-6 pt-6 text-sm font-medium text-muted-foreground">
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-serif text-foreground">{trip?.days || 5}</span>
                      <span className="text-xs uppercase tracking-wider">Days</span>
                    </div>
                    <div className="w-px h-10 bg-border/50" />
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-serif text-foreground">{cards.length}</span>
                      <span className="text-xs uppercase tracking-wider">Spots</span>
                    </div>
                    <div className="w-px h-10 bg-border/50" />
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-serif text-foreground">${trip?.summary?.estimatedBudget || 2500}</span>
                      <span className="text-xs uppercase tracking-wider">Est. Cost</span>
                    </div>
                  </div>
                </motion.div>

                {trip && Array.from({ length: trip.days }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayCards = cards.filter(c => c.day === dayNum).sort((a, b) => (a.data.startTime || '').localeCompare(b.data.startTime || ''));

                  if (selectedDay !== 0 && selectedDay !== dayNum) return null;

                  return (
                    <motion.div
                      key={dayNum}
                      initial={{ opacity: 0, y: 40 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-100px" }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className="relative pb-16 last:pb-0"
                    >
                      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-6 mb-8 border-b border-border/40 flex items-baseline justify-between group">
                        <div className="flex items-baseline gap-4">
                          <span className="font-serif text-4xl md:text-5xl text-foreground/20 font-light group-hover:text-primary/20 transition-colors">0{dayNum}</span>
                          <div>
                            <h2 className="text-xl md:text-2xl font-bold font-serif">Kyoto Exploration</h2>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">October 12 • Saturday</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-6">
                        {dayCards.length === 0 ? (
                          <div className="text-muted-foreground text-sm italic py-12 text-center border border-dashed border-border rounded-xl">
                            No activities planned yet. Use the chat to add some magic!
                          </div>
                        ) : (
                          dayCards.map((card) => (
                            <motion.div
                              key={card.id}
                              whileHover={{ y: -4, scale: 1.01 }}
                              className="group relative bg-card rounded-2xl p-6 transition-all shadow-sm hover:shadow-xl border border-border/40 overflow-hidden"
                            >
                              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                              <div className="flex flex-col md:flex-row gap-6">
                                {/* Time Column */}
                                <div className="min-w-[80px] flex md:flex-col items-center md:items-start gap-2 md:gap-0">
                                  <span className="text-lg font-bold font-serif text-foreground">{card.data.startTime || "09:00"}</span>
                                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">AM</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-center gap-3">
                                    {card.type === 'transport' ? (
                                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-none font-bold uppercase tracking-wider text-[10px]">Travel</Badge>
                                    ) : card.type === 'stay' ? (
                                      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-none font-bold uppercase tracking-wider text-[10px]">Stay</Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-none font-bold uppercase tracking-wider text-[10px]">Activity</Badge>
                                    )}
                                    <div className="h-px flex-1 bg-border/40" />
                                  </div>

                                  <div>
                                    <h3 className="font-serif text-xl font-bold mb-2 group-hover:text-primary transition-colors">{card.name}</h3>
                                    <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2 md:line-clamp-none">{card.data.description}</div>
                                  </div>

                                  {card.type === 'transport' && card.data.from && card.data.to && (
                                    <div className="mt-4 flex items-center gap-3 text-xs font-medium text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50">
                                      <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5" /> {card.data.from.name || "Origin"}</div>
                                      <ArrowRight className="h-3 w-3 text-primary/50" />
                                      <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5" /> {card.data.to.name || "Destination"}</div>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-end pt-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                    <Button size="sm" variant="ghost" className="text-xs hover:text-primary gap-1" onClick={() => handleAddToCart(card)}>
                                      <Plus className="h-3 w-3" /> Save to Collection
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. Right Sidebar - Copilot/Chat */}
      <aside className="w-[380px] bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 z-20">
        {/* Tabs */}
        <div className="flex items-center p-2 border-b border-sidebar-border">
          {
            ['design', 'saved', 'config'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors relative",
                  activeTab === tab ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:text-sidebar-foreground"
                )}
              >
                {tab}
                {tab === 'saved' && cart.length > 0 && (
                  <span className="absolute top-1 right-2 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                )}
              </button>
            ))
          }
        </div >

        {/* Saved Items Tab */}
        {
          activeTab === 'saved' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center text-gray-500 mt-10">
                  <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No saved items yet.</p>
                  <p className="text-xs">Add places from the map to use in your next prompt.</p>
                </div>
              ) : (
                <>
                  <div className="text-xs font-bold text-muted-foreground uppercase px-2 mb-2">Saved for later</div>
                  {cart.map(item => (
                    <div key={item.id} className="bg-sidebar-accent/50 p-3 rounded-lg border border-border/10 flex gap-3 group px-4">
                      <div className={cn("h-10 w-10 rounded-md flex-shrink-0 flex items-center justify-center",
                        item.type === 'stay' ? "bg-orange-500/20 text-orange-400" :
                          item.type === 'activity' ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"
                      )}>
                        {item.type === 'stay' ? <BedDouble className="h-5 w-5" /> : item.type === 'activity' ? <Camera className="h-5 w-5" /> : <Train className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate">{item.name}</h4>
                        <p className="text-xs text-gray-500 truncate">{item.data.description}</p>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-400 transition-all">
                        &times;
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : activeTab === 'config' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Room</h3>
                <p className="text-sm font-semibold">{roomName}</p>
                <p className="text-[10px] text-muted-foreground break-all mt-0.5">{roomId}</p>
              </div>

              {/* Invite by Email (Owner only) */}
              {isOwner && (
                <div className="border border-border/50 rounded-xl p-4 space-y-3 bg-card">
                  <div className="flex items-center gap-2 mb-1">
                    <UserPlus className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-bold">Invite a Collaborator</h4>
                  </div>
                  <p className="text-[11px] text-muted-foreground">They must have an Adealy account first.</p>
                  <form onSubmit={handleInvite} className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="friend@email.com"
                        className="w-full pl-8 pr-3 py-2 text-xs bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                        required
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={isInviting} className="h-8 shrink-0 text-xs px-3">
                      {isInviting ? '...' : 'Invite'}
                    </Button>
                  </form>
                  {inviteMessage && (
                    <div className={cn(
                      "text-[11px] px-3 py-2 rounded-lg",
                      inviteMessage.type === 'success'
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}>
                      {inviteMessage.text}
                    </div>
                  )}
                </div>
              )}

              {/* Members List */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Members ({members.length})</h4>
                </div>
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="p-3 bg-card border border-border/50 rounded-lg flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">
                          {m.user_id === user?.sub ? 'You' : 'Member'}
                          {m.role === 'owner' && <span className="ml-1.5 text-[9px] uppercase text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded-full">Owner</span>}
                        </span>
                        {isOwner && m.user_id !== user?.sub && (
                          <Button size="sm" variant="destructive" className="h-5 text-[9px] px-2" onClick={() => {
                            supabase.from('room_members').delete().eq('id', m.id).then();
                          }}>Remove</Button>
                        )}
                      </div>
                      {isOwner && m.user_id !== user?.sub && (
                        <label className="text-[11px] flex items-center gap-2 cursor-pointer mt-1 text-muted-foreground">
                          <input type="checkbox" checked={m.can_prompt_ai} onChange={(e) => {
                            supabase.from('room_members').update({ can_prompt_ai: e.target.checked }).eq('id', m.id).then();
                          }} className="rounded border-border accent-primary" />
                          Allow @Adealy prompts
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          ) : (
            /* Chat Interface */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-8">
                  <MapIcon className="h-12 w-12 mb-4" />
                  <h3 className="text-lg font-bold mb-2">Design your masterpiece</h3>
                  <p className="text-sm">Ask me to plan a trip to anywhere in the world.</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={cn("flex flex-col gap-2", !msg.is_ai ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[85%] text-sm p-3 rounded-2xl shadow-sm leading-relaxed",
                      !msg.is_ai ? "bg-muted text-foreground rounded-tr-sm" : "bg-primary/10 text-primary rounded-tl-sm border border-primary/20"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          )
        }

        {/* Input Area (Only for Design Tab) */}
        {
          activeTab !== 'config' && (
            <div className="p-4 border-t border-sidebar-border bg-sidebar">
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={aiStatus !== "idle"}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={aiStatus === 'thinking' ? "Adealy is thinking..." : aiStatus === 'cooldown' ? "Cooling down..." : activeTab === 'saved' ? "Use saved items to generate plan..." : "Mention @Adealy to plan trip..."}
                  className="w-full bg-muted border border-border/10 rounded-xl p-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground min-h-[50px] max-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || aiStatus !== "idle"}
                  className="absolute right-2 bottom-3 p-1.5 bg-primary rounded-lg text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {aiStatus !== "idle" ? <Zap className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {activeTab === 'saved' && cart.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-[10px] bg-blue-500/10">
                    {cart.length} items included in context
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <MoreVertical className="h-3 w-3" />
                  <span>Deep Research</span>
                </div>
                <span className="text-[10px] text-gray-600">Model: Adealy v1</span>
              </div>
            </div>
          )
        }

      </aside >
    </div >
  );
}

// Helper Component for Layers
function LayerItem({ icon: Icon, label, count, value, active, color }: any) {
  return (
    <div className={cn(
      "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all",
      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    )}>
      <div className="flex items-center gap-3">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {(count !== undefined || value) && (
        <span className="text-xs font-bold text-gray-600 group-hover:text-gray-400">
          {value || count}
        </span>
      )}
    </div>
  );
}
