import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Clock, BookOpen, Layers, Calendar } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Modal, ConfirmDialog, StatusLabel, ImageWithFallback, useToast } from '../components/UiPrimitives';

export function ClassesView({ role }: { role: 'admin' | 'teacher' }) {
  const { notify } = useToast();
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [sectionClass, setSectionClass] = useState<any>(null);
  const [sectionName, setSectionName] = useState('');
  const [subjectModal, setSubjectModal] = useState<any>(null);
  const [subjectForm, setSubjectForm] = useState({ subjectName: '', subjectCode: '', teacherId: '' });

  const [form, setForm] = useState({
    className: '',
    classCode: '',
    levelOrder: '11',
    classTeacherId: '',
    classTiming: '08:00 AM - 01:30 PM',
    monthlyFee: '3500',
    status: 'active',
  });

  const load = useCallback(async () => {
    const [cRes, tRes] = await Promise.all([apiRequest('/api/classes'), apiRequest('/api/teachers')]);
    setClasses(cRes.items || []);
    setTeachers(tRes.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/classes/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
        notify('Class updated.', 'success');
      } else {
        await apiRequest('/api/classes', { method: 'POST', body: JSON.stringify(form) });
        notify('Class added.', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/classes/${sectionClass.id}/sections`, {
        method: 'POST',
        body: JSON.stringify({ sectionName }),
      });
      notify('Section added.', 'success');
      setSectionClass(null);
      setSectionName('');
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ ...subjectForm, classId: subjectModal.id }),
      });
      notify('Subject added.', 'success');
      setSubjectModal(null);
      setSubjectForm({ subjectName: '', subjectCode: '', teacherId: '' });
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Academy Classes &amp; Sections</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Academy batches (Nursery to Class 12 · Classes 6th–12th full curriculum), sections, and subjects</p>
        </div>
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({
                className: '',
                classCode: '',
                levelOrder: String(classes.length + 1),
                classTeacherId: '',
                classTiming: '08:00 AM - 01:30 PM',
                monthlyFee: '3500',
                status: 'active',
              });
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white"
          >
            <Plus className="w-4 h-4" />
            Add Class
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {classes.map((c) => (
          <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">{c.class_name}</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono-tabular">
                  {c.class_code} · PKR {Number(c.monthly_fee).toLocaleString()}/mo · {c.student_count} students
                </div>
              </div>
              <StatusLabel status={c.status} />
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>Class Teacher: <span className="font-medium">{c.class_teacher_name || 'Unassigned'}</span></div>
              <div>Timing: <span className="font-mono-tabular">{c.class_timing}</span></div>
              <div>
                Sections: <span className="font-medium">{(c.sections || []).map((s: any) => s.section_name).join(', ') || 'None'}</span>
              </div>
              <div>
                Subjects: <span className="font-medium">{(c.subjects || []).map((s: any) => s.subject_name).join(', ') || 'General'}</span>
              </div>
            </div>

            {role === 'admin' && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(c);
                    setForm({
                      className: c.class_name,
                      classCode: c.class_code,
                      levelOrder: String(c.level_order),
                      classTeacherId: c.class_teacher_id ? String(c.class_teacher_id) : '',
                      classTiming: c.class_timing,
                      monthlyFee: String(c.monthly_fee),
                      status: c.status,
                    });
                    setModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setSectionClass(c)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  + Section
                </button>
                <button
                  type="button"
                  onClick={() => setSubjectModal(c)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  + Subject
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c)}
                  className="ml-auto text-red-600 hover:underline"
                >
                  Archive
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.class_name}` : 'Add New Academy Class'} maxWidth="max-w-md">
        <form onSubmit={handleSaveClass} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Class Name *</label>
            <input required value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          {!editing && (
            <div>
              <label className="block text-xs font-medium mb-1">Class Code *</label>
              <input required value={form.classCode} onChange={(e) => setForm({ ...form, classCode: e.target.value })} placeholder="e.g. CLS-9" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Class Teacher</label>
            <select value={form.classTeacherId} onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              <option value="">Unassigned</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Class Timing</label>
              <input value={form.classTiming} onChange={(e) => setForm({ ...form, classTiming: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Monthly Fee (PKR)</label>
              <input type="number" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Save Class</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(sectionClass)} onClose={() => setSectionClass(null)} title={`Add Section to ${sectionClass?.class_name}`} maxWidth="max-w-sm">
        <form onSubmit={handleAddSection} className="space-y-4">
          <input required value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g. Section C" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSectionClass(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#0F2942] text-white">Add Section</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(subjectModal)} onClose={() => setSubjectModal(null)} title={`Add Subject to ${subjectModal?.class_name}`} maxWidth="max-w-sm">
        <form onSubmit={handleAddSubject} className="space-y-3">
          <input required value={subjectForm.subjectName} onChange={(e) => setSubjectForm({ ...subjectForm, subjectName: e.target.value })} placeholder="Subject Name" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <input required value={subjectForm.subjectCode} onChange={(e) => setSubjectForm({ ...subjectForm, subjectCode: e.target.value })} placeholder="Subject Code (e.g. URDU-8)" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <select value={subjectForm.teacherId} onChange={(e) => setSubjectForm({ ...subjectForm, teacherId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
            <option value="">Select Teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSubjectModal(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[#0F2942] text-white">Add Subject</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive Academy Class"
        message={`Archive ${deleteTarget?.class_name}?`}
        confirmLabel="Archive"
        onConfirm={async () => {
          await apiRequest(`/api/classes/${deleteTarget.id}`, { method: 'DELETE' });
          setDeleteTarget(null);
          notify('Class archived.', 'info');
          load();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function CoursesView({ role }: { role: 'admin' | 'teacher' | 'student' }) {
  const { notify } = useToast();
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const [form, setForm] = useState({
    courseName: '',
    courseCode: '',
    category: 'Professional Courses',
    duration: '3 Months',
    courseFee: '8500',
    description: '',
    teacherId: '',
    classTiming: '03:00 PM - 05:00 PM',
    maxStudents: '25',
    admissionStatus: 'open',
    status: 'active',
    courseImage: '',
  });

  const load = useCallback(async () => {
    const crsRes = await apiRequest('/api/courses');
    setCourses(crsRes.items || []);
    if (role === 'admin') {
      const tRes = await apiRequest('/api/teachers');
      setTeachers(tRes.items || []);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiRequest(`/api/courses/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
        notify('Course updated.', 'success');
      } else {
        await apiRequest('/api/courses', { method: 'POST', body: JSON.stringify(form) });
        notify('New professional course created.', 'success');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      notify('Course image must be under 1.5 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, courseImage: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Professional Courses</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dynamic skill tracks including Video Editing, Graphic Designing, Web Development, and more
          </p>
        </div>
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({
                courseName: '',
                courseCode: '',
                category: 'Professional Courses',
                duration: '3 Months',
                courseFee: '8500',
                description: '',
                teacherId: teachers[0] ? String(teachers[0].id) : '',
                classTiming: '04:00 PM - 06:00 PM',
                maxStudents: '25',
                admissionStatus: 'open',
                status: 'active',
                courseImage: '',
              });
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white"
          >
            <Plus className="w-4 h-4" />
            Add Course
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {courses.map((crs) => (
          <div key={crs.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[16/9] bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <ImageWithFallback
                src={crs.course_image}
                alt={crs.course_name}
                fallbackText={crs.course_name}
                className="w-full h-full object-cover text-2xl"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                      {crs.course_code} · {crs.duration}
                    </div>
                    <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100 mt-0.5">
                      {crs.course_name}
                    </h3>
                  </div>
                  <StatusLabel status={crs.status} />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                  {crs.description || 'Structured practical certification program at SindhTech Institute.'}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Instructor: <strong className="font-medium">{crs.teacher_name || 'TBA'}</strong></span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    PKR {Number(crs.course_fee).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{crs.class_timing}</span>
                  <span className="font-mono-tabular">{crs.enrolled_count}/{crs.max_students} seats · Admissions {crs.admission_status}</span>
                </div>

                {role === 'admin' && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(crs);
                        setForm({
                          courseName: crs.course_name,
                          courseCode: crs.course_code,
                          category: crs.category,
                          duration: crs.duration,
                          courseFee: String(crs.course_fee),
                          description: crs.description || '',
                          teacherId: crs.teacher_id ? String(crs.teacher_id) : '',
                          classTiming: crs.class_timing,
                          maxStudents: String(crs.max_students),
                          admissionStatus: crs.admission_status,
                          status: crs.status,
                          courseImage: '',
                        });
                        setModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(crs)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${editing.course_name}` : 'Add Professional Course'} maxWidth="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Course Name *</label>
              <input required value={form.courseName} onChange={(e) => setForm({ ...form, courseName: e.target.value })} placeholder="e.g. Web Development" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Course Code *</label>
              <input required disabled={Boolean(editing)} value={form.courseCode} onChange={(e) => setForm({ ...form, courseCode: e.target.value })} placeholder="e.g. WEB-201" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Duration *</label>
              <input required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 4 Months" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Course Fee (PKR) *</label>
              <input type="number" required value={form.courseFee} onChange={(e) => setForm({ ...form, courseFee: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Assigned Teacher</label>
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="">Select Instructor</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Class Timing *</label>
              <input required value={form.classTiming} onChange={(e) => setForm({ ...form, classTiming: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Max Students</label>
              <input type="number" value={form.maxStudents} onChange={(e) => setForm({ ...form, maxStudents: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Admission Status</label>
              <select value={form.admissionStatus} onChange={(e) => setForm({ ...form, admissionStatus: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Course Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Course Thumbnail Image</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImagePick} className="w-full text-xs text-slate-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Save Course</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive Course"
        message={`Archive "${deleteTarget?.course_name}"? Existing student records will remain preserved.`}
        confirmLabel="Archive"
        onConfirm={async () => {
          await apiRequest(`/api/courses/${deleteTarget.id}`, { method: 'DELETE' });
          setDeleteTarget(null);
          notify('Course archived.', 'info');
          load();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function TimetableView({ role }: { role: 'admin' | 'teacher' | 'student' }) {
  const { notify } = useToast();
  const [slots, setSlots] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    dayOfWeek: 'Monday',
    startTime: '09:00',
    endTime: '10:00',
    teacherId: '',
    targetType: 'class' as 'class' | 'course',
    classId: '',
    courseId: '',
    room: 'Room 101',
  });

  const load = useCallback(async () => {
    const ttRes = await apiRequest('/api/timetable');
    setSlots(ttRes.items || []);
    if (role === 'admin') {
      const [cRes, crsRes, tRes] = await Promise.all([
        apiRequest('/api/classes'),
        apiRequest('/api/courses'),
        apiRequest('/api/teachers'),
      ]);
      setClasses(cRes.items || []);
      setCourses(crsRes.items || []);
      setTeachers(tRes.items || []);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/timetable', {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          teacherId: Number(form.teacherId),
          classId: form.targetType === 'class' ? Number(form.classId) : null,
          courseId: form.targetType === 'course' ? Number(form.courseId) : null,
          room: form.room,
        }),
      });
      notify('Timetable slot scheduled.', 'success');
      setModalOpen(false);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Weekly Timetable Schedule</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conflict-checked class &amp; course schedule across Monday–Saturday
          </p>
        </div>
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => {
              setForm({
                dayOfWeek: 'Monday',
                startTime: '10:30',
                endTime: '11:30',
                teacherId: teachers[0] ? String(teachers[0].id) : '',
                targetType: 'class',
                classId: classes[0] ? String(classes[0].id) : '',
                courseId: courses[0] ? String(courses[0].id) : '',
                room: 'Room 104',
              });
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white"
          >
            <Plus className="w-4 h-4" />
            Schedule Slot
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Time Slot</th>
                <th className="px-4 py-3 font-medium">Class / Course</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Teacher</th>
                <th className="px-4 py-3 font-medium">Room</th>
                {role === 'admin' && <th className="px-4 py-3 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {slots.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No timetable slots scheduled.</td></tr>
              ) : (
                slots.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{s.day_of_week}</td>
                    <td className="px-4 py-3 font-mono-tabular text-xs text-slate-700 dark:text-slate-300">
                      {s.start_time} – {s.end_time}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{s.class_name || s.course_name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.subject_name || 'General Session'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.teacher_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.room || '—'}</td>
                    {role === 'admin' && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/timetable/${s.id}`, { method: 'DELETE' });
                            notify('Timetable slot removed.', 'info');
                            load();
                          }}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule New Timetable Slot" maxWidth="max-w-md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Day of Week</label>
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Start Time</label>
              <input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">End Time</label>
              <input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Teacher</label>
            <select required value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Target Type</label>
            <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value as 'class' | 'course' })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              <option value="class">Academy Class</option>
              <option value="course">Professional Course</option>
            </select>
          </div>
          {form.targetType === 'class' ? (
            <div>
              <label className="block text-xs font-medium mb-1">Class</label>
              <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium mb-1">Course</label>
              <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Room / Lab</label>
            <input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Save Slot</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
