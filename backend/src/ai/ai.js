const { GoogleGenAI } = require('@google/genai');
const config = require("../constants/geminiConfiguration")
const { getCachedResponse, cacheResponse } = require('../supabase/gemini_cache');
const dotenv = require('dotenv');
dotenv.config();

// const apiKey = process.env.GEMINI_API_KEY;

if (!config.MODEL) {
    throw new Error('No gemini model found in path ./constants/ai');
}

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});


async function generate(prompt, promptType = 'PROMPT') {
    try {
        const systemPrompt = config[promptType] || config.PROMPT || '';
        const fullPrompt = systemPrompt + prompt; // still send preprompt to Gemini
        // Namespace the cache key by prompt type so endpoints don't collide (e.g., attractions vs flights)
        const cacheKey = `${promptType}:${(prompt || '').toLowerCase()}`;

        // Check cache first
        const cached = await getCachedResponse(cacheKey);
        if (cached) {
            return cached;
        }

        // Not cached, generate new response
        const result = await ai.models.generateContent({
            model: config.MODEL,
            contents: fullPrompt,
        });

        const response = result.text;

        // Cache the response
        await cacheResponse(cacheKey, response);

        return response;

    } catch (err) {
        console.error('[ai] Error generating content from Gemini:', err);
        return "404";
    }
}

async function ping() {
    try {
        const result = await ai.models.generateContent({
            model: config.MODEL,
            contents: "Say 'ok'",
        });
        return result.text === 'ok' || result.text.toLowerCase().includes('ok');
    } catch (err) {
        console.error('[ai] Gemini ping failed:', err);
        return false;
    }
}

module.exports = { generate, ping };
