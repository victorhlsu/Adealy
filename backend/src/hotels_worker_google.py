#!/usr/bin/env python3
"""
Hotel search worker for Google Hotels
Reads a JSON request on stdin and outputs JSON results on stdout.
Uses Playwright to scrape and parse hotel listings from Google Hotels.
"""

import sys
import json
import re
import concurrent.futures
from playwright.sync_api import sync_playwright


def main():
    """Main entry point for the worker."""
    try:
        # Read query from stdin
        query_json = sys.stdin.read()
        query = json.loads(query_json)
        
        location = query.get('location', 'San Francisco')
        checkin = query.get('checkin', '2026-02-15')
        checkout = query.get('checkout', '2026-02-20')
        adults = query.get('adults', 2)
        currency = query.get('currency', 'USD')
        
        # Fetch hotels from Google Hotels
        result = fetch_hotels(location, checkin, checkout, adults, currency)
        
        # Output result as JSON to stdout
        print(json.dumps(result), flush=True)
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'hotels': [],
            'searchUrl': None,
        }
        print(json.dumps(error_result), flush=True)
        sys.exit(1)


def build_google_hotels_url(location, checkin, checkout, adults, currency):
    """Build Google Hotels search URL."""
    location_encoded = location.replace(' ', '+')

    # Keep the URL simple and stable. Google Travel changes internal params often,
    # but these high-level query params consistently work.
    base_url = f"https://www.google.com/travel/hotels/{location_encoded}"

    params = [
        f"q={location_encoded}",
        "hl=en-US",
        "gl=us",
    ]

    if checkin:
        params.append(f"checkin={checkin}")
    if checkout:
        params.append(f"checkout={checkout}")
    if adults:
        params.append(f"adults={adults}")
    if currency:
        params.append(f"curr={currency}")

    return base_url + "?" + "&".join(params)


def fetch_hotels(location, checkin, checkout, adults, currency):
    """Fetch hotels from Google Hotels."""
    search_url = build_google_hotels_url(location, checkin, checkout, adults, currency)
    
    # Run the fetch with a 180s timeout
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            _fetch_hotels,
            search_url,
            currency,
        )
        try:
            return future.result(timeout=180)
        except concurrent.futures.TimeoutError:
            print('[hotels-worker] Timed out after 180s', file=sys.stderr)
            return {
                'error': 'Timed out after 180 seconds',
                'hotels': [],
                'searchUrl': search_url,
            }


def _fetch_hotels(search_url, currency):
    """Fetch and parse hotels using Playwright."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )

            # Navigate to Google Hotels search page
            print(f'[hotels-worker] Loading: {search_url}', file=sys.stderr)
            page.goto(search_url, wait_until='networkidle', timeout=30000)

            # Handle cookie consent if present
            try:
                accept_button = page.locator('button:has-text("Accept all")').first
                if accept_button.is_visible():
                    accept_button.click()
                    page.wait_for_timeout(1000)
            except:
                pass

            # Wait for hotel cards to load
            page.wait_for_selector('c-wiz > div > a', timeout=20000)
            
            # Scroll to load more results
            page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
            page.wait_for_timeout(3000)

            # Extract hotel listings
            hotels = []
            
            # Find all hotel card links
            hotel_links = page.query_selector_all('c-wiz > div > a')
            
            print(f'[hotels-worker] Found {len(hotel_links)} hotel cards', file=sys.stderr)

            for i, hotel_link in enumerate(hotel_links[:20]):  # Limit to first 20
                try:
                    hotel = _parse_hotel_card(hotel_link, currency, page, browser)
                    if hotel:
                        hotels.append(hotel)
                        print(f'[hotels-worker] Parsed hotel {i+1}: {hotel.get("name")}', file=sys.stderr)
                except Exception as parse_err:
                    print(f'[hotels-worker] Error parsing card {i+1}: {parse_err}', file=sys.stderr)
                    continue

            browser.close()

            if not hotels:
                return {
                    'error': 'No hotels found',
                    'hotels': [],
                    'searchUrl': search_url,
                }

            return {
                'hotels': hotels,
                'searchUrl': search_url,
            }

    except Exception as fetch_error:
        print(f'[hotels-worker] Fetch failed: {str(fetch_error)}', file=sys.stderr)
        return {
            'error': str(fetch_error),
            'hotels': [],
            'searchUrl': search_url,
        }


def _parse_hotel_card(hotel_link, currency, page, browser):
    """Parse a single hotel card from Google Hotels."""
    try:
        # Get the parent card element
        card = hotel_link.evaluate_handle('element => element.parentElement').as_element()
        
        # Hotel name (h2 tag)
        name = ''
        name_elem = card.query_selector('h2')
        if name_elem:
            name = name_elem.inner_text().strip()
        
        # Hotel URL
        booking_url = hotel_link.get_attribute('href') or ''
        if booking_url and not booking_url.startswith('http'):
            booking_url = 'https://www.google.com' + booking_url
        
        # Price (span with specific classes)
        price_total = 'N/A'
        price_spans = card.query_selector_all('span')
        for span in price_spans:
            text = span.inner_text().strip()
            # Look for price indicators ($, €, £, etc.)
            if text and any(symbol in text for symbol in ['$', '€', '£', 'USD', 'EUR', 'GBP']):
                # Avoid "DEAL" or "GREAT PRICE" labels
                if text not in ['DEAL', 'GREAT PRICE', 'PRICE DROP']:
                    price_total = text
                    break
        
        # Rating (span with role="img")
        rating = None
        rating_elem = card.query_selector('span[role="img"]')
        if rating_elem:
            aria_label = rating_elem.get_attribute('aria-label') or ''
            # Extract number from "Rated 4.5 out of 5"
            match = re.search(r'(\d+\.?\d*)', aria_label)
            if match:
                try:
                    rating = float(match.group(1))
                except:
                    rating = None
        
        # Navigate to detail page to get address, coordinates, room info
        address = ''
        latitude = None
        longitude = None
        room_type = ''
        beds = ''
        
        if booking_url:
            try:
                detail_page = browser.new_page()
                detail_page.goto(booking_url, wait_until='domcontentloaded', timeout=8000)
                detail_page.wait_for_timeout(2000)
                
                # Extract address from detail page
                try:
                    address_elem = detail_page.query_selector('div.K4nuhf span')
                    if address_elem:
                        address = address_elem.inner_text().strip()
                except:
                    pass
                
                # Extract coordinates from map link or page data
                try:
                    # Look for coordinates in the page URL or data attributes
                    page_content = detail_page.content()
                    # Google embeds coordinates in various formats, look for lat/lng patterns
                    coord_match = re.search(r'\"lat\":([-\d.]+),\"lng\":([-\d.]+)', page_content)
                    if coord_match:
                        latitude = float(coord_match.group(1))
                        longitude = float(coord_match.group(2))
                except:
                    pass
                
                # Extract room type and beds from price section
                try:
                    room_elems = detail_page.query_selector_all('div.BgYkof, div.kixHKb')
                    for elem in room_elems:
                        text = elem.inner_text().strip().lower()
                        if any(keyword in text for keyword in ['room', 'suite', 'bed']):
                            room_type = elem.inner_text().strip()
                            # Extract beds count
                            if 'double' in text or 'twin' in text:
                                beds = '2'
                            elif 'single' in text:
                                beds = '1'
                            elif 'king' in text or 'queen' in text:
                                beds = '1'
                            break
                except:
                    pass
                
                detail_page.close()
            except:
                # Silently continue if detail page fails
                pass
        
        # Amenities (li elements)
        amenities = []
        amenity_elems = card.query_selector_all('li')
        for elem in amenity_elems[:10]:  # Limit to 10 amenities
            amenity_text = elem.inner_text().strip()
            if amenity_text:
                amenities.append(amenity_text)
        
        # Image
        image = None
        img_elem = card.query_selector('img')
        if img_elem:
            image = img_elem.get_attribute('src')
        
        return {
            'name': name,
            'address': address,
            'latitude': latitude,
            'longitude': longitude,
            'pricePerNight': price_total,
            'priceTotal': price_total,
            'currency': currency,
            'rating': rating,
            'roomType': room_type,
            'beds': beds,
            'bookingUrl': booking_url,
            'image': image,
            'cancellationPolicy': '',
            'amenities': amenities,
            'distanceFromCenter': '',
        }
    except Exception as e:
        print(f'[hotels-worker] Error in _parse_hotel_card: {e}', file=sys.stderr)
        return None


if __name__ == '__main__':
    main()
