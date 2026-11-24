import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, Layers, ClipboardCheck, Wallet, Clock, TrendingUp,
  UserPlus, CreditCard, Bell, ArrowUpRight, BookOpen, Calendar, Award, UserCircle, MessageCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatProgramLabel } from '../lib/domain';
import { MonthlyFeeBarChart, EnrollmentBarList } from '../components/Charts';
import { ImageWithFallback, StatusLabel } from '../components/UiPrimitives';

export function StatBox({
  label,
  value,
  subtext,
  icon: Icon,
  tone = 'navy',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'navy' | 'emerald' | 'amber' | 'blue';
}) {
  const toneClasses =
    tone === 'emerald'
      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
      : tone === 'amber'
        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
        : tone === 'blue'
          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
          : 'bg-slate-100 dark:bg-slate-800 text-[#0F2942] dark:text-slate-200';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors rounded-xl p-5 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        {Icon && (
          <div className={`p-2 rounded-lg shrink-0 ${toneClasses}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">
        {value}
      </div>
      {subtext && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtext}</div>}
    </div>
  );
}

export function DashboardView({
  role,
  onNavigate,
}: {
  role: 'admin' | 'teacher' | 'student';
  onNavigate: (tab: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest('/api/dashboard')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [role]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  if (role === 'admin') {
    const t = data.totals;
    const attPct = t.todayTotalAttendance > 0 ? Math.round((t.todayPresent / t.todayTotalAttendance) * 100) : 0;

    return (
      <div className="space-y-6">
        {/* Quick Actions Strip */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              SindhTech Institute Operations Overview
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Classes 6th–12th, Nursery–5 Foundation batches &amp; professional certification cohorts
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('students')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-medium whitespace-nowrap transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Admit Student
            </button>
            <button
              type="button"
              onClick={() => onNavigate('fees')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium whitespace-nowrap transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Collect Fee
            </button>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium whitespace-nowrap transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Attendance
            </button>
            <button
              type="button"
              onClick={() => onNavigate('notices')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium whitespace-nowrap transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              Publish Notice
            </button>
          </div>
        </div>

        {/* 5th-Date Fee WhatsApp Reminder Alert (when students have overdue balances) */}
        {Number(t.overdueWaRemindersPending || 0) > 0 && (
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <span className="font-semibold text-amber-950 dark:text-amber-200">
                  {t.overdueWaRemindersPending} student fee reminder(s) past the 5th-of-month due date
                </span>
                <p className="text-amber-800/90 dark:text-amber-300/80 mt-0.5">
                  Personalized WhatsApp fee messages are ready with each student&apos;s name &amp; remaining balance.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('fees')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Open WhatsApp Reminders
            </button>
          </div>
        )}

        {/* Primary KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBox
            label="Total Students"
            value={t.totalStudents}
            subtext={`${t.activeStudents} active enrolled`}
            icon={Users}
            tone="navy"
          />
          <StatBox
            label="Total Teachers"
            value={t.totalTeachers}
            subtext={`${t.activeTeachers} active faculty`}
            icon={UserCheck}
            tone="blue"
          />
          <StatBox
            label="Classes & Courses"
            value={`${t.totalClasses} / ${t.totalCourses}`}
            subtext="Academy batches · Professional courses"
            icon={Layers}
            tone="amber"
          />
          <StatBox
            label="Today's Attendance"
            value={`${attPct}%`}
            subtext={`${t.todayPresent} of ${t.todayTotalAttendance} marked present`}
            icon={ClipboardCheck}
            tone="emerald"
          />
        </div>

        {/* Financial KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatBox
            label="Total Fees Collected"
            value={`PKR ${Number(t.totalFeesCollected).toLocaleString()}`}
            subtext="Cumulative verified receipts"
            icon={Wallet}
            tone="emerald"
          />
          <StatBox
            label="Pending Fees Receivable"
            value={`PKR ${Number(t.pendingFees).toLocaleString()}`}
            subtext="Unpaid & partial challan balances"
            icon={Clock}
            tone="amber"
          />
          <StatBox
            label="Current Month Income"
            value={`PKR ${Number(t.monthlyIncome).toLocaleString()}`}
            subtext="Collected in current calendar month"
            icon={TrendingUp}
            tone="blue"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Monthly Fee Collection
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verified tuition and course fee receipts across months
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('fees')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Open Fee Ledger
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <MonthlyFeeBarChart data={data.monthlyFeeChart || []} />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Enrollment Distribution
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Students by school class &amp; course
                </p>
              </div>
            </div>
            <EnrollmentBarList data={data.enrollmentByGroup || []} />
          </div>
        </div>

        {/* Recent Admissions & Recent Payments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">Recent Admissions</h2>
              <button
                type="button"
                onClick={() => onNavigate('students')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                View All Students
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Student ID</th>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Program</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(data.recentAdmissions || []).map((st: any) => (
                    <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono-tabular text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {st.student_code}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{st.full_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{st.enrolled_in || '—'}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-xs text-slate-500 whitespace-nowrap">{st.admission_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">Recent Payments</h2>
              <button
                type="button"
                onClick={() => onNavigate('fees')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Manage Fees
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Receipt #</th>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(data.recentPayments || []).map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono-tabular text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {p.receipt_number}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {p.full_name}
                        <span className="ml-1.5 text-xs text-slate-400 font-mono-tabular">{p.student_code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-tabular font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        PKR {Number(p.amount_paid).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-mono-tabular text-xs text-slate-500 whitespace-nowrap">{p.payment_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'teacher') {
    const t = data.totals;
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-4 min-w-0">
            <ImageWithFallback
              src={data.teacher?.avatar_url || data.teacher?.profile_picture}
              alt={data.teacher?.full_name || 'Teacher'}
              fallbackText={data.teacher?.full_name || 'T'}
              className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 text-sm shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                Welcome, {data.teacher?.full_name}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">{data.teacher?.teacher_code}</span> · {data.teacher?.specialization} · Hours: {data.teacher?.working_hours}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-medium whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Mark Attendance
            </button>
            <button
              type="button"
              onClick={() => onNavigate('exams')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 text-xs font-medium whitespace-nowrap"
            >
              <Award className="w-3.5 h-3.5" />
              Enter Marks
            </button>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 text-xs font-medium whitespace-nowrap"
            >
              <UserCircle className="w-3.5 h-3.5" />
              Edit Profile
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBox label="Assigned Students" value={t.assignedStudents} icon={Users} tone="navy" />
          <StatBox label="Assigned Classes" value={t.assignedClassesCount} icon={Layers} tone="blue" />
          <StatBox label="Assigned Courses" value={t.assignedCoursesCount} icon={BookOpen} tone="amber" />
          <StatBox label="Active Assignments" value={t.pendingAssignmentsCount} icon={Calendar} tone="emerald" />
        </div>

        {/* Assigned Classes & Courses Overview */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              My Assigned Academy Classes &amp; Courses
            </h3>
            <button type="button" onClick={() => onNavigate('students')} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
              View Assigned Students
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {(data.assignedClasses || []).length === 0 && (data.assignedCourses || []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No academy classes or courses assigned yet. Contact Admin Wajid Ali Kolachi to assign cohorts.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(data.assignedClasses || []).map((c: any) => (
                <div key={`cls-${c.id}`} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Academy Class</div>
                  <div className="font-display font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{c.class_name}</div>
                  <div className="text-xs text-slate-500 font-mono-tabular mt-1">{c.class_timing} · {c.student_count || 0} students</div>
                </div>
              ))}
              {(data.assignedCourses || []).map((crs: any) => (
                <div key={`crs-${crs.id}`} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Professional Course</div>
                  <div className="font-display font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">{crs.course_name}</div>
                  <div className="text-xs text-slate-500 font-mono-tabular mt-1">{crs.class_timing} · {crs.enrolled_count || 0} enrolled</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">Today&apos;s Scheduled Classes</h3>
              <button type="button" onClick={() => onNavigate('timetable')} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
                Full Timetable
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {(data.todaysClasses || []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No timetable sessions scheduled for today.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.todaysClasses.map((slot: any) => (
                  <div key={slot.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {slot.class_name || slot.course_name} {slot.subject_name ? `· ${slot.subject_name}` : ''}
                      </div>
                      <div className="text-xs text-slate-500">{slot.room || 'Campus Classroom'}</div>
                    </div>
                    <div className="font-mono-tabular text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {slot.start_time} – {slot.end_time}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">Recent Institute Notices</h3>
              <button type="button" onClick={() => onNavigate('notices')} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
                All Notices
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {(data.recentNotices || []).map((n: any) => (
                <div key={n.id} className="py-3">
                  <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{n.title}</div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{n.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Student Dashboard
  const st = data.student;
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-4 min-w-0">
          <ImageWithFallback
            src={st?.avatar_url || st?.profile_picture}
            alt={st?.full_name || 'Student'}
            fallbackText={st?.full_name || 'S'}
            className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 text-sm shrink-0"
          />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
              Welcome, {st?.full_name}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              ID: <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">{st?.student_code}</span> · Login:{' '}
              <span className="font-mono-tabular">{st?.username}</span> ·{' '}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formatProgramLabel(st?.class_name, st?.course_name, st?.education_category)}
              </span>
              {st?.section_name ? ` (${st.section_name})` : ''}
              {st?.assigned_teacher_name ? ` · Mentor: ${st.assigned_teacher_name}` : ''}
            </p>
            {Array.isArray(st?.selected_subject_names) && st.selected_subject_names.length > 0 && (
              <p className="mt-1.5 text-xs text-blue-700 dark:text-blue-400 font-medium">
                Enrolled Subjects ({st.selected_subject_names.length}): {st.selected_subject_names.join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('fees')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-medium whitespace-nowrap"
          >
            <Wallet className="w-3.5 h-3.5" />
            Fees &amp; Receipts
          </button>
          <button
            type="button"
            onClick={() => onNavigate('assignments')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 text-xs font-medium whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Assignments
          </button>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 text-xs font-medium whitespace-nowrap"
          >
            <UserCircle className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox
          label="Attendance Rate"
          value={`${data.attendancePercentage}%`}
          subtext={`${data.attendanceTotal} recorded sessions`}
          icon={ClipboardCheck}
          tone="emerald"
        />
        <StatBox
          label="Total Billed Fees"
          value={`PKR ${Number(data.feeSummary?.total_fees || 0).toLocaleString()}`}
          icon={Wallet}
          tone="navy"
        />
        <StatBox
          label="Paid Fees"
          value={`PKR ${Number(data.feeSummary?.paid_fees || 0).toLocaleString()}`}
          icon={TrendingUp}
          tone="blue"
        />
        <StatBox
          label="Pending Balance"
          value={`PKR ${Number(data.feeSummary?.pending_fees || 0).toLocaleString()}`}
          icon={Clock}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">My Fee Challans</h3>
            <button type="button" onClick={() => onNavigate('fees')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
              View All
            </button>
          </div>
          {(data.recentFees || []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No fee challans generated yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.recentFees.map((f: any) => (
                <div key={f.id} className="py-2.5 flex items-center justify-between text-xs gap-2">
                  <div>
                    <div className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">{f.challan_number}</div>
                    <div className="text-slate-500 capitalize">{f.fee_type} · Due {f.due_date}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                      PKR {Number(f.net_amount).toLocaleString()}
                    </div>
                    <StatusLabel status={f.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">Latest Published Results</h3>
            <button type="button" onClick={() => onNavigate('exams')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
              View Result Cards
            </button>
          </div>
          {(data.latestResults || []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No published examination results available yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.latestResults.map((m: any) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{m.subject_name}</div>
                    <div className="text-xs text-slate-500">{m.exam_name}</div>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {m.obtained_marks}/{m.total_marks} ({m.grade})
                    </div>
                    <div className="text-xs text-slate-500">{m.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">Schedule &amp; Notices</h3>
            <button type="button" onClick={() => onNavigate('notices')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
              All Notices
            </button>
          </div>
          <div className="space-y-3">
            {(data.upcomingClasses || []).slice(0, 3).map((slot: any) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
                  {slot.day_of_week} · {slot.subject_name || 'Class Session'}
                </span>
                <span className="font-mono-tabular text-xs text-slate-500 shrink-0 whitespace-nowrap">
                  {slot.start_time}–{slot.end_time}
                </span>
              </div>
            ))}
            {(data.recentNotices || []).slice(0, 2).map((n: any) => (
              <div key={n.id} className="pt-1">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{n.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
