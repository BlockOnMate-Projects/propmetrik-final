/**
 * Guide Markdown content loader.
 *
 * Fetches guide.md from the backend API which serves them from S3/MinIO.
 * Image paths are rewritten to also point to the S3-backed API route.
 *
 * In development, falls back to local `/guides/` public folder if the API is unavailable.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getGuideBaseUrl(folder: string): string {
    // Production: serve from backend API (S3-backed)
    // API_BASE is e.g. '/api', backend route is /api/guides/:folder/:file
    if (API_BASE) return `${API_BASE}/guides/${folder}`;
    // Dev: try backend on port 4000, fallback to local public folder
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        return `http://localhost:4000/api/guides/${folder}`;
    }
    // Fallback: same-origin /api/guides route (if proxied)
    return `/api/guides/${folder}`;
}

export async function fetchGuideContent(folder: string): Promise<string> {
    const baseUrl = getGuideBaseUrl(folder);

    // Try S3-backed API first
    try {
        const res = await fetch(`${baseUrl}/guide.md`);
        if (res.ok) {
            let md = await res.text();
            md = md.replace(
                /!\[([^\]]*)\]\(screenshots\/([^)]+)\)/g,
                `![$1](${baseUrl}/$2)`
            );
            return md;
        }
    } catch {
        // API unavailable, try local fallback
    }

    // Fallback: local public folder (dev only)
    try {
        const res = await fetch(`/guides/${folder}/guide.md`);
        if (res.ok) {
            let md = await res.text();
            md = md.replace(
                /!\[([^\]]*)\]\(screenshots\/([^)]+)\)/g,
                `![$1](/guides/${folder}/$2)`
            );
            return md;
        }
    } catch {
        // Both failed
    }

    return '# Guide not found\n\nThis guide could not be loaded.';
}
