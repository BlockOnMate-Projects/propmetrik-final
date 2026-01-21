#!/usr/bin/env python3
"""
Add appendices to the template for Schedule of Accommodation, Floor Plans, etc.
"""

import zipfile
import re
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_PATH = os.path.join(BACKEND_DIR, 'templates', 'ghis_standard.docx')

# Appendices XML to insert before the closing </w:body> tag
# NOTE: For docxtemplater table row loops, the loop tag goes in the FIRST CELL of the row to be repeated
# The loop tag row pattern is: first row has {{#loop}}{{field1}} in cell 1, remaining cells have {{field2}} etc
# The closing tag goes in a separate row with {{/loop}} in first cell
# IMPORTANT: No XML comments allowed - they break the docx parser
APPENDICES_XML = '''<w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>APPENDICES</w:t></w:r>
    </w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Appendix A: Schedule of Accommodation</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Total Gross Floor Area: {{total_floor_area}} sqm</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="1500" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="E0E0E0"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Floor</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="E0E0E0"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Room Name</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2250" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="E0E0E0"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Dimensions (m)</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2250" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="E0E0E0"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Area (sqm)</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>{{#accommodation_schedule}}{{floor}}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>{{room_name}}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>{{dimensions}}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2250" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>{{area}}{{/accommodation_schedule}}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Appendix B: Floor Plans / Site Title Plan</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>{{#floor_plan_images}}</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>{{label}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>[Floor plan image: {{filename}}]</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>{{/floor_plan_images}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{^floor_plan_images}}</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>[No floor plan images available]</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>{{/floor_plan_images}}</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Appendix C: Location Map</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>[Location map to be inserted]</w:t></w:r>
    </w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Appendix D: Picture Gallery</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>{{#property_images}}</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/></w:rPr><w:t>{{caption}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>{{/property_images}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{^property_images}}</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="666666"/></w:rPr><w:t>[Property photographs to be inserted]</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>{{/property_images}}</w:t></w:r></w:p>'''

def add_appendices():
    print(f"Reading template from: {TEMPLATE_PATH}")
    
    with zipfile.ZipFile(TEMPLATE_PATH, 'r') as zin:
        # Get all files
        files = {}
        for item in zin.namelist():
            files[item] = zin.read(item)
        
        # Read the document.xml
        doc_xml = files['word/document.xml'].decode('utf-8')
        
        print("Original template size:", len(doc_xml))
        
        # Check if appendices already exist
        if 'accommodation_schedule' in doc_xml:
            print("Appendices already exist in template!")
            return
        
        # Find the closing </w:body> tag and insert appendices before it
        # Also need to handle </w:sectPr> which comes before </w:body>
        
        # Find the sectPr tag (section properties)
        sectpr_match = re.search(r'(<w:sectPr[^>]*>.*?</w:sectPr>)', doc_xml, re.DOTALL)
        if sectpr_match:
            sectpr = sectpr_match.group(1)
            # Insert appendices before sectPr
            doc_xml = doc_xml.replace(sectpr, APPENDICES_XML + '\n    ' + sectpr)
        else:
            # No sectPr, insert before </w:body>
            doc_xml = doc_xml.replace('</w:body>', APPENDICES_XML + '\n  </w:body>')
        
        files['word/document.xml'] = doc_xml.encode('utf-8')
        
        print("Updated template size:", len(doc_xml))
        
        # Write to template
        with zipfile.ZipFile(TEMPLATE_PATH, 'w', zipfile.ZIP_DEFLATED) as zout:
            for name, data in files.items():
                zout.writestr(name, data)
    
    print(f"Template updated with appendices!")
    
    # Verify
    print("\nVerification:")
    with zipfile.ZipFile(TEMPLATE_PATH, 'r') as z:
        doc = z.read('word/document.xml').decode('utf-8')
        
        checks = [
            ('accommodation_schedule', 'Schedule of Accommodation loop'),
            ('floor_plan_images', 'Floor Plan Images loop'),
            ('total_floor_area', 'Total floor area variable'),
            ('Appendix A', 'Appendix A title'),
            ('Appendix B', 'Appendix B title'),
            ('Appendix C', 'Appendix C title'),
            ('Appendix D', 'Appendix D title'),
        ]
        
        for text, desc in checks:
            if text in doc:
                print(f"✓ Found: {desc}")
            else:
                print(f"✗ Missing: {desc}")

if __name__ == '__main__':
    add_appendices()
