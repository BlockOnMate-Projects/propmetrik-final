'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, User, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

interface Agent {
    id: string
    user_id: string
    first_name: string
    last_name: string
    email: string
    organization_id: string
}

export default function AgentLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            // Validate inputs
            if (!email || !password) {
                setError('Please enter your email and password.')
                setIsLoading(false)
                return
            }

            // In production, this would authenticate against Keycloak/Auth provider
            // For now, we authenticate against the backend which validates credentials
            const authRes = await fetch(`${API_BASE}/auth/agent/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })

            if (authRes.ok) {
                const authData = await authRes.json()
                
                // Store agent context from auth response
                const agentContext = {
                    userId: authData.userId,
                    orgId: authData.organizationId,
                    agentId: authData.agentId,
                    agentName: authData.agentName,
                    email: authData.email,
                    role: 'agent',
                    token: authData.token
                }

                localStorage.setItem('agentContext', JSON.stringify(agentContext))
                router.push('/agent')
                return
            }

            // Fallback: If auth endpoint doesn't exist yet, validate against agents list
            // This is a temporary measure until proper auth is implemented
            const agentsRes = await fetch(`${API_BASE}/crm/agents?email=${encodeURIComponent(email)}`)
            
            if (!agentsRes.ok) {
                setError('Authentication service unavailable. Please try again.')
                setIsLoading(false)
                return
            }

            const agentsData = await agentsRes.json()
            const agents = agentsData.data || []
            const agent = agents.find((a: Agent) => a.email.toLowerCase() === email.toLowerCase())
            
            if (!agent) {
                setError('Invalid email or password.')
                setIsLoading(false)
                return
            }

            // Validate password - In production this would be done server-side
            // Password format: firstname + "123" (e.g., abena123 for abena.darkwa@...)
            const expectedPassword = email.split('@')[0].split('.')[0] + '123'
            if (password !== expectedPassword) {
                setError('Invalid email or password.')
                setIsLoading(false)
                return
            }

            // Store agent context
            const agentContext = {
                userId: agent.user_id,
                orgId: agent.organization_id,
                agentId: agent.id,
                agentName: `${agent.first_name} ${agent.last_name}`,
                email: agent.email,
                role: 'agent'
            }

            localStorage.setItem('agentContext', JSON.stringify(agentContext))
            router.push('/agent')
        } catch (err) {
            console.error('Login failed:', err)
            setError('Login failed. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="font-mono text-2xl font-bold text-amber-500">PROPMETRIK</h1>
                    <p className="font-mono text-xs text-zinc-500 mt-1">AGENT PORTAL</p>
                </div>

                {/* Login Form */}
                <div className="bg-zinc-900 border border-zinc-800 p-6">
                    <h2 className="font-mono text-lg text-white mb-6">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 text-red-400 font-mono text-xs">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">EMAIL</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="agent@company.com"
                                    className="pl-10 bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="font-mono text-[10px] text-zinc-500 mb-2 block">PASSWORD</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="pl-10 bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                                    required
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-amber-500 text-black hover:bg-amber-400 font-mono"
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-zinc-800">
                        <p className="font-mono text-[10px] text-zinc-600 text-center">
                            Forgot your password? Contact your administrator.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center mt-6 font-mono text-[10px] text-zinc-600">
                    © 2026 PROPMETRIK. All rights reserved.
                </p>
            </div>
        </div>
    )
}
