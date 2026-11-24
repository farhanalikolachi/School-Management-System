import React, { useEffect, useState, useCallback } from 'react';
import {
  FileSpreadsheet, Search, Copy, CheckCircle2, Clock, Users, UserCheck, Eye, EyeOff, RefreshCw, MessageCircle,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { normalizePkWhatsAppNumber } from '../lib/domain';
import { useToast } from '../components/UiPrimitives';
import { StatBox } from './DashboardView';

interface CredentialRow {
  id: number;
  user_id: number;
  id_code: string;
  role: 'Student' | 'Teacher';
  full_name: string;
  username: string;
  issued_password: string;
  assigned_target: string;
  phone: string;
  email: string;
  sent_status: 'pending' | 'sent';
  sent_at: string | null;
  password_status: string;
  account_status: string;
  created_at: string;
}

export function CredentialsView() {
  const { notify } = useToast();
  const [items, setItems] = useState<CredentialRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending_count: 0, sent_count: 0, student_count: 0, teacher_count: 0 });
  const [roleFilter, setRoleFilter] = useState<'' | 'Student' | 'Teacher'>('');
  const [sentFilter, setSentFilter] = useState<'' | 'pending' | 'sent'>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [revealedIds, setRevealedIds] = useState<Record<number, boolean>>({});
  const [showAllPasswords, setShowAllPasswords] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(sentFilter ? { sentStatus: sentFilter } : {}),
        ...(search ? { search } : {}),
      });
      const res = await apiRequest<{ items: CredentialRow[]; summary: any }>(`/api/credentials/ledger?${qs.toString()}`);
      setItems(res.items || []);
      if (res.summary) setSummary(res.summary);
    } catch (err: any) {
      notify(err.message || 'Failed to load credentials sheet.', 'error');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, sentFilter, search, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSentStatus = async (row: CredentialRow) => {
    const nextStatus = row.sent_status === 'sent' ? 'pending' : 'sent';
    try {
      await apiRequest(`/api/credentials/ledger/${row.id}/sent`, {
        method: 'PATCH',
        body: JSON.stringify({ sentStatus: nextStatus }),
      });
      notify(
        nextStatus === 'sent'
          ? `Marked ${row.full_name} (${row.id_code}) as Sent.`
          : `Moved ${row.full_name} (${row.id_code}) back to Pending.`,
        'success',
      );
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const formatDispatchMessage = (row: CredentialRow) =>
    `Assalam-o-Alaikum ${row.full_name},\n` +
    `Your SindhTech Institute (${row.role}) portal account is ready.\n` +
    `ID Code: ${row.id_code}\n` +
    `Login ID: ${row.username}\n` +
    `Password: ${row.issued_password}\n` +
    `Program: ${row.assigned_target}\n` +
    `Sign in using your Login ID above to access your personal dashboard.\n` +
    `— Administration, SindhTech Institute (Wajid Ali Kolachi)`;

  const copyDispatchMessage = async (row: CredentialRow) => {
    const msg = formatDispatchMessage(row);
    try {
      await navigator.clipboard.writeText(msg);
      notify(`Login message copied for ${row.full_name} — ready to send via WhatsApp/SMS.`, 'success');
    } catch {
      notify('Clipboard access blocked. Please copy manually from the table.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Student &amp; Teacher Credentials Excel Sheet
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All generated Student &amp; Teacher Login IDs and Passwords save automatically here for easy copy &amp; Excel (.xlsx) dispatch
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadProtectedFile('/api/credentials/ledger/export?role=Student', 'SindhTech_Student_Credentials.xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            Students Excel
          </button>
          <button
            type="button"
            onClick={() => downloadProtectedFile('/api/credentials/ledger/export?role=Teacher', 'SindhTech_Teacher_Credentials.xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            Teachers Excel
          </button>
          <button
            type="button"
            onClick={() => downloadProtectedFile('/api/credentials/ledger/export', 'SindhTech_All_Login_Credentials.xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            All Credentials (.xlsx)
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox
          label="Total Saved Accounts"
          value={summary.total || 0}
          subtext={`${summary.student_count || 0} students · ${summary.teacher_count || 0} teachers`}
          icon={Users}
          tone="navy"
        />
        <StatBox
          label="Pending to Send"
          value={summary.pending_count || 0}
          subtext="Credentials not yet sent by Admin"
          icon={Clock}
          tone="amber"
        />
        <StatBox
          label="Dispatched / Sent"
          value={summary.sent_count || 0}
          subtext="Shared with students & teachers"
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatBox
          label="Faculty Accounts"
          value={summary.teacher_count || 0}
          subtext="Teacher login IDs stored"
          icon={UserCheck}
          tone="blue"
        />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search credentials"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID code, username, or class..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>

        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as '' | 'Student' | 'Teacher')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
        >
          <option value="">All Roles</option>
          <option value="Student">Students Only</option>
          <option value="Teacher">Teachers Only</option>
        </select>

        <select
          aria-label="Filter by sent status"
          value={sentFilter}
          onChange={(e) => setSentFilter(e.target.value as '' | 'pending' | 'sent')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
        >
          <option value="">All Dispatch Status</option>
          <option value="pending">Pending to Send</option>
          <option value="sent">Already Sent</option>
        </select>

        <button
          type="button"
          onClick={() => setShowAllPasswords((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          {showAllPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showAllPasswords ? 'Mask Passwords' : 'Show Passwords'}
        </button>

        <button
          type="button"
          onClick={load}
          aria-label="Refresh credentials sheet"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {/* Spreadsheet-style Credentials Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3 font-medium">ID Code</th>
                <th className="px-3 py-3 font-medium">Name &amp; Contact</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Login ID (Username)</th>
                <th className="px-3 py-3 font-medium">Saved Password</th>
                <th className="px-3 py-3 font-medium">Class / Course</th>
                <th className="px-3 py-3 font-medium">Dispatch</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Loading auto-saved credentials sheet...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No credentials matched your search filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const visible = showAllPasswords || revealedIds[row.id];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5 font-mono-tabular font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {row.id_code}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{row.full_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular">
                          {row.phone || row.email || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                        {row.role}
                      </td>
                      <td className="px-3 py-2.5 font-mono-tabular font-semibold text-[#0F2942] dark:text-blue-400 whitespace-nowrap">
                        {row.username}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono-tabular text-slate-900 dark:text-slate-100 select-all">
                            {visible ? row.issued_password : '••••••••••••'}
                          </code>
                          {!showAllPasswords && (
                            <button
                              type="button"
                              aria-label={`Toggle password visibility for ${row.full_name}`}
                              onClick={() => setRevealedIds((p) => ({ ...p, [row.id]: !p[row.id] }))}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            >
                              {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{row.password_status}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 max-w-[180px] truncate">
                        {row.assigned_target || '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleSentStatus(row)}
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors ${
                            row.sent_status === 'sent'
                              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                              : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {row.sent_status === 'sent' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Sent
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" /> Pending
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {(() => {
                            const waNum = normalizePkWhatsAppNumber(row.phone);
                            if (!waNum) return null;
                            const waHref = `https://wa.me/${waNum}?text=${encodeURIComponent(formatDispatchMessage(row))}`;
                            return (
                              <a
                                href={waHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  if (row.sent_status !== 'sent') toggleSentStatus(row);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                WhatsApp
                              </a>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => copyDispatchMessage(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Msg
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
