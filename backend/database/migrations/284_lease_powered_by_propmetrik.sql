-- 284_lease_powered_by_propmetrik.sql
-- Adds a subtle "Powered by PROPMETRIK" platform attribution to the lease footer,
-- so PropMetrik branding stays on every generated lease regardless of the firm's
-- own configured Property Management branding (firmName). Idempotent — safe to
-- re-run (guarded on distinct markers so REPLACE never double-applies).

-- 1) Insert the "Powered by PROPMETRIK" line into the footer note (after the legal disclaimer).
UPDATE lease_templates
SET content = REPLACE(
        content,
        '<div class="disc">This agreement should be reviewed by a qualified lawyer and may require registration with the Rent Control Department.</div>',
        '<div class="disc">This agreement should be reviewed by a qualified lawyer and may require registration with the Rent Control Department.</div>' ||
        E'\n    <div class="powered">Powered by <b>PROPMETRIK</b></div>'
    ),
    updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND content NOT LIKE '%class="powered"%';

-- 2) Add the .powered CSS rule next to the existing .footer-note .disc rule.
UPDATE lease_templates
SET content = REPLACE(
        content,
        '.footer-note .disc{ font-style:italic; margin-top:4px; }',
        '.footer-note .disc{ font-style:italic; margin-top:4px; }' ||
        E'\n  .footer-note .powered{ margin-top:6px; font-size:7.5pt; letter-spacing:0.08em; text-transform:uppercase; opacity:0.7; }'
    )
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND content NOT LIKE '%.footer-note .powered%';
