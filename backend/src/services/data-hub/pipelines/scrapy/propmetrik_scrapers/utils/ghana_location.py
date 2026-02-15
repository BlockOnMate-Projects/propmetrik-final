# -*- coding: utf-8 -*-
"""
Ghana Location Extractor

Utility for extracting and parsing location details from Ghana property listings.
Includes support for:
- Ghana Post GPS digital addresses (XX-XXXX-XXXX format)
- Landmark extraction
- Street name extraction
- Neighborhood recognition
- Region/city inference
"""
import re
from typing import Optional, List, Dict, Tuple


# Ghana Post GPS regex patterns
# Format: XX-XXXX-XXXX or variations
GHANA_POST_PATTERNS = [
    re.compile(r'\b([A-Z]{2})-?(\d{3,4})-?(\d{3,4})\b', re.IGNORECASE),
    re.compile(r'\b([A-Z]{2})\s+(\d{3,4})\s+(\d{4})\b', re.IGNORECASE),
    re.compile(r'GPS[:\s]+([A-Z]{2})-?(\d{3,4})-?(\d{4})', re.IGNORECASE),
    re.compile(r'Digital\s*Address[:\s]+([A-Z]{2})-?(\d{3,4})-?(\d{4})', re.IGNORECASE),
    re.compile(r'GhanaPostGPS[:\s]+([A-Z]{2})-?(\d{3,4})-?(\d{4})', re.IGNORECASE),
    re.compile(r'Ghana\s*Post\s*GPS[:\s]+([A-Z]{2})-?(\d{3,4})-?(\d{4})', re.IGNORECASE),
]

# Valid Ghana GPS district codes with their regions
# Comprehensive mapping of all Ghana Post GPS prefixes
GHANA_GPS_DISTRICTS = {
    # Greater Accra Region - most detailed for real estate focus
    'GA': {'region': 'Greater Accra', 'district': 'Accra Metropolitan'},
    'GB': {'region': 'Greater Accra', 'district': 'Ashaiman Municipal'},
    'GC': {'region': 'Greater Accra', 'district': 'Ga Central'},
    'GD': {'region': 'Greater Accra', 'district': 'Adenta Municipal'},
    'GE': {'region': 'Greater Accra', 'district': 'Ga East'},
    'GF': {'region': 'Greater Accra', 'district': 'La Dadekotopon'},
    'GK': {'region': 'Greater Accra', 'district': 'Krowor'},
    'GL': {'region': 'Greater Accra', 'district': 'Ledzokuku'},
    'GM': {'region': 'Greater Accra', 'district': 'La Nkwantanang Madina'},
    'GN': {'region': 'Greater Accra', 'district': 'Ningo Prampram'},
    'GO': {'region': 'Greater Accra', 'district': 'Ablekuma West'},
    'GR': {'region': 'Greater Accra', 'district': 'Okaikoi South'},
    'GS': {'region': 'Greater Accra', 'district': 'Ga South'},
    'GT': {'region': 'Greater Accra', 'district': 'Tema Metropolitan'},
    'GW': {'region': 'Greater Accra', 'district': 'Ga West'},
    'GX': {'region': 'Greater Accra', 'district': 'Ada West'},
    'GY': {'region': 'Greater Accra', 'district': 'Ada East'},
    'GZ': {'region': 'Greater Accra', 'district': 'Shai Osudoku'},
    
    # Ashanti Region
    'AK': {'region': 'Ashanti', 'district': 'Kumasi Metropolitan'},
    'AH': {'region': 'Ashanti', 'district': 'Ashanti (General)'},
    'AB': {'region': 'Ashanti', 'district': 'Bosomtwe'},
    'AE': {'region': 'Ashanti', 'district': 'Ejisu Municipal'},
    'AM': {'region': 'Ashanti', 'district': 'Mampong Municipal'},
    'AO': {'region': 'Ashanti', 'district': 'Obuasi Municipal'},
    'AS': {'region': 'Ashanti', 'district': 'Sekyere South'},
    'AT': {'region': 'Ashanti', 'district': 'Oforikrom'},
    
    # Central Region
    'CC': {'region': 'Central', 'district': 'Cape Coast Metropolitan'},
    'CR': {'region': 'Central', 'district': 'Central Region (General)'},
    'CE': {'region': 'Central', 'district': 'Effutu Municipal'},
    'CK': {'region': 'Central', 'district': 'Kasoa (Awutu Senya)'},
    
    # Eastern Region
    'ER': {'region': 'Eastern', 'district': 'Eastern Region (General)'},
    'EK': {'region': 'Eastern', 'district': 'New Juaben (Koforidua)'},
    'EW': {'region': 'Eastern', 'district': 'West Akim'},
    'ES': {'region': 'Eastern', 'district': 'Suhum'},
    
    # Western Region
    'WR': {'region': 'Western', 'district': 'Western Region (General)'},
    'WS': {'region': 'Western', 'district': 'Sekondi-Takoradi'},
    'WN': {'region': 'Western North', 'district': 'Western North (General)'},
    
    # Volta Region
    'VR': {'region': 'Volta', 'district': 'Volta Region (General)'},
    'VH': {'region': 'Volta', 'district': 'Ho Municipal'},
    'VK': {'region': 'Volta', 'district': 'Keta Municipal'},
    
    # Northern Region
    'NR': {'region': 'Northern', 'district': 'Northern Region (General)'},
    'NT': {'region': 'Northern', 'district': 'Tamale Metropolitan'},
    'NE': {'region': 'North East', 'district': 'North East Region (General)'},
    
    # Upper East Region  
    'UE': {'region': 'Upper East', 'district': 'Upper East (General)'},
    'UB': {'region': 'Upper East', 'district': 'Bolgatanga Municipal'},
    
    # Upper West Region
    'UW': {'region': 'Upper West', 'district': 'Upper West (General)'},
    
    # Bono Regions
    'BO': {'region': 'Bono', 'district': 'Bono Region (General)'},
    'BE': {'region': 'Bono East', 'district': 'Bono East (General)'},
    'AF': {'region': 'Ahafo', 'district': 'Ahafo Region (General)'},
    
    # Oti Region
    'OR': {'region': 'Oti', 'district': 'Oti Region (General)'},
    
    # Savannah Region
    'SA': {'region': 'Savannah', 'district': 'Savannah Region (General)'},
}

# Backward compatibility - simple region code mapping
GHANA_REGION_CODES = {code: info['region'] for code, info in GHANA_GPS_DISTRICTS.items()}

# Known Ghana neighborhoods/areas with their regions
GHANA_NEIGHBORHOODS = {
    # Greater Accra
    'East Legon': 'Greater Accra',
    'East Legon Hills': 'Greater Accra',
    'Cantonments': 'Greater Accra',
    'Airport Residential': 'Greater Accra',
    'Airport Residential Area': 'Greater Accra',
    'Osu': 'Greater Accra',
    'Labone': 'Greater Accra',
    'Dzorwulu': 'Greater Accra',
    'Roman Ridge': 'Greater Accra',
    'Accra New Town': 'Greater Accra',
    'Adabraka': 'Greater Accra',
    'Ridge': 'Greater Accra',
    'Abelemkpe': 'Greater Accra',
    'North Legon': 'Greater Accra',
    'Tema': 'Greater Accra',
    'Community 25': 'Greater Accra',
    'Community 18': 'Greater Accra',
    'Community 1': 'Greater Accra',
    'Spintex': 'Greater Accra',
    'Spintex Road': 'Greater Accra',
    'Teshie': 'Greater Accra',
    'Nungua': 'Greater Accra',
    'Madina': 'Greater Accra',
    'Adenta': 'Greater Accra',
    'Dome': 'Greater Accra',
    'Kwabenya': 'Greater Accra',
    'Haatso': 'Greater Accra',
    'Ashongman': 'Greater Accra',
    'Dansoman': 'Greater Accra',
    'Kaneshie': 'Greater Accra',
    'Lapaz': 'Greater Accra',
    'Achimota': 'Greater Accra',
    'Tesano': 'Greater Accra',
    'Sakumono': 'Greater Accra',
    'Lashibi': 'Greater Accra',
    'Baatsonaa': 'Greater Accra',
    'Batsonaa': 'Greater Accra',
    'Ashaley Botwe': 'Greater Accra',
    'Ashale Botwe': 'Greater Accra',
    'Tse Addo': 'Greater Accra',
    'Trasacco': 'Greater Accra',
    'Trassaco': 'Greater Accra',
    'Trassaco Valley': 'Greater Accra',
    'AU Village': 'Greater Accra',
    'American House': 'Greater Accra',
    'Manet': 'Greater Accra',
    'Pokuase': 'Greater Accra',
    'Amasaman': 'Greater Accra',
    'Kasoa': 'Greater Accra',
    'Weija': 'Greater Accra',
    'Gbawe': 'Greater Accra',
    'McCarthy Hill': 'Greater Accra',
    'Sowutuom': 'Greater Accra',
    'Lakeside Estate': 'Greater Accra',
    'Oyarifa': 'Greater Accra',
    'Ogbojo': 'Greater Accra',
    'Adjiringanor': 'Greater Accra',
    'West Hills Mall': 'Greater Accra',
    'Accra Mall': 'Greater Accra',
    'A&C Mall': 'Greater Accra',
    'Marina Mall': 'Greater Accra',
    'Labadi': 'Greater Accra',
    'La': 'Greater Accra',
    'Kpone': 'Greater Accra',
    'Prampram': 'Greater Accra',
    'Ningo': 'Greater Accra',
    'Dodowa': 'Greater Accra',
    'Agbogba': 'Greater Accra',
    'Atomic': 'Greater Accra',
    'Legon': 'Greater Accra',
    'Okponglo': 'Greater Accra',
    'Shiashie': 'Greater Accra',
    'Nmai Dzorn': 'Greater Accra',
    'West Legon': 'Greater Accra',
    'Tantra Hill': 'Greater Accra',
    
    # Ashanti Region
    'Kumasi': 'Ashanti',
    'Ahodwo': 'Ashanti',
    'Nhyiaeso': 'Ashanti',
    'Santasi': 'Ashanti',
    'Bantama': 'Ashanti',
    'Adum': 'Ashanti',
    'Suame': 'Ashanti',
    'Tech': 'Ashanti',
    'KNUST': 'Ashanti',
    'Oforikrom': 'Ashanti',
    'Ejisu': 'Ashanti',
    
    # Eastern Region  
    'Aburi': 'Eastern Region',
    'Koforidua': 'Eastern Region',
    'Akosombo': 'Eastern Region',
    
    # Central Region
    'Cape Coast': 'Central Region',
    'Elmina': 'Central Region',
    'Kasoa': 'Central Region',  # Can also be Central
    
    # Western Region
    'Takoradi': 'Western Region',
    'Sekondi': 'Western Region',
}

# Landmark patterns - common words that indicate a landmark
LANDMARK_PATTERNS = [
    re.compile(r'near\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'close\s+to\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'beside\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'behind\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'opposite\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'next\s+to\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'by\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'around\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'facing\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'along\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
    re.compile(r'off\s+(?:the\s+)?(.+?)(?:[,\.]|$)', re.IGNORECASE),
]

# Street name patterns
STREET_PATTERNS = [
    re.compile(r'(\d+\s+[A-Za-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Crescent|Boulevard|Blvd)\.?)', re.IGNORECASE),
    re.compile(r'([A-Za-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Crescent|Boulevard|Blvd)\.?)', re.IGNORECASE),
    re.compile(r'((?:Oxford|Liberation|Independence|Ring|Spintex|Tema|Motorway|Beach|High|Main)\s+(?:Street|St|Road|Rd))', re.IGNORECASE),
]


class GhanaLocationExtractor:
    """
    Extracts and parses Ghana location information from property listing text.
    """
    
    def __init__(self):
        self.known_neighborhoods = {k.lower(): v for k, v in GHANA_NEIGHBORHOODS.items()}
    
    def extract_all(self, text: str, title: str = '', description: str = '') -> Dict:
        """
        Extract all location components from text.
        
        Returns dict with:
        - digital_address: Ghana Post GPS code if found
        - street: Street name/address
        - neighborhood: Recognized neighborhood name
        - landmarks: List of landmarks mentioned
        - region: Inferred region
        - city: Inferred city
        - district: District from GPS code
        """
        # Combine all text sources
        combined = ' '.join(filter(None, [title, text, description]))
        
        result = {
            'digital_address': self.extract_ghana_post_gps(combined),
            'street': self.extract_street(combined),
            'neighborhood': self.extract_neighborhood(combined),
            'landmarks': self.extract_landmarks(combined),
            'region': None,
            'city': None,
            'district': None,
        }
        
        # Get region and district from digital address
        if result['digital_address']:
            region_code = result['digital_address'][:2].upper()
            district_info = GHANA_GPS_DISTRICTS.get(region_code)
            if district_info:
                result['region'] = district_info['region']
                result['district'] = district_info['district']
                # Infer city from district
                if 'Tema' in district_info['district']:
                    result['city'] = 'Tema'
                elif 'Kumasi' in district_info['district'] or district_info['region'] == 'Ashanti':
                    result['city'] = 'Kumasi'
                elif district_info['region'] == 'Greater Accra':
                    result['city'] = 'Accra'
        
        # Infer region from neighborhood (if not already set from GPS)
        if result['neighborhood'] and not result['region']:
            result['region'] = GHANA_NEIGHBORHOODS.get(result['neighborhood'])
            
            # Infer city based on common patterns
            if result['region'] == 'Greater Accra':
                if 'tema' in result['neighborhood'].lower():
                    result['city'] = 'Tema'
                else:
                    result['city'] = 'Accra'
            elif result['region'] == 'Ashanti':
                result['city'] = 'Kumasi'
        
        return result
    
    def extract_ghana_post_gps(self, text: str) -> Optional[str]:
        """
        Extract and normalize Ghana Post GPS digital address from text.
        
        Returns format: XX-XXXX-XXXX (e.g., GA-1234-5678)
        """
        if not text:
            return None
        
        for pattern in GHANA_POST_PATTERNS:
            match = pattern.search(text)
            if match:
                groups = match.groups()
                if len(groups) >= 3:
                    region = groups[0].upper()
                    part1 = groups[1].zfill(4)
                    part2 = groups[2].zfill(4)
                    
                    # Validate region code against all known district codes
                    if region in GHANA_GPS_DISTRICTS:
                        return f"{region}-{part1}-{part2}"
        
        return None
    
    def extract_street(self, text: str) -> Optional[str]:
        """Extract street name/address from text."""
        if not text:
            return None
        
        for pattern in STREET_PATTERNS:
            match = pattern.search(text)
            if match:
                street = match.group(1).strip()
                # Clean up common issues
                street = re.sub(r'\s+', ' ', street)
                return street
        
        return None
    
    def extract_neighborhood(self, text: str) -> Optional[str]:
        """
        Extract recognized neighborhood name from text.
        Returns the canonical neighborhood name if found.
        """
        if not text:
            return None
        
        text_lower = text.lower()
        
        # Find the best match (longest neighborhood name that appears in text)
        best_match = None
        best_length = 0
        
        for neighborhood, region in GHANA_NEIGHBORHOODS.items():
            if neighborhood.lower() in text_lower:
                if len(neighborhood) > best_length:
                    best_match = neighborhood
                    best_length = len(neighborhood)
        
        return best_match
    
    def extract_landmarks(self, text: str) -> List[str]:
        """Extract landmarks mentioned in text."""
        if not text:
            return []
        
        landmarks = []
        
        for pattern in LANDMARK_PATTERNS:
            matches = pattern.findall(text)
            for match in matches:
                # Clean and validate the landmark
                landmark = match.strip()
                # Skip if too short or too long
                if 3 <= len(landmark) <= 100:
                    # Remove trailing punctuation
                    landmark = re.sub(r'[,\.\s]+$', '', landmark)
                    if landmark and landmark not in landmarks:
                        landmarks.append(landmark)
        
        return landmarks[:5]  # Limit to 5 landmarks
    
    def parse_address(self, raw_address: str) -> Dict:
        """
        Parse a raw Ghana address into components.
        
        Example inputs:
        - "East Legon, Accra"
        - "3 bedroom at Spintex near Ecobank"
        - "Tema Community 25, near SOS Village"
        - "GA-123-4567"
        """
        result = {
            'digital_address': None,
            'street': None,
            'neighborhood': None,
            'city': None,
            'region': None,
            'district': None,
            'landmarks': [],
            'raw': raw_address,
        }
        
        if not raw_address:
            return result
        
        # Extract components
        result['digital_address'] = self.extract_ghana_post_gps(raw_address)
        result['street'] = self.extract_street(raw_address)
        result['neighborhood'] = self.extract_neighborhood(raw_address)
        result['landmarks'] = self.extract_landmarks(raw_address)
        
        # Parse common patterns like "Neighborhood, City" or "Location at Neighborhood"
        parts = re.split(r'[,\-]', raw_address)
        parts = [p.strip() for p in parts if p.strip()]
        
        for part in parts:
            part_lower = part.lower()
            
            # Check if part is a known neighborhood
            if not result['neighborhood']:
                for neighborhood in GHANA_NEIGHBORHOODS:
                    if neighborhood.lower() in part_lower or part_lower in neighborhood.lower():
                        result['neighborhood'] = neighborhood
                        result['region'] = GHANA_NEIGHBORHOODS[neighborhood]
                        break
            
            # Check for cities
            if not result['city']:
                if 'accra' in part_lower:
                    result['city'] = 'Accra'
                    result['region'] = result['region'] or 'Greater Accra'
                elif 'tema' in part_lower:
                    result['city'] = 'Tema'
                    result['region'] = result['region'] or 'Greater Accra'
                elif 'kumasi' in part_lower:
                    result['city'] = 'Kumasi'
                    result['region'] = result['region'] or 'Ashanti'
                elif 'takoradi' in part_lower:
                    result['city'] = 'Takoradi'
                    result['region'] = result['region'] or 'Western Region'
            
            # Check for regions
            if not result['region']:
                for region_name in GHANA_REGION_CODES.values():
                    if region_name.lower() in part_lower:
                        result['region'] = region_name
                        break
        
        # Default region based on city
        if not result['region'] and result['city']:
            if result['city'] in ['Accra', 'Tema']:
                result['region'] = 'Greater Accra'
            elif result['city'] == 'Kumasi':
                result['region'] = 'Ashanti'
        
        # Default city based on region
        if not result['city'] and result['region']:
            if result['region'] == 'Greater Accra':
                result['city'] = 'Accra'
            elif result['region'] == 'Ashanti':
                result['city'] = 'Kumasi'
        
        return result
    
    def is_valid_ghana_post_code(self, code: str) -> bool:
        """Check if a string is a valid Ghana Post GPS code."""
        if not code:
            return False
        
        normalized = self.extract_ghana_post_gps(code)
        return normalized is not None


# Singleton instance for use in spiders
location_extractor = GhanaLocationExtractor()


def extract_ghana_location(text: str, title: str = '', description: str = '') -> Dict:
    """
    Convenience function to extract all location components.
    
    Usage in spider:
        from propmetrik_scrapers.utils.ghana_location import extract_ghana_location
        
        location_data = extract_ghana_location(
            text=address_raw,
            title=property_title,
            description=property_description
        )
    """
    return location_extractor.extract_all(text, title, description)


def extract_ghana_post_gps(text: str) -> Optional[str]:
    """
    Convenience function to extract Ghana Post GPS code from text.
    
    Returns normalized format: XX-XXXX-XXXX
    """
    return location_extractor.extract_ghana_post_gps(text)


def parse_ghana_address(raw_address: str) -> Dict:
    """
    Convenience function to parse a raw Ghana address.
    """
    return location_extractor.parse_address(raw_address)


def extract_landmarks(text: str) -> List[str]:
    """
    Convenience function to extract landmarks from text.
    
    Returns list of landmark names like:
    - "Ecobank East Legon"
    - "Marina Mall"
    - "Ghana Commercial Bank"
    """
    return location_extractor.extract_landmarks(text)


def extract_street_name(text: str) -> Optional[str]:
    """
    Convenience function to extract street name from text.
    
    Returns street name like:
    - "Oxford Street"
    - "Liberation Road"
    - "Spintex Road"
    """
    return location_extractor.extract_street(text)


def get_region_from_gps_code(gps_code: str) -> Optional[Dict[str, str]]:
    """
    Get region and district information from a Ghana Post GPS code.
    
    Returns dict with 'region' and 'district' keys, or None if invalid code.
    """
    if not gps_code or len(gps_code) < 2:
        return None
    
    region_code = gps_code[:2].upper()
    return GHANA_GPS_DISTRICTS.get(region_code)
