/**
 * Project Location Routes
 * Ghana GPS validation, geocoding, districts, search, and location enrichment.
 */

import { Router, Request, Response, NextFunction } from 'express';
import projectLocationService from '../services/project-management/projectLocationService';
import {
  registerPMParamValidation,
  registerProjectAccessParams,
  getAuthUserId,
  getAuthOrgId,
  requirePMWrite,
} from '../middleware/pmAuth';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['projectId']);

const getOrgId = (req: Request): string => getAuthOrgId(req);
const getUserId = (req: Request): string => getAuthUserId(req);

// Validate Ghana PostGPS code
router.post('/validate-gps', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { gps_code } = req.body;
    
    if (!gps_code) {
      return res.status(400).json({ 
        valid: false, 
        error: 'GPS code is required' 
      });
    }
    
    const result = await projectLocationService.validateAndEnrichLocation({
      ghana_post_gps: gps_code,
    });
    
    // Transform to GhanaPostValidation format expected by frontend
    res.json({
      valid: result.isValid,
      gpsCode: result.validated.ghana_post_gps || gps_code,
      address: [
        result.validated.ghana_area,
        result.validated.ghana_district,
        result.validated.ghana_region,
      ].filter(Boolean).join(', '),
      region: result.validated.ghana_region,
      district: result.validated.ghana_district,
      area: result.validated.ghana_area,
      latitude: result.validated.latitude,
      longitude: result.validated.longitude,
      confidence: result.confidence,
      source: result.source,
      errors: result.issues.filter(i => i.severity === 'error').map(i => i.message),
    });
  } catch (error) {
    next(error);
  }
});

// Validate and enrich location
router.post('/validate-location', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ghana_post_gps, latitude, longitude, address_line1, city, region } = req.body;
    
    const result = await projectLocationService.validateAndEnrichLocation({
      ghana_post_gps,
      latitude,
      longitude,
      address_line1,
      city,
      region,
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Reverse geocode coordinates
router.post('/reverse-geocode', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        valid: false, 
        error: 'latitude and longitude are required' 
      });
    }
    
    const result = await projectLocationService.validateAndEnrichLocation({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get Ghana regions
router.get('/ghana-regions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Return all 16 regions of Ghana
    const regions = [
      'Greater Accra',
      'Ashanti',
      'Western',
      'Central',
      'Eastern',
      'Volta',
      'Northern',
      'Upper East',
      'Upper West',
      'Brong-Ahafo',
      'Oti',
      'Bono East',
      'Ahafo',
      'Western North',
      'Savannah',
      'North East',
    ];
    
    res.json(regions);
  } catch (error) {
    next(error);
  }
});

// Get districts by region
router.get('/ghana-districts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    if (!region) {
      return res.status(400).json({ error: 'region is required' });
    }
    
    // Ghana districts by region (major districts/municipalities)
    const districtsByRegion: Record<string, string[]> = {
      'Greater Accra': [
        'Accra Metropolitan',
        'Tema Metropolitan',
        'Ga East Municipal',
        'Ga West Municipal',
        'Ga South Municipal',
        'Ga Central Municipal',
        'Ga North Municipal',
        'La Dade Kotopon Municipal',
        'La Nkwantanang Madina Municipal',
        'Ledzokuku Municipal',
        'Kpone Katamanso Municipal',
        'Adentan Municipal',
        'Ayawaso East Municipal',
        'Ayawaso West Municipal',
        'Ayawaso North Municipal',
        'Ayawaso Central Municipal',
        'Ablekuma North Municipal',
        'Ablekuma West Municipal',
        'Ablekuma Central Municipal',
        'Okaikwei North Municipal',
        'Korle Klottey Municipal',
        'Weija Gbawe Municipal',
        'Ada East',
        'Ada West',
        'Ningo Prampram',
        'Shai Osudoku',
      ],
      'Ashanti': [
        'Kumasi Metropolitan',
        'Obuasi Municipal',
        'Asokwa Municipal',
        'Suame Municipal',
        'Bantama Municipal',
        'Nhyiaeso Municipal',
        'Kwadaso Municipal',
        'Oforikrom Municipal',
        'Tafo-Pankrono Municipal',
        'Old Tafo Municipal',
        'Asokore Mampong Municipal',
        'Afigya Kwabre South',
        'Afigya Kwabre North',
        'Atwima Kwanwoma',
        'Atwima Mponua',
        'Atwima Nwabiagya North',
        'Atwima Nwabiagya South',
        'Bekwai Municipal',
        'Bosomtwe',
        'Ejisu Municipal',
        'Juaben Municipal',
        'Kwabre East Municipal',
      ],
      'Central': [
        'Cape Coast Metropolitan',
        'Awutu Senya East Municipal',
        'Awutu Senya West',
        'Effutu Municipal',
        'Gomoa East',
        'Gomoa West',
        'Gomoa Central',
        'Mfantsiman Municipal',
        'Abura Asebu Kwamankese',
        'Asikuma Odoben Brakwa',
        'Ajumako Enyan Essiam',
        'Ekumfi',
        'Assin North',
        'Assin South',
        'Assin Fosu Municipal',
        'Twifo Atti Morkwa',
        'Twifo Hemang Lower Denkyira',
        'Upper Denkyira East Municipal',
        'Upper Denkyira West',
        'Agona East',
        'Agona West Municipal',
      ],
      'Western': [
        'Sekondi-Takoradi Metropolitan',
        'Effia Kwesimintsim Municipal',
        'Shama',
        'Ahanta West Municipal',
        'Nzema East Municipal',
        'Ellembelle',
        'Jomoro',
        'Tarkwa Nsuaem Municipal',
        'Prestea Huni Valley Municipal',
        'Wassa Amenfi East',
        'Wassa Amenfi Central',
        'Wassa Amenfi West',
        'Wassa East',
        'Mpohor',
      ],
      'Eastern': [
        'New Juaben South Municipal',
        'New Juaben North Municipal',
        'Akuapem South',
        'Akuapem North Municipal',
        'Akyem Mansa North',
        'Akyem Mansa South',
        'Birim Central Municipal',
        'Birim North',
        'Birim South',
        'Denkyembour',
        'Kwahu Afram Plains North',
        'Kwahu Afram Plains South',
        'Kwahu East',
        'Kwahu South',
        'Kwahu West Municipal',
        'Lower Manya Krobo',
        'Upper Manya Krobo',
        'Yilo Krobo Municipal',
        'Asuogyaman',
        'Nsawam Adoagyiri Municipal',
        'Suhum Municipal',
        'Ayensuano',
        'Upper West Akyem',
        'Atiwa East',
        'Atiwa West',
        'Fanteakwa North',
        'Fanteakwa South',
      ],
      'Volta': [
        'Ho Municipal',
        'Ho West',
        'South Dayi',
        'North Dayi',
        'Keta Municipal',
        'Ketu North',
        'Ketu South Municipal',
        'Akatsi North',
        'Akatsi South',
        'Adaklu',
        'Afadzato South',
        'Hohoe Municipal',
        'Anloga',
        'Central Tongu',
        'South Tongu',
        'North Tongu',
      ],
      'Northern': [
        'Tamale Metropolitan',
        'Sagnarigu Municipal',
        'Tolon',
        'Kumbungu',
        'Savelugu Municipal',
        'Nanton',
        'Zabzugu',
        'Tatale Sanguli',
        'Yendi Municipal',
        'Mion',
        'Karaga',
        'Gushegu Municipal',
        'Nanumba North Municipal',
        'Nanumba South',
      ],
      'Upper East': [
        'Bolgatanga Municipal',
        'Bolgatanga East',
        'Bongo',
        'Builsa North',
        'Builsa South',
        'Kassena Nankana West',
        'Kassena Nankana Municipal',
        'Bawku Municipal',
        'Bawku West',
        'Binduri',
        'Garu',
        'Tempane',
        'Pusiga',
        'Nabdam',
        'Talensi',
      ],
      'Upper West': [
        'Wa Municipal',
        'Wa East',
        'Wa West',
        'Nadowli Kaleo',
        'Daffiama Bussie Issa',
        'Jirapa Municipal',
        'Lambussie Karni',
        'Lawra Municipal',
        'Nandom',
        'Sissala East',
        'Sissala West',
      ],
      'Brong-Ahafo': [
        'Sunyani Municipal',
        'Sunyani West',
        'Dormaa Municipal',
        'Dormaa East',
        'Dormaa West',
        'Berekum West',
        'Berekum East Municipal',
        'Jaman North',
        'Jaman South',
        'Tain',
        'Wenchi Municipal',
      ],
      'Oti': [
        'Krachi East Municipal',
        'Krachi West',
        'Krachi Nchumuru',
        'Biakoye',
        'Jasikan',
        'Kadjebi',
        'Nkwanta North',
        'Nkwanta South Municipal',
      ],
      'Bono East': [
        'Techiman Municipal',
        'Techiman North',
        'Nkoranza North',
        'Nkoranza South Municipal',
        'Kintampo North Municipal',
        'Kintampo South',
        'Sene East',
        'Sene West',
        'Atebubu Amantin',
        'Pru East',
        'Pru West',
      ],
      'Ahafo': [
        'Asunafo North Municipal',
        'Asunafo South',
        'Asutifi North',
        'Asutifi South',
        'Tano North Municipal',
        'Tano South',
      ],
      'Western North': [
        'Sefwi Wiawso Municipal',
        'Sefwi Akontombra',
        'Bibiani Anhwiaso Bekwai Municipal',
        'Juaboso',
        'Bia East',
        'Bia West',
        'Bodi',
        'Suaman',
        'Aowin',
      ],
      'Savannah': [
        'Damongo Municipal',
        'Sawla Tuna Kalba',
        'Bole',
        'Central Gonja',
        'East Gonja Municipal',
        'North Gonja',
        'North East Gonja',
      ],
      'North East': [
        'Nalerigu Municipal',
        'Walewale Municipal',
        'Mamprugu Moagduri',
        'Bunkpurugu Nakpanduri',
        'Yunyoo Nasuan',
        'Chereponi',
      ],
    };
    
    const districts = districtsByRegion[region as string] || [];
    res.json(districts);
  } catch (error) {
    next(error);
  }
});

// Create project with location validation
router.post('/with-location', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    
    const project = await projectLocationService.createWithValidation(
      { ...req.body, organization_id: orgId, created_by: userId }
    );
    
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

// Search projects with full-text search
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { q, region, district, type, status, limit, offset } = req.query;
    
    const results = await projectLocationService.searchProjects({
      organizationId: orgId,
      query: q as string,
      region: region as string,
      district: district as string,
      projectType: type as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Find nearby projects
router.get('/nearby', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { lat, lng, radius, limit } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }
    
    const projects = await projectLocationService.findNearbyProjects(
      orgId,
      parseFloat(lat as string),
      parseFloat(lng as string),
      radius ? parseFloat(radius as string) : 5000,
      limit ? parseInt(limit as string) : 10
    );
    
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

// Get traditional authorities by region - Static data for Ghana
router.get('/traditional-authorities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    // Static traditional authorities data by region
    const TRADITIONAL_AUTHORITIES: Record<string, Array<{id: string, name: string, chieftaincyTitle: string}>> = {
      'Greater Accra': [
        { id: 'ta-ga-1', name: 'Ga Traditional Council', chieftaincyTitle: 'Ga Mantse' },
        { id: 'ta-ga-2', name: 'Nungua Traditional Council', chieftaincyTitle: 'Nungua Mantse' },
        { id: 'ta-ga-3', name: 'Teshie Traditional Council', chieftaincyTitle: 'Teshie Mantse' },
        { id: 'ta-ga-4', name: 'La Traditional Council', chieftaincyTitle: 'La Mantse' },
        { id: 'ta-ga-5', name: 'Osu Traditional Council', chieftaincyTitle: 'Osu Mantse' },
        { id: 'ta-ga-6', name: 'Tema Traditional Council', chieftaincyTitle: 'Tema Mantse' },
        { id: 'ta-ga-7', name: 'Ada Traditional Council', chieftaincyTitle: 'Ada Mantse' },
      ],
      'Ashanti': [
        { id: 'ta-ash-1', name: 'Asanteman Council', chieftaincyTitle: 'Asantehene' },
        { id: 'ta-ash-2', name: 'Kumasi Traditional Council', chieftaincyTitle: 'Kumasihene' },
        { id: 'ta-ash-3', name: 'Ejisu Traditional Council', chieftaincyTitle: 'Ejisuhene' },
        { id: 'ta-ash-4', name: 'Mampong Traditional Council', chieftaincyTitle: 'Mamponghene' },
        { id: 'ta-ash-5', name: 'Bekwai Traditional Council', chieftaincyTitle: 'Bekwaihene' },
        { id: 'ta-ash-6', name: 'Offinso Traditional Council', chieftaincyTitle: 'Offinsohene' },
      ],
      'Central': [
        { id: 'ta-cen-1', name: 'Oguaa Traditional Council', chieftaincyTitle: 'Oguaahene' },
        { id: 'ta-cen-2', name: 'Elmina Traditional Council', chieftaincyTitle: 'Elminahene' },
        { id: 'ta-cen-3', name: 'Winneba Traditional Council', chieftaincyTitle: 'Winnebahene' },
        { id: 'ta-cen-4', name: 'Agona Traditional Council', chieftaincyTitle: 'Agonahene' },
        { id: 'ta-cen-5', name: 'Assin Traditional Council', chieftaincyTitle: 'Assinhene' },
      ],
      'Western': [
        { id: 'ta-wes-1', name: 'Sekondi Traditional Council', chieftaincyTitle: 'Sekondihene' },
        { id: 'ta-wes-2', name: 'Takoradi Traditional Council', chieftaincyTitle: 'Takoradihene' },
        { id: 'ta-wes-3', name: 'Ahanta Traditional Council', chieftaincyTitle: 'Ahantahene' },
        { id: 'ta-wes-4', name: 'Nzema Traditional Council', chieftaincyTitle: 'Nzemahene' },
      ],
      'Eastern': [
        { id: 'ta-eas-1', name: 'Akyem Abuakwa Traditional Council', chieftaincyTitle: 'Okyenhene' },
        { id: 'ta-eas-2', name: 'Kwahu Traditional Council', chieftaincyTitle: 'Kwahuhene' },
        { id: 'ta-eas-3', name: 'Akuapem Traditional Council', chieftaincyTitle: 'Akuapemhene' },
        { id: 'ta-eas-4', name: 'New Juaben Traditional Council', chieftaincyTitle: 'Omanhene' },
      ],
      'Volta': [
        { id: 'ta-vol-1', name: 'Anlo Traditional Council', chieftaincyTitle: 'Awomefia' },
        { id: 'ta-vol-2', name: 'Asogli Traditional Council', chieftaincyTitle: 'Agbogbomefia' },
        { id: 'ta-vol-3', name: 'Peki Traditional Council', chieftaincyTitle: 'Pekihene' },
        { id: 'ta-vol-4', name: 'Hohoe Traditional Council', chieftaincyTitle: 'Hohoehene' },
      ],
      'Northern': [
        { id: 'ta-nor-1', name: 'Dagbon Traditional Council', chieftaincyTitle: 'Ya-Na' },
        { id: 'ta-nor-2', name: 'Tamale Traditional Council', chieftaincyTitle: 'Tamale Na' },
        { id: 'ta-nor-3', name: 'Yendi Traditional Council', chieftaincyTitle: 'Yendi Na' },
      ],
      'Upper East': [
        { id: 'ta-ue-1', name: 'Bolgatanga Traditional Council', chieftaincyTitle: 'Bolganaba' },
        { id: 'ta-ue-2', name: 'Bawku Traditional Council', chieftaincyTitle: 'Bawkunaba' },
        { id: 'ta-ue-3', name: 'Navrongo Traditional Council', chieftaincyTitle: 'Navro-Pio' },
      ],
      'Upper West': [
        { id: 'ta-uw-1', name: 'Wa Traditional Council', chieftaincyTitle: 'Wa Na' },
        { id: 'ta-uw-2', name: 'Lawra Traditional Council', chieftaincyTitle: 'Lawra Na' },
        { id: 'ta-uw-3', name: 'Jirapa Traditional Council', chieftaincyTitle: 'Jirapa Na' },
      ],
      'Bono': [
        { id: 'ta-bon-1', name: 'Sunyani Traditional Council', chieftaincyTitle: 'Sunyanihene' },
        { id: 'ta-bon-2', name: 'Dormaa Traditional Council', chieftaincyTitle: 'Dormaahene' },
        { id: 'ta-bon-3', name: 'Berekum Traditional Council', chieftaincyTitle: 'Berekumhene' },
      ],
      'Bono East': [
        { id: 'ta-be-1', name: 'Techiman Traditional Council', chieftaincyTitle: 'Techimanhene' },
        { id: 'ta-be-2', name: 'Nkoranza Traditional Council', chieftaincyTitle: 'Nkoranzahene' },
        { id: 'ta-be-3', name: 'Kintampo Traditional Council', chieftaincyTitle: 'Kintampohene' },
      ],
      'Ahafo': [
        { id: 'ta-aha-1', name: 'Goaso Traditional Council', chieftaincyTitle: 'Goasohene' },
        { id: 'ta-aha-2', name: 'Bechem Traditional Council', chieftaincyTitle: 'Bechemhene' },
      ],
      'Oti': [
        { id: 'ta-oti-1', name: 'Dambai Traditional Council', chieftaincyTitle: 'Dambaihene' },
        { id: 'ta-oti-2', name: 'Nkwanta Traditional Council', chieftaincyTitle: 'Nkwantahene' },
      ],
      'Western North': [
        { id: 'ta-wn-1', name: 'Sefwi Traditional Council', chieftaincyTitle: 'Sefwihene' },
        { id: 'ta-wn-2', name: 'Juaboso Traditional Council', chieftaincyTitle: 'Juabosohene' },
      ],
      'North East': [
        { id: 'ta-ne-1', name: 'Nalerigu Traditional Council', chieftaincyTitle: 'Nayiri' },
        { id: 'ta-ne-2', name: 'Walewale Traditional Council', chieftaincyTitle: 'Walewalenaba' },
      ],
      'Savannah': [
        { id: 'ta-sav-1', name: 'Damongo Traditional Council', chieftaincyTitle: 'Yagbonwura' },
        { id: 'ta-sav-2', name: 'Bole Traditional Council', chieftaincyTitle: 'Bolewura' },
      ],
    };
    
    const regionKey = region as string;
    const authorities = regionKey ? (TRADITIONAL_AUTHORITIES[regionKey] || []) : [];
    
    res.json(authorities);
  } catch (error) {
    next(error);
  }
});

// Get regulatory assemblies - Static data for Ghana
router.get('/assemblies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.query;
    
    // Static assemblies data by region (same as districts but with additional metadata)
    const ASSEMBLIES: Record<string, Array<{id: string, assembly_name: string, assembly_type: string}>> = {
      'Greater Accra': [
        { id: 'asm-ga-1', assembly_name: 'Accra Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-ga-2', assembly_name: 'Tema Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-ga-3', assembly_name: 'Ga East Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-4', assembly_name: 'Ga West Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-5', assembly_name: 'Ga South Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-6', assembly_name: 'Ga North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-7', assembly_name: 'Ga Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-8', assembly_name: 'La Dade Kotopon Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-9', assembly_name: 'La Nkwantanang Madina Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-10', assembly_name: 'Ledzokuku Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-11', assembly_name: 'Krowor Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-12', assembly_name: 'Korle Klottey Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-13', assembly_name: 'Ablekuma North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-14', assembly_name: 'Ablekuma Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-15', assembly_name: 'Ablekuma West Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-16', assembly_name: 'Ayawaso North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-17', assembly_name: 'Ayawaso East Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-18', assembly_name: 'Ayawaso West Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-19', assembly_name: 'Ayawaso Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-20', assembly_name: 'Okaikwei North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-21', assembly_name: 'Weija Gbawe Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-22', assembly_name: 'Kpone Katamanso Municipal', assembly_type: 'municipal' },
        { id: 'asm-ga-23', assembly_name: 'Ada East District', assembly_type: 'district' },
        { id: 'asm-ga-24', assembly_name: 'Ada West District', assembly_type: 'district' },
        { id: 'asm-ga-25', assembly_name: 'Ningo Prampram District', assembly_type: 'district' },
        { id: 'asm-ga-26', assembly_name: 'Shai Osudoku District', assembly_type: 'district' },
      ],
      'Ashanti': [
        { id: 'asm-ash-1', assembly_name: 'Kumasi Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-ash-2', assembly_name: 'Oforikrom Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-3', assembly_name: 'Asokwa Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-4', assembly_name: 'Suame Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-5', assembly_name: 'Old Tafo Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-6', assembly_name: 'Kwadaso Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-7', assembly_name: 'Nhyiaeso Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-8', assembly_name: 'Asokore Mampong Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-9', assembly_name: 'Bantama Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-10', assembly_name: 'Ejisu Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-11', assembly_name: 'Mampong Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-12', assembly_name: 'Obuasi Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-13', assembly_name: 'Bekwai Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-14', assembly_name: 'Offinso North District', assembly_type: 'district' },
        { id: 'asm-ash-15', assembly_name: 'Offinso South Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-16', assembly_name: 'Afigya Kwabre South District', assembly_type: 'district' },
        { id: 'asm-ash-17', assembly_name: 'Kwabre East Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-18', assembly_name: 'Atwima Kwanwoma District', assembly_type: 'district' },
        { id: 'asm-ash-19', assembly_name: 'Atwima Nwabiagya Municipal', assembly_type: 'municipal' },
        { id: 'asm-ash-20', assembly_name: 'Bosomtwe District', assembly_type: 'district' },
      ],
      'Central': [
        { id: 'asm-cen-1', assembly_name: 'Cape Coast Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-cen-2', assembly_name: 'Komenda Edina Eguafo Abirem Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-3', assembly_name: 'Mfantseman Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-4', assembly_name: 'Abura Asebu Kwamankese District', assembly_type: 'district' },
        { id: 'asm-cen-5', assembly_name: 'Ajumako Enyan Essiam District', assembly_type: 'district' },
        { id: 'asm-cen-6', assembly_name: 'Assin Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-7', assembly_name: 'Assin North District', assembly_type: 'district' },
        { id: 'asm-cen-8', assembly_name: 'Assin South District', assembly_type: 'district' },
        { id: 'asm-cen-9', assembly_name: 'Twifo Atti Morkwa District', assembly_type: 'district' },
        { id: 'asm-cen-10', assembly_name: 'Upper Denkyira East Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-11', assembly_name: 'Upper Denkyira West District', assembly_type: 'district' },
        { id: 'asm-cen-12', assembly_name: 'Effutu Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-13', assembly_name: 'Gomoa Central District', assembly_type: 'district' },
        { id: 'asm-cen-14', assembly_name: 'Gomoa East District', assembly_type: 'district' },
        { id: 'asm-cen-15', assembly_name: 'Gomoa West District', assembly_type: 'district' },
        { id: 'asm-cen-16', assembly_name: 'Awutu Senya District', assembly_type: 'district' },
        { id: 'asm-cen-17', assembly_name: 'Awutu Senya East Municipal', assembly_type: 'municipal' },
        { id: 'asm-cen-18', assembly_name: 'Agona East District', assembly_type: 'district' },
        { id: 'asm-cen-19', assembly_name: 'Agona West Municipal', assembly_type: 'municipal' },
      ],
      'Western': [
        { id: 'asm-wes-1', assembly_name: 'Sekondi Takoradi Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-wes-2', assembly_name: 'Effia Kwesimintsim Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-3', assembly_name: 'Ahanta West Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-4', assembly_name: 'Shama District', assembly_type: 'district' },
        { id: 'asm-wes-5', assembly_name: 'Wassa East District', assembly_type: 'district' },
        { id: 'asm-wes-6', assembly_name: 'Mpohor District', assembly_type: 'district' },
        { id: 'asm-wes-7', assembly_name: 'Tarkwa Nsuaem Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-8', assembly_name: 'Prestea Huni Valley Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-9', assembly_name: 'Ellembelle District', assembly_type: 'district' },
        { id: 'asm-wes-10', assembly_name: 'Nzema East Municipal', assembly_type: 'municipal' },
        { id: 'asm-wes-11', assembly_name: 'Jomoro Municipal', assembly_type: 'municipal' },
      ],
      'Eastern': [
        { id: 'asm-eas-1', assembly_name: 'New Juaben South Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-2', assembly_name: 'New Juaben North Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-3', assembly_name: 'Akuapem North Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-4', assembly_name: 'Akuapem South District', assembly_type: 'district' },
        { id: 'asm-eas-5', assembly_name: 'Akyem Mansa Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-6', assembly_name: 'Birim North District', assembly_type: 'district' },
        { id: 'asm-eas-7', assembly_name: 'Birim Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-8', assembly_name: 'Birim South District', assembly_type: 'district' },
        { id: 'asm-eas-9', assembly_name: 'Abuakwa South Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-10', assembly_name: 'Abuakwa North Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-11', assembly_name: 'Kwahu West Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-12', assembly_name: 'Kwahu East District', assembly_type: 'district' },
        { id: 'asm-eas-13', assembly_name: 'Kwahu South District', assembly_type: 'district' },
        { id: 'asm-eas-14', assembly_name: 'Kwahu Afram Plains North District', assembly_type: 'district' },
        { id: 'asm-eas-15', assembly_name: 'Kwahu Afram Plains South District', assembly_type: 'district' },
        { id: 'asm-eas-16', assembly_name: 'Suhum Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-17', assembly_name: 'Ayensuano District', assembly_type: 'district' },
        { id: 'asm-eas-18', assembly_name: 'West Akim Municipal', assembly_type: 'municipal' },
        { id: 'asm-eas-19', assembly_name: 'Nsawam Adoagyiri Municipal', assembly_type: 'municipal' },
      ],
      'Volta': [
        { id: 'asm-vol-1', assembly_name: 'Ho Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-2', assembly_name: 'Ho West District', assembly_type: 'district' },
        { id: 'asm-vol-3', assembly_name: 'South Dayi District', assembly_type: 'district' },
        { id: 'asm-vol-4', assembly_name: 'Keta Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-5', assembly_name: 'Ketu South Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-6', assembly_name: 'Ketu North Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-7', assembly_name: 'Akatsi South District', assembly_type: 'district' },
        { id: 'asm-vol-8', assembly_name: 'Akatsi North District', assembly_type: 'district' },
        { id: 'asm-vol-9', assembly_name: 'South Tongu District', assembly_type: 'district' },
        { id: 'asm-vol-10', assembly_name: 'Central Tongu District', assembly_type: 'district' },
        { id: 'asm-vol-11', assembly_name: 'North Tongu District', assembly_type: 'district' },
        { id: 'asm-vol-12', assembly_name: 'Adaklu District', assembly_type: 'district' },
        { id: 'asm-vol-13', assembly_name: 'Agotime Ziope District', assembly_type: 'district' },
        { id: 'asm-vol-14', assembly_name: 'North Dayi District', assembly_type: 'district' },
        { id: 'asm-vol-15', assembly_name: 'Hohoe Municipal', assembly_type: 'municipal' },
        { id: 'asm-vol-16', assembly_name: 'Afadjato South District', assembly_type: 'district' },
      ],
      'Northern': [
        { id: 'asm-nor-1', assembly_name: 'Tamale Metropolitan', assembly_type: 'metropolitan' },
        { id: 'asm-nor-2', assembly_name: 'Sagnarigu Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-3', assembly_name: 'Yendi Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-4', assembly_name: 'Mion District', assembly_type: 'district' },
        { id: 'asm-nor-5', assembly_name: 'Nanton District', assembly_type: 'district' },
        { id: 'asm-nor-6', assembly_name: 'Savelugu Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-7', assembly_name: 'Karaga District', assembly_type: 'district' },
        { id: 'asm-nor-8', assembly_name: 'Gushegu Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-9', assembly_name: 'Saboba District', assembly_type: 'district' },
        { id: 'asm-nor-10', assembly_name: 'Tatale Sanguli District', assembly_type: 'district' },
        { id: 'asm-nor-11', assembly_name: 'Zabzugu District', assembly_type: 'district' },
        { id: 'asm-nor-12', assembly_name: 'Nanumba South District', assembly_type: 'district' },
        { id: 'asm-nor-13', assembly_name: 'Nanumba North Municipal', assembly_type: 'municipal' },
        { id: 'asm-nor-14', assembly_name: 'Kpandai District', assembly_type: 'district' },
        { id: 'asm-nor-15', assembly_name: 'Kumbungu District', assembly_type: 'district' },
        { id: 'asm-nor-16', assembly_name: 'Tolon District', assembly_type: 'district' },
      ],
      'Upper East': [
        { id: 'asm-ue-1', assembly_name: 'Bolgatanga Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-2', assembly_name: 'Bolgatanga East District', assembly_type: 'district' },
        { id: 'asm-ue-3', assembly_name: 'Bongo District', assembly_type: 'district' },
        { id: 'asm-ue-4', assembly_name: 'Talensi District', assembly_type: 'district' },
        { id: 'asm-ue-5', assembly_name: 'Nabdam District', assembly_type: 'district' },
        { id: 'asm-ue-6', assembly_name: 'Kassena Nankana Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-7', assembly_name: 'Kassena Nankana West District', assembly_type: 'district' },
        { id: 'asm-ue-8', assembly_name: 'Builsa North Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-9', assembly_name: 'Builsa South District', assembly_type: 'district' },
        { id: 'asm-ue-10', assembly_name: 'Bawku Municipal', assembly_type: 'municipal' },
        { id: 'asm-ue-11', assembly_name: 'Bawku West District', assembly_type: 'district' },
        { id: 'asm-ue-12', assembly_name: 'Binduri District', assembly_type: 'district' },
        { id: 'asm-ue-13', assembly_name: 'Pusiga District', assembly_type: 'district' },
        { id: 'asm-ue-14', assembly_name: 'Garu District', assembly_type: 'district' },
        { id: 'asm-ue-15', assembly_name: 'Tempane District', assembly_type: 'district' },
      ],
      'Upper West': [
        { id: 'asm-uw-1', assembly_name: 'Wa Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-2', assembly_name: 'Wa East District', assembly_type: 'district' },
        { id: 'asm-uw-3', assembly_name: 'Wa West District', assembly_type: 'district' },
        { id: 'asm-uw-4', assembly_name: 'Nadowli Kaleo District', assembly_type: 'district' },
        { id: 'asm-uw-5', assembly_name: 'Daffiama Bussie Issa District', assembly_type: 'district' },
        { id: 'asm-uw-6', assembly_name: 'Jirapa Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-7', assembly_name: 'Lambussie Karni District', assembly_type: 'district' },
        { id: 'asm-uw-8', assembly_name: 'Lawra Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-9', assembly_name: 'Nandom Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-10', assembly_name: 'Sissala East Municipal', assembly_type: 'municipal' },
        { id: 'asm-uw-11', assembly_name: 'Sissala West District', assembly_type: 'district' },
      ],
      'Bono': [
        { id: 'asm-bon-1', assembly_name: 'Sunyani Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-2', assembly_name: 'Sunyani West Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-3', assembly_name: 'Dormaa Central Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-4', assembly_name: 'Dormaa East District', assembly_type: 'district' },
        { id: 'asm-bon-5', assembly_name: 'Dormaa West District', assembly_type: 'district' },
        { id: 'asm-bon-6', assembly_name: 'Berekum East Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-7', assembly_name: 'Berekum West District', assembly_type: 'district' },
        { id: 'asm-bon-8', assembly_name: 'Jaman North District', assembly_type: 'district' },
        { id: 'asm-bon-9', assembly_name: 'Jaman South Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-10', assembly_name: 'Tain District', assembly_type: 'district' },
        { id: 'asm-bon-11', assembly_name: 'Wenchi Municipal', assembly_type: 'municipal' },
        { id: 'asm-bon-12', assembly_name: 'Banda District', assembly_type: 'district' },
      ],
      'Bono East': [
        { id: 'asm-be-1', assembly_name: 'Techiman Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-2', assembly_name: 'Techiman North District', assembly_type: 'district' },
        { id: 'asm-be-3', assembly_name: 'Nkoranza South Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-4', assembly_name: 'Nkoranza North District', assembly_type: 'district' },
        { id: 'asm-be-5', assembly_name: 'Kintampo North Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-6', assembly_name: 'Kintampo South District', assembly_type: 'district' },
        { id: 'asm-be-7', assembly_name: 'Atebubu Amantin Municipal', assembly_type: 'municipal' },
        { id: 'asm-be-8', assembly_name: 'Sene East District', assembly_type: 'district' },
        { id: 'asm-be-9', assembly_name: 'Sene West District', assembly_type: 'district' },
        { id: 'asm-be-10', assembly_name: 'Pru East District', assembly_type: 'district' },
        { id: 'asm-be-11', assembly_name: 'Pru West District', assembly_type: 'district' },
      ],
      'Ahafo': [
        { id: 'asm-aha-1', assembly_name: 'Asunafo North Municipal', assembly_type: 'municipal' },
        { id: 'asm-aha-2', assembly_name: 'Asunafo South District', assembly_type: 'district' },
        { id: 'asm-aha-3', assembly_name: 'Asutifi North District', assembly_type: 'district' },
        { id: 'asm-aha-4', assembly_name: 'Asutifi South District', assembly_type: 'district' },
        { id: 'asm-aha-5', assembly_name: 'Tano North Municipal', assembly_type: 'municipal' },
        { id: 'asm-aha-6', assembly_name: 'Tano South Municipal', assembly_type: 'municipal' },
      ],
      'Oti': [
        { id: 'asm-oti-1', assembly_name: 'Krachi East Municipal', assembly_type: 'municipal' },
        { id: 'asm-oti-2', assembly_name: 'Krachi West District', assembly_type: 'district' },
        { id: 'asm-oti-3', assembly_name: 'Krachi Nchumuru District', assembly_type: 'district' },
        { id: 'asm-oti-4', assembly_name: 'Nkwanta South Municipal', assembly_type: 'municipal' },
        { id: 'asm-oti-5', assembly_name: 'Nkwanta North District', assembly_type: 'district' },
        { id: 'asm-oti-6', assembly_name: 'Biakoye District', assembly_type: 'district' },
        { id: 'asm-oti-7', assembly_name: 'Jasikan District', assembly_type: 'district' },
        { id: 'asm-oti-8', assembly_name: 'Kadjebi District', assembly_type: 'district' },
      ],
      'Western North': [
        { id: 'asm-wn-1', assembly_name: 'Sefwi Wiawso Municipal', assembly_type: 'municipal' },
        { id: 'asm-wn-2', assembly_name: 'Sefwi Akontombra District', assembly_type: 'district' },
        { id: 'asm-wn-3', assembly_name: 'Bibiani Anhwiaso Bekwai Municipal', assembly_type: 'municipal' },
        { id: 'asm-wn-4', assembly_name: 'Juaboso District', assembly_type: 'district' },
        { id: 'asm-wn-5', assembly_name: 'Bia East District', assembly_type: 'district' },
        { id: 'asm-wn-6', assembly_name: 'Bia West District', assembly_type: 'district' },
        { id: 'asm-wn-7', assembly_name: 'Bodi District', assembly_type: 'district' },
        { id: 'asm-wn-8', assembly_name: 'Suaman District', assembly_type: 'district' },
        { id: 'asm-wn-9', assembly_name: 'Aowin Municipal', assembly_type: 'municipal' },
      ],
      'North East': [
        { id: 'asm-ne-1', assembly_name: 'Mamprugu Moagduri District', assembly_type: 'district' },
        { id: 'asm-ne-2', assembly_name: 'West Mamprusi Municipal', assembly_type: 'municipal' },
        { id: 'asm-ne-3', assembly_name: 'East Mamprusi Municipal', assembly_type: 'municipal' },
        { id: 'asm-ne-4', assembly_name: 'Bunkpurugu Nakpanduri District', assembly_type: 'district' },
        { id: 'asm-ne-5', assembly_name: 'Yunyoo Nasuan District', assembly_type: 'district' },
        { id: 'asm-ne-6', assembly_name: 'Chereponi District', assembly_type: 'district' },
      ],
      'Savannah': [
        { id: 'asm-sav-1', assembly_name: 'West Gonja Municipal', assembly_type: 'municipal' },
        { id: 'asm-sav-2', assembly_name: 'Central Gonja District', assembly_type: 'district' },
        { id: 'asm-sav-3', assembly_name: 'East Gonja Municipal', assembly_type: 'municipal' },
        { id: 'asm-sav-4', assembly_name: 'North Gonja District', assembly_type: 'district' },
        { id: 'asm-sav-5', assembly_name: 'North East Gonja District', assembly_type: 'district' },
        { id: 'asm-sav-6', assembly_name: 'Sawla Tuna Kalba District', assembly_type: 'district' },
        { id: 'asm-sav-7', assembly_name: 'Bole District', assembly_type: 'district' },
      ],
    };
    
    const regionKey = region as string;
    const assemblies = regionKey ? (ASSEMBLIES[regionKey] || []) : [];
    
    res.json(assemblies);
  } catch (error) {
    next(error);
  }
});

export default router;
