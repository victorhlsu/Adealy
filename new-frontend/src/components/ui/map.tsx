import maplibregl, { type MapOptions, type MarkerOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTheme } from 'next-themes'
import {
    Children,
    createContext,
    forwardRef,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
    type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { Locate, Minus, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

type MapContextValue = {
    map: maplibregl.Map | null
    isLoaded: boolean
}

const MapContext = createContext<MapContextValue | null>(null)

export function useMap() {
    const ctx = useContext(MapContext)
    if (!ctx) throw new Error('useMap must be used within a Map')
    return ctx
}

const DEFAULT_STYLES = {
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
}

type MapProps = {
    children?: ReactNode
    className?: string
    styles?: {
        light?: string | maplibregl.StyleSpecification
        dark?: string | maplibregl.StyleSpecification
    }
} & Omit<MapOptions, 'container' | 'style'>

export type MapRef = maplibregl.Map

export const Map = forwardRef<MapRef, MapProps>(function Map(
    { children, className, styles, ...options },
    ref
) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const { resolvedTheme } = useTheme()

    const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)

    const style = useMemo(() => {
        const isDark = resolvedTheme === 'dark'
        return isDark ? styles?.dark ?? DEFAULT_STYLES.dark : styles?.light ?? DEFAULT_STYLES.light
    }, [resolvedTheme, styles?.dark, styles?.light])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        // React StrictMode mounts effects twice in dev.
        // If a map already exists, don't create a second instance.
        if (mapRef.current) return

        const map = new maplibregl.Map({
            container: el,
            style,
            attributionControl: { compact: true },
            renderWorldCopies: false,
            ...options,
        })

        mapRef.current = map
        setMapInstance(map)

        const onLoad = () => {
            setIsLoaded(true)
        }

        map.on('load', onLoad)

        return () => {
            map.off('load', onLoad)
            map.remove()
            mapRef.current = null
            setMapInstance(null)
            setIsLoaded(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useImperativeHandle(ref, () => mapRef.current as maplibregl.Map, [mapInstance])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        // Keep style in sync with theme
        map.setStyle(style as any, { diff: true } as any)
    }, [style])

    const ctx = useMemo(() => ({ map: mapInstance, isLoaded }), [mapInstance, isLoaded])

    return (
        <MapContext.Provider value={ctx}>
            <div ref={containerRef} className={cn('relative h-full w-full', className)}>
                {mapInstance && children}
            </div>
        </MapContext.Provider>
    )
})

type MapControlsProps = {
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

export function MapControls({ position = 'top-right' }: MapControlsProps) {
    const { map } = useMap()

    const posClass =
        position === 'top-right'
            ? 'top-3 right-3'
            : position === 'top-left'
                ? 'top-3 left-3'
                : position === 'bottom-right'
                    ? 'bottom-3 right-3'
                    : 'bottom-3 left-3'

    return (
        <div className={cn('absolute z-10 flex flex-col gap-2', posClass)}>
            <button
                className="rounded-lg bg-white/95 border border-slate-200 shadow px-2 py-2 hover:bg-white"
                onClick={() => map?.zoomIn()}
                aria-label="Zoom in"
            >
                <Plus className="h-4 w-4" />
            </button>
            <button
                className="rounded-lg bg-white/95 border border-slate-200 shadow px-2 py-2 hover:bg-white"
                onClick={() => map?.zoomOut()}
                aria-label="Zoom out"
            >
                <Minus className="h-4 w-4" />
            </button>
            <button
                className="rounded-lg bg-white/95 border border-slate-200 shadow px-2 py-2 hover:bg-white"
                onClick={() => {
                    if (!map) return
                    map.flyTo({ center: [0, 20], zoom: 1.4, duration: 650 })
                }}
                aria-label="Reset"
            >
                <Locate className="h-4 w-4" />
            </button>
        </div>
    )
}

type MapMarkerProps = {
    longitude: number
    latitude: number
    options?: MarkerOptions
    children?: ReactNode
    style?: CSSProperties
    popupOpen?: boolean
    onPopupClose?: () => void
}

type MarkerPopupProps = {
    children?: ReactNode
    className?: string
}

type MarkerLabelProps = {
    children?: ReactNode
    position?: 'top' | 'bottom'
}

function isElementOfType(node: unknown, component: unknown): node is ReactElement {
    return !!node && typeof node === 'object' && (node as any).type === component
}

export function MapMarker({ longitude, latitude, options, children, style, popupOpen, onPopupClose }: MapMarkerProps) {
    const { map, isLoaded } = useMap()
    const markerRef = useRef<maplibregl.Marker | null>(null)
    const [markerEl, setMarkerEl] = useState<HTMLDivElement | null>(null)
    const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null)
    const popupRef = useRef<maplibregl.Popup | null>(null)
    const onPopupCloseRef = useRef<(() => void) | undefined>(onPopupClose)

    useEffect(() => {
        onPopupCloseRef.current = onPopupClose
    }, [onPopupClose])

    const childArray = useMemo(() => {
        return Children.toArray(children) as unknown[]
    }, [children])

    const markerContent = useMemo(() => {
        const node = childArray.find((n) => isElementOfType(n, MarkerContent)) as any
        return node?.props?.children
    }, [childArray])

    const markerLabel = useMemo(() => {
        const node = childArray.find((n) => isElementOfType(n, MarkerLabel)) as any
        return node ? { position: node.props?.position ?? 'bottom', children: node.props?.children } : null
    }, [childArray])

    const markerPopup = useMemo(() => {
        const node = childArray.find((n) => isElementOfType(n, MarkerPopup)) as any
        return node ? { className: node.props?.className, children: node.props?.children } : null
    }, [childArray])

    useEffect(() => {
        if (!map || !isLoaded) return

        const el = document.createElement('div')
        // Center the marker element on its coordinate.
        // (Previous translate(-50%, -100%) anchored the marker above the coordinate.)
        el.style.transform = 'translate(-50%, -50%)'
        el.style.pointerEvents = 'auto'
        setMarkerEl(el)

        let popup: maplibregl.Popup | null = null
        let popupContentEl: HTMLDivElement | null = null
        if (markerPopup) {
            popupContentEl = document.createElement('div')
            setPopupEl(popupContentEl)
            popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 18, maxWidth: '360px' as any })
            popup.setDOMContent(popupContentEl)
            popup.on('close', () => {
                onPopupCloseRef.current?.()
            })
            popupRef.current = popup
            el.style.cursor = 'pointer'
        } else {
            setPopupEl(null)
        }

        const marker = new maplibregl.Marker({ element: el, ...(options || {}) })
            .setLngLat([longitude, latitude])
            .addTo(map)

        if (popup) {
            marker.setPopup(popup)
        }

        markerRef.current = marker

        return () => {
            try {
                popupRef.current?.remove()
            } catch {
                // ignore
            }
            marker.remove()
            markerRef.current = null
            popupRef.current = null
            setMarkerEl(null)
            setPopupEl(null)
        }
    }, [map, isLoaded, options, longitude, latitude, markerPopup])

    useEffect(() => {
        markerRef.current?.setLngLat([longitude, latitude])
    }, [longitude, latitude])

    useEffect(() => {
        if (!map || !isLoaded) return
        const marker = markerRef.current as any
        const popup = popupRef.current as any
        if (!marker || !popup) return

        try {
            const isOpen = typeof popup?.isOpen === 'function' ? popup.isOpen() : false
            if (popupOpen) {
                if (!isOpen && typeof marker?.togglePopup === 'function') marker.togglePopup()
            } else {
                if (isOpen && typeof popup?.remove === 'function') popup.remove()
            }
        } catch {
            // ignore
        }
    }, [popupOpen, map, isLoaded])

    if (!markerEl) return null

    return (
        <>
            {createPortal(
                <div style={style}>
                    {markerContent}
                    {markerLabel ? (
                        <div
                            className={cn(
                                'pointer-events-none select-none text-[11px] font-medium text-slate-900',
                                markerLabel.position === 'bottom' ? 'mt-1 text-center' : 'mb-1 text-center'
                            )}
                        >
                            <div className="inline-flex rounded-full bg-white/90 border border-slate-200 shadow px-2 py-0.5">
                                {markerLabel.children}
                            </div>
                        </div>
                    ) : null}
                </div>,
                markerEl
            )}

            {popupEl && markerPopup
                ? createPortal(
                    <div className={cn('p-0', markerPopup.className)}>
                        {markerPopup.children}
                    </div>,
                    popupEl
                )
                : null}
        </>
    )
}

export function MarkerContent({ children }: { children?: ReactNode }) {
    return <>{children}</>
}

export function MarkerPopup(_props: MarkerPopupProps) {
    return null
}

export function MarkerLabel(_props: MarkerLabelProps) {
    return null
}
