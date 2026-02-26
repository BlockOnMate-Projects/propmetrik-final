/**
 * Feature Flags & Module Access Control
 * 
 * Manages availability of different modules based on organization subscription/configuration.
 * allowing strictly modular usage (e.g. Deals only, Valuations only).
 */

// This would typically come from an auth context or API configuration
// For now, we simulate strictly separated services logic
const DEFAULT_FEATURES = {
    crm: true,
    valuations: true,
    property_management: true,
    data_hub: true
};

export type FeatureKey = keyof typeof DEFAULT_FEATURES;

/**
 * Check if a specific feature/module is enabled for the current user/organization
 */
export function isFeatureEnabled(feature: FeatureKey): boolean {
    // In a real implementation, this would check:
    // 1. User permissions
    // 2. Organization subscription plan
    // 3. System-wide feature flags

    // For this demonstration, we assume all are enabled, but the architecture 
    // is in place to toggle them easily.
    // Example: defined in localStorage for testing
    if (typeof window !== 'undefined') {
        const disabledFeatures = localStorage.getItem('disabled_features');
        if (disabledFeatures) {
            const disabled = JSON.parse(disabledFeatures);
            if (disabled.includes(feature)) return false;
        }
    }

    return DEFAULT_FEATURES[feature];
}

/**
 * Hook to check feature access (can be expanded to use Context)
 */
export function useFeature(feature: FeatureKey) {
    return isFeatureEnabled(feature);
}
