#!/usr/bin/env python3
"""
Fix template delimiters to use consistent double braces.
The backup template uses {{}} for variables but {} for loops.
This script converts all to {{}} format for docxtemplater.
"""

import zipfile
import re
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_PATH = os.path.join(BACKEND_DIR, 'templates', 'ghis_standard_backup.docx')
OUTPUT_PATH = os.path.join(BACKEND_DIR, 'templates', 'ghis_standard.docx')

def fix_template():
    print(f"Reading backup template from: {BACKUP_PATH}")
    
    with zipfile.ZipFile(BACKUP_PATH, 'r') as zin:
        # Get all files
        files = {}
        for item in zin.namelist():
            files[item] = zin.read(item)
        
        # Read the document.xml
        doc_xml = files['word/document.xml'].decode('utf-8')
        
        print("Original template size:", len(doc_xml))
        
        # Step 0: Remove XML comments (they break docxtemplater)
        doc_xml = re.sub(r'<!--.*?-->', '', doc_xml, flags=re.DOTALL)
        
        # Step 1: Replace loop opening tags {# -> {{#
        doc_xml = doc_xml.replace('{#', '{{#')
        
        # Step 2: Replace loop closing tags {/ -> {{/
        doc_xml = doc_xml.replace('{/', '{{/')
        
        # Step 3: Close the loop tags (they end with } but need }})
        # {{#methods} -> {{#methods}}
        doc_xml = re.sub(r'\{\{#(\w+)\}(?!\})', r'{{#\1}}', doc_xml)
        doc_xml = re.sub(r'\{\{/(\w+)\}(?!\})', r'{{/\1}}', doc_xml)
        
        # Step 4: Replace single-brace loop variables {word} with {{word}}
        # But don't touch already double-braced {{word}}
        # Pattern: single { followed by word followed by single }
        doc_xml = re.sub(r'(?<!\{)\{(\w+)\}(?!\})', r'{{\1}}', doc_xml)
        
        # Step 5: Handle the special {.} for array items
        doc_xml = doc_xml.replace('{.}', '{{.}}')
        
        # Step 6: Clean up extra whitespace from comment removal
        doc_xml = re.sub(r'\n\s*\n', '\n', doc_xml)
        
        files['word/document.xml'] = doc_xml.encode('utf-8')
        
        print("Updated template size:", len(doc_xml))
        
        # Write to new template
        with zipfile.ZipFile(OUTPUT_PATH, 'w', zipfile.ZIP_DEFLATED) as zout:
            for name, data in files.items():
                zout.writestr(name, data)
    
    print(f"Template saved to: {OUTPUT_PATH}")
    
    # Verify
    print("\nVerification:")
    with zipfile.ZipFile(OUTPUT_PATH, 'r') as z:
        doc = z.read('word/document.xml').decode('utf-8')
        
        # Check for loop tags
        loop_opens = re.findall(r'\{\{#\w+\}\}', doc)
        loop_closes = re.findall(r'\{\{/\w+\}\}', doc)
        
        print(f"✓ Found {len(loop_opens)} loop opening tags: {loop_opens[:5]}")
        print(f"✓ Found {len(loop_closes)} loop closing tags: {loop_closes[:5]}")
        
        # Check for malformed tags
        malformed_open = re.findall(r'\{\{#\w+\}(?!\})', doc)
        malformed_close = re.findall(r'\{\{/\w+\}(?!\})', doc)
        single_brace = re.findall(r'(?<!\{)\{[a-z_]+\}(?!\})', doc)
        
        if malformed_open:
            print(f"⚠ Found malformed open tags: {malformed_open[:5]}")
        if malformed_close:
            print(f"⚠ Found malformed close tags: {malformed_close[:5]}")
        if single_brace:
            print(f"⚠ Found single-brace variables: {single_brace[:5]}")
        
        if not malformed_open and not malformed_close:
            print("✓ All loop tags properly formatted!")

if __name__ == '__main__':
    fix_template()
