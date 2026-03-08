import { useEffect, useMemo, useRef, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import { useMap } from '@/components/ui/map'
import type { TripCard } from '@/types/trip'



async function fetchOsrmRoute(coords: Array<[number, number]>, mode: string = 'driving', signal: AbortSignal) {
    if (coords.length < 2) return null
    const path = coords.map(([lng, lat]) => `${lng},${lat}`).join(';')
    const profile = mode === 'walking' ? 'foot' : mode === 'bicycling' ? 'bicycle' : 'driving'
    const url = `https://router.project-osrm.org/route/v1/${profile}/${path}?overview=full&geometries=geojson`
    const resp = await fetch(url, { signal })
    if (!resp.ok) return null
    const json = await resp.json()
    const geometry = json?.routes?.[0]?.geometry
    if (!geometry) return null
    return geometry
}

// Global cache outside of component lifecycle to persist across remounts (e.g. toggling map/timeline views)
const globalRouteCache: Record<string, any> = {}

export function RoutesLayer({ cards, enabled, visibleDay, activeLayer }: { cards: TripCard[]; enabled: boolean; visibleDay?: number; activeLayer?: string }) {
    const { map, isLoaded } = useMap()
    const [geoms, setGeoms] = useState<Array<{ id: string; geometry: any }> | null>(null)
    const mountedRef = useRef(false)

    // Identify transport cards that need routing
    const routesToFetch = useMemo(() => {
        if (!enabled) return []

        let relevantCards = cards.filter(c =>
            c.type === 'transport' &&
            (visibleDay === undefined || visibleDay === 0 || c.day === visibleDay) &&
            c.data.from && c.data.to // Ensure we have start/end points
        );

        // Separate flights from other transport when filtering.
        if (activeLayer === 'flight') {
            relevantCards = relevantCards.filter(c => c.data.mode === 'flight');
        } else if (activeLayer === 'transport') {
            relevantCards = relevantCards.filter(c => c.data.mode !== 'flight');
        }

        return relevantCards.map(c => {
            // If the backend pre-fetched the geometry, put it in the cache immediately
            if (c.data.routeGeometry && !globalRouteCache[c.id]) {
                globalRouteCache[c.id] = c.data.routeGeometry;
            }

            return {
                id: c.id,
                mode: c.data.mode || 'driving',
                coords: [
                    [c.data.from!.lng, c.data.from!.lat],
                    [c.data.to!.lng, c.data.to!.lat]
                ] as Array<[number, number]>
            };
        });

    }, [cards, enabled, visibleDay, activeLayer])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    useEffect(() => {
        const abort = new AbortController()

        const run = async () => {
            // Hide routes if viewing all days or if filtering by stay/activity
            const isIndividualDayView = visibleDay !== undefined && visibleDay !== 0;
            const isTransportLayerActive = activeLayer === 'all' || activeLayer === 'transport' || activeLayer === 'flight';

            if (!routesToFetch.length || !isIndividualDayView || !isTransportLayerActive) {
                setGeoms(null)
                return
            }

            // In a real app, we might check if we already have the geometry in the card.data.route.polyline
            // For now, we simulate fetching real geometry via OSRM because the mock polyline is fake.

            const out: Array<{ id: string; geometry: any }> = []
            let needsNetworkFetch = false;

            // First pass: collect instantly available cached routes
            for (const r of routesToFetch) {
                if (globalRouteCache[r.id]) {
                    out.push({ id: r.id, geometry: globalRouteCache[r.id] })
                } else {
                    needsNetworkFetch = true;
                }
            }

            // Immediately render whatever is cached (or clear the map if nothing is cached)
            // This prevents the old day's routes from sticking around while we fetch the new day's routes!
            if (!mountedRef.current || abort.signal.aborted) return
            setGeoms([...out])

            // Second pass: fetch missing routes from OSRM
            if (needsNetworkFetch) {
                await Promise.all(routesToFetch.map(async (r) => {
                    if (globalRouteCache[r.id]) return; // Already handled

                    try {
                        const geometry = await fetchOsrmRoute(r.coords, r.mode, abort.signal)
                        if (geometry) {
                            globalRouteCache[r.id] = geometry // Cache it globally
                            out.push({ id: r.id, geometry })
                        } else {
                            // Fallback to straight line if OSRM fails
                            const fallback = {
                                type: 'LineString',
                                coordinates: r.coords
                            }
                            out.push({ id: r.id, geometry: fallback })
                        }
                    } catch (e) {
                        console.error("Failed to fetch route", e)
                    }
                }))

                // Render again once network fetches complete
                if (!mountedRef.current || abort.signal.aborted) return
                setGeoms([...out])
            }
        }

        run()

        return () => abort.abort()
    }, [routesToFetch])

    useEffect(() => {
        if (!map || !isLoaded) return

        const m = map as maplibregl.Map
        const createdIds: string[] = []

        const cleanup = () => {
            for (const id of createdIds) {
                const casingLayerId = `adealy-route-casing-${id}`
                const layerId = `adealy-route-${id}`
                const sourceId = `adealy-route-src-${id}`
                try { if (m.getLayer(casingLayerId)) m.removeLayer(casingLayerId) } catch { }
                try { if (m.getLayer(layerId)) m.removeLayer(layerId) } catch { }
                try { if (m.getSource(sourceId)) m.removeSource(sourceId) } catch { }
            }
        }

        // Clean up previous layers first to avoid dupes/stale data
        // Ideally we track previous IDs, but for now we trust `geoms` is fresh
        // Actually, we can't easily clean up "previous" render's layers without Ref tracking. 
        // For simplicity, we just won't clean up *inside* the loop, but we need to ensure we don't leak.
        // A robust way uses a ref to track active IDs.

        // Let's implement active ID tracking for cleanup.
        // But here, we just run cleanup() on unmount/re-run which is standard. 
        // The issue is `createdIds` is local. We need to know what was created LAST time.
        // But since this Effect runs on `geoms` change, we can just return cleanup.
        // HOWEVER, `ids` array needs to be populated from the *previous* run to clean up correctly?
        // No, the closure `cleanup` returned from the *previous* effect execution will have access to the `ids` from that execution.
        // So this is correct.

        if (!geoms?.length) {
            cleanup()
            return    
        }

        for (const g of geoms) {
            const id = g.id // use card ID
            createdIds.push(id) // Track for cleanup closure

            const sourceId = `adealy-route-src-${id}`
            const casingLayerId = `adealy-route-casing-${id}`
            const layerId = `adealy-route-${id}`

            const feature = {
                type: 'Feature',
                properties: { id },
                geometry: g.geometry,
            }

            // Check if source exists (re-render safety)
            if (m.getSource(sourceId)) {
                (m.getSource(sourceId) as any).setData({ type: 'FeatureCollection', features: [feature] })
            } else {
                m.addSource(sourceId, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [feature] },
                } as any)

                m.addLayer({
                    id: casingLayerId,
                    type: 'line',
                    source: sourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#1E293B', // Dark casing for contrast
                        'line-width': 4,
                        'line-opacity': 0.8,
                    },
                } as any)

                m.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#3B82F6', // Blue for routing
                        'line-width': 2,
                        'line-opacity': 1.0,
                    },
                } as any)
            }
        }

        return cleanup
    }, [map, isLoaded, geoms])

    return null
}
