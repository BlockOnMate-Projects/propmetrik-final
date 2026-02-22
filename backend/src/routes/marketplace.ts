/**
 * Marketplace API Routes
 * Public marketplace endpoints for property listing and search
 * 
 * Base path: /api/v1/marketplace
 * 
 * @module routes/marketplace
 */

import { Router } from 'express';
import { marketplaceController } from '../controllers/marketplace/marketplaceController';

const router = Router();

/**
 * @route   POST /api/v1/marketplace/search
 * @desc    Search marketplace properties with filters
 * @access  Public
 */
router.post('/search', marketplaceController.searchProperties.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token
 * @desc    Get property by permanent token
 * @access  Public
 */
router.get('/properties/:token', marketplaceController.getPropertyByToken.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/properties/:token/application-link
 * @desc    Get or create application link for property (redirects to tenant portal)
 * @access  Public
 */
router.get('/properties/:token/application-link', marketplaceController.getApplicationLink.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/autocomplete
 * @desc    Location autocomplete suggestions
 * @access  Public
 */
router.get('/autocomplete', marketplaceController.autocomplete.bind(marketplaceController));

/**
 * @route   POST /api/v1/marketplace/geocode
 * @desc    Forward geocoding (address to coordinates)
 * @access  Public
 */
router.post('/geocode', marketplaceController.geocode.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/reverse-geocode
 * @desc    Reverse geocoding (coordinates to address)
 * @access  Public
 */
router.get('/reverse-geocode', marketplaceController.reverseGeocode.bind(marketplaceController));

/**
 * @route   GET /api/v1/marketplace/nearby-amenities
 * @desc    Get nearby amenities (schools, hospitals, transit)
 * @access  Public
 */
router.get('/nearby-amenities', marketplaceController.getNearbyAmenities.bind(marketplaceController));

/**
 * @route   POST /api/v1/marketplace/analytics/track
 * @desc    Track marketplace event (view, click, favorite, etc.)
 * @access  Public
 */
router.post('/analytics/track', marketplaceController.trackEvent.bind(marketplaceController));

export default router;
