/**
 * POST /api/gemini/nearest_airport
 * Returns airports located exactly in the specified city (Gemini-backed).
 *
 * Request body:
 * {
 *   "city": "Los Angeles"   // required, city name (exact city only)
 * }
 *
 * Success response:
 * {
 *   "status": "ok",
 *   "city": "Los Angeles",
 *   "airports": [ { "airport_code": "LAX", "airport_name": "Los Angeles International Airport", "city": "Los Angeles", "country": "USA" }, ... ]
 * }
 *
 * Error responses:
 * { "status": "error", "message": "City name is required" }
 * { "status": "error", "message": "Invalid city name detected" }
 * { "status": "error", "message": "Failed to parse airport data", "raw_response": "..." }
 */

const { Router } = require('express');
const ai = require('../../ai/ai');

const nearestAirport = async (req, res) => {
    const { city } = req.body;

    if (!city || !city.trim()) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'City name is required' 
        });
    }

    // Basic input validation to catch obvious injection attempts
    const suspiciousPatterns = /ignore|system|role|prompt|instruction|execute|eval|script|<script|javascript:/i;
    if (suspiciousPatterns.test(city)) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Invalid city name detected' 
        });
    }

    try {
        const response = await ai.generate(city, 'AIRPORT_PROMPT');
        
        if (response === '404') {
            return res.status(500).json({ 
                status: 'error', 
                message: 'Failed to query Gemini for airport information' 
            });
        }

        // Remove any markdown formatting that might have slipped through
        let cleanedResponse = response.trim();
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // Try to parse the response as JSON
        let airportData;
        try {
            airportData = JSON.parse(cleanedResponse);
            
            // Check if Gemini returned an error
            if (airportData.error) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: airportData.error 
                });
            }
        } catch (parseErr) {
            console.error('[nearest_airport] Failed to parse response:', cleanedResponse);
            return res.status(500).json({
                status: 'error',
                message: 'Failed to parse airport data',
                raw_response: cleanedResponse
            });
        }

        return res.status(200).json({ 
            status: 'ok', 
            city,
            airports: airportData.airports || [airportData]
        });
    } catch (err) {
        console.error('[nearest_airport] Error:', err);
        return res.status(500).json({ 
            status: 'error', 
            message: 'Internal server error' 
        });
    }
};

const router = Router();
router.post('/', nearestAirport);

module.exports = { router, nearestAirport };
