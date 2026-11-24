import React, { useEffect, useState, useCallback } from 'react';
import { Download, Save } from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import { StatusLabel, useToast } from '../components/UiPrimitives';

export function AttendanceView({ role }: { role: 'admin' | 'teacher' | 'student' }) {
  const { notify } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendeeType, setAttendeeType] = useState<'student' | 'teacher'>('student');
  const [classId, setClassId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      date,
      attendeeType,
      ...(classId ? { classId } : {}),
      ...(courseId ? { courseId } : {}),
    });
    const res = await apiRequest(`/api/attendance?${qs.toString()}`);
    const list = res.items || [];
    setRows(list);
    const map: Record<number, string> = {};
    for (const r of list) {
      const id = r.student_id || r.teacher_id || r.id;
      map[id] = r.status || 'present';
    }
    setDraft(map);
  }, [date, attendeeType, classId, courseId]);

  useEffect(() => {
    if (role !== 'student') {
      Promise.all([apiRequest('/api/classes'), apiRequest('/api/courses')]).then(([c, crs]) => {
        setClasses(c.items || []);
        setCourses(crs.items || []);
      });
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = rows.map((r) => {
        const id = attendeeType === 'teacher' ? r.teacher_id : r.student_id;
        return attendeeType === 'teacher'
          ? { teacherId: id, status: draft[id] || 'present' }
          : { studentId: id, status: draft[id] || 'present' };
      });
      await apiRequest('/api/attendance/bulk', {
        method: 'POST',
        body: JSON.stringify({ date, attendeeType, records }),
      });
      notify(`Attendance saved for ${records.length} ${attendeeType}(s).`, 'success');
      load();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (role === 'student') {
    const total = rows.length;
    const present = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 100;
    return (
      <div className="space-y-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">My Attendance Record</h2>
            <p className="text-xs text-slate-500">Overall Presence Rate: <strong className="font-mono-tabular">{pct}%</strong> ({present}/{total} sessions)</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono-tabular text-xs">{r.attendance_date}</td>
                  <td className="px-4 py-3"><StatusLabel status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Attendance Register</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Daily roll call for Present, Absent, Late, and Leave tracking</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {role === 'admin' && (
            <>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAttendeeType('student')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${attendeeType === 'student' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'}`}
                >
                  Students
                </button>
                <button
                  type="button"
                  onClick={() => setAttendeeType('teacher')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${attendeeType === 'teacher' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'}`}
                >
                  Teachers
                </button>
              </div>
              <button
                type="button"
                onClick={() => downloadProtectedFile(`/api/attendance/export?month=${date.slice(0, 7)}`, 'SindhTech_Attendance.xlsx')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            </>
          )}
          <button
            type="button"
            disabled={saving || rows.length === 0}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap gap-3">
        <input
          type="date"
          aria-label="Attendance date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
        />
        {attendeeType === 'student' && (
          <>
            <select value={classId} onChange={(e) => { setClassId(e.target.value); setCourseId(''); }} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
            </select>
            <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setClassId(''); }} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
              <option value="">All Courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Program / Dept</th>
              <th className="px-4 py-3 font-medium">Attendance Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((r) => {
              const id = attendeeType === 'teacher' ? r.teacher_id : r.student_id;
              const current = draft[id] || 'present';
              return (
                <tr key={id}>
                  <td className="px-4 py-3 font-mono-tabular text-xs font-medium">{r.student_code || r.teacher_code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{r.full_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.group_name || r.specialization}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(['present', 'absent', 'late', 'leave'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, [id]: st }))}
                          className={`px-3 py-1 text-xs font-medium rounded-md border capitalize transition-colors ${
                            current === st
                              ? st === 'present'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : st === 'absent'
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-amber-600 text-white border-amber-600'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
