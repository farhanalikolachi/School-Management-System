import crypto from 'node:crypto';
import { Router } from 'express';
import * as XLSX from 'xlsx';
import { db, logActivity, createNotification } from '../db';
import {
  type AuthedRequest,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  extractAuthToken,
  destroySession,
  updateSessionPasswordChanged,
  requireAuth,
  requireRole,
  verifyCsrf,
  storeOneTimeCredential,
  consumeOneTimeCredential,
} from '../auth';
import {
  formatStudentCode,
  formatStudentUsername,
  formatTeacherCode,
  formatTeacherUsername,
  detectRoleFromIdentifier,
  formatProgramLabel,
  validateStudentSubjects,
  generateTempPassword,
  validatePasswordStrength,
} from '../../src/lib/domain';

export const coreRouter = Router();

function getTeacherByUserId(userId: number) {
  return db.prepare(`
    SELECT t.*, u.username, u.avatar_url
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    WHERE t.user_id = ? AND t.deleted_at IS NULL
  `).get(userId) as any;
}

function getStudentSubjectsForIds(studentIds: number[]) {
  const map: Record<number, Array<{ id: number; subject_name: string; subject_code: string }>> = {};
  if (!studentIds.length) return map;
  const placeholders = studentIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ss.student_id, sub.id, sub.subject_name, sub.subject_code
    FROM student_subjects ss
    JOIN subjects sub ON ss.subject_id = sub.id
    WHERE ss.student_id IN (${placeholders})
    ORDER BY sub.id ASC
  `).all(...studentIds) as Array<{ student_id: number; id: number; subject_name: string; subject_code: string }>;
  for (const r of rows) {
    if (!map[r.student_id]) map[r.student_id] = [];
    map[r.student_id].push({ id: r.id, subject_name: r.subject_name, subject_code: r.subject_code });
  }
  return map;
}

function getStudentByUserId(userId: number) {
  const st = db.prepare(`
    SELECT s.*, u.username, u.avatar_url, c.class_name, sec.section_name, crs.course_name, t.full_name as assigned_teacher_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    LEFT JOIN teachers t ON s.assigned_teacher_id = t.id
    WHERE s.user_id = ? AND s.deleted_at IS NULL
  `).get(userId) as any;
  if (!st) return null;
  const subMap = getStudentSubjectsForIds([st.id]);
  const subs = subMap[st.id] || [];
  return {
    ...st,
    selected_subjects: subs,
    selected_subject_ids: subs.map((s) => s.id),
    selected_subject_names: subs.map((s) => s.subject_name),
  };
}

function findActiveUserByIdentifier(identifier: string) {
  const cleanId = String(identifier || '').trim();
  const user = db.prepare(`
    SELECT DISTINCT u.*
    FROM users u
    LEFT JOIN students s ON s.user_id = u.id AND s.deleted_at IS NULL
    LEFT JOIN teachers t ON t.user_id = u.id AND t.deleted_at IS NULL
    WHERE (lower(u.username) = lower(?) OR lower(u.email) = lower(?) OR lower(s.student_code) = lower(?) OR lower(t.teacher_code) = lower(?))
      AND u.deleted_at IS NULL
  `).get(cleanId, cleanId, cleanId, cleanId) as any;

  if (!user && (cleanId.toLowerCase() === 'admin@sindhtech.edu.pk' || cleanId.toLowerCase() === 'admin')) {
    return db.prepare(`SELECT * FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`).get() as any;
  }
  return user;
}

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

coreRouter.post('/auth/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  const user = findActiveUserByIdentifier(String(identifier));

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. Please verify your Login ID / email and password.' });
  }

  const detectedRole = detectRoleFromIdentifier(String(identifier));
  if (detectedRole && detectedRole !== user.role) {
    return res.status(403).json({
      error: `Account role mismatch. Please sign in with your ${user.role.toUpperCase()} Login ID.`,
    });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Your account has been deactivated. Contact SindhTech administration.' });
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please wait a few minutes and try again.' });
  }

  if (!verifyPassword(String(password), user.password_hash)) {
    const attempts = (user.failed_attempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    db.prepare(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`).run(attempts, lockUntil, user.id);
    return res.status(401).json({ error: 'Invalid credentials. Please verify your username/email and password.' });
  }

  db.prepare(`UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`).run(user.id);

  const session = createSession({
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    must_change_password: user.must_change_password,
  });

  logActivity(user.id, 'LOGIN', 'user', user.id, `${user.role.toUpperCase()} logged into portal.`, req.ip);

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('sti_session', session.token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      mustChangePassword: Boolean(user.must_change_password),
    },
    sessionToken: session.token,
    csrfToken: session.csrfToken,
  });
});

coreRouter.post('/auth/logout', (req: AuthedRequest, res) => {
  const token = extractAuthToken(req);
  const session = getSession(token);
  if (session) {
    logActivity(session.userId, 'LOGOUT', 'user', session.userId, 'User signed out.', req.ip);
    destroySession(session.token);
  }
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('sti_session', { path: '/', sameSite: isHttps ? 'none' : 'lax', secure: isHttps });
  res.json({ ok: true });
});

coreRouter.get('/auth/me', (req: AuthedRequest, res) => {
  const token = extractAuthToken(req);
  const session = getSession(token);
  if (!session) {
    return res.json({ authenticated: false, user: null });
  }
  const user = db.prepare(`SELECT id, username, email, role, full_name, avatar_url, status, must_change_password FROM users WHERE id = ?`).get(session.userId) as any;
  if (!user || user.status !== 'active') {
    return res.json({ authenticated: false, user: null });
  }
  let profile: any = null;
  if (user.role === 'teacher') profile = getTeacherByUserId(user.id);
  if (user.role === 'student') profile = getStudentByUserId(user.id);

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      mustChangePassword: Boolean(user.must_change_password),
    },
    profile,
    csrfToken: session.csrfToken,
  });
});

coreRouter.post('/auth/change-password', requireAuth, verifyCsrf, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.session!.userId) as any;
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (!verifyPassword(String(currentPassword || ''), user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const check = validatePasswordStrength(String(newPassword || ''));
  if (!check.valid) {
    return res.status(400).json({ error: check.reason });
  }

  if (String(currentPassword) === String(newPassword)) {
    return res.status(400).json({ error: 'New password must differ from current password.' });
  }

  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(String(newPassword)),
    user.id,
  );
  db.prepare(`UPDATE credential_ledger SET password_status = 'User Updated', updated_at = datetime('now') WHERE user_id = ?`).run(user.id);
  updateSessionPasswordChanged(req.session!.token);
  logActivity(user.id, 'CHANGE_PASSWORD', 'user', user.id, 'User updated account password.');
  res.json({ ok: true, message: 'Password updated successfully.' });
});

coreRouter.post('/auth/forgot-password', (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) {
    return res.status(400).json({ error: 'Please enter your username or email address.' });
  }
  const user = findActiveUserByIdentifier(String(identifier));

  if (!user) {
    return res.json({
      ok: true,
      message: 'If an active account matches that identifier, a secure reset code has been generated.',
    });
  }

  const resetToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)`).run(user.id, resetToken, expiresAt);
  logActivity(user.id, 'PASSWORD_RESET_REQUEST', 'user', user.id, 'Password reset code requested.');

  res.json({
    ok: true,
    message: 'Reset code generated. Enter the verification code below to set a new password.',
    resetCodePreview: resetToken,
  });
});

coreRouter.post('/auth/reset-password', (req, res) => {
  const { identifier, resetCode, newPassword } = req.body || {};
  if (!identifier || !resetCode || !newPassword) {
    return res.status(400).json({ error: 'Identifier, reset code, and new password are required.' });
  }
  const check = validatePasswordStrength(String(newPassword));
  if (!check.valid) return res.status(400).json({ error: check.reason });

  const user = findActiveUserByIdentifier(String(identifier));
  if (!user) return res.status(400).json({ error: 'Invalid reset request.' });

  const row = db.prepare(`
    SELECT * FROM password_resets
    WHERE user_id = ? AND reset_token = ? AND used_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(user.id, String(resetCode).trim().toUpperCase()) as any;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired reset code.' });
  }

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?`).run(
      hashPassword(String(newPassword)),
      user.id,
    );
    db.prepare(`UPDATE credential_ledger SET password_status = 'User Updated', updated_at = datetime('now') WHERE user_id = ?`).run(user.id);
    db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ ok: true, message: 'Password has been reset. You can now sign in.' });
});

coreRouter.post('/profile/update', requireAuth, verifyCsrf, (req: AuthedRequest, res) => {
  const {
    fullName,
    email,
    phone,
    address,
    fatherName,
    guardianPhone,
    dob,
    qualification,
    specialization,
    avatarDataUrl,
  } = req.body || {};
  const userId = req.session!.userId;
  const role = req.session!.role;

  if (fullName !== undefined && !String(fullName).trim()) {
    return res.status(400).json({ error: 'Full Name cannot be empty.' });
  }
  if (avatarDataUrl && !String(avatarDataUrl).startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image format. Only PNG, JPG, or WebP images are permitted.' });
  }
  if (avatarDataUrl && String(avatarDataUrl).length > 2_000_000) {
    return res.status(400).json({ error: 'Profile image exceeds 1.5 MB size limit.' });
  }

  const currentUser = db.prepare(`SELECT id, full_name, email, avatar_url FROM users WHERE id = ?`).get(userId) as any;
  if (!currentUser) return res.status(404).json({ error: 'User not found.' });

  const nextFullName = fullName !== undefined ? String(fullName).trim() : currentUser.full_name;
  const nextEmail = email !== undefined ? (String(email).trim() || null) : currentUser.email;

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE users
      SET full_name = ?,
          email = ?,
          avatar_url = CASE WHEN ? THEN ? ELSE avatar_url END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextFullName,
      nextEmail,
      avatarDataUrl !== undefined ? 1 : 0,
      avatarDataUrl || null,
      userId,
    );

    db.prepare(`UPDATE user_sessions SET full_name = ? WHERE user_id = ?`).run(nextFullName, userId);

    if (role === 'teacher') {
      db.prepare(`
        UPDATE teachers
        SET full_name = ?,
            email = ?,
            phone = COALESCE(?, phone),
            address = COALESCE(?, address),
            qualification = COALESCE(?, qualification),
            specialization = COALESCE(?, specialization),
            profile_picture = CASE WHEN ? THEN ? ELSE profile_picture END,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        nextFullName,
        nextEmail,
        phone !== undefined ? String(phone).trim() : null,
        address !== undefined ? String(address).trim() : null,
        qualification !== undefined && String(qualification).trim() ? String(qualification).trim() : null,
        specialization !== undefined && String(specialization).trim() ? String(specialization).trim() : null,
        avatarDataUrl !== undefined ? 1 : 0,
        avatarDataUrl || null,
        userId,
      );
      db.prepare(`
        UPDATE credential_ledger
        SET full_name = ?,
            email = ?,
            phone = COALESCE(?, phone),
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        nextFullName,
        nextEmail,
        phone !== undefined ? String(phone).trim() : null,
        userId,
      );
    } else if (role === 'student') {
      db.prepare(`
        UPDATE students
        SET full_name = ?,
            email = ?,
            phone = COALESCE(?, phone),
            guardian_phone = COALESCE(?, guardian_phone),
            father_name = COALESCE(?, father_name),
            dob = COALESCE(?, dob),
            address = COALESCE(?, address),
            profile_picture = CASE WHEN ? THEN ? ELSE profile_picture END,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        nextFullName,
        nextEmail,
        phone !== undefined && String(phone).trim() ? String(phone).trim() : null,
        guardianPhone !== undefined && String(guardianPhone).trim() ? String(guardianPhone).trim() : null,
        fatherName !== undefined && String(fatherName).trim() ? String(fatherName).trim() : null,
        dob !== undefined && String(dob).trim() ? String(dob).trim() : null,
        address !== undefined ? String(address).trim() : null,
        avatarDataUrl !== undefined ? 1 : 0,
        avatarDataUrl || null,
        userId,
      );
      db.prepare(`
        UPDATE credential_ledger
        SET full_name = ?,
            email = ?,
            phone = COALESCE(?, phone),
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        nextFullName,
        nextEmail,
        phone !== undefined && String(phone).trim() ? String(phone).trim() : null,
        userId,
      );
    }

    logActivity(userId, 'UPDATE_PROFILE', 'user', userId, `${nextFullName} updated their profile details.`);
    db.exec('COMMIT');
    res.json({ ok: true, fullName: nextFullName, email: nextEmail });
  } catch (e: any) {
    db.exec('ROLLBACK');
    if (String(e?.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'This email address is already registered to another user.' });
    }
    throw e;
  }
});

// ============================================================================
// DASHBOARD ANALYTICS (ROLE-SCOPED FROM DATABASE)
// ============================================================================

coreRouter.get('/dashboard', requireAuth, requireRole('admin', 'teacher', 'student'), (req: AuthedRequest, res) => {
  const role = req.session!.role;
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  if (role === 'admin') {
    const totals = {
      totalStudents: (db.prepare(`SELECT COUNT(*) as c FROM students WHERE deleted_at IS NULL`).get() as any).c,
      activeStudents: (db.prepare(`SELECT COUNT(*) as c FROM students WHERE deleted_at IS NULL AND status = 'active'`).get() as any).c,
      totalTeachers: (db.prepare(`SELECT COUNT(*) as c FROM teachers WHERE deleted_at IS NULL`).get() as any).c,
      activeTeachers: (db.prepare(`SELECT COUNT(*) as c FROM teachers WHERE deleted_at IS NULL AND status = 'active'`).get() as any).c,
      totalClasses: (db.prepare(`SELECT COUNT(*) as c FROM classes WHERE deleted_at IS NULL`).get() as any).c,
      totalCourses: (db.prepare(`SELECT COUNT(*) as c FROM courses WHERE deleted_at IS NULL`).get() as any).c,
      totalFeesCollected: (db.prepare(`SELECT COALESCE(SUM(amount_paid), 0) as s FROM fee_payments`).get() as any).s,
      pendingFees: (db.prepare(`SELECT COALESCE(SUM(remaining_amount), 0) as s FROM fees WHERE status IN ('pending', 'partial', 'overdue')`).get() as any).s,
      monthlyIncome: (db.prepare(`SELECT COALESCE(SUM(amount_paid), 0) as s FROM fee_payments WHERE substr(payment_date, 1, 7) = ?`).get(currentMonth) as any).s,
      todayPresent: (db.prepare(`SELECT COUNT(*) as c FROM attendance WHERE attendee_type = 'student' AND attendance_date = ? AND status = 'present'`).get(today) as any).c,
      todayTotalAttendance: (db.prepare(`SELECT COUNT(*) as c FROM attendance WHERE attendee_type = 'student' AND attendance_date = ?`).get(today) as any).c,
    };

    const monthlyFeeChart = db.prepare(`
      SELECT substr(payment_date, 1, 7) as month, COALESCE(SUM(amount_paid), 0) as collected
      FROM fee_payments
      GROUP BY substr(payment_date, 1, 7)
      ORDER BY month ASC
      LIMIT 8
    `).all();

    const enrollmentByGroup = db.prepare(`
      SELECT CASE
               WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
               ELSE COALESCE(c.class_name, crs.course_name, 'Unassigned')
             END as label,
             s.education_category as category,
             COUNT(s.id) as count
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN courses crs ON s.course_id = crs.id
      WHERE s.deleted_at IS NULL
      GROUP BY label, s.education_category
      ORDER BY count DESC
    `).all();

    const attendanceOverview = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM attendance
      WHERE attendee_type = 'student'
      GROUP BY status
    `).all();

    const recentAdmissions = db.prepare(`
      SELECT s.id, s.student_code, s.full_name, s.education_category, s.admission_date, s.status,
             CASE
               WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
               ELSE COALESCE(c.class_name, crs.course_name)
             END as enrolled_in
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN courses crs ON s.course_id = crs.id
      WHERE s.deleted_at IS NULL
      ORDER BY s.id DESC
      LIMIT 6
    `).all();

    const recentPayments = db.prepare(`
      SELECT fp.id, fp.receipt_number, fp.amount_paid, fp.payment_date, fp.payment_method,
             s.student_code, s.full_name
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id
      ORDER BY fp.id DESC
      LIMIT 6
    `).all();

    const overdueWaRemindersPending = (
      db.prepare(`SELECT COUNT(*) as c FROM fee_whatsapp_reminders WHERE channel_status IN ('queued', 'no_phone')`).get() as any
    )?.c || 0;

    return res.json({
      role,
      totals: {
        ...totals,
        overdueWaRemindersPending,
      },
      monthlyFeeChart,
      enrollmentByGroup,
      attendanceOverview,
      recentAdmissions,
      recentPayments,
    });
  }

  if (role === 'teacher') {
    const teacher = getTeacherByUserId(req.session!.userId);
    if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });

    const assignedStudentsCount = (db.prepare(`
      SELECT COUNT(DISTINCT s.id) as c
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN courses crs ON s.course_id = crs.id
      WHERE s.deleted_at IS NULL
        AND (s.assigned_teacher_id = ? OR c.class_teacher_id = ? OR crs.teacher_id = ?)
    `).get(teacher.id, teacher.id, teacher.id) as any).c;

    const assignedClasses = db.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.deleted_at IS NULL AND s.status = 'active') as student_count
      FROM classes c
      WHERE c.class_teacher_id = ? AND c.deleted_at IS NULL
      ORDER BY c.level_order
    `).all(teacher.id);
    const assignedCourses = db.prepare(`
      SELECT crs.*,
             (SELECT COUNT(*) FROM students s WHERE s.course_id = crs.id AND s.deleted_at IS NULL AND s.status = 'active') as enrolled_count
      FROM courses crs
      WHERE crs.teacher_id = ? AND crs.deleted_at IS NULL
    `).all(teacher.id);
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todaysClasses = db.prepare(`
      SELECT tt.*, c.class_name, crs.course_name, sub.subject_name
      FROM timetables tt
      LEFT JOIN classes c ON tt.class_id = c.id
      LEFT JOIN courses crs ON tt.course_id = crs.id
      LEFT JOIN subjects sub ON tt.subject_id = sub.id
      WHERE tt.teacher_id = ? AND tt.day_of_week = ?
      ORDER BY tt.start_time
    `).all(teacher.id, dayName);

    const pendingAssignments = db.prepare(`
      SELECT a.*, c.class_name, crs.course_name,
             (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.status = 'submitted') as pending_reviews
      FROM assignments a
      LEFT JOIN classes c ON a.class_id = c.id
      LEFT JOIN courses crs ON a.course_id = crs.id
      WHERE a.teacher_id = ? AND a.status = 'open'
      ORDER BY a.due_date ASC
    `).all(teacher.id);

    const todayAttendanceMarked = (db.prepare(`
      SELECT COUNT(*) as c FROM attendance WHERE attendance_date = ? AND marked_by = ?
    `).get(today, req.session!.userId) as any).c;

    const recentNotices = db.prepare(`
      SELECT * FROM notices WHERE target_audience IN ('all', 'teachers') ORDER BY id DESC LIMIT 5
    `).all();

    return res.json({
      role,
      teacher,
      totals: {
        assignedStudents: assignedStudentsCount,
        assignedClassesCount: assignedClasses.length,
        assignedCoursesCount: assignedCourses.length,
        todaysClassesCount: todaysClasses.length,
        todayAttendanceMarked,
        pendingAssignmentsCount: pendingAssignments.length,
      },
      assignedClasses,
      assignedCourses,
      todaysClasses,
      pendingAssignments,
      recentNotices,
    });
  }

  // Student Dashboard
  const student = getStudentByUserId(req.session!.userId);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const attRows = db.prepare(`SELECT status FROM attendance WHERE attendee_type = 'student' AND student_id = ?`).all(student.id) as any[];
  const totalAtt = attRows.length;
  const presentAtt = attRows.filter((r) => r.status === 'present' || r.status === 'late').length;
  const attendancePercentage = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : 100;

  const feeSummary = db.prepare(`
    SELECT COALESCE(SUM(net_amount), 0) as total_fees,
           COALESCE(SUM(paid_amount), 0) as paid_fees,
           COALESCE(SUM(remaining_amount), 0) as pending_fees
    FROM fees WHERE student_id = ?
  `).get(student.id) as any;

  const recentFees = db.prepare(`
    SELECT id, challan_number, fee_type, fee_month, net_amount, paid_amount, remaining_amount, due_date, status
    FROM fees WHERE student_id = ? ORDER BY id DESC LIMIT 4
  `).all(student.id);

  const selectedSubIds: number[] = Array.isArray(student.selected_subject_ids) ? student.selected_subject_ids : [];
  const upcomingClasses = db.prepare(`
    SELECT tt.*, t.full_name as teacher_name, sub.subject_name
    FROM timetables tt
    JOIN teachers t ON tt.teacher_id = t.id
    LEFT JOIN subjects sub ON tt.subject_id = sub.id
    WHERE (
      tt.class_id = ? AND ? IS NOT NULL
      AND (? = 0 OR tt.subject_id IS NULL OR tt.subject_id IN (SELECT subject_id FROM student_subjects WHERE student_id = ?))
    ) OR (tt.course_id = ? AND ? IS NOT NULL)
    ORDER BY CASE tt.day_of_week
      WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, tt.start_time
    LIMIT 6
  `).all(student.class_id, student.class_id, selectedSubIds.length, student.id, student.course_id, student.course_id);

  const latestResults = db.prepare(`
    SELECT m.*, e.exam_name, e.exam_date
    FROM marks m
    JOIN exams e ON m.exam_id = e.id
    WHERE m.student_id = ? AND e.is_published = 1
    ORDER BY e.exam_date DESC
    LIMIT 6
  `).all(student.id);

  const recentNotices = db.prepare(`
    SELECT * FROM notices
    WHERE target_audience IN ('all', 'students')
       OR (target_audience = 'class' AND target_class_id = ?)
       OR (target_audience = 'course' AND target_course_id = ?)
    ORDER BY id DESC LIMIT 5
  `).all(student.class_id, student.course_id);

  res.json({
    role,
    student,
    attendancePercentage,
    attendanceTotal: totalAtt,
    feeSummary,
    recentFees,
    upcomingClasses,
    latestResults,
    recentNotices,
  });
});

// ============================================================================
// STUDENT MANAGEMENT
// ============================================================================

coreRouter.get('/students', requireAuth, requireRole('admin', 'teacher'), (req: AuthedRequest, res) => {
  const { search = '', classId = '', courseId = '', gender = '', admissionDate = '', status = '', page = '1', limit = '15' } = req.query as Record<string, string>;
  const where: string[] = ['s.deleted_at IS NULL'];
  const params: any[] = [];

  if (req.session!.role === 'teacher') {
    const teacher = getTeacherByUserId(req.session!.userId);
    if (!teacher) return res.json({ items: [], total: 0, page: 1, totalPages: 1 });
    where.push(`(s.assigned_teacher_id = ? OR c.class_teacher_id = ? OR crs.teacher_id = ?)`);
    params.push(teacher.id, teacher.id, teacher.id);
  }

  if (search) {
    where.push(`(s.full_name LIKE ? OR s.student_code LIKE ? OR s.father_name LIKE ? OR s.phone LIKE ? OR u.username LIKE ?)`);
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }
  if (classId) {
    where.push(`s.class_id = ?`);
    params.push(Number(classId));
  }
  if (courseId) {
    where.push(`s.course_id = ?`);
    params.push(Number(courseId));
  }
  if (gender) {
    where.push(`s.gender = ?`);
    params.push(gender);
  }
  if (admissionDate) {
    where.push(`s.admission_date = ?`);
    params.push(admissionDate);
  }
  if (status) {
    where.push(`s.status = ?`);
    params.push(status);
  }

  const whereSql = where.join(' AND ');
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 15));
  const offset = (pageNum - 1) * pageSize;

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total
    FROM students s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    WHERE ${whereSql}
  `).get(...params) as any;

  const items = db.prepare(`
    SELECT s.*, u.username, u.must_change_password,
           c.class_name, sec.section_name, crs.course_name, t.full_name as assigned_teacher_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    LEFT JOIN teachers t ON s.assigned_teacher_id = t.id
    WHERE ${whereSql}
    ORDER BY s.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as any[];

  const subjMap = getStudentSubjectsForIds(items.map((st) => st.id));
  const enrichedItems = items.map((st) => {
    const subs = subjMap[st.id] || [];
    return {
      ...st,
      selected_subjects: subs,
      selected_subject_ids: subs.map((s) => s.id),
      selected_subject_names: subs.map((s) => s.subject_name),
    };
  });

  res.json({
    items: enrichedItems,
    total: totalRow.total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(totalRow.total / pageSize)),
  });
});

coreRouter.get('/students/export', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT s.id as "_sid",
           s.student_code as "Student ID",
           u.username as "Username",
           s.full_name as "Full Name",
           s.father_name as "Father Name",
           s.dob as "DOB",
           s.gender as "Gender",
           s.phone as "Phone",
           s.guardian_phone as "Guardian Phone",
           s.email as "Email",
           s.education_category as "Category",
           CASE
             WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
             ELSE COALESCE(c.class_name, crs.course_name, '')
           END as "Class / Course",
           s.monthly_fee as "Monthly Fee",
           s.admission_date as "Admission Date",
           s.status as "Status"
    FROM students s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    WHERE s.deleted_at IS NULL
    ORDER BY s.id DESC
  `).all() as any[];

  const subjMap = getStudentSubjectsForIds(rows.map((r) => Number(r._sid)));
  const formattedRows = rows.map(({ _sid, ...rest }) => {
    const subs = subjMap[Number(_sid)] || [];
    return {
      ...rest,
      'Subject Count': subs.length,
      'Selected Subjects': subs.map((s) => s.subject_name).join(', '),
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(formattedRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="SindhTech_Students_Directory.xlsx"');
  res.send(buf);
});

coreRouter.get('/students/:id', requireAuth, requireRole('admin', 'teacher'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const student = db.prepare(`
    SELECT s.*, u.username, c.class_name, sec.section_name, crs.course_name, t.full_name as assigned_teacher_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    LEFT JOIN teachers t ON s.assigned_teacher_id = t.id
    WHERE s.id = ? AND s.deleted_at IS NULL
  `).get(id) as any;

  if (!student) return res.status(404).json({ error: 'Student not found.' });

  if (req.session!.role === 'teacher') {
    const teacher = getTeacherByUserId(req.session!.userId);
    const assigned = db.prepare(`
      SELECT 1 FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN courses crs ON s.course_id = crs.id
      WHERE s.id = ? AND (s.assigned_teacher_id = ? OR c.class_teacher_id = ? OR crs.teacher_id = ?)
    `).get(id, teacher?.id || -1, teacher?.id || -1, teacher?.id || -1);
    if (!assigned) return res.status(403).json({ error: 'You are only permitted to view assigned students.' });
  }

  const fees = db.prepare(`SELECT * FROM fees WHERE student_id = ? ORDER BY id DESC`).all(id);
  const attendance = db.prepare(`SELECT * FROM attendance WHERE student_id = ? ORDER BY attendance_date DESC LIMIT 30`).all(id);
  const marks = db.prepare(`
    SELECT m.*, e.exam_name, e.exam_date, e.is_published
    FROM marks m JOIN exams e ON m.exam_id = e.id
    WHERE m.student_id = ? ORDER BY e.exam_date DESC
  `).all(id);

  const selectedSubjects = getStudentSubjectsForIds([id])[id] || [];
  res.json({
    student: {
      ...student,
      selected_subjects: selectedSubjects,
      selected_subject_ids: selectedSubjects.map((s) => s.id),
      selected_subject_names: selectedSubjects.map((s) => s.subject_name),
    },
    fees,
    attendance,
    marks,
  });
});

coreRouter.post('/students', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.fullName || !b.fatherName || !b.dob || !b.gender || !b.phone || !b.guardianPhone || !b.educationCategory) {
    return res.status(400).json({ error: 'All required student fields must be completed.' });
  }
  const cat = String(b.educationCategory) as 'school' | 'course' | 'both';
  if (!['school', 'course', 'both'].includes(cat)) {
    return res.status(400).json({ error: 'Invalid education category.' });
  }
  if ((cat === 'school' || cat === 'both') && !b.classId) {
    return res.status(400).json({ error: 'Please select an Academy Class.' });
  }
  if ((cat === 'course' || cat === 'both') && !b.courseId) {
    return res.status(400).json({ error: 'Please select a Professional Course.' });
  }

  const seqRow = db.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'next_student_seq'`).get() as any;
  let seq = Number(seqRow?.setting_value || 1009);
  while (db.prepare(`SELECT 1 FROM students WHERE student_code = ?`).get(formatStudentCode(seq))) {
    seq++;
  }

  const studentCode = formatStudentCode(seq);
  const username = formatStudentUsername(seq);
  const tempPassword = generateTempPassword(12);
  const passwordHash = hashPassword(tempPassword);
  const admissionDate = b.admissionDate || new Date().toISOString().slice(0, 10);

  const classIdVal = cat === 'school' || cat === 'both' ? Number(b.classId) : null;
  const sectionIdVal = (cat === 'school' || cat === 'both') && b.sectionId ? Number(b.sectionId) : null;
  const courseIdVal = cat === 'course' || cat === 'both' ? Number(b.courseId) : null;

  const classSubjects = classIdVal
    ? (db.prepare(`SELECT id, subject_name FROM subjects WHERE class_id = ?`).all(classIdVal) as Array<{ id: number; subject_name: string }>)
    : [];
  const rawSubjIds: number[] = Array.isArray(b.subjectIds)
    ? b.subjectIds.map((x: any) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const validClassSubjIdSet = new Set(classSubjects.map((s) => s.id));
  const selectedSubjIds = rawSubjIds.filter((sid) => validClassSubjIdSet.has(sid));

  const subjCheck = validateStudentSubjects({
    educationCategory: cat,
    availableSubjectCount: classSubjects.length,
    selectedSubjectIds: selectedSubjIds,
  });
  if (!subjCheck.valid) {
    return res.status(400).json({ error: subjCheck.reason });
  }

  const cls = classIdVal ? (db.prepare(`SELECT class_name, class_teacher_id FROM classes WHERE id = ?`).get(classIdVal) as any) : null;
  const crs = courseIdVal ? (db.prepare(`SELECT course_name, teacher_id FROM courses WHERE id = ?`).get(courseIdVal) as any) : null;

  const baseProgramLabel = formatProgramLabel(cls?.class_name, crs?.course_name, cat);
  const assignedTarget =
    selectedSubjIds.length > 0 ? `${baseProgramLabel} · ${selectedSubjIds.length} Subjects` : baseProgramLabel;
  let resolvedTeacherId: number | null = b.assignedTeacherId ? Number(b.assignedTeacherId) : null;
  if (!resolvedTeacherId && cls?.class_teacher_id) resolvedTeacherId = Number(cls.class_teacher_id);
  if (!resolvedTeacherId && crs?.teacher_id) resolvedTeacherId = Number(crs.teacher_id);

  db.exec('BEGIN');
  try {
    const emailVal = b.email ? String(b.email).trim() : null;
    const uRes = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, avatar_url, status, must_change_password)
      VALUES (?, ?, ?, 'student', ?, ?, ?, 0)
    `).run(username, emailVal, passwordHash, String(b.fullName).trim(), b.profilePicture || null, b.status === 'inactive' ? 'inactive' : 'active');
    const userId = Number(uRes.lastInsertRowid);

    const monthlyFee = Number(b.monthlyFee) || 0;
    const admissionFee = Number(b.admissionFee) || 0;

    const stRes = db.prepare(`
      INSERT INTO students (
        user_id, student_code, full_name, father_name, dob, gender, phone, guardian_phone,
        email, address, profile_picture, admission_date, education_category, class_id, section_id,
        course_id, assigned_teacher_id, monthly_fee, admission_fee, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      studentCode,
      String(b.fullName).trim(),
      String(b.fatherName).trim(),
      b.dob,
      b.gender,
      String(b.phone).trim(),
      String(b.guardianPhone).trim(),
      emailVal,
      b.address || '',
      b.profilePicture || null,
      admissionDate,
      cat,
      classIdVal,
      sectionIdVal,
      courseIdVal,
      resolvedTeacherId,
      monthlyFee,
      admissionFee,
      b.status === 'inactive' ? 'inactive' : 'active',
    );
    const studentId = Number(stRes.lastInsertRowid);

    for (const sid of selectedSubjIds) {
      db.prepare(`INSERT OR IGNORE INTO student_subjects (student_id, subject_id) VALUES (?, ?)`).run(studentId, sid);
    }

    const activeSession = db.prepare(`SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1`).get() as any;
    db.prepare(`
      INSERT INTO enrollments (student_id, session_id, education_category, class_id, section_id, course_id, enrollment_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      studentId,
      activeSession?.id || 1,
      cat,
      classIdVal,
      sectionIdVal,
      courseIdVal,
      admissionDate,
    );

    const fifthDueDate = `${admissionDate.slice(0, 7)}-05`;
    if (admissionFee > 0) {
      db.prepare(`
        INSERT INTO fees (student_id, session_id, challan_number, fee_type, fee_month, base_amount, discount, late_fee, net_amount, paid_amount, remaining_amount, due_date, status, notes)
        VALUES (?, ?, ?, 'admission', ?, ?, 0, 0, ?, 0, ?, ?, 'pending', 'Admission Registration Fee')
      `).run(studentId, activeSession?.id || 1, `CHL-ADM-${seq}`, admissionDate.slice(0, 7), admissionFee, admissionFee, admissionFee, admissionDate);
    }
    if (monthlyFee > 0) {
      db.prepare(`
        INSERT INTO fees (student_id, session_id, challan_number, fee_type, fee_month, base_amount, discount, late_fee, net_amount, paid_amount, remaining_amount, due_date, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, 'pending', ?)
      `).run(
        studentId,
        activeSession?.id || 1,
        `CHL-MON-${seq}`,
        cat === 'course' ? 'course' : 'monthly',
        admissionDate.slice(0, 7),
        monthlyFee,
        monthlyFee,
        monthlyFee,
        fifthDueDate,
        cat === 'both' ? `Monthly Tuition + Course Fee (${assignedTarget})` : 'Initial Tuition Fee',
      );
    }

    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('next_student_seq', ?)`).run(String(seq + 1));
    db.prepare(`
      INSERT INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at, updated_at)
      VALUES (?, ?, 'Student', ?, ?, ?, ?, ?, ?, 'pending', 'Ready to Sign In', ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        full_name = excluded.full_name,
        issued_password = excluded.issued_password,
        assigned_target = excluded.assigned_target,
        phone = excluded.phone,
        email = excluded.email,
        sent_status = 'pending',
        sent_at = NULL,
        password_status = 'Ready to Sign In',
        updated_at = datetime('now')
    `).run(
      userId,
      studentCode,
      String(b.fullName).trim(),
      username,
      tempPassword,
      assignedTarget,
      String(b.phone).trim(),
      emailVal,
      new Date().toISOString().slice(0, 10),
    );
    createNotification(userId, 'admission', 'Welcome to SindhTech Institute', `Your student account ${studentCode} has been activated for ${assignedTarget}.`);
    logActivity(req.session!.userId, 'CREATE_STUDENT', 'student', studentId, `Admitted student ${b.fullName} (${studentCode}) to ${assignedTarget}.`);

    db.exec('COMMIT');

    const credentialToken = storeOneTimeCredential({
      name: String(b.fullName).trim(),
      code: studentCode,
      role: 'Student',
      username,
      tempPassword,
      assignedTarget,
      createdAt: new Date().toISOString().slice(0, 10),
    });

    res.status(201).json({
      id: studentId,
      studentCode,
      credentials: {
        token: credentialToken,
        name: String(b.fullName).trim(),
        idCode: studentCode,
        role: 'Student',
        username,
        temporaryPassword: tempPassword,
        assignedTarget,
        createdDate: new Date().toISOString().slice(0, 10),
      },
    });
  } catch (err: any) {
    db.exec('ROLLBACK');
    if (String(err?.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'A user with this email address already exists.' });
    }
    throw err;
  }
});

coreRouter.put('/students/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare(`SELECT * FROM students WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  const nextCat = (b.educationCategory ?? existing.education_category) as 'school' | 'course' | 'both';
  const nextClassId =
    nextCat === 'school' || nextCat === 'both' ? (b.classId ? Number(b.classId) : existing.class_id) : null;
  const nextSectionId =
    nextCat === 'school' || nextCat === 'both' ? (b.sectionId ? Number(b.sectionId) : existing.section_id) : null;
  const nextCourseId =
    nextCat === 'course' || nextCat === 'both' ? (b.courseId ? Number(b.courseId) : existing.course_id) : null;

  const cls = nextClassId ? (db.prepare(`SELECT class_name FROM classes WHERE id = ?`).get(nextClassId) as any) : null;
  const crs = nextCourseId ? (db.prepare(`SELECT course_name FROM courses WHERE id = ?`).get(nextCourseId) as any) : null;
  const baseTarget = formatProgramLabel(cls?.class_name, crs?.course_name, nextCat);

  const classSubjects = nextClassId
    ? (db.prepare(`SELECT id FROM subjects WHERE class_id = ?`).all(nextClassId) as Array<{ id: number }>)
    : [];
  const validClassSubjIdSet = new Set(classSubjects.map((s) => s.id));
  const hasSubjectIdsPayload = Array.isArray(b.subjectIds);
  const nextSubjIds: number[] = hasSubjectIdsPayload
    ? b.subjectIds.map((x: any) => Number(x)).filter((n: number) => validClassSubjIdSet.has(n))
    : [];

  if (hasSubjectIdsPayload) {
    const subjCheck = validateStudentSubjects({
      educationCategory: nextCat,
      availableSubjectCount: classSubjects.length,
      selectedSubjectIds: nextSubjIds,
    });
    if (!subjCheck.valid) {
      return res.status(400).json({ error: subjCheck.reason });
    }
  }

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE students SET
        full_name = ?, father_name = ?, dob = ?, gender = ?, phone = ?, guardian_phone = ?,
        email = ?, address = ?, education_category = ?, class_id = ?, section_id = ?,
        course_id = ?, assigned_teacher_id = ?, monthly_fee = ?, status = ?,
        profile_picture = COALESCE(?, profile_picture),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.fullName ?? existing.full_name,
      b.fatherName ?? existing.father_name,
      b.dob ?? existing.dob,
      b.gender ?? existing.gender,
      b.phone ?? existing.phone,
      b.guardianPhone ?? existing.guardian_phone,
      b.email !== undefined ? (b.email || null) : existing.email,
      b.address ?? existing.address,
      nextCat,
      nextClassId,
      nextSectionId,
      nextCourseId,
      b.assignedTeacherId ? Number(b.assignedTeacherId) : existing.assigned_teacher_id,
      b.monthlyFee !== undefined ? Number(b.monthlyFee) : existing.monthly_fee,
      b.status ?? existing.status,
      b.profilePicture || null,
      id,
    );

    if (nextCat === 'course') {
      db.prepare(`DELETE FROM student_subjects WHERE student_id = ?`).run(id);
    } else if (hasSubjectIdsPayload) {
      db.prepare(`DELETE FROM student_subjects WHERE student_id = ?`).run(id);
      for (const sid of nextSubjIds) {
        db.prepare(`INSERT OR IGNORE INTO student_subjects (student_id, subject_id) VALUES (?, ?)`).run(id, sid);
      }
    } else if (nextClassId !== existing.class_id) {
      db.prepare(`DELETE FROM student_subjects WHERE student_id = ?`).run(id);
    }

    const finalSubCount = (db.prepare(`SELECT COUNT(*) as c FROM student_subjects WHERE student_id = ?`).get(id) as any)?.c || 0;
    const nextTarget = finalSubCount > 0 ? `${baseTarget} · ${finalSubCount} Subjects` : baseTarget;

    db.prepare(`UPDATE users SET full_name = ?, email = ?, status = ?, updated_at = datetime('now') WHERE id = ?`).run(
      b.fullName ?? existing.full_name,
      b.email !== undefined ? (b.email || null) : existing.email,
      b.status ?? existing.status,
      existing.user_id,
    );

    db.prepare(`
      UPDATE credential_ledger
      SET full_name = ?, phone = ?, email = ?, assigned_target = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      b.fullName ?? existing.full_name,
      b.phone ?? existing.phone,
      b.email !== undefined ? (b.email || null) : existing.email,
      nextTarget,
      existing.user_id,
    );

    logActivity(req.session!.userId, 'UPDATE_STUDENT', 'student', id, `Updated student ${b.fullName ?? existing.full_name}.`);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

coreRouter.patch('/students/:id/status', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const nextStatus = status === 'inactive' ? 'inactive' : 'active';
  const existing = db.prepare(`SELECT user_id, full_name FROM students WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(nextStatus, id);
    db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(nextStatus, existing.user_id);
    logActivity(req.session!.userId, 'TOGGLE_STUDENT_STATUS', 'student', id, `${existing.full_name} set to ${nextStatus}.`);
    db.exec('COMMIT');
    res.json({ ok: true, status: nextStatus });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

coreRouter.post('/students/promote', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const { studentIds, targetClassId, targetSectionId } = req.body || {};
  if (!Array.isArray(studentIds) || studentIds.length === 0 || !targetClassId) {
    return res.status(400).json({ error: 'Select students and a target class for promotion.' });
  }
  const targetCls = db.prepare(`SELECT * FROM classes WHERE id = ? AND deleted_at IS NULL`).get(Number(targetClassId)) as any;
  if (!targetCls) return res.status(404).json({ error: 'Target class not found.' });

  db.exec('BEGIN');
  try {
    for (const sid of studentIds) {
      db.prepare(`
        UPDATE students SET class_id = ?, section_id = ?, monthly_fee = ?, education_category = 'school', course_id = NULL, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `).run(targetCls.id, targetSectionId ? Number(targetSectionId) : null, targetCls.monthly_fee, Number(sid));
      db.prepare(`UPDATE enrollments SET status = 'promoted' WHERE student_id = ? AND status = 'active'`).run(Number(sid));
      db.prepare(`
        INSERT INTO enrollments (student_id, session_id, education_category, class_id, section_id, enrollment_date, status)
        VALUES (?, (SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1), 'school', ?, ?, date('now'), 'active')
      `).run(Number(sid), targetCls.id, targetSectionId ? Number(targetSectionId) : null);
    }
    logActivity(req.session!.userId, 'PROMOTE_STUDENTS', 'class', targetCls.id, `Promoted ${studentIds.length} student(s) to ${targetCls.class_name}.`);
    db.exec('COMMIT');
    res.json({ ok: true, promotedCount: studentIds.length });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

coreRouter.delete('/students/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT user_id, full_name FROM students WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE students SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?`).run(id);
    db.prepare(`UPDATE users SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?`).run(existing.user_id);
    logActivity(req.session!.userId, 'DELETE_STUDENT', 'student', id, `Archived student ${existing.full_name}.`);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

// ============================================================================
// TEACHER MANAGEMENT
// ============================================================================

coreRouter.get('/teachers', requireAuth, requireRole('admin', 'teacher'), (req: AuthedRequest, res) => {
  const { search = '', status = '' } = req.query as Record<string, string>;
  const where = ['t.deleted_at IS NULL'];
  const params: any[] = [];

  if (search) {
    where.push(`(t.full_name LIKE ? OR t.teacher_code LIKE ? OR t.specialization LIKE ? OR t.phone LIKE ?)`);
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  if (status) {
    where.push(`t.status = ?`);
    params.push(status);
  }

  const items = db.prepare(`
    SELECT t.*, u.username,
           (SELECT GROUP_CONCAT(class_name, ', ') FROM classes c WHERE c.class_teacher_id = t.id AND c.deleted_at IS NULL) as assigned_classes,
           (SELECT GROUP_CONCAT(course_name, ', ') FROM courses crs WHERE crs.teacher_id = t.id AND crs.deleted_at IS NULL) as assigned_courses,
           (SELECT COUNT(*) FROM students s WHERE s.assigned_teacher_id = t.id AND s.deleted_at IS NULL) as assigned_students_count
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY t.id DESC
  `).all(...params);

  // Teachers cannot view other teachers' private salaries
  if (req.session!.role === 'teacher') {
    return res.json({
      items: items.map((t: any) => ({
        id: t.id,
        teacher_code: t.teacher_code,
        full_name: t.full_name,
        specialization: t.specialization,
        assigned_classes: t.assigned_classes,
        assigned_courses: t.assigned_courses,
        status: t.status,
      })),
    });
  }

  res.json({ items });
});

coreRouter.get('/teachers/export', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT t.teacher_code as "Teacher ID", u.username as "Username", t.full_name as "Full Name",
           t.father_name as "Father Name", t.gender as "Gender", t.phone as "Phone", t.email as "Email",
           t.qualification as "Qualification", t.specialization as "Specialization",
           t.joining_date as "Joining Date", t.salary as "Salary", t.working_hours as "Working Hours", t.status as "Status"
    FROM teachers t JOIN users u ON t.user_id = u.id
    WHERE t.deleted_at IS NULL ORDER BY t.id DESC
  `).all() as any[];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Teachers');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="SindhTech_Teachers_Directory.xlsx"');
  res.send(buf);
});

coreRouter.post('/teachers', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.fullName || !b.fatherName || !b.gender || !b.phone || !b.qualification || !b.specialization) {
    return res.status(400).json({ error: 'All required teacher fields must be filled.' });
  }

  const seqRow = db.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'next_teacher_seq'`).get() as any;
  let seq = Number(seqRow?.setting_value || 1004);
  while (db.prepare(`SELECT 1 FROM teachers WHERE teacher_code = ?`).get(formatTeacherCode(seq))) {
    seq++;
  }

  const teacherCode = formatTeacherCode(seq);
  const username = formatTeacherUsername(seq);
  const tempPassword = generateTempPassword(12);
  const passwordHash = hashPassword(tempPassword);
  const joiningDate = b.joiningDate || new Date().toISOString().slice(0, 10);

  db.exec('BEGIN');
  try {
    const emailVal = b.email ? String(b.email).trim() : null;
    const uRes = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, avatar_url, status, must_change_password)
      VALUES (?, ?, ?, 'teacher', ?, ?, ?, 0)
    `).run(username, emailVal, passwordHash, String(b.fullName).trim(), b.profilePicture || null, b.status === 'inactive' ? 'inactive' : 'active');
    const userId = Number(uRes.lastInsertRowid);

    const tRes = db.prepare(`
      INSERT INTO teachers (
        user_id, teacher_code, full_name, father_name, gender, phone, email, address,
        qualification, specialization, joining_date, salary, working_hours, profile_picture, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      teacherCode,
      String(b.fullName).trim(),
      String(b.fatherName).trim(),
      b.gender,
      String(b.phone).trim(),
      emailVal,
      b.address || '',
      String(b.qualification).trim(),
      String(b.specialization).trim(),
      joiningDate,
      Number(b.salary) || 0,
      b.workingHours || '08:00 AM - 02:00 PM',
      b.profilePicture || null,
      b.status === 'inactive' ? 'inactive' : 'active',
    );
    const teacherId = Number(tRes.lastInsertRowid);

    const assignedNames: string[] = [];
    if (Array.isArray(b.assignedClassIds)) {
      for (const cid of b.assignedClassIds) {
        db.prepare(`UPDATE classes SET class_teacher_id = ? WHERE id = ?`).run(teacherId, Number(cid));
        const c = db.prepare(`SELECT class_name FROM classes WHERE id = ?`).get(Number(cid)) as any;
        if (c) assignedNames.push(c.class_name);
      }
    }
    if (Array.isArray(b.assignedCourseIds)) {
      for (const crid of b.assignedCourseIds) {
        db.prepare(`UPDATE courses SET teacher_id = ? WHERE id = ?`).run(teacherId, Number(crid));
        const crs = db.prepare(`SELECT course_name FROM courses WHERE id = ?`).get(Number(crid)) as any;
        if (crs) assignedNames.push(crs.course_name);
      }
    }

    const assignedTarget = assignedNames.length > 0 ? assignedNames.join(', ') : b.specialization;
    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('next_teacher_seq', ?)`).run(String(seq + 1));
    db.prepare(`
      INSERT INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at, updated_at)
      VALUES (?, ?, 'Teacher', ?, ?, ?, ?, ?, ?, 'pending', 'Ready to Sign In', ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        full_name = excluded.full_name,
        issued_password = excluded.issued_password,
        assigned_target = excluded.assigned_target,
        phone = excluded.phone,
        email = excluded.email,
        sent_status = 'pending',
        sent_at = NULL,
        password_status = 'Ready to Sign In',
        updated_at = datetime('now')
    `).run(
      userId,
      teacherCode,
      String(b.fullName).trim(),
      username,
      tempPassword,
      assignedTarget,
      String(b.phone).trim(),
      emailVal,
      new Date().toISOString().slice(0, 10),
    );
    createNotification(userId, 'account', 'Faculty Account Activated', `Welcome to SindhTech Institute. Your teacher ID is ${teacherCode}.`);
    logActivity(req.session!.userId, 'CREATE_TEACHER', 'teacher', teacherId, `Added teacher ${b.fullName} (${teacherCode}).`);
    db.exec('COMMIT');
    const credentialToken = storeOneTimeCredential({
      name: String(b.fullName).trim(),
      code: teacherCode,
      role: 'Teacher',
      username,
      tempPassword,
      assignedTarget,
      createdAt: new Date().toISOString().slice(0, 10),
    });

    res.status(201).json({
      id: teacherId,
      teacherCode,
      credentials: {
        token: credentialToken,
        name: String(b.fullName).trim(),
        idCode: teacherCode,
        role: 'Teacher',
        username,
        temporaryPassword: tempPassword,
        assignedTarget,
        createdDate: new Date().toISOString().slice(0, 10),
      },
    });
  } catch (err: any) {
    db.exec('ROLLBACK');
    if (String(err?.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'A user with this email address already exists.' });
    }
    throw err;
  }
});

coreRouter.put('/teachers/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare(`SELECT * FROM teachers WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Teacher not found.' });

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE teachers SET
        full_name = ?, father_name = ?, gender = ?, phone = ?, email = ?, address = ?,
        qualification = ?, specialization = ?, joining_date = ?, salary = ?, working_hours = ?,
        status = ?, profile_picture = COALESCE(?, profile_picture), updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.fullName ?? existing.full_name,
      b.fatherName ?? existing.father_name,
      b.gender ?? existing.gender,
      b.phone ?? existing.phone,
      b.email !== undefined ? (b.email || null) : existing.email,
      b.address ?? existing.address,
      b.qualification ?? existing.qualification,
      b.specialization ?? existing.specialization,
      b.joiningDate ?? existing.joining_date,
      b.salary !== undefined ? Number(b.salary) : existing.salary,
      b.workingHours ?? existing.working_hours,
      b.status ?? existing.status,
      b.profilePicture || null,
      id,
    );

    db.prepare(`UPDATE users SET full_name = ?, email = ?, status = ?, updated_at = datetime('now') WHERE id = ?`).run(
      b.fullName ?? existing.full_name,
      b.email !== undefined ? (b.email || null) : existing.email,
      b.status ?? existing.status,
      existing.user_id,
    );

    db.prepare(`
      UPDATE credential_ledger
      SET full_name = ?, phone = ?, email = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      b.fullName ?? existing.full_name,
      b.phone ?? existing.phone,
      b.email !== undefined ? (b.email || null) : existing.email,
      existing.user_id,
    );

    logActivity(req.session!.userId, 'UPDATE_TEACHER', 'teacher', id, `Updated teacher ${b.fullName ?? existing.full_name}.`);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

coreRouter.patch('/teachers/:id/status', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const nextStatus = req.body?.status === 'inactive' ? 'inactive' : 'active';
  const existing = db.prepare(`SELECT user_id, full_name FROM teachers WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Teacher not found.' });

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE teachers SET status = ? WHERE id = ?`).run(nextStatus, id);
    db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(nextStatus, existing.user_id);
    logActivity(req.session!.userId, 'TOGGLE_TEACHER_STATUS', 'teacher', id, `${existing.full_name} set to ${nextStatus}.`);
    db.exec('COMMIT');
    res.json({ ok: true, status: nextStatus });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

coreRouter.delete('/teachers/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT user_id, full_name FROM teachers WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Teacher not found.' });

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE teachers SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?`).run(id);
    db.prepare(`UPDATE users SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?`).run(existing.user_id);
    logActivity(req.session!.userId, 'DELETE_TEACHER', 'teacher', id, `Archived teacher ${existing.full_name}.`);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

// PERSISTENT ADMIN CREDENTIALS LEDGER (AUTO-SAVED IDS & PASSWORDS + EXCEL SHEET EXPORT)
coreRouter.get('/credentials/ledger', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const { role = '', sentStatus = '', search = '' } = req.query as Record<string, string>;
  const where = ['u.deleted_at IS NULL'];
  const params: any[] = [];

  if (role === 'Student' || role === 'Teacher') {
    where.push('cl.role = ?');
    params.push(role);
  }
  if (sentStatus === 'pending' || sentStatus === 'sent') {
    where.push('cl.sent_status = ?');
    params.push(sentStatus);
  }
  if (search) {
    where.push('(cl.full_name LIKE ? OR cl.id_code LIKE ? OR cl.username LIKE ? OR cl.assigned_target LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const items = db.prepare(`
    SELECT cl.*, u.status as account_status, u.must_change_password
    FROM credential_ledger cl
    JOIN users u ON cl.user_id = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY cl.id DESC
  `).all(...params);

  const summary = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN cl.sent_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
           SUM(CASE WHEN cl.sent_status = 'sent' THEN 1 ELSE 0 END) as sent_count,
           SUM(CASE WHEN cl.role = 'Student' THEN 1 ELSE 0 END) as student_count,
           SUM(CASE WHEN cl.role = 'Teacher' THEN 1 ELSE 0 END) as teacher_count
    FROM credential_ledger cl
    JOIN users u ON cl.user_id = u.id
    WHERE u.deleted_at IS NULL
  `).get() as any;

  res.json({ items, summary });
});

coreRouter.patch('/credentials/ledger/:id/sent', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const nextStatus = req.body?.sentStatus === 'sent' ? 'sent' : 'pending';
  const row = db.prepare(`SELECT id, id_code, full_name FROM credential_ledger WHERE id = ?`).get(id) as any;
  if (!row) return res.status(404).json({ error: 'Credential entry not found.' });

  db.prepare(`
    UPDATE credential_ledger
    SET sent_status = ?,
        sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE NULL END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, nextStatus, id);

  logActivity(req.session!.userId, 'MARK_CREDENTIALS_SENT', 'user', null, `Marked credentials for ${row.full_name} (${row.id_code}) as ${nextStatus}.`);
  res.json({ ok: true, sentStatus: nextStatus });
});

coreRouter.get('/credentials/ledger/export', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const { role = '' } = req.query as Record<string, string>;
  const where = ['u.deleted_at IS NULL'];
  const params: any[] = [];
  if (role === 'Student' || role === 'Teacher') {
    where.push('cl.role = ?');
    params.push(role);
  }

  const rows = db.prepare(`
    SELECT cl.id_code as "ID Code",
           cl.role as "Role",
           cl.full_name as "Full Name",
           cl.username as "Login Username",
           cl.issued_password as "Password",
           cl.assigned_target as "Class / Course",
           COALESCE(cl.phone, '') as "Phone",
           COALESCE(cl.email, '') as "Email",
           cl.password_status as "Password Status",
           cl.sent_status as "Sent Status",
           COALESCE(cl.sent_at, '') as "Sent Date",
           cl.created_at as "Issued Date"
    FROM credential_ledger cl
    JOIN users u ON cl.user_id = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY cl.role ASC, cl.id DESC
  `).all(...params) as any[];

  const wb = XLSX.utils.book_new();
  const cols = [
    { wch: 15 }, { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
    { wch: 26 }, { wch: 16 }, { wch: 24 }, { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 14 },
  ];

  const allWs = XLSX.utils.json_to_sheet(rows);
  allWs['!cols'] = cols;
  XLSX.utils.book_append_sheet(wb, allWs, role ? `${role} Credentials` : 'All Credentials');

  if (!role) {
    const studentWs = XLSX.utils.json_to_sheet(rows.filter((r) => r.Role === 'Student'));
    studentWs['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, studentWs, 'Students');

    const teacherWs = XLSX.utils.json_to_sheet(rows.filter((r) => r.Role === 'Teacher'));
    teacherWs['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, teacherWs, 'Teachers');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const suffix = role ? `_${role}s` : '_All';
  logActivity(req.session!.userId, 'EXPORT_CREDENTIALS_SHEET', 'user', null, `Exported SindhTech credentials Excel sheet (${role || 'All'}).`);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="SindhTech_Login_Credentials${suffix}.xlsx"`);
  res.send(buf);
});

// ONE-TIME CREDENTIAL EXCEL EXPORT (STRICT ADMIN AUTH + CONSUMED ON DOWNLOAD)
coreRouter.get('/credentials/export/:token', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const cred = consumeOneTimeCredential(req.params.token);
  if (!cred) {
    return res.status(410).json({ error: 'This one-time credential export link has already been used or expired.' });
  }

  const rows = [
    {
      Name: cred.name,
      ID: cred.code,
      Role: cred.role,
      Username: cred.username,
      'Temporary Password': cred.tempPassword,
      'Assigned Class/Course': cred.assignedTarget,
      'Account Creation Date': cred.createdAt,
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Login Credentials');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  logActivity(req.session!.userId, 'EXPORT_CREDENTIALS', 'user', null, `Downloaded one-time Excel credentials for ${cred.code}.`);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${cred.code}_Credentials.xlsx"`);
  res.send(buf);
});

// ADMIN PASSWORD RESET FOR EXISTING USER (GENERATES NEW ONE-TIME TEMP PASSWORD & EXCEL)
coreRouter.post('/users/:userId/reset-temp-password', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const targetUserId = Number(req.params.userId);
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`).get(targetUserId) as any;
  if (!user || user.role === 'admin') {
    return res.status(404).json({ error: 'Target teacher or student account not found.' });
  }

  let code = user.username;
  let assignedTarget = 'SindhTech Institute';
  let phone = '';
  if (user.role === 'student') {
    const s = getStudentByUserId(user.id);
    if (s) {
      code = s.student_code;
      assignedTarget = formatProgramLabel(s.class_name, s.course_name, s.education_category);
      phone = s.phone || '';
    }
  } else if (user.role === 'teacher') {
    const t = getTeacherByUserId(user.id);
    if (t) {
      code = t.teacher_code;
      assignedTarget = t.specialization;
      phone = t.phone || '';
    }
  }

  const tempPassword = generateTempPassword(12);
  const roleLabel = user.role === 'teacher' ? 'Teacher' : 'Student';
  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?`).run(
    hashPassword(tempPassword),
    user.id,
  );
  db.prepare(`
    INSERT INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, sent_at, password_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 'Ready to Sign In', ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name,
      issued_password = excluded.issued_password,
      assigned_target = excluded.assigned_target,
      phone = excluded.phone,
      email = excluded.email,
      sent_status = 'pending',
      sent_at = NULL,
      password_status = 'Ready to Sign In',
      updated_at = datetime('now')
  `).run(
    user.id,
    code,
    roleLabel,
    user.full_name,
    user.username,
    tempPassword,
    assignedTarget,
    phone,
    user.email || null,
    new Date().toISOString().slice(0, 10),
  );
  logActivity(req.session!.userId, 'ADMIN_RESET_PASSWORD', 'user', user.id, `Reset temporary password for ${code}.`);

  const token = storeOneTimeCredential({
    name: user.full_name,
    code,
    role: roleLabel,
    username: user.username,
    tempPassword,
    assignedTarget,
    createdAt: new Date().toISOString().slice(0, 10),
  });

  res.json({
    credentials: {
      token,
      name: user.full_name,
      idCode: code,
      role: roleLabel,
      username: user.username,
      temporaryPassword: tempPassword,
      assignedTarget,
      createdDate: new Date().toISOString().slice(0, 10),
    },
  });
});

// ============================================================================
// CLASSES, SECTIONS & SUBJECTS
// ============================================================================

coreRouter.get('/classes', requireAuth, (req: AuthedRequest, res) => {
  const classes = db.prepare(`
    SELECT c.*, t.full_name as class_teacher_name,
           (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.deleted_at IS NULL AND s.status = 'active') as student_count
    FROM classes c
    LEFT JOIN teachers t ON c.class_teacher_id = t.id
    WHERE c.deleted_at IS NULL
    ORDER BY c.level_order ASC, c.id ASC
  `).all() as any[];

  const sections = db.prepare(`SELECT * FROM sections ORDER BY id ASC`).all() as any[];
  const subjects = db.prepare(`
    SELECT sub.*, t.full_name as teacher_name
    FROM subjects sub LEFT JOIN teachers t ON sub.teacher_id = t.id
    ORDER BY sub.id ASC
  `).all() as any[];

  res.json({
    items: classes.map((c) => ({
      ...c,
      sections: sections.filter((s) => s.class_id === c.id),
      subjects: subjects.filter((sub) => sub.class_id === c.id),
    })),
  });
});

coreRouter.post('/classes', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.className || !b.classCode) {
    return res.status(400).json({ error: 'Class name and code are required.' });
  }
  db.exec('BEGIN');
  try {
    const r = db.prepare(`
      INSERT INTO classes (class_name, class_code, level_order, class_teacher_id, class_timing, monthly_fee, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(
      String(b.className).trim(),
      String(b.classCode).trim().toUpperCase(),
      Number(b.levelOrder) || 11,
      b.classTeacherId ? Number(b.classTeacherId) : null,
      b.classTiming || '08:00 AM - 01:30 PM',
      Number(b.monthlyFee) || 3500,
    );
    const cid = Number(r.lastInsertRowid);
    db.prepare(`INSERT INTO sections (class_id, section_name, capacity, room_number) VALUES (?, 'Section A', 35, ?)`).run(cid, b.roomNumber || 'R-101');
    logActivity(req.session!.userId, 'CREATE_CLASS', 'class', cid, `Created class ${b.className}.`);
    db.exec('COMMIT');
    res.status(201).json({ id: cid });
  } catch (err: any) {
    db.exec('ROLLBACK');
    if (String(err?.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Class code already exists.' });
    }
    throw err;
  }
});

coreRouter.put('/classes/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare(`
    UPDATE classes SET class_name = ?, class_teacher_id = ?, class_timing = ?, monthly_fee = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(b.className, b.classTeacherId ? Number(b.classTeacherId) : null, b.classTiming, Number(b.monthlyFee) || 0, b.status || 'active', id);
  logActivity(req.session!.userId, 'UPDATE_CLASS', 'class', id, `Updated class ${b.className}.`);
  res.json({ ok: true });
});

coreRouter.delete('/classes/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE classes SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?`).run(id);
  logActivity(req.session!.userId, 'DELETE_CLASS', 'class', id, `Archived class #${id}.`);
  res.json({ ok: true });
});

coreRouter.post('/classes/:id/sections', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const classId = Number(req.params.id);
  const { sectionName, capacity, roomNumber } = req.body || {};
  if (!sectionName) return res.status(400).json({ error: 'Section name is required.' });
  try {
    const r = db.prepare(`INSERT INTO sections (class_id, section_name, capacity, room_number) VALUES (?, ?, ?, ?)`).run(
      classId,
      String(sectionName).trim(),
      Number(capacity) || 35,
      roomNumber || '',
    );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err: any) {
    return res.status(400).json({ error: 'Section already exists for this class.' });
  }
});

coreRouter.post('/subjects', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const { subjectName, subjectCode, classId, courseId, teacherId, totalMarks } = req.body || {};
  if (!subjectName || !subjectCode) return res.status(400).json({ error: 'Subject name and code are required.' });
  try {
    const r = db.prepare(`
      INSERT INTO subjects (subject_name, subject_code, class_id, course_id, teacher_id, total_marks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      String(subjectName).trim(),
      String(subjectCode).trim().toUpperCase(),
      classId ? Number(classId) : null,
      courseId ? Number(courseId) : null,
      teacherId ? Number(teacherId) : null,
      Number(totalMarks) || 100,
    );
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err: any) {
    return res.status(400).json({ error: 'Subject code already exists.' });
  }
});

// ============================================================================
// DYNAMIC PROFESSIONAL COURSES MANAGEMENT
// ============================================================================

coreRouter.get('/courses', requireAuth, (_req, res) => {
  const courses = db.prepare(`
    SELECT crs.*, t.full_name as teacher_name,
           (SELECT COUNT(*) FROM students s WHERE s.course_id = crs.id AND s.deleted_at IS NULL AND s.status = 'active') as enrolled_count
    FROM courses crs
    LEFT JOIN teachers t ON crs.teacher_id = t.id
    WHERE crs.deleted_at IS NULL
    ORDER BY crs.id DESC
  `).all();
  res.json({ items: courses });
});

coreRouter.post('/courses', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.courseName || !b.courseCode || !b.duration || !b.classTiming) {
    return res.status(400).json({ error: 'Course name, code, duration, and class timing are required.' });
  }
  if (b.courseImage && !String(b.courseImage).startsWith('data:image/') && !String(b.courseImage).startsWith('/')) {
    return res.status(400).json({ error: 'Invalid course image format.' });
  }

  try {
    const r = db.prepare(`
      INSERT INTO courses (course_name, course_code, category, duration, course_fee, description, teacher_id, class_timing, max_students, course_image, admission_status, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(b.courseName).trim(),
      String(b.courseCode).trim().toUpperCase(),
      b.category || 'Professional Courses',
      String(b.duration).trim(),
      Number(b.courseFee) || 0,
      b.description || '',
      b.teacherId ? Number(b.teacherId) : null,
      String(b.classTiming).trim(),
      Number(b.maxStudents) || 25,
      b.courseImage || null,
      b.admissionStatus === 'closed' ? 'closed' : 'open',
      b.status === 'inactive' ? 'inactive' : 'active',
    );
    const id = Number(r.lastInsertRowid);
    db.prepare(`INSERT OR IGNORE INTO subjects (subject_name, subject_code, course_id, teacher_id, total_marks) VALUES (?, ?, ?, ?, 100)`).run(
      `${String(b.courseName).trim()} Core`,
      `${String(b.courseCode).trim().toUpperCase()}-CORE`,
      id,
      b.teacherId ? Number(b.teacherId) : null,
    );
    logActivity(req.session!.userId, 'CREATE_COURSE', 'course', id, `Created course ${b.courseName} (${b.courseCode}).`);
    res.status(201).json({ id });
  } catch (err: any) {
    if (String(err?.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'Course code already exists.' });
    }
    throw err;
  }
});

coreRouter.put('/courses/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const existing = db.prepare(`SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL`).get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Course not found.' });

  db.prepare(`
    UPDATE courses SET
      course_name = ?, category = ?, duration = ?, course_fee = ?, description = ?,
      teacher_id = ?, class_timing = ?, max_students = ?, admission_status = ?, status = ?,
      course_image = COALESCE(?, course_image), updated_at = datetime('now')
    WHERE id = ?
  `).run(
    b.courseName ?? existing.course_name,
    b.category ?? existing.category,
    b.duration ?? existing.duration,
    b.courseFee !== undefined ? Number(b.courseFee) : existing.course_fee,
    b.description ?? existing.description,
    b.teacherId ? Number(b.teacherId) : null,
    b.classTiming ?? existing.class_timing,
    b.maxStudents ? Number(b.maxStudents) : existing.max_students,
    b.admissionStatus ?? existing.admission_status,
    b.status ?? existing.status,
    b.courseImage || null,
    id,
  );
  logActivity(req.session!.userId, 'UPDATE_COURSE', 'course', id, `Updated course ${b.courseName ?? existing.course_name}.`);
  res.json({ ok: true });
});

coreRouter.delete('/courses/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE courses SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?`).run(id);
  logActivity(req.session!.userId, 'DELETE_COURSE', 'course', id, `Archived course #${id}.`);
  res.json({ ok: true });
});
