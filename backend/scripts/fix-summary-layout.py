#!/usr/bin/env python3
"""
Update the summary_key_data section with paragraph-based layout
that renders properly in TipTap editor
"""

import json

template_path = '/Users/kobby/github/Cedyn Group/propmetrik/backend/src/config/report-templates/ghis-standard.json'

# Load template
with open(template_path, 'r') as f:
    template = json.load(f)

# New paragraph-based summary_key_data content with proper spacing
new_content = '''<h2 style="text-align: center; font-weight: bold; text-decoration: underline;">SUMMARY OF KEY DATA</h2>

<p>&nbsp;</p>

<p><strong>ADDRESS OF PROPERTY:</strong></p>
<p style="margin-left: 40px;">Ghana Post Digital Address {{property.gps_address_uppercase}}, {{property.address}}, {{property.city}}.</p>

<p>&nbsp;</p>

<p><strong>PROPERTY DESCRIPTION:</strong></p>
<p style="margin-left: 40px; text-align: justify;">{{property.description_detailed}}</p>

<p>&nbsp;</p>

<p><strong>TENURE:</strong></p>
<p style="margin-left: 40px;">{{property.tenure_description}}</p>

<p>&nbsp;</p>

<p><strong>USER CLASSIFICATION:</strong></p>
<p style="margin-left: 40px;">{{property.use_classification_display}}</p>

<p>&nbsp;</p>

<p><strong>NEIGHBOURHOOD:</strong></p>
<p style="margin-left: 40px;">{{property.neighborhood}}</p>

<p>&nbsp;</p>

<p><strong>PURPOSE OF VALUATION:</strong></p>
<p style="margin-left: 40px;">{{valuation.purpose_description}}</p>

<p>&nbsp;</p>

<p><strong>BASIS OF VALUATION:</strong></p>
<p style="margin-left: 40px;">{{valuation.basis}}</p>

<p>&nbsp;</p>

<p><strong>RECOMMENDED VALUE:</strong></p>
<p style="margin-left: 40px; text-align: justify;">Having carefully considered all the necessary factors bearing on property values in the locality, it is my opinion that the <strong>Market Capital Value is {{valuation.final_value_words}} ({{valuation.final_value_formatted}}) EQUIVALENT TO {{valuation.final_value_usd_words}} ({{valuation.final_value_usd_formatted}})</strong></p>

<p>&nbsp;</p>

<p><strong>DATE OF VALUATION:</strong></p>
<p style="margin-left: 40px;">{{valuation.effective_date_month_year}}</p>'''

# Find and update the section
for section in template['sections']:
    if section['id'] == 'summary_key_data':
        section['content'] = new_content
        print(f"Updated {section['id']} with paragraph-based format")
        break

# Save template
with open(template_path, 'w') as f:
    json.dump(template, f, indent=2)

print("Template saved successfully!")
