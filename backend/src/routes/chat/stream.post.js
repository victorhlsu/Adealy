const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase } = require('../../supabase/client');
// Environment variables are loaded in server.js

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const systemInstruction = `You are a travel planning assistant called Adealy. 
Your goal is to provide a comprehensive response to the user's travel request.
You must respond with a strict JSON object that contains two keys:
1. "message": A friendly conversational response to the user.
2. "trip": An optional trip object if the user asked to plan a trip or add things to a trip. If they are just chatting and no trip info makes sense, this can be null.

If you generate a trip, it MUST follow this specific JSON schema format exactly:
{
    "message": "I found some great options in Kyoto for you! Here is a day-by-day breakdown:\\n\\n**Day 1:** Arrive and explore the Gion district.\\n**Day 2:** Visit the historic shrines and enjoy local street food.",
    "trip": {
        "title": "Kyoto Cultural Journey",
        "destination": "Kyoto, Japan",
        "country": "Japan",
        "visaRequirement": "visa-free",
        "visaDetails": "Canadians can visit Japan visa-free for up to 90 days for tourism.",
        "startDate": "2026-03-15",
        "endDate": "2026-03-20",
        "days": 5,
        "summary": {
            "estimatedBudget": 3500,
            "budgetUsed": 1500
        },
        "cards": [
            {
                "id": "card_stay_001",
                "type": "stay",
                "layer": "stays",
                "day": 1,
                "name": "Tawaraya Ryokan",
                "position": { "lat": 35.0116, "lng": 135.7681 },
                "data": {
                    "price": 850,
                    "description": "Historic ryokan in central Kyoto",
                    "imageUrl": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1000",
                    "startTime": "15:00"
                }
            },
            {
                "id": "card_trans_001",
                "type": "transport",
                "layer": "transport",
                "day": 1,
                "name": "Transit to Shrine",
                "data": {
                    "mode": "transit",
                    "price": 2,
                    "startTime": "08:30",
                    "endTime": "09:00",
                    "from": { "name": "Tawaraya Ryokan", "lat": 35.0116, "lng": 135.7681, "cardId": "card_stay_001" },
                    "to": { "name": "Fushimi Inari Shrine", "lat": 34.9671, "lng": 135.7727, "cardId": "card_act_001" }
                }
            },
            {
                "id": "card_act_001",
                "type": "activity",
                "layer": "activities",
                "day": 1,
                "name": "Fushimi Inari Shrine",
                "position": { "lat": 34.9671, "lng": 135.7727 },
                "data": {
                    "startTime": "09:00",
                    "duration": 120,
                    "price": 0,
                    "description": "Famous shrine with thousands of torii gates",
                    "imageUrl": "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&q=80&w=1000"
                }
            }
        ]
    }
}

 Use realistic locations, coordinates, and prices for whatever the user requested. If any properties don't make sense to include, you can omit them, but keep the core ones like id, type, layer, day (int), name, position, and data.

CRITICAL INSTRUCTION - BUDGET AND FLIGHTS: If the user explicitly specifies a budget or budget range, you MUST set \`trip.summary.estimatedBudget\` strictly to that exact numeric amount WITHOUT ANY ROUNDING (e.g., if the user says 2576, it MUST be exactly 2576, NOT 2575). Otherwise, you MUST generate a realistic \`estimatedBudget\` based on the destination and duration. You MUST ALWAYS include at least one 'transport' card for round-trip flights or major transit to the destination, and include a realistic flight price in its \`data.price\` field. All cards with a monetary cost (stays, activities, flights, local transit) MUST have a realistic \`data.price\` number so the frontend can calculate the total budget accurately.

CRITICAL INSTRUCTION - VISA INFO: Always analyze the requested destination and provide the \`country\` name. Furthermore, determine the visa requirements for a Canadian passport holder visiting that country. Set \`visaRequirement\` strictly to one of: "visa-free", "visa-on-arrival", "visa-required", or "other". Provide a brief, helpful explanation in \`visaDetails\`.
Make sure you NEVER swap latitude (lat) and longitude (lng). Latitude must be between -90 and 90, and longitude between -180 and 180. For example, Tokyo is roughly lat: 35.68, lng: 139.69.

CRITICAL INSTRUCTION - TRAVEL AND TRANSPORT: 
 1. You MUST generate at least one stay card (hotel) for every single day of the trip.
 2. You MUST generate 'transport' cards between every sequential location (e.g., from Hotel to Activity 1, from Activity 1 to Activity 2, and from Activity 2 back to the Hotel).
 3. Each 'transport' card MUST include:
    - \`data.mode\`: 'transit', 'walking', 'driving', or 'bicycling'.
    - \`data.price\`: Realistic cost for that leg (e.g., 2.50 for bus, 25 for taxi, 0 for walking).
    - \`data.startTime\` and \`data.endTime\`: Exact times that bridge the gap between activities.
    - \`data.from\` and \`data.to\`: Objects containing 'name', 'lat', 'lng', and 'cardId' of the previous/next cards.
 4. For any event or transport that is free, you MUST set \`data.price\` to exactly 0. The UI will display this as "Free".
 5. Ensure outings are realistically achievable in a single day—allot sufficient time for travel (at least 30-60 mins between locations unless they are adjacent).
 6. Every day MUST start at the hotel, go to activities, and ALWAYS end with a final transport card back to the hotel.

 CRITICAL INSTRUCTION: You MUST generate at least one stay card AND at least one activity card for EVERY SINGLE DAY of the specified trip duration. Do not leave any days empty! If the user stays at the same hotel for multiple days, you must create a separate stay card for that hotel for EACH day they are there (e.g., day 1: hotel X, day 2: hotel X, etc.).
Ensure outings are realistically achievable in a single day—do NOT overpack the schedule. Include necessary travel time, and be sure to allocate time for the user to return to the hotel. Each card MUST include realistic 'startTime' and 'endTime' fields in 24-hour HH:MM format (e.g., 09:00, 14:30) so they can be displayed on a timeline.
In the "message" field of your JSON response, DO NOT output a summary or highlights of the trip. Just output a very brief and friendly message saying that you're done generating the itinerary (e.g., "I've planned out your trip!", "All done, your itinerary is ready!").`;

async function handler(req, res) {
    // SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Required to prevent connection timeout in some proxies
    res.flushHeaders();

    const { prompt, sessionId: reqSessionId } = req.body || {};
    let sessionId = reqSessionId;

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    if (!sessionId) {
        const { data: session, error } = await supabase.from('chat_sessions').insert({}).select().single();
        if (error) {
            console.error("Supabase create session error:", error);
            sendEvent({ type: 'progress', message: 'Database error', step: 1, totalSteps: 5 });
            res.end();
            return;
        }
        sessionId = session.id;
    }

    sendEvent({ type: 'session_id', sessionId });
    sendEvent({ type: 'progress', message: 'Analyzing your request...', step: 1, totalSteps: 5 });

    if (!prompt) {
        res.end();
        return;
    }

    // Save user message
    await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'user', content: prompt });

    // Get previous messages for history
    const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    if (messagesError) {
        console.error("Failed to load history:", messagesError);
    }

    // Format for Gemini SDK
    // The Gemini 2.5 SDK uses: ai.models.generateContent({ contents: '...', config: { systemInstruction: '...' } })
    // We construct the contents array properly.
    const contents = (messages || []).map(m => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    sendEvent({ type: 'progress', message: 'Consulting the oracle...', step: 2, totalSteps: 5 });

    let geminiResponseText;
    let keepAliveInterval = setInterval(() => {
        sendEvent({ type: 'progress', message: 'Building the perfect itinerary...', step: 3, totalSteps: 5 });
    }, 3000);

    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: systemInstruction + `\n\nIMPORTANT: The current date is ${new Date().toISOString().split('T')[0]}. All plans, recommendations, and trips MUST use dates in the future relative to this current date unless the user explicitly requests otherwise.`
        });

        const result = await model.generateContent({
            contents: contents,
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });
        geminiResponseText = result.response.text();
    } catch (e) {
        console.error("Gemini Generation Error:", e);
        sendEvent({ type: 'complete', message: "Sorry, I had an error talking to Gemini.", trip: null });
        clearInterval(keepAliveInterval);
        res.end();
        return;
    } finally {
        clearInterval(keepAliveInterval);
    }

    sendEvent({ type: 'progress', message: 'Finalizing response...', step: 4, totalSteps: 5 });

    // Save AI response to DB
    await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'ai', content: geminiResponseText });

    try {
        const parsed = JSON.parse(geminiResponseText || '{}');
        const textMessage = parsed.message || "Here are some details based on your request.";
        const trip = parsed.trip || null;

        if (trip && trip.cards) {
            for (const card of trip.cards) {
                sendEvent({ type: 'card_created', layer: card.layer || 'activities', card });
            }
        }

        sendEvent({ type: 'complete', message: textMessage, trip: trip });
    } catch (e) {
        console.error("Failed to parse Gemini JSON:", e);
        sendEvent({ type: 'complete', message: geminiResponseText, trip: null });
    }

    res.end();
}

module.exports = { handler, method: 'post' };
