import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Download, Award, CheckCircle2, FileText, Upload } from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { downloadResultCardPdf } from '../lib/pdfExport';
import { Modal, StatusLabel, useToast } from '../components/UiPrimitives';

export function ExamsView({ role, currentUserName }: { role: 'admin' | 'teacher' | 'student'; currentUserName: string }) {
  const { notify } = useToast();
  const [exams, setExams] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [examDetails, setExamDetails] = useState<{ exam: any; students: any[]; marks: any[]; subjects: any[] } | null>(null);

  const [examForm, setExamForm] = useState({
    examName: '',
    educationCategory: 'school' as 'school' | 'course',
    classId: '',
    courseId: '',
    examDate: new Date().toISOString().slice(0, 10),
  });

  const [markForm, setMarkForm] = useState({
    studentId: '',
    subjectName: '',
    totalMarks: '100',
    obtainedMarks: '',
  });

  const loadExams = useCallback(async () => {
    const res = await apiRequest('/api/exams');
    setExams(res.items || []);
    if (role === 'admin') {
      const [c, crs] = await Promise.all([apiRequest('/api/classes'), apiRequest('/api/courses')]);
      setClasses(c.items || []);
      setCourses(crs.items || []);
    }
  }, [role]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const openMarksDrawer = async (ex: any) => {
    setSelectedExam(ex);
    const details = await apiRequest(`/api/exams/${ex.id}/marks`);
    setExamDetails(details);
    setMarkForm({
      studentId: details.students?.[0] ? String(details.students[0].id) : '',
      subjectName: details.subjects?.[0]?.subject_name || 'Mathematics',
      totalMarks: '100',
      obtainedMarks: '',
    });
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/exams', { method: 'POST', body: JSON.stringify(examForm) });
      notify('Exam scheduled.', 'success');
      setCreateOpen(false);
      loadExams();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleSaveMark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    try {
      await apiRequest(`/api/exams/${selectedExam.id}/marks`, {
        method: 'POST',
        body: JSON.stringify({ entries: [markForm] }),
      });
      notify('Marks saved.', 'success');
      openMarksDrawer(selectedExam);
      loadExams();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleTogglePublish = async (ex: any) => {
    const next = !ex.is_published;
    await apiRequest(`/api/exams/${ex.id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished: next }),
    });
    notify(next ? 'Results published to student portal.' : 'Results unpublished.', 'info');
    loadExams();
    if (selectedExam?.id === ex.id) openMarksDrawer({ ...ex, is_published: next ? 1 : 0 });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Examinations &amp; Results</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Subject marks entry, automatic percentage &amp; grade calculation, result cards, and Excel exports
          </p>
        </div>
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => {
              setExamForm({
                examName: '',
                educationCategory: 'school',
                classId: classes[0] ? String(classes[0].id) : '',
                courseId: courses[0] ? String(courses[0].id) : '',
                examDate: new Date().toISOString().slice(0, 10),
              });
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white"
          >
            <Plus className="w-4 h-4" />
            Create Exam
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exams.map((ex) => (
          <div key={ex.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">{ex.exam_name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ex.class_name || ex.course_name} · <span className="font-mono-tabular">{ex.exam_date}</span>
                </p>
              </div>
              <StatusLabel status={ex.is_published ? 'published' : 'draft'} />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => openMarksDrawer(ex)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#0F2942] text-white font-medium"
              >
                <Award className="w-3.5 h-3.5" />
                {role === 'student' ? 'View Result Card' : 'Marks & Results'}
              </button>
              {role === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(ex)}
                    className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {ex.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadProtectedFile(`/api/exams/${ex.id}/export`, `Exam_${ex.id}_Results.xlsx`)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 ml-auto"
                    aria-label="Export Exam Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Exam Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Examination" maxWidth="max-w-md">
        <form onSubmit={handleCreateExam} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Exam Name *</label>
            <input required value={examForm.examName} onChange={(e) => setExamForm({ ...examForm, examName: e.target.value })} placeholder="e.g. Final Term Assessment 2026" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Category</label>
            <select value={examForm.educationCategory} onChange={(e) => setExamForm({ ...examForm, educationCategory: e.target.value as 'school' | 'course' })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
              <option value="school">Academy Class</option>
              <option value="course">Professional Course</option>
            </select>
          </div>
          {examForm.educationCategory === 'school' ? (
            <div>
              <label className="block text-xs font-medium mb-1">Class</label>
              <select value={examForm.classId} onChange={(e) => setExamForm({ ...examForm, classId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium mb-1">Course</label>
              <select value={examForm.courseId} onChange={(e) => setExamForm({ ...examForm, courseId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Exam Date *</label>
            <input type="date" required value={examForm.examDate} onChange={(e) => setExamForm({ ...examForm, examDate: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Create Exam</button>
          </div>
        </form>
      </Modal>

      {/* Marks & Result Card Modal */}
      <Modal
        open={Boolean(selectedExam && examDetails)}
        onClose={() => {
          setSelectedExam(null);
          setExamDetails(null);
        }}
        title={selectedExam?.exam_name || 'Exam Marks'}
        maxWidth="max-w-3xl"
      >
        {examDetails && (
          <div className="space-y-5">
            {role !== 'student' && (!examDetails.exam.is_published || role === 'admin') && (
              <form onSubmit={handleSaveMark} className="grid grid-cols-1 sm:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium mb-1">Student</label>
                  <select required value={markForm.studentId} onChange={(e) => setMarkForm({ ...markForm, studentId: e.target.value })} className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                    {examDetails.students.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Subject</label>
                  <input required value={markForm.subjectName} onChange={(e) => setMarkForm({ ...markForm, subjectName: e.target.value })} className="w-full px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Obtained / Total</label>
                  <div className="flex gap-1">
                    <input type="number" required min="0" value={markForm.obtainedMarks} onChange={(e) => setMarkForm({ ...markForm, obtainedMarks: e.target.value })} placeholder="Obt" className="w-1/2 px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
                    <input type="number" required min="1" value={markForm.totalMarks} onChange={(e) => setMarkForm({ ...markForm, totalMarks: e.target.value })} className="w-1/2 px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono-tabular" />
                  </div>
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full py-1.5 px-3 text-xs font-semibold rounded-md bg-[#0F2942] text-white">
                    Save Marks
                  </button>
                </div>
              </form>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                  <tr>
                    {role !== 'student' && <th className="px-3 py-2.5">Student</th>}
                    <th className="px-3 py-2.5">Subject</th>
                    <th className="px-3 py-2.5 text-right">Obtained / Total</th>
                    <th className="px-3 py-2.5 text-right">Percentage</th>
                    <th className="px-3 py-2.5">Grade</th>
                    {role !== 'student' && <th className="px-3 py-2.5 text-right">Result Card</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {examDetails.marks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        {role === 'student' && !examDetails.exam.is_published
                          ? 'Results for this examination have not been published yet.'
                          : 'No marks recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    examDetails.marks.map((m) => (
                      <tr key={m.id}>
                        {role !== 'student' && (
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                            {m.full_name} <span className="text-slate-400 font-mono-tabular">({m.student_code})</span>
                          </td>
                        )}
                        <td className="px-3 py-2.5">{m.subject_name}</td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular">{m.obtained_marks} / {m.total_marks}</td>
                        <td className="px-3 py-2.5 text-right font-mono-tabular">{m.percentage}%</td>
                        <td className="px-3 py-2.5 font-semibold">{m.grade} · {m.remarks}</td>
                        {role !== 'student' && (
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                const studentMarks = examDetails.marks.filter((x) => x.student_id === m.student_id);
                                downloadResultCardPdf(
                                  examDetails.exam.exam_name,
                                  examDetails.exam.exam_date,
                                  {
                                    student_code: m.student_code,
                                    full_name: m.full_name,
                                    father_name: m.father_name,
                                    program: examDetails.exam.class_name || examDetails.exam.course_name,
                                  },
                                  studentMarks,
                                );
                              }}
                              className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" /> PDF
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {role === 'student' && examDetails.marks.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    downloadResultCardPdf(
                      examDetails.exam.exam_name,
                      examDetails.exam.exam_date,
                      {
                        student_code: 'STUDENT',
                        full_name: currentUserName,
                        program: examDetails.exam.class_name || examDetails.exam.course_name,
                      },
                      examDetails.marks,
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white"
                >
                  <Download className="w-4 h-4" />
                  Download Result Card PDF
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AssignmentsView({ role }: { role: 'admin' | 'teacher' | 'student' }) {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const [submitTarget, setSubmitTarget] = useState<any>(null);
  const [submitForm, setSubmitForm] = useState({ submissionText: '', fileName: '' });

  const [submissionsTarget, setSubmissionsTarget] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    targetType: 'class' as 'class' | 'course',
    classId: '',
    courseId: '',
    teacherId: '',
    dueDate: new Date().toISOString().slice(0, 10),
    attachmentName: '',
  });

  const load = useCallback(async () => {
    const res = await apiRequest('/api/assignments');
    setItems(res.items || []);
    if (role !== 'student') {
      const [c, crs] = await Promise.all([apiRequest('/api/classes'), apiRequest('/api/courses')]);
      setClasses(c.items || []);
      setCourses(crs.items || []);
      if (role === 'admin') {
        const t = await apiRequest('/api/teachers');
        setTeachers(t.items || []);
      }
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          classId: form.targetType === 'class' ? Number(form.classId) : null,
          courseId: form.targetType === 'course' ? Number(form.courseId) : null,
          teacherId: form.teacherId ? Number(form.teacherId) : undefined,
          dueDate: form.dueDate,
          attachmentName: form.attachmentName,
        }),
      });
      notify('Assignment published.', 'success');
      setCreateOpen(false);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/assignments/${submitTarget.id}/submit`, {
        method: 'POST',
        body: JSON.stringify(submitForm),
      });
      notify('Assignment submitted successfully.', 'success');
      setSubmitTarget(null);
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const openSubmissions = async (a: any) => {
    setSubmissionsTarget(a);
    const res = await apiRequest(`/api/assignments/${a.id}/submissions`);
    setSubmissions(res.items || []);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Assignments &amp; Coursework</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Create tasks, track deadlines, and evaluate student submissions</p>
        </div>
        {role !== 'student' && (
          <button
            type="button"
            onClick={() => {
              setForm({
                title: '',
                description: '',
                targetType: 'class',
                classId: classes[0] ? String(classes[0].id) : '',
                courseId: courses[0] ? String(courses[0].id) : '',
                teacherId: teachers[0] ? String(teachers[0].id) : '',
                dueDate: new Date().toISOString().slice(0, 10),
                attachmentName: '',
              });
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white"
          >
            <Plus className="w-4 h-4" />
            Create Assignment
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((a) => (
          <div key={a.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">{a.title}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {a.class_name || a.course_name} · Teacher: {a.teacher_name} · Due: <span className="font-mono-tabular">{a.due_date}</span>
                </div>
              </div>
              <StatusLabel status={role === 'student' ? (a.my_status || a.status) : a.status} />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{a.description}</p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              {role === 'student' ? (
                <>
                  <span className="text-slate-500">
                    {a.my_grade ? `Score: ${a.my_grade}` : a.my_submission_id ? 'Submitted for review' : 'Pending submission'}
                  </span>
                  {a.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitTarget(a);
                        setSubmitForm({ submissionText: '', fileName: '' });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0F2942] text-white font-medium"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {a.my_submission_id ? 'Update Submission' : 'Submit Work'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="font-mono-tabular text-slate-500">{a.submissions_count || 0} submission(s)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openSubmissions(a)}
                      className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      View Submissions
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/assignments/${a.id}/status`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: a.status === 'open' ? 'closed' : 'open' }),
                        });
                        load();
                      }}
                      className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700"
                    >
                      {a.status === 'open' ? 'Close' : 'Reopen'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Assignment Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Assignment" maxWidth="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Assignment Title *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Target</label>
              <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value as 'class' | 'course' })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="class">Academy Class</option>
                <option value="course">Professional Course</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{form.targetType === 'class' ? 'Class' : 'Course'}</label>
              {form.targetType === 'class' ? (
                <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                </select>
              ) : (
                <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                </select>
              )}
            </div>
            {role === 'admin' && (
              <div>
                <label className="block text-xs font-medium mb-1">Teacher</label>
                <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Due Date *</label>
              <input type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Instructions *</label>
            <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Publish Assignment</button>
          </div>
        </form>
      </Modal>

      {/* Student Submit Modal */}
      <Modal open={Boolean(submitTarget)} onClose={() => setSubmitTarget(null)} title={`Submit: ${submitTarget?.title}`} maxWidth="max-w-md">
        <form onSubmit={handleStudentSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Submission Notes *</label>
            <textarea required rows={3} value={submitForm.submissionText} onChange={(e) => setSubmitForm({ ...submitForm, submissionText: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Attachment Filename (Optional)</label>
            <input value={submitForm.fileName} onChange={(e) => setSubmitForm({ ...submitForm, fileName: e.target.value })} placeholder="e.g. assignment_solution.pdf" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSubmitTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#0F2942] text-white">Submit Assignment</button>
          </div>
        </form>
      </Modal>

      {/* Teacher/Admin View Submissions Modal */}
      <Modal open={Boolean(submissionsTarget)} onClose={() => setSubmissionsTarget(null)} title={`Submissions — ${submissionsTarget?.title}`} maxWidth="max-w-2xl">
        <div className="space-y-3">
          {submissions.length === 0 ? (
            <p className="text-sm text-slate-500">No student submissions yet.</p>
          ) : (
            submissions.map((sub) => (
              <div key={sub.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between font-medium">
                  <span>{sub.full_name} ({sub.student_code})</span>
                  <StatusLabel status={sub.status} />
                </div>
                <p className="text-slate-600 dark:text-slate-300">{sub.submission_text}</p>
                {sub.file_name && <div className="font-mono-tabular text-blue-700 dark:text-blue-400">File: {sub.file_name}</div>}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/submissions/${sub.id}/grade`, {
                        method: 'POST',
                        body: JSON.stringify({ gradeScore: '18/20', teacherFeedback: 'Reviewed and accepted.' }),
                      });
                      notify('Submission marked graded.', 'success');
                      openSubmissions(submissionsTarget);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-medium"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Graded (18/20)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
