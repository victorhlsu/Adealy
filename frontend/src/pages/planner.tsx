import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import maplibregl from "maplibre-gl";
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
  Mail,
  Users,
  Lock,
  User as UserIcon,
  UserPlus,
  ExternalLink,
  CheckCircle2,
  Clock,
  BedDouble,
  Camera,
  Train,
  CreditCard,
  ArrowRight,
  Footprints,
  Car,
  Bike,
  Send,
  ShoppingBag,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, MapControls, MapMarker, MarkerContent, MarkerPopup, type MapRef } from "@/components/ui/map";
import { CountryLayer } from "@/components/map/CountryLayer";
import { RoutesLayer } from "@/components/map/RoutesLayer";
import { cn } from "@/lib/utils";
import type { Trip, TripCard } from "@/types/trip";
import { ModeToggle } from "@/components/mode-toggle";
import { supabase } from "@/lib/supabase";
import { getOptimizedImageUrl } from "@/lib/cloudinary";

export default function PlannerPage({ roomId }: { roomId?: string }) {
  const [, setLocation] = useLocation();

  const [prompt, setPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'cooldown' | 'payment' | 'booking' | 'booked'>('idle');
  const [streamStatus, setStreamStatus] = useState<{ step: number, total: number, message: string } | null>(null);
  const [aiPromptedBy, setAiPromptedBy] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [roomName, setRoomName] = useState("New Trip");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [hasPaidLocal, setHasPaidLocal] = useState<string[]>([]);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [cards, setCards] = useState<TripCard[]>([]);
  const [cart, setCart] = useState<TripCard[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [profileData, setProfileData] = useState<any>(null);

  const { user, isAuthenticated } = useAuth0();
  useEffect(() => {
    if (user?.sub) {
      supabase.from('user_profiles').select('*').eq('auth0_id', user.sub).single().then(({ data }) => {
        if (data) setProfileData(data);
      });
    }
  }, [user?.sub]);

  const userVisaRequirement = useMemo(() => {
    if (!trip?.destination || !profileData?.passport_country) return null;

    const pass = profileData.passport_country.toLowerCase();
    const dest = trip.destination.toLowerCase();

    if (['usa', 'can', 'gbr', 'aus'].includes(pass)) {
      if (dest.includes('france') || dest.includes('germany') || dest.includes('japan')) return 'visa-free';
    }
    if (pass === 'ind') {
      if (dest.includes('usa') || dest.includes('uk') || dest.includes('canada')) return 'visa-required';
      if (dest.includes('thailand') || dest.includes('indonesia')) return 'visa-on-arrival';
    }

    return trip?.visaRequirement || 'unknown';
  }, [profileData?.passport_country, trip]);

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
    if (!roomId) {
      setLocation("/dashboard");
    }
  }, [roomId, setLocation]);

  // UI State
  const [viewMode, setViewMode] = useState<'map' | 'timeline'>('map');
  const [activeTab, setActiveTab] = useState<'design' | 'saved' | 'purchasing' | 'config'>('design');
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [activeLayer, setActiveLayer] = useState<'all' | 'stay' | 'activity' | 'transport'>('all');
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapRef>(null);

  // Zoom map to bounds when cards or selected day changes
  useEffect(() => {
    if (!mapRef.current || cards.length === 0 || viewMode !== 'map') return;
    const map = mapRef.current;

    // Filter to selected day, or all cards if 0
    let visibleCards = selectedDay === 0 ? cards : cards.filter(c => c.day === selectedDay);

    // Further filter by active mode if not 'all'
    if (activeLayer !== 'all') {
      visibleCards = visibleCards.filter(c => c.type === activeLayer);
    }

    if (visibleCards.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    visibleCards.forEach(c => {
      if (c.position?.lng !== undefined && c.position?.lat !== undefined) {
        bounds.extend([c.position.lng, c.position.lat]);
      }
    });

    if (!bounds.isEmpty()) {
      // If we have a focused card, zoom to it, otherwise fit all visible cards
      if (focusedCardId) {
        const card = cards.find(c => c.id === focusedCardId);
        if (card?.position?.lng && card?.position?.lat) {
          map.easeTo({ center: [card.position.lng, card.position.lat], zoom: 16, duration: 1000 });
        }
      } else {
        map.fitBounds(bounds, { padding: 100, duration: 1200, maxZoom: 14 });
      }
    }
  }, [selectedDay, cards, viewMode, activeLayer, focusedCardId]);

  const zoomToCard = (cardId: string) => {
    setFocusedCardId(prev => {
      const nextId = prev === cardId ? null : cardId;
      return nextId;
    });
    if (viewMode !== 'map') setViewMode('map');
  };

  const zoomToDay = (day: number) => {
    setSelectedDay(prev => {
      const nextDay = prev === day ? 0 : day;
      if (nextDay === 0) setFocusedCardId(null); // Only clear focus if collapsing all days
      return nextDay;
    });
  };

  useEffect(() => {
    if (!roomId || !user?.sub) return;
    let channel: any;

    const initRoom = async () => {
      console.log("[Planner] Initializing room:", roomId);

      // 1. Fetch Room Details FIRST
      const { data: rData, error: rError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (rError || !rData) {
        console.error("[Planner] Room fetch failed:", rError);
        setAccessDenied(true);
        return;
      }

      setRoomName(rData.name);
      const isCreator = rData.created_by === user.sub;
      console.log("[Planner] Room data loaded. Is creator:", isCreator);

      // 2. Load Members with Retry
      let retryCount = 0;
      const maxRetries = 3;
      let memData: any[] | null = null;
      let me: any = null;

      while (retryCount < maxRetries) {
        const { data, error } = await supabase
          .from('room_members')
          .select('id, room_id, user_id, role, can_prompt_ai, has_paid, user_profiles(email, first_name, last_name)')
          .eq('room_id', roomId);

        if (error && error.code === 'PGRST204') {
          console.warn("[Planner] Schema error detected (PGRST204). Proceeding with Creator fallback.");
          break; // Exit loop and use creator status
        }

        me = data?.find((m: any) => m.user_id === user.sub);
        if (me) {
          memData = data;
          break;
        }

        console.log(`[Planner] Member not found, retry ${retryCount + 1}/${maxRetries}`);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(r => setTimeout(r, 800));
        }
      }

      // 3. Permission Consolidation and Payment State Initialization
      if (me) {
        setMembers(memData || []);

        // Populate hasPaidLocal from backend state
        if (memData) {
          const paidMembers = memData.filter((m: any) => m.has_paid).map((m: any) => m.user_id);
          setHasPaidLocal(Array.from(new Set(paidMembers)));
        }

        if (me.role === 'owner' || isCreator) setIsOwner(true);
      } else if (isCreator) {
        // If I'm the creator but not in members, try one-time auto-join
        console.log("[Planner] Creator not in members, attempting auto-join...");
        const { error: joinErr } = await supabase.from('room_members').insert({
          room_id: roomId,
          user_id: user.sub,
          role: 'owner',
          can_prompt_ai: true
        });

        if (joinErr && joinErr.code !== '23505' && joinErr.code !== 'PGRST204') {
          console.error("[Planner] Auto-join failed:", joinErr);
        }

        setIsOwner(true);
        // Final member refresh
        const { data: finalMems } = await supabase
          .from('room_members')
          .select('id, room_id, user_id, role, can_prompt_ai, has_paid, user_profiles(email, first_name, last_name)')
          .eq('room_id', roomId);
        if (finalMems) {
          setMembers(finalMems);
          const paidMembers = finalMems.filter((m: any) => m.has_paid).map((m: any) => m.user_id);
          setHasPaidLocal(Array.from(new Set(paidMembers)));
        }
      } else {
        // Not creator and not a member
        console.warn("[Planner] Access denied: User is not creator and not a member.");
        setAccessDenied(true);
        return;
      }

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
            } catch (e) { }
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
        setAiPromptedBy(stateData.last_prompted_by || null);
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
            } catch (e) { }
          } else {
            setMessages(prev => [...prev, newMsg]);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_state', filter: `room_id=eq.${roomId}` }, (payload: any) => {
          const newState = payload.new;
          setAiStatus(newState.ai_status || 'idle');
          if (newState.ai_status === 'booked') {
            setMessages(prev => {
              if (prev.some(m => m.content === "✨ **Booking Confirmed!** Your journey is now finalized.")) return prev;
              return [...prev, { is_ai: true, content: "✨ **Booking Confirmed!** Your journey is now finalized. This trip is now archived and view-only." }];
            });
          }
          setAiPromptedBy(newState.last_prompted_by || null);
          if (newState.focused_view) setViewMode(newState.focused_view as any);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, () => {
          supabase.from('room_members').select('id, room_id, user_id, role, can_prompt_ai, has_paid, user_profiles(email, first_name, last_name)').eq('room_id', roomId).then(({ data, error }: any) => {
            if (error) {
              console.warn("[Planner] Realtime member update failed (schema error).");
              return;
            }
            if (data) {
              setMembers(data);
              const me = data.find((m: any) => m.user_id === user.sub);
              if (me && me.role === 'owner') setIsOwner(true);

              // Sync local payment state on remote change
              const paidMembers = data.filter((m: any) => m.has_paid).map((m: any) => m.user_id);
              setHasPaidLocal(Array.from(new Set(paidMembers)));
            }
          });
        })
        .subscribe();
    }
    initRoom();
    return () => { if (channel) supabase.removeChannel(channel); }
  }, [roomId, user?.sub]);

  useEffect(() => {
    let isActive = true;
    if (aiStatus === 'thinking' || aiStatus === 'booking') {
      const runAnimation = async () => {
        try {
          const { mockStreamGenerator } = await import('@/services/mock-trip-service');
          // For booking, we use a different prompt to simulate booking steps
          const animationPrompt = aiStatus === 'booking' ? "BOOKING_FLOW" : "Plan a trip";

          for await (const chunk of mockStreamGenerator(animationPrompt)) {
            if (!isActive) break;
            if (chunk.type === 'progress') {
              setStreamStatus({
                step: chunk.step,
                total: chunk.totalSteps,
                message: aiStatus === 'booking' ? `AI is booking: ${chunk.message}...` : chunk.message
              });
            }
          }

          // If we was booking and we are the owner/initiator, transition to 'booked'
          if (isActive && aiStatus === 'booking' && aiPromptedBy === user?.sub) {
            await supabase.from('room_state').update({ ai_status: 'booked' }).eq('room_id', roomId);
          }
        } catch (err) {
          console.warn("Animation stream failed", err);
        }
      };
      runAnimation();
    } else {
      setStreamStatus(null);
    }
    return () => { isActive = false; };
  }, [aiStatus, aiPromptedBy, user?.sub, roomId]);

  const handleGenerate = async () => {
    if (!prompt.trim() || aiStatus !== 'idle') return;

    const currentPrompt = prompt;
    setPrompt("");

    const { error } = await supabase.from('messages').insert({
      room_id: roomId,
      sender_id: user?.sub,
      content: currentPrompt,
      is_ai: false
    });
    if (error) console.error("Failed to save message:", error);

    if (currentPrompt.toLowerCase().includes('@adealy')) {
      // Broadcast thinking state to everyone
      supabase.from('room_state').update({
        ai_status: 'thinking',
        last_prompted_by: user?.sub
      }).eq('room_id', roomId).then();

      setAiStatus('thinking');
      setAiPromptedBy(user?.sub || null);

      // Now hit the real backend
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, prompt: currentPrompt, auth0_id: user?.sub })
      }).catch(err => console.error("Chat API error:", err));
    }
  };

  const handleSaveRoomName = async () => {
    if (!editedName.trim() || !roomId || !isOwner) {
      setIsEditingName(false);
      return;
    }

    // Optimistic update
    setRoomName(editedName);
    setIsEditingName(false);

    // Only update room name in DB
    const { error } = await supabase.from('rooms').update({ name: editedName }).eq('id', roomId);
    if (error) {
      console.error("Failed to update room name:", error);
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

  // Polling for members while modal is open to ensure status updates are seen
  useEffect(() => {
    if (!showCheckoutModal || !roomId) return;

    const fetchMembers = () => {
      supabase.from('room_members')
        .select('id, room_id, user_id, role, can_prompt_ai, user_profiles(email, first_name, last_name)')
        .eq('room_id', roomId)
        .then(({ data }) => {
          if (data) setMembers(data);
        });
    };

    const interval = setInterval(fetchMembers, 5000);
    fetchMembers(); // Initial fetch

    return () => clearInterval(interval);
  }, [showCheckoutModal, roomId]);

  const handleCheckout = async () => {
    if (!roomId || !user?.sub) return;
    setPaymentError(null);

    // Optimistic update
    setAiStatus('payment');

    // Broadcast "payment" state to everyone
    // Check if the trip has enough people. We can look at trip.summary.travelers or default to 1.
    // If we don't know the exact intended size, we'll just check if there's at least 1 person, 
    // but the user requested: "ensure that there are x people in the group before anyone can checkout."
    // We will assume `trip.summary.travelers` was saved, otherwise we bypass.
    const expectedTravelers = trip?.summary?.travelers || 1;
    if (members.length < expectedTravelers) {
      setPaymentError(`You need ${expectedTravelers} members in the group before you can checkout. Currently have ${members.length}. Invite them using the link!`);
      return;
    }

    const { error } = await supabase.from('room_state').update({
      ai_status: 'payment',
      last_prompted_by: user.sub
    }).eq('room_id', roomId);

    if (error) {
      console.error("Failed to start checkout:", error);
      setPaymentError(`Could not start checkout: ${error.message || 'Unknown error'}`);
      setAiStatus('idle');
    }
  };


  const handlePay = async () => {
    if (!roomId || !user?.sub) return;
    setPaymentError(null);

    // 1. Persist payment to the room state array so it survives reloads.
    const newPaidArray = Array.from(new Set([...hasPaidLocal, user.sub]));
    setHasPaidLocal(newPaidArray);

    // 2. Broadcast to room state (we use a custom field `paid_members` or just rely on local broadcast if schema is strict,
    // but we can piggyback on a system message, or just update `room_members.has_paid` if it exists. 
    // Since we don't know if has_paid exists, we'll try to update it. If it fails, silent catch.)
    await supabase.from('room_members').update({ has_paid: true }).eq('room_id', roomId).eq('user_id', user.sub).catch(() => { });

    // 3. Keep AI locked in payment
    await supabase.from('room_state').update({
      ai_status: 'payment'
    }).eq('room_id', roomId);
  };

  const handleRefund = async () => {
    if (!roomId || !user?.sub) return;
    setPaymentError(null);

    const newPaidArray = hasPaidLocal.filter(id => id !== user.sub);
    setHasPaidLocal(newPaidArray);

    await supabase.from('room_members').update({ has_paid: false }).eq('room_id', roomId).eq('user_id', user.sub).catch(() => { });

    // For hackathon: just reset room entirely if someone refunds, unlocking it for everyone
    await supabase.from('room_state').update({
      ai_status: 'idle'
    }).eq('room_id', roomId);
    setAiStatus('idle');
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
  const safeCards = Array.isArray(cards) ? cards : [];
  const displayedCards = safeCards.filter(c => {
    const dayMatch = selectedDay === 0 || c?.day === selectedDay;
    const layerMatch = activeLayer === 'all' || c?.type === activeLayer;
    return dayMatch && layerMatch;
  });

  // Dynamic Budget Calculation
  const calculatedBudgetUsed = safeCards.reduce((sum, card) => sum + (card?.data?.price || 0), 0);
  const estimatedBudget = trip?.summary?.estimatedBudget || (calculatedBudgetUsed > 0 ? Math.ceil(calculatedBudgetUsed * 1.2 / 500) * 500 : 2500);
  const budgetProgress = estimatedBudget > 0 ? Math.min((calculatedBudgetUsed / estimatedBudget) * 100, 100) : 0;

  const someOnePaid = hasPaidLocal.length > 0;
  const allPaid = members.length > 0 && hasPaidLocal.length === members.length;
  const splitTotal = members.length > 0 ? Math.round(calculatedBudgetUsed / members.length) : calculatedBudgetUsed;
  const myMember = members.find(m => m.user_id === user?.sub);
  const myMemberHasPaid = user?.sub ? hasPaidLocal.includes(user.sub) : false;

  // Auto-transition to booking if everyone paid
  useEffect(() => {
    if (aiStatus === 'payment' && allPaid && (isOwner || (members.length > 0 && members[0]?.user_id === user?.sub))) {
      supabase.from('room_state').update({
        ai_status: 'booking',
        last_prompted_by: user?.sub
      }).eq('room_id', roomId).then();
    }
  }, [allPaid, aiStatus, isOwner, members, user, roomId]);


  // Layer Subtotals
  const stayCards = safeCards.filter(c => c?.type === 'stay');
  const stayCost = stayCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);
  const activityCards = safeCards.filter(c => c?.type === 'activity');
  const activityCost = activityCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);
  const transportCards = safeCards.filter(c => c?.type === 'transport');
  const transportCost = transportCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);


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
        <div
          className="p-4 border-b border-sidebar-border flex items-center justify-between cursor-pointer hover:bg-sidebar-accent/50 transition-colors group"
          onClick={() => setLocation("/dashboard")}
        >
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center shadow-lg overflow-hidden">
              <img src="/logo.png" alt="Adealy" className="h-full w-full object-cover" />
            </div>
            <span className="font-bold text-lg tracking-tight group-hover:text-primary transition-colors">Adealy</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            Dashboard
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
              <LayerItem icon={LayoutGrid} label="Itinerary" value={`${trip?.days || 0} days`} active={activeLayer === 'all'} onClick={() => setActiveLayer('all')} />
              <LayerItem icon={BedDouble} label="Stays" value={stayCost === 0 ? "Free" : `${stayCards.length} • $${stayCost} `} color="text-orange-400" active={activeLayer === 'stay'} onClick={() => setActiveLayer('stay')} />
              <LayerItem icon={Camera} label="Activities" value={activityCost === 0 ? "Free" : `${activityCards.length} • $${activityCost} `} color="text-blue-400" active={activeLayer === 'activity'} onClick={() => setActiveLayer('activity')} />
              <LayerItem icon={Train} label="Transport" value={transportCost === 0 ? "Free" : `${transportCards.length} • $${transportCost} `} color="text-emerald-400" active={activeLayer === 'transport'} onClick={() => setActiveLayer('transport')} />
              <LayerItem icon={CreditCard} label="Total Cost" value={calculatedBudgetUsed === 0 ? "Free" : `$${calculatedBudgetUsed} `} color="text-purple-400" />
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
                  <span className="text-xs font-bold opacity-80">{calculatedBudgetUsed === 0 ? "Free" : `$${calculatedBudgetUsed} `}</span>
                </button>
                {Array.from({ length: trip.days }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayCards = safeCards.filter(c => c?.day === dayNum);
                  const dayCost = dayCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);

                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <button
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                          selectedDay === dayNum ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                        onClick={() => setSelectedDay(dayNum)}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium">Day {dayNum}</span>
                          <span className="text-[10px] opacity-70">{trip?.destination?.split(',')[0] || "City"}</span>
                        </div>
                        <span className="text-xs font-bold opacity-80">{dayCost === 0 ? "Free" : `$${dayCost} `}</span>
                      </button>

                      <AnimatePresence>
                        {selectedDay === dayNum && dayCards.length > 0 && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            <div className="pl-6 pr-2 py-2 space-y-3 relative before:absolute before:inset-y-3 before:left-[17px] before:w-px before:bg-border/40">
                              {dayCards.sort((a, b) => (a.data.startTime || '').localeCompare(b.data.startTime || '')).map(card => (
                                <div key={card.id} className="relative flex flex-col gap-0.5 group/timeline cursor-pointer" onClick={() => zoomToCard(card.id)}>
                                  <div className="absolute top-1.5 -left-[14px] w-2 h-2 rounded-full border border-background bg-muted-foreground group-hover/timeline:bg-primary group-hover/timeline:scale-125 transition-all" />
                                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none flex items-center gap-1.5">
                                    {card.data.startTime || "??:??"}
                                    {card.data.endTime && <span className="flex items-center gap-1"><ArrowRight className="h-2 w-2 opacity-50" /> {card.data.endTime}</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className={cn(
                                      "relative flex items-center justify-center h-6 w-6 rounded-md shadow-sm",
                                      card.type === 'transport' ? "bg-emerald-500/10 text-emerald-500" : "bg-sidebar-accent/50 text-foreground"
                                    )}>
                                      {card.type === 'stay' ? <BedDouble className="h-3 w-3" /> :
                                        card.type === 'activity' ? <Camera className="h-3 w-3" /> :
                                          card.data.mode === 'walking' ? <Footprints className="h-3 w-3" /> :
                                            card.data.mode === 'driving' ? <Car className="h-3 w-3" /> :
                                              card.data.mode === 'bicycling' ? <Bike className="h-3 w-3" /> :
                                                <Train className="h-3 w-3" />
                                      }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className={cn(
                                        "text-xs font-medium block truncate transition-colors",
                                        card.type === 'transport' ? "text-emerald-500/80 group-hover/timeline:text-emerald-500" : "text-foreground group-hover/timeline:text-primary"
                                      )}>
                                        {card.name}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground block truncate">
                                        {card.type === 'transport' && (card.data.mode && card.data.mode.charAt(0).toUpperCase() + card.data.mode.slice(1) + " • ")}
                                        {card.data.price === 0 ? "Free" : `$${card.data.price || 0} `}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
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
                {profileData?.first_name ? `${profileData.first_name} ${profileData.last_name || ''} ` : user?.name || "Guest"}
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
              {isEditingName ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={e => setEditedName(e.target.value)}
                  onBlur={handleSaveRoomName}
                  onKeyDown={e => e.key === 'Enter' && handleSaveRoomName()}
                  autoFocus
                  className="font-bold text-sm tracking-wide bg-transparent border-b border-primary outline-none px-1 py-0.5 min-w-[150px]"
                />
              ) : (
                <h1
                  className={cn("font-bold text-sm tracking-wide", (isOwner && aiStatus !== 'booked') ? "cursor-pointer hover:text-primary transition-colors" : "")}
                  onClick={() => {
                    if (isOwner && aiStatus !== 'booked') {
                      setEditedName(roomName);
                      setIsEditingName(true);
                    }
                  }}
                  title={isOwner && aiStatus !== 'booked' ? "Click to edit trip name" : ""}
                >
                  {roomName}
                </h1>
              )}
              {aiStatus === 'booked' ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-1.5 h-5 font-bold uppercase tracking-wider">Paid & Ready</Badge>
              ) : (aiStatus === 'payment' && someOnePaid) ? (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-1.5 h-5 font-bold uppercase tracking-wider">Payment in progress</Badge>
              ) : (
                <Badge variant="secondary" className="bg-muted text-muted-foreground border-0 text-[10px] px-1.5 h-5">LIVE</Badge>
              )}
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
                    {trip.visaRequirement.replace(/-/g, ' ')}
                  </Badge>
                </div>
              )}
              {trip?.destination && profileData?.passport_country && userVisaRequirement && userVisaRequirement !== 'unknown' && (
                <div title={`Based on your ${profileData.passport_country} passport`}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 h-5 uppercase border-0 cursor-help ml-2",
                      userVisaRequirement === 'visa-free' ? 'bg-emerald-500/10 text-emerald-500' :
                        userVisaRequirement === 'visa-on-arrival' ? 'bg-amber-500/10 text-amber-500' :
                          userVisaRequirement === 'visa-required' ? 'bg-rose-500/10 text-rose-500' :
                            'bg-slate-500/10 text-slate-500'
                    )}
                  >
                    {userVisaRequirement.replace(/-/g, ' ')}
                  </Badge>
                </div>
              )}
              {trip?.destination && profileData?.passport_country && userVisaRequirement && userVisaRequirement !== 'unknown' && (
                <div title={`Based on your ${profileData.passport_country} passport`}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 h-5 uppercase border-0 cursor-help ml-2",
                      userVisaRequirement === 'visa-free' ? 'bg-emerald-500/10 text-emerald-500' :
                        userVisaRequirement === 'visa-on-arrival' ? 'bg-amber-500/10 text-amber-500' :
                          userVisaRequirement === 'visa-required' ? 'bg-rose-500/10 text-rose-500' :
                            'bg-slate-500/10 text-slate-500'
                    )}
                  >
                    {userVisaRequirement.replace(/-/g, ' ')}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Center Toggles */}
          < div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-muted p-1 rounded-lg border border-border/50" >
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
          </div >

          {/* Right Actions */}
          < div className="flex items-center gap-4" >
            {/* Budget Bar */}
            {/* Budget Bar */}
            <div className="hidden lg:flex items-center gap-3 bg-muted px-3 py-1.5 rounded-full border border-border/10">
              <div className="text-xs font-medium">
                <span className="text-foreground">${calculatedBudgetUsed}</span>
                <span className="text-muted-foreground"> / ${estimatedBudget}</span>
              </div>
              <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${budgetProgress}% ` }} />
              </div>
            </div>

            <ModeToggle />

            {isOwner && (aiStatus === 'idle' || aiStatus === 'payment') && (
              <Button
                onClick={() => setShowCheckoutModal(true)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs gap-2"
              >
                <CreditCard className="h-3 w-3" /> Checkout
              </Button>
            )}

            {aiStatus !== 'booked' && (
              <Button
                onClick={() => { setShowInviteModal(true); setInviteMessage(null); }}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs gap-2"
              >
                <Share2 className="h-3 w-3" /> Invite
              </Button>
            )}
          </div>
        </header >

        {/* Invite Modal Overlay */}
        {showInviteModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowInviteModal(false)}>
            <div className="bg-sidebar border border-sidebar-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  <h2 className="font-bold text-base">Invite a Collaborator</h2>
                </div>
                <button onClick={() => setShowInviteModal(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Enter their email — they must have an Adealy account first.</p>
              <form onSubmit={async (e) => { await handleInvite(e); }} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="friend@email.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
                    required
                    autoFocus
                  />
                </div>
                {inviteMessage && (
                  <div className={cn(
                    "text-xs px-3 py-2 rounded-lg",
                    inviteMessage.type === 'success'
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  )}>
                    {inviteMessage.text}
                  </div>
                )}
                <Button type="submit" disabled={isInviting} className="w-full">
                  {isInviting ? 'Sending invite...' : 'Send Invite'}
                </Button>
              </form>
            </div>
          </div>
        )}

        {/* Checkout Modal Overlay */}
        {showCheckoutModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCheckoutModal(false)}>
            <div className="bg-sidebar border border-sidebar-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-500" />
                  <h2 className="font-bold text-base">Shared Checkout</h2>
                </div>
                <button onClick={() => setShowCheckoutModal(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
              </div>

              <div className="bg-muted/50 rounded-xl p-4 mb-4 space-y-2 border border-border/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Split among</span>
                  <span className="font-semibold">{members.length} people</span>
                </div>
                <div className="flex justify-between text-xs font-bold pt-1 border-t border-border/20 mt-1">
                  <span>Your Share</span>
                  <span className="text-emerald-500 font-serif text-lg">${splitTotal}</span>
                </div>
              </div>

              {/* Individual Status */}
              <div className="space-y-2 mb-6 max-h-40 overflow-y-auto pr-1">
                <p className="text-[10px] uppercase font-bold text-gray-500 ml-1 mb-1">Payment Status</p>
                {members.map((m: any) => (
                  <div key={m.user_id} className="flex items-center justify-between bg-muted/30 p-2 rounded-lg border border-border/10">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                        {m.user_profiles?.first_name?.[0] || 'U'}
                      </div>
                      <span className="text-xs truncate">{m.user_id === user?.sub ? 'You' : m.user_profiles?.first_name || 'Member'}</span>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-0 text-[10px] gap-1">
                      <Clock className="h-2.5 w-2.5" /> Pending
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-gray-500 ml-1">Mock Card Details</label>
                  <div className="bg-muted border border-border/50 rounded-lg px-3 py-2 flex items-center gap-2 opacity-60">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">4242 •••• •••• 4242</span>
                  </div>
                </div>
              </div>

              <Button onClick={() => setShowCheckoutModal(false)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 rounded-xl shadow-lg shadow-emerald-600/20">
                Close (Checkout Disabled)
              </Button>

              <p className="text-[10px] text-center text-muted-foreground mt-4 italic">
                Booking animation starts after all members pay.
              </p>
            </div>
          </div>
        )}

        {/* Content View */}
        <div className="flex-1 relative bg-background pt-14 flex flex-col min-h-0">
          {viewMode === 'map' ? (
            <Map
              ref={mapRef}
              center={[0, 20]} // Default to World View
              zoom={1.5}
              className="w-full flex-1"
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
              <RoutesLayer cards={cards} enabled={true} visibleDay={selectedDay} activeLayer={activeLayer} />

              {/* Dynamic Markers */}
              {displayedCards.map((card) => (
                card.position && typeof card.position.lat === 'number' && typeof card.position.lng === 'number' && (
                  <MapMarker
                    key={card.id}
                    latitude={card.position.lat}
                    longitude={card.position.lng}
                    popupOpen={focusedCardId === card.id}
                    onPopupClose={() => { if (focusedCardId === card.id) setFocusedCardId(null) }}
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
                          card.type === 'stay' ? "bg-orange-500 text-white" :
                            card.type === 'activity' ? "bg-blue-500 text-white" : "bg-emerald-500 text-white"
                        )}>
                          {card.type}
                        </Badge>
                        <span className="text-[10px] text-gray-500">Day {card.day}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">{card.name}</h4>
                      {card.data.price !== undefined && (
                        <p className="text-xs text-gray-400 mb-2">
                          {card.data.price === 0 ? "Free" : `$${card.data.price} per person`}
                        </p>
                      )}

                      {aiStatus !== 'booked' && (
                        <Button size="sm" variant="secondary" className="w-full text-xs h-7 bg-white/10 hover:bg-white/20 text-white" onClick={() => handleAddToCart(card)}>
                          <Plus className="h-3 w-3 mr-1.5" /> Add to Saved
                        </Button>
                      )}
                    </MarkerPopup>
                  </MapMarker>
                )
              ))}

              {/* Floating Progress Status */}
              {aiStatus === 'thinking' && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 flex flex-col items-center gap-2">
                  <div className="bg-blue-600/90 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md border border-white/20">
                    <Zap className="h-4 w-4 animate-pulse fill-current" />
                    <span className="text-sm font-bold uppercase tracking-wide">
                      {streamStatus ? streamStatus.message : (
                        `Adealy is designing ${aiPromptedBy && members.find(m => m.user_id === aiPromptedBy)?.user_profiles?.first_name ? members.find(m => m.user_id === aiPromptedBy)?.user_profiles?.first_name + "'s" : (aiPromptedBy === user?.sub ? 'your' : 'the')} trip...`
                      )}
                    </span>
                  </div>
                  {streamStatus && (
                    <div className="flex gap-1 mt-1">
                      {Array.from({ length: streamStatus.total }).map((_, idx) => (
                        <div key={idx} className={cn(
                          "h-1.5 rounded-full transition-all duration-500",
                          idx < streamStatus.step ? "w-6 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" :
                            idx === streamStatus.step ? "w-6 bg-blue-500/50 animate-pulse" : "w-2 bg-blue-500/20"
                        )} />
                      ))}
                    </div>
                  )}
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
            <div className="flex-1 w-full overflow-y-auto bg-background">
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
                    {roomName}
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
                      <div
                        className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-6 mb-8 border-b border-border/40 flex items-baseline justify-between group cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => zoomToDay(dayNum)}
                      >
                        <div className="flex items-baseline gap-4">
                          <span className="font-serif text-4xl md:text-5xl text-foreground/20 font-light group-hover:text-primary/20 transition-colors">0{dayNum}</span>
                          <div>
                            <h2 className="text-xl md:text-2xl font-bold font-serif">{trip?.destination?.split(',')[0] || "City"} Exploration</h2>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                              {(() => {
                                const d = new Date(trip?.startDate || new Date());
                                // Need to parse safely as UTC is not assumed for pure string
                                d.setDate(d.getDate() + dayNum - 1 + (trip?.startDate ? 1 : 0)); // Hack to adjust for timezone drift locally
                                return `${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} • ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
                              })()}
                            </span>
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
                              className={cn(
                                "group relative bg-card rounded-2xl p-6 transition-all shadow-sm hover:shadow-xl border border-border/40 overflow-hidden cursor-pointer",
                                focusedCardId === card.id && "ring-2 ring-primary ring-offset-4 ring-offset-background border-primary"
                              )}
                              onClick={() => zoomToCard(card.id)}
                            >
                              <div className={cn(
                                "absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/50 to-transparent transition-opacity",
                                focusedCardId === card.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              )} />

                              <div className="flex flex-col md:flex-row gap-6">
                                {/* Time Column */}
                                <div className="min-w-[80px] flex md:flex-col items-center md:items-start gap-2 md:gap-0">
                                  <span className="text-lg font-bold font-serif text-foreground">{card.data.startTime || "09:00"}</span>
                                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{card.data.endTime ? `TO ${card.data.endTime} ` : "AM"}</span>
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
                                    <div className="flex items-center justify-between mb-2">
                                      <h3 className="font-serif text-xl font-bold group-hover:text-primary transition-colors">{card.name}</h3>
                                      <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-1 rounded-md">
                                        {card.data.price === 0 || !card.data.price ? "Free" : `$${card.data.price} `}
                                      </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2 md:line-clamp-none">{card.data.description}</div>
                                  </div>

                                  {/* Cloudinary-optimized image for stay and activity cards */}
                                  {card.data.imageUrl && card.type !== 'transport' && (
                                    <div className="rounded-xl overflow-hidden h-40 w-full mt-1 border border-border/30 shadow-inner">
                                      <img
                                        src={getOptimizedImageUrl(card.data.imageUrl, 800, 400)}
                                        alt={card.name}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                      />
                                    </div>
                                  )}


                                  {card.type === 'transport' && card.data.from && card.data.to && (() => {
                                    const mode = card.data.mode || 'driving';
                                    const travelmode = mode === 'walking' ? 'walking' : mode === 'transit' ? 'transit' : 'driving';
                                    const origin = `${card.data.from.lat},${card.data.from.lng} `;
                                    const dest = `${card.data.to.lat},${card.data.to.lng} `;
                                    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=${travelmode}`;
                                    return (
                                      <div className="mt-4 space-y-2">
                                        <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50">
                                          <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5" /> {card.data.from.name || "Origin"}</div>
                                          <ArrowRight className="h-3 w-3 text-primary/50 shrink-0" />
                                          <div className="flex items-center gap-2"><MapIcon className="h-3.5 w-3.5" /> {card.data.to.name || "Destination"}</div>
                                        </div>
                                        <a
                                          href={mapsUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 w-fit"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          Open in Google Maps{
                                            mode === 'flight' ? '' :
                                              mode === 'train' ? ' (Train)' :
                                                mode === 'bus' || mode === 'transit' ? ' (Transit)' :
                                                  mode === 'walking' ? ' (Walking)' :
                                                    ' (Driving)'
                                          }
                                        </a>
                                      </div>
                                    );
                                  })()}


                                  {
                                    aiStatus !== 'booked' && (
                                      <div className="flex items-center justify-end pt-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                        <Button size="sm" variant="ghost" className="text-xs hover:text-primary gap-1" onClick={() => handleAddToCart(card)}>
                                          <Plus className="h-3 w-3" /> Save to Collection
                                        </Button>
                                      </div>
                                    )
                                  }
                                </div >
                              </div >
                            </motion.div >
                          ))
                        )}
                      </div >
                    </motion.div >
                  );
                })}
              </div >
            </div >
          )
          }
        </div>
      </main >

      {/* 3. Right Sidebar - Copilot/Chat */}
      < aside className="w-[380px] bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 z-20" >
        {/* Tabs */}
        < div className="flex items-center p-2 border-b border-sidebar-border" >
          {
            ['design', 'saved', 'purchasing', 'config'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors relative",
                  activeTab === tab ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:text-sidebar-foreground"
                )}
              >
                {tab}
                {tab === 'saved' && cart.length > 0 && (
                  <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
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
          ) : activeTab === 'purchasing' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="flex items-center gap-2 mb-2 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20">
                <ShoppingBag className="h-5 w-5 text-emerald-500" />
                <div>
                  <h3 className="text-sm font-black text-emerald-600 uppercase tracking-tight">Order Summary</h3>
                  <p className="text-[10px] font-bold text-emerald-600/70">{cart.length} items selected</p>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="space-y-4">
                <div className="flex justify-between items-end px-1">
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Budget</p>
                    <p className="text-2xl font-black tracking-tighter">${calculatedBudgetUsed}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Per Person</p>
                    <p className="text-lg font-black text-primary tracking-tighter">${splitTotal}</p>
                  </div>
                </div>

                <div className="h-px bg-border/40" />

                {/* Items in Selection */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Selected Assets</h4>
                  {cart.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-2 text-center">No items saved to your collection yet.</p>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/10">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-8 w-8 rounded-md flex items-center justify-center",
                            item.type === 'stay' ? "bg-orange-500/10 text-orange-500" :
                              item.type === 'activity' ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"
                          )}>
                            {item.type === 'stay' ? <BedDouble className="h-4 w-4" /> : item.type === 'activity' ? <Camera className="h-4 w-4" /> : <Train className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold truncate max-w-[150px]">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{item.type}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-foreground">${item.data.price || 0}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="h-px bg-border/40" />

                {/* Shared Payment List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Payment Network</h4>
                    <Users className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-3 bg-card border border-border/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-black uppercase">
                            {m.user_profiles?.first_name?.[0] || 'M'}
                          </div>
                          <span className="text-xs font-bold">{m.user_id === user?.sub ? 'You' : (m.user_profiles?.first_name || 'Member')}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-black uppercase h-5 text-muted-foreground/60">Pending</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {isOwner && (aiStatus === 'idle' || aiStatus === 'payment') && cart.length > 0 && (
                  <Button
                    onClick={() => setShowCheckoutModal(true)}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                  >
                    Initiate Checkout flow
                  </Button>
                )}
              </div>
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
                  {members.map(m => {
                    const profile = m.user_profiles;
                    const displayName = profile?.first_name
                      ? `${profile.first_name} ${profile.last_name || ''}`.trim()
                      : m.user_id === user?.sub ? 'You' : 'Member';
                    return (
                      <div key={m.id} className="p-3 bg-card border border-border/50 rounded-lg flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold">
                              {m.user_id === user?.sub ? `${displayName} (You)` : displayName}
                              {m.role === 'owner' && <span className="ml-1.5 text-[9px] uppercase text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded-full">Owner</span>}
                            </span>
                            {profile?.email && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">{profile.email}</p>
                            )}
                          </div>
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
                    );
                  })}
                </div>
              </div>
            </div>

          ) : (
            /* Chat Interface */
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-8 text-muted-foreground">
                  <div className="h-16 w-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg overflow-hidden border border-border">
                    <img src="/logo.png" alt="Adealy" className="h-full w-full object-cover" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">I am Adealy</h3>
                  <p className="text-sm">Your AI travel architect.</p>
                  <p className="text-xs mt-2">Mention @Adealy to start planning.</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isAi = msg.is_ai;
                  // Try to find the sender's details from members
                  const senderMember = members.find(m => m.user_id === msg.sender_id);
                  const senderProfile = senderMember?.user_profiles;
                  const senderName = isAi ? 'Adealy' : (senderProfile?.first_name ? `${senderProfile.first_name} ${senderProfile.last_name || ''}`.trim() : (msg.sender_id === user?.sub ? 'You' : 'Collaborator'));

                  return (
                    <div key={i} className={cn("flex w-full gap-3", !isAi ? "justify-end" : "justify-start")}>
                      {isAi && (
                        <div className="flex-shrink-0 h-8 w-8 bg-white rounded-full flex items-center justify-center shadow-md overflow-hidden border border-border">
                          <img src="/logo.png" alt="Adealy" className="h-full w-full object-cover" />
                        </div>
                      )}

                      <div className={cn("flex flex-col max-w-[80%]", !isAi ? "items-end" : "items-start")}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-[10px] font-bold text-muted-foreground">{senderName}</span>
                        </div>
                        <div className={cn(
                          "text-sm p-3 shadow-md leading-relaxed",
                          !isAi
                            ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm"
                            : "bg-card text-card-foreground rounded-2xl rounded-tl-sm border border-border"
                        )}>
                          <MarkdownText content={msg.content} />
                        </div>
                      </div>

                      {!isAi && (
                        <div className="flex-shrink-0 h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center shadow-md overflow-hidden border border-border">
                          {msg.sender_id === user?.sub && user?.picture ? (
                            <img src={user.picture} alt="Avatar" className="h-full w-full object-cover" />
                          ) : senderProfile?.avatar_url ? (
                            <img src={senderProfile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                          ) : (
                            <UserIcon className="h-4 w-4 text-white" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {aiStatus === 'thinking' && (
                <div className="flex w-full gap-3 justify-start opacity-70">
                  <div className="flex-shrink-0 h-8 w-8 bg-primary rounded-full flex items-center justify-center shadow-md animate-pulse">
                    <span className="text-primary-foreground font-bold text-sm">A</span>
                  </div>
                  <div className="flex flex-col items-start max-w-[80%]">
                    <div className="text-sm p-3 shadow-sm leading-relaxed bg-card text-muted-foreground rounded-2xl rounded-tl-sm border border-border italic flex items-center gap-2">
                      <div className="flex gap-1 mr-1">
                        <span className="h-1.5 w-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      Generating {aiPromptedBy && members.find(m => m.user_id === aiPromptedBy)?.user_profiles?.first_name ? `${members.find(m => m.user_id === aiPromptedBy)?.user_profiles?.first_name}'s` : (aiPromptedBy === user?.sub ? 'your' : 'the')} prompt...
                    </div>
                  </div>
                </div>
              )}
              {aiStatus === 'cooldown' && (
                <div className="flex w-full justify-center my-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full">Adealy is cooling down...</span>
                </div>
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
                  disabled={aiStatus !== "idle" || someOnePaid}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={aiStatus === 'booked' ? "Trip is finalized (View Only)" : (aiStatus === 'payment' || someOnePaid) ? "Bot locked (Payment in progress)" : aiStatus === 'thinking' ? "Adealy is thinking..." : aiStatus === 'booking' ? "Booking in progress..." : aiStatus === 'cooldown' ? "Cooling down..." : activeTab === 'saved' ? "Use saved items to generate plan..." : "Mention @Adealy to plan trip..."}
                  className="w-full bg-muted border border-border/10 rounded-xl p-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground min-h-[50px] max-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || aiStatus !== "idle" || someOnePaid}
                  className="absolute right-2 bottom-3 p-1.5 bg-primary rounded-lg text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {aiStatus === 'booked' ? <Lock className="h-4 w-4" /> : (aiStatus === 'payment' || someOnePaid) ? <Lock className="h-4 w-4" /> : aiStatus !== "idle" ? <Zap className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
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

      {/* Checkout Modal Overlay */}
      {
        showCheckoutModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCheckoutModal(false)}>
            <div className="bg-sidebar border border-sidebar-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-500" />
                  <h2 className="font-bold text-lg">Trip Checkout</h2>
                </div>
                <button onClick={() => setShowCheckoutModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
              </div>

              {paymentError && (
                <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-rose-500 text-xs text-center font-bold">
                  {paymentError}
                </div>
              )}

              <div className="bg-muted/50 rounded-xl p-4 border border-border/50">

                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Total Trip Cost</p>
                    <p className="text-2xl font-serif font-bold text-foreground">${calculatedBudgetUsed}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Per Person ({members.length}/{trip?.summary?.travelers || 1} Joined)</p>
                    <p className="text-lg font-bold text-emerald-500">${splitTotal}</p>
                  </div>
                </div>
              </div>

              {aiStatus === 'idle' ? (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-xs leading-relaxed">
                    <strong>Notice:</strong> This trip has {members.length} members. Starting checkout will lock the trip planning and require everyone to pay their share of ${splitTotal}.
                  </div>
                  {(isOwner || (members.length > 0 && members[0]?.user_id === user?.sub)) ? (
                    <Button onClick={handleCheckout} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-xl font-bold text-base shadow-lg shadow-emerald-500/20">
                      Start Shared Payment
                    </Button>
                  ) : (
                    <div className="text-center p-4 border border-dashed border-border rounded-xl">
                      <p className="text-sm text-muted-foreground">Waiting for the trip owner to start the checkout process.</p>
                    </div>
                  )}
                </div>
              ) : (

                <div className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Payment Status</h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                      {members.map(m => {
                        const profile = m.user_profiles;
                        const isMe = m.user_id === user?.sub;
                        const name = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : (isMe ? 'You' : 'Member');

                        return (
                          <div key={m.id} className="flex items-center justify-between p-3 bg-card border border-border/50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold ring-2 ring-background">
                                {profile?.first_name?.[0] || 'M'}
                              </div>
                              <div>
                                <p className="text-sm font-bold">{name}</p>
                                <p className="text-[10px] text-muted-foreground">{profile?.email}</p>
                              </div>
                            </div>
                            {hasPaidLocal.includes(m.user_id) ? (
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-bold uppercase gap-1">
                                <Check className="h-3 w-3" /> Paid
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground">Pending</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!myMemberHasPaid ? (
                    <Button onClick={handlePay} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-xl font-bold text-base shadow-lg shadow-emerald-500/20 gap-2">
                      Pay My Share (${splitTotal})
                    </Button>
                  ) : (
                    <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                          <Check className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="font-bold text-emerald-500">Your share is paid!</p>
                          <p className="text-xs text-emerald-600/70">Waiting for other members to finish.</p>
                        </div>
                      </div>
                      <Button onClick={handleRefund} variant="outline" className="border-rose-500/20 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 font-bold uppercase tracking-wider shrink-0 h-10 w-full sm:w-auto">
                        Refund & Edit
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[10px] text-center text-muted-foreground italic px-4">
                Once everyone has paid, Adealy will finalize all bookings and the trip will be archived.
              </p>
            </div>
          </div>
        )
      }
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

function MarkdownText({ content }: { content: string }) {
  if (!content) return null;

  // Custom parser to handle bold text and images
  const lines = content.split('\\n');

  return (
    <div className="space-y-3 leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;

        // Handle images: Detect ![alt](url) or standalone image URLs
        const imgMatch = line.match(/!\[(.*?)\]\((.*?)\)/) || line.match(/(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp)(?:\?.*)?)/i);

        if (imgMatch) {
          const url = imgMatch[2] || imgMatch[1];
          const alt = imgMatch[1] || 'AI Image';

          return (
            <div key={i} className="rounded-lg overflow-hidden my-2 border border-border/30 group/img rotate-1">
              <img
                src={getOptimizedImageUrl(url, 600, 300)}
                alt={alt}
                className="w-full h-auto object-cover transition-transform duration-500 group-hover/img:scale-110"
                loading="lazy"
              />
            </div>
          );
        }

        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={i}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j} className="font-bold">{part.slice(2, -2)}</strong>;
              }
              return <span key={j}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
