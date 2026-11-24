import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, CreditCard, Edit2, Trash2, KeyRound, Power, Wallet,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { Modal, ConfirmDialog, StatusLabel, ImageWithFallback, useToast } from '../components/UiPrimitives';
import { IdCardModal, type IdCardPerson } from '../components/IdCardModal';
import { CredentialsModal, type CredentialsBundle } from './StudentsView';

export function TeachersView() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [tab, setTab] = useState<'directory' | 'salaries'>('directory');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [credentialsBundle, setCredentialsBundle] = useState<CredentialsBundle | null>(null);
  const [idCardPerson, setIdCardPerson] = useState<IdCardPerson | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    teacherId: '',
    salaryMonth: new Date().toISOString().slice(0, 7),
    baseSalary: '',
    bonus: '0',
    deduction: '0',
    paymentMethod: 'bank_transfer',
  });

  const [form, setForm] = useState({
    fullName: '',
    fatherName: '',
    gender: 'Male',
    phone: '',
    email: '',
    address: '',
    qualification: '',
    specialization: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    salary: '55000',
    workingHours: '08:00 AM - 02:00 PM',
    assignedClassIds: [] as number[],
    assignedCourseIds: [] as number[],
    status: 'active',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const [tRes, sRes, cRes, crsRes] = await Promise.all([
        apiRequest(`/api/teachers${qs}`),
        apiRequest('/api/salaries'),
        apiRequest('/api/classes'),
        apiRequest('/api/courses'),
      ]);
      setItems(tRes.items || []);
      setSalaries(sRes.items || []);
      setClasses(cRes.items || []);
      setCourses(crsRes.items || []);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      fullName: '',
      fatherName: '',
      gender: 'Male',
      phone: '',
      email: '',
      address: '',
      qualification: '',
      specialization: '',
      joiningDate: new Date().toISOString().slice(0, 10),
      salary: '55000',
      workingHours: '08:00 AM - 02:00 PM',
      assignedClassIds: [],
      assignedCourseIds: [],
      status: 'active',
    });
    setFormOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      fullName: t.full_name || '',
      fatherName: t.father_name || '',
      gender: t.gender || 'Male',
      phone: t.phone || '',
      email: t.email || '',
      address: t.address || '',
      qualification: t.qualification || '',
      specialization: t.specialization || '',
      joiningDate: t.joining_date || '',
      salary: String(t.salary || 0),
      workingHours: t.working_hours || '08:00 AM - 02:00 PM',
      assignedClassIds: [],
      assignedCourseIds: [],
      status: t.status || 'active',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/teachers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        notify('Teacher details updated.', 'success');
        setFormOpen(false);
        loadAll();
      } else {
        const res = await apiRequest<{ credentials: CredentialsBundle }>('/api/teachers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        notify('Teacher added & login credentials generated.', 'success');
        setFormOpen(false);
        setCredentialsBundle(res.credentials);
        loadAll();
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleToggleStatus = async (t: any) => {
    const next = t.status === 'active' ? 'inactive' : 'active';
    await apiRequest(`/api/teachers/${t.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    notify(`${t.full_name} set to ${next}.`, 'info');
    loadAll();
  };

  const handleResetTemp = async (t: any) => {
    const res = await apiRequest<{ credentials: CredentialsBundle }>(`/api/users/${t.user_id}/reset-temp-password`, {
      method: 'POST',
    });
    setCredentialsBundle(res.credentials);
    notify('New temporary credentials generated.', 'success');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiRequest(`/api/teachers/${deleteTarget.id}`, { method: 'DELETE' });
    notify(`Archived teacher ${deleteTarget.full_name}.`, 'info');
    setDeleteTarget(null);
    loadAll();
  };

  const handleRecordSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/salaries', {
        method: 'POST',
        body: JSON.stringify({ ...salaryForm, markPaid: true }),
      });
      notify('Teacher salary payment recorded.', 'success');
      setSalaryModalOpen(false);
      loadAll();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Teacher &amp; Payroll Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Faculty directory, class/course assignments, salaries, and ID cards
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('directory')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === 'directory'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Faculty Directory
            </button>
            <button
              type="button"
              onClick={() => setTab('salaries')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === 'salaries'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Salary Ledger
            </button>
          </div>

          <button
            type="button"
            onClick={() => downloadProtectedFile('/api/teachers/export', 'SindhTech_Teachers.xlsx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>

          {tab === 'salaries' ? (
            <button
              type="button"
              onClick={() => {
                const first = items[0];
                setSalaryForm({
                  teacherId: first ? String(first.id) : '',
                  salaryMonth: new Date().toISOString().slice(0, 7),
                  baseSalary: first ? String(first.salary) : '55000',
                  bonus: '0',
                  deduction: '0',
                  paymentMethod: 'bank_transfer',
                });
                setSalaryModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white"
            >
              <Wallet className="w-4 h-4" />
              Pay Salary
            </button>
          ) : (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white"
            >
              <Plus className="w-4 h-4" />
              Add Teacher
            </button>
          )}
        </div>
      </div>

      {tab === 'directory' ? (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teacher name, ID, specialization..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Teacher ID</th>
                    <th className="px-4 py-3 font-medium">Teacher</th>
                    <th className="px-4 py-3 font-medium">Assigned Classes / Courses</th>
                    <th className="px-4 py-3 font-medium">Hours</th>
                    <th className="px-4 py-3 font-medium text-right">Salary</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading teachers...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No teachers found.</td></tr>
                  ) : (
                    items.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono-tabular text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t.teacher_code}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ImageWithFallback
                              src={t.profile_picture}
                              alt={t.full_name}
                              fallbackText={t.full_name}
                              className="w-9 h-9 rounded-lg object-cover shrink-0 text-xs"
                            />
                            <div>
                              <div className="font-medium text-slate-900 dark:text-slate-100">{t.full_name}</div>
                              <div className="text-xs text-slate-500">{t.qualification} · {t.specialization}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                          {[t.assigned_classes, t.assigned_courses].filter(Boolean).join(' · ') || 'No assignments'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {t.working_hours}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-medium text-slate-800 dark:text-slate-200">
                          PKR {Number(t.salary || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3"><StatusLabel status={t.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setIdCardPerson({
                                  role: 'Teacher',
                                  code: t.teacher_code,
                                  fullName: t.full_name,
                                  subtitle: t.specialization,
                                  contact: t.phone,
                                  photo: t.profile_picture,
                                })
                              }
                              aria-label={`ID card for ${t.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-blue-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
                              aria-label={`Edit ${t.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetTemp(t)}
                              aria-label={`Reset password for ${t.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(t)}
                              aria-label={`Toggle status for ${t.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(t)}
                              aria-label={`Delete ${t.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Trash2 className="w-4 h-4" />
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
        </>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Teacher</th>
                  <th className="px-4 py-3 font-medium text-right">Base</th>
                  <th className="px-4 py-3 font-medium text-right">Bonus</th>
                  <th className="px-4 py-3 font-medium text-right">Deduction</th>
                  <th className="px-4 py-3 font-medium text-right">Net Salary</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {salaries.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono-tabular text-xs">{s.salary_month}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {s.full_name} <span className="text-xs text-slate-400 font-mono-tabular">({s.teacher_code})</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular">PKR {Number(s.base_salary).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-emerald-700 dark:text-emerald-400">+{Number(s.bonus).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-red-600">-{Number(s.deduction).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold">PKR {Number(s.net_salary).toLocaleString()}</td>
                    <td className="px-4 py-3"><StatusLabel status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Teacher Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Teacher — ${editing.teacher_code}` : 'Add New Faculty Member'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Full Name *</label>
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Father&apos;s Name *</label>
              <input required value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Gender *</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Phone Number *</label>
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Qualification *</label>
              <input required value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. M.Sc Computer Science" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Specialization *</label>
              <input required value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="e.g. Mathematics / Video Editing" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Joining Date *</label>
              <input type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Monthly Salary (PKR)</label>
              <input type="number" min="0" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Working Hours</label>
              <input value={form.workingHours} onChange={(e) => setForm({ ...form, workingHours: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            {!editing && (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Assign Academy Classes (Optional)</label>
                  <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                    {classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.assignedClassIds.includes(c.id)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              assignedClassIds: e.target.checked
                                ? [...f.assignedClassIds, c.id]
                                : f.assignedClassIds.filter((x) => x !== c.id),
                            }))
                          }
                        />
                        <span>{c.class_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Assign Professional Courses (Optional)</label>
                  <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                    {courses.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.assignedCourseIds.includes(c.id)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              assignedCourseIds: e.target.checked
                                ? [...f.assignedCourseIds, c.id]
                                : f.assignedCourseIds.filter((x) => x !== c.id),
                            }))
                          }
                        />
                        <span>{c.course_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">
              {editing ? 'Update Teacher' : 'Create Teacher & Generate Credentials'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Salary Modal */}
      <Modal open={salaryModalOpen} onClose={() => setSalaryModalOpen(false)} title="Disburse Teacher Salary" maxWidth="max-w-md">
        <form onSubmit={handleRecordSalary} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Teacher</label>
            <select
              value={salaryForm.teacherId}
              onChange={(e) => {
                const t = items.find((x) => String(x.id) === e.target.value);
                setSalaryForm({ ...salaryForm, teacherId: e.target.value, baseSalary: t ? String(t.salary) : salaryForm.baseSalary });
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {items.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name} ({t.teacher_code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Month</label>
              <input type="month" value={salaryForm.salaryMonth} onChange={(e) => setSalaryForm({ ...salaryForm, salaryMonth: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Base Salary</label>
              <input type="number" value={salaryForm.baseSalary} onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Bonus</label>
              <input type="number" value={salaryForm.bonus} onChange={(e) => setSalaryForm({ ...salaryForm, bonus: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Deduction</label>
              <input type="number" value={salaryForm.deduction} onChange={(e) => setSalaryForm({ ...salaryForm, deduction: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSalaryModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Mark Paid</button>
          </div>
        </form>
      </Modal>

      <CredentialsModal bundle={credentialsBundle} onClose={() => setCredentialsBundle(null)} />
      <IdCardModal person={idCardPerson} onClose={() => setIdCardPerson(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive Teacher Account"
        message={`Archive ${deleteTarget?.full_name} (${deleteTarget?.teacher_code})? They will lose portal access while historical records remain intact.`}
        confirmLabel="Archive Teacher"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
