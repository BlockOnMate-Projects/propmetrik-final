'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2, Lock } from 'lucide-react';

const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://sso.cedynhq.com';
const KEYCLOAK_REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'propmetrik';
const KEYCLOAK_CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'propmetrik-web';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    // Redirect to Keycloak's built-in reset-credentials page
    const params = new URLSearchParams({
      client_id: KEYCLOAK_CLIENT_ID,
      redirect_uri: `${window.location.origin}/login`,
      login_hint: email,
    });

    window.location.href = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/login-actions/reset-credentials?${params.toString()}`;
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left panel — simple branding */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[48%] relative overflow-hidden flex-col justify-between">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&q=80"
            alt="Accra cityscape"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/95 via-zinc-950/80 to-zinc-950/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 p-10 xl:p-14 flex flex-col h-full">
          <Link href="/">
            <Image
              src="/branding/logo-dark-bg.svg"
              alt="PROPMETRIK"
              width={180}
              height={50}
              className="h-10 w-auto object-contain"
            />
          </Link>

          <div className="my-auto py-16">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h1 className="text-4xl xl:text-5xl font-bold text-foreground tracking-tight leading-tight mb-6">
                Reset your{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400">
                  password
                </span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
                Enter your email and we&apos;ll redirect you to our secure identity provider to reset your password.
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col min-h-screen">
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border">
          <Link href="/">
            <Image
              src="/branding/logo-dark-bg.svg"
              alt="PROPMETRIK"
              width={140}
              height={40}
              className="h-8 w-auto object-contain"
            />
          </Link>
          <Link href="/login" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Link>

            <h2 className="text-2xl font-bold text-foreground mb-2">Forgot your password?</h2>
            <p className="text-sm text-muted-foreground mb-8">
              Enter your email address and you&apos;ll be redirected to reset your password securely.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-4 py-3 bg-card/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-2"
              >
                Reset Password
              </button>
            </form>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Remember your password?{' '}
              <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </p>
          </motion.div>
        </div>

        <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-muted-foreground uppercase tracking-wider">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              SSL Encrypted
            </div>
            <span className="text-zinc-800">|</span>
            <span>PCI DSS Compliant</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground normal-case">
            <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
            <span className="text-zinc-800">·</span>
            <Link href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
