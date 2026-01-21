#!/usr/bin/env python3
"""
Fix floor plan image tags in the DOCX template.
Replace placeholder text with proper image module tags.
"""

import zipfile
import shutil
import os
import re
from pathlib import Path

def fix_floor_plan_image_tags():
    """Replace placeholder text with proper image tags for docxtemplater-image-module-free."""
    
    template_path = Path(__file__).parent.parent / 'templates' / 'ghis_standard.docx'
    backup_path = template_path.with_suffix('.docx.bak2')
    
    # Create backup
    shutil.copy(template_path, backup_path)
    print(f"Created backup at {backup_path}")
    
    # Read the DOCX (it's a ZIP file)
    with zipfile.ZipFile(template_path, 'r') as zip_ref:
        doc_xml = zip_ref.read('word/document.xml').decode('utf-8')
        # Get all other files
        other_files = {}
        for item in zip_ref.namelist():
            if item != 'word/document.xml':
                other_files[item] = zip_ref.read(item)
    
    print(f"Original document size: {len(doc_xml)} bytes")
    
    # Find and replace the placeholder text with image tag
    # The current format is: [Floor plan image: {{filename}}]
    # We need to change it to: {%image}
    
    # Look for the pattern in the floor_plan_images loop
    # Pattern: <w:t>[Floor plan image: {{filename}}]</w:t>
    old_pattern = r'\[Floor plan image: \{\{filename\}\}\]'
    new_text = '{{%image}}'  # Image tag with double braces for our delimiter config
    
    # Find matches
    matches = re.findall(old_pattern, doc_xml)
    print(f"Found {len(matches)} placeholder text matches")
    
    if matches:
        # Replace the placeholder with image tag
        doc_xml = re.sub(old_pattern, new_text, doc_xml)
        print(f"Replaced with image tag: {new_text}")
    
    # Also need to update the XML structure - the image tag needs to be in its own paragraph
    # with proper formatting. Let's check if we need to adjust the structure.
    
    # Verify the change
    if '{{%image}}' in doc_xml:
        print("✅ Image tag successfully added to template")
    else:
        print("⚠️ Image tag not found after replacement")
    
    # Write back the modified document
    with zipfile.ZipFile(template_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
        # Write the modified document.xml
        zip_out.writestr('word/document.xml', doc_xml.encode('utf-8'))
        # Write all other files
        for name, data in other_files.items():
            zip_out.writestr(name, data)
    
    print(f"Modified document saved: {template_path}")
    print(f"New document size: {len(doc_xml)} bytes")
    
    # Show the updated floor plan section
    start = doc_xml.find('{{#floor_plan_images}}')
    end = doc_xml.find('{{/floor_plan_images}}', start)
    if start >= 0 and end >= 0:
        section = doc_xml[start:end+len('{{/floor_plan_images}}')]
        # Remove XML for readability
        clean = re.sub(r'<[^>]+>', ' ', section)
        clean = ' '.join(clean.split())
        print(f"\nUpdated floor plan section (text):\n{clean}")

if __name__ == '__main__':
    fix_floor_plan_image_tags()
