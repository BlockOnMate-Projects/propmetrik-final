import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const response = await fetch(`${API_BASE_URL}/api/v1/esign/verify-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        })

        const data = await response.json()
        
        return NextResponse.json(data, { status: response.status })
    } catch (error) {
        console.error('Error verifying OTP:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to verify OTP' },
            { status: 500 }
        )
    }
}
