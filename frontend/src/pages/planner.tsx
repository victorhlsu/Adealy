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
  UserPlus,
  ExternalLink,
  BedDouble,
  Camera,
  Plane,
  Train,
  CreditCard,
  ArrowRight,
  Footprints,
  Car,
  Bike,
  Search,
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
import { formatMoney, parseMoneyToNumber } from "@/lib/money";
import { geocodePlace, searchHotels, type HotelsResponse } from "@/services/backend";

export default function PlannerPage({ roomId }: { roomId?: string }) {
  const [, setLocation] = useLocation();
  const DEFAULT_AVATAR_URL = 'https://static.vecteezy.com/system/resources/thumbnails/009/292/244/small/default-avatar-icon-of-social-media-user-vector.jpg';

  const looksLikeEmail = (s: string) => /@/.test(String(s || ''));
  const getEmailPrefix = (email?: string | null) => {
    const e = String(email || '').trim();
    if (!e) return '';
    const at = e.indexOf('@');
    return at > 0 ? e.slice(0, at) : e;
  };

  const getBestMyDisplayName = () => {
    const first = String((profileData as any)?.first_name || '').trim();
    const last = String((profileData as any)?.last_name || '').trim();
    if (first) return `${first} ${last}`.trim();

    const given = String((user as any)?.given_name || '').trim();
    const family = String((user as any)?.family_name || '').trim();
    if (given || family) return `${given} ${family}`.trim();

    const name = String((user as any)?.name || '').trim();
    if (name && !looksLikeEmail(name)) {
      if (name.includes(',')) {
        const [left, right] = name.split(',', 2).map((p: string) => String(p || '').trim());
        const normalized = `${right} ${left}`.trim();
        return normalized || name;
      }
      return name;
    }

    const email = String((user as any)?.email || '').trim();
    const prefix = getEmailPrefix(email);
    return prefix || 'Guest';
  };

  const stripTripForPrompt = (t: any) => {
    if (!t || typeof t !== 'object') return null;
    const next: any = { ...t };
    if (Array.isArray(next.cards)) {
      next.cards = next.cards.map((c: any) => {
        const data = { ...(c?.data || {}) };
        if (data.routeGeometry) delete data.routeGeometry;
        return { ...c, data };
      });
    }
    return next;
  };

  const truncateForModel = (text: string, maxChars: number) => {
    const s = String(text || '');
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + `\n...[truncated ${s.length - maxChars} chars]`;
  };

  const buildAdealyContextBlock = () => {
    const t: any = trip as any;
    const snapshot = stripTripForPrompt({ ...(t || {}), cards: Array.isArray(cards) ? cards : (t?.cards || []) });
    const ui = {
      selectedDay,
      activeLayer,
      viewMode,
      focusedCardId,
      roomId,
    };
    const block = {
      instructions: "This room already has a trip. Update the existing itinerary; do not regenerate from scratch unless explicitly requested. Preserve existing card ids when possible.",
      ui,
      trip: snapshot,
    };
    return truncateForModel(JSON.stringify(block), 12000);
  };

  const isValidLatLng = (lat: any, lng: any) => {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  };

  const geocodeBestEffort = async (query: string) => {
    const q = String(query || '').trim();
    if (!q) return null;
    try {
      const resp = await geocodePlace(q);
      if ((resp as any)?.status !== 'ok') return null;
      const ok = resp as any;
      if (!isValidLatLng(ok.latitude, ok.longitude)) return null;
      return { lat: ok.latitude as number, lng: ok.longitude as number, address: ok.address as any };
    } catch {
      return null;
    }
  };

  const centerGeocodeRef = useRef(false);

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
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [hasPaidLocal, setHasPaidLocal] = useState<string[]>([]);

  const [showHotelsModal, setShowHotelsModal] = useState(false);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [hotelsError, setHotelsError] = useState<string | null>(null);
  const [hotels, setHotels] = useState<HotelsResponse['hotels']>([]);
  const [hotelsSearchUrl, setHotelsSearchUrl] = useState<string | null>(null);
  const [hotelsQuery, setHotelsQuery] = useState({
    location: '',
    checkin: '',
    checkout: '',
    adults: 1,
    children: 0,
    rooms: 1,
    currency: 'USD',
  });

  const bookingQueueRef = useRef<string[]>([]);
  const bookingLastStepRef = useRef<number>(0);
  const autoHotelsLoadedRef = useRef(false);

  const getStaticMapImageUrl = (lat: number, lng: number, w = 800, h = 400) => {
    // Keyless static thumbnail (attribution is handled by OSM page; this is a hackathon-friendly fallback)
    const zoom = 14;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&markers=${lat},${lng},red-pushpin`;
  };

  const getPlaceholderImageUrl = (label: string, w = 800, h = 400) => {
    const safe = String(label || 'Location').slice(0, 26);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#22c55e" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0b1220"/>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system" font-size="32" fill="#e2e8f0" font-weight="700">${safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
  <text x="50%" y="70%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system" font-size="14" fill="#94a3b8" font-weight="600">Image unavailable</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const getCardImageUrl = (card: any) => {
    if (card?.data?.imageUrl) return String(card.data.imageUrl);
    if (card?.position && typeof card.position.lat === 'number' && typeof card.position.lng === 'number') {
      return getStaticMapImageUrl(card.position.lat, card.position.lng);
    }

    const name = String(card?.name || '').trim();
    const base =
      card?.type === 'transport'
        ? 'airport,airplane,travel'
        : card?.type === 'stay'
          ? 'hotel,travel'
          : 'restaurant,attraction,travel';
    const query = name ? `${encodeURIComponent(name)},${base}` : base;
    return `https://source.unsplash.com/800x400/?${query}`;
  };

  const ensureImgFallback = (img: HTMLImageElement, fallbackSrc: string) => {
    const el = img as any;
    if (el.dataset?.fallbackApplied === '1') return;
    if (el.dataset) el.dataset.fallbackApplied = '1';
    img.src = fallbackSrc;
  };

  const selectHotel = async (h: HotelsResponse['hotels'][number]) => {
    if (!roomId) return;
    if (!trip) {
      setHotelsError('Trip is not initialized yet.');
      return;
    }

    // Never hard-block selection just because upstream forgot coordinates.
    let lat: number | null = (typeof h.latitude === 'number' ? h.latitude : null);
    let lng: number | null = (typeof h.longitude === 'number' ? h.longitude : null);

    if (!isValidLatLng(lat, lng)) {
      const city = String(hotelsQuery.location || (trip as any)?.destination || '').trim();
      const q = [h.name, h.address, city].filter(Boolean).join(', ');
      const geo = await geocodeBestEffort(q);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    if (!isValidLatLng(lat, lng)) {
      const existingCenter = (trip as any)?.center;
      if (isValidLatLng(existingCenter?.lat, existingCenter?.lng)) {
        lat = existingCenter.lat;
        lng = existingCenter.lng;
      } else {
        const destination = String((trip as any)?.destination || hotelsQuery.location || '').trim();
        const geo = await geocodeBestEffort(destination);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;

          const updatedTrip: any = { ...(trip as any), center: { lat: geo.lat, lng: geo.lng } };
          setTrip(updatedTrip);
          if (roomId) {
            supabase.from('messages').insert({
              room_id: roomId,
              content: `__TRIP_DATA__:${JSON.stringify(updatedTrip)}`,
              is_ai: true,
            }).then();
          }
        }
      }
    }

    if (!isValidLatLng(lat, lng)) {
      setHotelsError('Could not locate this hotel on the map. Try another result.');
      return;
    }

    const parsedPrice = parseMoneyToNumber(h.priceTotal ?? h.pricePerNight ?? 0);

    const id = `stay_${Date.now()}`;
    const newCard: any = {
      id,
      type: 'stay',
      layer: 'stays',
      day: 1,
      name: h.name,
      position: { lat, lng },
      data: {
        name: h.name,
        description: h.address || h.distanceFromCenter || 'Selected hotel',
        address: h.address,
        price: parsedPrice,
        bookingUrl: h.bookingUrl,
        imageUrl: h.image,
        rating: h.rating,
        isPrimaryStay: true,
        checkIn: (trip as any)?.startDate,
        checkOut: (trip as any)?.endDate,
      },
    };

    // Make this the primary stay and demote others
    const nextCards = (Array.isArray(cards) ? cards : []).map((c: any) => {
      if (c?.type !== 'stay') return c;
      return {
        ...c,
        data: {
          ...c.data,
          isPrimaryStay: false,
        },
      };
    });
    nextCards.push(newCard);

    setCards(nextCards);
    setTrip({ ...(trip as any), cards: nextCards });

    await supabase.from('messages').insert({
      room_id: roomId,
      content: `__TRIP_DATA__:${JSON.stringify({ ...(trip as any), cards: nextCards })}`,
      is_ai: true,
    });

    setShowHotelsModal(false);
    setHotelsError(null);

    setViewMode('map');
    if (roomId) supabase.from('room_state').update({ focused_view: 'map' }).eq('room_id', roomId).then();
    setFocusedCardId(id);

    setMessages(prev => [...prev, { is_ai: true, content: `✅ Hotel selected: ${h.name}. It’s pinned on the map — generating your itinerary now...` }]);

    // Auto-prompt Adealy once a stay is selected.
    try {
      if (aiStatus !== 'idle') {
        setMessages(prev => [...prev, { is_ai: true, content: "⏳ Adealy is busy — once it’s idle, mention @Adealy to plan the rest." }]);
        return;
      }

      // Trip is locked once anyone starts paying.
      if (someOnePaid) return;
      if (!user?.sub) return;

      const me = members.find(m => m.user_id === user.sub);
      if (me && me.can_prompt_ai === false) {
        setMessages(prev => [...prev, { is_ai: true, content: "⚠️ You don’t have permission to prompt @Adealy in this room." }]);
        return;
      }

      const arrivalAirport = (trip as any)?.arrivalAirport || 'unknown';
      const destination = String((trip as any)?.destination || '').trim() || 'the destination';
      const days = Number((trip as any)?.days) || 1;
      const start = String((trip as any)?.startDate || '').trim();
      const end = String((trip as any)?.endDate || '').trim();

      const currentPrompt = `@Adealy Build a ${days}-day itinerary for ${destination}. We arrive at ${arrivalAirport}. We are staying at "${h.name}". Dates: ${start} to ${end}. Include activities + local transport, and balance cost.`;

      const { error } = await supabase.from('messages').insert({
        room_id: roomId,
        sender_id: user.sub,
        content: currentPrompt,
        is_ai: false,
      });
      if (error) console.error("Failed to save message:", error);

      const enrichedPrompt = `${currentPrompt}\n\nContext (auto): Arrival airport: ${arrivalAirport}; Selected hotel: ${h.name}.\n\n---\nExisting room context (for updating, not regenerating):\n${buildAdealyContextBlock()}\n---`;

      supabase.from('room_state').update({
        ai_status: 'thinking',
        last_prompted_by: user.sub,
      }).eq('room_id', roomId).then();

      setAiStatus('thinking');
      setAiPromptedBy(user.sub);
      setStreamStatus({ step: 0, total: 4, message: 'Planning your trip...' });

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, prompt: enrichedPrompt, auth0_id: user.sub })
      }).catch(err => console.error("Chat API error:", err));
    } catch (e) {
      console.warn('[AutoPrompt] Failed to auto-prompt Adealy:', e);
      setAiStatus('idle');
      setStreamStatus(null);
    }
  };

  const openHotels = () => {
    const location = String(trip?.destination || '').trim();
    const checkin = String(trip?.startDate || '').trim();
    const checkout = String(trip?.endDate || '').trim();

    setHotelsError(null);
    setHotels([]);
    setHotelsSearchUrl(null);
    setHotelsQuery(prev => ({
      ...prev,
      location: location || prev.location,
      checkin: checkin || prev.checkin,
      checkout: checkout || prev.checkout,
    }));
    setShowHotelsModal(true);

    setViewMode('map');
    if (roomId) supabase.from('room_state').update({ focused_view: 'map' }).eq('room_id', roomId).then();
  };

  const runHotelsSearch = async () => {
    if (!hotelsQuery.location || !hotelsQuery.checkin || !hotelsQuery.checkout) {
      setHotelsError('Please provide location, check-in, and check-out dates.');
      return;
    }

    setHotelsLoading(true);
    setHotelsError(null);
    try {
      const res = await searchHotels({
        location: hotelsQuery.location,
        checkin: hotelsQuery.checkin,
        checkout: hotelsQuery.checkout,
        adults: Number(hotelsQuery.adults) || 1,
        children: Number(hotelsQuery.children) || 0,
        rooms: Number(hotelsQuery.rooms) || 1,
        currency: hotelsQuery.currency || 'USD',
      });

      setHotels(res.hotels || []);
      setHotelsSearchUrl(res.searchUrl || null);
    } catch (e: any) {
      setHotelsError(e?.message || 'Failed to search hotels');
    } finally {
      setHotelsLoading(false);
    }
  };

  const [trip, setTrip] = useState<Trip | null>(null);
  const [cards, setCards] = useState<TripCard[]>([]);
  const [cart, setCart] = useState<TripCard[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [profileData, setProfileData] = useState<any>(null);
  const [arrivalAirportEdit, setArrivalAirportEdit] = useState('');
  const [arrivalAirportSuggestions, setArrivalAirportSuggestions] = useState<any[]>([]);
  const [savingArrivalAirport, setSavingArrivalAirport] = useState(false);

  const { user, isAuthenticated } = useAuth0();

  useEffect(() => {
    autoHotelsLoadedRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!trip || !roomId) return;
    if (aiStatus === 'booked') return;
    if (autoHotelsLoadedRef.current) return;

    const safeCardsNow = Array.isArray(cards) ? cards : [];
    const hasStaySelected = safeCardsNow.some((c: any) => c?.type === 'stay');
    if (hasStaySelected) return;

    const location = String(trip.destination || '').trim();
    const checkin = String((trip as any).startDate || '').trim();
    const checkout = String((trip as any).endDate || '').trim();
    if (!location || !checkin || !checkout) return;

    autoHotelsLoadedRef.current = true;
    openHotels();
  }, [trip, roomId, cards, aiStatus]);

  useEffect(() => {
    setArrivalAirportEdit(String(trip?.arrivalAirport || ''));
  }, [trip]);

  useEffect(() => {
    const q = arrivalAirportEdit.trim();
    if (q.length < 2) {
      setArrivalAirportSuggestions([]);
      return;
    }

    if (/^[A-Z]{3}$/.test(q)) {
      setArrivalAirportSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/data/airports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: q, limit: 15 }),
        });
        const data = await res.json();
        setArrivalAirportSuggestions(Array.isArray(data?.airports) ? data.airports : []);
      } catch (e) {
        console.warn('[Config] Failed to search airports', e);
        setArrivalAirportSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [arrivalAirportEdit]);

  const saveArrivalAirport = async () => {
    if (!roomId) return;
    if (!trip) return;
    setSavingArrivalAirport(true);
    try {
      const updatedTrip: Trip = { ...trip, arrivalAirport: arrivalAirportEdit.trim() };
      setTrip(updatedTrip);
      await supabase.from('messages').insert({
        room_id: roomId,
        content: `__TRIP_DATA__:${JSON.stringify(updatedTrip)}`,
        is_ai: true,
      });
      setMessages(prev => [...prev, { is_ai: true, content: `✈️ Arrival airport updated to: ${arrivalAirportEdit.trim() || 'unknown'}.` }]);
    } catch (e) {
      console.warn('[Config] Failed to save arrival airport:', e);
    } finally {
      setSavingArrivalAirport(false);
    }
  };
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
  const [activeLayer, setActiveLayer] = useState<'all' | 'stay' | 'activity' | 'transport' | 'flight'>('all');
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
      visibleCards = visibleCards.filter(c => {
        if (activeLayer === 'flight') return c.type === 'transport' && (c as any)?.data?.mode === 'flight';
        if (activeLayer === 'transport') return c.type === 'transport' && (c as any)?.data?.mode !== 'flight';
        return c.type === activeLayer;
      });
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
          .select('id, room_id, user_id, role, can_prompt_ai, user_profiles(email, first_name, last_name)')
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
          .select('id, room_id, user_id, role, can_prompt_ai, user_profiles(email, first_name, last_name)')
          .eq('room_id', roomId);
        if (finalMems) {
          setMembers(finalMems);
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
          } else if (msg.content.startsWith('__PAYMENT__:')) {
            const uid = msg.content.split(':')[1];
            setHasPaidLocal(prev => Array.from(new Set([...prev, uid])));
          } else if (msg.content.startsWith('__REFUND__:')) {
            const uid = msg.content.split(':')[1];
            setHasPaidLocal(prev => prev.filter(id => id !== uid));
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
          } else if (newMsg.content.startsWith('__PAYMENT__:')) {
            const uid = newMsg.content.split(':')[1];
            setHasPaidLocal(prev => Array.from(new Set([...prev, uid])));
          } else if (newMsg.content.startsWith('__REFUND__:')) {
            const uid = newMsg.content.split(':')[1];
            setHasPaidLocal(prev => prev.filter(id => id !== uid));
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

  // Ensure trip has a reasonable map center (used as a fallback for missing coordinates).
  useEffect(() => {
    if (!roomId) return;
    if (!trip) return;
    if (centerGeocodeRef.current) return;

    const existing = (trip as any)?.center;
    if (isValidLatLng(existing?.lat, existing?.lng)) {
      centerGeocodeRef.current = true;
      return;
    }

    const destination = String((trip as any)?.destination || '').trim();
    if (!destination) return;

    centerGeocodeRef.current = true;
    geocodeBestEffort(destination).then((geo) => {
      if (!geo) return;
      const updatedTrip: any = { ...(trip as any), center: { lat: geo.lat, lng: geo.lng } };
      setTrip(updatedTrip);
      supabase.from('messages').insert({
        room_id: roomId,
        content: `__TRIP_DATA__:${JSON.stringify(updatedTrip)}`,
        is_ai: true,
      }).then();
    });
  }, [roomId, trip]);

  // Fix existing flight transport cards that were created with (0,0) positions.
  const flightFixRef = useRef(false);
  useEffect(() => {
    if (!roomId) return;
    if (!trip) return;
    if (!Array.isArray(cards) || cards.length === 0) return;
    if (flightFixRef.current) return;

    const hasBrokenFlight = cards.some((c: any) => {
      if (c?.type !== 'transport') return false;
      if (c?.data?.mode !== 'flight') return false;
      const p = c?.position;
      return !isValidLatLng(p?.lat, p?.lng) || (p?.lat === 0 && p?.lng === 0);
    });

    if (!hasBrokenFlight) {
      flightFixRef.current = true;
      return;
    }

    flightFixRef.current = true;

    const resolveAirport = async (codeOrQuery: string) => {
      const code = String(codeOrQuery || '').trim().toUpperCase();
      if (!code) return null;
      try {
        const res = await fetch('/api/data/airports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: code, limit: 10 }),
        });
        const data = await res.json();
        const list = Array.isArray(data?.airports) ? data.airports : [];
        const match = list.find((a: any) => String(a?.code || '').toUpperCase() === code) || list[0];
        if (match && isValidLatLng(Number(match.latitude), Number(match.longitude))) {
          return { lat: Number(match.latitude), lng: Number(match.longitude), code: match.code, name: match.name };
        }
      } catch {
        // ignore
      }
      // Fallback: geocode by name
      const geo = await geocodeBestEffort(`${code} airport`);
      return geo ? { lat: geo.lat, lng: geo.lng, code } : null;
    };

    (async () => {
      const updatedCards: any[] = (cards as any[]).map((c: any) => ({ ...c, data: { ...(c?.data || {}) } }));
      let changed = false;

      for (let i = 0; i < updatedCards.length; i++) {
        const c = updatedCards[i];
        if (c?.type !== 'transport' || c?.data?.mode !== 'flight') continue;

        const fromCode = String(c?.data?.from?.name || c?.data?.from?.code || '').trim();
        const toCode = String(c?.data?.to?.name || c?.data?.to?.code || '').trim();
        if (!fromCode || !toCode) continue;

        const from = await resolveAirport(fromCode);
        const to = await resolveAirport(toCode);
        if (!from || !to) continue;

        c.data.from = { ...(c.data.from || {}), name: fromCode.toUpperCase(), lat: from.lat, lng: from.lng };
        c.data.to = { ...(c.data.to || {}), name: toCode.toUpperCase(), lat: to.lat, lng: to.lng };
        c.position = { lat: to.lat, lng: to.lng };
        changed = true;
      }

      if (!changed) return;

      setCards(updatedCards);
      const updatedTrip: any = { ...(trip as any), cards: updatedCards };
      setTrip(updatedTrip);
      supabase.from('messages').insert({
        room_id: roomId,
        content: `__TRIP_DATA__:${JSON.stringify(updatedTrip)}`,
        is_ai: true,
      }).then();
    })();
  }, [roomId, trip, cards]);

  useEffect(() => {
    let isActive = true;
    if (aiStatus === 'thinking' || aiStatus === 'booking') {
      if (aiStatus === 'booking') {
        setShowBookingModal(true);
        bookingLastStepRef.current = 0;
      }
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

              if (aiStatus === 'booking') {
                const queue = bookingQueueRef.current;
                if (queue.length > 0 && chunk.step !== bookingLastStepRef.current) {
                  bookingLastStepRef.current = chunk.step;
                  const ratio = chunk.totalSteps > 0 ? (chunk.step / chunk.totalSteps) : 0;
                  const toBookCount = Math.min(queue.length, Math.max(0, Math.ceil(ratio * queue.length)));
                  const bookedSet = new Set(queue.slice(0, toBookCount));

                  setCards(prev => prev.map((c: any) => {
                    if (!queue.includes(c.id)) return c;
                    const nextStatus = bookedSet.has(c.id) ? 'booked' : 'pending';
                    return {
                      ...c,
                      data: {
                        ...c.data,
                        bookingStatus: nextStatus,
                      },
                    };
                  }));
                }
              }
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

  useEffect(() => {
    if (aiStatus === 'booking') {
      setShowBookingModal(true);
    }
    if (aiStatus === 'booked') {
      setShowBookingModal(false);
    }
  }, [aiStatus]);

  useEffect(() => {
    // Persist final booked trip state once booking completes (only for the initiator)
    if (aiStatus !== 'booked') return;
    if (!roomId) return;
    if (aiPromptedBy !== user?.sub) return;
    if (!trip) return;

    const persist = async () => {
      try {
        const currentCards = Array.isArray(cards) ? cards : [];
        const updatedTrip = { ...(trip as any), cards: currentCards };
        await supabase.from('messages').insert({
          room_id: roomId,
          content: `__TRIP_DATA__:${JSON.stringify(updatedTrip)}`,
          is_ai: true,
        });
      } catch (e) {
        console.warn('[Book] Failed to persist final trip data:', e);
      }
    };

    persist();
  }, [aiStatus, roomId, aiPromptedBy, user?.sub, trip, cards]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    // Trip is locked during payment and after archival.
    if (aiStatus === 'booked') return;
    if (aiStatus === 'payment' || someOnePaid) return;

    const currentPrompt = prompt;
    setPrompt("");

    const { error } = await supabase.from('messages').insert({
      room_id: roomId,
      sender_id: user?.sub,
      content: currentPrompt,
      is_ai: false
    });
    if (error) console.error("Failed to save message:", error);

    const mentionsAdealy = /(^|\s)@?adealy(\s|$)/i.test(currentPrompt);

    const safeCardsNow = Array.isArray(cards) ? cards : [];
    const primaryStay = safeCardsNow.find((c: any) => c?.type === 'stay' && c?.data?.isPrimaryStay);
    const hasStaySelected = !!primaryStay || safeCardsNow.some((c: any) => c?.type === 'stay');

    // While the bot is busy, allow human chat but block new prompts.
    if (aiStatus !== 'idle' && mentionsAdealy) {
      setMessages(prev => [...prev, { is_ai: true, content: "⏳ Adealy is busy right now — you can keep chatting, but please wait before mentioning @Adealy again." }]);
      return;
    }

    if (aiStatus === 'idle' && mentionsAdealy) {
      if (!hasStaySelected) {
        setMessages(prev => [...prev, { is_ai: true, content: "🏨 Pick your hotel first: select a stay from the Stays modal (it opens automatically) and it will be pinned on the map. Then mention @Adealy to plan the rest." }]);
        openHotels();
        return;
      }

      const arrivalAirport = trip?.arrivalAirport;
      const selectedStayName = primaryStay?.name || primaryStay?.data?.name;

      const enrichedPrompt = `${currentPrompt}\n\nContext (auto): Arrival airport: ${arrivalAirport || 'unknown'}; Selected hotel: ${selectedStayName || 'unknown'}.`;
      const enrichedPromptWithTrip = `${enrichedPrompt}\n\n---\nExisting room context (for updating, not regenerating):\n${buildAdealyContextBlock()}\n---`;

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
        body: JSON.stringify({ room_id: roomId, prompt: enrichedPromptWithTrip, auth0_id: user?.sub })
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

        // Ensure members list updates immediately (realtime can be delayed/blocked).
        supabase
          .from('room_members')
          .select('id, room_id, user_id, role, can_prompt_ai, user_profiles(email, first_name, last_name)')
          .eq('room_id', roomId)
          .then(({ data: mems }) => {
            if (mems) setMembers(mems);
          });
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
    const userId = user.sub;
    setPaymentError(null);

    // 1. Instant local update for snappy UI
    setHasPaidLocal(prev => Array.from(new Set([...prev, userId])));

    // 2. Persist to messages table to survive reloads cleanly
    await supabase.from('messages').insert({
      room_id: roomId,
      content: `__PAYMENT__:${userId}`,
      is_ai: true
    });

    // 3. Keep AI locked in payment
    await supabase.from('room_state').update({
      ai_status: 'payment'
    }).eq('room_id', roomId);
  };

  const handleRefund = async () => {
    if (!roomId || !user?.sub) return;
    const userId = user.sub;
    setPaymentError(null);

    setHasPaidLocal(prev => prev.filter(id => id !== userId));

    await supabase.from('messages').insert({
      room_id: roomId,
      content: `__REFUND__:${userId}`,
      is_ai: true
    });

    // For hackathon: just reset room entirely if someone refunds, unlocking it for everyone
    await supabase.from('room_state').update({
      ai_status: 'idle'
    }).eq('room_id', roomId);
    setAiStatus('idle');
  };

  const handleBook = async () => {
    if (!roomId || !user?.sub) return;
    if (!allPaid) return;
    if (aiStatus === 'booking' || aiStatus === 'booked') return;

    setPaymentError(null);
    setShowCheckoutModal(false);
    setShowBookingModal(true);

    // Mark bookable items as booked (mock) and persist via __TRIP_DATA__
    try {
      const bookingTime = new Date().toISOString();
      const pendingCards = (Array.isArray(cards) ? cards : []).map((c: any) => {
        const needsBooking = !!(c?.data?.bookingUrl || (typeof c?.data?.price === 'number' && c.data.price > 0));
        if (!needsBooking) return c;
        const reference = `ADY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        return {
          ...c,
          data: {
            ...c.data,
            bookingStatus: 'pending',
            bookingProvider: 'mock',
            bookingReference: reference,
            bookingConfirmedAt: bookingTime,
          },
        };
      });

      bookingQueueRef.current = pendingCards
        .filter((c: any) => c?.data?.bookingStatus === 'pending')
        .map((c: any) => c.id);

      setCards(pendingCards);
      if (trip) setTrip({ ...(trip as any), cards: pendingCards });
    } catch (e) {
      console.warn('[Book] Failed to persist booked cards:', e);
    }

    // Kick off booking animation / shared state
    await supabase.from('room_state').update({
      ai_status: 'booking',
      last_prompted_by: user.sub,
    }).eq('room_id', roomId);

    setAiStatus('booking');
    setAiPromptedBy(user.sub);
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
    const layerMatch =
      activeLayer === 'all' ? true :
        activeLayer === 'flight' ? (c?.type === 'transport' && (c as any)?.data?.mode === 'flight') :
          activeLayer === 'transport' ? (c?.type === 'transport' && (c as any)?.data?.mode !== 'flight') :
            c?.type === activeLayer;
    return dayMatch && layerMatch;
  });

  // Dynamic Budget Calculation
  const calculatedBudgetUsed = safeCards.reduce((sum, card) => sum + (card?.data?.price || 0), 0);
  const estimatedBudget = trip?.summary?.estimatedBudget || (calculatedBudgetUsed > 0 ? Math.ceil(calculatedBudgetUsed * 1.2 / 500) * 500 : 2500);
  const budgetProgress = estimatedBudget > 0 ? Math.min((calculatedBudgetUsed / estimatedBudget) * 100, 100) : 0;

  const someOnePaid = hasPaidLocal.length > 0;
  const allPaid = members.length > 0 && hasPaidLocal.length === members.length;
  const splitTotal = members.length > 0 ? (calculatedBudgetUsed / members.length) : calculatedBudgetUsed;
  const myMemberHasPaid = user?.sub ? hasPaidLocal.includes(user.sub) : false;

  // Booking starts explicitly via the "Book" button after all members pay.


  // Layer Subtotals
  const stayCards = safeCards.filter(c => c?.type === 'stay');
  const stayCost = stayCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);
  const activityCards = safeCards.filter(c => c?.type === 'activity');
  const activityCost = activityCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);
  const flightCards = safeCards.filter(c => c?.type === 'transport' && (c as any)?.data?.mode === 'flight');
  const flightCost = flightCards.reduce((sum, c) => sum + (c?.data?.price || 0), 0);
  const transportCards = safeCards.filter(c => c?.type === 'transport' && (c as any)?.data?.mode !== 'flight');
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
              <LayerItem icon={BedDouble} label="Stays" value={stayCost === 0 ? "Free" : `${stayCards.length} • ${formatMoney(stayCost)} `} color="text-orange-400" active={activeLayer === 'stay'} onClick={() => setActiveLayer('stay')} />
              <LayerItem icon={Camera} label="Activities" value={activityCost === 0 ? "Free" : `${activityCards.length} • ${formatMoney(activityCost)} `} color="text-blue-400" active={activeLayer === 'activity'} onClick={() => setActiveLayer('activity')} />
              <LayerItem icon={Plane} label="Flights" value={flightCost === 0 ? "Free" : `${flightCards.length} • ${formatMoney(flightCost)} `} color="text-sky-400" active={activeLayer === 'flight'} onClick={() => setActiveLayer('flight')} />
              <LayerItem icon={Train} label="Transport" value={transportCost === 0 ? "Free" : `${transportCards.length} • ${formatMoney(transportCost)} `} color="text-emerald-400" active={activeLayer === 'transport'} onClick={() => setActiveLayer('transport')} />
              <LayerItem icon={CreditCard} label="Total Cost" value={calculatedBudgetUsed === 0 ? "Free" : `${formatMoney(calculatedBudgetUsed)} `} color="text-purple-400" />
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
                  <span className="text-xs font-bold opacity-80">{calculatedBudgetUsed === 0 ? "Free" : `${formatMoney(calculatedBudgetUsed)} `}</span>
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
                        <span className="text-xs font-bold opacity-80">{dayCost === 0 ? "Free" : `${formatMoney(dayCost)} `}</span>
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
                                      card.type === 'transport'
                                        ? (card.data.mode === 'flight' ? "bg-sky-500/10 text-sky-500" : "bg-emerald-500/10 text-emerald-500")
                                        : "bg-sidebar-accent/50 text-foreground"
                                    )}>
                                      {card.type === 'stay' ? <BedDouble className="h-3 w-3" /> :
                                        card.type === 'activity' ? <Camera className="h-3 w-3" /> :
                                          card.data.mode === 'flight' ? <Plane className="h-3 w-3" /> :
                                            card.data.mode === 'walking' ? <Footprints className="h-3 w-3" /> :
                                              card.data.mode === 'driving' ? <Car className="h-3 w-3" /> :
                                                card.data.mode === 'bicycling' ? <Bike className="h-3 w-3" /> :
                                                  <Train className="h-3 w-3" />
                                      }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className={cn(
                                        "text-xs font-medium block truncate transition-colors",
                                        card.type === 'transport'
                                          ? (card.data.mode === 'flight' ? "text-sky-500/80 group-hover/timeline:text-sky-500" : "text-emerald-500/80 group-hover/timeline:text-emerald-500")
                                          : "text-foreground group-hover/timeline:text-primary"
                                      )}>
                                        {card.name}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground block truncate">
                                        {card.type === 'transport' && card.data.mode && (
                                          card.data.mode === 'flight'
                                            ? 'Flight • '
                                            : (card.data.mode.charAt(0).toUpperCase() + card.data.mode.slice(1) + " • ")
                                        )}
                                        {card.data.price === 0 ? "Free" : `${formatMoney(card.data.price || 0)} `}
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
            <img
              src={user?.picture || DEFAULT_AVATAR_URL}
              alt="Profile"
              className="h-8 w-8 rounded-full border border-sidebar-border object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_URL;
              }}
            />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                {getBestMyDisplayName()}
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
        <header className="h-14 bg-background/80 backdrop-blur-md border-b border-border absolute top-0 left-0 right-0 z-30 flex items-center gap-4 px-4">
          {/* Trip Title & Status */}
          <div className="flex items-center gap-4 shrink-0">
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
          <div className="flex-1 flex justify-center min-w-0">
            <div className="flex items-center bg-muted p-1 rounded-lg border border-border/50">
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
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4 shrink-0" >
            {/* Budget Bar */}
            {/* Budget Bar */}
            <div className="hidden xl:flex items-center gap-3 bg-muted px-3 py-1.5 rounded-full border border-border/10 shrink-0">
              <div className="text-xs font-medium">
                <span className="text-foreground">${calculatedBudgetUsed.toFixed(2)}</span>
                <span className="text-muted-foreground"> / ${estimatedBudget.toFixed(2)}</span>
              </div>
              <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${budgetProgress}% ` }} />
              </div>
            </div>

            <ModeToggle />

            {(aiStatus === 'idle' || aiStatus === 'payment') && (
              allPaid ? (
                <Button
                  onClick={handleBook}
                  size="sm"
                  disabled={!isOwner}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs gap-2 disabled:opacity-60"
                >
                  <Zap className="h-3 w-3" /> {isOwner ? 'Book' : 'Waiting to book'}
                </Button>
              ) : (
                <Button
                  onClick={() => setShowCheckoutModal(true)}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs gap-2"
                >
                  <CreditCard className="h-3 w-3" /> Checkout
                </Button>
              )
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
                            card.type === 'activity' ? "bg-blue-500" : ((card as any)?.data?.mode === 'flight' ? "bg-sky-500" : "bg-emerald-500")
                        )}>
                          {card.type === 'stay' ? <BedDouble className="h-4 w-4" /> :
                            card.type === 'activity' ? <Camera className="h-4 w-4" /> :
                              ((card as any)?.data?.mode === 'flight' ? <Plane className="h-4 w-4" /> : <Train className="h-4 w-4" />)
                          }
                        </div>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/50" />
                      </div>
                    </MarkerContent>
                    <MarkerPopup className="bg-[#1e1e1e] border border-white/10 p-4 rounded-xl shadow-2xl min-w-[220px]">
                      <div className="rounded-lg overflow-hidden border border-white/10 mb-3">
                        <img
                          src={getOptimizedImageUrl(getCardImageUrl(card), 440, 220)}
                          alt={card.name}
                          className="h-24 w-full object-cover"
                          loading="lazy"
                          onError={(e) => ensureImgFallback(e.currentTarget, getPlaceholderImageUrl(String(card?.name || card?.data?.name || 'Location'), 440, 220))}
                        />
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={cn(
                          "text-[10px] uppercase border-0 bg-opacity-20",
                          card.type === 'stay' ? "bg-orange-500 text-white" :
                            card.type === 'activity' ? "bg-blue-500 text-white" : ((card as any)?.data?.mode === 'flight' ? "bg-sky-500 text-white" : "bg-emerald-500 text-white")
                        )}>
                          {card.type === 'transport' && (card as any)?.data?.mode === 'flight' ? 'flight' : card.type}
                        </Badge>
                        <span className="text-[10px] text-gray-500">Day {card.day}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">{card.name}</h4>
                      {card.data.price !== undefined && (
                        <p className="text-xs text-gray-400 mb-2">
                          {card.data.price === 0 ? "Free" : `${formatMoney(card.data.price)} per person`}
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

              {/* Hotel option markers (during stay selection) */}
              {showHotelsModal && hotels.map((h, idx) => (
                typeof h.latitude === 'number' && typeof h.longitude === 'number' ? (
                  <MapMarker
                    key={`hotel-option-${idx}`}
                    latitude={h.latitude}
                    longitude={h.longitude}
                  >
                    <MarkerContent>
                      <div
                        className="relative group/marker cursor-pointer transition-transform hover:scale-110"
                        onClick={() => selectHotel(h)}
                        title={`Select ${h.name}`}
                      >
                        <div className="h-7 w-7 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white bg-orange-500">
                          <BedDouble className="h-3.5 w-3.5" />
                        </div>
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/50" />
                      </div>
                    </MarkerContent>
                  </MapMarker>
                ) : null
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
                      <span className="text-2xl font-serif text-foreground">${calculatedBudgetUsed.toFixed(2)}</span>
                      <span className="text-xs uppercase tracking-wider">Total Cost</span>
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
                                      <div className="flex items-center gap-2">
                                        {card?.data?.bookingStatus === 'pending' && (
                                          <Badge variant="outline" className="text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
                                            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500/30 border-t-amber-600 animate-spin" />
                                            Booking
                                          </Badge>
                                        )}
                                        {card?.data?.bookingStatus === 'booked' && (
                                          <Badge variant="outline" className="text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                                            <Check className="h-3 w-3" /> Booked
                                          </Badge>
                                        )}
                                        <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-1 rounded-md">
                                          {card.data.price === 0 || !card.data.price ? "Free" : `${formatMoney(card.data.price)}`}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2 md:line-clamp-none">{card.data.description}</div>
                                  </div>

                                  <div className="rounded-xl overflow-hidden h-40 w-full mt-1 border border-border/30 shadow-inner">
                                    <img
                                      src={getOptimizedImageUrl(getCardImageUrl(card), 800, 400)}
                                      alt={card.name}
                                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                      loading="lazy"
                                      onError={(e) => ensureImgFallback(e.currentTarget, getPlaceholderImageUrl(String(card?.name || card?.data?.name || 'Location'), 800, 400))}
                                    />
                                  </div>


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
      <aside className="w-[380px] bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 z-20" >
        {/* Tabs */}
        <div className="flex items-center p-2 border-b border-sidebar-border" >
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
                    <p className="text-2xl font-black tracking-tighter">${calculatedBudgetUsed.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Per Person</p>
                    <p className="text-lg font-black text-primary tracking-tighter">${splitTotal.toFixed(2)}</p>
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
                              item.type === 'activity' ? "bg-blue-500/10 text-blue-500" : ((item as any)?.data?.mode === 'flight' ? "bg-sky-500/10 text-sky-500" : "bg-emerald-500/10 text-emerald-500")
                          )}>
                            {item.type === 'stay' ? <BedDouble className="h-4 w-4" /> : item.type === 'activity' ? <Camera className="h-4 w-4" /> : ((item as any)?.data?.mode === 'flight' ? <Plane className="h-4 w-4" /> : <Train className="h-4 w-4" />)}
                          </div>
                          <div>
                            <p className="text-xs font-bold truncate max-w-[150px]">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{item.type === 'transport' && (item as any)?.data?.mode === 'flight' ? 'flight' : item.type}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-foreground">{formatMoney(item.data.price || 0)}</span>
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
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] font-black uppercase h-5 text-muted-foreground/60">Pending</Badge>
                          {isOwner && m.user_id !== user?.sub && (
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 shrink-0" onClick={(e) => {
                              e.stopPropagation();
                              supabase.from('room_members').delete().eq('id', m.id).then();
                            }}>
                              <span className="text-xs leading-none">&times;</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {(aiStatus === 'idle' || aiStatus === 'payment') && cart.length > 0 && (
                  allPaid ? (
                    <Button
                      onClick={handleBook}
                      disabled={!isOwner}
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg disabled:opacity-60"
                    >
                      {isOwner ? 'Book' : 'Waiting to book'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowCheckoutModal(true)}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                    >
                      Initiate Checkout flow
                    </Button>
                  )
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

              <div className="border border-border/50 rounded-xl p-4 space-y-3 bg-card">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-bold">Arrival airport</h4>
                </div>
                <p className="text-[11px] text-muted-foreground">Used as planning context when flights are skipped or unknown.</p>
                <div className="relative">
                  <input
                    value={arrivalAirportEdit}
                    onChange={(e) => setArrivalAirportEdit(e.target.value.toUpperCase())}
                    placeholder="e.g. YYZ or Toronto"
                    disabled={aiStatus === 'booked'}
                    className="w-full px-3 py-2 text-xs bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground disabled:opacity-60"
                  />
                  {arrivalAirportSuggestions.length > 0 && arrivalAirportEdit.trim().length >= 2 && aiStatus !== 'booked' && (
                    <div className="absolute z-20 mt-2 w-full bg-popover border border-border/60 rounded-lg overflow-hidden shadow-xl">
                      {arrivalAirportSuggestions.slice(0, 8).map((a) => (
                        <button
                          key={`${a.code}-${a.name}`}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between"
                          onClick={() => {
                            setArrivalAirportEdit(String(a.code || '').toUpperCase());
                            setArrivalAirportSuggestions([]);
                          }}
                        >
                          <span className="font-bold">{a.code}</span>
                          <span className="text-muted-foreground truncate ml-2">{a.city ? `${a.city} — ` : ''}{a.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveArrivalAirport}
                    disabled={aiStatus === 'booked' || savingArrivalAirport || !arrivalAirportEdit.trim()}
                    className="h-8 text-xs px-3"
                  >
                    {savingArrivalAirport ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setArrivalAirportEdit(String(trip?.arrivalAirport || ''));
                      setArrivalAirportSuggestions([]);
                    }}
                    disabled={aiStatus === 'booked'}
                    className="h-8 text-xs px-3"
                  >
                    Reset
                  </Button>
                  {aiStatus === 'booked' && (
                    <span className="text-[11px] text-muted-foreground">Trip is finalized (view only)</span>
                  )}
                </div>
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
                          {msg.sender_id === user?.sub ? (
                            <img
                              src={user?.picture || DEFAULT_AVATAR_URL}
                              alt="Avatar"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_URL;
                              }}
                            />
                          ) : (
                            <img
                              src={senderProfile?.avatar_url || DEFAULT_AVATAR_URL}
                              alt="Avatar"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_URL;
                              }}
                            />
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
                  disabled={aiStatus === 'booked' || aiStatus === 'payment' || someOnePaid}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder={aiStatus === 'booked' ? "Trip is finalized (View Only)" : (aiStatus === 'payment' || someOnePaid) ? "Bot locked (Payment in progress)" : aiStatus === 'thinking' ? "Adealy is thinking... (you can chat, just avoid @Adealy)" : aiStatus === 'booking' ? "Booking in progress... (you can chat)" : aiStatus === 'cooldown' ? "Cooling down... (you can chat)" : activeTab === 'saved' ? "Use saved items to generate plan..." : "Mention @Adealy to plan trip..."}
                  className="w-full bg-muted border border-border/10 rounded-xl p-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground min-h-[50px] max-h-[120px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || aiStatus === 'booked' || aiStatus === 'payment' || someOnePaid}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCheckoutModal(false)}>
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
                    <p className="text-2xl font-serif font-bold text-foreground">${calculatedBudgetUsed.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Per Person ({members.length})</p>
                    <p className="text-lg font-bold text-emerald-500">${splitTotal.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {aiStatus === 'idle' ? (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-500 text-xs leading-relaxed">
                    <strong>Notice:</strong> This trip has {members.length} members. Starting checkout will lock the trip planning and require everyone to pay their share of ${splitTotal.toFixed(2)}.
                  </div>
                  <Button onClick={handleCheckout} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-xl font-bold text-base shadow-lg shadow-emerald-500/20">
                    Start Shared Payment
                  </Button>
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
                            <div className="flex items-center gap-2">
                              {hasPaidLocal.includes(m.user_id) ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-bold uppercase gap-1">
                                  <Check className="h-3 w-3" /> Paid
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] font-bold uppercase bg-muted/50 text-muted-foreground">Pending</Badge>
                              )}
                              {isOwner && m.user_id !== user?.sub && (
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 ml-1" onClick={(e) => {
                                  e.stopPropagation();
                                  supabase.from('room_members').delete().eq('id', m.id).then();
                                }}>
                                  <span className="text-lg leading-none">&times;</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!myMemberHasPaid ? (
                    <Button onClick={handlePay} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-xl font-bold text-base shadow-lg shadow-emerald-500/20 gap-2">
                      Pay My Share (${splitTotal.toFixed(2)})
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

                  {allPaid && (
                    <Button
                      onClick={handleBook}
                      disabled={!isOwner}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 rounded-xl font-bold text-base shadow-lg disabled:opacity-60"
                    >
                      {isOwner ? 'Book' : 'Waiting for host to book'}
                    </Button>
                  )}
                </div>
              )}

              <p className="text-[10px] text-center text-muted-foreground italic px-4">
                Once everyone has paid, the host can click Book to finalize (mock) bookings.
              </p>
            </div>
          </div>
        )
      }

      {/* Booking Modal Overlay */}
      {showBookingModal && aiStatus === 'booking' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowBookingModal(false)}>
          <div className="bg-sidebar border border-sidebar-border rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-lg">Adealy is booking (mock)</h2>
                <p className="text-xs text-muted-foreground">We’ll “book” flights/hotels/activities and update the itinerary live.</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowBookingModal(false)}>
                Hide
              </Button>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <span className="text-sm font-bold">Booking in progress</span>
                </div>
                {streamStatus && (
                  <span className="text-xs text-muted-foreground">Step {streamStatus.step} / {streamStatus.total}</span>
                )}
              </div>
              {streamStatus?.message && (
                <div className="text-xs text-muted-foreground">{streamStatus.message}</div>
              )}
              {streamStatus && streamStatus.total > 0 && (
                <div className="h-2 bg-background rounded-full overflow-hidden border border-border/40">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, (streamStatus.step / streamStatus.total) * 100))}%` }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Itinerary booking status</h3>
              {(Array.isArray(cards) ? cards : [])
                .filter((c: any) => c?.data?.bookingStatus === 'pending' || c?.data?.bookingStatus === 'booked')
                .map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-card border border-border/50 rounded-xl">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{c.type}</div>
                    </div>
                    {c?.data?.bookingStatus === 'pending' ? (
                      <Badge variant="outline" className="text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1 shrink-0">
                        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500/30 border-t-amber-600 animate-spin" />
                        Booking
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 shrink-0">
                        <Check className="h-3 w-3" /> Booked
                      </Badge>
                    )}
                  </div>
                ))}
            </div>

            <p className="text-[10px] text-muted-foreground italic">You can keep chatting while this runs (just don’t mention @Adealy).</p>
          </div>
        </div>
      )}

      {/* Hotels Modal Overlay */}
      {showHotelsModal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50" onClick={() => setShowHotelsModal(false)}>
          <div className="bg-sidebar border border-sidebar-border rounded-2xl p-6 w-full max-w-3xl shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-lg">Find stays (Hotels API)</h2>
                <p className="text-xs text-muted-foreground">Pulls live results from the backend scraper and opens Booking.com links.</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowHotelsModal(false)}>
                Close
              </Button>
            </div>

            {hotelsError && (
              <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-rose-500 text-xs text-center font-bold">
                {hotelsError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Location</label>
                <input
                  value={hotelsQuery.location}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, location: e.target.value }))}
                  placeholder="Toronto, ON"
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Check-in</label>
                <input
                  type="date"
                  value={hotelsQuery.checkin}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, checkin: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Check-out</label>
                <input
                  type="date"
                  value={hotelsQuery.checkout}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, checkout: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Adults</label>
                <input
                  type="number"
                  min={1}
                  value={hotelsQuery.adults}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, adults: Number(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Children</label>
                <input
                  type="number"
                  min={0}
                  value={hotelsQuery.children}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, children: Number(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Rooms</label>
                <input
                  type="number"
                  min={1}
                  value={hotelsQuery.rooms}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, rooms: Number(e.target.value) }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Currency</label>
                <input
                  value={hotelsQuery.currency}
                  onChange={(e) => setHotelsQuery(q => ({ ...q, currency: e.target.value.toUpperCase() }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <Button onClick={runHotelsSearch} disabled={hotelsLoading} className="h-11 font-black uppercase tracking-widest">
                {hotelsLoading ? 'Searching…' : 'Search Hotels'}
              </Button>
              {hotelsSearchUrl && (
                <a
                  href={hotelsSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-500 hover:text-blue-400"
                >
                  Open full results on Booking.com
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
              {hotels.length === 0 && !hotelsLoading ? (
                <div className="md:col-span-2 h-28 flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  No results yet — run a search.
                </div>
              ) : (
                hotels.map((h, idx) => (
                  <div key={idx} className="bg-card border border-border/50 rounded-xl overflow-hidden">
                    <div className="h-40 bg-muted">
                      <img
                        src={getOptimizedImageUrl(h.image || `https://source.unsplash.com/800x400/?hotel,${encodeURIComponent(h.name || 'hotel')}`, 800, 400)}
                        alt={h.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => ensureImgFallback(e.currentTarget, getPlaceholderImageUrl(h.name || 'Hotel', 800, 400))}
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black truncate">{h.name}</div>
                          <div className="text-[11px] text-muted-foreground line-clamp-2">{h.address || h.distanceFromCenter || ''}</div>
                        </div>
                        {typeof h.rating === 'number' && (
                          <Badge variant="outline" className="text-[10px] font-black uppercase bg-blue-500/10 text-blue-500 border-blue-500/20 shrink-0">
                            {h.rating.toFixed(1)}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Price</span>
                        <span className="font-bold text-foreground">{h.priceTotal || h.pricePerNight || '—'}</span>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          className="h-9 text-xs font-black uppercase tracking-widest"
                          onClick={() => selectHotel(h)}
                        >
                          Select
                        </Button>
                        {h.bookingUrl ? (
                          <a
                            href={h.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1"
                          >
                            <Button className="w-full h-9 text-xs font-black uppercase tracking-widest gap-2">
                              <ExternalLink className="h-3 w-3" /> Open
                            </Button>
                          </a>
                        ) : (
                          <Button disabled className="flex-1 h-9 text-xs font-black uppercase tracking-widest">
                            No link
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
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
