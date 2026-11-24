import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, CreditCard, Eye, Edit2, Trash2, ArrowUpRight,
  KeyRound, Power, ShieldAlert, FileSpreadsheet,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { formatProgramLabel, formatSubjectsSummary } from '../lib/domain';
import {
  Modal, ConfirmDialog, StatusLabel, ImageWithFallback, PaginationControls, useToast,
} from '../components/UiPrimitives';
import { IdCardModal, type IdCardPerson } from '../components/IdCardModal';

export interface CredentialsBundle {
  token: string;
  name: string;
  idCode: string;
  role: 'Student' | 'Teacher';
  username: string;
  temporaryPassword: string;
  assignedTarget: string;
  createdDate: string;
}

export function CredentialsModal({
  bundle,
  onClose,
}: {
  bundle: CredentialsBundle | null;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const [downloaded, setDownloaded] = useState(false);

  if (!bundle) return null;

  const handleDownload = async () => {
    try {
      await downloadProtectedFile(
        `/api/credentials/export/${bundle.token}`,
        `${bundle.idCode}_Credentials.xlsx`,
      );
      setDownloaded(true);
      notify('One-time credentials Excel (.xlsx) downloaded.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <Modal open={Boolean(bundle)} onClose={onClose} title="Account Created — One-Time Login Credentials" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <div className="font-semibold">Login Credentials Saved Automatically</div>
            <p className="mt-0.5 leading-relaxed">
              This account&apos;s Login ID and password are saved in the Admin <strong>Credentials Sheet</strong> for WhatsApp or Excel (.xlsx) sharing. The user can sign in directly to their personal dashboard with these credentials.
            </p>
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-500 dark:text-slate-400">Name</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{bundle.name}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-500 dark:text-slate-400">{bundle.role} ID</span>
            <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">{bundle.idCode}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-500 dark:text-slate-400">Username</span>
            <span className="font-mono-tabular font-semibold text-blue-700 dark:text-blue-400">{bundle.username}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-500 dark:text-slate-400">Temporary Password</span>
            <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100 select-all">
              {bundle.temporaryPassword}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-slate-500 dark:text-slate-400">Assigned Class / Course</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{bundle.assignedTarget}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Done
          </button>
          <button
            type="button"
            disabled={downloaded}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {downloaded ? 'Excel Downloaded' : 'Download Credentials Excel (.xlsx)'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function StudentsView({ role }: { role: 'admin' | 'teacher' }) {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [gender, setGender] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [credentialsBundle, setCredentialsBundle] = useState<CredentialsBundle | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [idCardPerson, setIdCardPerson] = useState<IdCardPerson | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [promoteClassId, setPromoteClassId] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    fatherName: '',
    dob: '2014-01-01',
    gender: 'Male',
    phone: '',
    guardianPhone: '',
    email: '',
    address: '',
    admissionDate: new Date().toISOString().slice(0, 10),
    educationCategory: 'school' as 'school' | 'course' | 'both',
    classId: '',
    sectionId: '',
    courseId: '',
    subjectIds: [] as number[],
    assignedTeacherId: '',
    monthlyFee: '3500',
    admissionFee: '5000',
    status: 'active',
    profilePicture: '',
  });

  const loadMeta = useCallback(async () => {
    const [clsRes, crsRes, teaRes] = await Promise.all([
      apiRequest('/api/classes'),
      apiRequest('/api/courses'),
      apiRequest('/api/teachers'),
    ]);
    setClasses(clsRes.items || []);
    setCourses(crsRes.items || []);
    setTeachers(teaRes.items || []);
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '15',
        ...(search ? { search } : {}),
        ...(classId ? { classId } : {}),
        ...(courseId ? { courseId } : {}),
        ...(gender ? { gender } : {}),
        ...(admissionDate ? { admissionDate } : {}),
      });
      const res = await apiRequest(`/api/students?${qs.toString()}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, classId, courseId, gender, admissionDate, notify]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const openAdd = () => {
    setEditing(null);
    const defaultCls = classes.find((c) => c.class_name === 'Class 6') || classes[0];
    setForm({
      fullName: '',
      fatherName: '',
      dob: '2011-05-10',
      gender: 'Male',
      phone: '',
      guardianPhone: '',
      email: '',
      address: '',
      admissionDate: new Date().toISOString().slice(0, 10),
      educationCategory: 'school',
      classId: defaultCls ? String(defaultCls.id) : '',
      sectionId: defaultCls?.sections?.[0] ? String(defaultCls.sections[0].id) : '',
      courseId: courses[0] ? String(courses[0].id) : '',
      subjectIds: [],
      assignedTeacherId: defaultCls?.class_teacher_id ? String(defaultCls.class_teacher_id) : '',
      monthlyFee: defaultCls ? String(defaultCls.monthly_fee) : '4200',
      admissionFee: '5000',
      status: 'active',
      profilePicture: '',
    });
    setFormOpen(true);
  };

  const openEdit = (st: any) => {
    setEditing(st);
    setForm({
      fullName: st.full_name || '',
      fatherName: st.father_name || '',
      dob: st.dob || '2011-01-01',
      gender: st.gender || 'Male',
      phone: st.phone || '',
      guardianPhone: st.guardian_phone || '',
      email: st.email || '',
      address: st.address || '',
      admissionDate: st.admission_date || '',
      educationCategory: st.education_category || 'school',
      classId: st.class_id ? String(st.class_id) : '',
      sectionId: st.section_id ? String(st.section_id) : '',
      courseId: st.course_id ? String(st.course_id) : '',
      subjectIds: Array.isArray(st.selected_subject_ids) ? st.selected_subject_ids.map(Number) : [],
      assignedTeacherId: st.assigned_teacher_id ? String(st.assigned_teacher_id) : '',
      monthlyFee: String(st.monthly_fee || 0),
      admissionFee: String(st.admission_fee || 0),
      status: st.status || 'active',
      profilePicture: '',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentCls = classes.find((c) => String(c.id) === form.classId);
    const availableSubjects = currentCls?.subjects || [];
    if ((form.educationCategory === 'school' || form.educationCategory === 'both') && availableSubjects.length > 0 && form.subjectIds.length === 0) {
      notify('Please choose how many and which subjects the student wants to study for this class.', 'error');
      return;
    }

    try {
      if (editing) {
        await apiRequest(`/api/students/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        notify('Student record updated.', 'success');
        setFormOpen(false);
        loadStudents();
      } else {
        const res = await apiRequest<{ id: number; credentials: CredentialsBundle }>('/api/students', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        notify('Student admitted & login credentials generated.', 'success');
        setFormOpen(false);
        setCredentialsBundle(res.credentials);
        loadStudents();
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleViewProfile = async (id: number) => {
    try {
      const data = await apiRequest(`/api/students/${id}`);
      setProfileData(data);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleToggleStatus = async (st: any) => {
    const next = st.status === 'active' ? 'inactive' : 'active';
    try {
      await apiRequest(`/api/students/${st.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      notify(`${st.full_name} marked ${next}.`, 'info');
      loadStudents();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleResetTempPassword = async (st: any) => {
    try {
      const res = await apiRequest<{ credentials: CredentialsBundle }>(`/api/users/${st.user_id}/reset-temp-password`, {
        method: 'POST',
      });
      setCredentialsBundle(res.credentials);
      notify('New one-time temporary password generated.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/students/${deleteTarget.id}`, { method: 'DELETE' });
      notify(`Archived student ${deleteTarget.full_name}.`, 'info');
      setDeleteTarget(null);
      loadStudents();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/students/promote', {
        method: 'POST',
        body: JSON.stringify({ studentIds: selectedIds, targetClassId: Number(promoteClassId) }),
      });
      notify(`Promoted ${selectedIds.length} student(s).`, 'success');
      setPromoteOpen(false);
      setSelectedIds([]);
      loadStudents();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      notify('Image size must be under 1.5 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, profilePicture: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const selectedClassObj = classes.find((c) => String(c.id) === form.classId);

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            {role === 'admin' ? 'Student Directory & Admissions' : 'Assigned Students'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Academy Classes (Nursery–Class 12 · Full 6th–12th Subject Tracks) &amp; Professional Course Enrollments
          </p>
        </div>
        {role === 'admin' && (
          <div className="flex flex-wrap items-center gap-2.5">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPromoteClassId(classes[0] ? String(classes[0].id) : '');
                  setPromoteOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <ArrowUpRight className="w-4 h-4" />
                Promote Selected ({selectedIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadProtectedFile('/api/students/export', 'SindhTech_Students.xlsx')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Student
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search students"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search name, ID, phone..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          aria-label="Filter by class"
          value={classId}
          onChange={(e) => {
            setPage(1);
            setClassId(e.target.value);
          }}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.class_name}</option>
          ))}
        </select>
        <select
          aria-label="Filter by course"
          value={courseId}
          onChange={(e) => {
            setPage(1);
            setCourseId(e.target.value);
          }}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        >
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.course_name}</option>
          ))}
        </select>
        <select
          aria-label="Filter by gender"
          value={gender}
          onChange={(e) => {
            setPage(1);
            setGender(e.target.value);
          }}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        >
          <option value="">All Genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <input
          type="date"
          aria-label="Filter by admission date"
          value={admissionDate}
          onChange={(e) => {
            setPage(1);
            setAdmissionDate(e.target.value);
          }}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {role === 'admin' && <th className="px-3 py-3 w-8" />}
                <th className="px-4 py-3 font-medium">Student ID</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Class / Course</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium text-right">Monthly Fee</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Loading students...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No students matched the current filters.
                  </td>
                </tr>
              ) : (
                items.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {role === 'admin' && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${st.full_name}`}
                          checked={selectedIds.includes(st.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, st.id] : prev.filter((x) => x !== st.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono-tabular text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <div>{st.student_code}</div>
                      <div className="text-[11px] font-normal text-slate-400">{st.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ImageWithFallback
                          src={st.profile_picture}
                          alt={st.full_name}
                          fallbackText={st.full_name}
                          className="w-9 h-9 rounded-lg object-cover shrink-0 text-xs"
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{st.full_name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            S/O {st.father_name} · {st.gender}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {formatProgramLabel(st.class_name, st.course_name, st.education_category)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {st.education_category === 'both'
                          ? `Dual Program${st.section_name ? ` · ${st.section_name}` : ''}`
                          : st.education_category === 'course'
                            ? 'Professional Course'
                            : st.section_name || 'Academy Education'}
                      </div>
                      {Array.isArray(st.selected_subject_names) && st.selected_subject_names.length > 0 && (
                        <div className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5 font-medium">
                          {formatSubjectsSummary(st.selected_subject_names, 3)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs text-slate-600 dark:text-slate-300">
                      <div>{st.phone}</div>
                      <div className="text-slate-400">G: {st.guardian_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-medium text-slate-800 dark:text-slate-200">
                      PKR {Number(st.monthly_fee).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={st.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleViewProfile(st.id)}
                          aria-label={`View profile for ${st.full_name}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {role === 'admin' && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setIdCardPerson({
                                  role: 'Student',
                                  code: st.student_code,
                                  fullName: st.full_name,
                                  subtitle: formatProgramLabel(st.class_name, st.course_name, st.education_category),
                                  contact: st.phone,
                                  photo: st.profile_picture,
                                })
                              }
                              aria-label={`Generate ID card for ${st.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(st)}
                              aria-label={`Edit ${st.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetTempPassword(st)}
                              aria-label={`Reset password for ${st.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(st)}
                              aria-label={`Toggle status for ${st.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(st)}
                              aria-label={`Delete ${st.full_name}`}
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      </div>

      {/* Add / Edit Student Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Student — ${editing.student_code}` : 'Admit New Student'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Full Name *</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Father&apos;s Name *</label>
              <input
                required
                value={form.fatherName}
                onChange={(e) => setForm({ ...form, fatherName: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Date of Birth *</label>
              <input
                type="date"
                required
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Gender *</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Phone Number *</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+92 300 0000000"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Parent / Guardian Phone *</label>
              <input
                required
                value={form.guardianPhone}
                onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                placeholder="+92 300 0000000"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Admission Date *</label>
              <input
                type="date"
                required
                value={form.admissionDate}
                onChange={(e) => setForm({ ...form, admissionDate: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Education Category *</label>
              <select
                aria-label="Education Category"
                value={form.educationCategory}
                onChange={(e) => {
                  const cat = e.target.value as 'school' | 'course' | 'both';
                  const cls = classes.find((c) => String(c.id) === form.classId) || classes[0];
                  const crs = courses.find((c) => String(c.id) === form.courseId) || courses[0];
                  if (cat === 'course') {
                    setForm({
                      ...form,
                      educationCategory: cat,
                      courseId: crs ? String(crs.id) : '',
                      monthlyFee: crs ? String(crs.course_fee) : '8500',
                      assignedTeacherId: crs?.teacher_id ? String(crs.teacher_id) : form.assignedTeacherId,
                    });
                  } else if (cat === 'both') {
                    const combinedFee = (Number(cls?.monthly_fee) || 0) + (Number(crs?.course_fee) || 0);
                    setForm({
                      ...form,
                      educationCategory: cat,
                      classId: cls ? String(cls.id) : '',
                      sectionId: cls?.sections?.[0] ? String(cls.sections[0].id) : form.sectionId,
                      courseId: crs ? String(crs.id) : '',
                      monthlyFee: String(combinedFee || 12700),
                      assignedTeacherId: cls?.class_teacher_id
                        ? String(cls.class_teacher_id)
                        : crs?.teacher_id
                          ? String(crs.teacher_id)
                          : form.assignedTeacherId,
                    });
                  } else {
                    setForm({
                      ...form,
                      educationCategory: cat,
                      classId: cls ? String(cls.id) : '',
                      sectionId: cls?.sections?.[0] ? String(cls.sections[0].id) : form.sectionId,
                      monthlyFee: cls ? String(cls.monthly_fee) : '3500',
                      assignedTeacherId: cls?.class_teacher_id ? String(cls.class_teacher_id) : form.assignedTeacherId,
                    });
                  }
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="school">Academy Classes (Nursery - Class 12)</option>
                <option value="course">Professional Courses</option>
                <option value="both">Dual Program (Academy Class + Professional Course)</option>
              </select>
            </div>

            {(form.educationCategory === 'school' || form.educationCategory === 'both') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Academy Class *</label>
                  <select
                    aria-label="Academy Class"
                    value={form.classId}
                    onChange={(e) => {
                      const cls = classes.find((c) => String(c.id) === e.target.value);
                      const crs = courses.find((c) => String(c.id) === form.courseId);
                      const nextFee =
                        form.educationCategory === 'both'
                          ? (Number(cls?.monthly_fee) || 0) + (Number(crs?.course_fee) || 0)
                          : Number(cls?.monthly_fee || form.monthlyFee);
                      setForm({
                        ...form,
                        classId: e.target.value,
                        sectionId: cls?.sections?.[0] ? String(cls.sections[0].id) : '',
                        subjectIds: [],
                        monthlyFee: String(nextFee),
                        assignedTeacherId: cls?.class_teacher_id ? String(cls.class_teacher_id) : form.assignedTeacherId,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.class_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Section</label>
                  <select
                    aria-label="Section"
                    value={form.sectionId}
                    onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {(selectedClassObj?.sections || []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.section_name}</option>
                    ))}
                  </select>
                </div>

                {(selectedClassObj?.subjects || []).length > 0 && (
                  <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          Which Subjects &amp; How Many Subjects for {selectedClassObj.class_name}? *
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Choose the exact subjects this student wants to study in {selectedClassObj.class_name}.
                        </p>
                      </div>
                      <span className="text-xs font-mono-tabular font-semibold text-blue-700 dark:text-blue-400 shrink-0">
                        {form.subjectIds.length} of {selectedClassObj.subjects.length} selected
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            subjectIds: selectedClassObj.subjects.map((sub: any) => Number(sub.id)),
                          })
                        }
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Select All ({selectedClassObj.subjects.length})
                      </button>
                      {[3, 4, 5].map((count) =>
                        selectedClassObj.subjects.length >= count ? (
                          <button
                            key={count}
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                subjectIds: selectedClassObj.subjects.slice(0, count).map((sub: any) => Number(sub.id)),
                              })
                            }
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            First {count} Subjects
                          </button>
                        ) : null,
                      )}
                      {form.subjectIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, subjectIds: [] })}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md text-red-600 dark:text-red-400 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {selectedClassObj.subjects.map((sub: any) => {
                        const subId = Number(sub.id);
                        const checked = form.subjectIds.includes(subId);
                        return (
                          <label
                            key={subId}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'border-[#0F2942] bg-[#0F2942]/5 dark:border-blue-500 dark:bg-blue-950/40 text-slate-900 dark:text-slate-100 font-medium'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? Array.from(new Set([...form.subjectIds, subId]))
                                  : form.subjectIds.filter((id) => id !== subId);
                                setForm({ ...form, subjectIds: next });
                              }}
                              className="rounded border-slate-300 dark:border-slate-600"
                            />
                            <span className="truncate">{sub.subject_name}</span>
                            <span className="ml-auto text-[10px] font-mono-tabular text-slate-400 shrink-0">
                              {sub.subject_code}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {(form.educationCategory === 'course' || form.educationCategory === 'both') && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Professional Course *</label>
                <select
                  aria-label="Professional Course"
                  value={form.courseId}
                  onChange={(e) => {
                    const crs = courses.find((c) => String(c.id) === e.target.value);
                    const cls = classes.find((c) => String(c.id) === form.classId);
                    const nextFee =
                      form.educationCategory === 'both'
                        ? (Number(cls?.monthly_fee) || 0) + (Number(crs?.course_fee) || 0)
                        : Number(crs?.course_fee || form.monthlyFee);
                    setForm({
                      ...form,
                      courseId: e.target.value,
                      monthlyFee: String(nextFee),
                      assignedTeacherId:
                        form.educationCategory === 'course' && crs?.teacher_id
                          ? String(crs.teacher_id)
                          : form.assignedTeacherId,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.course_name} ({c.course_code})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Assigned Teacher</label>
              <select
                value={form.assignedTeacherId}
                onChange={(e) => setForm({ ...form, assignedTeacherId: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="">Select Teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name} ({t.specialization})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Monthly / Course Fee (PKR)</label>
              <input
                type="number"
                min="0"
                value={form.monthlyFee}
                onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono-tabular"
              />
            </div>
            {!editing && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Admission Fee (PKR)</label>
                <input
                  type="number"
                  min="0"
                  value={form.admissionFee}
                  onChange={(e) => setForm({ ...form, admissionFee: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono-tabular"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Profile Picture</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImagePick}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Residential Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white"
            >
              {editing ? 'Save Changes' : 'Create Student & Generate Credentials'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Profile Modal */}
      <Modal
        open={Boolean(profileData)}
        onClose={() => setProfileData(null)}
        title={`Student Profile — ${profileData?.student?.student_code || ''}`}
        maxWidth="max-w-2xl"
      >
        {profileData && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <ImageWithFallback
                src={profileData.student.profile_picture}
                alt={profileData.student.full_name}
                fallbackText={profileData.student.full_name}
                className="w-16 h-16 rounded-xl object-cover text-lg"
              />
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
                  {profileData.student.full_name}
                </h3>
                <p className="text-xs text-slate-500">
                  {profileData.student.student_code} · Login ID: {profileData.student.username} · {formatProgramLabel(profileData.student.class_name, profileData.student.course_name, profileData.student.education_category)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Father: {profileData.student.father_name} · Contact: {profileData.student.phone}
                </p>
              </div>
            </div>

            {Array.isArray(profileData.student.selected_subjects) && profileData.student.selected_subjects.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Selected Class Subjects ({profileData.student.selected_subjects.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {profileData.student.selected_subjects.map((sub: any) => (
                    <div
                      key={sub.id}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{sub.subject_name}</span>
                      <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">{sub.subject_code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Fee Ledger Summary</h4>
              {(profileData.fees || []).length === 0 ? (
                <p className="text-xs text-slate-500">No fee challans recorded.</p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Challan</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2 text-right">Net</th>
                        <th className="px-3 py-2 text-right">Remaining</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {profileData.fees.slice(0, 5).map((f: any) => (
                        <tr key={f.id}>
                          <td className="px-3 py-2 font-mono-tabular">{f.challan_number}</td>
                          <td className="px-3 py-2 capitalize">{f.fee_type}</td>
                          <td className="px-3 py-2 text-right font-mono-tabular">PKR {Number(f.net_amount).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono-tabular">PKR {Number(f.remaining_amount).toLocaleString()}</td>
                          <td className="px-3 py-2"><StatusLabel status={f.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Promote Modal */}
      <Modal open={promoteOpen} onClose={() => setPromoteOpen(false)} title="Promote Selected Students" maxWidth="max-w-md">
        <form onSubmit={handlePromote} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Promote {selectedIds.length} selected student(s) to the next academic class.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Target Class</label>
            <select
              required
              value={promoteClassId}
              onChange={(e) => setPromoteClassId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPromoteOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-[#0F2942] text-white">
              Promote Students
            </button>
          </div>
        </form>
      </Modal>

      <CredentialsModal bundle={credentialsBundle} onClose={() => setCredentialsBundle(null)} />
      <IdCardModal person={idCardPerson} onClose={() => setIdCardPerson(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive Student Record"
        message={`Are you sure you want to archive ${deleteTarget?.full_name} (${deleteTarget?.student_code})? Historical financial and academic records will be preserved safely.`}
        confirmLabel="Archive Student"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
