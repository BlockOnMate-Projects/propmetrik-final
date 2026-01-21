#!/usr/bin/env python3
"""
Update the summary_key_data section in ghis-standard.json
to match professional valuation report format
"""

import json

template_path = '/Users/kobby/github/Cedyn Group/propmetrik/backend/src/config/report-templates/ghis-standard.json'

# Load template
with open(template_path, 'r') as f:
    template = json.load(f)

# New professional summary_key_data content
new_content = '''<h2 style="text-align: center; font-weight: bold; text-decoration: underline;">SUMMARY OF KEY DATA</h2>

<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">ADDRESS OF PROPERTY:</td>
<td style="padding: 12px 5px; vertical-align: top;">Ghana Post Digital Address {{property.gps_address_uppercase}}, {{property.address}}, {{property.city}}.</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">PROPERTY DESCRIPTION:</td>
<td style="padding: 12px 5px; vertical-align: top; text-align: justify;">{{property.description_detailed}}</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">TENURE:</td>
<td style="padding: 12px 5px; vertical-align: top;">{{property.tenure_description}}</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">USER CLASSIFICATION:</td>
<td style="padding: 12px 5px; vertical-align: top;">{{property.use_classification_display}}</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">NEIGHBOURHOOD:</td>
<td style="padding: 12px 5px; vertical-align: top;">{{property.neighborhood}}</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">PURPOSE OF VALUATION:</td>
<td style="padding: 12px 5px; vertical-align: top;">{{valuation.purpose_description}}</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">BASIS OF VALUATION:</td>
<td style="padding: 12px 5px; vertical-align: top;">{{valuation.basis}}</td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">RECOMMENDED VALUE:</td>
<td style="padding: 12px 5px; vertical-align: top; text-align: justify;">Having carefully considered all the necessary factors bearing on property values in the locality, it is my opinion that the <strong>Market Capital Value is {{valuation.final_value_words}} ({{valuation.final_value_formatted}}) EQUIVALENT TO {{valuation.final_value_usd_words}} ({{valuation.final_value_usd_formatted}})</strong></td>
</tr>
<tr>
<td style="width: 35%; padding: 12px 5px; vertical-align: top; font-weight: bold;">DATE OF VALUATION:</td>
<td style="padding: 12px 5px; vertical-align: top;">{{valuation.effective_date_month_year}}</td>
</tr>
</table>'''

# Find and update the section
for section in template['sections']:
    if section['id'] == 'summary_key_data':
        section['content'] = new_content
        print(f"Updated {section['id']} with professional format")
        break

# Save template
with open(template_path, 'w') as f:
    json.dump(template, f, indent=2)

print("Template saved successfully!")
