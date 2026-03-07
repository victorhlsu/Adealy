import type { StreamChunk, TripCard } from "@/types/trip";

const MOCK_TRIP_ID = "trip_abc123";

const MOCK_CARDS: TripCard[] = [
    {
        id: "card_stay_001",
        type: "stay",
        layer: "stays",
        day: 1,
        name: "Tawaraya Ryokan",
        position: { lat: 35.0116, lng: 135.7681 },
        data: {
            checkIn: "2026-03-15",
            checkOut: "2026-03-17",
            nights: 2,
            pricePerNight: 850,
            totalPrice: 1700,
            rating: 4.9,
            imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1000",
            address: "278 Nakahakusancho, Nakagyo Ward",
            amenities: ["Private onsen", "Kaiseki dinner", "Garden view"],
            description: "Historic ryokan in central Kyoto"
        }
    },
    {
        id: "card_act_001",
        type: "activity",
        layer: "activities",
        day: 1,
        name: "Fushimi Inari Shrine",
        position: { lat: 34.9671, lng: 135.7727 },
        data: {
            date: "2026-03-15",
            startTime: "09:00",
            duration: 120,
            endTime: "11:00",
            price: 0,
            rating: 4.8,
            imageUrl: "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&q=80&w=1000",
            category: "temple",
            description: "Famous shrine with thousands of torii gates",
            tips: "Go early to avoid crowds."
        }
    },
    {
        id: "card_trans_001",
        type: "transport",
        layer: "transport",
        day: 1,
        name: "Tawaraya Ryokan → Fushimi Inari",
        position: { lat: 35.0116, lng: 135.7681 }, // simplified
        data: {
            from: { name: "Tawaraya Ryokan", lat: 35.0116, lng: 135.7681, cardId: "card_stay_001" },
            to: { name: "Fushimi Inari Shrine", lat: 34.9671, lng: 135.7727, cardId: "card_act_001" },
            mode: "transit",
            departureTime: "08:30",
            arrivalTime: "09:00",
            duration: 30,
            price: 240,
            connectsCards: ["card_stay_001", "card_act_001"],
            route: {
                steps: [],
                polyline: "encoded_polyline_here"
            }
        }
    }
];

export const mockStreamGenerator = async function* (_prompt: string): AsyncGenerator<StreamChunk, void, unknown> {
    yield { type: 'progress', message: 'Analyzing your request...', step: 1, totalSteps: 5 };
    await new Promise(r => setTimeout(r, 800));

    yield { type: 'progress', message: 'Finding best stays in Kyoto...', step: 2, totalSteps: 5 };
    await new Promise(r => setTimeout(r, 800));

    yield { type: 'card_created', layer: 'stays', card: MOCK_CARDS[0] };
    await new Promise(r => setTimeout(r, 600));

    yield { type: 'progress', message: 'Scheduling activities...', step: 3, totalSteps: 5 };
    await new Promise(r => setTimeout(r, 800));

    yield { type: 'card_created', layer: 'activities', card: MOCK_CARDS[1] };
    await new Promise(r => setTimeout(r, 600));

    yield { type: 'card_created', layer: 'transport', card: MOCK_CARDS[2] };
    await new Promise(r => setTimeout(r, 800));

    yield {
        type: 'complete',
        message: "I've created a 5-day cultural journey through Kyoto. Your trip includes traditional ryokans, major temples, and authentic dining experiences.",
        trip: {
            tripId: MOCK_TRIP_ID,
            title: "Kyoto Cultural Journey",
            destination: "Kyoto, Japan",
            startDate: "2026-03-15",
            endDate: "2026-03-20",
            days: 5,
            summary: {
                totalStays: 1,
                totalActivities: 1,
                totalTransport: 1,
                totalBudget: 1940,
                estimatedBudget: 3500,
                budgetUsed: 55
            },
            cards: MOCK_CARDS,
            itinerary: [
                {
                    day: 1,
                    date: "2026-03-15",
                    title: "Arrival & Temple Exploration",
                    cardIds: ["card_stay_001", "card_trans_001", "card_act_001"],
                    totalBudget: 1940
                }
            ]
        }
    };
};
