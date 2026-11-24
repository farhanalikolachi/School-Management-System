import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Download, Printer, Trash2, Check, X, Database, FileSpreadsheet, KeyRound, Save, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { formatProgramLabel } from '../lib/domain';
import { downloadReportPdf } from '../lib/pdfExport';
import { Modal, StatusLabel, ImageWithFallback, useToast } from '../components/UiPrimitives';

export function NoticesView({ role }: { role: 'admin' | 'teacher' | 'student' }) {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    content: '',
    targetAudience: 'all',
    targetClassId: '',
    targetCourseId: '',
    priority: 'normal',
  });

  const load = useCallback(async () => {
    const res = await apiRequest('/api/notices');
    setItems(res.items || []);
    if (role === 'admin') {
      const [c, crs] = await Promise.all([apiRequest('/api/classes'), apiRequest('/api/courses')]);
      setClasses(c.items || []);
      setCourses(crs.items || []);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/notices', { method: 'POST', body: JSON.stringify(form) });
    notify('Notice published & notifications dispatched.', 'success');
    setModalOpen(false);
    setForm({ title: '', content: '', targetAudience: 'all', targetClassId: '', targetCourseId: '', priority: 'normal' });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Notices &amp; Announcements</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Official circulars targeted across institute roles, classes, and courses</p>
        </div>
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white"
          >
            <Plus className="w-4 h-4" />
            Publish Notice
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((n) => (
          <div key={n.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="capitalize font-medium text-slate-700 dark:text-slate-300">{n.priority}</span>
                <span>·</span>
                <span className="capitalize">Audience: {n.target_audience} {n.class_name || n.course_name ? `(${n.class_name || n.course_name})` : ''}</span>
                <span>·</span>
                <span className="font-mono-tabular">{String(n.created_at).slice(0, 10)}</span>
              </div>
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">{n.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{n.content}</p>
            </div>
            {role === 'admin' && (
              <button
                type="button"
                onClick={async () => {
                  await apiRequest(`/api/notices/${n.id}`, { method: 'DELETE' });
                  notify('Notice removed.', 'info');
                  load();
                }}
                aria-label={`Delete notice ${n.title}`}
                className="p-2 text-slate-400 hover:text-red-600 self-start"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Publish Announcement" maxWidth="max-w-lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Notice Title *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Target Audience</label>
              <select value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="all">All Users</option>
                <option value="teachers">Teachers Only</option>
                <option value="students">Students Only</option>
                <option value="class">Specific Class</option>
                <option value="course">Specific Course</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          {form.targetAudience === 'class' && (
            <div>
              <label className="block text-xs font-medium mb-1">Select Class</label>
              <select value={form.targetClassId} onChange={(e) => setForm({ ...form, targetClassId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="">Choose class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
          )}
          {form.targetAudience === 'course' && (
            <div>
              <label className="block text-xs font-medium mb-1">Select Course</label>
              <select value={form.targetCourseId} onChange={(e) => setForm({ ...form, targetCourseId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="">Choose course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Message Content *</label>
            <textarea required rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Publish</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ReportsView() {
  const [reportType, setReportType] = useState('fee_collection');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ reportType, ...(from ? { from } : {}), ...(to ? { to } : {}) });
    const res = await apiRequest(`/api/reports?${qs.toString()}`);
    setRows(res.rows || []);
  }, [reportType, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Report');
    XLSX.writeFile(wb, `SindhTech_${reportType}_Report.xlsx`);
  };

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Reports &amp; Analytics</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Export real database reports in Excel (.xlsx), PDF, or printable format</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
            <Printer className="w-4 h-4" /> Print HTML
          </button>
          <button type="button" onClick={() => downloadReportPdf(reportType.replace(/_/g, ' ').toUpperCase(), rows)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button type="button" onClick={exportExcel} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel (.xlsx)
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3 no-print">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
          <option value="fee_collection">Fee Collection Report</option>
          <option value="pending_fees">Pending Fees Report</option>
          <option value="class_students">Class &amp; Student Directory Report</option>
          <option value="course_enrollments">Course Enrollment Report</option>
          <option value="attendance">Attendance Report</option>
          <option value="salaries">Teacher Salary Report</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950" />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-4 py-3 font-medium uppercase">{h.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.length === 0 ? (
                <tr><td colSpan={Math.max(1, headers.length)} className="px-4 py-10 text-center text-slate-500">No records matched the selected criteria.</td></tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx}>
                    {headers.map((h) => (
                      <td key={h} className="px-4 py-2.5 font-mono-tabular">{r[h] === null || r[h] === '' ? '—' : String(r[h])}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SettingsAndAdminOpsView() {
  const { notify } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [tab, setTab] = useState<'settings' | 'leaves' | 'sessions' | 'logs'>('settings');
  const [newSession, setNewSession] = useState({ sessionName: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', isActive: false });

  const load = useCallback(async () => {
    const [sRes, sesRes, lRes, logRes] = await Promise.all([
      apiRequest('/api/settings'),
      apiRequest('/api/sessions'),
      apiRequest('/api/leaves'),
      apiRequest('/api/activity-logs'),
    ]);
    setSettings(sRes.settings || {});
    setSessions(sesRes.items || []);
    setLeaves(lRes.items || []);
    setLogs(logRes.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    notify('Institute settings updated.', 'success');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Administration, Settings &amp; Backups</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Institute configuration, leave approvals, academic sessions, audit logs, and database backups</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
          {(['settings', 'leaves', 'sessions', 'logs'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md font-medium capitalize ${tab === t ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-white' : 'text-slate-500'}`}
            >
              {t === 'logs' ? 'Activity Logs' : t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleSaveSettings} className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-base">Institute Profile Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Institute Name</label>
                <input value={settings.institute_name || ''} onChange={(e) => setSettings({ ...settings, institute_name: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Official Phone</label>
                <input value={settings.institute_phone || ''} onChange={(e) => setSettings({ ...settings, institute_phone: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Contact Email</label>
                <input value={settings.institute_email || ''} onChange={(e) => setSettings({ ...settings, institute_email: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Currency Symbol</label>
                <input value={settings.currency_symbol || 'PKR'} onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Campus Address</label>
                <input value={settings.institute_address || ''} onChange={(e) => setSettings({ ...settings, institute_address: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
            </div>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Save Settings</button>
          </form>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-base flex items-center gap-2">
              <Database className="w-4 h-4" /> Database Backup &amp; SQL Schema
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Export a complete JSON snapshot of all 24 relational tables or download the 24-table MySQL schema (`sindhtech_institute.sql`) for phpMyAdmin hosting deployment.
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => downloadProtectedFile('/api/backup/json', 'SindhTech_Backup.json')}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#0F2942] text-white"
              >
                <Download className="w-4 h-4" />
                Download Database Backup (.json)
              </button>
              <button
                type="button"
                onClick={() => downloadProtectedFile('/api/backup/mysql-schema', 'sindhtech_institute.sql')}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="w-4 h-4" />
                Download MySQL Schema (.sql)
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Leave Type</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium">{l.full_name} <span className="text-xs text-slate-400">({l.requester_role})</span></td>
                  <td className="px-4 py-3 text-xs">{l.leave_type}</td>
                  <td className="px-4 py-3 font-mono-tabular text-xs">{l.start_date} – {l.end_date}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{l.reason}</td>
                  <td className="px-4 py-3"><StatusLabel status={l.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {l.status === 'pending' && (
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/leaves/${l.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
                            load();
                          }}
                          className="p-1.5 rounded bg-emerald-600 text-white"
                          aria-label="Approve leave"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/leaves/${l.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
                            load();
                          }}
                          className="p-1.5 rounded bg-red-600 text-white"
                          aria-label="Reject leave"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-base">Academic Sessions</h3>
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
                <div>
                  <div className="font-semibold">{s.session_name}</div>
                  <div className="text-xs text-slate-500 font-mono-tabular">{s.start_date} to {s.end_date}</div>
                </div>
                <StatusLabel status={s.is_active ? 'active' : 'inactive'} />
              </div>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiRequest('/api/sessions', { method: 'POST', body: JSON.stringify(newSession) });
              notify('Academic session added.', 'success');
              load();
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <h3 className="font-display font-semibold text-base">Add Academic Session</h3>
            <input required value={newSession.sessionName} onChange={(e) => setNewSession({ ...newSession, sessionName: e.target.value })} placeholder="e.g. 2027-2028" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            <div className="grid grid-cols-2 gap-3">
              <input type="date" required value={newSession.startDate} onChange={(e) => setNewSession({ ...newSession, startDate: e.target.value })} className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input type="date" required value={newSession.endDate} onChange={(e) => setNewSession({ ...newSession, endDate: e.target.value })} className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={newSession.isActive} onChange={(e) => setNewSession({ ...newSession, isActive: e.target.checked })} />
              Set as Active Session
            </label>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white">Create Session</button>
          </form>
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-mono-tabular text-slate-500 whitespace-nowrap">{log.created_at}</td>
                  <td className="px-4 py-2.5 font-medium">{log.full_name || log.username || 'System'}</td>
                  <td className="px-4 py-2.5 font-mono-tabular">{log.action}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProfileAndLeaveView({
  user,
  profile,
  onUpdated,
}: {
  user: any;
  profile: any;
  onUpdated: () => void;
}) {
  const { notify } = useToast();
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: profile?.phone || '',
    guardianPhone: profile?.guardian_phone || '',
    fatherName: profile?.father_name || '',
    dob: profile?.dob || '',
    address: profile?.address || '',
    qualification: profile?.qualification || '',
    specialization: profile?.specialization || '',
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [leaves, setLeaves] = useState<any[]>([]);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'Sick Leave', startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), reason: '' });

  useEffect(() => {
    setProfileForm({
      fullName: user?.fullName || '',
      email: user?.email || '',
      phone: profile?.phone || '',
      guardianPhone: profile?.guardian_phone || '',
      fatherName: profile?.father_name || '',
      dob: profile?.dob || '',
      address: profile?.address || '',
      qualification: profile?.qualification || '',
      specialization: profile?.specialization || '',
    });
  }, [user, profile]);

  useEffect(() => {
    if (user.role !== 'admin') {
      apiRequest('/api/leaves').then((r) => setLeaves(r.items || []));
    }
  }, [user.role]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest('/api/profile/update', {
        method: 'POST',
        body: JSON.stringify(profileForm),
      });
      notify('Profile information updated successfully.', 'success');
      onUpdated();
    } catch (err: any) {
      notify(err.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      notify('Password updated successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiRequest('/api/profile/update', {
          method: 'POST',
          body: JSON.stringify({ avatarDataUrl: String(reader.result || '') }),
        });
        notify('Profile picture updated.', 'success');
        onUpdated();
      } catch (err: any) {
        notify(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={handleProfileSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <ImageWithFallback
              src={user.avatarUrl}
              alt={user.fullName}
              fallbackText={user.fullName}
              className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 text-base shrink-0"
            />
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Edit My Profile</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                ID: {profile?.student_code || profile?.teacher_code || user.username} · <span className="capitalize">{user.role}</span>
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            Change Photo
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoUpload} className="hidden" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Full Name *</label>
            <input
              required
              value={profileForm.fullName}
              onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className={user.role === 'admin' ? 'sm:col-span-2' : ''}>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              placeholder="name@sindhtech.edu.pk"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          {user.role !== 'admin' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Phone Number</label>
              <input
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="03XX-XXXXXXX"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular"
              />
            </div>
          )}

          {user.role === 'student' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Father&apos;s Name</label>
                <input
                  value={profileForm.fatherName}
                  onChange={(e) => setProfileForm({ ...profileForm, fatherName: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Guardian Phone</label>
                <input
                  value={profileForm.guardianPhone}
                  onChange={(e) => setProfileForm({ ...profileForm, guardianPhone: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={profileForm.dob}
                  onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Enrolled Program</label>
                <input
                  readOnly
                  value={formatProgramLabel(profile?.class_name, profile?.course_name, profile?.education_category)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300"
                />
              </div>
              {Array.isArray(profile?.selected_subject_names) && profile.selected_subject_names.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Selected Class Subjects ({profile.selected_subject_names.length})
                  </label>
                  <input
                    readOnly
                    value={profile.selected_subject_names.join(', ')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300"
                  />
                </div>
              )}
            </>
          )}

          {user.role === 'teacher' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Qualification</label>
                <input
                  value={profileForm.qualification}
                  onChange={(e) => setProfileForm({ ...profileForm, qualification: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Specialization</label>
                <input
                  value={profileForm.specialization}
                  onChange={(e) => setProfileForm({ ...profileForm, specialization: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </>
          )}

          {user.role !== 'admin' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Residential Address</label>
              <input
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="City / Area, Pakistan"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {savingProfile ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </div>
      </form>

      <div className="space-y-6">
        <form onSubmit={handlePasswordChange} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Change Password
          </h3>
          <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current Password" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password (min 8 chars, mixed case + digit)" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white">Update Password</button>
        </form>

        {user.role !== 'admin' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="font-display text-base font-semibold">Apply for Leave</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiRequest('/api/leaves', { method: 'POST', body: JSON.stringify(leaveForm) });
                notify('Leave application submitted.', 'success');
                const r = await apiRequest('/api/leaves');
                setLeaves(r.items || []);
                setLeaveForm({ ...leaveForm, reason: '' });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-3 gap-2">
                <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Urgent Leave">Urgent Leave</option>
                </select>
                <input type="date" required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
                <input type="date" required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
              <textarea required rows={2} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Reason for leave..." className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white">Submit Request</button>
            </form>
            {leaves.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 pt-2">
                {leaves.map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                    <span>{l.leave_type} ({l.start_date})</span>
                    <StatusLabel status={l.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
