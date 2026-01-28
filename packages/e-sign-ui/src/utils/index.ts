/**
 * E-Sign UI Utilities
 * Shared utility functions for electronic signature components
 */

import type { SignatureFont } from '../types';

// =====================================================
// SIGNATURE FONTS
// =====================================================

/**
 * Curated list of signature-style fonts from Google Fonts
 * These fonts give a natural handwriting appearance
 */
export const SIGNATURE_FONTS: SignatureFont[] = [
    { id: 'dancing', name: 'Dancing Script', fallback: 'cursive', preview: 'Elegant cursive' },
    { id: 'great-vibes', name: 'Great Vibes', fallback: 'cursive', preview: 'Formal script' },
    { id: 'satisfy', name: 'Satisfy', fallback: 'cursive', preview: 'Smooth flow' },
    { id: 'pacifico', name: 'Pacifico', fallback: 'cursive', preview: 'Casual signature' },
    { id: 'sacramento', name: 'Sacramento', fallback: 'cursive', preview: 'Light script' },
    { id: 'allura', name: 'Allura', fallback: 'cursive', preview: 'Classic calligraphy' },
    { id: 'alex-brush', name: 'Alex Brush', fallback: 'cursive', preview: 'Brush style' },
    { id: 'cookie', name: 'Cookie', fallback: 'cursive', preview: 'Friendly script' },
    { id: 'qwigley', name: 'Qwigley', fallback: 'cursive', preview: 'Artistic flair' },
    { id: 'whisper', name: 'Whisper', fallback: 'cursive', preview: 'Delicate hand' },
];

// =====================================================
// GOOGLE FONTS LOADING
// =====================================================

let fontsLoaded = false;

/**
 * Load all signature fonts from Google Fonts
 * This should be called once when the app initializes or when the signature modal opens
 */
export function loadSignatureFonts(): Promise<void> {
    if (fontsLoaded) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const fontFamilies = SIGNATURE_FONTS.map(f => f.name.replace(' ', '+')).join('|');
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamilies}&display=swap`;
        link.rel = 'stylesheet';
        link.onload = () => {
            fontsLoaded = true;
            resolve();
        };
        link.onerror = () => {
            console.warn('Failed to load signature fonts');
            resolve(); // Resolve anyway to not block the UI
        };
        document.head.appendChild(link);
    });
}

/**
 * Check if signature fonts are loaded
 */
export function areFontsLoaded(): boolean {
    return fontsLoaded;
}

// =====================================================
// CANVAS UTILITIES
// =====================================================

/**
 * Generate a typed signature as a base64 image
 */
export function generateTypedSignatureImage(
    text: string,
    fontFamily: string,
    options: {
        width?: number;
        height?: number;
        fontSize?: number;
        color?: string;
        backgroundColor?: string;
    } = {}
): string {
    const {
        width = 600,
        height = 200,
        fontSize = 48,
        color = 'black',
        backgroundColor = 'white'
    } = options;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
        throw new Error('Could not get canvas context');
    }

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text
    ctx.font = `${fontSize}px "${fontFamily}", cursive`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL('image/png');
}

// =====================================================
// SIGNATURE HASH UTILITIES
// =====================================================

/**
 * Generate a display-friendly signature hash
 * Format: 8 character hex string (uppercase)
 */
export function generateSignatureHash(): string {
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    return Array.from(array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

/**
 * Format a date for signature display
 */
export function formatSignatureDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date);
}

// =====================================================
// VALIDATION UTILITIES
// =====================================================

/**
 * Check if a base64 image string is valid and contains data
 */
export function isValidSignatureImage(dataUrl: string): boolean {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return false;
    }

    // Check if the image has actual content (not just empty canvas)
    const base64 = dataUrl.split(',')[1];
    if (!base64 || base64.length < 100) {
        return false;
    }

    return true;
}

/**
 * Get signer role display text
 */
export function getSignerRoleDisplay(role: string): string {
    const roleMap: Record<string, string> = {
        'sender': 'Sender',
        'signer_1': 'Primary Signer',
        'signer_2': 'Secondary Signer',
        'signer_3': 'Third Signer',
        'witness_1': 'First Witness',
        'witness_2': 'Second Witness',
    };
    return roleMap[role] || role;
}
