-- Migration: 131_update_ghana_lease_template.sql
-- Description: Update global lease template to comprehensive Ghana Tenancy Agreement
-- Based on docs/lease.md with full legal clauses per Ghana Rent Act

UPDATE lease_templates 
SET 
    name = 'Ghana Residential Tenancy Agreement',
    description = 'Comprehensive tenancy agreement template compliant with Ghana Rent Act, 1963 (Act 220) and Rent Control Law, 1986 (PNDCL 138). Includes all required legal clauses.',
    content = '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page { 
            margin: 2.5cm; 
            size: A4;
        }
        body { 
            font-family: "Times New Roman", Times, serif; 
            font-size: 12pt;
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px;
            color: #1a1a1a;
        }
        h1 { 
            text-align: center; 
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 30px;
            text-transform: uppercase;
            border-bottom: 2px solid #000;
            padding-bottom: 15px;
        }
        h2 { 
            font-size: 13pt;
            font-weight: bold;
            margin-top: 25px;
            margin-bottom: 15px;
            text-transform: uppercase;
        }
        h3 {
            font-size: 12pt;
            font-weight: bold;
            margin-top: 15px;
            margin-bottom: 10px;
        }
        .header-date {
            text-align: center;
            font-style: italic;
            margin-bottom: 30px;
        }
        .parties { 
            margin-bottom: 30px;
            padding: 20px;
            background: #f9f9f9;
            border: 1px solid #ddd;
        }
        .party-block {
            margin-bottom: 20px;
        }
        .party-label {
            font-weight: bold;
            font-size: 13pt;
            margin-bottom: 5px;
        }
        .party-details {
            margin-left: 20px;
        }
        .section { 
            margin-bottom: 20px;
            page-break-inside: avoid;
        }
        .clause {
            margin-bottom: 12px;
            text-align: justify;
        }
        .sub-clause {
            margin-left: 25px;
            margin-bottom: 8px;
        }
        .property-box {
            border: 1px solid #333;
            padding: 15px;
            margin: 15px 0;
            background: #fafafa;
        }
        .amount {
            font-weight: bold;
        }
        .signature-section {
            margin-top: 40px;
            page-break-before: auto;
        }
        .signature-block { 
            display: flex; 
            justify-content: space-between;
            margin-top: 30px;
        }
        .signature { 
            width: 45%; 
        }
        .signature-line { 
            border-top: 1px solid #000; 
            margin-top: 60px; 
            padding-top: 8px;
        }
        .witness-section {
            margin-top: 40px;
            border-top: 1px solid #ccc;
            padding-top: 20px;
        }
        .witness-block {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
        }
        .witness {
            width: 45%;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10pt;
            color: #666;
            border-top: 1px solid #ccc;
            padding-top: 15px;
        }
        .legal-note {
            font-size: 10pt;
            color: #666;
            font-style: italic;
            margin-top: 10px;
        }
        ul, ol {
            margin: 10px 0;
            padding-left: 25px;
        }
        li {
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <h1>TENANCY AGREEMENT</h1>
    
    <p class="header-date"><strong>THIS AGREEMENT</strong> is made on the <strong>{{formatDate today "long"}}</strong></p>
    
    <div class="parties">
        <h2>BETWEEN:</h2>
        
        <div class="party-block">
            <div class="party-label">LANDLORD:</div>
            <div class="party-details">
                <strong>{{landlordName}}</strong><br>
                Address: {{landlordAddress}}<br>
                Ghana Card Number: {{landlordIdNumber}}<br>
                Contact: {{landlordPhone}}<br>
                Email: {{landlordEmail}}
            </div>
            <p>(Hereinafter referred to as "the Landlord", which expression shall where the context so admits include successors in title, assigns, and legal representatives)</p>
        </div>
        
        <p style="text-align: center; font-weight: bold; font-size: 14pt;">AND</p>
        
        <div class="party-block">
            <div class="party-label">TENANT:</div>
            <div class="party-details">
                <strong>{{tenantName}}</strong><br>
                Address: {{tenantAddress}}<br>
                Ghana Card Number: {{tenantIdNumber}}<br>
                Contact: {{tenantPhone}}<br>
                Email: {{tenantEmail}}
            </div>
            <p>(Hereinafter referred to as "the Tenant", which expression shall where the context so admits include successors in title, assigns, and legal representatives)</p>
        </div>
    </div>
    
    <div class="section">
        <h2>RECITALS</h2>
        <p class="clause">WHEREAS the Landlord is the lawful owner and possessor of the property hereinafter described and has agreed to let the same to the Tenant, and the Tenant has agreed to take the said property on the terms and conditions hereinafter contained.</p>
        <p class="clause">NOW THIS AGREEMENT WITNESSETH and it is hereby agreed as follows:</p>
    </div>
    
    <div class="section">
        <h2>1. DESCRIPTION OF PREMISES</h2>
        <p class="clause">1.1 The Landlord hereby lets to the Tenant ALL THAT property situated at:</p>
        
        <div class="property-box">
            <strong>Property Address:</strong> {{propertyAddress}}<br>
            {{#if unitNumber}}<strong>Unit:</strong> {{unitNumber}}<br>{{/if}}
            <strong>Property Type:</strong> {{propertyType}}<br>
            <strong>Bedrooms:</strong> {{bedrooms}} | <strong>Bathrooms:</strong> {{bathrooms}}
            {{#if furnishing}}<br><strong>Furnishing:</strong> {{furnishing}}{{/if}}
        </div>
        
        {{#if amenities}}
        <p class="clause">1.2 <strong>Inclusions:</strong> The premises include the following fixtures, fittings, and amenities: {{amenities}}</p>
        {{/if}}
    </div>
    
    <div class="section">
        <h2>2. TERM OF TENANCY</h2>
        <p class="clause">2.1 The tenancy shall commence on <strong class="amount">{{formatDate leaseStartDate}}</strong> and continue for a fixed term of <strong class="amount">{{leaseDurationMonths}} month(s)</strong>, expiring on <strong class="amount">{{formatDate leaseEndDate}}</strong>.</p>
        <p class="clause">2.2 The Tenant may request renewal by providing written notice at least <strong>three (3) months</strong> prior to expiration. Renewal is subject to the Landlord''s consent and compliance with Rent Control regulations.</p>
    </div>
    
    <div class="section">
        <h2>3. RENT AND PAYMENT TERMS</h2>
        <p class="clause">3.1 <strong>Monthly Rent:</strong> <span class="amount">GHS {{formatNumber monthlyRent}}</span> (Ghana Cedis: {{monthlyRentWords}} only)</p>
        
        {{#if advanceMonths}}
        <p class="clause">3.2 <strong>Advance Payment:</strong> The Tenant shall pay <strong class="amount">{{advanceMonths}} month(s)</strong> advance rent, totaling <span class="amount">GHS {{formatNumber advanceAmount}}</span>, upon execution of this Agreement. (Note: Maximum advance payment is six months as per Ghanaian law)</p>
        {{/if}}
        
        <p class="clause">3.3 <strong>Payment Schedule:</strong> Rent shall be paid on or before the <strong>{{ordinal paymentDueDay}}</strong> day of each month.</p>
        
        <p class="clause">3.4 <strong>Payment Method:</strong> {{paymentMethod}}</p>
        
        <p class="clause">3.5 <strong>Late Payment:</strong> A late payment charge of <strong>{{lateFeePercentage}}% per month</strong> shall apply to overdue rent beyond <strong>7 days</strong> of the due date.</p>
        
        <p class="clause">3.6 <strong>Rent Receipts:</strong> The Landlord shall provide official receipts for all payments received.</p>
        
        <p class="clause">3.7 <strong>Rent Review:</strong> No rent increase shall occur during the fixed term without mutual written consent and approval from the Rent Control Department.</p>
    </div>
    
    {{#if securityDeposit}}
    <div class="section">
        <h2>4. SECURITY DEPOSIT</h2>
        <p class="clause">4.1 The Tenant shall pay a refundable security deposit of <span class="amount">GHS {{formatNumber securityDeposit}}</span> upon signing this Agreement.</p>
        
        <p class="clause">4.2 The deposit shall be refunded within <strong>fourteen (14) days</strong> of tenancy termination, less deductions for:</p>
        <ul>
            <li>Unpaid rent or utilities</li>
            <li>Damages beyond normal wear and tear</li>
            <li>Outstanding cleaning or repair costs</li>
        </ul>
        
        <p class="clause">4.3 The security deposit shall not be applied as rent without prior written agreement.</p>
        
        <p class="clause">4.4 A joint inspection shall be conducted at commencement and termination to assess the condition of the premises.</p>
    </div>
    {{/if}}
    
    <div class="section">
        <h2>5. USE OF PREMISES</h2>
        <p class="clause">5.1 The premises shall be used exclusively for <strong>residential purposes</strong> and occupied by the Tenant and immediate family members only.</p>
        
        {{#if maxOccupants}}
        <p class="clause">5.2 <strong>Maximum Occupancy:</strong> {{maxOccupants}} persons</p>
        {{/if}}
        
        <p class="clause">5.3 The Tenant shall not:</p>
        <ul>
            <li>Use the premises for illegal, immoral, or commercial activities</li>
            <li>Sublet, assign, or transfer possession without the Landlord''s written consent</li>
            <li>Cause nuisance, disturbance, or damage to the property or neighboring premises</li>
            <li>Engage in activities that violate local regulations or community rules</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>6. MAINTENANCE AND REPAIRS</h2>
        <h3>6.1 Landlord''s Responsibilities:</h3>
        <ul>
            <li>Maintain structural integrity (walls, roof, foundation)</li>
            <li>Ensure functional plumbing, electrical, and sewage systems</li>
            <li>Repair or replace major appliances and fixtures (unless damaged by Tenant)</li>
            <li>Maintain exterior, common areas, and building services</li>
        </ul>
        
        <h3>6.2 Tenant''s Responsibilities:</h3>
        <ul>
            <li>Keep the interior clean and in good condition</li>
            <li>Report defects or needed repairs promptly to the Landlord</li>
            <li>Perform minor repairs (light bulbs, batteries, minor fixtures)</li>
            <li>Pay for damages caused by negligence or misuse</li>
        </ul>
        
        <p class="clause">6.3 The Tenant shall not make alterations, additions, improvements, or structural changes without the Landlord''s prior written approval.</p>
        
        <p class="clause">6.4 In emergencies (fire, flooding, burst pipes), the Tenant may arrange immediate repairs and seek reimbursement from the Landlord with supporting receipts.</p>
    </div>
    
    <div class="section">
        <h2>7. UTILITIES AND SERVICES</h2>
        {{#if noUtilitiesSpecified}}
        <p class="clause">7.1 Unless otherwise agreed in writing, the Tenant shall be responsible for payment of all utilities including electricity, water, and other services.</p>
        {{else}}
            {{#if tenantPaysAllUtilities}}
            <p class="clause">7.1 The <strong>Tenant shall pay for ALL utilities</strong> including: {{tenantUtilitiesText}}</p>
            {{else}}
                {{#if landlordPaysAllUtilities}}
                <p class="clause">7.1 The <strong>Landlord shall pay for ALL utilities</strong> including: {{landlordUtilitiesText}}</p>
                {{else}}
                    {{#if tenantUtilitiesText}}
                    <p class="clause">7.1 <strong>Tenant shall pay for:</strong> {{tenantUtilitiesText}}</p>
                    {{/if}}
                    {{#if landlordUtilitiesText}}
                    <p class="clause">7.2 <strong>Landlord shall pay for:</strong> {{landlordUtilitiesText}}</p>
                    {{/if}}
                {{/if}}
            {{/if}}
        {{/if}}
        
        <p class="clause">7.3 Utility meters shall be read jointly at the commencement and termination of the tenancy.</p>
        
        <p class="clause">7.4 The Landlord shall ensure initial utility connections are functional. The Tenant shall handle ongoing service bills and maintain accounts in good standing.</p>
    </div>
    
    <div class="section">
        <h2>8. INSURANCE</h2>
        <p class="clause">8.1 The Landlord shall maintain insurance coverage for the building structure against fire, natural disasters, and other structural risks.</p>
        
        <p class="clause">8.2 The Tenant is strongly advised to obtain contents insurance for personal belongings and liability coverage.</p>
        
        <p class="clause">8.3 The Landlord shall not be liable for loss, theft, or damage to the Tenant''s personal property, except where caused by the Landlord''s negligence.</p>
    </div>
    
    <div class="section">
        <h2>9. ACCESS AND INSPECTION</h2>
        <p class="clause">9.1 The Landlord or authorized agents may enter the premises for:</p>
        <ul>
            <li>Routine inspections (maximum quarterly)</li>
            <li>Necessary repairs or maintenance</li>
            <li>Showing the property to prospective tenants/buyers</li>
        </ul>
        
        <p class="clause">9.2 Except in emergencies, the Landlord shall provide at least <strong>twenty-four (24) hours''</strong> written notice before entry.</p>
        
        <p class="clause">9.3 The Tenant shall not unreasonably deny access for legitimate purposes.</p>
    </div>
    
    <div class="section">
        <h2>10. TERMINATION AND RENEWAL</h2>
        <p class="clause">10.1 <strong>Fixed Term Expiration:</strong> This Agreement shall terminate automatically on the expiration date unless renewed in writing.</p>
        
        <p class="clause">10.2 <strong>Notice for Non-Renewal:</strong> Either party wishing not to renew must provide <strong>one (1) month''s</strong> written notice prior to expiration.</p>
        
        <p class="clause">10.3 <strong>Early Termination by Tenant:</strong> The Tenant may terminate early by providing <strong>{{noticePeriodDays}} days</strong> written notice and may forfeit the security deposit unless otherwise agreed.</p>
        
        <p class="clause">10.4 <strong>Early Termination by Landlord:</strong> Early termination by the Landlord (except for breach) requires compensation to the Tenant as prescribed by law.</p>
        
        <p class="clause">10.5 <strong>Termination for Breach:</strong> Either party may terminate immediately for material breach, including:</p>
        <ul>
            <li>Non-payment of rent for <strong>seven (7) days</strong> beyond due date</li>
            <li>Illegal use of premises</li>
            <li>Material damage to property</li>
            <li>Violation of any fundamental term of this Agreement</li>
        </ul>
        
        <p class="clause">10.6 <strong>Vacating Procedures:</strong> Upon termination, the Tenant shall:</p>
        <ul>
            <li>Vacate the premises by the termination date</li>
            <li>Return all keys, access cards, and remote controls</li>
            <li>Restore the premises to original condition (fair wear excepted)</li>
            <li>Clear all personal belongings</li>
            <li>Allow final joint inspection</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>11. DEFAULT AND REMEDIES</h2>
        <p class="clause">11.1 <strong>Events of Default:</strong></p>
        <ul>
            <li>Failure to pay rent within seven (7) days of due date</li>
            <li>Breach of any covenant or condition herein</li>
            <li>Abandonment of the premises</li>
            <li>Bankruptcy or insolvency of the Tenant</li>
        </ul>
        
        <p class="clause">11.2 <strong>Landlord''s Remedies:</strong></p>
        <ul>
            <li>Recover possession through lawful eviction procedures via Rent Control Department</li>
            <li>Claim unpaid rent and damages</li>
            <li>Forfeit security deposit for legitimate deductions</li>
            <li>Pursue legal action for costs and damages</li>
        </ul>
        
        <p class="clause">11.3 <strong>No Self-Help Eviction:</strong> The Landlord shall not lock out, forcibly remove, or disconnect utilities without proper legal process and court order.</p>
        
        <p class="clause">11.4 The Tenant shall be liable for all legal costs incurred by the Landlord in enforcing rights under this Agreement.</p>
    </div>
    
    <div class="section">
        <h2>12. DISPUTE RESOLUTION</h2>
        <p class="clause">12.1 The parties agree to resolve disputes amicably through good faith negotiation.</p>
        
        <p class="clause">12.2 Unresolved disputes shall be referred to:</p>
        <ul>
            <li>The Rent Control Department for mediation</li>
            <li>Alternative Dispute Resolution (ADR) mechanisms</li>
            <li>Courts of competent jurisdiction in {{propertyCity}}, Ghana</li>
        </ul>
        
        <p class="clause">12.3 This Agreement shall be governed by and construed in accordance with the laws of the Republic of Ghana, including:</p>
        <ul>
            <li>Rent Act, 1963 (Act 220)</li>
            <li>Rent Control Law, 1986 (PNDCL 138)</li>
            <li>All applicable regulations</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>13. GENERAL PROVISIONS</h2>
        <p class="clause">13.1 <strong>Entire Agreement:</strong> This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations, representations, or agreements.</p>
        
        <p class="clause">13.2 <strong>Amendments:</strong> No modification shall be valid unless made in writing and signed by both parties.</p>
        
        <p class="clause">13.3 <strong>Severability:</strong> If any provision is deemed invalid or unenforceable, the remaining provisions shall remain in full force.</p>
        
        <p class="clause">13.4 <strong>Waiver:</strong> Failure to enforce any provision shall not constitute a waiver of that or any other provision.</p>
        
        <p class="clause">13.5 <strong>Notices:</strong> All notices shall be in writing and delivered personally, by registered mail, or electronic means to the addresses stated herein.</p>
        
        <p class="clause">13.6 <strong>Binding Effect:</strong> This Agreement shall bind and benefit the parties and their respective heirs, successors, and permitted assigns.</p>
    </div>
    
    {{#if additionalTerms}}
    <div class="section">
        <h2>14. SPECIAL CONDITIONS</h2>
        <p class="clause">{{additionalTerms}}</p>
    </div>
    {{/if}}
    
    <div class="signature-section">
        <h2>EXECUTION</h2>
        <p>IN WITNESS WHEREOF, the parties hereto have executed this Agreement on the day and year first above written.</p>
        
        {{#if propertyManagerSignsOnBehalf}}
        <!-- SCENARIO: Property Manager signs on behalf of Landlord (PM has authority) -->
        <div class="signature-block">
            <div class="signature">
                <div class="signature-line">
                    <strong>FOR AND ON BEHALF OF THE LANDLORD</strong><br>
                    {{propertyManagerName}}<br>
                    <em>(Property Manager / Authorized Agent)</em><br>
                    Acting on behalf of: {{landlordName}}<br>
                    Date: _______________
                </div>
            </div>
            <div class="signature">
                <div class="signature-line">
                    <strong>TENANT</strong><br>
                    {{tenantName}}<br>
                    Date: _______________
                </div>
            </div>
        </div>
        {{else}}
            {{#if isUserLandlord}}
            <!-- SCENARIO: User IS the Landlord -->
            <div class="signature-block">
                <div class="signature">
                    <div class="signature-line">
                        <strong>LANDLORD</strong><br>
                        {{landlordName}}<br>
                        Date: _______________
                    </div>
                </div>
                <div class="signature">
                    <div class="signature-line">
                        <strong>TENANT</strong><br>
                        {{tenantName}}<br>
                        Date: _______________
                    </div>
                </div>
            </div>
            {{else}}
                {{#if landlordWillSign}}
                <!-- SCENARIO: PM manages, but Landlord will also sign -->
                <div style="margin-bottom: 30px;">
                    <div class="signature" style="width: 100%; margin-bottom: 30px;">
                        <div class="signature-line">
                            <strong>PROPERTY MANAGER</strong><br>
                            {{propertyManagerName}}<br>
                            <em>(Managing Agent)</em><br>
                            Date: _______________
                        </div>
                    </div>
                </div>
                <div class="signature-block">
                    <div class="signature">
                        <div class="signature-line">
                            <strong>LANDLORD / PROPERTY OWNER</strong><br>
                            {{landlordName}}<br>
                            Date: _______________
                        </div>
                    </div>
                    <div class="signature">
                        <div class="signature-line">
                            <strong>TENANT</strong><br>
                            {{tenantName}}<br>
                            Date: _______________
                        </div>
                    </div>
                </div>
                {{else}}
                <!-- DEFAULT: Standard Landlord and Tenant signatures -->
                <div class="signature-block">
                    <div class="signature">
                        <div class="signature-line">
                            <strong>LANDLORD</strong><br>
                            {{landlordName}}<br>
                            Date: _______________
                        </div>
                    </div>
                    <div class="signature">
                        <div class="signature-line">
                            <strong>TENANT</strong><br>
                            {{tenantName}}<br>
                            Date: _______________
                        </div>
                    </div>
                </div>
                {{/if}}
            {{/if}}
        {{/if}}
        
        <div class="witness-section">
            <h3>WITNESSES</h3>
            <div class="witness-block">
                <div class="witness">
                    <strong>Witness 1 (Landlord''s Witness)</strong><br>
                    Full Name: _______________________<br>
                    ID Number: _______________________<br>
                    Signature: _______________________<br>
                    Date: _______________
                </div>
                <div class="witness">
                    <strong>Witness 2 (Tenant''s Witness)</strong><br>
                    Full Name: _______________________<br>
                    ID Number: _______________________<br>
                    Signature: _______________________<br>
                    Date: _______________
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <p>Document generated on {{formatDate generatedAt "long"}} via PropMetrik Property Management System</p>
        <p class="legal-note">This agreement should be reviewed by a qualified lawyer and may require registration with the Rent Control Department.</p>
    </div>
</body>
</html>',
    variables = '["today", "landlordName", "landlordAddress", "landlordIdNumber", "landlordPhone", "landlordEmail", "tenantName", "tenantAddress", "tenantIdNumber", "tenantPhone", "tenantEmail", "propertyAddress", "propertyType", "unitNumber", "bedrooms", "bathrooms", "furnishing", "amenities", "leaseStartDate", "leaseEndDate", "leaseDurationMonths", "monthlyRent", "monthlyRentWords", "advanceMonths", "advanceAmount", "paymentDueDay", "paymentMethod", "lateFeePercentage", "securityDeposit", "maxOccupants", "tenantUtilities", "landlordUtilities", "tenantUtilitiesText", "landlordUtilitiesText", "tenantPaysAllUtilities", "landlordPaysAllUtilities", "noUtilitiesSpecified", "noticePeriodDays", "additionalTerms", "propertyCity", "generatedAt", "isUserLandlord", "landlordWillSign", "propertyManagerName", "propertyManagerSignsOnBehalf", "signers"]'::jsonb,
    updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Ensure the template exists (insert if somehow missing)
INSERT INTO lease_templates (
    id, 
    organization_id, 
    name, 
    description, 
    content, 
    variables, 
    category, 
    is_default, 
    is_active, 
    version, 
    created_at, 
    updated_at
) 
SELECT 
    '00000000-0000-0000-0000-000000000001',
    NULL,
    'Ghana Residential Tenancy Agreement',
    'Comprehensive tenancy agreement template compliant with Ghana Rent Act',
    '<html><body><h1>Default Template</h1></body></html>',
    '[]'::jsonb,
    'residential',
    TRUE,
    TRUE,
    1,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM lease_templates WHERE id = '00000000-0000-0000-0000-000000000001');

