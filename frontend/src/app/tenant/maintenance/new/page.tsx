'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getTenantProfile,
  createMaintenanceRequest,
  getSessionToken,
  TenantProfile
} from '@/lib/api';

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing', icon: '🚿' },
  { value: 'electrical', label: 'Electrical', icon: '⚡' },
  { value: 'hvac', label: 'HVAC / Air Conditioning', icon: '❄️' },
  { value: 'appliances', label: 'Appliances', icon: '🔌' },
  { value: 'structural', label: 'Structural / Building', icon: '🏠' },
  { value: 'pest_control', label: 'Pest Control', icon: '🐛' },
  { value: 'locks_security', label: 'Locks & Security', icon: '🔐' },
  { value: 'exterior', label: 'Exterior / Landscaping', icon: '🌳' },
  { value: 'cleaning', label: 'Cleaning', icon: '🧹' },
  { value: 'other', label: 'Other', icon: '📝' }
];

const PRIORITIES = [
  { value: 'low', label: 'Low', description: 'Non-urgent, can wait a few days', color: 'text-green-600' },
  { value: 'medium', label: 'Medium', description: 'Should be addressed within a few days', color: 'text-yellow-600' },
  { value: 'high', label: 'High', description: 'Urgent, needs attention soon', color: 'text-orange-600' },
  { value: 'emergency', label: 'Emergency', description: 'Critical - safety hazard or major damage', color: 'text-red-600' }
];

export default function NewMaintenanceRequest() {
  const router = useRouter();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState('phone');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('');
  const [images, setImages] = useState<File[]>([]);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.push('/login');
      return;
    }

    async function loadProfile() {
      try {
        const data = await getTenantProfile();
        setProfile(data);
      } catch (err: any) {
        setError(err.message);
        if (err.message === 'Session expired') {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setImages(prev => [...prev, ...Array.from(files)].slice(0, 5));
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const activeTenancy = profile?.tenancies.find(t => t.status === 'active');
    if (!activeTenancy) {
      setError('No active tenancy found');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createMaintenanceRequest(activeTenancy.id, {
        title,
        category,
        priority: priority as 'low' | 'medium' | 'high' | 'emergency',
        description,
        location: location || undefined,
        preferredContactMethod: preferredContactMethod as 'phone' | 'email' | 'sms',
        preferredTimeSlot: preferredTimeSlot || undefined,
        images
      });

      router.push('/maintenance?success=true');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeTenancy = profile?.tenancies.find(t => t.status === 'active');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/maintenance" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Submit Maintenance Request</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {activeTenancy && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Property:</span> {activeTenancy.propertyTitle}
            </p>
            <p className="text-sm text-blue-800">
              <span className="font-medium">Address:</span> {activeTenancy.propertyAddress}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Issue Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Kitchen faucet leaking"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Category */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Category *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    category === cat.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl mb-1 block">{cat.icon}</span>
                  <span className="text-sm font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
            {!category && (
              <input type="hidden" name="category" required />
            )}
          </div>

          {/* Priority */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Priority Level *
            </label>
            <div className="space-y-3">
              {PRIORITIES.map((p) => (
                <label
                  key={p.value}
                  className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    priority === p.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={p.value}
                    checked={priority === p.value}
                    onChange={(e) => setPriority(e.target.value)}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <span className={`font-medium ${p.color}`}>{p.label}</span>
                    <p className="text-sm text-gray-500">{p.description}</p>
                  </div>
                  {priority === p.value && (
                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe the issue in detail. Include what happened, when you noticed it, and any other relevant information..."
              required
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Location within property */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location within Property
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Master bedroom, Kitchen, Bathroom 2"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Photos */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photos (Optional)
            </label>
            <p className="text-sm text-gray-500 mb-4">
              Upload up to 5 photos to help illustrate the issue
            </p>
            
            <div className="flex flex-wrap gap-4">
              {images.map((file, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Upload ${index + 1}`}
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
              
              {images.length < 5 && (
                <label className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="sr-only"
                    multiple
                  />
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </label>
              )}
            </div>
          </div>

          {/* Contact Preferences */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Contact Preferences
            </label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Preferred Contact Method
                </label>
                <select
                  value={preferredContactMethod}
                  onChange={(e) => setPreferredContactMethod(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="phone">Phone Call</option>
                  <option value="sms">SMS / Text</option>
                  <option value="email">Email</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  Preferred Time for Access
                </label>
                <select
                  value={preferredTimeSlot}
                  onChange={(e) => setPreferredTimeSlot(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Any time</option>
                  <option value="morning">Morning (8am - 12pm)</option>
                  <option value="afternoon">Afternoon (12pm - 5pm)</option>
                  <option value="evening">Evening (5pm - 8pm)</option>
                  <option value="weekend">Weekend Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <Link
              href="/maintenance"
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg text-center hover:bg-gray-200 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !title || !category || !description}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </span>
              ) : (
                'Submit Request'
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
