'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token') || '';

  const [token, setToken] = useState(urlToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
    }
  }, [urlToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      setLoading(false);
      return;
    }

    try {
      const res = await apiClient.resetPassword(token, newPassword);

      if (!res.success) {
        throw new Error(res.error || 'Password reset failed.');
      }

      setSuccess('Your password has been successfully reset! Redirecting to sign in...');
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred resetting your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] py-8 px-6 shadow-sm border border-[#E6E8E1] rounded-2xl sm:px-10">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-[#EEF9D1] border border-[#D6EFA0] rounded-xl flex items-start gap-2 text-xs text-[#2C5E1A] animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#2C5E1A] shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-xs font-bold text-[#17251F] mb-1">Reset Security Token</label>
          <input
            type="text"
            required
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste your 64-character token"
            className="w-full text-xs font-mono px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17251F]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#17251F] mb-1">New Password</label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full text-xs px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17251F]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#17251F] mb-1">Confirm New Password</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="w-full text-xs px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17251F]"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-[#17251F] text-white hover:bg-[#233830]"
        >
          {loading ? 'Updating Password...' : 'Save New Password & Sign In'}
          <ShieldCheck className="w-4 h-4 ml-1 text-[#C8ED78]" />
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
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[#F7F7F2]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <Link href="/login" className="inline-flex items-center gap-2 group mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#17251F] text-[#C8ED78] flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform ring-2 ring-[#C8ED78]/30">
            RF
          </div>
          <span className="text-2xl font-bold text-[#17251F] tracking-tight">
            Review<span className="text-[#5876D8]">Forge</span>
          </span>
        </Link>
        <h2 className="text-2xl font-extrabold text-[#17251F]">
          Set a New Password
        </h2>
        <p className="mt-2 text-xs text-[#747D75]">
          Secure credential reset protected by salted bcrypt encryption.
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Suspense fallback={<div className="p-8 text-center text-xs">Loading reset form...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

