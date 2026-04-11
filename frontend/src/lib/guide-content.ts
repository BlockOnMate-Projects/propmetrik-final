/**
 * Guide Markdown content — imported statically so Next.js can bundle them.
 * Image paths are rewritten from `screenshots/X.png` to `/guides/<folder>/X.png`.
 */

const raw: Record<string, string> = {};

// We use dynamic import with webpack raw-loader via `?raw` suffix is not universal.
// Instead, we'll fetch the content at runtime from `/guides/<folder>/guide.md`.
// To support this, we copy guide.md files into public/guides/<folder>/guide.md.

// For simplicity: we export a function that fetches at client runtime.
export async function fetchGuideContent(folder: string): Promise<string> {
    const res = await fetch(`/guides/${folder}/guide.md`);
    if (!res.ok) return '# Guide not found\n\nThis guide could not be loaded.';
    let md = await res.text();
    // Rewrite image paths: ![...](screenshots/X.png) → ![...](/guides/<folder>/X.png)
    md = md.replace(
        /!\[([^\]]*)\]\(screenshots\/([^)]+)\)/g,
        `![$1](/guides/${folder}/$2)`
    );
    return md;
}
