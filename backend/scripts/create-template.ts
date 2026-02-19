/**
 * Create DOCX Template Script
 * 
 * Generates a basic DOCX template for valuation reports.
 * Run with: npx ts-node scripts/create-template.ts
 */

import PizZip from 'pizzip';
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = path.join(__dirname, '../templates');

/**
 * Create a DOCX template with placeholders for docxtemplater
 */
function createDocxTemplate(templateName: string): void {
  const zip = new PizZip();

  // Content Types
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

  // Root relationships
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  // Word document relationships
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  // Styles
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
</w:styles>`);

  // Main document with template placeholders
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <w:body>
    <!-- COVER PAGE -->
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>{{report_title}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:sz w:val="32"/></w:rPr><w:t>{{report_subtitle}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Property Location:</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{property_location}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{ghana_post_address}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Prepared For:</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{prepared_for_name}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{prepared_for_address}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Certified By:</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{valuer_name}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{valuer_qualifications}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>{{valuer_license}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Date of Valuation: {{report_date}}</w:t></w:r>
    </w:p>
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- TRANSMITTAL LETTER -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Letter of Transmittal</w:t></w:r></w:p>
    <w:p><w:r><w:t>Date: {{transmittal_date}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>To: {{transmittal_recipient}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{transmittal_address}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Re: {{transmittal_subject}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>{{transmittal_body}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Valuation Summary:</w:t></w:r></w:p>
    <w:p><w:r><w:t>Market Value (GHS): {{market_value_ghs}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Market Value (USD): {{market_value_usd}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Forced Sale Value (GHS): {{forced_sale_value_ghs}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Forced Sale Value (USD): {{forced_sale_value_usd}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>Exchange Rate: {{exchange_rate}} ({{exchange_source}}, {{exchange_date}})</w:t></w:r></w:p>
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- PROPERTY DETAILS -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Property Description</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Location</w:t></w:r></w:p>
    <w:p><w:r><w:t>Address: {{property_address}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>City: {{property_city}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Region: {{property_region}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Physical Characteristics</w:t></w:r></w:p>
    <w:p><w:r><w:t>Property Type: {{property_type}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Building Size: {{property_size_sqm}} sqm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Land Area: {{land_area_sqm}} sqm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bedrooms: {{bedrooms}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bathrooms: {{bathrooms}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Year Built: {{year_built}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Condition: {{property_condition}}</w:t></w:r></w:p>
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- LEGAL -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Legal Description</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tenure Type: {{tenure_type}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Lease Term: {{lease_term}} years</w:t></w:r></w:p>
    <w:p><w:r><w:t>Remaining Years: {{remaining_years}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Title Status: {{title_status}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Title Reference: {{title_reference}}</w:t></w:r></w:p>
    
    <!-- CONSTRUCTION -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Construction Details</w:t></w:r></w:p>
    <w:p><w:r><w:t>Structure Type: {{structure_type}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Walls: {{walls}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Roofing: {{roofing}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Flooring: {{flooring}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ceiling: {{ceiling}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Windows: {{windows}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Doors: {{doors}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Age: {{age_years}} years</w:t></w:r></w:p>
    <w:p><w:r><w:t>Condition: {{building_condition}}</w:t></w:r></w:p>
    
    <!-- SERVICES -->
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Services</w:t></w:r></w:p>
    <w:p><w:r><w:t>Water Supply: {{water_supply}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Electricity: {{electricity_supply}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Sewage: {{sewage_system}}</w:t></w:r></w:p>
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- VALUATION -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Valuation Analysis</w:t></w:r></w:p>
    <w:p><w:r><w:t>Valuation Date: {{valuation_date}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Purpose: {{valuation_purpose}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Primary Method: {{primary_method}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Final Market Value: {{final_value}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Value Range: {{value_range_low}} - {{value_range_high}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Confidence Score: {{confidence_score}}%</w:t></w:r></w:p>
    <w:p><w:r><w:t>Confidence Grade: {{confidence_grade}}</w:t></w:r></w:p>
    
    <!-- METHODS TABLE -->
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Valuation Methods Applied</w:t></w:r></w:p>
    {#methods}
    <w:p><w:r><w:t>{name}: {value} (Confidence: {confidence}%, Weight: {weight}%)</w:t></w:r></w:p>
    {/methods}
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- COMPARABLES -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Comparable Sales Analysis</w:t></w:r></w:p>
    {#comparables}
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{address}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Sale Price: {price}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Size: {size} sqm | Price/sqm: {price_per_sqm}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Similarity Score: {similarity}%</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    {/comparables}
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- INSPECTION -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Inspection Details</w:t></w:r></w:p>
    <w:p><w:r><w:t>Inspection Date: {{inspection_date}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Measurement Standard: {{measurement_standard}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Areas Inspected: {{areas_inspected}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Limitations: {{limitations}}</w:t></w:r></w:p>
    
    <!-- ENGAGEMENT -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Terms of Engagement</w:t></w:r></w:p>
    <w:p><w:r><w:t>Purpose: {{purpose}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Basis of Value: {{basis_of_value}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Special Assumptions: {{special_assumptions}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Departures: {{departures}}</w:t></w:r></w:p>
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- RISK ASSESSMENT -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Risk Assessment</w:t></w:r></w:p>
    <w:p><w:r><w:t>Overall Risk Level: {{overall_risk}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    {#risk_items}
    <w:p><w:r><w:t>• {risk_category}: {risk_level} - {description}</w:t></w:r></w:p>
    {/risk_items}
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- CERTIFICATION -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Certification</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{certification_text}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Disclosure:</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{disclosure_text}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Standards Compliance:</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{standards_compliance}}</w:t></w:r></w:p>
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- LIMITING CONDITIONS -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>{{disclaimer_title}}</w:t></w:r></w:p>
    {#disclaimer_conditions}
    <w:p><w:r><w:t>• {.}</w:t></w:r></w:p>
    {/disclaimer_conditions}
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Standards References:</w:t></w:r></w:p>
    {#standards_references}
    <w:p><w:r><w:t>• {.}</w:t></w:r></w:p>
    {/standards_references}
    
    <!-- PAGE BREAK -->
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    
    <!-- SIGNATURE PAGE -->
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Valuer's Signature</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>_______________________________</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{valuer_name}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{valuer_qualifications}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{valuer_title}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>License No: {{valuer_license}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>Date: {{report_date}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>{{valuer_address}}</w:t></w:r></w:p>

    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  // Generate buffer
  const buffer = zip.generate({ type: 'nodebuffer' });
  
  // Ensure templates directory exists
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  // Write file
  const filePath = path.join(TEMPLATES_DIR, `${templateName}.docx`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Created template: ${filePath}`);
}

// Create templates
console.log('Creating DOCX templates...');
createDocxTemplate('ghis_standard');
createDocxTemplate('rics_residential');
console.log('Done!');
