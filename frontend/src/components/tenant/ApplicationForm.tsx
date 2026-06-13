'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { submitApplication, uploadApplicationDocument, ApplicationInput, Property, PropertyUnit } from '@/lib/tenant/api';
import { useRouter } from 'next/navigation';

const ID_LABELS: Record<string, string> = { ghana_card: 'Ghana Card', passport: 'Passport' };
const SIDE_LABELS: Record<string, string> = { front: 'Front', back: 'Back', bio: 'Bio Page' };
const idDocLabel = (type: string, side: string) => `${ID_LABELS[type] || 'ID'} - ${SIDE_LABELS[side] || side}`;

interface ApplicationFormProps {
  property: Property;
  token?: string;
  units?: PropertyUnit[];
}

export default function ApplicationForm({ property, token, units }: ApplicationFormProps) {
  const router = useRouter();
  const hasUnits = !!units && units.length > 0;
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    units && units.length === 1 ? units[0].id : ''
  );
  const selectedUnit = units?.find((u) => u.id === selectedUnitId);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ApplicationInput['applicant']>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    currentAddress: '',
    idType: 'ghana_card',
    idNumber: '',
    documents: [],
    employment: {
      status: 'employed',
      employer: '',
      position: '',
      monthlyIncome: 0,
      currency: 'GHS',
    },
    emergencyContact: {
      name: '',
      relationship: '',
      phone: '',
      email: '',
    },
    references: [
      { name: '', relationship: '', phone: '', email: '' },
    ],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ID document upload state
  const [uploadingSide, setUploadingSide] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const requiredSides = formData.idType === 'passport' ? ['bio'] : ['front', 'back'];
  const hasAllIdImages = requiredSides.every((s) => formData.documents.some((d) => d.side === s));

  const handleIdTypeChange = (idType: string) => {
    // Switching ID type invalidates previously uploaded images
    setFormData((prev) => ({ ...prev, idType, documents: [] }));
    setPreviews({});
  };

  const handleIdUpload = async (side: string, file: File) => {
    if (!token) {
      setError('Document upload requires opening this form from your application link.');
      return;
    }
    setUploadingSide(side);
    setError('');
    try {
      const uploaded = await uploadApplicationDocument(token, file, formData.idType, side);
      setFormData((prev) => ({
        ...prev,
        documents: [
          ...prev.documents.filter((d) => d.side !== side),
          { type: formData.idType, side, url: uploaded.url, filename: idDocLabel(formData.idType, side) },
        ],
      }));
      setPreviews((prev) => ({ ...prev, [side]: URL.createObjectURL(file) }));
    } catch (err: any) {
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploadingSide(null);
    }
  };

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNestedChange = (section: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [field]: value,
      },
    }));
  };

  const handleNext = () => {
    if (step === 1) {
      if (hasUnits && !selectedUnitId) { setError('Please select a unit to apply for.'); return; }
      if (!formData.fullName.trim()) { setError('Full name is required.'); return; }
      if (!formData.dateOfBirth) { setError('Date of birth is required.'); return; }
      if (!formData.email.trim()) { setError('Email is required.'); return; }
      if (!formData.phone.trim()) { setError('Mobile number is required.'); return; }
      if (!formData.currentAddress.trim()) { setError('Current residential address is required.'); return; }
      if (!formData.idNumber.trim()) { setError(`${ID_LABELS[formData.idType] || 'ID'} number is required.`); return; }
      if (!hasAllIdImages) {
        setError(formData.idType === 'passport'
          ? 'Please upload your passport bio page.'
          : 'Please upload the front and back of your Ghana Card.');
        return;
      }
    }
    if (step === 2) {
      if (!formData.employment.position.trim()) { setError('Occupation / job title is required.'); return; }
      if (!formData.employment.employer.trim()) { setError('Employer is required.'); return; }
      if (!formData.employment.monthlyIncome || formData.employment.monthlyIncome <= 0) { setError('Monthly income is required.'); return; }
    }
    setError('');
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (hasUnits && !selectedUnitId) {
      setStep(1);
      setError('Please select a unit to apply for.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      const result = await submitApplication({
        propertyId: property.id,
        unitId: selectedUnitId || undefined,
        applicationToken: token,
        applicant: formData,
      });

      const trackingToken = result.applicationToken || result.id;
      router.push(`/apply/${property.id}/success?id=${result.id}&token=${trackingToken}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit application');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Apply for {property.title}</h1>
        <p className="text-muted-foreground">
          {property.addressStreet}, {property.addressCity}
          {selectedUnit && <span className="font-medium text-foreground"> · Unit {selectedUnit.unitNumber}</span>}
        </p>
        <div className="mt-4">
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-right mt-1 text-muted-foreground">Step {step} of {totalSteps}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && 'Personal Information'}
            {step === 2 && 'Employment Details'}
            {step === 3 && 'References & Emergency'}
            {step === 4 && 'Review Application'}
          </CardTitle>
          <CardDescription>
             {step === 1 && 'Tell us a bit about yourself'}
             {step === 2 && 'Your current employment status'}
             {step === 3 && 'Who can we contact?'}
             {step === 4 && 'Please review your details before submitting'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              {hasUnits && (
                <div className="space-y-2 border-b pb-4 mb-2">
                  <Label>Select Unit <span className="text-red-500">*</span></Label>
                  <p className="text-xs text-muted-foreground">This building has multiple units — choose the one you'd like to apply for.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {units!.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => { setSelectedUnitId(u.id); setError(''); }}
                        className={`text-left rounded-md border p-3 transition-colors ${
                          selectedUnitId === u.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-input hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Unit {u.unitNumber}</span>
                          <span className="text-sm font-medium">{u.priceCurrency} {u.price.toLocaleString()}/mo</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {u.floorNumber != null && <span>Floor {u.floorNumber} · </span>}
                          {u.bedrooms ?? 0} bd · {u.bathrooms ?? 0} ba
                          {u.totalAreaSqm ? ` · ${u.totalAreaSqm} m²` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth <span className="text-red-500">*</span></Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Mobile Number <span className="text-red-500">*</span></Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="+233..."
                  />
                </div>
              </div>

               <div className="space-y-2">
                  <Label htmlFor="currentAddress">Current Residential Address <span className="text-red-500">*</span></Label>
                  <Input
                    id="currentAddress"
                    value={formData.currentAddress}
                    onChange={(e) => handleInputChange('currentAddress', e.target.value)}
                    placeholder="House No, Street, City"
                  />
                </div>

              {/* Identification */}
              <div className="space-y-4 border-t pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="idType">Form of ID <span className="text-red-500">*</span></Label>
                    <select
                      id="idType"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={formData.idType}
                      onChange={(e) => handleIdTypeChange(e.target.value)}
                    >
                      <option value="ghana_card">Ghana Card</option>
                      <option value="passport">Passport</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="idNumber">{ID_LABELS[formData.idType]} Number <span className="text-red-500">*</span></Label>
                    <Input
                      id="idNumber"
                      value={formData.idNumber}
                      onChange={(e) => handleInputChange('idNumber', e.target.value)}
                      placeholder={formData.idType === 'passport' ? 'e.g. G1234567' : 'e.g. GHA-123456789-0'}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    Upload {formData.idType === 'passport' ? 'Passport Bio Page' : 'Ghana Card — Front & Back'} <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Take a clear photo or upload an image of your {formData.idType === 'passport' ? 'passport bio page' : 'Ghana Card (both sides)'}.
                  </p>
                  <div className={`grid gap-3 ${requiredSides.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {requiredSides.map((side) => {
                      const uploaded = formData.documents.some((d) => d.side === side);
                      return (
                        <label
                          key={side}
                          className="relative border-2 border-dashed border-input rounded-lg p-3 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors min-h-[130px] text-center"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => { const fl = e.target.files?.[0]; if (fl) handleIdUpload(side, fl); }}
                          />
                          {previews[side] ? (
                            <img src={previews[side]} alt={SIDE_LABELS[side]} className="max-h-24 object-contain rounded" />
                          ) : uploadingSide === side ? (
                            <span className="text-xs text-muted-foreground">Uploading…</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{SIDE_LABELS[side]}<br />Tap to upload or scan</span>
                          )}
                          {uploaded && (
                            <span className="text-[10px] text-green-600 font-medium mt-1">✓ {SIDE_LABELS[side]} uploaded</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
             <>
                <div className="space-y-2">
                  <Label htmlFor="employer">Current Employer <span className="text-red-500">*</span></Label>
                  <Input
                    id="employer"
                    value={formData.employment.employer}
                    onChange={(e) => handleNestedChange('employment', 'employer', e.target.value)}
                    placeholder="Company Name"
                  />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="position">Job Title / Occupation <span className="text-red-500">*</span></Label>
                    <Input
                        id="position"
                        value={formData.employment.position}
                        onChange={(e) => handleNestedChange('employment', 'position', e.target.value)}
                        placeholder="Software Engineer"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="income">Monthly Income <span className="text-red-500">*</span></Label>
                        <Input
                            id="income"
                            type="number"
                            value={formData.employment.monthlyIncome}
                            onChange={(e) => handleNestedChange('employment', 'monthlyIncome', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="currency">Currency</Label>
                        <select
                            id="currency"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={formData.employment.currency}
                            onChange={(e) => handleNestedChange('employment', 'currency', e.target.value)}
                        >
                            <option value="GHS">GHS</option>
                            <option value="USD">USD</option>
                        </select>
                    </div>
                </div>
             </>
          )}

          {step === 3 && (
            <>
                <div className="border-b pb-4 mb-4">
                    <h3 className="font-medium mb-2">Emergency Contact</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                value={formData.emergencyContact.name}
                                onChange={(e) => handleNestedChange('emergencyContact', 'name', e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Relationship</Label>
                            <Input
                                value={formData.emergencyContact.relationship}
                                onChange={(e) => handleNestedChange('emergencyContact', 'relationship', e.target.value)}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                                value={formData.emergencyContact.phone}
                                onChange={(e) => handleNestedChange('emergencyContact', 'phone', e.target.value)}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Email</Label>
                            <Input
                                value={formData.emergencyContact.email}
                                onChange={(e) => handleNestedChange('emergencyContact', 'email', e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                 <div>
                    <h3 className="font-medium mb-2">Reference</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                value={formData.references[0].name}
                                onChange={(e) => {
                                    const newRefs = [...formData.references];
                                    newRefs[0].name = e.target.value;
                                    handleInputChange('references', newRefs);
                                }}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                                value={formData.references[0].phone}
                                onChange={(e) => {
                                    const newRefs = [...formData.references];
                                    newRefs[0].phone = e.target.value;
                                    handleInputChange('references', newRefs);
                                }}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Relationship</Label>
                            <Input
                                value={formData.references[0].relationship}
                                onChange={(e) => {
                                    const newRefs = [...formData.references];
                                    newRefs[0].relationship = e.target.value;
                                    handleInputChange('references', newRefs);
                                }}
                            />
                        </div>
                    </div>
                 </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-4 text-sm">
                <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-semibold">Confirm Applicant</h4>
                    <p>{formData.fullName}</p>
                    <p>{formData.email} • {formData.phone}</p>
                </div>
                 <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-semibold">Employment</h4>
                    <p>{formData.employment.position} at {formData.employment.employer}</p>
                    <p>{formData.employment.currency} {formData.employment.monthlyIncome}/mo</p>
                </div>
                <div className="bg-blue-50 text-blue-800 p-4 rounded-md text-xs">
                    By submitting this application, you authorize PROPMETRIK and the property manager to verify the information provided, including checking credit and employment references.
                </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm">
                {error}
            </div>
          )}

        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={step === 1 || isSubmitting}>
            Back
          </Button>
          <Button onClick={handleNext} disabled={isSubmitting}>
            {step === totalSteps ? (isSubmitting ? 'Submitting...' : 'Submit Application') : 'Next'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
