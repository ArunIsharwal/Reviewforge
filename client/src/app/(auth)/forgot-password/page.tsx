'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setIssuedToken(null);

    try {
      const res = await apiClient.forgotPassword(email);

      if (!res.success) {
        throw new Error(res.error || 'Failed to process password reset request.');
      }

      setSuccess('A secure password reset token has been issued.');
      if (res.resetToken) {
        setIssuedToken(res.resetToken as string);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[#F7F7F2]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/login" className="inline-flex items-center gap-2 group mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#17251F] text-[#C8ED78] flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform ring-2 ring-[#C8ED78]/30">
            RF
          </div>
          <span className="text-2xl font-bold text-[#17251F] tracking-tight">
            Review<span className="text-[#5876D8]">Forge</span>
          </span>
        </Link>
        <h2 className="text-2xl font-extrabold text-[#17251F]">
          Forgot your password?
        </h2>
        <p className="mt-2 text-xs text-[#747D75]">
          Enter your registered corporate email to receive a password reset token.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-[#FFFFFF] py-8 px-6 shadow-sm border border-[#E6E8E1] rounded-2xl sm:px-10">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-[#EEF9D1] border border-[#D6EFA0] rounded-xl flex flex-col gap-2 text-xs text-[#2C5E1A] animate-in fade-in">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#2C5E1A] shrink-0 mt-0.5" />
                <span className="font-semibold">{success}</span>
              </div>
              {issuedToken && (
                <div className="mt-2 p-2.5 bg-white border border-[#D6EFA0] rounded-lg">
                  <span className="text-[10px] text-[#747D75] uppercase tracking-wider block font-bold mb-1">
                    Your One-Time Reset Token:
                  </span>
                  <code className="text-xs font-mono text-[#17251F] break-all select-all block bg-[#F7F7F2] p-1.5 rounded">
                    {issuedToken}
                  </code>
                  <Link
                    href={`/reset-password?token=${encodeURIComponent(issuedToken)}`}
                    className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-[#5876D8] hover:underline"
                  >
                    Proceed to Reset Password Now <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-[#17251F] mb-1">Corporate Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. rahul.deshmukh@reviewforge.io"
                className="w-full text-xs px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17251F]"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-[#17251F] text-white hover:bg-[#233830]"
            >
              {loading ? 'Issuing Token...' : 'Send Reset Token'}
              <KeyRound className="w-4 h-4 ml-1 text-[#C8ED78]" />
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#E6E8E1] text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-xs text-[#747D75] hover:text-[#17251F] font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

