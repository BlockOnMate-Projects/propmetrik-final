'use client';

import React from 'react';

interface ApplicationFormProps {
    property: any;
    token?: string;
}

export default function ApplicationForm({ property, token }: ApplicationFormProps) {
    return (
        <div className="p-4 border rounded shadow">
            <h2 className="text-xl font-bold mb-4">Application Form</h2>
            <p>Application for property: {property?.address || 'Unknown Property'}</p>
            {token && <p className="text-sm text-gray-500">Token: {token}</p>}
            <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded">
                Placeholder form. Implementation pending.
            </div>
        </div>
    );
}
