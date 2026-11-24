import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const dbPath = path.join(dataDir, 'sindhtech.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase() {
  db.exec(`
    -- 1. users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      must_change_password INTEGER NOT NULL DEFAULT 1,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. academic_sessions
    CREATE TABLE IF NOT EXISTS academic_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_name TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. teachers
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      teacher_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      father_name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      qualification TEXT NOT NULL,
      specialization TEXT NOT NULL,
      joining_date TEXT NOT NULL,
      salary REAL NOT NULL DEFAULT 0,
      working_hours TEXT NOT NULL DEFAULT '08:00 AM - 02:00 PM',
      profile_picture TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. classes
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_name TEXT NOT NULL,
      class_code TEXT NOT NULL UNIQUE,
      level_order INTEGER NOT NULL DEFAULT 0,
      class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      class_timing TEXT NOT NULL DEFAULT '08:00 AM - 01:30 PM',
      monthly_fee REAL NOT NULL DEFAULT 3000,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. sections
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      section_name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 35,
      room_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(class_id, section_name)
    );

    -- 6. courses
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_name TEXT NOT NULL,
      course_code TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'Professional Courses',
      duration TEXT NOT NULL,
      course_fee REAL NOT NULL DEFAULT 0,
      description TEXT,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      class_timing TEXT NOT NULL,
      max_students INTEGER NOT NULL DEFAULT 25,
      course_image TEXT,
      admission_status TEXT NOT NULL DEFAULT 'open' CHECK (admission_status IN ('open', 'closed')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. subjects
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_name TEXT NOT NULL,
      subject_code TEXT NOT NULL UNIQUE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      total_marks INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. students
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      student_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      father_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
      phone TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      profile_picture TEXT,
      admission_date TEXT NOT NULL,
      education_category TEXT NOT NULL CHECK (education_category IN ('school', 'course', 'both')),
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      assigned_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      monthly_fee REAL NOT NULL DEFAULT 0,
      admission_fee REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. enrollments
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
      education_category TEXT NOT NULL CHECK (education_category IN ('school', 'course', 'both')),
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      enrollment_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'promoted', 'completed', 'dropped')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. attendance
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendee_type TEXT NOT NULL CHECK (attendee_type IN ('student', 'teacher')),
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
      remarks TEXT,
      marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. fees
    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES academic_sessions(id) ON DELETE SET NULL,
      challan_number TEXT NOT NULL UNIQUE,
      fee_type TEXT NOT NULL CHECK (fee_type IN ('monthly', 'admission', 'course', 'exam', 'other')),
      fee_month TEXT,
      base_amount REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      late_fee REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. fee_payments
    CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      receipt_number TEXT NOT NULL UNIQUE,
      amount_paid REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'other')),
      transaction_ref TEXT,
      received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. teacher_salaries
    CREATE TABLE IF NOT EXISTS teacher_salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      salary_month TEXT NOT NULL,
      base_salary REAL NOT NULL,
      bonus REAL NOT NULL DEFAULT 0,
      deduction REAL NOT NULL DEFAULT 0,
      net_salary REAL NOT NULL,
      payment_date TEXT,
      payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'other')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(teacher_id, salary_month)
    );

    -- 14. timetables
    CREATE TABLE IF NOT EXISTS timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      room TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 15. exams
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_name TEXT NOT NULL,
      session_id INTEGER REFERENCES academic_sessions(id) ON DELETE SET NULL,
      education_category TEXT NOT NULL CHECK (education_category IN ('school', 'course')),
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      exam_date TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. marks
    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      subject_name TEXT NOT NULL,
      total_marks REAL NOT NULL,
      obtained_marks REAL NOT NULL,
      percentage REAL NOT NULL,
      grade TEXT NOT NULL,
      remarks TEXT,
      entered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(exam_id, student_id, subject_name)
    );

    -- 17. assignments
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      due_date TEXT NOT NULL,
      attachment_name TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 18. assignment_submissions
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      submission_text TEXT,
      file_name TEXT,
      submitted_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'late')),
      grade_score TEXT,
      teacher_feedback TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(assignment_id, student_id)
    );

    -- 19. notices
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'teachers', 'students', 'class', 'course')),
      target_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      target_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
      published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 20. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 21. leave_requests
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requester_role TEXT NOT NULL CHECK (requester_role IN ('teacher', 'student')),
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 22. activity_logs
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 23. password_resets
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reset_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 24. system_settings
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 25. user_sessions (persistent across server restarts & iframe-safe Bearer auth)
    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      full_name TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 26. credential_ledger (auto-saved Admin sheet of student/teacher Login IDs & Passwords)
    CREATE TABLE IF NOT EXISTS credential_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      id_code TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Teacher', 'Student')),
      full_name TEXT NOT NULL,
      username TEXT NOT NULL,
      issued_password TEXT NOT NULL,
      assigned_target TEXT,
      phone TEXT,
      email TEXT,
      sent_status TEXT NOT NULL DEFAULT 'pending' CHECK (sent_status IN ('pending', 'sent')),
      sent_at TEXT,
      password_status TEXT NOT NULL DEFAULT 'Active Temp Password',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 27. fee_whatsapp_reminders (5th-of-month automated fee reminder queue & dispatch log)
    CREATE TABLE IF NOT EXISTS fee_whatsapp_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      billing_month TEXT NOT NULL,
      student_name TEXT NOT NULL,
      phone_raw TEXT,
      whatsapp_number TEXT,
      message_text TEXT NOT NULL,
      channel_status TEXT NOT NULL DEFAULT 'queued' CHECK (channel_status IN ('queued', 'sent_api', 'sent_manual', 'no_phone')),
      dispatched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(fee_id, billing_month)
    );

    -- 28. student_subjects (subjects chosen per student when enrolled in an Academy Class)
    CREATE TABLE IF NOT EXISTS student_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, subject_id)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date, attendee_type);
    CREATE INDEX IF NOT EXISTS idx_fees_student_status ON fees(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_fee_wa_reminders_status ON fee_whatsapp_reminders(channel_status, billing_month);
    CREATE INDEX IF NOT EXISTS idx_student_subjects_student ON student_subjects(student_id);
  `);

  // Migrate existing SQLite CHECK constraints if students/enrollments predate dual ('both') support
  const studentsTbl = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'students'`).get() as any;
  if (studentsTbl?.sql && !String(studentsTbl.sql).includes(`'both'`)) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN;');
    try {
      db.exec(`
        CREATE TABLE students_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          student_code TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          father_name TEXT NOT NULL,
          dob TEXT NOT NULL,
          gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
          phone TEXT NOT NULL,
          guardian_phone TEXT NOT NULL,
          email TEXT,
          address TEXT,
          profile_picture TEXT,
          admission_date TEXT NOT NULL,
          education_category TEXT NOT NULL CHECK (education_category IN ('school', 'course', 'both')),
          class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
          section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
          course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
          assigned_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
          monthly_fee REAL NOT NULL DEFAULT 0,
          admission_fee REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          deleted_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO students_migrated (
          id, user_id, student_code, full_name, father_name, dob, gender, phone, guardian_phone,
          email, address, profile_picture, admission_date, education_category, class_id, section_id,
          course_id, assigned_teacher_id, monthly_fee, admission_fee, status, deleted_at, created_at, updated_at
        )
        SELECT
          id, user_id, student_code, full_name, father_name, dob, gender, phone, guardian_phone,
          email, address, profile_picture, admission_date, education_category, class_id, section_id,
          course_id, assigned_teacher_id, monthly_fee, admission_fee, status, deleted_at, created_at, updated_at
        FROM students;
        DROP TABLE students;
        ALTER TABLE students_migrated RENAME TO students;

        CREATE TABLE enrollments_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
          education_category TEXT NOT NULL CHECK (education_category IN ('school', 'course', 'both')),
          class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
          section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
          course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
          enrollment_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'promoted', 'completed', 'dropped')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO enrollments_migrated (
          id, student_id, session_id, education_category, class_id, section_id, course_id, enrollment_date, status, created_at, updated_at
        )
        SELECT
          id, student_id, session_id, education_category, class_id, section_id, course_id, enrollment_date, status, created_at, updated_at
        FROM enrollments;
        DROP TABLE enrollments;
        ALTER TABLE enrollments_migrated RENAME TO enrollments;
      `);
      db.exec('COMMIT;');
    } catch (migErr) {
      db.exec('ROLLBACK;');
      throw migErr;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  const adminExists = db.prepare(`SELECT id, full_name FROM users WHERE role = 'admin' LIMIT 1`).get() as any;
  if (!adminExists) {
    seedInitialData();
  } else {
    // Sync Academy & Admin identity on existing DB if still showing legacy placeholder
    if (adminExists.full_name === 'Tariq Mahmood (Principal)') {
      db.prepare(`UPDATE users SET full_name = 'Wajid Ali Kolachi', updated_at = datetime('now') WHERE id = ?`).run(adminExists.id);
    }
    db.prepare(`UPDATE system_settings SET setting_value = 'Academy & Professional Training Center — Pakistan' WHERE setting_key = 'institute_tagline' AND setting_value LIKE 'School Education%'`).run();
    db.prepare(`UPDATE system_settings SET setting_value = 'Block 6, PECHS, Shahrah-e-Faisal, Karachi, Pakistan' WHERE setting_key = 'institute_address' AND setting_value = 'Block 6, PECHS, Shahrah-e-Faisal, Karachi, Sindh'`).run();

    // Ensure credential_ledger has rows for existing teachers & students if newly added table is empty
    const ledgerCount = (db.prepare(`SELECT COUNT(*) as c FROM credential_ledger`).get() as any).c;
    if (ledgerCount === 0) {
      const existingTeachers = db.prepare(`
        SELECT t.user_id, t.teacher_code, t.full_name, u.username, u.must_change_password, t.specialization, t.phone, t.email, t.joining_date
        FROM teachers t JOIN users u ON t.user_id = u.id
        WHERE t.deleted_at IS NULL
      `).all() as any[];
      for (const t of existingTeachers) {
        db.prepare(`
          INSERT OR IGNORE INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at)
          VALUES (?, ?, 'Teacher', ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(
          t.user_id,
          t.teacher_code,
          t.full_name,
          t.username,
          'Teacher@123',
          t.specialization,
          t.phone,
          t.email,
          t.must_change_password ? 'Active Temp Password' : 'User Updated / Demo',
          t.joining_date || new Date().toISOString().slice(0, 10),
        );
      }

      const existingStudents = db.prepare(`
        SELECT s.user_id, s.student_code, s.full_name, u.username, u.must_change_password,
               COALESCE(c.class_name, crs.course_name, 'Academy Program') as target,
               s.phone, s.email, s.admission_date
        FROM students s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN courses crs ON s.course_id = crs.id
        WHERE s.deleted_at IS NULL
      `).all() as any[];
      for (const s of existingStudents) {
        db.prepare(`
          INSERT OR IGNORE INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at)
          VALUES (?, ?, 'Student', ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(
          s.user_id,
          s.student_code,
          s.full_name,
          s.username,
          'Student@123',
          s.target,
          s.phone,
          s.email,
          'Ready to Sign In',
          s.admission_date || new Date().toISOString().slice(0, 10),
        );
      }
    }

    // Ensure every created student & teacher can open their personal dashboard directly on sign-in
    db.prepare(`UPDATE users SET must_change_password = 0 WHERE role IN ('student', 'teacher') AND must_change_password = 1`).run();
    db.prepare(`UPDATE user_sessions SET must_change_password = 0 WHERE role IN ('student', 'teacher') AND must_change_password = 1`).run();
    db.prepare(`UPDATE credential_ledger SET password_status = 'Ready to Sign In' WHERE password_status = 'Active Temp Password'`).run();

    // Migrate legacy usernames to canonical prefixed IDs: ADMINID01, TEACHERID..., STUDENTIDSTI...
    db.prepare(`UPDATE users SET username = 'ADMINID01', updated_at = datetime('now') WHERE role = 'admin' AND lower(username) = 'admin'`).run();
    db.prepare(`UPDATE user_sessions SET username = 'ADMINID01' WHERE role = 'admin' AND lower(username) = 'admin'`).run();

    const studentsToPrefix = db.prepare(`
      SELECT s.user_id, s.student_code, u.username
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE u.username NOT LIKE 'STUDENTID%'
    `).all() as any[];
    for (const s of studentsToPrefix) {
      const normalizedSuffix = String(s.student_code || '').replace(/^STI-STU-/i, 'STI');
      const nextUname = `STUDENTID${normalizedSuffix}`;
      db.prepare(`UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?`).run(nextUname, s.user_id);
      db.prepare(`UPDATE user_sessions SET username = ? WHERE user_id = ?`).run(nextUname, s.user_id);
      db.prepare(`UPDATE credential_ledger SET username = ?, updated_at = datetime('now') WHERE user_id = ?`).run(nextUname, s.user_id);
    }

    const teachersToPrefix = db.prepare(`
      SELECT t.user_id, t.teacher_code, u.username
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      WHERE u.username NOT LIKE 'TEACHERID%'
    `).all() as any[];
    for (const t of teachersToPrefix) {
      const seqPart = String(t.teacher_code || '').replace(/^STI-TEA-/i, '');
      const nextUname = `TEACHERID${seqPart}`;
      db.prepare(`UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?`).run(nextUname, t.user_id);
      db.prepare(`UPDATE user_sessions SET username = ? WHERE user_id = ?`).run(nextUname, t.user_id);
      db.prepare(`UPDATE credential_ledger SET username = ?, updated_at = datetime('now') WHERE user_id = ?`).run(nextUname, t.user_id);
    }

    // One-time idempotent upgrade: add Classes 9-12, full 6th-12th subjects, senior faculty, and refresh student profiles
    const migrated612 = db.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'migration_classes_6_12_v1'`).get() as any;
    if (!migrated612) {
      migrateExistingDbToClasses6to12();
    }
  }
}

function ensureCurriculumClassesAndSubjects(defaultTeachers: { math?: number | null; eng?: number | null; sci?: number | null; comp?: number | null }) {
  const tMath = defaultTeachers.math ?? null;
  const tEng = defaultTeachers.eng ?? tMath;
  const tSci = defaultTeachers.sci ?? tMath;
  const tComp = defaultTeachers.comp ?? tSci;

  const extraClasses = [
    ['Class 9', 'CLS-9', 11, tSci, '08:00 AM - 02:00 PM', 4800, 'R-111', 'R-211'],
    ['Class 10', 'CLS-10', 12, tSci, '08:00 AM - 02:00 PM', 5200, 'R-112', 'R-212'],
    ['Class 11', 'CLS-11', 13, tMath, '08:30 AM - 02:30 PM', 5800, 'R-113', 'R-213'],
    ['Class 12', 'CLS-12', 14, tMath, '08:30 AM - 02:30 PM', 6200, 'R-114', 'R-214'],
  ] as const;

  for (const [name, code, order, tId, timing, fee, r1, r2] of extraClasses) {
    db.prepare(`
      INSERT OR IGNORE INTO classes (class_name, class_code, level_order, class_teacher_id, class_timing, monthly_fee, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(name, code, order, tId, timing, fee);
    const cls = db.prepare(`SELECT id FROM classes WHERE class_code = ?`).get(code) as any;
    if (cls) {
      db.prepare(`INSERT OR IGNORE INTO sections (class_id, section_name, capacity, room_number) VALUES (?, 'Section A', 35, ?)`).run(cls.id, r1);
      db.prepare(`INSERT OR IGNORE INTO sections (class_id, section_name, capacity, room_number) VALUES (?, 'Section B', 35, ?)`).run(cls.id, r2);
    }
  }

  const getClassId = (code: string): number | null =>
    (db.prepare(`SELECT id FROM classes WHERE class_code = ? AND deleted_at IS NULL`).get(code) as any)?.id ?? null;

  const upsertSub = db.prepare(`
    INSERT OR IGNORE INTO subjects (subject_name, subject_code, class_id, teacher_id, total_marks)
    VALUES (?, ?, ?, ?, 100)
  `);

  // Foundation Nursery - Class 5 core subjects
  for (const [code, suffix] of [['NUR', 'NUR'], ['KG', 'KG'], ['CLS-1', '1'], ['CLS-2', '2'], ['CLS-3', '3'], ['CLS-4', '4'], ['CLS-5', '5']] as const) {
    const cid = getClassId(code);
    if (!cid) continue;
    upsertSub.run('English', `ENG-${suffix}`, cid, tEng);
    upsertSub.run('Mathematics', `MATH-${suffix}`, cid, tMath);
    upsertSub.run('Urdu', `URDU-${suffix}`, cid, tEng);
    upsertSub.run(suffix === 'NUR' || suffix === 'KG' ? 'General Knowledge' : 'General Science', `SCI-${suffix}`, cid, tSci);
  }

  // Middle Academy (Class 6, Class 7, Class 8)
  for (const [code, num] of [['CLS-6', '6'], ['CLS-7', '7'], ['CLS-8', '8']] as const) {
    const cid = getClassId(code);
    if (!cid) continue;
    upsertSub.run('English', `ENG-${num}`, cid, tEng);
    upsertSub.run('Mathematics', `MATH-${num}`, cid, tMath);
    upsertSub.run('General Science', `SCI-${num}`, cid, tSci);
    upsertSub.run('Computer Science', `COMP-${num}`, cid, tComp);
    upsertSub.run('Urdu', `URDU-${num}`, cid, tEng);
    upsertSub.run('Islamiat', `ISL-${num}`, cid, tEng);
    upsertSub.run('Social Studies', `SST-${num}`, cid, tEng);
  }

  // Matric & Intermediate (Class 9, Class 10, Class 11, Class 12)
  for (const [code, num, includeIsl, includePst] of [
    ['CLS-9', '9', true, true],
    ['CLS-10', '10', true, true],
    ['CLS-11', '11', true, false],
    ['CLS-12', '12', false, true],
  ] as const) {
    const cid = getClassId(code);
    if (!cid) continue;
    upsertSub.run('English', `ENG-${num}`, cid, tEng);
    upsertSub.run('Mathematics', `MATH-${num}`, cid, tMath);
    upsertSub.run('Physics', `PHY-${num}`, cid, tMath);
    upsertSub.run('Chemistry', `CHEM-${num}`, cid, tSci);
    upsertSub.run('Biology', `BIO-${num}`, cid, tSci);
    upsertSub.run('Computer Science', `COMP-${num}`, cid, tComp);
    upsertSub.run('Urdu', `URDU-${num}`, cid, tEng);
    if (includeIsl) upsertSub.run('Islamiat', `ISL-${num}`, cid, tEng);
    if (includePst) upsertSub.run('Pakistan Studies', `PST-${num}`, cid, tEng);
  }
}

function assignStudentSubjectsByNames(studentId: number, classId: number | null, subjectNames: string[]) {
  if (!classId || subjectNames.length === 0) return;
  const rows = db.prepare(`SELECT id, subject_name FROM subjects WHERE class_id = ?`).all(classId) as Array<{ id: number; subject_name: string }>;
  const wanted = new Set(subjectNames.map((n) => n.toLowerCase()));
  for (const r of rows) {
    if (wanted.has(r.subject_name.toLowerCase())) {
      db.prepare(`INSERT OR IGNORE INTO student_subjects (student_id, subject_id) VALUES (?, ?)`).run(studentId, r.id);
    }
  }
}

function migrateExistingDbToClasses6to12() {
  db.exec('BEGIN;');
  try {
    // 1. Add Senior Wing teachers if not already present
    const seniorTeachers = [
      {
        code: 'STI-TEA-1005',
        username: 'TEACHERID1005',
        name: 'Dr. Tariq Abbasi',
        father: 'Ghulam Mustafa Abbasi',
        gender: 'Male',
        phone: '+92 300 4455112',
        email: 'tariq.abbasi@sindhtech.edu.pk',
        address: 'Gulshan-e-Iqbal Block 7, Karachi',
        qual: 'M.Phil Physics & Mathematics',
        spec: 'Physics & Mathematics (9th–12th)',
        joining: '2025-02-01',
        salary: 74000,
        hours: '08:00 AM - 02:30 PM',
      },
      {
        code: 'STI-TEA-1006',
        username: 'TEACHERID1006',
        name: 'Prof. Nida Jamali',
        father: 'Sikandar Jamali',
        gender: 'Female',
        phone: '+92 331 8899004',
        email: 'nida.jamali@sindhtech.edu.pk',
        address: 'DHA Phase 6, Karachi',
        qual: 'M.Sc Chemistry & BSCS',
        spec: 'Chemistry, Biology & Computer (9th–12th)',
        joining: '2025-03-10',
        salary: 70000,
        hours: '08:30 AM - 02:30 PM',
      },
    ];

    for (const st of seniorTeachers) {
      const exists = db.prepare(`SELECT id FROM teachers WHERE teacher_code = ?`).get(st.code) as any;
      if (!exists) {
        const uRes = db.prepare(`
          INSERT OR IGNORE INTO users (username, email, password_hash, role, full_name, status, must_change_password)
          VALUES (?, ?, ?, 'teacher', ?, 'active', 0)
        `).run(st.username, st.email, hashPassword('Teacher@123'), st.name);
        let uId = Number(uRes.lastInsertRowid);
        if (!uId) {
          uId = Number((db.prepare(`SELECT id FROM users WHERE username = ?`).get(st.username) as any)?.id || 0);
        }
        if (uId) {
          db.prepare(`
            INSERT OR IGNORE INTO teachers (user_id, teacher_code, full_name, father_name, gender, phone, email, address, qualification, specialization, joining_date, salary, working_hours, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
          `).run(uId, st.code, st.name, st.father, st.gender, st.phone, st.email, st.address, st.qual, st.spec, st.joining, st.salary, st.hours);
          db.prepare(`
            INSERT OR IGNORE INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at)
            VALUES (?, ?, 'Teacher', ?, ?, 'Teacher@123', ?, ?, ?, 'pending', 'Ready to Sign In', ?)
          `).run(uId, st.code, st.name, st.username, st.spec, st.phone, st.email, st.joining);
        }
      }
    }

    const t1 = (db.prepare(`SELECT id FROM teachers WHERE teacher_code = 'STI-TEA-1001'`).get() as any)?.id ?? null;
    const t3 = (db.prepare(`SELECT id FROM teachers WHERE teacher_code = 'STI-TEA-1003'`).get() as any)?.id ?? t1;
    const t4 = (db.prepare(`SELECT id FROM teachers WHERE teacher_code = 'STI-TEA-1004'`).get() as any)?.id ?? t1;
    const t5 = (db.prepare(`SELECT id FROM teachers WHERE teacher_code = 'STI-TEA-1005'`).get() as any)?.id ?? t1;
    const t6 = (db.prepare(`SELECT id FROM teachers WHERE teacher_code = 'STI-TEA-1006'`).get() as any)?.id ?? t1;

    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('next_teacher_seq', '1007')`).run();

    // 2. Ensure Classes 6th-12th & all subjects exist
    ensureCurriculumClassesAndSubjects({ math: t5 || t1, eng: t3 || t1, sci: t6 || t1, comp: t4 || t6 || t1 });

    // 3. Helper lookups
    const clsMap: Record<string, { id: number; fee: number; secA: number | null }> = {};
    for (const row of db.prepare(`SELECT id, class_code, monthly_fee FROM classes WHERE deleted_at IS NULL`).all() as any[]) {
      const secA = (db.prepare(`SELECT id FROM sections WHERE class_id = ? ORDER BY id ASC LIMIT 1`).get(row.id) as any)?.id ?? null;
      clsMap[row.class_code] = { id: row.id, fee: row.monthly_fee, secA };
    }

    // 4. Refresh student records so Classes 6th-12th & student details are complete & clean
    const studentUpgrades: Array<{
      code: string;
      fullName: string;
      fatherName: string;
      dob: string;
      gender: 'Male' | 'Female';
      phone: string;
      gPhone: string;
      email: string;
      address: string;
      cat: 'school' | 'course' | 'both';
      classCode: string | null;
      teacherId: number | null;
      subjects: string[];
    }> = [
      {
        code: 'STI-STU-1001',
        fullName: 'Hamza Talpur',
        fatherName: 'Imran Talpur',
        dob: '2012-05-14',
        gender: 'Male',
        phone: '+92 300 1112233',
        gPhone: '+92 300 1112200',
        email: 'hamza.talpur@student.sindhtech.edu.pk',
        address: 'PECHS Block 2, Karachi',
        cat: 'school',
        classCode: 'CLS-8',
        teacherId: t1,
        subjects: ['English', 'Mathematics', 'General Science', 'Computer Science', 'Urdu'],
      },
      {
        code: 'STI-STU-1002',
        fullName: 'Zainab Qureshi',
        fatherName: 'Farooq Qureshi',
        dob: '2012-09-22',
        gender: 'Female',
        phone: '+92 332 4445566',
        gPhone: '+92 332 4445500',
        email: 'zainab.qureshi@student.sindhtech.edu.pk',
        address: 'Bahadurabad, Karachi',
        cat: 'school',
        classCode: 'CLS-8',
        teacherId: t1,
        subjects: ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiat', 'Social Studies'],
      },
      {
        code: 'STI-STU-1003',
        fullName: 'Usman Soomro',
        fatherName: 'Nisar Soomro',
        dob: '2013-02-11',
        gender: 'Male',
        phone: '+92 315 7778899',
        gPhone: '+92 315 7778800',
        email: 'usman.soomro@student.sindhtech.edu.pk',
        address: 'Gulistan-e-Jauhar Block 7, Karachi',
        cat: 'school',
        classCode: 'CLS-7',
        teacherId: t1,
        subjects: ['English', 'Mathematics', 'General Science', 'Computer Science', 'Urdu', 'Islamiat'],
      },
      {
        code: 'STI-STU-1004',
        fullName: 'Ayesha Shaikh',
        fatherName: 'Kamran Shaikh',
        dob: '2014-07-03',
        gender: 'Female',
        phone: '+92 345 2223344',
        gPhone: '+92 345 2223300',
        email: 'ayesha.shaikh@student.sindhtech.edu.pk',
        address: 'DHA Phase 4, Karachi',
        cat: 'school',
        classCode: 'CLS-6',
        teacherId: t1,
        subjects: ['English', 'Mathematics', 'General Science', 'Computer Science', 'Urdu', 'Islamiat'],
      },
      {
        code: 'STI-STU-1007',
        fullName: 'Saad Khoso',
        fatherName: 'Waseem Khoso',
        dob: '2014-08-09',
        gender: 'Male',
        phone: '+92 312 5556677',
        gPhone: '+92 312 5556600',
        email: 'saad.khoso@student.sindhtech.edu.pk',
        address: 'Malir Cantt, Karachi',
        cat: 'school',
        classCode: 'CLS-6',
        teacherId: t1,
        subjects: ['English', 'Mathematics', 'General Science', 'Urdu', 'Social Studies'],
      },
      {
        code: 'STI-STU-1009',
        fullName: 'Bilawal Jamali',
        fatherName: 'Ghulam Qadir Jamali',
        dob: '2011-03-19',
        gender: 'Male',
        phone: '+92 300 9988776',
        gPhone: '+92 300 9988700',
        email: 'bilawal.jamali@student.sindhtech.edu.pk',
        address: 'Latifabad Unit 7, Hyderabad',
        cat: 'school',
        classCode: 'CLS-9',
        teacherId: t5,
        subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Urdu', 'Islamiat'],
      },
      {
        code: 'STI-STU-1010',
        fullName: 'Sana Mir',
        fatherName: 'Tariq Mehmood Mir',
        dob: '2010-06-15',
        gender: 'Female',
        phone: '+92 301 5554433',
        gPhone: '+92 301 5554400',
        email: 'sana.mir@student.sindhtech.edu.pk',
        address: 'North Nazimabad Block D, Karachi',
        cat: 'school',
        classCode: 'CLS-10',
        teacherId: t6,
        subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Urdu', 'Pakistan Studies'],
      },
      {
        code: 'STI-STU-1011',
        fullName: 'Fawad Junejo',
        fatherName: 'Asif Ali Junejo',
        dob: '2009-01-25',
        gender: 'Male',
        phone: '+92 304 6677889',
        gPhone: '+92 304 6677800',
        email: 'fawad.junejo@student.sindhtech.edu.pk',
        address: 'Gulshan-e-Iqbal Block 10, Karachi',
        cat: 'school',
        classCode: 'CLS-11',
        teacherId: t5,
        subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Urdu'],
      },
      {
        code: 'STI-STU-1012',
        fullName: 'Zainab Raza',
        fatherName: 'Salman Raza',
        dob: '2008-11-08',
        gender: 'Female',
        phone: '+92 311 5566778',
        gPhone: '+92 311 5566700',
        email: 'zainab.raza@student.sindhtech.edu.pk',
        address: 'Clifton Block 2, Karachi',
        cat: 'school',
        classCode: 'CLS-12',
        teacherId: t6,
        subjects: ['English', 'Physics', 'Chemistry', 'Biology', 'Urdu', 'Pakistan Studies'],
      },
      {
        code: 'STI-STU-1013',
        fullName: 'Bilal Ahmed',
        fatherName: 'Nadeem Ahmed',
        dob: '2010-04-12',
        gender: 'Male',
        phone: '+92 300 8899112',
        gPhone: '+92 300 8899100',
        email: 'bilal.ahmed@student.sindhtech.edu.pk',
        address: 'Federal B Area Block 14, Karachi',
        cat: 'both',
        classCode: 'CLS-10',
        teacherId: t5,
        subjects: ['English', 'Mathematics', 'Physics', 'Computer Science', 'Pakistan Studies'],
      },
      {
        code: 'STI-STU-1014',
        fullName: 'Sanaullah Memon',
        fatherName: 'Ghulam Memon',
        dob: '2012-05-10',
        gender: 'Male',
        phone: '+92 300 7654321',
        gPhone: '+92 300 7654300',
        email: 'sanaullah.memon@student.sindhtech.edu.pk',
        address: 'Qasimabad Phase 1, Hyderabad',
        cat: 'both',
        classCode: 'CLS-8',
        teacherId: t1,
        subjects: ['English', 'Mathematics', 'General Science', 'Computer Science'],
      },
    ];

    const firstCourse = db.prepare(`SELECT id, course_name, course_fee FROM courses WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`).get() as any;

    for (const su of studentUpgrades) {
      const existing = db.prepare(`SELECT id, user_id, course_id FROM students WHERE student_code = ? AND deleted_at IS NULL`).get(su.code) as any;
      if (!existing) continue;

      const cls = su.classCode ? clsMap[su.classCode] : null;
      const crsId = su.cat === 'both' ? (existing.course_id || firstCourse?.id || null) : null;
      const crsFee = crsId ? Number((db.prepare(`SELECT course_fee FROM courses WHERE id = ?`).get(crsId) as any)?.course_fee || 8500) : 0;
      const mFee = (cls ? cls.fee : 0) + crsFee;
      const clsName = su.classCode ? (db.prepare(`SELECT class_name FROM classes WHERE id = ?`).get(cls!.id) as any)?.class_name : null;
      const crsName = crsId ? (db.prepare(`SELECT course_name FROM courses WHERE id = ?`).get(crsId) as any)?.course_name : null;
      const progName = crsName && clsName ? `${clsName} + ${crsName}` : clsName || crsName || 'Academy Program';
      const targetSummary = `${progName} · ${su.subjects.length} Subjects`;

      db.prepare(`
        UPDATE students SET
          full_name = ?, father_name = ?, dob = ?, gender = ?, phone = ?, guardian_phone = ?,
          email = ?, address = ?, education_category = ?, class_id = ?, section_id = ?, course_id = ?,
          assigned_teacher_id = ?, monthly_fee = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        su.fullName, su.fatherName, su.dob, su.gender, su.phone, su.gPhone,
        su.email, su.address, su.cat, cls?.id || null, cls?.secA || null, crsId,
        su.teacherId, mFee, existing.id,
      );

      db.prepare(`UPDATE users SET full_name = ?, email = ?, updated_at = datetime('now') WHERE id = ?`).run(
        su.fullName, su.email, existing.user_id,
      );
      db.prepare(`
        UPDATE enrollments SET education_category = ?, class_id = ?, section_id = ?, course_id = ?, updated_at = datetime('now')
        WHERE student_id = ? AND status = 'active'
      `).run(su.cat, cls?.id || null, cls?.secA || null, crsId, existing.id);
      db.prepare(`
        UPDATE credential_ledger SET full_name = ?, phone = ?, email = ?, assigned_target = ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(su.fullName, su.phone, su.email, targetSummary, existing.user_id);

      db.prepare(`DELETE FROM student_subjects WHERE student_id = ?`).run(existing.id);
      assignStudentSubjectsByNames(existing.id, cls?.id || null, su.subjects);
    }

    // Add 2 new Senior Wing students (Class 12 Pre-Engineering & Class 9 Pre-Medical) if sequence permits
    const newSeniorStudents = [
      {
        seq: 1015,
        fullName: 'Anum Lashari',
        fatherName: 'Zulfiqar Lashari',
        dob: '2008-08-19',
        gender: 'Female',
        phone: '+92 335 9012345',
        gPhone: '+92 335 9012300',
        email: 'anum.lashari@student.sindhtech.edu.pk',
        address: 'Model Colony, Karachi',
        classCode: 'CLS-12',
        teacherId: t5,
        subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Pakistan Studies'],
      },
      {
        seq: 1016,
        fullName: 'Kashif Solangi',
        fatherName: 'Murtaza Solangi',
        dob: '2011-10-04',
        gender: 'Male',
        phone: '+92 308 7766554',
        gPhone: '+92 308 7766500',
        email: 'kashif.solangi@student.sindhtech.edu.pk',
        address: 'Korangi Crossing, Karachi',
        classCode: 'CLS-9',
        teacherId: t6,
        subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Urdu'],
      },
    ];

    const activeSessionId = (db.prepare(`SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1`).get() as any)?.id || 1;
    for (const ns of newSeniorStudents) {
      const code = `STI-STU-${ns.seq}`;
      const uname = `STUDENTIDSTI${ns.seq}`;
      const already = db.prepare(`SELECT 1 FROM students WHERE student_code = ?`).get(code);
      if (already) continue;
      const cls = clsMap[ns.classCode];
      if (!cls) continue;

      const uRes = db.prepare(`
        INSERT OR IGNORE INTO users (username, email, password_hash, role, full_name, status, must_change_password)
        VALUES (?, ?, ?, 'student', ?, 'active', 0)
      `).run(uname, ns.email, hashPassword('Student@123'), ns.fullName);
      const uId = Number(uRes.lastInsertRowid);
      if (!uId) continue;

      const stRes = db.prepare(`
        INSERT INTO students (
          user_id, student_code, full_name, father_name, dob, gender, phone, guardian_phone,
          email, address, admission_date, education_category, class_id, section_id,
          assigned_teacher_id, monthly_fee, admission_fee, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-11-01', 'school', ?, ?, ?, ?, 5000, 'active')
      `).run(uId, code, ns.fullName, ns.fatherName, ns.dob, ns.gender, ns.phone, ns.gPhone, ns.email, ns.address, cls.id, cls.secA, ns.teacherId, cls.fee);
      const stId = Number(stRes.lastInsertRowid);

      db.prepare(`
        INSERT INTO enrollments (student_id, session_id, education_category, class_id, section_id, enrollment_date, status)
        VALUES (?, ?, 'school', ?, ?, '2026-11-01', 'active')
      `).run(stId, activeSessionId, cls.id, cls.secA);

      assignStudentSubjectsByNames(stId, cls.id, ns.subjects);

      const clsName = (db.prepare(`SELECT class_name FROM classes WHERE id = ?`).get(cls.id) as any)?.class_name || ns.classCode;
      db.prepare(`
        INSERT OR IGNORE INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at)
        VALUES (?, ?, 'Student', ?, ?, 'Student@123', ?, ?, ?, 'pending', 'Ready to Sign In', '2026-11-01')
      `).run(uId, code, ns.fullName, uname, `${clsName} · ${ns.subjects.length} Subjects`, ns.phone, ns.email);

      db.prepare(`
        INSERT OR IGNORE INTO fees (student_id, session_id, challan_number, fee_type, fee_month, base_amount, discount, late_fee, net_amount, paid_amount, remaining_amount, due_date, status, notes)
        VALUES (?, ?, ?, 'monthly', '2026-11', ?, 0, 0, ?, ?, ?, '2026-11-05', ?, '2026-11 Tuition Fee')
      `).run(stId, activeSessionId, `CHL-MON-${ns.seq}`, cls.fee, cls.fee, ns.seq === 1015 ? cls.fee : 0, ns.seq === 1015 ? 0 : cls.fee, ns.seq === 1015 ? 'paid' : 'overdue');
    }

    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('next_student_seq', '1017')`).run();

    // 5. Add sample timetable slots for Classes 9th-12th
    const addTtIfMissing = (day: string, start: string, end: string, teacherId: number | null, classCode: string, subjCode: string, room: string) => {
      if (!teacherId) return;
      const cls = clsMap[classCode];
      const sub = db.prepare(`SELECT id FROM subjects WHERE subject_code = ?`).get(subjCode) as any;
      if (!cls || !sub) return;
      const dup = db.prepare(`SELECT 1 FROM timetables WHERE day_of_week = ? AND start_time = ? AND class_id = ?`).get(day, start, cls.id);
      if (!dup) {
        db.prepare(`
          INSERT INTO timetables (day_of_week, start_time, end_time, teacher_id, class_id, section_id, subject_id, room)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(day, start, end, teacherId, cls.id, cls.secA, sub.id, room);
      }
    };
    addTtIfMissing('Monday', '08:30', '09:30', t5, 'CLS-9', 'PHY-9', 'Lab 1');
    addTtIfMissing('Tuesday', '09:30', '10:30', t6, 'CLS-9', 'CHEM-9', 'Lab 2');
    addTtIfMissing('Monday', '10:30', '11:30', t5, 'CLS-10', 'MATH-10', 'Room 112');
    addTtIfMissing('Wednesday', '09:30', '10:30', t6, 'CLS-10', 'BIO-10', 'Lab 2');
    addTtIfMissing('Tuesday', '11:30', '12:30', t5, 'CLS-11', 'PHY-11', 'Room 113');
    addTtIfMissing('Thursday', '09:30', '10:30', t6, 'CLS-11', 'COMP-11', 'CS Lab');
    addTtIfMissing('Monday', '12:30', '13:30', t5, 'CLS-12', 'MATH-12', 'Room 114');
    addTtIfMissing('Friday', '10:30', '11:30', t6, 'CLS-12', 'CHEM-12', 'Lab 2');

    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('migration_classes_6_12_v1', 'done')`).run();
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function logActivity(userId: number | null, action: string, entityType: string | null, entityId: number | null, details: string, ip = '127.0.0.1') {
  db.prepare(`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, action, entityType, entityId, details, ip);
}

export function createNotification(userId: number, category: string, title: string, message: string) {
  db.prepare(`
    INSERT INTO notifications (user_id, category, title, message)
    VALUES (?, ?, ?, ?)
  `).run(userId, category, title, message);
}

function seedInitialData() {
  db.exec('BEGIN');
  try {
    // System Settings
    const insertSetting = db.prepare(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)`);
    insertSetting.run('institute_name', 'SindhTech Institute');
    insertSetting.run('institute_tagline', 'Academy & Professional Training Center — Pakistan');
    insertSetting.run('institute_phone', '+92 21 3456 7890');
    insertSetting.run('institute_email', 'admin@sindhtech.edu.pk');
    insertSetting.run('institute_address', 'Block 6, PECHS, Shahrah-e-Faisal, Karachi, Pakistan');
    insertSetting.run('currency_symbol', 'PKR');
    insertSetting.run('next_student_seq', '1009');
    insertSetting.run('next_teacher_seq', '1004');

    // Academic Session
    db.prepare(`INSERT INTO academic_sessions (session_name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)`).run(
      '2026-2027',
      '2026-04-01',
      '2027-03-31',
      1,
    );

    // Admin Account (ADMINID01 / admin@sindhtech.edu.pk / Admin@123)
    const adminRes = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, status, must_change_password)
      VALUES (?, ?, ?, 'admin', ?, 'active', 0)
    `).run('ADMINID01', 'admin@sindhtech.edu.pk', hashPassword('Admin@123'), 'Wajid Ali Kolachi');
    const adminUserId = Number(adminRes.lastInsertRowid);

    // Teachers (3 seeded teachers, password Teacher@123)
    const teacherSeed = [
      {
        code: 'STI-TEA-1001',
        username: 'TEACHERID1001',
        name: 'Aisha Siddiqui',
        father: 'Khalid Siddiqui',
        gender: 'Female',
        phone: '+92 301 2345678',
        email: 'aisha.siddiqui@sindhtech.edu.pk',
        address: 'Gulshan-e-Iqbal Block 13-D, Karachi',
        qual: 'M.Sc Mathematics & B.Ed',
        spec: 'Mathematics & Science',
        joining: '2024-03-10',
        salary: 58000,
        hours: '08:00 AM - 02:00 PM',
      },
      {
        code: 'STI-TEA-1002',
        username: 'TEACHERID1002',
        name: 'Bilal Memon',
        father: 'Ghulam Nabi Memon',
        gender: 'Male',
        phone: '+92 333 9876543',
        email: 'bilal.memon@sindhtech.edu.pk',
        address: 'Clifton Block 5, Karachi',
        qual: 'B.S Media Production & Film',
        spec: 'Video Editing & Motion Graphics',
        joining: '2024-08-01',
        salary: 68000,
        hours: '11:00 AM - 06:00 PM',
      },
      {
        code: 'STI-TEA-1003',
        username: 'TEACHERID1003',
        name: 'Sanaullah Bhutto',
        father: 'Abdul Rahim Bhutto',
        gender: 'Male',
        phone: '+92 321 4455667',
        email: 'sanaullah.bhutto@sindhtech.edu.pk',
        address: 'North Nazimabad Block H, Karachi',
        qual: 'M.A English Literature',
        spec: 'English & Early Childhood Education',
        joining: '2025-01-15',
        salary: 52000,
        hours: '08:00 AM - 02:00 PM',
      },
    ];

    const teacherIds: number[] = [];
    const teacherUserIds: number[] = [];
    for (const t of teacherSeed) {
      const uRes = db.prepare(`
        INSERT INTO users (username, email, password_hash, role, full_name, status, must_change_password)
        VALUES (?, ?, ?, 'teacher', ?, 'active', 0)
      `).run(t.username, t.email, hashPassword('Teacher@123'), t.name);
      const uId = Number(uRes.lastInsertRowid);
      teacherUserIds.push(uId);

      const tRes = db.prepare(`
        INSERT INTO teachers (user_id, teacher_code, full_name, father_name, gender, phone, email, address, qualification, specialization, joining_date, salary, working_hours, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(uId, t.code, t.name, t.father, t.gender, t.phone, t.email, t.address, t.qual, t.spec, t.joining, t.salary, t.hours);
      teacherIds.push(Number(tRes.lastInsertRowid));

      db.prepare(`
        INSERT INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at)
        VALUES (?, ?, 'Teacher', ?, ?, 'Teacher@123', ?, ?, ?, 'pending', 'Demo Account', ?)
      `).run(uId, t.code, t.name, t.username, t.spec, t.phone, t.email, t.joining);
    }

    // Classes Nursery -> Class 12 (including full 6th-12th Academy Wing)
    const classDefs = [
      ['Nursery', 'NUR', 1, teacherIds[2], '08:00 AM - 12:00 PM', 2500],
      ['KG', 'KG', 2, teacherIds[2], '08:00 AM - 12:30 PM', 2700],
      ['Class 1', 'CLS-1', 3, teacherIds[2], '08:00 AM - 01:00 PM', 3000],
      ['Class 2', 'CLS-2', 4, teacherIds[2], '08:00 AM - 01:00 PM', 3000],
      ['Class 3', 'CLS-3', 5, teacherIds[0], '08:00 AM - 01:30 PM', 3200],
      ['Class 4', 'CLS-4', 6, teacherIds[0], '08:00 AM - 01:30 PM', 3200],
      ['Class 5', 'CLS-5', 7, teacherIds[0], '08:00 AM - 01:30 PM', 3500],
      ['Class 6', 'CLS-6', 8, teacherIds[0], '08:00 AM - 02:00 PM', 3800],
      ['Class 7', 'CLS-7', 9, teacherIds[0], '08:00 AM - 02:00 PM', 4000],
      ['Class 8', 'CLS-8', 10, teacherIds[0], '08:00 AM - 02:00 PM', 4200],
      ['Class 9', 'CLS-9', 11, teacherIds[0], '08:00 AM - 02:00 PM', 4800],
      ['Class 10', 'CLS-10', 12, teacherIds[0], '08:00 AM - 02:00 PM', 5200],
      ['Class 11', 'CLS-11', 13, teacherIds[0], '08:30 AM - 02:30 PM', 5800],
      ['Class 12', 'CLS-12', 14, teacherIds[0], '08:30 AM - 02:30 PM', 6200],
    ] as const;

    const classIds: number[] = [];
    const sectionIds: Record<number, number> = {};
    for (const [name, code, order, tId, timing, fee] of classDefs) {
      const cRes = db.prepare(`
        INSERT INTO classes (class_name, class_code, level_order, class_teacher_id, class_timing, monthly_fee, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(name, code, order, tId, timing, fee);
      const cid = Number(cRes.lastInsertRowid);
      classIds.push(cid);
      const secA = db.prepare(`INSERT INTO sections (class_id, section_name, capacity, room_number) VALUES (?, 'Section A', 35, ?)`).run(cid, `R-${100 + order}`);
      db.prepare(`INSERT INTO sections (class_id, section_name, capacity, room_number) VALUES (?, 'Section B', 35, ?)`).run(cid, `R-${200 + order}`);
      sectionIds[cid] = Number(secA.lastInsertRowid);
    }

    // Initial Professional Course: Video Editing
    const courseRes = db.prepare(`
      INSERT INTO courses (course_name, course_code, category, duration, course_fee, description, teacher_id, class_timing, max_students, course_image, admission_status, status)
      VALUES (?, ?, 'Professional Courses', ?, ?, ?, ?, ?, ?, ?, 'open', 'active')
    `).run(
      'Video Editing',
      'VID-101',
      '3 Months',
      8500,
      'Hands-on non-linear video editing, DaVinci Resolve color grading, Premiere Pro workflow, motion graphics, and audio mixing for commercial media.',
      teacherIds[1],
      '03:00 PM - 05:00 PM',
      25,
      '/src/assets/images/course_video_editing_1794654887894.jpg',
    );
    const videoCourseId = Number(courseRes.lastInsertRowid);

    // Full curriculum subjects for Classes Nursery-12
    ensureCurriculumClassesAndSubjects({
      math: teacherIds[0],
      eng: teacherIds[2],
      sci: teacherIds[0],
      comp: teacherIds[1],
    });
    const subjMath8 = Number((db.prepare(`SELECT id FROM subjects WHERE subject_code = 'MATH-8'`).get() as any).id);
    const subjSci8 = Number((db.prepare(`SELECT id FROM subjects WHERE subject_code = 'SCI-8'`).get() as any).id);
    const subjEng8 = Number((db.prepare(`SELECT id FROM subjects WHERE subject_code = 'ENG-8'`).get() as any).id);
    const subjEng5 = Number((db.prepare(`SELECT id FROM subjects WHERE subject_code = 'ENG-5'`).get() as any).id);
    const subjVid = Number(
      db.prepare(`INSERT INTO subjects (subject_name, subject_code, course_id, teacher_id, total_marks) VALUES ('Timeline & Color Grading', 'VID-MOD1', ?, ?, 100)`).run(videoCourseId, teacherIds[1]).lastInsertRowid,
    );

    // Seeded Students spanning Classes 6th-12th & Video Editing (password Student@123)
    const studentSeeds = [
      { seq: 1001, name: 'Hamza Talpur', father: 'Imran Talpur', dob: '2012-05-14', gender: 'Male', phone: '+92 300 1112233', gPhone: '+92 300 1112200', email: 'hamza.talpur@student.sindhtech.edu.pk', addr: 'PECHS Block 2, Karachi', adm: '2026-04-05', cat: 'school', clsIdx: 9, crsId: null, tIdx: 0, mFee: 4200, aFee: 5000, subjects: ['English', 'Mathematics', 'General Science', 'Computer Science', 'Urdu'] },
      { seq: 1002, name: 'Zainab Qureshi', father: 'Farooq Qureshi', dob: '2012-09-22', gender: 'Female', phone: '+92 332 4445566', gPhone: '+92 332 4445500', email: 'zainab.qureshi@student.sindhtech.edu.pk', addr: 'Bahadurabad, Karachi', adm: '2026-04-06', cat: 'school', clsIdx: 9, crsId: null, tIdx: 0, mFee: 4200, aFee: 5000, subjects: ['English', 'Mathematics', 'General Science', 'Urdu', 'Islamiat', 'Social Studies'] },
      { seq: 1003, name: 'Usman Soomro', father: 'Nisar Soomro', dob: '2013-02-11', gender: 'Male', phone: '+92 315 7778899', gPhone: '+92 315 7778800', email: 'usman.soomro@student.sindhtech.edu.pk', addr: 'Gulistan-e-Jauhar Block 7, Karachi', adm: '2026-04-10', cat: 'school', clsIdx: 8, crsId: null, tIdx: 0, mFee: 4000, aFee: 5000, subjects: ['English', 'Mathematics', 'General Science', 'Computer Science', 'Urdu'] },
      { seq: 1004, name: 'Ayesha Shaikh', father: 'Kamran Shaikh', dob: '2014-07-03', gender: 'Female', phone: '+92 345 2223344', gPhone: '+92 345 2223300', email: 'ayesha.shaikh@student.sindhtech.edu.pk', addr: 'DHA Phase 4, Karachi', adm: '2026-04-12', cat: 'school', clsIdx: 7, crsId: null, tIdx: 2, mFee: 3800, aFee: 4000, subjects: ['English', 'Mathematics', 'General Science', 'Computer Science', 'Urdu', 'Islamiat'] },
      { seq: 1005, name: 'Danish Laghari', father: 'Sajjad Laghari', dob: '2004-11-18', gender: 'Male', phone: '+92 302 8889911', gPhone: '+92 302 8889900', email: 'danish.laghari@student.sindhtech.edu.pk', addr: 'Nazimabad No. 3, Karachi', adm: '2026-08-15', cat: 'course', clsIdx: null, crsId: videoCourseId, tIdx: 1, mFee: 8500, aFee: 2000, subjects: [] },
      { seq: 1006, name: 'Mariam Chandio', father: 'Tariq Chandio', dob: '2005-03-27', gender: 'Female', phone: '+92 334 6667788', gPhone: '+92 334 6667700', email: 'mariam.chandio@student.sindhtech.edu.pk', addr: 'Federal B Area Block 10, Karachi', adm: '2026-09-02', cat: 'course', clsIdx: null, crsId: videoCourseId, tIdx: 1, mFee: 8500, aFee: 2000, subjects: [] },
      { seq: 1007, name: 'Saad Khoso', father: 'Waseem Khoso', dob: '2011-08-09', gender: 'Male', phone: '+92 312 5556677', gPhone: '+92 312 5556600', email: 'saad.khoso@student.sindhtech.edu.pk', addr: 'Malir Cantt, Karachi', adm: '2026-09-18', cat: 'school', clsIdx: 10, crsId: null, tIdx: 0, mFee: 4800, aFee: 5000, subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Urdu'] },
      { seq: 1008, name: 'Hira Jatoi', father: 'Aslam Jatoi', dob: '2009-12-30', gender: 'Female', phone: '+92 322 3334455', gPhone: '+92 322 3334400', email: 'hira.jatoi@student.sindhtech.edu.pk', addr: 'Clifton Block 8, Karachi', adm: '2026-10-05', cat: 'school', clsIdx: 12, crsId: null, tIdx: 0, mFee: 5800, aFee: 5000, subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Computer Science'] },
      { seq: 1009, name: 'Bilawal Jamali', father: 'Ghulam Qadir Jamali', dob: '2010-03-19', gender: 'Male', phone: '+92 300 9988776', gPhone: '+92 300 9988700', email: 'bilawal.jamali@student.sindhtech.edu.pk', addr: 'Latifabad Unit 7, Hyderabad', adm: '2026-10-10', cat: 'school', clsIdx: 11, crsId: null, tIdx: 0, mFee: 5200, aFee: 5000, subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Urdu'] },
      { seq: 1010, name: 'Zainab Raza', father: 'Salman Raza', dob: '2008-11-08', gender: 'Female', phone: '+92 311 5566778', gPhone: '+92 311 5566700', email: 'zainab.raza@student.sindhtech.edu.pk', addr: 'Clifton Block 2, Karachi', adm: '2026-10-12', cat: 'school', clsIdx: 13, crsId: null, tIdx: 0, mFee: 6200, aFee: 5000, subjects: ['English', 'Physics', 'Chemistry', 'Biology', 'Urdu', 'Pakistan Studies'] },
      { seq: 1011, name: 'Sanaullah Memon', father: 'Ghulam Memon', dob: '2010-05-10', gender: 'Male', phone: '+92 300 7654321', gPhone: '+92 300 7654300', email: 'sanaullah.memon@student.sindhtech.edu.pk', addr: 'Qasimabad Phase 1, Hyderabad', adm: '2026-10-15', cat: 'both', clsIdx: 11, crsId: videoCourseId, tIdx: 1, mFee: 13700, aFee: 5000, subjects: ['English', 'Mathematics', 'Physics', 'Computer Science'] },
    ];

    const studentIds: number[] = [];
    const studentUserIds: number[] = [];
    for (const s of studentSeeds) {
      const code = `STI-STU-${s.seq}`;
      const uname = `STUDENTIDSTI${s.seq}`;
      const uRes = db.prepare(`
        INSERT INTO users (username, email, password_hash, role, full_name, status, must_change_password)
        VALUES (?, ?, ?, 'student', ?, 'active', 0)
      `).run(uname, s.email, hashPassword('Student@123'), s.name);
      const uId = Number(uRes.lastInsertRowid);
      studentUserIds.push(uId);

      const clsId = s.clsIdx !== null ? classIds[s.clsIdx] : null;
      const secId = clsId ? sectionIds[clsId] : null;
      const stRes = db.prepare(`
        INSERT INTO students (
          user_id, student_code, full_name, father_name, dob, gender, phone, guardian_phone,
          email, address, admission_date, education_category, class_id, section_id, course_id,
          assigned_teacher_id, monthly_fee, admission_fee, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        uId, code, s.name, s.father, s.dob, s.gender, s.phone, s.gPhone,
        s.email, s.addr, s.adm, s.cat, clsId, secId, s.crsId,
        teacherIds[s.tIdx], s.mFee, s.aFee,
      );
      const stId = Number(stRes.lastInsertRowid);
      studentIds.push(stId);

      assignStudentSubjectsByNames(stId, clsId, s.subjects);

      db.prepare(`
        INSERT INTO enrollments (student_id, session_id, education_category, class_id, section_id, course_id, enrollment_date, status)
        VALUES (?, 1, ?, ?, ?, ?, ?, 'active')
      `).run(stId, s.cat, clsId, secId, s.crsId, s.adm);

      const baseTargetName = s.clsIdx !== null && s.crsId ? `${classDefs[s.clsIdx][0]} + Video Editing` : s.clsIdx !== null ? classDefs[s.clsIdx][0] : 'Video Editing';
      const targetName = s.subjects.length > 0 ? `${baseTargetName} · ${s.subjects.length} Subjects` : baseTargetName;
      db.prepare(`
        INSERT INTO credential_ledger (user_id, id_code, role, full_name, username, issued_password, assigned_target, phone, email, sent_status, password_status, created_at)
        VALUES (?, ?, 'Student', ?, ?, 'Student@123', ?, ?, ?, 'pending', 'Ready to Sign In', ?)
      `).run(uId, code, s.name, uname, targetName, s.phone, s.email, s.adm);
    }
    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('next_student_seq', '1012')`).run();
    db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('migration_classes_6_12_v1', 'done')`).run();

    // Seed Fees & Payments across multiple months for realistic charts & pending/paid balances
    const months = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    let challanSeq = 5001;
    let receiptSeq = 9001;

    for (let idx = 0; idx < studentIds.length; idx++) {
      const stId = studentIds[idx];
      const base = studentSeeds[idx].mFee;
      for (let mIdx = 0; mIdx < months.length; mIdx++) {
        const month = months[mIdx];
        // Only bill months after or on admission
        if (studentSeeds[idx].adm.slice(0, 7) > month) continue;
        const challan = `CHL-${challanSeq++}`;
        const isCurrentMonth = month === '2026-11';
        const isPartial = isCurrentMonth && idx % 3 === 1;
        const isUnpaid = isCurrentMonth && idx % 3 === 2;
        const paid = isUnpaid ? 0 : isPartial ? Math.round(base / 2) : base;
        const remaining = base - paid;
        const status = remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';

        const feeRes = db.prepare(`
          INSERT INTO fees (student_id, session_id, challan_number, fee_type, fee_month, base_amount, discount, late_fee, net_amount, paid_amount, remaining_amount, due_date, status, notes)
          VALUES (?, 1, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
        `).run(
          stId,
          challan,
          studentSeeds[idx].cat === 'course' ? 'course' : 'monthly',
          month,
          base,
          base,
          paid,
          remaining,
          `${month}-05`,
          status,
          `${month} Tuition Fee`,
        );

        if (paid > 0) {
          db.prepare(`
            INSERT INTO fee_payments (fee_id, student_id, receipt_number, amount_paid, payment_date, payment_method, transaction_ref, received_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            Number(feeRes.lastInsertRowid),
            stId,
            `RCPT-${receiptSeq++}`,
            paid,
            `${month}-0${(idx % 8) + 2}`,
            idx % 2 === 0 ? 'cash' : 'bank_transfer',
            idx % 2 === 0 ? 'CASH-DESK' : `IBFT-${8820 + receiptSeq}`,
            adminUserId,
          );
        }
      }
    }

    // Teacher Salaries for October & November 2026
    for (let i = 0; i < teacherIds.length; i++) {
      const sal = teacherSeed[i].salary;
      db.prepare(`
        INSERT INTO teacher_salaries (teacher_id, salary_month, base_salary, bonus, deduction, net_salary, payment_date, payment_method, status)
        VALUES (?, '2026-10', ?, 2000, 0, ?, '2026-10-31', 'bank_transfer', 'paid')
      `).run(teacherIds[i], sal, sal + 2000);
      db.prepare(`
        INSERT INTO teacher_salaries (teacher_id, salary_month, base_salary, bonus, deduction, net_salary, status)
        VALUES (?, '2026-11', ?, 0, 0, ?, 'pending')
      `).run(teacherIds[i], sal, sal);
    }

    // Attendance records for today (2026-11-14) and recent days
    const recentDates = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
    for (const d of recentDates) {
      for (let i = 0; i < studentIds.length; i++) {
        const status = i === 6 && d === '2026-11-14' ? 'absent' : i === 2 && d === '2026-11-13' ? 'late' : 'present';
        const clsId = studentSeeds[i].clsIdx !== null ? classIds[studentSeeds[i].clsIdx!] : null;
        db.prepare(`
          INSERT INTO attendance (attendee_type, student_id, class_id, course_id, attendance_date, status, marked_by)
          VALUES ('student', ?, ?, ?, ?, ?, ?)
        `).run(studentIds[i], clsId, studentSeeds[i].crsId, d, status, teacherUserIds[studentSeeds[i].tIdx]);
      }
      for (let i = 0; i < teacherIds.length; i++) {
        db.prepare(`
          INSERT INTO attendance (attendee_type, teacher_id, attendance_date, status, marked_by)
          VALUES ('teacher', ?, ?, 'present', ?)
        `).run(teacherIds[i], d, adminUserId);
      }
    }

    // Timetables
    const ttSlots = [
      ['Monday', '08:30', '09:30', teacherIds[0], classIds[9], sectionIds[classIds[9]], null, subjMath8, 'Room 110'],
      ['Monday', '09:30', '10:30', teacherIds[2], classIds[9], sectionIds[classIds[9]], null, subjEng8, 'Room 110'],
      ['Tuesday', '08:30', '09:30', teacherIds[0], classIds[9], sectionIds[classIds[9]], null, subjSci8, 'Lab 2'],
      ['Wednesday', '10:30', '11:30', teacherIds[2], classIds[6], sectionIds[classIds[6]], null, subjEng5, 'Room 107'],
      ['Monday', '15:00', '17:00', teacherIds[1], null, null, videoCourseId, subjVid, 'Media Lab 1'],
      ['Wednesday', '15:00', '17:00', teacherIds[1], null, null, videoCourseId, subjVid, 'Media Lab 1'],
      ['Friday', '15:00', '17:00', teacherIds[1], null, null, videoCourseId, subjVid, 'Media Lab 1'],
    ] as const;

    for (const slot of ttSlots) {
      db.prepare(`
        INSERT INTO timetables (day_of_week, start_time, end_time, teacher_id, class_id, section_id, course_id, subject_id, room)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...slot);
    }

    // Exams & Marks
    const exam8Id = Number(
      db.prepare(`
        INSERT INTO exams (exam_name, session_id, education_category, class_id, exam_date, is_published)
        VALUES ('Mid-Term Examination 2026', 1, 'school', ?, '2026-10-20', 1)
      `).run(classIds[9]).lastInsertRowid,
    );
    const examVidId = Number(
      db.prepare(`
        INSERT INTO exams (exam_name, session_id, education_category, course_id, exam_date, is_published)
        VALUES ('Video Editing Practical Assessment', 1, 'course', ?, '2026-11-25', 0)
      `).run(videoCourseId).lastInsertRowid,
    );

    const markRows = [
      [exam8Id, studentIds[0], subjMath8, 'Mathematics', 100, 91, 91, 'A+', 'Outstanding', teacherUserIds[0]],
      [exam8Id, studentIds[0], subjSci8, 'General Science', 100, 86, 86, 'A', 'Excellent', teacherUserIds[0]],
      [exam8Id, studentIds[0], subjEng8, 'English', 100, 82, 82, 'A', 'Excellent', teacherUserIds[2]],
      [exam8Id, studentIds[1], subjMath8, 'Mathematics', 100, 94, 94, 'A+', 'Outstanding', teacherUserIds[0]],
      [exam8Id, studentIds[1], subjSci8, 'General Science', 100, 89, 89, 'A', 'Excellent', teacherUserIds[0]],
      [exam8Id, studentIds[1], subjEng8, 'English', 100, 90, 90, 'A+', 'Outstanding', teacherUserIds[2]],
      [examVidId, studentIds[4], subjVid, 'Timeline & Color Grading', 100, 88, 88, 'A', 'Excellent', teacherUserIds[1]],
    ] as const;

    for (const m of markRows) {
      db.prepare(`
        INSERT INTO marks (exam_id, student_id, subject_id, subject_name, total_marks, obtained_marks, percentage, grade, remarks, entered_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...m);
    }

    // Assignments & Submissions
    const assign1 = Number(
      db.prepare(`
        INSERT INTO assignments (title, description, teacher_id, class_id, due_date, attachment_name, status)
        VALUES ('Linear Equations Problem Set #4', 'Solve exercises 4.1 to 4.3 in your notebook and submit clear scanned answers.', ?, ?, '2026-11-20', 'algebra_sheet_4.pdf', 'open')
      `).run(teacherIds[0], classIds[9]).lastInsertRowid,
    );
    const assign2 = Number(
      db.prepare(`
        INSERT INTO assignments (title, description, teacher_id, course_id, due_date, attachment_name, status)
        VALUES ('60-Second Commercial Cut & Color Grade', 'Assemble provided B-roll, sync background score, and apply Rec.709 color grade.', ?, ?, '2026-11-22', 'commercial_brief.zip', 'open')
      `).run(teacherIds[1], videoCourseId).lastInsertRowid,
    );

    db.prepare(`
      INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_name, submitted_at, status, grade_score, teacher_feedback)
      VALUES (?, ?, 'Completed all 15 questions with step-by-step graphs.', 'hamza_algebra4.pdf', '2026-11-13 14:20:00', 'graded', '19/20', 'Very neat presentation.')
    `).run(assign1, studentIds[0]);

    db.prepare(`
      INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_name, submitted_at, status)
      VALUES (?, ?, 'Uploaded H.264 1080p master cut and DaVinci node tree screenshot.', 'danish_commercial_v1.mp4', '2026-11-14 10:05:00', 'submitted')
    `).run(assign2, studentIds[4]);

    // Notices
    db.prepare(`
      INSERT INTO notices (title, content, target_audience, priority, published_by)
      VALUES ('Winter Academic Timing Adjustment', 'Effective Monday, morning school assembly begins at 08:15 AM. Afternoon professional courses remain unchanged.', 'all', 'important', ?)
    `).run(adminUserId);
    db.prepare(`
      INSERT INTO notices (title, content, target_audience, target_course_id, priority, published_by)
      VALUES ('Media Lab Workstation Calibration', 'Video Editing Cohort: Media Lab 1 workstations have been upgraded to DaVinci Resolve 19 Studio for your upcoming practical exam.', 'course', ?, 'normal', ?)
    `).run(videoCourseId, adminUserId);
    db.prepare(`
      INSERT INTO notices (title, content, target_audience, priority, published_by)
      VALUES ('Faculty Monthly Evaluation Meeting', 'All school and technical course instructors are requested to attend the curriculum review on Saturday at 02:30 PM.', 'teachers', 'urgent', ?)
    `).run(adminUserId);

    // Notifications
    for (const uId of [...teacherUserIds, ...studentUserIds]) {
      createNotification(uId, 'notice', 'Welcome to SindhTech Portal', 'Winter timing adjustment notice has been published by administration.');
    }
    createNotification(studentUserIds[0], 'result', 'Mid-Term Results Published', 'Your Class 8 Mid-Term Examination 2026 result card is now available.');

    // Leave Request
    db.prepare(`
      INSERT INTO leave_requests (user_id, requester_role, leave_type, start_date, end_date, reason, status)
      VALUES (?, 'teacher', 'Casual Leave', '2026-11-18', '2026-11-18', 'Attending family ceremony in Hyderabad.', 'pending')
    `).run(teacherUserIds[2]);

    logActivity(adminUserId, 'SYSTEM_SEED', 'system', null, 'Initialized SindhTech Institute relational database with default classes, Video Editing course, teachers, and students.');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
