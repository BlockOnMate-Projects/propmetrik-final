/**
 * Ghana Tenancy Agreement Generator
 * 
 * Generates lease agreements compliant with:
 * - Rent Act, 2020 (Act 1036)
 * - Rent Control Law, 1986 (PNDCL 138)
 * - Landlord and Tenant Act, 1963 (Act 220)
 * 
 * This utility generates a printable HTML document that can be converted to PDF
 * or printed directly for physical signing.
 */

import { format, addMonths } from 'date-fns'

// Types for lease generation
export interface LandlordInfo {
    fullName: string
    address: string
    phone: string
    ghanaCardNumber?: string
    email?: string
}

export interface TenantInfo {
    fullName: string
    address: string
    phone: string
    ghanaCardNumber: string
    email?: string
    occupation?: string
    employer?: string
}

export interface PropertyInfo {
    title: string
    addressStreet: string
    addressCity: string
    addressRegion: string
    digitalAddress?: string
    propertyType: string
    bedrooms?: number
    bathrooms?: number
    description?: string
}

export interface LeaseTerms {
    leaseStartDate: string
    leaseEndDate: string
    monthlyRent: number
    rentCurrency: string
    advanceMonths: number
    securityDepositMonths: number
    paymentDueDay: number
    paymentMethod: 'bank_transfer' | 'mobile_money' | 'cash' | 'other'
    paymentDetails?: string
    latePaymentPenaltyPercent: number
    latePaymentGraceDays: number
    noticePeriodMonths: number
    useType: 'residential' | 'commercial'
    maxOccupants: number
    petsAllowed: boolean
    petDetails?: string
    tenantUtilities: string[]
    landlordUtilities: string[]
    includedAmenities: string[]
    specialConditions?: string
    disputeResolutionCity: string
}

export interface LeaseAgreementData {
    landlord: LandlordInfo
    tenant: TenantInfo
    property: PropertyInfo
    terms: LeaseTerms
    generatedAt: Date
    agreementNumber?: string
}

// Number to words converter for amounts
function numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    if (num === 0) return 'Zero'
    
    const convert = (n: number): string => {
        if (n < 20) return ones[n]
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '')
        if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
        return convert(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 ? ' ' + convert(n % 1000000) : '')
    }
    
    return convert(Math.floor(num))
}

// Currency formatter
function formatCurrency(amount: number, currency: string): string {
    const symbol = currency === 'USD' ? '$' : '₵'
    return `${symbol}${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Generate agreement reference number
function generateAgreementNumber(): string {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `TA-${year}${month}-${random}`
}

/**
 * Generates a Ghana Tenancy Agreement HTML document
 */
export function generateLeaseAgreementHTML(data: LeaseAgreementData): string {
    const agreementNumber = data.agreementNumber || generateAgreementNumber()
    const securityDeposit = data.terms.monthlyRent * data.terms.securityDepositMonths
    const advanceRent = data.terms.monthlyRent * data.terms.advanceMonths
    const totalDueAtSigning = securityDeposit + advanceRent
    
    const currencyName = data.terms.rentCurrency === 'USD' ? 'US Dollars' : 'Ghana Cedis'
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tenancy Agreement - ${agreementNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @page {
            size: A4;
            margin: 2cm;
        }
        
        body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            background: #fff;
            padding: 40px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #000;
            padding-bottom: 20px;
        }
        
        .header h1 {
            font-size: 18pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 10px;
        }
        
        .header .subtitle {
            font-size: 11pt;
            color: #333;
        }
        
        .agreement-number {
            text-align: right;
            font-size: 10pt;
            color: #666;
            margin-bottom: 20px;
        }
        
        .section {
            margin-bottom: 25px;
        }
        
        .section-title {
            font-size: 13pt;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #ccc;
        }
        
        .parties-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 20px;
        }
        
        .party-box {
            border: 1px solid #ddd;
            padding: 15px;
            background: #fafafa;
        }
        
        .party-box h3 {
            font-size: 11pt;
            font-weight: bold;
            text-transform: uppercase;
            color: #666;
            margin-bottom: 10px;
        }
        
        .party-box p {
            font-size: 11pt;
            margin-bottom: 5px;
        }
        
        .clause {
            margin-bottom: 15px;
        }
        
        .clause-number {
            font-weight: bold;
            margin-right: 10px;
        }
        
        .clause-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .sub-clause {
            margin-left: 25px;
            margin-bottom: 8px;
        }
        
        .property-details {
            background: #f5f5f5;
            padding: 15px;
            border: 1px solid #ddd;
            margin-bottom: 20px;
        }
        
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        
        .detail-item {
            font-size: 11pt;
        }
        
        .detail-label {
            color: #666;
            font-size: 10pt;
        }
        
        .financial-summary {
            background: #f0f7f0;
            border: 2px solid #4a7c4a;
            padding: 20px;
            margin: 20px 0;
        }
        
        .financial-summary h3 {
            color: #2d5a2d;
            margin-bottom: 15px;
        }
        
        .financial-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px dotted #ccc;
        }
        
        .financial-total {
            font-weight: bold;
            font-size: 14pt;
            border-top: 2px solid #4a7c4a;
            margin-top: 10px;
            padding-top: 10px;
        }
        
        .utilities-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        
        .utilities-table th,
        .utilities-table td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
            font-size: 11pt;
        }
        
        .utilities-table th {
            background: #f5f5f5;
            font-weight: bold;
        }
        
        .signature-section {
            margin-top: 50px;
            page-break-inside: avoid;
        }
        
        .signature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 50px;
            margin-top: 30px;
        }
        
        .signature-box {
            border-top: 1px solid #000;
            padding-top: 10px;
        }
        
        .signature-line {
            border-bottom: 1px solid #000;
            height: 50px;
            margin-bottom: 5px;
        }
        
        .signature-label {
            font-size: 10pt;
            color: #666;
        }
        
        .signature-area {
            min-height: 60px;
            display: flex;
            align-items: flex-end;
            border-bottom: 2px solid #000;
            margin-bottom: 8px;
        }
        
        .signature-area img {
            max-height: 55px;
            max-width: 180px;
            object-fit: contain;
            display: block;
        }
        
        .witness-section {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ccc;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ccc;
            font-size: 9pt;
            color: #666;
            text-align: center;
        }
        
        .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d97706;
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 14px;
            cursor: pointer;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .print-button:hover {
            background: #b45309;
        }
        
        @media print {
            .print-button {
                display: none;
            }
            body {
                padding: 0;
            }
        }
    </style>
</head>
<body>
    
    <div class="header">
        <h1>Tenancy Agreement</h1>
        <p class="subtitle">Made pursuant to the Rent Act, 2020 (Act 1036) and applicable laws of the Republic of Ghana</p>
    </div>
    
    <p class="agreement-number">Agreement No: ${agreementNumber}</p>
    
    <!-- Parties Section -->
    <div class="section">
        <h2 class="section-title">1. Parties to This Agreement</h2>
        <p style="margin-bottom: 15px;">This Tenancy Agreement is made on <strong>${format(data.generatedAt, 'do MMMM yyyy')}</strong></p>
        
        <div class="parties-grid">
            <div class="party-box">
                <h3>The Landlord</h3>
                <p><strong>${data.landlord.fullName}</strong></p>
                <p>Address: ${data.landlord.address}</p>
                <p>Phone: ${data.landlord.phone}</p>
                ${data.landlord.ghanaCardNumber ? `<p>Ghana Card: ${data.landlord.ghanaCardNumber}</p>` : ''}
                ${data.landlord.email ? `<p>Email: ${data.landlord.email}</p>` : ''}
            </div>
            
            <div class="party-box">
                <h3>The Tenant</h3>
                <p><strong>${data.tenant.fullName}</strong></p>
                <p>Address: ${data.tenant.address}</p>
                <p>Phone: ${data.tenant.phone}</p>
                <p>Ghana Card: ${data.tenant.ghanaCardNumber}</p>
                ${data.tenant.email ? `<p>Email: ${data.tenant.email}</p>` : ''}
                ${data.tenant.occupation ? `<p>Occupation: ${data.tenant.occupation}</p>` : ''}
            </div>
        </div>
    </div>
    
    <!-- Property Section -->
    <div class="section">
        <h2 class="section-title">2. Property Description</h2>
        <div class="property-details">
            <p><strong>${data.property.title}</strong></p>
            <div class="details-grid">
                <div class="detail-item">
                    <span class="detail-label">Street Address:</span>
                    <p>${data.property.addressStreet}</p>
                </div>
                <div class="detail-item">
                    <span class="detail-label">City/Town:</span>
                    <p>${data.property.addressCity}</p>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Region:</span>
                    <p>${data.property.addressRegion}</p>
                </div>
                ${data.property.digitalAddress ? `
                <div class="detail-item">
                    <span class="detail-label">Digital Address:</span>
                    <p>${data.property.digitalAddress}</p>
                </div>
                ` : ''}
                <div class="detail-item">
                    <span class="detail-label">Property Type:</span>
                    <p>${data.property.propertyType}</p>
                </div>
                ${data.property.bedrooms ? `
                <div class="detail-item">
                    <span class="detail-label">Bedrooms:</span>
                    <p>${data.property.bedrooms}</p>
                </div>
                ` : ''}
            </div>
            ${data.property.description ? `<p style="margin-top: 10px;"><em>${data.property.description}</em></p>` : ''}
        </div>
    </div>
    
    <!-- Term Section -->
    <div class="section">
        <h2 class="section-title">3. Term of Tenancy</h2>
        <div class="clause">
            <p><span class="clause-number">3.1</span> The tenancy shall commence on <strong>${format(new Date(data.terms.leaseStartDate), 'do MMMM yyyy')}</strong> and shall expire on <strong>${format(new Date(data.terms.leaseEndDate), 'do MMMM yyyy')}</strong>, unless terminated earlier in accordance with this Agreement or renewed by mutual written consent of both parties.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">3.2</span> Either party may terminate this Agreement by giving <strong>${data.terms.noticePeriodMonths} month(s)</strong> written notice to the other party, provided all other terms and conditions have been fulfilled.</p>
        </div>
    </div>
    
    <!-- Rent Section -->
    <div class="section">
        <h2 class="section-title">4. Rent and Payment</h2>
        <div class="clause">
            <p><span class="clause-number">4.1</span> <strong>Monthly Rent:</strong> The Tenant agrees to pay a monthly rent of <strong>${formatCurrency(data.terms.monthlyRent, data.terms.rentCurrency)}</strong> (${numberToWords(data.terms.monthlyRent)} ${currencyName}).</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">4.2</span> <strong>Payment Due Date:</strong> Rent is due on the <strong>${data.terms.paymentDueDay}${data.terms.paymentDueDay === 1 ? 'st' : data.terms.paymentDueDay === 2 ? 'nd' : data.terms.paymentDueDay === 3 ? 'rd' : 'th'}</strong> day of each calendar month.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">4.3</span> <strong>Payment Method:</strong> Payment shall be made via ${data.terms.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : data.terms.paymentMethod === 'mobile_money' ? 'Mobile Money' : data.terms.paymentMethod === 'cash' ? 'Cash (with receipt)' : data.terms.paymentMethod}${data.terms.paymentDetails ? ` to: ${data.terms.paymentDetails}` : ''}.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">4.4</span> <strong>Late Payment:</strong> If rent is not paid within <strong>${data.terms.latePaymentGraceDays} days</strong> after the due date, a late payment fee of <strong>${data.terms.latePaymentPenaltyPercent}%</strong> of the monthly rent shall be charged.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">4.5</span> <strong>Advance Rent:</strong> In compliance with the Rent Act, 2020 (Act 1036), the Tenant shall pay rent <strong>${data.terms.advanceMonths} month(s)</strong> in advance, not exceeding the maximum of six (6) months as prescribed by law.</p>
        </div>
    </div>
    
    <!-- Security Deposit Section -->
    <div class="section">
        <h2 class="section-title">5. Security Deposit</h2>
        <div class="clause">
            <p><span class="clause-number">5.1</span> The Tenant shall pay a security deposit equivalent to <strong>${data.terms.securityDepositMonths} month(s)</strong> rent, being <strong>${formatCurrency(securityDeposit, data.terms.rentCurrency)}</strong> (${numberToWords(securityDeposit)} ${currencyName}).</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">5.2</span> The security deposit shall be held by the Landlord and returned to the Tenant within thirty (30) days after the termination of this Agreement and vacation of the premises, less any deductions for:</p>
            <p class="sub-clause">(a) Unpaid rent or other charges;</p>
            <p class="sub-clause">(b) Damages to the property beyond normal wear and tear;</p>
            <p class="sub-clause">(c) Cleaning costs if the premises are not left in the same condition as at commencement.</p>
        </div>
    </div>
    
    <!-- Financial Summary -->
    <div class="financial-summary">
        <h3>FINANCIAL SUMMARY - AMOUNT DUE AT SIGNING</h3>
        <div class="financial-row">
            <span>Advance Rent (${data.terms.advanceMonths} months × ${formatCurrency(data.terms.monthlyRent, data.terms.rentCurrency)})</span>
            <strong>${formatCurrency(advanceRent, data.terms.rentCurrency)}</strong>
        </div>
        <div class="financial-row">
            <span>Security Deposit (${data.terms.securityDepositMonths} months)</span>
            <strong>${formatCurrency(securityDeposit, data.terms.rentCurrency)}</strong>
        </div>
        <div class="financial-row financial-total">
            <span>TOTAL DUE AT SIGNING</span>
            <strong>${formatCurrency(totalDueAtSigning, data.terms.rentCurrency)}</strong>
        </div>
        <p style="margin-top: 10px; font-size: 10pt; color: #666;">(${numberToWords(totalDueAtSigning)} ${currencyName} Only)</p>
    </div>
    
    <!-- Use of Premises -->
    <div class="section">
        <h2 class="section-title">6. Use of Premises</h2>
        <div class="clause">
            <p><span class="clause-number">6.1</span> The premises shall be used exclusively for <strong>${data.terms.useType === 'residential' ? 'residential dwelling' : 'commercial/business'}</strong> purposes.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">6.2</span> The maximum number of occupants permitted in the premises is <strong>${data.terms.maxOccupants} person(s)</strong>.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">6.3</span> <strong>Pets:</strong> ${data.terms.petsAllowed ? `Pets are permitted with the following conditions: ${data.terms.petDetails || 'Subject to Landlord approval.'}` : 'No pets are allowed on the premises without prior written consent from the Landlord.'}</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">6.4</span> The Tenant shall not:</p>
            <p class="sub-clause">(a) Use the premises for any illegal or immoral purpose;</p>
            <p class="sub-clause">(b) Cause nuisance or disturbance to neighbors;</p>
            <p class="sub-clause">(c) Make structural alterations without written consent;</p>
            <p class="sub-clause">(d) Sublet or assign the tenancy without written consent.</p>
        </div>
    </div>
    
    <!-- Maintenance -->
    <div class="section">
        <h2 class="section-title">7. Maintenance and Repairs</h2>
        <div class="clause">
            <p><span class="clause-number">7.1</span> <strong>Landlord's Responsibilities:</strong></p>
            <p class="sub-clause">(a) Maintain the structure and exterior of the building in good repair;</p>
            <p class="sub-clause">(b) Keep installations for water, electricity, and sanitation in proper working order;</p>
            <p class="sub-clause">(c) Ensure the premises are fit for human habitation.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">7.2</span> <strong>Tenant's Responsibilities:</strong></p>
            <p class="sub-clause">(a) Keep the interior of the premises clean and in good condition;</p>
            <p class="sub-clause">(b) Report any damage or required repairs promptly to the Landlord;</p>
            <p class="sub-clause">(c) Use all appliances and fixtures in a reasonable manner;</p>
            <p class="sub-clause">(d) Repair any damage caused by the Tenant's negligence.</p>
        </div>
    </div>
    
    <!-- Utilities -->
    <div class="section">
        <h2 class="section-title">8. Utilities and Services</h2>
        <table class="utilities-table">
            <thead>
                <tr>
                    <th>Utility/Service</th>
                    <th>Responsible Party</th>
                </tr>
            </thead>
            <tbody>
                ${['Electricity', 'Water', 'Gas', 'Internet/Cable', 'Waste Collection'].map(utility => `
                <tr>
                    <td>${utility}</td>
                    <td>${data.terms.tenantUtilities.includes(utility) ? 'Tenant' : 'Landlord'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    
    ${data.terms.includedAmenities.length > 0 ? `
    <!-- Included Amenities -->
    <div class="section">
        <h2 class="section-title">9. Included Amenities</h2>
        <p>The following amenities are included with the premises and shall be maintained in working condition:</p>
        <ul style="margin-left: 25px; margin-top: 10px;">
            ${data.terms.includedAmenities.map(a => `<li>${a}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
    
    <!-- Access Rights -->
    <div class="section">
        <h2 class="section-title">${data.terms.includedAmenities.length > 0 ? '10' : '9'}. Right of Access</h2>
        <div class="clause">
            <p>The Landlord or their authorized agent may enter the premises upon giving at least <strong>24 hours</strong> notice to the Tenant for the following purposes:</p>
            <p class="sub-clause">(a) To inspect the condition of the property;</p>
            <p class="sub-clause">(b) To carry out necessary repairs or maintenance;</p>
            <p class="sub-clause">(c) To show the property to prospective tenants or buyers;</p>
            <p class="sub-clause">(d) In case of emergency, immediate access is permitted.</p>
        </div>
    </div>
    
    <!-- Termination -->
    <div class="section">
        <h2 class="section-title">${data.terms.includedAmenities.length > 0 ? '11' : '10'}. Termination</h2>
        <div class="clause">
            <p><span class="clause-number">${data.terms.includedAmenities.length > 0 ? '11' : '10'}.1</span> This Agreement may be terminated:</p>
            <p class="sub-clause">(a) By mutual written agreement of both parties;</p>
            <p class="sub-clause">(b) Upon expiration of the term, unless renewed;</p>
            <p class="sub-clause">(c) By either party giving <strong>${data.terms.noticePeriodMonths} month(s)</strong> written notice;</p>
            <p class="sub-clause">(d) For material breach of this Agreement, after written notice and failure to cure.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">${data.terms.includedAmenities.length > 0 ? '11' : '10'}.2</span> Upon termination, the Tenant shall:</p>
            <p class="sub-clause">(a) Vacate the premises and return all keys;</p>
            <p class="sub-clause">(b) Remove all personal belongings;</p>
            <p class="sub-clause">(c) Leave the premises in clean and good condition;</p>
            <p class="sub-clause">(d) Settle all outstanding rent and utility bills.</p>
        </div>
    </div>
    
    <!-- Dispute Resolution -->
    <div class="section">
        <h2 class="section-title">${data.terms.includedAmenities.length > 0 ? '12' : '11'}. Dispute Resolution</h2>
        <div class="clause">
            <p><span class="clause-number">${data.terms.includedAmenities.length > 0 ? '12' : '11'}.1</span> Any dispute arising from this Agreement shall first be resolved through good faith negotiation between the parties.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">${data.terms.includedAmenities.length > 0 ? '12' : '11'}.2</span> If negotiation fails, disputes may be referred to the Rent Control Department or appropriate court of competent jurisdiction in <strong>${data.terms.disputeResolutionCity}</strong>.</p>
        </div>
        <div class="clause">
            <p><span class="clause-number">${data.terms.includedAmenities.length > 0 ? '12' : '11'}.3</span> This Agreement shall be governed by the laws of the Republic of Ghana.</p>
        </div>
    </div>
    
    ${data.terms.specialConditions ? `
    <!-- Special Conditions -->
    <div class="section">
        <h2 class="section-title">${data.terms.includedAmenities.length > 0 ? '13' : '12'}. Special Conditions</h2>
        <p style="white-space: pre-wrap;">${data.terms.specialConditions}</p>
    </div>
    ` : ''}
    
    <!-- Signature Section -->
    <div class="signature-section">
        <h2 class="section-title">Execution</h2>
        <p>IN WITNESS WHEREOF, the parties have executed this Agreement on the date first written above.</p>
        
        <div class="signature-grid">
            <div class="signature-box" data-signer-role="landlord">
                <div class="signature-area" id="signature-landlord" data-field-type="signature" data-signer="landlord" style="min-height: 60px; border-bottom: 2px solid #000; margin-bottom: 8px;">
                    <!-- Signature will be inserted here -->
                </div>
                <p><strong>LANDLORD</strong></p>
                <p class="signature-label">Name: ${data.landlord.fullName}</p>
                <p class="signature-label">
                    <span>Date: </span>
                    <span id="date-landlord" data-field-type="date" data-signer="landlord">.................................</span>
                </p>
            </div>
            
            <div class="signature-box" data-signer-role="tenant">
                <div class="signature-area" id="signature-tenant" data-field-type="signature" data-signer="tenant" style="min-height: 60px; border-bottom: 2px solid #000; margin-bottom: 8px;">
                    <!-- Signature will be inserted here -->
                </div>
                <p><strong>TENANT</strong></p>
                <p class="signature-label">Name: ${data.tenant.fullName}</p>
                <p class="signature-label">
                    <span>Date: </span>
                    <span id="date-tenant" data-field-type="date" data-signer="tenant">.................................</span>
                </p>
            </div>
        </div>
        
        <div class="witness-section">
            <h3 style="font-size: 12pt; margin-bottom: 20px;">WITNESSES</h3>
            
            <div class="signature-grid">
                <div class="signature-box" data-signer-role="witness1">
                    <div class="signature-area" id="signature-witness1" data-field-type="signature" data-signer="witness1" style="min-height: 50px; border-bottom: 1px solid #000; margin-bottom: 8px;">
                        <!-- Witness 1 signature -->
                    </div>
                    <p class="signature-label">Witness 1 Name: ...................................</p>
                    <p class="signature-label">Address: ...................................</p>
                    <p class="signature-label">Phone: ...................................</p>
                </div>
                
                <div class="signature-box" data-signer-role="witness2">
                    <div class="signature-area" id="signature-witness2" data-field-type="signature" data-signer="witness2" style="min-height: 50px; border-bottom: 1px solid #000; margin-bottom: 8px;">
                        <!-- Witness 2 signature -->
                    </div>
                    <p class="signature-label">Witness 2 Name: ...................................</p>
                    <p class="signature-label">Address: ...................................</p>
                    <p class="signature-label">Phone: ...................................</p>
                </div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <p>This is a legally binding document. Both parties are advised to seek independent legal counsel before signing.</p>
        <p style="margin-top: 10px;">Agreement Reference: ${agreementNumber} | Generated: ${format(data.generatedAt, 'dd/MM/yyyy HH:mm')}</p>
        <p style="margin-top: 5px;">Powered by PROPMETRIK Property Management</p>
    </div>
</body>
</html>
`
}

/**
 * Opens the lease agreement in a new browser window for printing/saving as PDF
 */
export function openLeaseAgreement(data: LeaseAgreementData): void {
    const html = generateLeaseAgreementHTML(data)
    const newWindow = window.open('', '_blank')
    if (newWindow) {
        newWindow.document.write(html)
        newWindow.document.close()
    }
}

/**
 * Downloads the lease agreement as an HTML file
 */
export function downloadLeaseAgreementHTML(data: LeaseAgreementData, filename?: string): void {
    const html = generateLeaseAgreementHTML(data)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `tenancy-agreement-${format(new Date(), 'yyyy-MM-dd')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Signature data for embedding into document
 */
export interface SignatureEmbedData {
    signerId: string;           // 'landlord', 'tenant', 'witness1', 'witness2'
    signatureImage: string;     // Base64 data URL of signature
    signedAt: Date;
    signerName?: string;
}

/**
 * Embeds signatures directly into the lease document HTML
 * This creates a final signed document with signatures visible inline
 */
export function embedSignaturesInDocument(
    documentHtml: string, 
    signatures: SignatureEmbedData[]
): string {
    console.log('[embedSignatures] Starting with', signatures.length, 'signatures');
    console.log('[embedSignatures] Document HTML length:', documentHtml?.length);
    
    // Create a DOM parser to manipulate the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(documentHtml, 'text/html');
    
    // Debug: Check what structure exists in the document
    const hasSignatureArea = doc.querySelector('.signature-area');
    const hasSignatureSection = doc.querySelector('.signature-section');
    const hasSignatureBox = doc.querySelectorAll('.signature-box');
    const hasLandlordText = documentHtml.includes('LANDLORD');
    const hasTenantText = documentHtml.includes('TENANT');
    const hasSignatureId = documentHtml.includes('signature-landlord');
    
    console.log('[embedSignatures] Document structure check:');
    console.log('  - Has .signature-area:', !!hasSignatureArea);
    console.log('  - Has .signature-section:', !!hasSignatureSection);
    console.log('  - .signature-box count:', hasSignatureBox.length);
    console.log('  - Has LANDLORD text:', hasLandlordText);
    console.log('  - Has TENANT text:', hasTenantText);
    console.log('  - Has signature-landlord id:', hasSignatureId);
    
    // Extract a snippet of HTML around "LANDLORD" for debugging
    const landlordIndex = documentHtml.indexOf('LANDLORD');
    if (landlordIndex > -1) {
        console.log('[embedSignatures] HTML around LANDLORD:', documentHtml.substring(landlordIndex - 200, landlordIndex + 200));
    }
    
    for (const sig of signatures) {
        console.log('[embedSignatures] Processing signer:', sig.signerId);
        console.log('[embedSignatures] Signature image starts with:', sig.signatureImage?.substring(0, 50) + '...');
        console.log('[embedSignatures] Signature image length:', sig.signatureImage?.length || 0);
        
        let signatureEmbedded = false;
        let dateEmbedded = false;
        
        // Method 1: Try to find by ID (new documents)
        const signatureArea = doc.getElementById(`signature-${sig.signerId}`);
        console.log('[embedSignatures] Method 1 - Found by ID?', !!signatureArea, `(id: signature-${sig.signerId})`);
        
        if (signatureArea) {
            signatureArea.innerHTML = `
                <img 
                    src="${sig.signatureImage}" 
                    alt="${sig.signerName || sig.signerId} Signature"
                    style="max-height: 55px; max-width: 100%; object-fit: contain;"
                />
            `;
            signatureArea.style.borderBottom = '2px solid #000';
            signatureEmbedded = true;
            console.log('[embedSignatures] Embedded signature via ID for', sig.signerId);
        }
        
        // Method 2: Try to find by data-signer attribute
        if (!signatureEmbedded) {
            const signerArea = doc.querySelector(`[data-signer="${sig.signerId}"][data-field-type="signature"]`);
            console.log('[embedSignatures] Method 2 - Found by data-signer?', !!signerArea);
            
            if (signerArea) {
                (signerArea as HTMLElement).innerHTML = `
                    <img 
                        src="${sig.signatureImage}" 
                        alt="${sig.signerName || sig.signerId} Signature"
                        style="max-height: 55px; max-width: 100%; object-fit: contain;"
                    />
                `;
                signatureEmbedded = true;
            }
        }
        
        // Method 3: Find by LANDLORD/TENANT text labels in signature boxes (legacy documents)
        if (!signatureEmbedded) {
            const labelMap: Record<string, string> = {
                'landlord': 'LANDLORD',
                'tenant': 'TENANT',
                'witness1': 'Witness 1',
                'witness2': 'Witness 2'
            };
            const labelText = labelMap[sig.signerId];
            
            if (labelText) {
                // Find all strong/bold elements with the label
                const allStrong = doc.querySelectorAll('strong, b, p');
                for (const el of Array.from(allStrong)) {
                    if (el.textContent?.trim() === labelText || el.textContent?.includes(labelText)) {
                        // Found the label, look for signature line nearby
                        const parent = el.closest('.signature-box') || el.parentElement?.parentElement;
                        if (parent) {
                            // First, look for existing signature-area
                            const existingArea = parent.querySelector('.signature-area');
                            
                            if (existingArea) {
                                // Set innerHTML directly on the signature area with very explicit styles
                                (existingArea as HTMLElement).innerHTML = `<img src="${sig.signatureImage}" alt="${sig.signerName || sig.signerId} Signature" style="max-height: 55px; max-width: 180px; object-fit: contain; display: block !important; visibility: visible !important;" />`;
                                (existingArea as HTMLElement).style.cssText = 'min-height: 60px; display: flex !important; align-items: flex-end; visibility: visible !important;';
                                signatureEmbedded = true;
                                console.log('[embedSignatures] Method 3 - Embedded into existing signature-area for', sig.signerId);
                                break;
                            } else {
                                // No signature-area found, insert directly before the LANDLORD/TENANT label
                                const sigDiv = doc.createElement('div');
                                sigDiv.style.cssText = 'min-height: 60px; border-bottom: 2px solid #000; margin-bottom: 8px; display: flex !important; align-items: flex-end; visibility: visible !important;';
                                sigDiv.innerHTML = `<img src="${sig.signatureImage}" alt="${sig.signerName || sig.signerId} Signature" style="max-height: 55px; max-width: 180px; object-fit: contain; display: block !important; visibility: visible !important;" />`;
                                
                                // Insert before the label paragraph
                                const labelParagraph = el.closest('p') || el;
                                if (labelParagraph.parentElement) {
                                    labelParagraph.parentElement.insertBefore(sigDiv, labelParagraph);
                                }
                                signatureEmbedded = true;
                                console.log('[embedSignatures] Method 3 - Created new sig div before label for', sig.signerId);
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // Method 4: Last resort - inject signature into execution section
        if (!signatureEmbedded) {
            const executionSection = doc.querySelector('.execution-section, .signature-section');
            if (executionSection) {
                // Find signature grid or boxes
                const sigGrid = executionSection.querySelector('.signature-grid');
                if (sigGrid) {
                    const boxes = sigGrid.querySelectorAll('.signature-box');
                    const boxIndex = sig.signerId === 'landlord' ? 0 : sig.signerId === 'tenant' ? 1 : -1;
                    if (boxIndex >= 0 && boxes[boxIndex]) {
                        const box = boxes[boxIndex];
                        const existingContent = box.innerHTML;
                        box.innerHTML = `
                            <div style="min-height: 50px; border-bottom: 2px solid #000; margin-bottom: 8px;">
                                <img 
                                    src="${sig.signatureImage}" 
                                    alt="${sig.signerName || sig.signerId} Signature"
                                    style="max-height: 50px; max-width: 180px; object-fit: contain;"
                                />
                            </div>
                        ` + existingContent;
                        signatureEmbedded = true;
                        console.log('[embedSignatures] Method 4 - Embedded via box index for', sig.signerId);
                    }
                }
            }
        }
        
        // Handle date fields
        const dateField = doc.getElementById(`date-${sig.signerId}`);
        if (dateField) {
            dateField.textContent = format(sig.signedAt, 'MMMM d, yyyy');
            dateField.style.fontWeight = 'bold';
            dateEmbedded = true;
            console.log('[embedSignatures] Embedded date via ID for', sig.signerId);
        }
        
        // Try data-signer for date
        if (!dateEmbedded) {
            const dateEl = doc.querySelector(`[data-signer="${sig.signerId}"][data-field-type="date"]`);
            if (dateEl) {
                (dateEl as HTMLElement).textContent = format(sig.signedAt, 'MMMM d, yyyy');
                (dateEl as HTMLElement).style.fontWeight = 'bold';
                dateEmbedded = true;
            }
        }
        
        // Try to find date field near the signature by label
        if (!dateEmbedded) {
            const labelMap: Record<string, string> = {
                'landlord': 'LANDLORD',
                'tenant': 'TENANT'
            };
            const labelText = labelMap[sig.signerId];
            
            if (labelText) {
                const allElements = doc.querySelectorAll('p, div');
                for (const el of Array.from(allElements)) {
                    const text = el.textContent || '';
                    if (text.includes(labelText) && el.closest('.signature-box')) {
                        const parent = el.closest('.signature-box');
                        if (parent) {
                            // Look for date line
                            const dateLine = Array.from(parent.querySelectorAll('p')).find(p => 
                                p.textContent?.toLowerCase().includes('date:')
                            );
                            if (dateLine) {
                                const dateSpan = dateLine.querySelector('span:last-child') || dateLine;
                                if (dateSpan.textContent?.includes('.....')) {
                                    dateSpan.textContent = format(sig.signedAt, 'MMMM d, yyyy');
                                    (dateSpan as HTMLElement).style.fontWeight = 'bold';
                                    dateEmbedded = true;
                                    console.log('[embedSignatures] Embedded date via label search for', sig.signerId);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        console.log('[embedSignatures] Result for', sig.signerId, '- signature:', signatureEmbedded, 'date:', dateEmbedded);
    }
    
    // Return the modified HTML with DOCTYPE
    const serializer = new XMLSerializer();
    let result = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    
    // Debug: log if signature areas were found
    const sigAreas = doc.querySelectorAll('.signature-area, [data-field-type="signature"]');
    console.log('[embedSignatures] Complete. Result length:', result.length, 'Signature areas found:', sigAreas.length);
    
    return result;
}

/**
 * Maps signer roles to document signer IDs
 */
export function mapSignerRoleToId(role: string, order: number): string {
    const roleLower = (role || '').toLowerCase();
    
    // Check by role name first
    if (roleLower.includes('landlord') || roleLower === 'signer_1' || roleLower === 'property owner') return 'landlord';
    if (roleLower.includes('tenant') || roleLower === 'signer_2') return 'tenant';
    if (roleLower.includes('witness') && roleLower.includes('1')) return 'witness1';
    if (roleLower.includes('witness') && roleLower.includes('2')) return 'witness2';
    
    // Fallback to order
    if (order === 1) return 'landlord';
    if (order === 2) return 'tenant';
    if (order === 3) return 'witness1';
    if (order === 4) return 'witness2';
    
    return role;
}
