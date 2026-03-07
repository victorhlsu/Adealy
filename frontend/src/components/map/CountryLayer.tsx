import { useEffect, useMemo, useRef } from 'react'
import { useMap } from '@/components/ui/map'

type Props = {
    mode: 'passport' | 'destination' | 'selected'
    selectedCountryName?: string
    visaBucketsByCountryName?: Record<string, 'visa-free' | 'visa-on-arrival' | 'visa-required' | 'other'>
    onCountryClick?: (countryName: string) => void
}

const SOURCE_ID = 'adealy:countries'
const FILL_LAYER_ID = 'adealy:countries-fill'
const OUTLINE_LAYER_ID = 'adealy:countries-outline'

const COUNTRIES_GEOJSON_URL =
    'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'

type Feature = GeoJSON.Feature<GeoJSON.Geometry, any>

type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, any>

function normalizeName(name: string) {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\(.*?\)/g, '')
        .replace(/\./g, '')
        .replace(/,/g, '')
        .trim()
}

function bboxFromFeature(feature: Feature): [[number, number], [number, number]] | null {
    const geom = feature.geometry
    if (!geom) return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    const consider = (lng: number, lat: number) => {
        minX = Math.min(minX, lng)
        minY = Math.min(minY, lat)
        maxX = Math.max(maxX, lng)
        maxY = Math.max(maxY, lat)
    }

    const walk = (coords: any) => {
        if (!coords) return
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            consider(coords[0], coords[1])
            return
        }
        for (const c of coords) walk(c)
    }

    walk((geom as any).coordinates)

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
    return [
        [minX, minY],
        [maxX, maxY],
    ]
}

export function CountryLayer({ mode, selectedCountryName, visaBucketsByCountryName, onCountryClick }: Props) {
    const { map, isLoaded } = useMap()
    const indexRef = useRef<Map<string, Feature>>(new Map())
    const dataRef = useRef<FeatureCollection | null>(null)
    const hoverIdRef = useRef<number | string | null>(null)
    const handlersRef = useRef<{
        onClick?: (e: any) => void
        onMove?: (e: any) => void
        onLeave?: () => void
    }>({})

    const selectedNorm = useMemo(() => (selectedCountryName ? normalizeName(selectedCountryName) : ''), [selectedCountryName])

    useEffect(() => {
        if (!map || !isLoaded) return

        let cancelled = false

        const ensureLayers = async () => {
            try {
                if (!dataRef.current) {
                    const res = await fetch(COUNTRIES_GEOJSON_URL)
                    const json = (await res.json()) as FeatureCollection
                    if (cancelled) return

                    // Add a normalized name field for selection/highlight.
                    const withNorm: FeatureCollection = {
                        ...json,
                        features: (json.features ?? []).map((f: any, idx: number) => {
                            const name =
                                f?.properties?.ADMIN || f?.properties?.name || f?.properties?.NAME || f?.properties?.Country || f?.properties?.country
                            const norm = typeof name === 'string' ? normalizeName(name) : ''
                            return {
                                ...f,
                                id: f.id ?? idx,
                                properties: {
                                    ...(f.properties || {}),
                                    adealy_norm_name: norm,
                                    adealy_bucket: 'other',
                                },
                            }
                        }),
                    }

                    dataRef.current = withNorm
                    const idx = new Map<string, Feature>()
                    for (const f of withNorm.features ?? []) {
                        const name =
                            (f as any)?.properties?.ADMIN || (f as any)?.properties?.name || (f as any)?.properties?.NAME || (f as any)?.properties?.Country || (f as any)?.properties?.country
                        if (typeof name === 'string' && name.trim()) {
                            idx.set(normalizeName(name), f as Feature)
                        }
                    }
                    indexRef.current = idx
                }

                if (!map.getSource(SOURCE_ID)) {
                    map.addSource(SOURCE_ID, {
                        type: 'geojson',
                        data: dataRef.current as any,
                    } as any)
                }

                // Put it below labels
                const beforeId = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id

                if (!map.getLayer(FILL_LAYER_ID)) {
                    map.addLayer(
                        {
                            id: FILL_LAYER_ID,
                            type: 'fill',
                            source: SOURCE_ID,
                            paint: {
                                'fill-color': '#94a3b8',
                                'fill-opacity': 0.1,
                            },
                        } as any,
                        beforeId
                    )
                }

                if (!map.getLayer(OUTLINE_LAYER_ID)) {
                    map.addLayer(
                        {
                            id: OUTLINE_LAYER_ID,
                            type: 'line',
                            source: SOURCE_ID,
                            paint: {
                                'line-color': '#0f172a',
                                'line-width': 0.6,
                                'line-opacity': 0.15,
                            },
                        } as any,
                        beforeId
                    )
                }

                const bucketColorExpr: any = [
                    'match',
                    ['get', 'adealy_bucket'],
                    'visa-free',
                    '#12b76a',
                    'visa-on-arrival',
                    '#f79009',
                    'visa-required',
                    '#f04438',
                    '#94a3b8',
                ]

                const fillColorExpr: any =
                    mode === 'destination'
                        ? bucketColorExpr
                        : '#94a3b8'

                // Update paint expressions when selection/mode changes
                try {
                    map.setPaintProperty(FILL_LAYER_ID, 'fill-color', fillColorExpr)
                    map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        mode === 'destination' ? 0.26 : 0.18,
                        ['==', ['get', 'adealy_norm_name'], selectedNorm],
                        mode === 'passport' ? 0.12 : 0.06,
                        0.06,
                    ] as any)
                    map.setPaintProperty(OUTLINE_LAYER_ID, 'line-color', [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        '#38bdf8',
                        ['==', ['get', 'adealy_norm_name'], selectedNorm],
                        mode === 'passport' ? '#38bdf8' : '#0ea5e9',
                        '#0f172a',
                    ] as any)
                    map.setPaintProperty(OUTLINE_LAYER_ID, 'line-width', [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        1.6,
                        ['==', ['get', 'adealy_norm_name'], selectedNorm],
                        mode === 'destination' ? 1.2 : 2,
                        0.6,
                    ] as any)
                    map.setPaintProperty(OUTLINE_LAYER_ID, 'line-opacity', [
                        'case',
                        ['boolean', ['feature-state', 'hover'], false],
                        0.95,
                        ['==', ['get', 'adealy_norm_name'], selectedNorm],
                        mode === 'destination' ? 0.55 : 0.9,
                        0.18,
                    ] as any)
                } catch {
                    // ignore
                }

                if (!handlersRef.current.onClick) {
                    handlersRef.current.onClick = (e: any) => {
                        const feature = e.features?.[0] as any
                        const name = feature?.properties?.ADMIN || feature?.properties?.name || feature?.properties?.NAME
                        if (typeof name === 'string' && name.trim()) onCountryClick?.(name.trim())
                    }
                    handlersRef.current.onMove = (e: any) => {
                        map.getCanvas().style.cursor = 'pointer'

                        const feature = e.features?.[0] as any
                        const newId = feature?.id
                        if (newId == null) return

                        const prev = hoverIdRef.current
                        if (prev != null && prev !== newId) {
                            try {
                                map.setFeatureState({ source: SOURCE_ID, id: prev }, { hover: false })
                            } catch {
                                // ignore
                            }
                        }

                        hoverIdRef.current = newId
                        try {
                            map.setFeatureState({ source: SOURCE_ID, id: newId }, { hover: true })
                        } catch {
                            // ignore
                        }
                    }
                    handlersRef.current.onLeave = () => {
                        map.getCanvas().style.cursor = ''
                        const prev = hoverIdRef.current
                        if (prev != null) {
                            try {
                                map.setFeatureState({ source: SOURCE_ID, id: prev }, { hover: false })
                            } catch {
                                // ignore
                            }
                            hoverIdRef.current = null
                        }
                    }

                    map.on('click', FILL_LAYER_ID, handlersRef.current.onClick)
                    map.on('mouseleave', FILL_LAYER_ID, handlersRef.current.onLeave)
                    map.on('mousemove', FILL_LAYER_ID, handlersRef.current.onMove)
                }
            } catch {
                // If the dataset can't load (offline/CSP), keep map usable.
            }
        }

        void ensureLayers()

        return () => {
            cancelled = true
            try {
                if (handlersRef.current.onClick) map.off('click', FILL_LAYER_ID, handlersRef.current.onClick)
                if (handlersRef.current.onLeave) map.off('mouseleave', FILL_LAYER_ID, handlersRef.current.onLeave)
                if (handlersRef.current.onMove) map.off('mousemove', FILL_LAYER_ID, handlersRef.current.onMove)
            } catch {
                // ignore
            }
            handlersRef.current = {}
        }
    }, [map, isLoaded, mode, onCountryClick, selectedNorm])

    useEffect(() => {
        if (!map || !isLoaded) return
        if (!visaBucketsByCountryName) return
        if (!dataRef.current) return

        const source = map.getSource(SOURCE_ID) as any
        if (!source?.setData) return

        const updated: FeatureCollection = {
            ...dataRef.current,
            features: (dataRef.current.features ?? []).map((f: any) => {
                const norm = f?.properties?.adealy_norm_name
                const bucket = (typeof norm === 'string' && visaBucketsByCountryName[norm]) || 'other'
                return {
                    ...f,
                    properties: {
                        ...(f.properties || {}),
                        adealy_bucket: bucket,
                    },
                }
            }),
        }

        dataRef.current = updated
        try {
            source.setData(updated)
        } catch {
            // ignore
        }
    }, [map, isLoaded, visaBucketsByCountryName])

    useEffect(() => {
        if (!map || !isLoaded) return
        if (!selectedNorm) return

        // Keep the first page and destination-picking page as "free roam".
        // Only auto-zoom once a destination is confirmed (selected mode).
        if (mode !== 'selected') return

        const feature = indexRef.current.get(selectedNorm)
        if (!feature) return

        const bbox = bboxFromFeature(feature)
        if (!bbox) return

        try {
            // Light zoom only — avoid jumping in too close.
            map.fitBounds(bbox as any, { padding: 160, duration: 650, maxZoom: 3.25 } as any)
        } catch {
            // ignore
        }
    }, [map, isLoaded, selectedNorm, mode])

    // Intentionally no "lock to selected" behavior — always free roam.

    return null
}
