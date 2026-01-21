#!/usr/bin/env python3
"""
Update the property_risk_assessment section in ghis-standard.json
with paragraph-based layout that renders properly
"""

import json

template_path = '/Users/kobby/github/Cedyn Group/propmetrik/backend/src/config/report-templates/ghis-standard.json'

# Load template
with open(template_path, 'r') as f:
    template = json.load(f)

# New paragraph-based property risk assessment content
new_content = '''<h2 style="text-align: center; font-weight: bold; text-decoration: underline;">PROPERTY RISK ASSESSMENT</h2>

<p>&nbsp;</p>

<table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
<thead>
<tr style="background-color: #f0f0f0;">
<th style="border: 1px solid #000; padding: 8px; text-align: left; width: 40%;">ITEM</th>
<th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">GOOD</th>
<th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">AVG.</th>
<th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">FAIR</th>
<th style="border: 1px solid #000; padding: 8px; text-align: center; width: 15%;">POOR</th>
</tr>
</thead>
<tbody>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Employment stability</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_stability_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_stability_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_stability_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_stability_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Convenience to Employment</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_convenience_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_convenience_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_convenience_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.employment_convenience_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Convenience to Shopping</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.shopping_convenience_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.shopping_convenience_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.shopping_convenience_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.shopping_convenience_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Convenience to School</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.school_convenience_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.school_convenience_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.school_convenience_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.school_convenience_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Adequacy of Public Transportation</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.transport_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.transport_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.transport_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.transport_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Adequacy of Utilities</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.utilities_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.utilities_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.utilities_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.utilities_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Recreation Facilities</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.recreation_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.recreation_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.recreation_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.recreation_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Police &amp; Fire Protection</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.protection_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.protection_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.protection_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.protection_poor}}</td>
</tr>
<tr>
<td style="border: 1px solid #000; padding: 8px;">Accessibility</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.accessibility_good}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.accessibility_avg}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.accessibility_fair}}</td>
<td style="border: 1px solid #000; padding: 8px; text-align: center;">{{risk.accessibility_poor}}</td>
</tr>
</tbody>
</table>'''

# Find and update the section
for section in template['sections']:
    if section['id'] == 'property_risk_assessment':
        section['content'] = new_content
        print(f"Updated {section['id']} with proper table format")
        break

# Save template
with open(template_path, 'w') as f:
    json.dump(template, f, indent=2)

print("Template saved successfully!")
