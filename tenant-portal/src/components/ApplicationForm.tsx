'use client';

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { submitApplication, ApplicationInput, Property } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface ApplicationFormProps {
  property: Property;
  token?: string; // Application token (e.g. from magic link)
}

export default function ApplicationForm({ property, token }: ApplicationFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ApplicationInput['applicant']>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    currentAddress: '',
    employment: {
      status: 'employed',
      employer: '',
      position: '',
      monthlyIncome: 0,
      currency: 'GHS', // Default
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
    setIsSubmitting(true);
    setError('');
    
    try {
      if (!token && !process.env.NEXT_PUBLIC_DEV_MODE) {
         // In prod, check token. For Dev/Demo, assume we have a propertyId from URL path param
      }
        
      const result = await submitApplication({
        propertyId: property.id,
        applicationToken: token,
        applicant: formData,
      });

      // Pass both the application ID and the application token for status tracking
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
        <p className="text-gray-500">{property.addressStreet}, {property.addressCity}</p>
        <div className="mt-4">
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-right mt-1 text-gray-500">Step {step} of {totalSteps}</div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input 
                    id="fullName" 
                    value={formData.fullName} 
                    onChange={(e) => handleInputChange('fullName', e.target.value)} 
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
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
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={formData.email} 
                    onChange={(e) => handleInputChange('email', e.target.value)} 
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    value={formData.phone} 
                    onChange={(e) => handleInputChange('phone', e.target.value)} 
                    placeholder="+233..."
                  />
                </div>
              </div>

               <div className="space-y-2">
                  <Label htmlFor="currentAddress">Current Residential Address</Label>
                  <Input 
                    id="currentAddress" 
                    value={formData.currentAddress} 
                    onChange={(e) => handleInputChange('currentAddress', e.target.value)} 
                    placeholder="House No, Street, City"
                  />
                </div>
            </>
          )}

          {step === 2 && (
             <>
                <div className="space-y-2">
                  <Label htmlFor="employer">Current Employer</Label>
                  <Input 
                    id="employer" 
                    value={formData.employment.employer} 
                    onChange={(e) => handleNestedChange('employment', 'employer', e.target.value)} 
                    placeholder="Company Name"
                  />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="position">Job Title/Position</Label>
                    <Input 
                        id="position" 
                        value={formData.employment.position} 
                        onChange={(e) => handleNestedChange('employment', 'position', e.target.value)} 
                        placeholder="Software Engineer"
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="income">Monthly Income</Label>
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
