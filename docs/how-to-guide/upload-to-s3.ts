/**
 * One-time script to upload all guide assets (screenshots + guide.md) to S3/MinIO.
 *
 * Usage: cd backend && npx tsx ../docs/how-to-guide/upload-to-s3.ts
 */

import { uploadFile, createBucketIfNotExists } from '../../backend/src/database/minio';
import * as fs from 'fs';
import * as path from 'path';

const BUCKET = 'propmetrik-media';
const S3_PREFIX = 'guides';

const GUIDES_DIR = path.resolve(__dirname);
const CHAPTER_DIRS = [
    '01-authentication', '02-dashboard', '03-project-management', '04-budget-cost',
    '05-property-management', '06-tenant-portal', '07-valuations', '08-deals-crm',
    '09-e-signature', '10-financial', '11-data-hub', '12-integrations',
    '13-admin-compliance', '14-reporting',
];

async function main() {
    console.log('Ensuring bucket exists...');
    await createBucketIfNotExists(BUCKET);

    let uploaded = 0;
    let failed = 0;

    for (const dir of CHAPTER_DIRS) {
        const chapterPath = path.join(GUIDES_DIR, dir);
        if (!fs.existsSync(chapterPath)) {
            console.log(`  Skipping ${dir} (not found)`);
            continue;
        }

        // Upload guide.md
        const guideMdPath = path.join(chapterPath, 'guide.md');
        if (fs.existsSync(guideMdPath)) {
            try {
                const content = fs.readFileSync(guideMdPath);
                await uploadFile(BUCKET, `${S3_PREFIX}/${dir}/guide.md`, content, 'text/markdown');
                uploaded++;
                console.log(`  ✅ ${dir}/guide.md`);
            } catch (err) {
                console.log(`  ❌ ${dir}/guide.md — ${(err as Error).message}`);
                failed++;
            }
        }

        // Upload screenshots
        const screenshotsDir = path.join(chapterPath, 'screenshots');
        if (fs.existsSync(screenshotsDir)) {
            const files = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(screenshotsDir, file));
                    await uploadFile(BUCKET, `${S3_PREFIX}/${dir}/${file}`, content, 'image/png');
                    uploaded++;
                    process.stdout.write('.');
                } catch (err) {
                    console.log(`  ❌ ${dir}/${file} — ${(err as Error).message}`);
                    failed++;
                }
            }
            console.log(` (${files.length} screenshots)`);
        }
    }

    console.log(`\n✅ Done! Uploaded: ${uploaded}, Failed: ${failed}`);
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
