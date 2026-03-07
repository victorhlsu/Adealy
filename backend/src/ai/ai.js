const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require("../constants/geminiConfiguration")
const { getCachedResponse, cacheResponse } = require('../supabase/gemini_cache');
// Environment variables are loaded in server.js

if (!config.MODEL) {
    throw new Error('No gemini model found in path ./constants/ai');
}

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


async function generate(prompt, promptType = 'PROMPT') {
    try {
        const systemPrompt = config[promptType] || config.PROMPT || '';
        const fullPrompt = systemPrompt + prompt;
        const cacheKey = `${promptType}:${(prompt || '').toLowerCase()}`;

        // Check cache first
        const cached = await getCachedResponse(cacheKey);
        if (cached) {
            return cached;
        }

        // Not cached, generate new response
        const model = ai.getGenerativeModel({ model: config.MODEL || 'gemini-1.5-flash' });
        const result = await model.generateContent(fullPrompt);
        const response = result.response.text();

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
        const model = ai.getGenerativeModel({ model: config.MODEL || 'gemini-1.5-flash' });
        const result = await model.generateContent("Say 'ok'");
        const text = result.response.text();
        return text.toLowerCase().includes('ok');
    } catch (err) {
        console.error('[ai] Gemini ping failed:', err);
        return false;
    }
}

module.exports = { generate, ping };
