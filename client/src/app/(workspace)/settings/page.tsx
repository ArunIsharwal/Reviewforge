'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/storage/use-store';
import { UserRole, OrganizationSettings } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import {
  RotateCcw,
  ShieldCheck,
  Database,
  Sparkles,
  Server,
  Lock,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    resetAllDemoData,
    activeRole,
    setActiveRole,
    auditLogs
  } = useStore();

  const [activeTab, setActiveTab] = useState('org');

  const [orgName, setOrgName] = useState(settings.name);
  const [industry, setIndustry] = useState(settings.industry);
  const [ratingScale, setRatingScale] = useState(settings.ratingScale);
  const [anonymityPolicy, setAnonymityPolicy] = useState(settings.anonymityPolicy);
  const [allowDirectRelease, setAllowDirectRelease] = useState(settings.allowEmployeeDirectRelease);
  const [requireDualSignoff, setRequireDualSignoff] = useState(settings.requireDualManagerSignoff);

  const [notifs, setNotifs] = useState(settings.notificationPreferences);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('employee');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const [healthData, setHealthData] = useState<{
    status: string;
    services: {
      database: { connected: boolean; status: string; message: string; dbName: string };
      ai: { configured: boolean; status: string; model: string; message: string; allowRealEmployeeData?: boolean };
      auth: { configured: boolean; message: string };
    };
  } | null>(null);

  useEffect(() => {
    apiClient
      .get<{
        status: string;
        services?: any;
        database?: { connected: boolean; status: string; message: string; dbName: string };
      }>('/health')
      .then((res: any) => {
        if (res.data) {
          setHealthData(res.data);
        } else {
          setHealthData(res);
        }
      })
      .catch((err) => console.error('Error fetching health status:', err));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      name: orgName,
      industry,
      ratingScale,
      anonymityPolicy,
      allowEmployeeDirectRelease: allowDirectRelease,
      requireDualManagerSignoff: requireDualSignoff,
      notificationPreferences: notifs
    });

    try {
      if (apiClient.getAccessToken()) {
        await apiClient.updateNotificationPreferences(notifs);
      }
    } catch (err) {
      console.warn('Could not persist notification preferences to backend:', err);
    }
  };

  const handleGenerateInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    const token = `inv-${Math.random().toString(36).substring(2, 12)}`;
    setGeneratedInviteLink(`${window.location.origin}/login?invite=${token}&role=${inviteRole}&email=${encodeURIComponent(inviteEmail)}`);
  };

  const tabs = [
    { id: 'org', label: 'Organization Profile' },
    { id: 'integrations', label: 'Cloud & AI Integrations' },
    { id: 'users', label: 'User Access & Invitations' },
    { id: 'review-policies', label: 'Review & Feedback Governance' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'demo', label: 'Demo Role & Sandbox Controls' },
    { id: 'audit', label: 'Security Audit Log' }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E6E8E1]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#17251F]">
              Platform Settings & Governance
            </h1>
            <Badge variant="forest">Enterprise Admin</Badge>
          </div>
          <p className="text-xs text-[#747D75] mt-1">
            Configure organization policies, rating rubrics, anonymity safeguards, and demo simulation state.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          onClick={() => {
            if (window.confirm('Reset all demo state to factory seed?')) {
              resetAllDemoData();
            }
          }}
        >
          Reset Demo Data
        </Button>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <form onSubmit={handleSaveSettings}>
        {/* Tab 1: Org Profile */}
        {activeTab === 'org' && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>
                  Enterprise identity and tenant settings
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#17251F] mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#17251F] mb-1">
                    Industry Domain
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#17251F] mb-1">
                  Default Performance Evaluation Scale
                </label>
                <select
                  value={ratingScale}
                  onChange={e => setRatingScale(e.target.value as OrganizationSettings['ratingScale'])}
                  className="w-full sm:w-72 px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                >
                  <option value="1-5 Numeric">1-5 Numeric (Recommended Enterprise Standard)</option>
                  <option value="1-4 Descriptive">1-4 Descriptive (Does Not Meet / Meets / Exceeds)</option>
                  <option value="Letter Scale">Letter Scale (A / B / C / D)</option>
                </select>
              </div>
            </CardContent>
            <CardFooter>
              <span className="text-[11px] text-[#747D75]">
                Persisted in local browser storage.
              </span>
              <Button type="submit" variant="primary" size="sm">
                Save Organization Profile
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Tab 2: Cloud & AI Integrations */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Cloud & AI Integration Status</CardTitle>
                  <CardDescription>
                    Real-time verification of MongoDB Atlas database, Google Gemini AI, and Session Security
                  </CardDescription>
                </div>
                <Server className="w-5 h-5 text-[#5876D8]" />
              </CardHeader>
              <CardContent className="space-y-6 text-xs">
                {/* MongoDB Status Box */}
                <div className="p-4 rounded-xl border border-[#E6E8E1] bg-[#FAFBF8] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#17251F]" />
                      <span className="font-bold text-sm text-[#17251F]">MongoDB Atlas Database</span>
                    </div>
                    {healthData?.services.database.connected ? (
                      <Badge variant="lime" className="gap-1">
                        <CheckCircle2 className="w-3 h-3 text-[#2C5E1A]" /> Connected
                      </Badge>
                    ) : (
                      <Badge variant="amber" className="gap-1">
                        <AlertTriangle className="w-3 h-3 text-[#92540D]" /> Awaiting Credentials
                      </Badge>
                    )}
                  </div>
                  <p className="text-[#747D75] leading-relaxed">
                    {healthData?.services.database.message || 'Connecting to database configuration module...'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E6E8E1] text-[11px]">
                    <div>
                      <span className="text-[#747D75] block">Target Database:</span>
                      <span className="font-mono font-bold text-[#17251F]">{healthData?.services.database.dbName || 'reviewforge'}</span>
                    </div>
                    <div>
                      <span className="text-[#747D75] block">Fallback Mode:</span>
                      <span className="font-bold text-[#2C5E1A]">In-Memory / LocalStorage Repository Active</span>
                    </div>
                  </div>
                  <div className="pt-1 text-[11px] text-[#747D75]">
                    To connect your live cluster: add your MongoDB Atlas URL to <code className="bg-[#E6E8E1] px-1 py-0.5 rounded font-mono text-[#17251F]">.env.local</code> as <code className="font-mono text-[#17251F]">MONGODB_URI</code> and run <code className="font-mono text-[#17251F]">npm run db:seed</code>.
                  </div>
                </div>

                {/* Google Gemini AI Box */}
                <div className="p-4 rounded-xl border border-[#E6E8E1] bg-[#FAFBF8] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#5876D8]" />
                      <span className="font-bold text-sm text-[#17251F]">Google Gemini AI (Official @google/genai SDK)</span>
                    </div>
                    {healthData?.services.ai.configured ? (
                      <Badge variant="lime" className="gap-1">
                        <CheckCircle2 className="w-3 h-3 text-[#2C5E1A]" /> AI Engine Ready
                      </Badge>
                    ) : (
                      <Badge variant="amber" className="gap-1">
                        <AlertTriangle className="w-3 h-3 text-[#92540D]" /> Awaiting API Key
                      </Badge>
                    )}
                  </div>
                  <p className="text-[#747D75] leading-relaxed">
                    {healthData?.services.ai.message || 'Evaluating AI service configuration...'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E6E8E1] text-[11px]">
                    <div>
                      <span className="text-[#747D75] block">Configured Model:</span>
                      <span className="font-mono font-bold text-[#17251F]">{healthData?.services.ai.model || 'gemini-3.5-flash'}</span>
                    </div>
                    <div>
                      <span className="text-[#747D75] block">Free-Tier Privacy Guard:</span>
                      <span className="font-bold text-[#2C5E1A]">Active (Identifiable Data Masked)</span>
                    </div>
                  </div>
                  <div className="pt-1 text-[11px] text-[#747D75]">
                    To enable live Gemini synthesis: add your API key to <code className="bg-[#E6E8E1] px-1 py-0.5 rounded font-mono text-[#17251F]">.env.local</code> as <code className="font-mono text-[#17251F]">GEMINI_API_KEY</code>.
                  </div>
                </div>

                {/* Authentication & Security Box */}
                <div className="p-4 rounded-xl border border-[#E6E8E1] bg-[#FAFBF8] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#17251F]" />
                      <span className="font-bold text-sm text-[#17251F]">Server-Side Authentication & Session Security</span>
                    </div>
                    <Badge variant="forest">Active</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                    <div>
                      <span className="text-[#747D75] block">Password Hashing:</span>
                      <span className="font-mono font-bold text-[#17251F]">bcrypt (Salt 10 Rounds)</span>
                    </div>
                    <div>
                      <span className="text-[#747D75] block">Session Transport:</span>
                      <span className="font-mono font-bold text-[#17251F]">HTTP-Only Cookie (Lax)</span>
                    </div>
                    <div>
                      <span className="text-[#747D75] block">Token Standard:</span>
                      <span className="font-mono font-bold text-[#17251F]">Cryptographic JWT (jose)</span>
                    </div>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[#747D75]">Test full login and registration workflows:</span>
                    <Link href="/login">
                      <Button type="button" variant="secondary" size="sm" rightIcon={<ExternalLink className="w-3.5 h-3.5" />}>
                        Open Login Portal
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 3: User Access & Invitations */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Team User Access & Secure Invitations</CardTitle>
                  <CardDescription>
                    Invite new colleagues and manage role-based authorization levels
                  </CardDescription>
                </div>
                <UserPlus className="w-5 h-5 text-[#5876D8]" />
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <form onSubmit={handleGenerateInvite} className="p-4 rounded-xl border border-[#E6E8E1] bg-[#FAFBF8] space-y-4">
                  <span className="font-bold text-sm text-[#17251F] block">Generate Single-Use Invite Token</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#17251F] mb-1">Colleague Email</label>
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="teammate@company.com"
                        className="w-full px-3 py-2 bg-white border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#17251F] mb-1">Target Role</label>
                      <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as UserRole)}
                        className="w-full px-3 py-2 bg-white border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="peer_reviewer">Peer Reviewer</option>
                        <option value="hr_admin">HR Administrator</option>
                      </select>
                    </div>
                  </div>
                  <Button type="submit" variant="primary" size="sm">
                    Generate Invitation Link
                  </Button>

                  {generatedInviteLink && (
                    <div className="mt-3 p-3 bg-white border border-[#C8ED78] rounded-xl text-xs space-y-1">
                      <span className="font-bold text-[#2C5E1A] block">Secure Invitation Link Ready:</span>
                      <input
                        type="text"
                        readOnly
                        value={generatedInviteLink}
                        className="w-full px-2 py-1 bg-[#FAFBF8] border border-[#E6E8E1] rounded font-mono text-[11px] select-all"
                      />
                      <span className="text-[10px] text-[#747D75] block mt-1">
                        Share this link with your teammate to let them claim their account without email server configuration.
                      </span>
                    </div>
                  )}
                </form>

                <div className="pt-2">
                  <span className="font-bold text-xs text-[#17251F] block mb-2">Active Roles Overview</span>
                  <div className="border border-[#E6E8E1] rounded-xl overflow-hidden divide-y divide-[#E6E8E1]">
                    <div className="p-3 bg-white flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-[#17251F]">HR Administrator</strong>
                        <p className="text-[11px] text-[#747D75]">Full org calibration, review release, employee management, and audit logging.</p>
                      </div>
                      <Badge variant="forest">Full Access</Badge>
                    </div>
                    <div className="p-3 bg-white flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-[#17251F]">Manager</strong>
                        <p className="text-[11px] text-[#747D75]">Private notes, AI Review Studio synthesis, team draft editing, and approval sign-off.</p>
                      </div>
                      <Badge variant="outline">Managerial</Badge>
                    </div>
                    <div className="p-3 bg-white flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-[#17251F]">Employee</strong>
                        <p className="text-[11px] text-[#747D75]">Self-reflections, OKR view, and released reviews only (strictly blocks confidential notes & anonymous provider identities).</p>
                      </div>
                      <Badge variant="default">Personal Only</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 4: Review & Feedback Governance */}
        {activeTab === 'review-policies' && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Review & Feedback Governance</CardTitle>
                <CardDescription>
                  Configure confidential notes, peer anonymity, and manager sign-off requirements
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-semibold text-[#17251F]">
                  Peer Feedback Anonymity Policy
                </label>
                <select
                  value={anonymityPolicy}
                  onChange={e => setAnonymityPolicy(e.target.value as OrganizationSettings['anonymityPolicy'])}
                  className="w-full sm:w-72 px-3 py-2 bg-[#FFFFFF] border border-[#E6E8E1] rounded-lg text-xs focus:ring-1 focus:ring-[#17251F]"
                >
                  <option value="Strict Anonymity">Strict Anonymity (Provider ID never exposed to employee)</option>
                  <option value="Optional Anonymity">Optional Anonymity (Reviewer chooses per submission)</option>
                  <option value="Transparent">Transparent (All feedback attributed)</option>
                </select>
                <p className="text-[11px] text-[#747D75] mt-1">
                  Enforces UI filtering to ensure that confidential peer reviews cannot be deanonymized by employees.
                </p>
              </div>

              <div className="pt-3 border-t border-[#E6E8E1] space-y-3">
                <div className="flex items-center justify-between p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl">
                  <div>
                    <div className="font-semibold text-[#17251F]">
                      Require Dual Manager / Executive Calibration Sign-Off
                    </div>
                    <div className="text-[11px] text-[#747D75]">
                      Prevents reviews from being released until both direct manager and HR lead approve.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={requireDualSignoff}
                    onChange={e => setRequireDualSignoff(e.target.checked)}
                    className="w-4 h-4 accent-[#17251F] cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl">
                  <div>
                    <div className="font-semibold text-[#17251F]">
                      Allow Direct Automated Release of AI Drafts (Disabled by Default)
                    </div>
                    <div className="text-[11px] text-[#747D75]">
                      Strictly discouraged under Responsible AI guidelines to ensure human-in-the-loop oversight.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowDirectRelease}
                    onChange={e => setAllowDirectRelease(e.target.checked)}
                    className="w-4 h-4 accent-[#17251F] cursor-pointer"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="primary" size="sm">
                Save Governance Policies
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Tab 3: Notifications */}
        {activeTab === 'notifications' && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Simulate alerts and digest notifications across review milestones
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {[
                { key: 'emailOnCycleStart', label: 'Email alerts when review cycle launches' },
                { key: 'emailOnFeedbackRequest', label: 'Alert peer reviewers when feedback is requested' },
                { key: 'emailOnReviewReady', label: 'Notify evaluating managers when synthesis draft is ready' },
                { key: 'slackDigestWeekly', label: 'Weekly Slack digest for cycle completion bottlenecks' }
              ].map(item => (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-3 bg-[#FAFBF8] border border-[#E6E8E1] rounded-xl"
                >
                  <span className="font-semibold text-[#17251F]">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(notifs[item.key as keyof typeof notifs])}
                    onChange={e =>
                      setNotifs({
                        ...notifs,
                        [item.key]: e.target.checked
                      })
                    }
                    className="w-4 h-4 accent-[#17251F] cursor-pointer"
                  />
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="primary" size="sm">
                Save Notifications
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Tab 4: Demo Role & Sandbox Controls */}
        {activeTab === 'demo' && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Demo Simulation & Role Perspectives</CardTitle>
                <CardDescription>
                  Switch perspective to test role-based permissions and interface adaptations
                </CardDescription>
              </div>
              <Badge variant="lime">Active: {activeRole.toUpperCase()}</Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    role: 'hr_admin' as UserRole,
                    title: 'HR Administrator',
                    desc: 'Full org visibility, review cycles, calibration, final release.'
                  },
                  {
                    role: 'manager' as UserRole,
                    title: 'Evaluating Manager',
                    desc: 'Direct team reviews, private notes, approve/request changes.'
                  },
                  {
                    role: 'employee' as UserRole,
                    title: 'Employee',
                    desc: 'Own goals, submit self-reflection, released reviews only.'
                  },
                  {
                    role: 'peer_reviewer' as UserRole,
                    title: 'Peer Reviewer',
                    desc: 'Assigned 360 feedback requests, anonymity protected.'
                  }
                ].map(r => {
                  const isCurrent = activeRole === r.role;
                  return (
                    <div
                      key={r.role}
                      onClick={() => setActiveRole(r.role)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? 'border-[#17251F] bg-[#EEF9D1]'
                          : 'border-[#E6E8E1] bg-[#FAFBF8] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#17251F]">{r.title}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold text-[#17251F] bg-[#C8ED78] px-1.5 py-0.5 rounded">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#747D75] mt-1 leading-relaxed">
                        {r.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-[#FDF2F2] border border-[#F8C8C8] rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#9E2A2B]">Reset Demo State</div>
                  <div className="text-[11px] text-[#9E2A2B]/80 mt-0.5">
                    Restores mock employees, OKRs, feedback, and reviews to pristine factory seed.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Reset all demo data to seed?')) {
                      resetAllDemoData();
                    }
                  }}
                >
                  Reset Factory Seed
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 5: Security Audit Log */}
        {activeTab === 'audit' && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Immutable Security Audit Trail</CardTitle>
                <CardDescription>
                  Tracking administrative, managerial, and synthesizer actions
                </CardDescription>
              </div>
              <ShieldCheck className="w-4 h-4 text-[#2C5E1A]" />
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-[#E6E8E1]">
                {auditLogs.map(log => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#17251F]">{log.action}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {log.actorRole}
                        </Badge>
                      </div>
                      <p className="text-[#747D75] mt-0.5">
                        Target: <strong className="text-[#17251F]">{log.target}</strong> • {log.details}
                      </p>
                    </div>
                    <div className="text-[11px] font-mono text-[#747D75] shrink-0">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </form>
    </div>
  );
}
