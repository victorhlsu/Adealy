const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase } = require('../../supabase/client');
const { jsonrepair } = require('jsonrepair');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function stripCodeFences(text) {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '');
    else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '');
    return cleaned.trim();
}

function extractLikelyJson(text) {
    const s = String(text || '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return s.slice(start, end + 1);
}

function safeParseGeminiJson(text) {
    const cleaned = stripCodeFences(text);

    const attempts = [];
    attempts.push(cleaned);
    const extracted = extractLikelyJson(cleaned);
    if (extracted && extracted !== cleaned) attempts.push(extracted);

    for (const a of attempts) {
        try {
            return JSON.parse(a);
        } catch {
            // try next strategy
        }

        try {
            const repaired = jsonrepair(a);
            return JSON.parse(repaired);
        } catch {
            // continue
        }
    }

    return null;
}

async function fetchOsrmRouteServer(coords, mode = 'driving') {
    if (!coords || coords.length < 2) return null;
    try {
        const pathStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
        const profile = mode === 'walking' ? 'foot' : mode === 'bicycling' ? 'bicycle' : 'driving';
        const url = `http://router.project-osrm.org/route/v1/${profile}/${pathStr}?overview=full&geometries=geojson`;
        
        // Dynamic import for node-fetch is not needed if we use global fetch (Node 18+)
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const json = await resp.json();
        return json?.routes?.[0]?.geometry || null;
    } catch (e) {
        console.error("OSRM fetch failed on backend:", e);
        return null;
    }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
                "id": "card_trans_000",
                "type": "transport",
                "layer": "transport",
                "day": 1,
                "name": "Arrive and Transit to Hotel",
                "position": { "lat": 35.5494, "lng": 139.7798 },
                "data": {
                    "mode": "transit",
                    "price": 20,
                    "description": "Limousine Bus from Haneda Airport to Hotel",
                    "startTime": "13:00",
                    "endTime": "14:30",
                    "from": { "name": "Haneda Airport (HND)", "lat": 35.5494, "lng": 139.7798, "cardId": "airport_HND" },
                    "to": { "name": "Tawaraya Ryokan", "lat": 35.0116, "lng": 135.7681, "cardId": "card_stay_001" }
                }
            },
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
                    "startTime": "15:00",
                    "endTime": "10:00"
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
                    "startTime": "16:00",
                    "endTime": "18:00",
                    "price": 0,
                    "description": "Famous shrine with thousands of torii gates",
                    "imageUrl": "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&q=80&w=1000"
                }
            }
        ]
    }
}

Use realistic locations, coordinates, and prices for whatever the user requested. If any properties don't make sense to include, you can omit them, but keep the core ones like id, type, layer, day (int), name, position, and data.

CRITICAL INSTRUCTION - MAP ROUTING AND DAILY SCHEDULE:
1. When generating a full trip, Day 1 MUST start with a 'transport' card depicting arrival from the region's main Airport to the Hotel.
2. The final Day MUST end with a 'transport' card depicting departure from the Hotel to the region's main Airport.
3. You MUST generate 'transport' cards between EVERY sequential location (e.g., Hotel -> Activity 1, Activity 1 -> Activity 2, Activity 2 -> Hotel). The day MUST begin and end at the Hotel.
4. Each 'transport' card MUST include \`data.from\` and \`data.to\`. These must contain exact 'lat' and 'lng' float coordinates, 'name', and 'cardId' linking them together. This is absolutely critical for the UI to draw OSRM routing lines on the Map.
5. Provide realistic \`startTime\` and \`endTime\` (HH:MM format) for EVERY card to ensure the schedule works.

CRITICAL INSTRUCTION - CLOUDINARY IMAGES:
For \`data.imageUrl\` on stays and activities, always prefer high-quality image URLs from sources like Unsplash. The frontend will automatically pipe these through Cloudinary for formatting, so provide raw, high resolution direct HTTPs image links.`;

function stripTripForModel(trip) {
    if (!trip || typeof trip !== 'object') return null;
    const safe = { ...trip };
    if (Array.isArray(safe.cards)) {
        safe.cards = safe.cards.map((card) => {
            const next = { ...card, data: { ...(card?.data || {}) } };
            // GeoJSON can be huge and isn't needed to edit a schedule.
            if (next?.data?.routeGeometry) delete next.data.routeGeometry;
            return next;
        });
    }
    return safe;
}

function extractLatestTripFromMessages(messages) {
    if (!Array.isArray(messages)) return null;
    let latest = null;
    for (const m of messages) {
        const c = String(m?.content || '');
        if (!c.startsWith('__TRIP_DATA__:')) continue;
        try {
            const json = JSON.parse(c.replace('__TRIP_DATA__:', ''));
            latest = json;
        } catch {
            // ignore parse errors
        }
    }
    return latest;
}

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

        // 2. Update room state
        await supabase
            .from('room_state')
            .update({
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
            .limit(120);

        if (messagesError) {
            console.error('Error fetching history:', messagesError);
            return;
        }

        const latestTripRaw = extractLatestTripFromMessages(messages || []);
        const latestTrip = stripTripForModel(latestTripRaw);

        // Filter out hidden/control messages so they don't pollute chat history.
        const visibleConversation = (messages || []).filter((m) => {
            const c = String(m?.content || '');
            if (c.startsWith('__TRIP_DATA__:')) return false;
            if (c.startsWith('__PAYMENT__:')) return false;
            if (c.startsWith('__REFUND__:')) return false;
            return true;
        });

        // 4. Generate AI response
        // Gemini strictly requires alternating roles starting with 'user'
        let formattedContents = [];
        for (const m of visibleConversation) {
            const role = m.is_ai ? 'model' : 'user';

            if (formattedContents.length === 0) {
                if (role === 'model') {
                    // Force the first message to be user to satisfy Gemini
                    formattedContents.push({ role: 'user', parts: [{ text: "[System Context: " + m.content + "]" }] });
                } else {
                    formattedContents.push({ role, parts: [{ text: m.content }] });
                }
                continue;
            }

            const lastItem = formattedContents[formattedContents.length - 1];
            if (lastItem.role === role) {
                // Merge consecutive messages of the same role
                lastItem.parts[0].text += "\\n\\n" + m.content;
            } else {
                formattedContents.push({ role, parts: [{ text: m.content }] });
            }
        }

        // Ensure the latest user turn includes the request prompt (which can contain rich client context)
        // without having to store that extra context in the DB.
        const reqPrompt = String(prompt || '').trim();
        if (reqPrompt) {
            if (formattedContents.length > 0) {
                const last = formattedContents[formattedContents.length - 1];
                if (last.role === 'user') {
                    const lastText = String(last.parts?.[0]?.text || '').trim();
                    if (lastText && reqPrompt.startsWith(lastText)) {
                        last.parts[0].text = reqPrompt;
                    } else {
                        formattedContents.push({ role: 'user', parts: [{ text: reqPrompt }] });
                    }
                } else {
                    formattedContents.push({ role: 'user', parts: [{ text: reqPrompt }] });
                }
            } else {
                formattedContents = [{ role: 'user', parts: [{ text: reqPrompt }] }];
            }
        }

        const contents = formattedContents;

        let userName = 'Traveler';
        try {
            const { data: userProfile } = await supabase.from('user_profiles').select('first_name').eq('auth0_id', auth0_id).single();
            if (userProfile && userProfile.first_name) {
                userName = userProfile.first_name;
            }
        } catch (err) {
            console.error('Failed to get user profile name:', err);
        }

        let dynamicSystemInstruction = systemInstruction + `\n\n-----------------\nYou are currently responding to a user named ${userName}. ALWAYS greet them personally by this name when introducing a plan or responding to an initial request!`;

        if (latestTrip) {
            dynamicSystemInstruction += `\n\n-----------------\nEXISTING TRIP CONTEXT (AUTHORITATIVE):\nThe room already has an itinerary. DO NOT regenerate a brand new trip unless the user explicitly asks to start over. Instead, make the MINIMUM changes needed to satisfy the latest request, preserving existing card ids/structure where possible.\n\nCurrent trip snapshot (JSON):\n${JSON.stringify(latestTrip)}`;
        }

        console.log('Calling Gemini API for user:', userName);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: dynamicSystemInstruction
        });

        const result = await model.generateContent({
            contents: contents,
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });
        console.log('Gemini API response received.');

        const geminiResponseText = result.response.text();

        // Ensure parsing works
        let finalMessage = "I processed your request, but couldn't format it right.";
        let tripData = null;
        const parsed = safeParseGeminiJson(geminiResponseText);
        if (parsed && typeof parsed === 'object') {
            finalMessage = parsed.message || finalMessage;
            tripData = parsed.trip || null;
        } else {
            // Don't fail the whole pipeline just because JSON formatting is slightly off.
            console.error('Failed to parse AI response as JSON (falling back to plain text).');
            finalMessage = stripCodeFences(geminiResponseText);
        }

        // We will insert 2 messages: the message string, and potentially a hidden message string with JSON payload for cards
        await supabase.from('messages').insert({
            room_id,
            content: finalMessage,
            is_ai: true
        });

        if (tripData && tripData.cards && Array.isArray(tripData.cards)) {
            // Pre-fetch OSRM geometries for all transport cards so the frontend gets them instantly
            console.log("Pre-fetching OSRM routes for transport cards...");
            await Promise.all(tripData.cards.map(async (card) => {
                if (card.type === 'transport' && card.data && card.data.from && card.data.to) {
                    const coords = [
                        [card.data.from.lng, card.data.from.lat],
                        [card.data.to.lng, card.data.to.lat]
                    ];
                    const mode = card.data.mode || 'driving';
                    const geometry = await fetchOsrmRouteServer(coords, mode);
                    if (geometry) {
                        card.data.routeGeometry = geometry; // Attach geometry directly to the card data
                    }
                }
            }));

            // Send the raw trip data as a JSON string so frontend can parse and load the trip 
            // In a real app we'd save this to a trips table, but for now we'll put it in the chat
            await supabase.from('messages').insert({
                room_id,
                content: `__TRIP_DATA__:${JSON.stringify(tripData)}`,
                is_ai: true
            });
        }

        // 4. Set state to idle (or cooldown)
        await supabase.from('room_state').update({
            ai_status: 'idle' // simpler than cooldown if we don't have updated_at
        }).eq('room_id', room_id);

    } catch (error) {
        console.error("Error in AI pipeline:", error);
        await supabase.from('room_state').update({
            ai_status: 'idle'
        }).eq('room_id', room_id);
    }
}

module.exports = { handler, method: 'post' };
