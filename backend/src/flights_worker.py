#!/usr/bin/env python3
"""
Flight search worker using fast-flights library.
Reads a JSON request on stdin and outputs JSON results on stdout.
Falls back to mock data if real API calls fail.
"""

import sys
import json
import concurrent.futures
from urllib.parse import quote_plus, urlencode
from fast_flights import FlightData, Passengers, create_filter, get_flights


def build_booking_urls(from_airport, to_airport, date, return_date, seat, adults, children):
    """Generate a proper Google Flights deeplink using fast-flights TFS protobuf, with q= fallback."""
    base = "https://www.google.com/travel/flights"

    # Human-readable fallback using query param
    q_parts = [f"Flights from {from_airport} to {to_airport} on {date}"]
    if return_date:
        q_parts.append(f"return {return_date}")
    if seat:
        q_parts.append(f"cabin {seat}")
    if adults:
        q_parts.append(f"adults {adults}")
    if children:
        q_parts.append(f"children {children}")
    query = " ".join(q_parts)
    fallback = f"{base}?q={quote_plus(query)}"

    try:
        trip = "round-trip" if return_date else "one-way"
        flights = [
            FlightData(date=date, from_airport=from_airport, to_airport=to_airport)
        ]
        if return_date:
            flights.append(
                FlightData(date=return_date, from_airport=to_airport, to_airport=from_airport)
            )

        passengers = Passengers(
            adults=adults or 1,
            children=children or 0,
            infants_in_seat=0,
            infants_on_lap=0,
        )

        flt_filter = create_filter(
            flight_data=flights,
            trip=trip,
            seat=seat or "economy",
            passengers=passengers,
        )

        tfs = flt_filter.as_b64().decode("utf-8")
        params = {
            "tfs": tfs,
            "hl": "en",
            "tfu": "EgQIABABIgA",
        }
        url = f"{base}?{urlencode(params)}"
        return {'primary': url, 'fallback': fallback}
    except Exception as build_err:
        print(f"[flights-worker] Failed to build TFS deeplink: {build_err}", file=sys.stderr)
        return {'primary': fallback, 'fallback': fallback}


def search_flights(request):
    """
    Request format:
    {
        "from": "LAX",
        "to": "JFK", 
        "date": "2025-06-15",
        "returnDate": "2025-06-22" (optional),
        "adults": 1,
        "children": 0,
        "seat": "economy"
    }
    """
    try:
        from_airport = request.get('from')
        to_airport = request.get('to')
        date = request.get('date')
        return_date = request.get('returnDate')
        adults = request.get('adults', 1)
        children = request.get('children', 0)
        seat = request.get('seat', 'economy')

        # Validate inputs
        if not all([from_airport, to_airport, date]):
            return {'error': 'Missing required fields: from, to, date'}

        # Build a booking/deeplink URL for the query
        booking_urls = build_booking_urls(from_airport, to_airport, date, return_date, seat, adults, children)

        # Run the fetch with a 90s timeout to avoid hanging forever
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                _fetch_flights,
                from_airport,
                to_airport,
                date,
                return_date,
                adults,
                children,
                seat,
                booking_urls,
            )
            try:
                return future.result(timeout=90)
            except concurrent.futures.TimeoutError:
                print('[flights-worker] Timed out after 90s', file=sys.stderr)
                return {
                    'error': 'Timed out after 90 seconds',
                    'direct_flights': [],
                    'connecting_flights': [],
                    'currentPrice': 'unknown',
                    'count': 0,
                    'booking_url': booking_urls.get('primary'),
                    'source': 'timeout',
                }

    except Exception as e:
        return {
            'error': str(e),
            'direct_flights': [],
            'connecting_flights': [],
            'currentPrice': 'unknown',
            'count': 0,
            'booking_url': None,
        }


def _fetch_flights(from_airport, to_airport, date, return_date, adults, children, seat, booking_urls):
    try:
        # Build flight data
        flight_data = [
            FlightData(date=date, from_airport=from_airport, to_airport=to_airport)
        ]

        # Add return flight if round-trip
        if return_date:
            flight_data.append(
                FlightData(date=return_date, from_airport=to_airport, to_airport=from_airport)
            )
            trip = "round-trip"
        else:
            trip = "one-way"

        # Create passengers
        passengers = Passengers(
            adults=adults,
            children=children,
            infants_in_seat=0,
            infants_on_lap=0
        )

        # Fetch flights (use local mode with Playwright)
        result = get_flights(
            flight_data=flight_data,
            trip=trip,
            seat=seat,
            passengers=passengers,
            fetch_mode="local"
        )

        if result is None:
            return {
                'error': 'No flights found',
                'direct_flights': [],
                'connecting_flights': [],
                'currentPrice': 'unknown',
                'count': 0,
                'booking_url': booking_urls.get('primary') or booking_urls.get('fallback'),
                'source': 'real',
            }

        # Convert to JSON-serializable format
        direct_flights = []
        connecting_flights = []

        for flight in result.flights:
            stops = getattr(flight, 'stops', 0)
            record = {
                'name': getattr(flight, 'name', 'Unknown'),
                'departure': getattr(flight, 'departure', ''),
                'arrival': getattr(flight, 'arrival', ''),
                'duration': getattr(flight, 'duration', ''),
                'stops': stops,
                'price': getattr(flight, 'price', ''),
                'booking_url': getattr(flight, 'booking_url', None) or booking_urls.get('primary') or booking_urls.get('fallback'),
                'connections': getattr(flight, 'connections', []),
            }
            if stops and stops > 0:
                connecting_flights.append(record)
            else:
                direct_flights.append(record)

        all_count = len(direct_flights) + len(connecting_flights)

        return {
            'direct_flights': direct_flights,
            'connecting_flights': connecting_flights,
            'currentPrice': getattr(result, 'current_price', 'typical'),
            'count': all_count,
            'booking_url': booking_urls.get('primary') or booking_urls.get('fallback'),
            'source': 'real',
        }

    except Exception as fetch_error:
        print(f"[flights-worker] Real fetch failed: {str(fetch_error)}, using mock data", file=sys.stderr)
        return _generate_mock_flights(from_airport, to_airport, date, booking_urls)


def _generate_mock_flights(from_airport, to_airport, date, booking_urls=None):
    """Generate mock flight data when real API fails"""
    primary_url = (booking_urls or {}).get('primary') if booking_urls else None
    direct = [
        {
            'name': 'United Airlines',
            'departure': '08:00 AM',
            'arrival': '04:30 PM',
            'duration': '~5h 30m',
            'stops': 0,
            'price': '$450',
            'booking_url': primary_url,
            'connections': [],
        },
        {
            'name': 'American Airlines',
            'departure': '10:15 AM',
            'arrival': '06:45 PM',
            'duration': '~5h 30m',
            'stops': 0,
            'price': '$480',
            'booking_url': primary_url,
            'connections': [],
        },
    ]

    connecting = [
        {
            'name': 'Delta Air Lines',
            'departure': '02:30 PM',
            'arrival': '11:00 PM',
            'duration': '~6h 30m',
            'stops': 1,
            'price': '$380',
            'booking_url': primary_url,
            'connections': ['Layover city'],
        },
        {
            'name': 'Southwest Airlines',
            'departure': '12:45 PM',
            'arrival': '09:15 PM',
            'duration': '~8h',
            'stops': 1,
            'price': '$350',
            'booking_url': primary_url,
            'connections': ['Layover city'],
        },
    ]

    return {
        'direct_flights': direct,
        'connecting_flights': connecting,
        'currentPrice': 'typical',
        'count': len(direct) + len(connecting),
        'booking_url': primary_url,
        'source': 'mock',
    }


if __name__ == '__main__':
    try:
        # Read JSON request from stdin
        input_data = sys.stdin.read()
        request = json.loads(input_data)

        # Search for flights
        result = search_flights(request)

        # Output JSON to stdout
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON input: {e}'}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
