import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Download, CreditCard, FileText, Receipt, MessageCircle, Copy, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { downloadFeeChallanPdf, downloadPaymentReceiptPdf } from '../lib/pdfExport';
import { Modal, StatusLabel, useToast } from '../components/UiPrimitives';

export function FeesView({ role }: { role: 'admin' | 'student' }) {
  const { notify } = useToast();
  const [fees, setFees] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [reminderSummary, setReminderSummary] = useState({ total: 0, queued: 0, sent: 0, noPhone: 0 });
  const [cloudApiConfigured, setCloudApiConfigured] = useState(false);
  const [checkingReminders, setCheckingReminders] = useState(false);
  const [tab, setTab] = useState<'challans' | 'history' | 'reminders'>('challans');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<any>(null);

  const [createForm, setCreateForm] = useState({
    studentId: '',
    feeType: 'monthly',
    feeMonth: new Date().toISOString().slice(0, 7),
    baseAmount: '3500',
    discount: '0',
    lateFee: '0',
    dueDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [payForm, setPayForm] = useState({
    amountPaid: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'cash',
    transactionRef: '',
  });

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
    });
    const res = await apiRequest(`/api/fees?${qs.toString()}`);
    setFees(res.items || []);
    setPayments(res.payments || []);
    if (role === 'admin') {
      const remRes = await apiRequest('/api/fees/reminders');
      setReminders(remRes.items || []);
      if (remRes.summary) setReminderSummary(remRes.summary);
      setCloudApiConfigured(Boolean(remRes.cloudApiConfigured));
      if (students.length === 0) {
        const stRes = await apiRequest('/api/students?limit=100');
        setStudents(stRes.items || []);
      }
    }
  }, [statusFilter, search, role, students.length]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRunFifthDateCheck = async () => {
    setCheckingReminders(true);
    try {
      const res = await apiRequest<{ checked: number; created: number; sentViaApi: number; queuedForWhatsApp: number }>(
        '/api/fees/reminders/check',
        { method: 'POST' },
      );
      notify(
        res.created > 0
          ? `Checked ${res.checked} unpaid challans: ${res.created} personalized WhatsApp reminder(s) generated.`
          : `Checked ${res.checked} unpaid challans: all eligible 5th-date reminders are already up to date.`,
        res.created > 0 ? 'success' : 'info',
      );
      load();
    } catch (err: any) {
      notify(err.message || 'Failed to check 5th-date due fees.', 'error');
    } finally {
      setCheckingReminders(false);
    }
  };

  const toggleReminderStatus = async (r: any) => {
    const nextStatus = r.channel_status === 'sent_manual' ? 'queued' : 'sent_manual';
    try {
      await apiRequest(`/api/fees/reminders/${r.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ channelStatus: nextStatus }),
      });
      notify(
        nextStatus === 'sent_manual'
          ? `WhatsApp fee reminder marked sent for ${r.student_name}.`
          : `Moved ${r.student_name} back to queued reminders.`,
        'success',
      );
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const copyReminderMessage = async (r: any) => {
    try {
      await navigator.clipboard.writeText(r.message_text);
      notify(`Fee reminder message copied for ${r.student_name}.`, 'success');
    } catch {
      notify('Clipboard blocked. Copy manually from preview.', 'error');
    }
  };

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/fees', { method: 'POST', body: JSON.stringify(createForm) });
      notify('Fee challan created.', 'success');
      setCreateOpen(false);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    try {
      const res = await apiRequest<{ receiptNumber: string }>(`/api/fees/${payTarget.id}/pay`, {
        method: 'POST',
        body: JSON.stringify(payForm),
      });
      notify(`Payment recorded (${res.receiptNumber}).`, 'success');
      setPayTarget(null);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            {role === 'admin' ? 'Fees & Payment Ledger' : 'My Fee Challans & Receipts'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monthly &amp; admission fees, partial payments, printable PDF challans, and receipts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('challans')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === 'challans'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Fee Challans
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Payment History
            </button>
            {role === 'admin' && (
              <button
                type="button"
                onClick={() => setTab('reminders')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  tab === 'reminders'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                WhatsApp Reminders (5th Due)
                {reminderSummary.queued > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-bold tabular-nums">
                    {reminderSummary.queued}
                  </span>
                )}
              </button>
            )}
          </div>

          {role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => downloadProtectedFile('/api/fees/export', 'SindhTech_Fee_Ledger.xlsx')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  const first = students[0];
                  const month = new Date().toISOString().slice(0, 7);
                  setCreateForm({
                    studentId: first ? String(first.id) : '',
                    feeType: 'monthly',
                    feeMonth: month,
                    baseAmount: first ? String(first.monthly_fee) : '3500',
                    discount: '0',
                    lateFee: '0',
                    dueDate: `${month}-05`,
                    notes: '',
                  });
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Create Fee Challan
              </button>
            </>
          )}
        </div>
      </div>

      {tab === 'challans' && (
        <>
          {role === 'admin' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search challan #, student name or ID..."
                className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue (Past 5th)</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-3 font-medium">Challan #</th>
                    <th className="px-3 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">Type / Month</th>
                    <th className="px-3 py-3 font-medium text-right">Net</th>
                    <th className="px-3 py-3 font-medium text-right">Paid</th>
                    <th className="px-3 py-3 font-medium text-right">Balance</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {fees.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5 font-mono-tabular text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {f.challan_number}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{f.full_name}</div>
                        <div className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap">{f.student_code} · {f.enrolled_in}</div>
                      </td>
                      <td className="px-3 py-2.5 capitalize text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {f.fee_type} · {f.fee_month || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-tabular text-xs whitespace-nowrap">PKR {Number(f.net_amount).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono-tabular text-xs text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        PKR {Number(f.paid_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-tabular text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        PKR {Number(f.remaining_amount).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><StatusLabel status={f.status} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => downloadFeeChallanPdf(f)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            Challan
                          </button>
                          {role === 'admin' && f.remaining_amount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayTarget(f);
                                setPayForm({
                                  amountPaid: String(f.remaining_amount),
                                  paymentDate: new Date().toISOString().slice(0, 10),
                                  paymentMethod: 'cash',
                                  transactionRef: '',
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[#0F2942] text-white hover:bg-[#163A5C] whitespace-nowrap shrink-0"
                            >
                              <CreditCard className="w-3.5 h-3.5 shrink-0" />
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'reminders' && role === 'admin' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Automatic 5th-of-Month WhatsApp Fee Notifications
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Any student with unpaid or partial tuition past the 5th of the month automatically receives an in-app alert and a personalized WhatsApp message in their name ({cloudApiConfigured ? 'WhatsApp Cloud API Active' : 'WhatsApp Web 1-Click Dispatch Ready'}).
              </p>
            </div>
            <button
              type="button"
              disabled={checkingReminders}
              onClick={handleRunFifthDateCheck}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingReminders ? 'animate-spin' : ''}`} />
              {checkingReminders ? 'Checking...' : 'Run 5th-Date Check Now'}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">WhatsApp #</th>
                    <th className="px-3 py-3 font-medium">Challan / Month</th>
                    <th className="px-3 py-3 font-medium text-right">Remaining</th>
                    <th className="px-3 py-3 font-medium">Personalized WhatsApp Message</th>
                    <th className="px-3 py-3 font-medium">Dispatch</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {reminders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        All students are cleared up to the 5th of the month.
                      </td>
                    </tr>
                  ) : (
                    reminders.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{r.student_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular whitespace-nowrap">
                            {r.student_code} · {r.enrolled_in}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono-tabular whitespace-nowrap">
                          <div className="text-slate-800 dark:text-slate-200">{r.phone_raw || '—'}</div>
                          {r.whatsapp_number && (
                            <div className="text-[10px] text-emerald-700 dark:text-emerald-400">+{r.whatsapp_number}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono-tabular whitespace-nowrap">
                          <div>{r.challan_number}</div>
                          <div className="text-[11px] text-slate-500">{r.billing_month}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          PKR {Number(r.remaining_amount).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 max-w-xs">
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line line-clamp-3">
                            {r.message_text}
                          </p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {r.channel_status === 'sent_api' || r.channel_status === 'sent_manual' ? (
                            <button
                              type="button"
                              onClick={() => toggleReminderStatus(r)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {r.channel_status === 'sent_api' ? 'Sent (API)' : 'Sent'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleReminderStatus(r)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-semibold"
                            >
                              {r.channel_status === 'no_phone' ? 'No Phone' : 'Queued'}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {r.wa_link && (
                              <a
                                href={r.wa_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                  if (r.channel_status === 'queued') toggleReminderStatus(r);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                Send WhatsApp
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => copyReminderMessage(r)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium whitespace-nowrap"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Receipt #</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Challan</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium text-right">Amount Paid</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono-tabular text-xs font-medium whitespace-nowrap">{p.receipt_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.full_name} <span className="text-xs text-slate-400 font-mono-tabular">({p.student_code})</span></td>
                    <td className="px-4 py-3 font-mono-tabular text-xs whitespace-nowrap">{p.challan_number}</td>
                    <td className="px-4 py-3 capitalize text-xs whitespace-nowrap">{p.payment_method.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      PKR {Number(p.amount_paid).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs whitespace-nowrap">{p.payment_date}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => downloadPaymentReceiptPdf(p)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Receipt className="w-3.5 h-3.5 shrink-0" />
                        Receipt PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Challan Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Generate Fee Challan" maxWidth="max-w-md">
        <form onSubmit={handleCreateChallan} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Student</label>
            <select
              value={createForm.studentId}
              onChange={(e) => {
                const st = students.find((x) => String(x.id) === e.target.value);
                setCreateForm({ ...createForm, studentId: e.target.value, baseAmount: st ? String(st.monthly_fee) : createForm.baseAmount });
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Fee Type</label>
              <select value={createForm.feeType} onChange={(e) => setCreateForm({ ...createForm, feeType: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="monthly">Monthly Tuition</option>
                <option value="admission">Admission Fee</option>
                <option value="course">Course Fee</option>
                <option value="exam">Exam Fee</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Fee Month</label>
              <input type="month" value={createForm.feeMonth} onChange={(e) => setCreateForm({ ...createForm, feeMonth: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Base Amount (PKR)</label>
              <input type="number" required value={createForm.baseAmount} onChange={(e) => setCreateForm({ ...createForm, baseAmount: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Discount (PKR)</label>
              <input type="number" value={createForm.discount} onChange={(e) => setCreateForm({ ...createForm, discount: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Late Fee (PKR)</label>
              <input type="number" value={createForm.lateFee} onChange={(e) => setCreateForm({ ...createForm, lateFee: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Due Date</label>
              <input type="date" required value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Generate Challan</button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={Boolean(payTarget)} onClose={() => setPayTarget(null)} title={`Record Payment — ${payTarget?.challan_number}`} maxWidth="max-w-md">
        {payTarget && (
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg">
              Student: <strong>{payTarget.full_name}</strong> · Remaining Balance:{' '}
              <strong className="font-mono-tabular">PKR {Number(payTarget.remaining_amount).toLocaleString()}</strong>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Amount Paying Now (PKR) *</label>
              <input
                type="number"
                required
                min="1"
                max={payTarget.remaining_amount}
                value={payForm.amountPaid}
                onChange={(e) => setPayForm({ ...payForm, amountPaid: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Payment Method</label>
                <select value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Payment Date</label>
                <input type="date" required value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Transaction Reference</label>
              <input value={payForm.transactionRef} onChange={(e) => setPayForm({ ...payForm, transactionRef: e.target.value })} placeholder="IBFT ref or Cash Desk" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Confirm Payment</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
