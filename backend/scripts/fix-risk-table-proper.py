#!/usr/bin/env python3
"""
Update the property_risk_assessment section with proper HTML table
now that TipTap has table support enabled
"""

import json

template_path = '/Users/kobby/github/Cedyn Group/propmetrik/backend/src/config/report-templates/ghis-standard.json'

# Load template
with open(template_path, 'r') as f:
    template = json.load(f)

# Proper HTML table that TipTap can now render
new_content = '''<h2 style="text-align: center; font-weight: bold; text-decoration: underline;">PROPERTY RISK ASSESSMENT</h2>

<p>&nbsp;</p>

<table>
<tr>
<th>ITEM</th>
<th>GOOD</th>
<th>AVG.</th>
<th>FAIR</th>
<th>POOR</th>
</tr>
<tr>
<td>Employment stability</td>
<td>{{risk.employment_stability_good}}</td>
<td>{{risk.employment_stability_avg}}</td>
<td>{{risk.employment_stability_fair}}</td>
<td>{{risk.employment_stability_poor}}</td>
</tr>
<tr>
<td>Convenience to Employment</td>
<td>{{risk.employment_convenience_good}}</td>
<td>{{risk.employment_convenience_avg}}</td>
<td>{{risk.employment_convenience_fair}}</td>
<td>{{risk.employment_convenience_poor}}</td>
</tr>
<tr>
<td>Convenience to Shopping</td>
<td>{{risk.shopping_convenience_good}}</td>
<td>{{risk.shopping_convenience_avg}}</td>
<td>{{risk.shopping_convenience_fair}}</td>
<td>{{risk.shopping_convenience_poor}}</td>
</tr>
<tr>
<td>Convenience to School</td>
<td>{{risk.school_convenience_good}}</td>
<td>{{risk.school_convenience_avg}}</td>
<td>{{risk.school_convenience_fair}}</td>
<td>{{risk.school_convenience_poor}}</td>
</tr>
<tr>
<td>Adequacy of Public Transportation</td>
<td>{{risk.transport_good}}</td>
<td>{{risk.transport_avg}}</td>
<td>{{risk.transport_fair}}</td>
<td>{{risk.transport_poor}}</td>
</tr>
<tr>
<td>Adequacy of Utilities</td>
<td>{{risk.utilities_good}}</td>
<td>{{risk.utilities_avg}}</td>
<td>{{risk.utilities_fair}}</td>
<td>{{risk.utilities_poor}}</td>
</tr>
<tr>
<td>Recreation Facilities</td>
<td>{{risk.recreation_good}}</td>
<td>{{risk.recreation_avg}}</td>
<td>{{risk.recreation_fair}}</td>
<td>{{risk.recreation_poor}}</td>
</tr>
<tr>
<td>Police &amp; Fire Protection</td>
<td>{{risk.protection_good}}</td>
<td>{{risk.protection_avg}}</td>
<td>{{risk.protection_fair}}</td>
<td>{{risk.protection_poor}}</td>
</tr>
<tr>
<td>Accessibility</td>
<td>{{risk.accessibility_good}}</td>
<td>{{risk.accessibility_avg}}</td>
<td>{{risk.accessibility_fair}}</td>
<td>{{risk.accessibility_poor}}</td>
</tr>
</table>'''

# Find and update the section
for section in template['sections']:
    if section['id'] == 'property_risk_assessment':
        section['content'] = new_content
        print(f"Updated {section['id']} with clean HTML table")
        break

# Save template
with open(template_path, 'w') as f:
    json.dump(template, f, indent=2)

print("Template saved successfully!")
