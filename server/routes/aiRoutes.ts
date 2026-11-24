import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { db } from '../db';
import { type AuthedRequest, requireAuth, verifyCsrf } from '../auth';

export const aiRouter = Router();

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

function buildRoleScopedContext(userId: number, role: 'admin' | 'teacher' | 'student') {
  const settingsRows = db.prepare(`SELECT setting_key, setting_value FROM system_settings`).all() as Array<{
    setting_key: string;
    setting_value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const row of settingsRows) settings[row.setting_key] = row.setting_value;

  const activeSession = db.prepare(`SELECT session_name, start_date, end_date FROM academic_sessions WHERE is_active = 1 LIMIT 1`).get() as any;

  const classes = db
    .prepare(
      `SELECT c.class_name, c.class_code, c.class_timing, c.monthly_fee, t.full_name as teacher_name,
              (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.deleted_at IS NULL AND s.status = 'active') as enrolled
       FROM classes c
       LEFT JOIN teachers t ON c.class_teacher_id = t.id
       WHERE c.deleted_at IS NULL AND c.status = 'active'
       ORDER BY c.level_order ASC`,
    )
    .all() as any[];

  const courses = db
    .prepare(
      `SELECT crs.course_name, crs.course_code, crs.duration, crs.course_fee, crs.class_timing, crs.admission_status, crs.description,
              t.full_name as teacher_name,
              (SELECT COUNT(*) FROM students s WHERE s.course_id = crs.id AND s.deleted_at IS NULL AND s.status = 'active') as enrolled
       FROM courses crs
       LEFT JOIN teachers t ON crs.teacher_id = t.id
       WHERE crs.deleted_at IS NULL AND crs.status = 'active'
       ORDER BY crs.id DESC`,
    )
    .all() as any[];

  const userRow = db.prepare(`SELECT id, username, full_name, email, role FROM users WHERE id = ?`).get(userId) as any;

  let personalContext: any = {
    caller: {
      fullName: userRow?.full_name || 'User',
      username: userRow?.username || '',
      email: userRow?.email || '',
      role,
    },
  };

  if (role === 'student') {
    const student = db
      .prepare(
        `SELECT s.id, s.student_code, s.full_name, s.father_name, s.education_category, s.phone, s.guardian_phone,
                s.admission_date, s.monthly_fee, s.status,
                c.class_name, sec.section_name, crs.course_name, t.full_name as assigned_teacher
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         LEFT JOIN sections sec ON s.section_id = sec.id
         LEFT JOIN courses crs ON s.course_id = crs.id
         LEFT JOIN teachers t ON s.assigned_teacher_id = t.id
         WHERE s.user_id = ? AND s.deleted_at IS NULL`,
      )
      .get(userId) as any;

    if (student) {
      const selectedSubjects = db
        .prepare(
          `SELECT sub.subject_name, sub.subject_code
           FROM student_subjects ss
           JOIN subjects sub ON ss.subject_id = sub.id
           WHERE ss.student_id = ?
           ORDER BY sub.subject_name ASC`,
        )
        .all(student.id) as Array<{ subject_name: string; subject_code: string }>;

      const feeRows = db
        .prepare(
          `SELECT challan_number, fee_type, fee_month, net_amount, paid_amount, remaining_amount, due_date, status
           FROM fees WHERE student_id = ? ORDER BY id DESC LIMIT 6`,
        )
        .all(student.id);

      const attRows = db
        .prepare(`SELECT status FROM attendance WHERE attendee_type = 'student' AND student_id = ?`)
        .all(student.id) as any[];
      const presentCount = attRows.filter((a) => a.status === 'present' || a.status === 'late').length;

      const timetable = db
        .prepare(
          `SELECT tt.day_of_week, tt.start_time, tt.end_time, tt.room, t.full_name as teacher_name, sub.subject_name
           FROM timetables tt
           LEFT JOIN teachers t ON tt.teacher_id = t.id
           LEFT JOIN subjects sub ON tt.subject_id = sub.id
           WHERE (tt.class_id = (SELECT class_id FROM students WHERE id = ?) AND (SELECT class_id FROM students WHERE id = ?) IS NOT NULL
                  AND (NOT EXISTS (SELECT 1 FROM student_subjects WHERE student_id = ?) OR tt.subject_id IS NULL OR tt.subject_id IN (SELECT subject_id FROM student_subjects WHERE student_id = ?)))
              OR (tt.course_id = (SELECT course_id FROM students WHERE id = ?) AND (SELECT course_id FROM students WHERE id = ?) IS NOT NULL)
           ORDER BY tt.start_time LIMIT 10`,
        )
        .all(student.id, student.id, student.id, student.id, student.id, student.id);

      const assignments = db
        .prepare(
          `SELECT a.title, a.due_date, a.status,
                  (SELECT sub.status FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.student_id = ?) as my_submission_status,
                  (SELECT sub.grade_score FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.student_id = ?) as my_score
           FROM assignments a
           WHERE (a.class_id = (SELECT class_id FROM students WHERE id = ?) AND (SELECT class_id FROM students WHERE id = ?) IS NOT NULL)
              OR (a.course_id = (SELECT course_id FROM students WHERE id = ?) AND (SELECT course_id FROM students WHERE id = ?) IS NOT NULL)
           ORDER BY a.due_date DESC LIMIT 8`,
        )
        .all(student.id, student.id, student.id, student.id, student.id, student.id);

      const marks = db
        .prepare(
          `SELECT e.exam_name, e.exam_date, m.subject_name, m.obtained_marks, m.total_marks, m.percentage, m.grade
           FROM marks m
           JOIN exams e ON m.exam_id = e.id
           WHERE m.student_id = ? AND e.is_published = 1
           ORDER BY e.exam_date DESC LIMIT 10`,
        )
        .all(student.id);

      const notices = db
        .prepare(
          `SELECT title, content, priority, created_at FROM notices
           WHERE target_audience IN ('all', 'students')
           ORDER BY id DESC LIMIT 5`,
        )
        .all();

      personalContext = {
        ...personalContext,
        studentRecord: {
          ...student,
          selectedSubjectsCount: selectedSubjects.length,
          selectedSubjects: selectedSubjects.map((x) => `${x.subject_name} (${x.subject_code})`),
        },
        attendanceSummary: {
          totalSessions: attRows.length,
          attendedSessions: presentCount,
          attendanceRate: attRows.length > 0 ? `${Math.round((presentCount / attRows.length) * 100)}%` : '100% (no absences logged)',
        },
        feeChallans: feeRows,
        timetable,
        assignments,
        publishedResults: marks,
        notices,
      };
    }
  } else if (role === 'teacher') {
    const teacher = db
      .prepare(
        `SELECT id, teacher_code, full_name, phone, email, qualification, specialization, working_hours, status
         FROM teachers WHERE user_id = ? AND deleted_at IS NULL`,
      )
      .get(userId) as any;

    if (teacher) {
      const assignedStudentsCount = (
        db
          .prepare(
            `SELECT COUNT(DISTINCT s.id) as c FROM students s
             LEFT JOIN classes c ON s.class_id = c.id
             LEFT JOIN courses crs ON s.course_id = crs.id
             WHERE s.deleted_at IS NULL AND (s.assigned_teacher_id = ? OR c.class_teacher_id = ? OR crs.teacher_id = ?)`,
          )
          .get(teacher.id, teacher.id, teacher.id) as any
      ).c;

      const mySchedule = db
        .prepare(
          `SELECT tt.day_of_week, tt.start_time, tt.end_time, tt.room, c.class_name, crs.course_name, sub.subject_name
           FROM timetables tt
           LEFT JOIN classes c ON tt.class_id = c.id
           LEFT JOIN courses crs ON tt.course_id = crs.id
           LEFT JOIN subjects sub ON tt.subject_id = sub.id
           WHERE tt.teacher_id = ?
           ORDER BY tt.start_time LIMIT 12`,
        )
        .all(teacher.id);

      const myAssignments = db
        .prepare(
          `SELECT a.title, a.due_date, a.status, c.class_name, crs.course_name,
                  (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.status = 'submitted') as pending_reviews
           FROM assignments a
           LEFT JOIN classes c ON a.class_id = c.id
           LEFT JOIN courses crs ON a.course_id = crs.id
           WHERE a.teacher_id = ?
           ORDER BY a.id DESC LIMIT 8`,
        )
        .all(teacher.id);

      const notices = db
        .prepare(`SELECT title, content, priority, created_at FROM notices WHERE target_audience IN ('all', 'teachers') ORDER BY id DESC LIMIT 5`)
        .all();

      personalContext = {
        ...personalContext,
        teacherRecord: teacher,
        assignedStudentsCount,
        mySchedule,
        myAssignments,
        notices,
      };
    }
  } else if (role === 'admin') {
    const today = new Date().toISOString().slice(0, 10);
    const kpis = {
      activeStudents: (db.prepare(`SELECT COUNT(*) as c FROM students WHERE deleted_at IS NULL AND status = 'active'`).get() as any).c,
      activeTeachers: (db.prepare(`SELECT COUNT(*) as c FROM teachers WHERE deleted_at IS NULL AND status = 'active'`).get() as any).c,
      totalClasses: classes.length,
      totalCourses: courses.length,
      totalFeesCollectedPKR: (db.prepare(`SELECT COALESCE(SUM(amount_paid), 0) as s FROM fee_payments`).get() as any).s,
      pendingFeesPKR: (db.prepare(`SELECT COALESCE(SUM(remaining_amount), 0) as s FROM fees WHERE status IN ('pending', 'partial', 'overdue')`).get() as any).s,
      pendingLeaveRequests: (db.prepare(`SELECT COUNT(*) as c FROM leave_requests WHERE status = 'pending'`).get() as any).c,
      pendingCredentialsToSend: (db.prepare(`SELECT COUNT(*) as c FROM credential_ledger WHERE sent_status = 'pending'`).get() as any).c,
      todayAttendanceMarked: (db.prepare(`SELECT COUNT(*) as c FROM attendance WHERE attendance_date = ?`).get(today) as any).c,
    };
    const recentNotices = db.prepare(`SELECT title, content, priority, created_at FROM notices ORDER BY id DESC LIMIT 5`).all();
    personalContext = {
      ...personalContext,
      adminOverview: kpis,
      recentNotices,
    };
  }

  return {
    institute: {
      name: settings.institute_name || 'SindhTech Institute',
      type: 'Academy & Professional Training Center in Pakistan (NOT a regular school)',
      administratorName: 'Wajid Ali Kolachi',
      tagline: settings.institute_tagline || 'Academy & Professional Training Center — Pakistan',
      address: settings.institute_address || 'Block 6, PECHS, Shahrah-e-Faisal, Karachi, Pakistan',
      phone: settings.institute_phone || '+92 300 2458910',
      email: settings.institute_email || 'info@sindhtech.edu.pk',
      currency: settings.currency_symbol || 'PKR',
      activeSession: activeSession?.session_name || '2026-2027',
    },
    academyClasses: classes,
    professionalCourses: courses,
    portalModulesGuide: {
      adminModules: [
        'Dashboard (live analytics, quick actions, monthly fee collection chart)',
        'Students (add/edit/search/promote students, export directory Excel, generate Student ID card)',
        'Teachers & Payroll (add/edit teachers, assign classes & courses, salary vouchers)',
        'Credentials Sheet (auto-saved table of all Student & Teacher Login IDs and Passwords, 1-click Copy WhatsApp/SMS message, Mark Sent/Pending, Download .xlsx Excel sheet)',
        'Academy Classes (Nursery to Class 12 — full Classes 6th–12th Science, ICS, Pre-Medical, Pre-Engineering & General tracks, sections, timings, monthly fees)',
        'Courses (Video Editing and other professional skill courses with fees & timings)',
        'Fees & Payments (challans, record payments, PDF fee challan & receipt)',
        'Timetable, Attendance, Exams & Results, Assignments, Notices, Reports (.xlsx/.pdf), Settings & Backups, My Profile (edit personal details & password), AI Agent',
      ],
      teacherModules: [
        'Dashboard (assigned students, today schedule, pending assignment reviews)',
        'Assigned Students, Mark Attendance, Assignments (create & grade submissions), Exams & Marks (enter & publish grades), My Timetable, Notices, Profile & Leave (edit profile details, upload picture, change password, apply for leave), AI Agent',
      ],
      studentModules: [
        'Dashboard (attendance %, fee summary, upcoming classes, published results)',
        'My Attendance, Fees & Receipts (download PDF challan/receipt), Timetable, Assignments (submit homework), Exams & Results (download PDF result card), Courses Catalog, Notices, Profile & Leave (edit name/email/phone/address/picture, change password, apply for leave), AI Agent',
      ],
    },
    ...personalContext,
  };
}

function buildSmartFallbackReply(message: string, ctx: ReturnType<typeof buildRoleScopedContext>): string {
  const lower = message.toLowerCase();
  const hasArabicScript = /[\u0600-\u06FF]/.test(message);
  const isRomanUrdu =
    /\b(kya|kaise|kese|kitna|kitni|batao|btana|btao|hai|hain|mera|meri|mere|aap|apna|kaun|kon|kahan|kab|fees|fee|chahiye|karna|karein|salam|assalam|bhai|yaar|sir|madam|course|courses|timing|timings|admin|profile|password|hazri|attendance|timetable|result|marks|excel)\b/i.test(
      lower,
    );

  const courseList = ctx.professionalCourses
    .map((c: any) => `${c.course_name} (${c.duration}, PKR ${c.course_fee}, ${c.class_timing})`)
    .join('; ');
  const classList = ctx.academyClasses
    .map((c: any) => `${c.class_name} (${c.class_timing}, PKR ${c.monthly_fee}/mo)`)
    .join('; ');

  const personalLines: string[] = [];
  if (ctx.caller.role === 'student' && (ctx as any).studentRecord) {
    const st = (ctx as any).studentRecord;
    const att = (ctx as any).attendanceSummary;
    const challans = (ctx as any).feeChallans || [];
    const pendingSum = challans.reduce((acc: number, f: any) => acc + Number(f.remaining_amount || 0), 0);
    const prog = st.class_name && st.course_name ? `${st.class_name} + ${st.course_name}` : st.class_name || st.course_name || 'Academy';
    const subList = Array.isArray(st.selectedSubjects) && st.selectedSubjects.length > 0 ? st.selectedSubjects.join(', ') : '';
    if (hasArabicScript) {
      personalLines.push(`• آپ کا پروگرام: ${prog} (${st.student_code})`);
      if (subList) personalLines.push(`• منتخب مضامین (${st.selectedSubjectsCount}): ${subList}`);
      personalLines.push(`• حاضری کی شرح: ${att.attendanceRate} (${att.attendedSessions}/${att.totalSessions} سیشنز)`);
      personalLines.push(`• بقایا فیس: PKR ${pendingSum.toLocaleString()}`);
    } else if (isRomanUrdu) {
      personalLines.push(`• Aapka Program: ${prog} (${st.student_code})`);
      if (subList) personalLines.push(`• Selected Subjects (${st.selectedSubjectsCount}): ${subList}`);
      personalLines.push(`• Attendance Rate: ${att.attendanceRate} (${att.attendedSessions}/${att.totalSessions} sessions)`);
      personalLines.push(`• Pending Fee Balance: PKR ${pendingSum.toLocaleString()}`);
    } else {
      personalLines.push(`• Your Program: ${prog} (${st.student_code})`);
      if (subList) personalLines.push(`• Selected Subjects (${st.selectedSubjectsCount}): ${subList}`);
      personalLines.push(`• Attendance Rate: ${att.attendanceRate} (${att.attendedSessions}/${att.totalSessions} sessions)`);
      personalLines.push(`• Pending Fee Balance: PKR ${pendingSum.toLocaleString()}`);
    }
  } else if (ctx.caller.role === 'teacher' && (ctx as any).teacherRecord) {
    const tr = (ctx as any).teacherRecord;
    personalLines.push(
      hasArabicScript
        ? `• استاد: ${tr.full_name} (${tr.teacher_code}) — تفویض شدہ طلباء: ${(ctx as any).assignedStudentsCount || 0}`
        : `• Teacher: ${tr.full_name} (${tr.teacher_code}) — Assigned Students: ${(ctx as any).assignedStudentsCount || 0} · Hours: ${tr.working_hours}`,
    );
  } else if (ctx.caller.role === 'admin' && (ctx as any).adminOverview) {
    const k = (ctx as any).adminOverview;
    personalLines.push(
      hasArabicScript
        ? `• فعال طلباء: ${k.activeStudents} | اساتذہ: ${k.activeTeachers} | زیر التواء لاگ ان کارڈز: ${k.pendingCredentialsToSend}`
        : `• Active Students: ${k.activeStudents} | Teachers: ${k.activeTeachers} | Collected Fees: PKR ${Number(k.totalFeesCollectedPKR).toLocaleString()} | Pending Credentials: ${k.pendingCredentialsToSend}`,
    );
  }

  const personalBlock = personalLines.length > 0 ? `\n\n${personalLines.join('\n')}` : '';

  if (hasArabicScript) {
    return `وعلیکم السلام / خوش آمدید! میں SindhTech Institute (پاکستان کا اکیڈمی اور پروفیشنل ٹریننگ سینٹر) کا AI اسسٹنٹ ہوں۔ اس اکیڈمی کے ایڈمن واجد علی کولاچی (Wajid Ali Kolachi) ہیں۔${personalBlock}\n\n• پروفیشنل کورسز: ${courseList || 'Video Editing وغیرہ'}\n• اکیڈمی کلاسز: ${classList}\n• پتہ: ${ctx.institute.address} | فون: ${ctx.institute.phone}\n\nآپ اپنا پروفائل "My Profile / Profile & Leave" سیکشن سے تبدیل کر سکتے ہیں، اور کوئی بھی سوال پوچھ سکتے ہیں۔`;
  }

  if (isRomanUrdu) {
    return `Assalam-o-Alaikum! Main SindhTech Institute (Pakistan ka Academy & Professional Training Center) ka AI Agent hoon. Is academy ke Admin Wajid Ali Kolachi hain.${personalBlock}\n\n• Professional Courses: ${courseList || 'Video Editing & Technical Courses'}\n• Foundation Academy Classes: ${classList}\n• Contact: ${ctx.institute.phone} | ${ctx.institute.address}\n\nAap apni profile ("My Profile" / "Profile & Leave" se), timetable, fees, attendance ya kisi bhi feature ke bare mein pooch sakte hain!`;
  }

  return `Welcome to ${ctx.institute.name} — an Academy & Professional Training Center in Pakistan managed by Admin ${ctx.institute.administratorName}.${personalBlock}\n\n• Professional Courses: ${courseList || 'Video Editing & IT Courses'}\n• Academy Classes: ${classList}\n• Contact: ${ctx.institute.phone} | ${ctx.institute.address}\n\nAsk me anything about courses, timings, fees, attendance, profile editing, or how to use the portal in any language!`;
}

aiRouter.post('/ai/chat', requireAuth, verifyCsrf, async (req: AuthedRequest, res) => {
  const { message, history = [] } = req.body || {};
  const trimmedMessage = String(message || '').trim();
  if (!trimmedMessage) {
    return res.status(400).json({ error: 'Please enter a message or question.' });
  }
  if (trimmedMessage.length > 4000) {
    return res.status(400).json({ error: 'Message is too long. Please keep questions under 4,000 characters.' });
  }

  const userId = req.session!.userId;
  const role = req.session!.role;
  const contextData = buildRoleScopedContext(userId, role);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return res.json({
      reply: buildSmartFallbackReply(trimmedMessage, contextData),
      fallback: true,
    });
  }

  const systemInstruction = `You are the official AI Agent of SindhTech Institute, a premier Academy & Professional Training Center in Pakistan (NEVER refer to SindhTech Institute as a regular "school" — it is an academy & training center).
The Administrator / Director of SindhTech Institute is Wajid Ali Kolachi.

CRITICAL MULTILINGUAL RULE (HIGHEST PRIORITY):
- Carefully detect the exact language AND script used in the user's latest message.
- You MUST reply in the EXACT SAME language and script as the user's message:
  * If the user writes in Roman Urdu (Urdu words written in Latin letters like "ya kaise hoga", "mujhe courses batao", "meri fee kitni hai"), reply naturally in Roman Urdu.
  * If the user writes in Urdu script (اردو), reply in Urdu script.
  * If the user writes in Sindhi (سنڌي or Roman Sindhi), reply in Sindhi matching their script.
  * If the user writes in English, reply in English.
  * If the user writes in Punjabi, Pashto, Balochi, Saraiki, Arabic, Hindi, or any other language, reply fluently in that exact language.
- Keep responses accurate, warm, well-structured, and concise. Use plain text and clean bullet points (• or -) without noisy markdown formatting clutter.

KNOWLEDGE & SECURITY RULES:
- Use ONLY the live verified Academy & Portal Context JSON provided below when answering factual questions about fees, classes, courses, timings, attendance, assignments, exams, notices, or portal features.
- Respect role privacy: you only have the caller's own scoped context (${role.toUpperCase()}). Never invent data or guess missing records.
- If a student or teacher asks how to edit their profile, explain they can click "Profile & Leave" (or "My Profile" for Admin) to edit their Full Name, Email, Phone, Address, Profile Picture, and Password.
- If asked about login IDs, explain that roles are automatically detected by ID prefix: STUDENTIDSTI... for students, TEACHERID... for teachers, and ADMINID01 (or admin@sindhtech.edu.pk) for Admin.
- SindhTech Institute offers Academy Classes from Nursery through Class 12 (with complete Classes 6th–12th coverage including Matric Class 9–10 and Intermediate Class 11–12 Pre-Medical, Pre-Engineering, and ICS Computer Science) as well as Professional Courses like Video Editing and Web Development.
- When Admin admits or edits an Academy Class student (or Dual Program student), the form explicitly prompts how many and which exact subjects from that class the student wants to study (selectedSubjects). Their timetable and profile reflect those selected subjects.
- If asked about taking both an Academy Class (e.g., Class 8 or Class 10) and a Professional Course (e.g., Video Editing) together, explain that Admin can select "Dual Program (Academy Class + Professional Course)" when adding or editing the student, which links both schedules, selected class subjects, assignments, and combined monthly fees to one student account.
- If asked about 5th-date fee notifications, explain that any student who does not clear fees by the 5th of the month automatically triggers an in-app notification and a personalized WhatsApp reminder queued in Fees & Payments -> WhatsApp Reminders (with instant WhatsApp Web / Cloud API dispatch).
- If the Admin asks about student/teacher login IDs & passwords, explain the "Credentials Sheet" section where every newly created or reset Student/Teacher Login ID and password is saved automatically, with 1-click WhatsApp send, Copy message, Sent/Pending tracking, and Excel (.xlsx) export.

LIVE VERIFIED ACADEMY & USER CONTEXT (JSON):
${JSON.stringify(contextData)}`;

  const recentHistory = Array.isArray(history)
    ? history
        .slice(-8)
        .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim())
        .map((h: ChatTurn) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text.slice(0, 2000) }],
        }))
    : [];

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout after 15s')), 15_000),
    );

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          ...recentHistory,
          {
            role: 'user',
            parts: [{ text: trimmedMessage }],
          },
        ],
        config: {
          systemInstruction,
        },
      }),
      timeoutPromise,
    ]);

    const reply = response.text?.trim();
    if (!reply) {
      return res.json({
        reply: buildSmartFallbackReply(trimmedMessage, contextData),
        fallback: true,
      });
    }

    res.json({ reply, fallback: false });
  } catch (err: any) {
    console.error('[SindhTech AI Agent Error]', err?.message || err);
    res.json({
      reply: buildSmartFallbackReply(trimmedMessage, contextData),
      fallback: true,
    });
  }
});
