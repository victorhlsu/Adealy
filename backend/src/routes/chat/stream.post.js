const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../../supabase/client');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const systemInstruction = `You are a travel planning assistant called Adealy. 
Your goal is to provide a comprehensive response to the user's travel request.
You must respond with a strict JSON object that contains two keys:
1. "message": A friendly conversational response to the user.
2. "trip": An optional trip object if the user asked to plan a trip or add things to a trip. If they are just chatting and no trip info makes sense, this can be null.

If you generate a trip, it MUST follow this specific JSON schema format exactly:
{
    "message": "I found some great options in Kyoto for you!",
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

CRITICAL INSTRUCTION - BUDGET AND FLIGHTS: If the user explicitly specifies a budget or budget range, you MUST set \`trip.summary.estimatedBudget\` strictly to that exact numeric amount WITHOUT ANY ROUNDING (e.g., if the user says 2576, it MUST be exactly 2576, NOT 2575). Otherwise, you MUST generate a realistic \`estimatedBudget\` based on the destination and duration. You MUST ALWAYS include at least one 'transport' card for round-trip flights or major transit to the destination, and include a realistic flight price in its \`data.price\` field. All cards with a monetary cost (stays, activities, flights) MUST have a realistic \`data.price\` number so the frontend can calculate the total budget accurately.

CRITICAL INSTRUCTION - VISA INFO: Always analyze the requested destination and provide the \`country\` name. Furthermore, determine the visa requirements for a Canadian passport holder visiting that country. Set \`visaRequirement\` strictly to one of: "visa-free", "visa-on-arrival", "visa-required", or "other". Provide a brief, helpful explanation in \`visaDetails\`.
Make sure you NEVER swap latitude (lat) and longitude (lng). Latitude must be between -90 and 90, and longitude between -180 and 180. For example, Tokyo is roughly lat: 35.68, lng: 139.69.

CRITICAL INSTRUCTION: You MUST generate at least one stay card AND at least one activity card for EVERY SINGLE DAY of the specified trip duration. Do not leave any days empty! If the user stays at the same hotel for multiple days, you must create a separate stay card for that hotel for EACH day they are there (e.g., day 1: hotel X, day 2: hotel X, etc.).`;

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
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });
        geminiResponseText = result.text;
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
