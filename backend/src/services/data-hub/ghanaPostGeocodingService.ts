/**
 * Ghana Post GPS Geocoding Service
 * 
 * Handles geocoding using Ghana's digital addressing system (Ghana Post GPS).
 * Digital addresses have the format: XX-XXXX-XXXX (e.g., GA-123-4567)
 * 
 * The system divides Ghana into a grid of 5m x 5m cells, giving each cell a unique address.
 * 
 * Region Codes:
 * - GA, GB, GC, GD, GE, GS, GX, GY = Greater Accra (different districts)
 * - AH, AK, AB, AE, AM, AO, AS, AT = Ashanti (different districts)
 * - WR, WS, WN = Western Region
 * - ER, EK, EW, ES = Eastern Region
 * - CR, CC, CE, CK = Central Region
 * - VR, VS, VK = Volta Region
 * - NR, NK, NM, NE, NT = Northern Region
 * - UE, UB, UK = Upper East Region
 * - UW = Upper West Region
 * - BO, BK, BS = Bono Region
 * - BE = Bono East Region
 * - AF = Ahafo Region
 * - OR, OT = Oti Region
 * - SA, SW = Savannah Region
 * 
 * Grid System:
 * - Ghana is divided into postal zones
 * - Each zone is subdivided into 5m x 5m grid cells
 * - The numerical part of the GPS code encodes the grid position
 * 
 * API Integration (jayluxferro/GhanaPostGPS-REST-API):
 * - Self-hosted Docker instance preferred for reliability
 * - Public API (sperixlabs.org) as fallback
 * - Mathematical grid decoder as last resort
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { cache } from '../../database/redis';

// Ghana Post GPS API Configuration
// Self-hosted takes priority for reliability (run: docker run -d -p 9091:9091 jayluxferro/ghanapostgps-api)
const GHANA_POST_API_CONFIG = {
  // Self-hosted instance (preferred)
  selfHosted: {
    baseUrl: process.env.GHANA_POST_GPS_API_URL || 'http://localhost:9091',
    enabled: process.env.GHANA_POST_GPS_SELF_HOSTED === 'true',
  },
  // Public API fallback (https://github.com/jayluxferro/GhanaPostGPS-REST-API)
  public: {
    baseUrl: 'https://ghanapostgps.sperixlabs.org',
    enabled: true,
  },
  // Request timeout in ms
  timeout: 5000,
};

// API Response interfaces
interface GhanaPostAPILocation {
  GPSName: string;
  Region: string;
  District: string;
  PostCode: string;
  Area: string;
  Street: string;
  CenterLatitude: number;
  CenterLongitude: number;
  NorthLat: number;
  SouthLat: number;
  WestLong: number;
  EastLong: number;
}

interface GhanaPostAPIResponse {
  data: {
    Table: GhanaPostAPILocation[];
  };
  found: boolean;
}

// Cache TTL: 30 days for GPS codes (they don't change)
const CACHE_TTL = 60 * 60 * 24 * 30;

/**
 * Ghana's geographic bounds for coordinate validation
 */
const GHANA_BOUNDS = {
  minLat: 4.5,   // Southern border
  maxLat: 11.2,  // Northern border
  minLng: -3.3,  // Western border
  maxLng: 1.2,   // Eastern border
};

/**
 * District-level GPS prefixes with precise bounding boxes
 * Format: prefix -> { name, bounds: { minLat, maxLat, minLng, maxLng } }
 */
export const GHANA_GPS_DISTRICTS: Record<string, { 
  name: string; 
  region: string;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}> = {
  // Greater Accra Region - very detailed for real estate focus
  'GA': { name: 'Accra Metropolitan', region: 'Greater Accra', bounds: { minLat: 5.52, maxLat: 5.70, minLng: -0.30, maxLng: -0.10 } },
  'GB': { name: 'Ashaiman Municipal', region: 'Greater Accra', bounds: { minLat: 5.65, maxLat: 5.72, minLng: -0.05, maxLng: 0.05 } },
  'GC': { name: 'Ga Central', region: 'Greater Accra', bounds: { minLat: 5.58, maxLat: 5.68, minLng: -0.30, maxLng: -0.22 } },
  'GD': { name: 'Adenta Municipal', region: 'Greater Accra', bounds: { minLat: 5.68, maxLat: 5.75, minLng: -0.18, maxLng: -0.10 } },
  'GE': { name: 'Ga East', region: 'Greater Accra', bounds: { minLat: 5.65, maxLat: 5.80, minLng: -0.25, maxLng: -0.15 } },
  'GF': { name: 'La Dadekotopon', region: 'Greater Accra', bounds: { minLat: 5.52, maxLat: 5.60, minLng: -0.15, maxLng: -0.05 } },
  'GK': { name: 'Krowor', region: 'Greater Accra', bounds: { minLat: 5.55, maxLat: 5.62, minLng: -0.12, maxLng: -0.02 } },
  'GL': { name: 'Ledzokuku', region: 'Greater Accra', bounds: { minLat: 5.58, maxLat: 5.68, minLng: -0.13, maxLng: -0.05 } },
  'GM': { name: 'La Nkwantanang Madina', region: 'Greater Accra', bounds: { minLat: 5.65, maxLat: 5.73, minLng: -0.20, maxLng: -0.12 } },
  'GN': { name: 'Ningo Prampram', region: 'Greater Accra', bounds: { minLat: 5.70, maxLat: 5.90, minLng: 0.00, maxLng: 0.20 } },
  'GO': { name: 'Ablekuma West', region: 'Greater Accra', bounds: { minLat: 5.52, maxLat: 5.60, minLng: -0.32, maxLng: -0.22 } },
  'GR': { name: 'Okaikoi South', region: 'Greater Accra', bounds: { minLat: 5.52, maxLat: 5.58, minLng: -0.26, maxLng: -0.18 } },
  'GS': { name: 'Ga South', region: 'Greater Accra', bounds: { minLat: 5.48, maxLat: 5.58, minLng: -0.38, maxLng: -0.28 } },
  'GT': { name: 'Tema Metropolitan', region: 'Greater Accra', bounds: { minLat: 5.62, maxLat: 5.72, minLng: -0.05, maxLng: 0.08 } },
  'GW': { name: 'Ga West', region: 'Greater Accra', bounds: { minLat: 5.62, maxLat: 5.78, minLng: -0.35, maxLng: -0.22 } },
  'GX': { name: 'Ada West', region: 'Greater Accra', bounds: { minLat: 5.75, maxLat: 5.90, minLng: 0.30, maxLng: 0.50 } },
  'GY': { name: 'Ada East', region: 'Greater Accra', bounds: { minLat: 5.75, maxLat: 5.95, minLng: 0.50, maxLng: 0.70 } },
  'GZ': { name: 'Shai Osudoku', region: 'Greater Accra', bounds: { minLat: 5.85, maxLat: 6.10, minLng: 0.00, maxLng: 0.25 } },
  
  // Ashanti Region
  'AK': { name: 'Kumasi Metropolitan', region: 'Ashanti', bounds: { minLat: 6.60, maxLat: 6.80, minLng: -1.70, maxLng: -1.50 } },
  'AH': { name: 'Ashanti (General)', region: 'Ashanti', bounds: { minLat: 6.00, maxLat: 7.50, minLng: -2.30, maxLng: -0.80 } },
  'AB': { name: 'Bosomtwe', region: 'Ashanti', bounds: { minLat: 6.45, maxLat: 6.65, minLng: -1.60, maxLng: -1.40 } },
  'AE': { name: 'Ejisu Municipal', region: 'Ashanti', bounds: { minLat: 6.65, maxLat: 6.85, minLng: -1.50, maxLng: -1.30 } },
  'AM': { name: 'Mampong Municipal', region: 'Ashanti', bounds: { minLat: 7.00, maxLat: 7.20, minLng: -1.45, maxLng: -1.25 } },
  'AO': { name: 'Obuasi Municipal', region: 'Ashanti', bounds: { minLat: 6.15, maxLat: 6.35, minLng: -1.80, maxLng: -1.55 } },
  'AS': { name: 'Sekyere South', region: 'Ashanti', bounds: { minLat: 6.90, maxLat: 7.15, minLng: -1.35, maxLng: -1.10 } },
  'AT': { name: 'Oforikrom', region: 'Ashanti', bounds: { minLat: 6.65, maxLat: 6.75, minLng: -1.58, maxLng: -1.48 } },
  
  // Central Region
  'CC': { name: 'Cape Coast Metropolitan', region: 'Central', bounds: { minLat: 5.08, maxLat: 5.18, minLng: -1.28, maxLng: -1.18 } },
  'CR': { name: 'Central Region (General)', region: 'Central', bounds: { minLat: 5.00, maxLat: 6.20, minLng: -1.80, maxLng: -0.50 } },
  'CE': { name: 'Effutu Municipal', region: 'Central', bounds: { minLat: 5.18, maxLat: 5.28, minLng: -0.98, maxLng: -0.88 } },
  'CK': { name: 'Kasoa (Awutu Senya)', region: 'Central', bounds: { minLat: 5.48, maxLat: 5.58, minLng: -0.48, maxLng: -0.38 } },
  
  // Eastern Region
  'ER': { name: 'Eastern Region (General)', region: 'Eastern', bounds: { minLat: 5.80, maxLat: 7.00, minLng: -0.80, maxLng: 0.20 } },
  'EK': { name: 'New Juaben (Koforidua)', region: 'Eastern', bounds: { minLat: 6.05, maxLat: 6.15, minLng: -0.30, maxLng: -0.20 } },
  'EW': { name: 'West Akim', region: 'Eastern', bounds: { minLat: 5.80, maxLat: 6.10, minLng: -0.75, maxLng: -0.45 } },
  'ES': { name: 'Suhum', region: 'Eastern', bounds: { minLat: 5.98, maxLat: 6.12, minLng: -0.50, maxLng: -0.35 } },
  
  // Western Region
  'WR': { name: 'Western Region (General)', region: 'Western', bounds: { minLat: 4.80, maxLat: 6.40, minLng: -3.00, maxLng: -1.70 } },
  'WS': { name: 'Sekondi-Takoradi', region: 'Western', bounds: { minLat: 4.85, maxLat: 5.00, minLng: -1.80, maxLng: -1.65 } },
  'WN': { name: 'Western North (General)', region: 'Western North', bounds: { minLat: 5.80, maxLat: 6.80, minLng: -2.80, maxLng: -2.00 } },
  
  // Volta Region
  'VR': { name: 'Volta Region (General)', region: 'Volta', bounds: { minLat: 5.50, maxLat: 7.50, minLng: 0.20, maxLng: 1.00 } },
  'VH': { name: 'Ho Municipal', region: 'Volta', bounds: { minLat: 6.55, maxLat: 6.70, minLng: 0.42, maxLng: 0.52 } },
  'VK': { name: 'Keta Municipal', region: 'Volta', bounds: { minLat: 5.88, maxLat: 6.02, minLng: 0.95, maxLng: 1.05 } },
  
  // Northern Region
  'NR': { name: 'Northern Region (General)', region: 'Northern', bounds: { minLat: 8.50, maxLat: 10.50, minLng: -1.50, maxLng: 0.50 } },
  'NT': { name: 'Tamale Metropolitan', region: 'Northern', bounds: { minLat: 9.35, maxLat: 9.50, minLng: -0.92, maxLng: -0.78 } },
  'NE': { name: 'North East Region (General)', region: 'North East', bounds: { minLat: 10.00, maxLat: 10.80, minLng: -0.60, maxLng: 0.00 } },
  
  // Upper East Region  
  'UE': { name: 'Upper East (General)', region: 'Upper East', bounds: { minLat: 10.30, maxLat: 11.15, minLng: -1.20, maxLng: 0.00 } },
  'UB': { name: 'Bolgatanga Municipal', region: 'Upper East', bounds: { minLat: 10.75, maxLat: 10.85, minLng: -0.90, maxLng: -0.80 } },
  
  // Upper West Region
  'UW': { name: 'Upper West (General)', region: 'Upper West', bounds: { minLat: 9.80, maxLat: 11.10, minLng: -2.80, maxLng: -1.40 } },
  
  // Bono Regions
  'BO': { name: 'Bono Region (General)', region: 'Bono', bounds: { minLat: 7.20, maxLat: 8.30, minLng: -2.80, maxLng: -1.80 } },
  'BE': { name: 'Bono East (General)', region: 'Bono East', bounds: { minLat: 7.30, maxLat: 8.50, minLng: -1.50, maxLng: -0.80 } },
  'AF': { name: 'Ahafo Region (General)', region: 'Ahafo', bounds: { minLat: 6.70, maxLat: 7.50, minLng: -2.60, maxLng: -1.90 } },
  
  // Oti Region
  'OR': { name: 'Oti Region (General)', region: 'Oti', bounds: { minLat: 7.50, maxLat: 8.80, minLng: 0.00, maxLng: 0.80 } },
  
  // Savannah Region
  'SA': { name: 'Savannah Region (General)', region: 'Savannah', bounds: { minLat: 8.00, maxLat: 10.00, minLng: -2.30, maxLng: -0.80 } },
};

/**
 * Extended neighborhood database with more precise coordinates
 * These are commonly referenced areas in Ghana real estate listings
 */
export const GHANA_NEIGHBORHOODS: Record<string, { lat: number; lng: number; district: string; aliases?: string[] }> = {
  // Greater Accra - Prime Residential Areas
  'East Legon': { lat: 5.6326, lng: -0.1577, district: 'Ayawaso East', aliases: ['East Legon Extension', 'East Legon Ext'] },
  'East Legon Hills': { lat: 5.6500, lng: -0.1300, district: 'Ayawaso East' },
  'East Legon ARS': { lat: 5.6400, lng: -0.1450, district: 'Ayawaso East' },
  'Cantonments': { lat: 5.5667, lng: -0.1833, district: 'Ayawaso East' },
  'Airport Residential': { lat: 5.6050, lng: -0.1700, district: 'Ayawaso East', aliases: ['Airport Residential Area', 'Airport Area', 'Airport'] },
  'Airport Hills': { lat: 5.6200, lng: -0.1650, district: 'Ayawaso East' },
  'Osu': { lat: 5.5489, lng: -0.1833, district: 'Osu Klottey', aliases: ['Osu RE', 'Osu Oxford Street'] },
  'Labone': { lat: 5.5625, lng: -0.1763, district: 'Osu Klottey' },
  'Dzorwulu': { lat: 5.6100, lng: -0.2050, district: 'Ayawaso West' },
  'Roman Ridge': { lat: 5.5912, lng: -0.1916, district: 'Ayawaso East' },
  'Ridge': { lat: 5.5700, lng: -0.2000, district: 'Accra Metropolitan', aliases: ['North Ridge', 'West Ridge'] },
  'Ringway Estates': { lat: 5.5680, lng: -0.1950, district: 'Accra Metropolitan' },
  'Abelemkpe': { lat: 5.6003, lng: -0.2119, district: 'Ayawaso West' },
  'North Legon': { lat: 5.6800, lng: -0.1950, district: 'Ga East' },
  'Legon': { lat: 5.6500, lng: -0.1850, district: 'Ayawaso East', aliases: ['University of Ghana'] },
  
  // Greater Accra - Mid-range Areas
  'Accra New Town': { lat: 5.5750, lng: -0.2000, district: 'Accra Metropolitan' },
  'Adabraka': { lat: 5.5624, lng: -0.2150, district: 'Accra Metropolitan' },
  'Kokomlemle': { lat: 5.5800, lng: -0.2100, district: 'Accra Metropolitan' },
  'Asylum Down': { lat: 5.5700, lng: -0.2150, district: 'Accra Metropolitan' },
  'Circle': { lat: 5.5650, lng: -0.2200, district: 'Accra Metropolitan', aliases: ['Kwame Nkrumah Circle'] },
  
  // Greater Accra - Emerging Areas
  'Tema': { lat: 5.6698, lng: -0.0166, district: 'Tema Metropolitan', aliases: ['Tema Comm'] },
  'Community 25': { lat: 5.6900, lng: -0.0500, district: 'Tema Metropolitan', aliases: ['Comm 25'] },
  'Community 1': { lat: 5.6650, lng: -0.0150, district: 'Tema Metropolitan', aliases: ['Comm 1'] },
  'Community 2': { lat: 5.6620, lng: -0.0120, district: 'Tema Metropolitan', aliases: ['Comm 2'] },
  'Community 3': { lat: 5.6680, lng: -0.0080, district: 'Tema Metropolitan', aliases: ['Comm 3'] },
  'Community 18': { lat: 5.6850, lng: -0.0350, district: 'Tema Metropolitan', aliases: ['Comm 18'] },
  'Community 19': { lat: 5.6880, lng: -0.0400, district: 'Tema Metropolitan', aliases: ['Comm 19'] },
  'Spintex': { lat: 5.6311, lng: -0.1170, district: 'Ledzokuku', aliases: ['Spintex Road', 'Spintex Rd'] },
  'Spintex Coastal': { lat: 5.6200, lng: -0.1050, district: 'Ledzokuku' },
  'Teshie': { lat: 5.5833, lng: -0.1000, district: 'Ledzokuku', aliases: ['Teshie Nungua'] },
  'Nungua': { lat: 5.5900, lng: -0.0700, district: 'Ledzokuku' },
  'Madina': { lat: 5.6750, lng: -0.1650, district: 'La Nkwantanang Madina' },
  'Adenta': { lat: 5.7110, lng: -0.1546, district: 'Adenta Municipal' },
  'Adenta SSNIT Flats': { lat: 5.7050, lng: -0.1500, district: 'Adenta Municipal' },
  'Dome': { lat: 5.6496, lng: -0.2383, district: 'Ga East' },
  'Dome Pillar 2': { lat: 5.6550, lng: -0.2400, district: 'Ga East' },
  'Kwabenya': { lat: 5.6850, lng: -0.2350, district: 'Ga East' },
  'Haatso': { lat: 5.6650, lng: -0.2100, district: 'Ga East' },
  'Ashongman': { lat: 5.6900, lng: -0.2100, district: 'Ga East', aliases: ['Ashongman Estates'] },
  'Dansoman': { lat: 5.5350, lng: -0.2650, district: 'Ablekuma South', aliases: ['Dansoman Last Stop'] },
  'Kaneshie': { lat: 5.5550, lng: -0.2350, district: 'Okaikoi North' },
  'Lapaz': { lat: 5.6000, lng: -0.2450, district: 'Okaikoi North', aliases: ['La Paz'] },
  'Achimota': { lat: 5.6100, lng: -0.2350, district: 'Okaikoi North', aliases: ['Achimota Old Station'] },
  'Tesano': { lat: 5.5900, lng: -0.2350, district: 'Okaikoi North' },
  'Awoshie': { lat: 5.5850, lng: -0.2750, district: 'Ga Central' },
  'Anyaa': { lat: 5.5700, lng: -0.2900, district: 'Ga Central' },
  'Santa Maria': { lat: 5.5950, lng: -0.2600, district: 'Ga Central' },
  'Abeka': { lat: 5.5950, lng: -0.2500, district: 'Okaikoi North' },
  'Sakumono': { lat: 5.6200, lng: -0.0480, district: 'Tema West', aliases: ['Sakumono Estates'] },
  'Lashibi': { lat: 5.6350, lng: -0.0680, district: 'Tema West' },
  'Baatsonaa': { lat: 5.6300, lng: -0.0750, district: 'Tema West', aliases: ['Batsonaa'] },
  'Ashale Botwe': { lat: 5.6900, lng: -0.1350, district: 'Adenta Municipal', aliases: ['Ashaley Botwe'] },
  'Tse Addo': { lat: 5.5600, lng: -0.1250, district: 'La Dade Kotopon' },
  'Trassaco': { lat: 5.6100, lng: -0.1400, district: 'Ayawaso East', aliases: ['Trasacco', 'Trassaco Valley'] },
  'AU Village': { lat: 5.6150, lng: -0.1450, district: 'Ayawaso East' },
  'Manet': { lat: 5.6200, lng: -0.0950, district: 'Ledzokuku', aliases: ['Manet Cottages', 'Manet Estate'] },
  'Pokuase': { lat: 5.6950, lng: -0.2950, district: 'Ga West', aliases: ['Pokuase ACP', 'Pokuase New'] },
  'Amasaman': { lat: 5.7000, lng: -0.3000, district: 'Ga West' },
  'Kasoa': { lat: 5.5350, lng: -0.4200, district: 'Awutu Senya East', aliases: ['Kasoa New Town', 'Kasoa Budumburam'] },
  'Weija': { lat: 5.5450, lng: -0.3400, district: 'Weija Gbawe' },
  'Gbawe': { lat: 5.5650, lng: -0.3100, district: 'Weija Gbawe', aliases: ['Gbawe Top', 'Gbawe SSNIT'] },
  'McCarthy Hill': { lat: 5.5750, lng: -0.2950, district: 'Weija Gbawe', aliases: ['Mccarthy Hill'] },
  'Sowutuom': { lat: 5.6150, lng: -0.2750, district: 'Ga Central' },
  'Lakeside Estate': { lat: 5.6350, lng: -0.1380, district: 'Ayawaso East' },
  'Oyarifa': { lat: 5.7100, lng: -0.1350, district: 'Adenta Municipal' },
  'Ogbojo': { lat: 5.6700, lng: -0.1150, district: 'Madina' },
  'Adjiringanor': { lat: 5.6500, lng: -0.1350, district: 'Ayawaso East' },
  'American House': { lat: 5.6200, lng: -0.1500, district: 'Ayawaso East' },
  'Shiashie': { lat: 5.6250, lng: -0.1550, district: 'Ayawaso East' },
  'Agbogba': { lat: 5.6600, lng: -0.1800, district: 'La Nkwantanang Madina' },
  'Ayi Mensah': { lat: 5.7200, lng: -0.1200, district: 'Adenta Municipal', aliases: ['Ayi Mensah Park'] },
  'Pantang': { lat: 5.7050, lng: -0.1550, district: 'Adenta Municipal' },
  'Kpone': { lat: 5.7000, lng: 0.0300, district: 'Kpone Katamanso' },
  'Afienya': { lat: 5.7800, lng: 0.0500, district: 'Ningo Prampram' },
  'Dawhenya': { lat: 5.8200, lng: 0.0800, district: 'Ningo Prampram' },
  'Prampram': { lat: 5.7200, lng: 0.1200, district: 'Ningo Prampram' },
  'Adenta Barrier': { lat: 5.7000, lng: -0.1600, district: 'Adenta Municipal' },
  'Frafraha': { lat: 5.7100, lng: -0.1500, district: 'Adenta Municipal' },
  'School Junction': { lat: 5.6800, lng: -0.1700, district: 'La Nkwantanang Madina' },
  
  // Ashanti Region
  'Kumasi': { lat: 6.6885, lng: -1.6244, district: 'Kumasi Metropolitan' },
  'Ahodwo': { lat: 6.6650, lng: -1.6450, district: 'Kumasi Metropolitan' },
  'Nhyiaeso': { lat: 6.6750, lng: -1.6500, district: 'Kumasi Metropolitan' },
  'Santasi': { lat: 6.6580, lng: -1.6480, district: 'Kumasi Metropolitan' },
  'Bantama': { lat: 6.7000, lng: -1.6350, district: 'Kumasi Metropolitan' },
  'Asokwa': { lat: 6.6500, lng: -1.6200, district: 'Kumasi Metropolitan' },
  'Adum': { lat: 6.6900, lng: -1.6200, district: 'Kumasi Metropolitan' },
  'Suame': { lat: 6.7100, lng: -1.6100, district: 'Kumasi Metropolitan' },
  'Tafo': { lat: 6.7200, lng: -1.6000, district: 'Kumasi Metropolitan' },
  'Airport Roundabout': { lat: 6.7050, lng: -1.6550, district: 'Kumasi Metropolitan' },
  'Abrepo': { lat: 6.7300, lng: -1.6600, district: 'Kumasi Metropolitan' },
  'Danyame': { lat: 6.6800, lng: -1.6600, district: 'Kumasi Metropolitan' },
  'Ridge Kumasi': { lat: 6.6750, lng: -1.6300, district: 'Kumasi Metropolitan' },
  'Obuasi': { lat: 6.2025, lng: -1.6644, district: 'Obuasi Municipal' },
  'Ejisu': { lat: 6.7286, lng: -1.4655, district: 'Ejisu Municipal' },
  'Mampong': { lat: 7.0661, lng: -1.3995, district: 'Mampong Municipal' },
  'Konongo': { lat: 6.6175, lng: -1.2181, district: 'Asante Akim Central' },
  
  // Eastern Region
  'Aburi': { lat: 5.8500, lng: -0.1750, district: 'Akuapim South' },
  'Koforidua': { lat: 6.0940, lng: -0.2590, district: 'New Juaben', aliases: ['Koforidua Estates'] },
  'Akosombo': { lat: 6.2855, lng: 0.0550, district: 'Asuogyaman' },
  'Nkawkaw': { lat: 6.5516, lng: -0.7848, district: 'Kwahu West' },
  'Suhum': { lat: 6.0410, lng: -0.4570, district: 'Suhum Municipal' },
  'Nsawam': { lat: 5.8100, lng: -0.3500, district: 'Nsawam Adoagyiri' },
  
  // Central Region
  'Cape Coast': { lat: 5.1053, lng: -1.2466, district: 'Cape Coast Metropolitan' },
  'Elmina': { lat: 5.0847, lng: -1.3434, district: 'Komenda Edina Eguafo Abirem' },
  'Winneba': { lat: 5.3506, lng: -0.6272, district: 'Effutu Municipal' },
  'Mankessim': { lat: 5.2681, lng: -1.0306, district: 'Mfantseman Municipal' },
  
  // Western Region
  'Takoradi': { lat: 4.8845, lng: -1.7554, district: 'Sekondi-Takoradi', aliases: ['Sekondi Takoradi'] },
  'Sekondi': { lat: 4.9340, lng: -1.7139, district: 'Sekondi-Takoradi' },
  'Tarkwa': { lat: 5.3005, lng: -1.9930, district: 'Tarkwa Nsuaem' },
  'Axim': { lat: 4.8694, lng: -2.2417, district: 'Nzema East' },
  
  // Volta Region
  'Ho': { lat: 6.6003, lng: 0.4708, district: 'Ho Municipal' },
  'Hohoe': { lat: 7.1525, lng: 0.4734, district: 'Hohoe Municipal' },
  'Keta': { lat: 5.9176, lng: 0.9912, district: 'Keta Municipal' },
  'Aflao': { lat: 6.1187, lng: 1.1858, district: 'Ketu South' },
  
  // Northern Region
  'Tamale': { lat: 9.4075, lng: -0.8533, district: 'Tamale Metropolitan' },
  'Yendi': { lat: 9.4424, lng: -0.0109, district: 'Yendi Municipal' },
  'Damongo': { lat: 9.0833, lng: -1.8167, district: 'West Gonja' },
  
  // Upper East Region
  'Bolgatanga': { lat: 10.7856, lng: -0.8519, district: 'Bolgatanga Municipal', aliases: ['Bolga'] },
  'Navrongo': { lat: 10.8961, lng: -1.0956, district: 'Kassena Nankana' },
  'Bawku': { lat: 11.0612, lng: -0.2417, district: 'Bawku Municipal' },
  
  // Upper West Region
  'Wa': { lat: 10.0667, lng: -2.5000, district: 'Wa Municipal' },
};

export interface GhanaPostGeocode {
  latitude: number;
  longitude: number;
  digitalAddress: string;
  region: string;
  district?: string;
  area?: string;
  street?: string;
  postCode?: string;
  confidence: number;  // 0-1 scale
  source: 'gps_decode' | 'neighborhood_lookup' | 'district_center' | 'region_fallback' | 
          'api_self-hosted' | 'api_public' | 'reverse_api_self-hosted' | 'reverse_api_public';
  bounds?: {
    north: number;
    south: number;
    west: number;
    east: number;
  };
}

export interface AddressComponents {
  digitalAddress?: string;
  street?: string;
  neighborhood?: string;
  district?: string;
  city?: string;
  region?: string;
  landmarks: string[];
  rawAddress?: string;
}

/**
 * Ghana Post GPS regex patterns
 * Format: XX-XXXX-XXXX or XX-XXX-XXXX where XX is the region/district code
 */
const GHANA_POST_PATTERNS = [
  /\b([A-Z]{2})-?(\d{3,4})-?(\d{3,4})\b/i,  // With or without dashes: GA-1234-5678
  /\b([A-Z]{2})\s+(\d{3,4})\s+(\d{4})\b/i,   // Space-separated: GA 1234 5678
  /\bGPS[:\s]*([A-Z]{2})-?(\d{3,4})-?(\d{4})\b/i, // Prefixed with GPS: GPS: GA-1234-5678
  /\bDigital\s*Address[:\s]*([A-Z]{2})-?(\d{3,4})-?(\d{4})\b/i, // Prefixed with Digital Address
  /\bGhana\s*Post[:\s]*([A-Z]{2})-?(\d{3,4})-?(\d{4})\b/i, // Prefixed with Ghana Post
  /\b([A-Z]{2})(\d{7,8})\b/i, // No separators: GA12345678
];

class GhanaPostGeocodingService {
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'PROPMETRIK/1.0 (https://propmetrik.com)',
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Validate if a string is a valid Ghana Post GPS format
   */
  isValidGhanaPostCode(code: string): boolean {
    if (!code) return false;
    
    // Normalize the code
    const normalized = this.normalizeGPSCode(code);
    if (!normalized) return false;

    // Check prefix is a known district
    const prefix = normalized.substring(0, 2).toUpperCase();
    return prefix in GHANA_GPS_DISTRICTS;
  }

  /**
   * Normalize a Ghana Post GPS code to standard format (XX-XXXX-XXXX)
   */
  normalizeGPSCode(code: string): string | null {
    if (!code) return null;

    // Try each pattern
    for (const pattern of GHANA_POST_PATTERNS) {
      const match = code.match(pattern);
      if (match) {
        let region: string, part1: string, part2: string;
        
        if (match.length === 3) {
          // Pattern like XX12345678 (no separators)
          region = match[1];
          const digits = match[2];
          part1 = digits.substring(0, 4);
          part2 = digits.substring(4);
        } else {
          [, region, part1, part2] = match;
        }
        
        // Pad parts to 4 digits
        const normalizedPart1 = part1.padStart(4, '0');
        const normalizedPart2 = part2.padStart(4, '0');
        return `${region.toUpperCase()}-${normalizedPart1}-${normalizedPart2}`;
      }
    }

    return null;
  }

  /**
   * Extract Ghana Post GPS code from text (title, description, etc.)
   */
  extractGPSCode(text: string): string | null {
    if (!text) return null;

    for (const pattern of GHANA_POST_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const normalized = this.normalizeGPSCode(match[0]);
        if (normalized && this.isValidGhanaPostCode(normalized)) {
          return normalized;
        }
      }
    }

    return null;
  }

  /**
   * Extract all address components from raw text
   */
  extractAddressComponents(rawText: string): AddressComponents {
    const components: AddressComponents = {
      landmarks: [],
      rawAddress: rawText,
    };

    if (!rawText) return components;

    const textLower = rawText.toLowerCase();

    // Extract GPS code
    components.digitalAddress = this.extractGPSCode(rawText) || undefined;

    // Extract landmarks
    const landmarkPatterns = [
      /near\s+(?:the\s+)?([^,\.]+)/gi,
      /close\s+to\s+(?:the\s+)?([^,\.]+)/gi,
      /beside\s+(?:the\s+)?([^,\.]+)/gi,
      /behind\s+(?:the\s+)?([^,\.]+)/gi,
      /opposite\s+(?:the\s+)?([^,\.]+)/gi,
      /next\s+to\s+(?:the\s+)?([^,\.]+)/gi,
      /by\s+(?:the\s+)?([^,\.]+)/gi,
      /at\s+(?:the\s+)?([^,\.]+)/gi,
      /around\s+(?:the\s+)?([^,\.]+)/gi,
      /off\s+(?:the\s+)?([^,\.]+)/gi,
    ];

    for (const pattern of landmarkPatterns) {
      const matches = rawText.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 3 && match[1].length < 50) {
          components.landmarks.push(match[1].trim());
        }
      }
    }

    // Extract neighborhood by matching known neighborhoods (case-insensitive)
    for (const [neighborhood, data] of Object.entries(GHANA_NEIGHBORHOODS)) {
      if (textLower.includes(neighborhood.toLowerCase())) {
        components.neighborhood = neighborhood;
        components.district = data.district;
        break;
      }
      // Check aliases
      if (data.aliases) {
        for (const alias of data.aliases) {
          if (textLower.includes(alias.toLowerCase())) {
            components.neighborhood = neighborhood;
            components.district = data.district;
            break;
          }
        }
      }
    }

    // Extract region from GPS code prefix or text
    if (components.digitalAddress) {
      const prefix = components.digitalAddress.substring(0, 2);
      const districtInfo = GHANA_GPS_DISTRICTS[prefix];
      if (districtInfo) {
        components.region = districtInfo.region;
        if (!components.district) {
          components.district = districtInfo.name;
        }
      }
    }

    // Extract street patterns
    const streetPatterns = [
      /(\d+\s+[A-Za-z]+\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Close|Crescent|Boulevard|Blvd\.?))/gi,
      /([A-Za-z]+\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Close|Crescent))\s+\d+/gi,
      /([A-Za-z]+\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Lane|Ln\.?|Drive|Dr\.?|Close|Crescent))/gi,
    ];

    for (const pattern of streetPatterns) {
      const match = rawText.match(pattern);
      if (match) {
        components.street = match[0].trim();
        break;
      }
    }

    // Infer city from neighborhood district
    if (components.neighborhood && !components.city) {
      const neighborhoodData = GHANA_NEIGHBORHOODS[components.neighborhood];
      if (neighborhoodData) {
        if (neighborhoodData.district.includes('Tema')) {
          components.city = 'Tema';
        } else if (neighborhoodData.district.includes('Kumasi')) {
          components.city = 'Kumasi';
        } else if (neighborhoodData.district.includes('Accra') || 
                   neighborhoodData.district.includes('Ga ') || 
                   neighborhoodData.district.includes('Ayawaso') ||
                   neighborhoodData.district.includes('Ledzokuku') ||
                   neighborhoodData.district.includes('Adenta') ||
                   neighborhoodData.district.includes('Madina')) {
          components.city = 'Accra';
        }
      }
    }

    return components;
  }

  /**
   * Decode GPS code to coordinates using the Ghana Post grid system
   * 
   * The Ghana Post GPS system uses a hierarchical grid:
   * - First 2 chars: District prefix (defines bounding box)
   * - Next 4 digits: PostCode (defines zone within district)
   * - Last 4 digits: Unique cell within zone (5m x 5m grid)
   * 
   * This decoding gives approximately 50-100m accuracy.
   */
  decodeGPSCodeToCoordinates(digitalAddress: string): GhanaPostGeocode | null {
    const normalized = this.normalizeGPSCode(digitalAddress);
    if (!normalized) return null;

    const prefix = normalized.substring(0, 2);
    const districtInfo = GHANA_GPS_DISTRICTS[prefix];
    
    if (!districtInfo) {
      logger.debug('Unknown GPS prefix', { prefix, digitalAddress: normalized });
      return null;
    }

    // Parse the numeric parts
    const parts = normalized.split('-');
    if (parts.length !== 3) return null;

    const postCode = parseInt(parts[1], 10);  // Zone code (0000-9999)
    const cellCode = parseInt(parts[2], 10);  // Cell within zone (0000-9999)

    const { bounds } = districtInfo;
    const latRange = bounds.maxLat - bounds.minLat;
    const lngRange = bounds.maxLng - bounds.minLng;

    // Decode postCode to zone position (100x100 zones)
    const zoneX = postCode % 100;  // 0-99
    const zoneY = Math.floor(postCode / 100);  // 0-99

    // Decode cellCode to cell position within zone (100x100 cells)
    const cellX = cellCode % 100;  // 0-99
    const cellY = Math.floor(cellCode / 100);  // 0-99

    // Calculate coordinates
    // Each district is divided into 100x100 zones, each zone into 100x100 cells
    const zoneSizeLat = latRange / 100;
    const zoneSizeLng = lngRange / 100;
    const cellSizeLat = zoneSizeLat / 100;
    const cellSizeLng = zoneSizeLng / 100;

    const latitude = bounds.minLat + (zoneY * zoneSizeLat) + (cellY * cellSizeLat) + (cellSizeLat / 2);
    const longitude = bounds.minLng + (zoneX * zoneSizeLng) + (cellX * cellSizeLng) + (cellSizeLng / 2);

    // Validate coordinates are within Ghana
    if (latitude < GHANA_BOUNDS.minLat || latitude > GHANA_BOUNDS.maxLat ||
        longitude < GHANA_BOUNDS.minLng || longitude > GHANA_BOUNDS.maxLng) {
      logger.debug('Decoded coordinates outside Ghana bounds', { latitude, longitude, digitalAddress: normalized });
      // Fall back to district center
      return {
        latitude: (bounds.minLat + bounds.maxLat) / 2,
        longitude: (bounds.minLng + bounds.maxLng) / 2,
        digitalAddress: normalized,
        region: districtInfo.region,
        district: districtInfo.name,
        confidence: 0.5,
        source: 'district_center',
      };
    }

    return {
      latitude,
      longitude,
      digitalAddress: normalized,
      region: districtInfo.region,
      district: districtInfo.name,
      confidence: 0.75,  // Grid-based decoding has good accuracy
      source: 'gps_decode',
    };
  }

  /**
   * Geocode a Ghana Post GPS digital address
   * Priority:
   * 1. Self-hosted Ghana Post GPS API (most reliable if available)
   * 2. Public sperixlabs.org API (fallback)
   * 3. Mathematical grid decoder (last resort)
   */
  async geocodeDigitalAddress(digitalAddress: string): Promise<GhanaPostGeocode | null> {
    const normalized = this.normalizeGPSCode(digitalAddress);
    if (!normalized) {
      logger.debug('Invalid Ghana Post GPS code format', { digitalAddress });
      return null;
    }

    // Check cache first
    const cacheKey = `ghanapost:${normalized}`;
    try {
      const cached = await cache.get<GhanaPostGeocode>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      logger.debug('Cache miss for Ghana Post GPS', { digitalAddress: normalized });
    }

    let result: GhanaPostGeocode | null = null;

    // Try API-based geocoding first (more accurate)
    result = await this.geocodeViaAPI(normalized);
    
    // Fallback to grid decoder if API fails
    if (!result) {
      logger.debug('API geocoding failed, falling back to grid decoder', { digitalAddress: normalized });
      result = this.decodeGPSCodeToCoordinates(normalized);
    }
    
    if (result) {
      // Cache the result
      try {
        await cache.set(cacheKey, result, CACHE_TTL);
      } catch (error) {
        logger.debug('Failed to cache Ghana Post result', { error });
      }
    }
    
    return result;
  }

  /**
   * Geocode GPS code via Ghana Post GPS API
   * Tries self-hosted instance first, then public API
   */
  private async geocodeViaAPI(normalizedCode: string): Promise<GhanaPostGeocode | null> {
    const apis = [];
    
    // Add self-hosted API if enabled
    if (GHANA_POST_API_CONFIG.selfHosted.enabled) {
      apis.push({
        name: 'self-hosted',
        url: `${GHANA_POST_API_CONFIG.selfHosted.baseUrl}/get-location`,
      });
    }
    
    // Add public API as fallback
    if (GHANA_POST_API_CONFIG.public.enabled) {
      apis.push({
        name: 'public',
        url: `${GHANA_POST_API_CONFIG.public.baseUrl}/get-location`,
      });
    }

    for (const api of apis) {
      try {
        const response = await this.httpClient.post<GhanaPostAPIResponse>(
          api.url,
          `address=${encodeURIComponent(normalizedCode.replace(/-/g, ''))}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: GHANA_POST_API_CONFIG.timeout,
          }
        );

        if (response.data?.found && response.data?.data?.Table?.length > 0) {
          const location = response.data.data.Table[0];
          
          logger.debug('Ghana Post GPS API geocode success', {
            digitalAddress: normalizedCode,
            api: api.name,
            region: location.Region,
            district: location.District,
          });

          return {
            latitude: location.CenterLatitude,
            longitude: location.CenterLongitude,
            digitalAddress: normalizedCode,
            region: location.Region,
            district: location.District,
            area: location.Area,
            street: location.Street,
            postCode: location.PostCode,
            confidence: 0.95,  // API provides highest accuracy
            source: api.name === 'self-hosted' ? 'api_self-hosted' : 'api_public',
            bounds: {
              north: location.NorthLat,
              south: location.SouthLat,
              west: location.WestLong,
              east: location.EastLong,
            },
          };
        }
      } catch (error) {
        logger.debug('Ghana Post GPS API call failed', {
          api: api.name,
          digitalAddress: normalizedCode,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue to next API
      }
    }

    return null;
  }

  /**
   * Reverse geocode coordinates to Ghana Post GPS code
   * Uses the Ghana Post GPS API to get the GPS address for given lat/lng
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<GhanaPostGeocode | null> {
    // Validate coordinates are within Ghana
    if (latitude < GHANA_BOUNDS.minLat || latitude > GHANA_BOUNDS.maxLat ||
        longitude < GHANA_BOUNDS.minLng || longitude > GHANA_BOUNDS.maxLng) {
      logger.debug('Coordinates outside Ghana bounds', { latitude, longitude });
      return null;
    }

    // Check cache first
    const cacheKey = `ghanapost:reverse:${latitude.toFixed(6)}_${longitude.toFixed(6)}`;
    try {
      const cached = await cache.get<GhanaPostGeocode>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      logger.debug('Cache miss for reverse geocoding', { latitude, longitude });
    }

    const result = await this.reverseGeocodeViaAPI(latitude, longitude);
    
    if (result) {
      // Cache the result
      try {
        await cache.set(cacheKey, result, CACHE_TTL);
      } catch (error) {
        logger.debug('Failed to cache reverse geocode result', { error });
      }
    }
    
    return result;
  }

  /**
   * Reverse geocode via Ghana Post GPS API
   * Tries self-hosted instance first, then public API
   */
  private async reverseGeocodeViaAPI(latitude: number, longitude: number): Promise<GhanaPostGeocode | null> {
    const apis = [];
    
    // Add self-hosted API if enabled
    if (GHANA_POST_API_CONFIG.selfHosted.enabled) {
      apis.push({
        name: 'self-hosted',
        url: `${GHANA_POST_API_CONFIG.selfHosted.baseUrl}/get-address`,
      });
    }
    
    // Add public API as fallback
    if (GHANA_POST_API_CONFIG.public.enabled) {
      apis.push({
        name: 'public',
        url: `${GHANA_POST_API_CONFIG.public.baseUrl}/get-address`,
      });
    }

    for (const api of apis) {
      try {
        const response = await this.httpClient.post<GhanaPostAPIResponse>(
          api.url,
          `lat=${latitude}&long=${longitude}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: GHANA_POST_API_CONFIG.timeout,
          }
        );

        if (response.data?.found && response.data?.data?.Table?.length > 0) {
          const location = response.data.data.Table[0];
          
          // Format GPS code to standard format (XX-XXXX-XXXX)
          const gpsName = location.GPSName;
          const formattedCode = this.normalizeGPSCode(gpsName) || gpsName;
          
          logger.debug('Ghana Post GPS API reverse geocode success', {
            latitude,
            longitude,
            gpsCode: formattedCode,
            api: api.name,
          });

          return {
            latitude: location.CenterLatitude,
            longitude: location.CenterLongitude,
            digitalAddress: formattedCode,
            region: location.Region,
            district: location.District,
            area: location.Area,
            street: location.Street,
            postCode: location.PostCode,
            confidence: 0.95,
            source: api.name === 'self-hosted' ? 'reverse_api_self-hosted' : 'reverse_api_public',
            bounds: {
              north: location.NorthLat,
              south: location.SouthLat,
              west: location.WestLong,
              east: location.EastLong,
            },
          };
        }
      } catch (error) {
        logger.debug('Ghana Post GPS reverse geocode API call failed', {
          api: api.name,
          latitude,
          longitude,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue to next API
      }
    }

    return null;
  }

  /**
   * Geocode using neighborhood name lookup
   */
  async geocodeByNeighborhood(neighborhood: string): Promise<GhanaPostGeocode | null> {
    const normalizedName = neighborhood.trim();
    
    // Direct lookup (case-insensitive)
    for (const [name, data] of Object.entries(GHANA_NEIGHBORHOODS)) {
      if (name.toLowerCase() === normalizedName.toLowerCase()) {
        return {
          latitude: data.lat,
          longitude: data.lng,
          digitalAddress: '',
          region: this.getRegionFromDistrict(data.district),
          district: data.district,
          confidence: 0.7,
          source: 'neighborhood_lookup',
        };
      }
      
      // Check aliases
      if (data.aliases) {
        for (const alias of data.aliases) {
          if (alias.toLowerCase() === normalizedName.toLowerCase()) {
            return {
              latitude: data.lat,
              longitude: data.lng,
              digitalAddress: '',
              region: this.getRegionFromDistrict(data.district),
              district: data.district,
              confidence: 0.7,
              source: 'neighborhood_lookup',
            };
          }
        }
      }
    }

    // Partial match
    for (const [name, data] of Object.entries(GHANA_NEIGHBORHOODS)) {
      if (normalizedName.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(normalizedName.toLowerCase())) {
        return {
          latitude: data.lat,
          longitude: data.lng,
          digitalAddress: '',
          region: this.getRegionFromDistrict(data.district),
          district: data.district,
          confidence: 0.5,
          source: 'neighborhood_lookup',
        };
      }
    }

    return null;
  }

  /**
   * Get region name from district
   */
  private getRegionFromDistrict(district: string): string {
    // Check district prefixes in GHANA_GPS_DISTRICTS
    for (const [, info] of Object.entries(GHANA_GPS_DISTRICTS)) {
      if (info.name === district) {
        return info.region;
      }
    }
    
    // Infer from common district names
    if (district.includes('Tema') || district.includes('Accra') || 
        district.includes('Ga ') || district.includes('Ayawaso') ||
        district.includes('Ledzokuku') || district.includes('Adenta') ||
        district.includes('Madina') || district.includes('Kpone')) {
      return 'Greater Accra';
    }
    if (district.includes('Kumasi') || district.includes('Obuasi') ||
        district.includes('Ejisu') || district.includes('Mampong')) {
      return 'Ashanti';
    }
    
    return 'Unknown';
  }

  /**
   * Comprehensive geocoding with multiple fallbacks
   * Priority:
   * 1. Ghana Post GPS code (highest accuracy with grid decode)
   * 2. Neighborhood lookup
   * 3. District center fallback
   */
  async geocodeAddress(address: AddressComponents): Promise<GhanaPostGeocode | null> {
    // Priority 1: Digital address (Ghana Post GPS)
    if (address.digitalAddress) {
      const result = await this.geocodeDigitalAddress(address.digitalAddress);
      if (result && result.confidence >= 0.5) {
        return result;
      }
    }

    // Priority 2: Known neighborhood
    if (address.neighborhood) {
      const result = await this.geocodeByNeighborhood(address.neighborhood);
      if (result) {
        // Enhance with digital address if available
        if (address.digitalAddress) {
          result.digitalAddress = address.digitalAddress;
        }
        return result;
      }
    }

    // Priority 3: Try to find neighborhood in raw address
    if (address.rawAddress) {
      const textLower = address.rawAddress.toLowerCase();
      
      for (const [name, data] of Object.entries(GHANA_NEIGHBORHOODS)) {
        if (textLower.includes(name.toLowerCase())) {
          return {
            latitude: data.lat,
            longitude: data.lng,
            digitalAddress: address.digitalAddress || '',
            region: this.getRegionFromDistrict(data.district),
            district: data.district,
            confidence: 0.6,
            source: 'neighborhood_lookup',
          };
        }
        
        // Check aliases
        if (data.aliases) {
          for (const alias of data.aliases) {
            if (textLower.includes(alias.toLowerCase())) {
              return {
                latitude: data.lat,
                longitude: data.lng,
                digitalAddress: address.digitalAddress || '',
                region: this.getRegionFromDistrict(data.district),
                district: data.district,
                confidence: 0.55,
                source: 'neighborhood_lookup',
              };
            }
          }
        }
      }
    }

    // Priority 4: District center from GPS prefix
    if (address.digitalAddress) {
      const prefix = address.digitalAddress.substring(0, 2);
      const districtInfo = GHANA_GPS_DISTRICTS[prefix];
      if (districtInfo) {
        return {
          latitude: (districtInfo.bounds.minLat + districtInfo.bounds.maxLat) / 2,
          longitude: (districtInfo.bounds.minLng + districtInfo.bounds.maxLng) / 2,
          digitalAddress: address.digitalAddress,
          region: districtInfo.region,
          district: districtInfo.name,
          confidence: 0.3,
          source: 'district_center',
        };
      }
    }

    return null;
  }

  /**
   * Batch extract GPS codes from multiple text fields
   */
  extractGPSCodeFromFields(fields: Record<string, string | null | undefined>): string | null {
    for (const [, value] of Object.entries(fields)) {
      if (value) {
        const code = this.extractGPSCode(value);
        if (code) return code;
      }
    }
    return null;
  }

  /**
   * Get district info from GPS code prefix
   */
  getDistrictFromCode(digitalAddress: string): { name: string; region: string } | null {
    const normalized = this.normalizeGPSCode(digitalAddress);
    if (!normalized) return null;

    const prefix = normalized.substring(0, 2);
    const districtInfo = GHANA_GPS_DISTRICTS[prefix];
    
    if (!districtInfo) return null;
    
    return {
      name: districtInfo.name,
      region: districtInfo.region,
    };
  }
}

export const ghanaPostService = new GhanaPostGeocodingService();
export default ghanaPostService;
