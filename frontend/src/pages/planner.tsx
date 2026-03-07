import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, MapControls, MapMarker, MarkerContent, MarkerPopup } from "@/components/ui/map";
import { CountryLayer } from "@/components/map/CountryLayer";
import { RoutesLayer } from "@/components/map/RoutesLayer";
import { cn } from "@/lib/utils";
import { streamTripGenerator } from "@/services/trip-service";
import type { Trip, TripCard } from "@/types/trip";
import { ModeToggle } from "@/components/mode-toggle";

export default function PlannerPage() {
  const [, setLocation] = useLocation();

  // State
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [cards, setCards] = useState<TripCard[]>([]);
  const [cart, setCart] = useState<TripCard[]>([]);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string, cards?: TripCard[] }[]>([
    { role: 'ai', content: "Hi! I'm your Adealy travel architect. Where shall we go next?" }
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<'map' | 'timeline'>('map');
  const [activeTab, setActiveTab] = useState<'design' | 'saved' | 'config'>('design');
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [activeLayer, setActiveLayer] = useState<'all' | 'stay' | 'activity' | 'transport'>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    const currentPrompt = prompt;
    setPrompt("");
    setIsGenerating(true);

    try {
      const stream = streamTripGenerator(currentPrompt, sessionId);

      for await (const chunk of stream) {
        if (chunk.type === 'session_id') {
          setSessionId(chunk.sessionId);
        } else if (chunk.type === 'progress') {
          setStreamStatus(`${chunk.message} (${chunk.step}/${chunk.totalSteps})`);
        } else if (chunk.type === 'card_created') {
          setCards(prev => [...prev, chunk.card]);
        } else if (chunk.type === 'complete') {
          if (chunk.trip) {
            setTrip(chunk.trip);
            setCards(chunk.trip.cards || []);
          }
          setMessages(prev => [...prev, { role: 'ai', content: chunk.message }]);
          setIsGenerating(false);
          setStreamStatus("");
        }
      }
    } catch (e) {
      console.error(e);
      setIsGenerating(false);
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
  const displayedCards = cards.filter(c => {
    const dayMatch = selectedDay === 0 || c.day === selectedDay;
    const layerMatch = activeLayer === 'all' || c.type === activeLayer;
    return dayMatch && layerMatch;
  });

  // Dynamic Budget Calculation
  const calculatedBudgetUsed = cards.reduce((sum, card) => sum + (card.data?.price || 0), 0);
  const estimatedBudget = trip?.summary?.estimatedBudget || (calculatedBudgetUsed > 0 ? Math.ceil(calculatedBudgetUsed * 1.2 / 500) * 500 : 2500);
  const budgetProgress = estimatedBudget > 0 ? Math.min((calculatedBudgetUsed / estimatedBudget) * 100, 100) : 0;

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
              <LayerItem icon={LayoutGrid} label="Itinerary" count={trip?.days || 0} active={activeLayer === 'all'} onClick={() => setActiveLayer('all')} />
              <LayerItem icon={BedDouble} label="Stays" count={cards.filter(c => c.type === 'stay').length} color="text-orange-400" active={activeLayer === 'stay'} onClick={() => setActiveLayer('stay')} />
              <LayerItem icon={Camera} label="Activities" count={cards.filter(c => c.type === 'activity').length} color="text-blue-400" active={activeLayer === 'activity'} onClick={() => setActiveLayer('activity')} />
              <LayerItem icon={Train} label="Transport" count={cards.filter(c => c.type === 'transport').length} color="text-emerald-400" active={activeLayer === 'transport'} onClick={() => setActiveLayer('transport')} />
              <LayerItem icon={CreditCard} label="Budget" value={`$${calculatedBudgetUsed}`} color="text-purple-400" />
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
                    <span className="text-xs text-muted-foreground">{trip?.destination?.split(',')[0] || "City"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 cursor-pointer group hover:bg-sidebar-accent/10 p-2 rounded-lg transition-colors" onClick={() => setLocation("/profile")}>
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 border border-sidebar-border" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">John Doe</p>
              <p className="text-xs text-muted-foreground truncate">Pro Plan</p>
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
              <h1 className="font-bold text-sm tracking-wide">{trip?.title || "New Trip"}</h1>
              <Badge variant="secondary" className="bg-muted text-muted-foreground border-0 text-[10px] px-1.5 h-5">DRAFT</Badge>
              {trip?.visaRequirement && (
                <div title={trip.visaDetails}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 h-5 uppercase border-0 cursor-help",
                      trip.visaRequirement === 'visa-free' ? 'bg-emerald-500/10 text-emerald-500' :
                        trip.visaRequirement === 'visa-on-arrival' ? 'bg-amber-500/10 text-amber-500' :
                          trip.visaRequirement === 'visa-required' ? 'bg-rose-500/10 text-rose-500' :
                            'bg-slate-500/10 text-slate-500'
                    )}
                  >
                    {trip.visaRequirement.replace('-', ' ')}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Center Toggles */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-muted p-1 rounded-lg border border-border/50">
            <button
              onClick={() => setViewMode('map')}
              className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-2", viewMode === 'map' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <MapIcon className="h-3 w-3" /> Map
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-2", viewMode === 'timeline' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Calendar className="h-3 w-3" /> Timeline
            </button>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Budget Bar */}
            {/* Budget Bar */}
            <div className="hidden lg:flex items-center gap-3 bg-muted px-3 py-1.5 rounded-full border border-border/10">
              <div className="text-xs font-medium">
                <span className="text-foreground">${calculatedBudgetUsed}</span>
                <span className="text-muted-foreground"> / ${estimatedBudget}</span>
              </div>
              <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${budgetProgress}%` }} />
              </div>
            </div>

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
              center={[0, 20]} // Default to World View
              zoom={1.5}
              className="w-full h-full"
              styles={{
                dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
              }}
            >
              <MapControls position="bottom-right" />
              <CountryLayer
                mode={trip?.country ? 'selected' : 'destination'}
                selectedCountryName={trip?.country}
                visaBucketsByCountryName={trip?.country && trip?.visaRequirement ? { [trip.country]: trip.visaRequirement } : undefined}
              />
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
              {isGenerating && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md border border-white/20">
                    <Zap className="h-4 w-4 animate-pulse fill-current" />
                    <span className="text-xs font-bold uppercase tracking-wide">{streamStatus || "Thinking..."}</span>
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
                      <span className="text-2xl font-serif text-foreground">${estimatedBudget}</span>
                      <span className="text-xs uppercase tracking-wider">Est. Cost</span>
                    </div>
                  </div>
                </motion.div>

                {trip && Array.from({ length: trip.days }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayCards = cards.filter(c =>
                    c.day === dayNum &&
                    (activeLayer === 'all' || c.type === activeLayer)
                  ).sort((a, b) => (a.data.startTime || '').localeCompare(b.data.startTime || ''));

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
                            <h2 className="text-xl md:text-2xl font-bold font-serif">{trip?.destination?.split(',')[0] || "City"} Exploration</h2>
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
                          dayCards.map((card, index) => (
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
                  <div key={i} className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[85%] text-sm p-3 rounded-2xl shadow-sm",
                      msg.role === 'user' ? "bg-muted text-foreground rounded-tr-sm" : "bg-primary/10 text-primary rounded-tl-sm border border-primary/20"
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={activeTab === 'saved' ? "Use saved items to generate plan..." : "Ask Adealy to plan..."}
                  className="w-full bg-muted border border-border/10 rounded-xl p-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground min-h-[50px] max-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="absolute right-2 bottom-3 p-1.5 bg-primary rounded-lg text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? <Zap className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
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
function LayerItem({ icon: Icon, label, count, value, active, color, onClick }: any) {
  return (
    <div
      onClick={onClick}
      className={cn(
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
