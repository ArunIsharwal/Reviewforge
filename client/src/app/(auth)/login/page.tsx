'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { DataRepository } from '@/lib/storage/repository';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient.login(email, password);

      if (!res.success || !res.user) {
        throw new Error(res.error || 'Authentication failed. Please check credentials.');
      }

      // Synchronize role and storage immediately with authenticated user role
      DataRepository.setActiveRole(res.user.role);
      localStorage.setItem('reviewforge_active_role', JSON.stringify(res.user.role));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('reviewforge_storage_updated'));
      }

      setSuccess(`Signed in successfully as ${res.user.name} (${res.user.role}). Redirecting...`);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 350);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoCreds = (demoEmail: string, demoPass: string) => {
    apiClient.clearSession();
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[#F7F7F2]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 group mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#17251F] text-[#C8ED78] flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-105 transition-transform ring-2 ring-[#C8ED78]/30">
            RF
          </div>
          <span className="text-2xl font-bold text-[#17251F] tracking-tight">
            Review<span className="text-[#5876D8]">Forge</span>
          </span>
        </Link>
        <h2 className="text-2xl font-extrabold text-[#17251F]">
          Sign in to your ReviewForge workspace
        </h2>
        <p className="mt-2 text-xs text-[#747D75]">
          Enterprise Performance Intelligence • Express.js + Mongoose RBAC Authentication
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
            <div className="mb-4 p-3 bg-[#EEF9D1] border border-[#D6EFA0] rounded-xl flex items-start gap-2 text-xs text-[#2C5E1A] animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-[#2C5E1A] shrink-0 mt-0.5" />
              <span>{success}</span>
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
                placeholder="e.g. admin@gmail.com"
                className="w-full text-xs px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17251F]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-[#17251F]">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-[#5876D8] font-semibold hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full text-xs px-3 py-2 bg-[#FAFBF8] border border-[#E6E8E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#17251F]"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-[#17251F] text-white hover:bg-[#233830]"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
              <ArrowRight className="w-4 h-4 ml-1 text-[#C8ED78]" />
            </Button>
          </form>

          {/* Quick Demo Fill Buttons for all 4 Roles */}
          <div className="mt-6 pt-4 border-t border-[#E6E8E1]">
            <div className="flex items-center gap-1 text-[10px] font-bold text-[#747D75] uppercase tracking-wider mb-2">
              <KeyRound className="w-3 h-3 text-[#17251F]" />
              <span>Select Enterprise Role (Seeded Accounts)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setDemoCreds('admin@gmail.com', 'Admin@123')}
                className="p-2 text-left rounded-lg border border-[#E6E8E1] bg-[#FAFBF8] hover:bg-[#EEF9D1] hover:border-[#D6EFA0] transition-colors"
              >
                <div className="font-bold text-[#17251F]">HR Admin</div>
                <div className="text-[10px] text-[#747D75]">admin@gmail.com</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoCreds('elena.rostova@reviewforge.io', 'ReviewForgeDemo123!')}
                className="p-2 text-left rounded-lg border border-[#E6E8E1] bg-[#FAFBF8] hover:bg-[#EEF9D1] hover:border-[#D6EFA0] transition-colors"
              >
                <div className="font-bold text-[#17251F]">Manager</div>
                <div className="text-[10px] text-[#747D75]">elena.rostova@...</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoCreds('rahul.deshmukh@reviewforge.io', 'ReviewForgeDemo123!')}
                className="p-2 text-left rounded-lg border border-[#E6E8E1] bg-[#FAFBF8] hover:bg-[#EEF9D1] hover:border-[#D6EFA0] transition-colors"
              >
                <div className="font-bold text-[#17251F]">Employee</div>
                <div className="text-[10px] text-[#747D75]">rahul.deshmukh@...</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoCreds('marcus.vance@reviewforge.io', 'ReviewForgeDemo123!')}
                className="p-2 text-left rounded-lg border border-[#E6E8E1] bg-[#FAFBF8] hover:bg-[#EEF9D1] hover:border-[#D6EFA0] transition-colors"
              >
                <div className="font-bold text-[#17251F]">Peer Reviewer</div>
                <div className="text-[10px] text-[#747D75]">marcus.vance@...</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
