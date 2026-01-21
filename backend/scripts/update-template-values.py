import json

template_path = '/Users/kobby/github/Cedyn Group/propmetrik/backend/src/config/report-templates/ghis-standard.json'

with open(template_path, 'r') as f:
    data = json.load(f)

# Find the transmittal_letter section and update
for section in data['sections']:
    if section['id'] == 'transmittal_letter':
        # New content with words format and proper spacing
        new_content = '<p>{{client.name}}<br/>{{client.address}}</p>'
        new_content += '<p>{{valuation.effective_date}}</p>'
        new_content += '<p>Dear {{client.salutation}},</p>'
        new_content += '<h3>{{property.type_display}} PROPERTY AT {{property.address_uppercase}} WITH GHANA POST DIGITAL ADDRESS {{property.gps_address_uppercase}}</h3>'
        new_content += '<p>Pursuant to your instructions commissioning me to carry out a valuation on the above-named property (hereinafter referred to as "the property"), I have completed the exercise and have the pleasure to present to you this report.</p>'
        new_content += '<p>A careful inspection of the property located at {{property.address}} was made giving due consideration to all factors and forces influencing property values. The report is based on an analysis of general and specific data that influence property values as reported herein.</p>'
        new_content += '<p>The {{valuation.methods_applied}} has been considered in the appraisal and has been utilized where necessary or deemed appropriate for the value conclusion arrived at.</p>'
        new_content += '<p>In my professionally considered opinion, having regard to the Existing Use, State/Condition, location, economic, legal, physical and institutional factors, the value of the respective interest in the subject property is:</p>'
        # Value section with words
        new_content += '<p><strong>{{valuation.final_value_words}}</strong> [{{valuation.final_value_formatted}}] equivalent to <strong>{{valuation.final_value_usd_words}}</strong> [{{valuation.final_value_usd_formatted}}] and a Force Sale Value of <strong>{{valuation.force_sale_value_words}}</strong> [{{valuation.force_sale_value_formatted}}] equivalent to <strong>{{valuation.force_sale_value_usd_words}}</strong> [{{valuation.force_sale_value_usd_formatted}}]</p>'
        new_content += '<p>as at the date of valuation.</p>'
        new_content += '<p>It has been a pleasure working on your behalf in this matter. Please feel free to let me know if you desire additional information concerning this report, or if I may be of further assistance to you.</p>'
        # Spacing: 1 space above Yours faithfully
        new_content += '<p>&nbsp;</p>'
        new_content += '<p>Yours faithfully,</p>'
        # Spacing: 2 spaces below Yours faithfully
        new_content += '<p>&nbsp;</p>'
        new_content += '<p>&nbsp;</p>'
        new_content += '<p><strong>{{valuer.name}}, {{valuer.qualifications}}</strong><br/>({{valuer.title}})</p>'
        new_content += '<p><em>On the date of valuation, the GH Cedi to US Dollar exchange rate is: {{valuation.exchange_rate}}<br/>Source: Bank of Ghana</em></p>'
        
        section['content'] = new_content
        print("Updated transmittal_letter with new value format")
        break

with open(template_path, 'w') as f:
    json.dump(data, f, indent=2)
print("Template saved successfully")
