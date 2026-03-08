export type Position = {
    lat: number;
    lng: number;
    x?: number;
    y?: number;
};

export type CardType = 'stay' | 'activity' | 'transport';

export type TripCardData = {
    // Common fields
    name?: string;
    description?: string;
    imageUrl?: string; // or photo
    placeId?: string;
    price?: number;
    rating?: number;

    // Stay specific
    checkIn?: string;
    checkOut?: string;
    nights?: number;
    pricePerNight?: number;
    totalPrice?: number;
    amenities?: string[];
    bookingUrl?: string;
    address?: string;

    // Activity specific
    date?: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    category?: string;
    tips?: string;

    // Transport specific
    from?: {
        name: string;
        lat: number;
        lng: number;
        cardId: string;
    };
    to?: {
        name: string;
        lat: number;
        lng: number;
        cardId: string;
    };
    mode?: 'transit' | 'driving' | 'walking' | 'bicycling' | 'flight' | 'train' | 'bus';
    departureTime?: string;
    arrivalTime?: string;
    distance?: number;
    route?: {
        steps: {
            instruction: string;
            distance?: number;
            duration?: number;
            line?: string;
            stops?: number;
        }[];
        polyline?: string;
    };
    routeGeometry?: any;
    connectsCards?: string[];

    // Booking (optional)
    bookingStatus?: 'unbooked' | 'pending' | 'booked' | 'failed';
    bookingProvider?: string;
    bookingReference?: string;
    bookingConfirmedAt?: string;
};

export type TripCard = {
    id: string;
    type: CardType;
    layer: 'stays' | 'activities' | 'transport';
    day: number;
    name?: string; // Sometimes at top level
    position?: Position;
    data: TripCardData;
};

export type TripMetadata = {
    tripId: string;
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    days: number;
    arrivalAirport?: string;
    summary?: {
        totalStays: number;
        totalActivities: number;
        totalTransport: number;
        totalBudget: number;
        estimatedBudget: number;
        budgetUsed: number;
    };
    bounds?: {
        north: number;
        south: number;
        east: number;
        west: number;
    };
    currency?: string;
    country?: string;
    visaRequirement?: 'visa-free' | 'visa-on-arrival' | 'visa-required' | 'other';
    visaDetails?: string;
};

export type Trip = TripMetadata & {
    cards: TripCard[];
    itinerary: {
        day: number;
        date: string;
        title: string;
        cardIds: string[];
        totalBudget: number;
    }[];
};

// Streaming Response Types
export type StreamChunk =
    | { type: 'progress'; message: string; step: number; totalSteps: number }
    | { type: 'card_created'; layer: string; card: TripCard }
    | { type: 'complete'; trip: Trip | null; message: string }
    | { type: 'session_id'; sessionId: string }
    | { type: 'error'; message: string };
