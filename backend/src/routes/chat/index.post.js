const { GoogleGenAI } = require('@google/genai');
const { supabase } = require('../../supabase/client');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

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

Use realistic locations, coordinates, and prices for whatever the user requested. If any properties don't make sense to include, you can omit them, but keep the core ones like id, type, layer, day (int), name, position, and data.`;

async function handler(req, res) {
    // We are no longer using SSE directly to the frontend because we rely on Supabase Realtime!
    // But we still return a response so the client knows we received it.

    const { room_id, prompt, auth0_id } = req.body || {};

    if (!room_id || !prompt || !auth0_id) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    // Acknowledge receipt immediately so the client can stop loading
    res.status(200).json({ success: true, message: "Request received." });

    // Ensure the message has @Adealy before proceeding
    // Check if @adealy is mentioned (case-insensitive)
    if (!prompt.toLowerCase().includes('@adealy')) {
        console.log('No @adealy mention found in prompt, skipping AI.');
        return;
    }

    try {
        console.log('AI pipeline started...');
        // 1. Fetch room state for cooldown check
        const { data: room, error: roomError } = await supabase
            .from('room_state')
            .select('*')
            .eq('room_id', room_id)
            .single();

        if (roomError || !room) {
            console.error('Room state fetch error:', roomError);
            return;
        }

        // Optional: Implement cooldown logic here if needed

        // 2. Update room state to reflect active prompt
        await supabase
            .from('room_state')
            .update({
                last_prompted_at: new Date().toISOString(),
                last_prompted_by: auth0_id,
                ai_status: 'thinking'
            })
            .eq('room_id', room_id);

        // 3. Fetch conversation history
        console.log('Fetching conversation history for room:', room_id);
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('is_ai, content')
            .eq('room_id', room_id)
            .order('created_at', { ascending: true })
            .limit(50);

        if (messagesError) {
            console.error('Error fetching history:', messagesError);
            return;
        }

        // 4. Generate AI response
        const contents = (messages || []).map(m => ({
            role: m.is_ai ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        console.log('Calling Gemini API...');
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });
        console.log('Gemini API response received.');

        const geminiResponseText = result.text;

        // Ensure parsing works
        let finalMessage = "I processed your request, but couldn't format it right.";
        let tripData = null;
        try {
            const parsed = JSON.parse(geminiResponseText || '{}');
            finalMessage = parsed.message || finalMessage;
            tripData = parsed.trip || null;
        } catch (e) {
            console.error("Failed to parse AI response", e);
            finalMessage = geminiResponseText;
        }

        // We will insert 2 messages: the message string, and potentially a hidden message string with JSON payload for cards
        await supabase.from('messages').insert({
            room_id,
            content: finalMessage,
            is_ai: true
        });

        if (tripData) {
            // Send the raw trip data as a JSON string so frontend can parse and load the trip 
            // In a real app we'd save this to a trips table, but for now we'll put it in the chat
            await supabase.from('messages').insert({
                room_id,
                content: `__TRIP_DATA__:${JSON.stringify(tripData)}`,
                is_ai: true
            });
        }

        // 4. Set state to cooldown
        await supabase.from('room_state').update({
            ai_status: 'cooldown',
            updated_at: new Date().toISOString()
        }).eq('room_id', room_id);

        // 5. Release Cooldown after 5 seconds
        setTimeout(async () => {
            await supabase.from('room_state').update({
                ai_status: 'idle',
                updated_at: new Date().toISOString()
            }).eq('room_id', room_id);
        }, 5000);

    } catch (error) {
        console.error("Error in AI pipeline:", error);
        await supabase.from('room_state').update({
            ai_status: 'idle',
            updated_at: new Date().toISOString()
        }).eq('room_id', room_id);
    }
}

module.exports = { handler, method: 'post' };
