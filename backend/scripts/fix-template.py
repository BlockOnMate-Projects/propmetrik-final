import json
import re

template_path = '/Users/kobby/github/Cedyn Group/propmetrik/backend/src/config/report-templates/ghis-standard.json'

with open(template_path, 'r') as f:
    data = json.load(f)

# Find the transmittal_letter section
for section in data['sections']:
    if section['id'] == 'transmittal_letter':
        # Use regex to find and replace any table containing Market Value
        new_format = '<p><strong>Market Value:</strong> {{valuation.final_value_formatted}}</p><p><strong>Equivalent USD:</strong> {{valuation.final_value_usd_formatted}}</p><p><strong>Force Sale Value:</strong> {{valuation.force_sale_value_formatted}}</p>'
        
        table_pattern = r'<table[^>]*>.*?Market Value.*?</table>'
        if re.search(table_pattern, section['content'], re.DOTALL):
            section['content'] = re.sub(table_pattern, new_format, section['content'], flags=re.DOTALL)
            print("Updated using regex - replaced table with paragraphs")
        else:
            print("No table pattern found")
        break

with open(template_path, 'w') as f:
    json.dump(data, f, indent=2)
print("Template saved successfully")
