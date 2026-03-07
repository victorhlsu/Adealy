import type { StreamChunk } from "@/types/trip";

/**
 * Connects to the real backend streaming endpoint.
 * Requires sessionId for history caching.
 */
export async function* streamTripGenerator(prompt: string, sessionId: string | null): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt, sessionId })
    });

    if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');

        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                if (!jsonStr.trim()) continue;

                try {
                    const chunk = JSON.parse(jsonStr);
                    yield chunk;
                } catch (e) {
                    console.error("Failed to parse SSE line:", jsonStr, e);
                }
            }
        }
    }
}
