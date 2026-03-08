import { apiFetch } from '@/lib/api'

export type FlightsResponse = {
    direct_flights: Array<{
        name: string
        departure: string
        arrival: string
        duration: string
        stops: number
        price: string
        booking_url?: string | null
        connections?: string[]
    }>
    connecting_flights: Array<{
        name: string
        departure: string
        arrival: string
        duration: string
        stops: number
        price: string
        booking_url?: string | null
        connections?: string[]
    }>
    booking_url?: string | null
    cached?: boolean
    count?: number
    currentPrice?: string
}

export async function searchFlights(params: {
    from: string
    to: string
    date: string
    returnDate: string
    adults?: number
    children?: number
    seat?: 'economy' | 'premium-economy' | 'business' | 'first'
}) {
    return apiFetch<FlightsResponse>('/api/data/flights', {
        method: 'POST',
        body: JSON.stringify(params),
    })
}

export type HotelsResponse = {
    hotels: Array<{
        name: string
        address?: string
        latitude?: number
        longitude?: number
        pricePerNight?: string
        priceTotal?: string
        currency?: string
        rating?: number
        roomType?: string
        beds?: string
        bookingUrl?: string
        image?: string
        cancellationPolicy?: string
        amenities?: string[]
        distanceFromCenter?: string
    }>
    cached?: boolean
    count?: number
    searchUrl?: string | null
}

export async function searchHotels(params: {
    location: string
    checkin: string
    checkout: string
    adults?: number
    children?: number
    rooms?: number
    currency?: string
}) {
    return apiFetch<HotelsResponse>('/api/data/hotels', {
        method: 'POST',
        body: JSON.stringify(params),
    })
}

export type AttractionsResponse = {
    status: 'ok' | 'error'
    city?: string
    attractions?: Array<{
        name: string
        type: string
        description?: string
        latitude: number
        longitude: number
        opening_time?: string
        closing_time?: string
        cost_amount?: number
        cost_currency?: string
        cost_note?: string
        booking_required?: boolean
        booking_website?: string | null
        famous_for?: string
    }>
    message?: string
}

export async function getAttractions(city: string) {
    return apiFetch<AttractionsResponse>('/api/data/attractions', {
        method: 'POST',
        body: JSON.stringify({ city }),
    })
}

export async function getVisaSingle(country: string) {
    return apiFetch<any>('/api/data/visa-single', {
        method: 'POST',
        body: JSON.stringify({ country }),
    })
}

export type AirportsResponse = {
    status: 'ok' | 'error'
    count?: number
    airports?: Array<{
        code: string
        name: string
        latitude: number
        longitude: number
        city?: string
        countryCode?: string
        type?: string
        distanceKm?: number
    }>
    message?: string
}

export async function getAirports(params: {
    countryName?: string
    countryCode?: string
    city?: string
    latitude?: number
    longitude?: number
    radiusKm?: number
    limit?: number
}) {
    return apiFetch<AirportsResponse>('/api/data/airports', {
        method: 'POST',
        body: JSON.stringify(params),
    })
}

export type ItineraryPlanResponse = {
    status: 'ok' | 'error'
    plan?: {
        summary?: string
        days: Array<{
            day: number
            title?: string
            stops: Array<{
                label: string
                kind: 'airport' | 'hotel' | 'attraction'
                latitude: number
                longitude: number
                startTime?: string
                endTime?: string
                notes?: string
            }>
        }>
    }
    message?: string
}

export async function getItineraryPlan(payload: any) {
    return apiFetch<ItineraryPlanResponse>('/api/data/itinerary-plan', {
        method: 'POST',
        body: JSON.stringify(payload),
    })
}

export type GeocodeResponse =
    | {
            status: 'ok'
            query: string
            latitude: number
            longitude: number
            address?: string | null
      }
    | {
            status: 'error'
            message: string
            details?: string
      }

export async function geocodePlace(query: string) {
    return apiFetch<GeocodeResponse>('/api/data/geocode', {
        method: 'POST',
        body: JSON.stringify({ query }),
    })
}
