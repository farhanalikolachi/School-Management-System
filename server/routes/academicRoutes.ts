import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import * as XLSX from 'xlsx';
import { db, logActivity, createNotification } from '../db';
import { type AuthedRequest, requireAuth, requireRole, verifyCsrf } from '../auth';
import {
  calculateNetFee,
  calculateFeeBalance,
  validatePaymentAmount,
  calculatePercentage,
  calculateGrade,
  findTimetableConflict,
  isFeePastFifthDueDate,
  buildFeeReminderMessage,
  normalizePkWhatsAppNumber,
  formatProgramLabel,
} from '../../src/lib/domain';

export const academicRouter = Router();

function isWhatsAppCloudConfigured(): boolean {
  const token = String(process.env.WHATSAPP_CLOUD_TOKEN || '').trim();
  const phoneId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  return Boolean(token && phoneId && token !== '""' && phoneId !== '""');
}

async function sendViaWhatsAppCloudApi(toDigits: string, textBody: string): Promise<boolean> {
  if (!isWhatsAppCloudConfigured()) return false;
  const token = String(process.env.WHATSAPP_CLOUD_TOKEN).trim();
  const phoneId = String(process.env.WHATSAPP_PHONE_NUMBER_ID).trim();
  try {
    const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'text',
        text: { body: textBody },
      }),
    });
    return resp.ok;
  } catch (err) {
    console.error('[WhatsApp Cloud API Dispatch Error]', err);
    return false;
  }
}

export async function runFifthDateFeeReminderJob(
  triggeredByUserId: number | null = null,
  referenceDateOverride?: string,
): Promise<{ checked: number; created: number; sentViaApi: number; queuedForWhatsApp: number }> {
  const refDate = (referenceDateOverride || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const unpaidFees = db.prepare(`
    SELECT f.id as fee_id, f.student_id, f.challan_number, f.fee_month, f.due_date,
           f.remaining_amount, f.status,
           s.user_id, s.student_code, s.full_name, s.phone, s.guardian_phone, s.education_category,
           c.class_name, crs.course_name
    FROM fees f
    JOIN students s ON f.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    WHERE f.remaining_amount > 0
      AND f.status != 'paid'
      AND s.deleted_at IS NULL
      AND s.status = 'active'
  `).all() as any[];

  let created = 0;
  let sentViaApi = 0;
  let queuedForWhatsApp = 0;

  for (const row of unpaidFees) {
    const overdue = isFeePastFifthDueDate(
      {
        dueDate: row.due_date,
        feeMonth: row.fee_month,
        remainingAmount: row.remaining_amount,
        status: row.status,
      },
      refDate,
    );
    if (!overdue) continue;

    if (row.status === 'pending') {
      db.prepare(`UPDATE fees SET status = 'overdue', updated_at = datetime('now') WHERE id = ?`).run(row.fee_id);
    }

    const billingMonth = row.fee_month || (row.due_date ? String(row.due_date).slice(0, 7) : refDate.slice(0, 7));
    const alreadyExists = db
      .prepare(`SELECT id FROM fee_whatsapp_reminders WHERE fee_id = ? AND billing_month = ?`)
      .get(row.fee_id, billingMonth);
    if (alreadyExists) continue;

    const waNumber = normalizePkWhatsAppNumber(row.phone) || normalizePkWhatsAppNumber(row.guardian_phone);
    const programName = formatProgramLabel(row.class_name, row.course_name, row.education_category);
    const messageText = buildFeeReminderMessage({
      studentName: row.full_name,
      studentCode: row.student_code,
      challanNumber: row.challan_number,
      feeMonth: billingMonth,
      remainingAmount: row.remaining_amount,
      programName,
      dueDate: row.due_date,
    });

    let channelStatus: 'queued' | 'sent_api' | 'no_phone' = waNumber ? 'queued' : 'no_phone';
    let dispatchedAt: string | null = null;

    if (waNumber && isWhatsAppCloudConfigured()) {
      const ok = await sendViaWhatsAppCloudApi(waNumber, messageText);
      if (ok) {
        channelStatus = 'sent_api';
        dispatchedAt = new Date().toISOString();
        sentViaApi++;
      } else {
        queuedForWhatsApp++;
      }
    } else if (waNumber) {
      queuedForWhatsApp++;
    }

    db.prepare(`
      INSERT INTO fee_whatsapp_reminders (
        fee_id, student_id, billing_month, student_name, phone_raw, whatsapp_number, message_text, channel_status, dispatched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.fee_id,
      row.student_id,
      billingMonth,
      row.full_name,
      row.phone || row.guardian_phone || '',
      waNumber,
      messageText,
      channelStatus,
      dispatchedAt,
    );

    createNotification(
      row.user_id,
      'fee',
      `Fee Reminder: ${row.full_name}`,
      `${billingMonth} challan ${row.challan_number} (PKR ${Math.round(row.remaining_amount).toLocaleString()}) is past the 5th-of-month due date. Please clear your fee.`,
    );
    created++;
  }

  if (created > 0 && triggeredByUserId) {
    logActivity(
      triggeredByUserId,
      'FEE_WHATSAPP_REMINDER_CHECK',
      'fee',
      null,
      `Generated ${created} 5th-date fee WhatsApp reminder(s) (${sentViaApi} API sent, ${queuedForWhatsApp} queued).`,
    );
  }

  return {
    checked: unpaidFees.length,
    created,
    sentViaApi,
    queuedForWhatsApp,
  };
}

function getTeacherByUserId(userId: number) {
  return db.prepare(`SELECT * FROM teachers WHERE user_id = ? AND deleted_at IS NULL`).get(userId) as any;
}

function getStudentByUserId(userId: number) {
  return db.prepare(`SELECT * FROM students WHERE user_id = ? AND deleted_at IS NULL`).get(userId) as any;
}

// ============================================================================
// FEES & PAYMENTS MANAGEMENT
// ============================================================================

academicRouter.get('/fees', requireAuth, requireRole('admin', 'student'), (req: AuthedRequest, res) => {
  const { status = '', feeType = '', search = '', studentId = '' } = req.query as Record<string, string>;
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (req.session!.role === 'student') {
    const st = getStudentByUserId(req.session!.userId);
    if (!st) return res.json({ items: [], payments: [] });
    where.push('f.student_id = ?');
    params.push(st.id);
  } else if (studentId) {
    where.push('f.student_id = ?');
    params.push(Number(studentId));
  }

  if (status) {
    where.push('f.status = ?');
    params.push(status);
  }
  if (feeType) {
    where.push('f.fee_type = ?');
    params.push(feeType);
  }
  if (search) {
    where.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR f.challan_number LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  const items = db.prepare(`
    SELECT f.*, s.student_code, s.full_name, s.father_name, s.phone, s.guardian_phone,
           CASE
             WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
             ELSE COALESCE(c.class_name, crs.course_name, 'General')
           END as enrolled_in
    FROM fees f
    JOIN students s ON f.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    WHERE ${where.join(' AND ')}
    ORDER BY f.id DESC
  `).all(...params);

  const payWhere = req.session!.role === 'student' ? 'WHERE fp.student_id = ?' : '';
  const payParams = req.session!.role === 'student' ? [params[0]] : [];

  const payments = db.prepare(`
    SELECT fp.*, s.student_code, s.full_name, f.challan_number, f.fee_type, f.fee_month
    FROM fee_payments fp
    JOIN students s ON fp.student_id = s.id
    JOIN fees f ON fp.fee_id = f.id
    ${payWhere}
    ORDER BY fp.id DESC
    LIMIT 100
  `).all(...payParams);

  res.json({ items, payments });
});

academicRouter.post('/fees', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.studentId || !b.feeType || b.baseAmount === undefined || !b.dueDate) {
    return res.status(400).json({ error: 'Student, fee type, base amount, and due date are required.' });
  }

  const student = db.prepare(`SELECT id, user_id, full_name FROM students WHERE id = ? AND deleted_at IS NULL`).get(Number(b.studentId)) as any;
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const netAmount = calculateNetFee(Number(b.baseAmount), Number(b.discount || 0), Number(b.lateFee || 0));
  const challanNumber = `CHL-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  const r = db.prepare(`
    INSERT INTO fees (student_id, session_id, challan_number, fee_type, fee_month, base_amount, discount, late_fee, net_amount, paid_amount, remaining_amount, due_date, status, notes)
    VALUES (?, (SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?)
  `).run(
    student.id,
    challanNumber,
    b.feeType,
    b.feeMonth || new Date().toISOString().slice(0, 7),
    Number(b.baseAmount),
    Number(b.discount || 0),
    Number(b.lateFee || 0),
    netAmount,
    netAmount,
    b.dueDate,
    b.notes || '',
  );

  createNotification(student.user_id, 'fee', 'New Fee Challan Generated', `Challan ${challanNumber} for PKR ${netAmount} is due on ${b.dueDate}.`);
  logActivity(req.session!.userId, 'CREATE_FEE', 'fee', Number(r.lastInsertRowid), `Created challan ${challanNumber} for ${student.full_name} (${netAmount}).`);
  res.status(201).json({ id: Number(r.lastInsertRowid), challanNumber });
});

academicRouter.post('/fees/:id/pay', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const feeId = Number(req.params.id);
  const { amountPaid, paymentDate, paymentMethod, transactionRef } = req.body || {};

  const fee = db.prepare(`SELECT f.*, s.user_id, s.full_name FROM fees f JOIN students s ON f.student_id = s.id WHERE f.id = ?`).get(feeId) as any;
  if (!fee) return res.status(404).json({ error: 'Fee challan not found.' });

  const amt = Number(amountPaid);
  const validation = validatePaymentAmount(fee.remaining_amount, amt);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason });
  }

  const newPaid = Math.round((fee.paid_amount + amt) * 100) / 100;
  const { remaining, status } = calculateFeeBalance(fee.net_amount, newPaid);
  const receiptNumber = `RCPT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

  db.exec('BEGIN');
  try {
    const pRes = db.prepare(`
      INSERT INTO fee_payments (fee_id, student_id, receipt_number, amount_paid, payment_date, payment_method, transaction_ref, received_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fee.id,
      fee.student_id,
      receiptNumber,
      amt,
      paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod || 'cash',
      transactionRef || '',
      req.session!.userId,
    );

    db.prepare(`
      UPDATE fees SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newPaid, remaining, status, fee.id);

    createNotification(fee.user_id, 'fee', 'Fee Payment Received', `Receipt ${receiptNumber}: PKR ${amt} received for challan ${fee.challan_number}.`);
    logActivity(req.session!.userId, 'RECORD_FEE_PAYMENT', 'fee_payment', Number(pRes.lastInsertRowid), `Recorded PKR ${amt} for ${fee.full_name} (${receiptNumber}).`);
    db.exec('COMMIT');

    res.status(201).json({
      paymentId: Number(pRes.lastInsertRowid),
      receiptNumber,
      remainingAmount: remaining,
      status,
    });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

academicRouter.get('/fees/export', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db.prepare(`
    SELECT f.challan_number as "Challan #", s.student_code as "Student ID", s.full_name as "Student Name",
           f.fee_type as "Fee Type", f.fee_month as "Month", f.base_amount as "Base Amount",
           f.discount as "Discount", f.late_fee as "Late Fee", f.net_amount as "Net Amount",
           f.paid_amount as "Paid", f.remaining_amount as "Remaining", f.due_date as "Due Date", f.status as "Status"
    FROM fees f JOIN students s ON f.student_id = s.id
    ORDER BY f.id DESC
  `).all() as any[];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Fee Records');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="SindhTech_Fee_Ledger.xlsx"');
  res.send(buf);
});

// 5TH-OF-MONTH WHATSAPP FEE REMINDERS (ADMIN QUEUE + AUTOMATED DISPATCH)
academicRouter.get('/fees/reminders', requireAuth, requireRole('admin'), async (_req, res) => {
  await runFifthDateFeeReminderJob(null);
  const rows = db.prepare(`
    SELECT r.*, f.challan_number, f.remaining_amount, f.status as fee_status, f.due_date,
           s.student_code, s.education_category,
           CASE
             WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
             ELSE COALESCE(c.class_name, crs.course_name, 'Academy Program')
           END as enrolled_in
    FROM fee_whatsapp_reminders r
    JOIN fees f ON r.fee_id = f.id
    JOIN students s ON r.student_id = s.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    WHERE s.deleted_at IS NULL
    ORDER BY CASE r.channel_status WHEN 'queued' THEN 0 WHEN 'no_phone' THEN 1 ELSE 2 END, r.id DESC
  `).all() as any[];

  const items = rows.map((r) => ({
    ...r,
    wa_link: r.whatsapp_number
      ? `https://wa.me/${r.whatsapp_number}?text=${encodeURIComponent(r.message_text)}`
      : null,
  }));

  res.json({
    items,
    cloudApiConfigured: isWhatsAppCloudConfigured(),
    summary: {
      total: items.length,
      queued: items.filter((x) => x.channel_status === 'queued' && x.remaining_amount > 0).length,
      sent: items.filter((x) => x.channel_status === 'sent_api' || x.channel_status === 'sent_manual').length,
      noPhone: items.filter((x) => x.channel_status === 'no_phone').length,
    },
  });
});

academicRouter.post('/fees/reminders/check', requireAuth, requireRole('admin'), verifyCsrf, async (req: AuthedRequest, res) => {
  const result = await runFifthDateFeeReminderJob(req.session!.userId);
  res.json({ ok: true, ...result });
});

academicRouter.patch('/fees/reminders/:id/status', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const next = req.body?.channelStatus === 'sent_manual' ? 'sent_manual' : 'queued';
  const row = db.prepare(`SELECT id, student_name FROM fee_whatsapp_reminders WHERE id = ?`).get(id) as any;
  if (!row) return res.status(404).json({ error: 'Reminder record not found.' });

  db.prepare(`
    UPDATE fee_whatsapp_reminders
    SET channel_status = ?,
        dispatched_at = CASE WHEN ? = 'sent_manual' THEN datetime('now') ELSE NULL END
    WHERE id = ?
  `).run(next, next, id);

  logActivity(req.session!.userId, 'MARK_FEE_WHATSAPP_SENT', 'fee', id, `WhatsApp reminder for ${row.student_name} set to ${next}.`);
  res.json({ ok: true, channelStatus: next });
});

// ============================================================================
// TIMETABLE MANAGEMENT (WITH CONFLICT PREVENTION)
// ============================================================================

academicRouter.get('/timetable', requireAuth, (req: AuthedRequest, res) => {
  const { classId = '', courseId = '', teacherId = '' } = req.query as Record<string, string>;
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (req.session!.role === 'teacher') {
    const t = getTeacherByUserId(req.session!.userId);
    if (!t) return res.json({ items: [] });
    where.push('tt.teacher_id = ?');
    params.push(t.id);
  } else if (req.session!.role === 'student') {
    const s = getStudentByUserId(req.session!.userId);
    if (!s) return res.json({ items: [] });
    const hasSubjectSelection = Array.isArray(s.selected_subject_ids) && s.selected_subject_ids.length > 0;
    if (hasSubjectSelection) {
      where.push(`(
        (tt.class_id = ? AND ? IS NOT NULL AND (tt.subject_id IS NULL OR tt.subject_id IN (SELECT subject_id FROM student_subjects WHERE student_id = ?)))
        OR (tt.course_id = ? AND ? IS NOT NULL)
      )`);
      params.push(s.class_id, s.class_id, s.id, s.course_id, s.course_id);
    } else {
      where.push('((tt.class_id = ? AND ? IS NOT NULL) OR (tt.course_id = ? AND ? IS NOT NULL))');
      params.push(s.class_id, s.class_id, s.course_id, s.course_id);
    }
  } else {
    if (classId) {
      where.push('tt.class_id = ?');
      params.push(Number(classId));
    }
    if (courseId) {
      where.push('tt.course_id = ?');
      params.push(Number(courseId));
    }
    if (teacherId) {
      where.push('tt.teacher_id = ?');
      params.push(Number(teacherId));
    }
  }

  const items = db.prepare(`
    SELECT tt.*, t.full_name as teacher_name, c.class_name, sec.section_name, crs.course_name, sub.subject_name
    FROM timetables tt
    JOIN teachers t ON tt.teacher_id = t.id
    LEFT JOIN classes c ON tt.class_id = c.id
    LEFT JOIN sections sec ON tt.section_id = sec.id
    LEFT JOIN courses crs ON tt.course_id = crs.id
    LEFT JOIN subjects sub ON tt.subject_id = sub.id
    WHERE ${where.join(' AND ')}
    ORDER BY CASE tt.day_of_week
      WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, tt.start_time ASC
  `).all(...params);

  res.json({ items });
});

academicRouter.post('/timetable', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.dayOfWeek || !b.startTime || !b.endTime || !b.teacherId || (!b.classId && !b.courseId)) {
    return res.status(400).json({ error: 'Day, start/end times, teacher, and class or course are required.' });
  }

  const existing = db.prepare(`SELECT id, day_of_week, start_time, end_time, teacher_id, class_id, section_id, course_id FROM timetables`).all() as any[];
  const conflict = findTimetableConflict(
    {
      day_of_week: b.dayOfWeek,
      start_time: b.startTime,
      end_time: b.endTime,
      teacher_id: Number(b.teacherId),
      class_id: b.classId ? Number(b.classId) : null,
      section_id: b.sectionId ? Number(b.sectionId) : null,
      course_id: b.courseId ? Number(b.courseId) : null,
    },
    existing,
  );

  if (conflict.conflict) {
    return res.status(409).json({ error: conflict.reason });
  }

  const r = db.prepare(`
    INSERT INTO timetables (day_of_week, start_time, end_time, teacher_id, class_id, section_id, course_id, subject_id, room)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.dayOfWeek,
    b.startTime,
    b.endTime,
    Number(b.teacherId),
    b.classId ? Number(b.classId) : null,
    b.sectionId ? Number(b.sectionId) : null,
    b.courseId ? Number(b.courseId) : null,
    b.subjectId ? Number(b.subjectId) : null,
    b.room || '',
  );

  logActivity(req.session!.userId, 'CREATE_TIMETABLE', 'timetable', Number(r.lastInsertRowid), `Scheduled ${b.dayOfWeek} ${b.startTime}-${b.endTime}.`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

academicRouter.delete('/timetable/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  db.prepare(`DELETE FROM timetables WHERE id = ?`).run(Number(req.params.id));
  logActivity(req.session!.userId, 'DELETE_TIMETABLE', 'timetable', Number(req.params.id), 'Removed timetable slot.');
  res.json({ ok: true });
});

// ============================================================================
// ATTENDANCE MANAGEMENT
// ============================================================================

academicRouter.get('/attendance', requireAuth, (req: AuthedRequest, res) => {
  const { date = new Date().toISOString().slice(0, 10), attendeeType = 'student', classId = '', courseId = '', month = '' } = req.query as Record<string, string>;

  if (req.session!.role === 'student') {
    const st = getStudentByUserId(req.session!.userId);
    if (!st) return res.json({ items: [], summary: {} });
    const rows = db.prepare(`
      SELECT * FROM attendance
      WHERE attendee_type = 'student' AND student_id = ?
      ${month ? "AND substr(attendance_date, 1, 7) = ?" : ''}
      ORDER BY attendance_date DESC
    `).all(...(month ? [st.id, month] : [st.id])) as any[];
    return res.json({ items: rows });
  }

  if (attendeeType === 'teacher') {
    if (req.session!.role !== 'admin') return res.status(403).json({ error: 'Only Admin can view teacher attendance.' });
    const rows = db.prepare(`
      SELECT t.id as teacher_id, t.teacher_code, t.full_name, t.specialization,
             a.id as attendance_id, a.status, a.remarks, ? as attendance_date
      FROM teachers t
      LEFT JOIN attendance a ON a.teacher_id = t.id AND a.attendee_type = 'teacher' AND a.attendance_date = ?
      WHERE t.deleted_at IS NULL AND t.status = 'active'
      ORDER BY t.full_name ASC
    `).all(date, date);
    return res.json({ items: rows });
  }

  const where = ["s.deleted_at IS NULL AND s.status = 'active'"];
  const params: any[] = [date, date];

  if (req.session!.role === 'teacher') {
    const teacher = getTeacherByUserId(req.session!.userId);
    if (!teacher) return res.json({ items: [] });
    where.push(`(s.assigned_teacher_id = ? OR c.class_teacher_id = ? OR crs.teacher_id = ?)`);
    params.push(teacher.id, teacher.id, teacher.id);
  }

  if (classId) {
    where.push('s.class_id = ?');
    params.push(Number(classId));
  }
  if (courseId) {
    where.push('s.course_id = ?');
    params.push(Number(courseId));
  }

  const rows = db.prepare(`
    SELECT s.id as student_id, s.student_code, s.full_name, s.education_category,
           CASE
             WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
             ELSE COALESCE(c.class_name, crs.course_name)
           END as group_name,
           s.class_id, s.course_id,
           a.id as attendance_id, a.status, a.remarks, ? as attendance_date
    FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN courses crs ON s.course_id = crs.id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.attendee_type = 'student' AND a.attendance_date = ?
    WHERE ${where.join(' AND ')}
    ORDER BY s.full_name ASC
  `).all(...params);

  res.json({ items: rows });
});

academicRouter.post('/attendance/bulk', requireAuth, requireRole('admin', 'teacher'), verifyCsrf, (req: AuthedRequest, res) => {
  const { date, attendeeType = 'student', records } = req.body || {};
  if (!date || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Date and attendance records are required.' });
  }
  if (attendeeType === 'teacher' && req.session!.role !== 'admin') {
    return res.status(403).json({ error: 'Only Admin can mark teacher attendance.' });
  }

  db.exec('BEGIN');
  try {
    for (const rec of records) {
      if (attendeeType === 'teacher') {
        const existing = db.prepare(`SELECT id FROM attendance WHERE attendee_type = 'teacher' AND teacher_id = ? AND attendance_date = ?`).get(Number(rec.teacherId), date) as any;
        if (existing) {
          db.prepare(`UPDATE attendance SET status = ?, remarks = ?, marked_by = ?, updated_at = datetime('now') WHERE id = ?`).run(
            rec.status,
            rec.remarks || '',
            req.session!.userId,
            existing.id,
          );
        } else {
          db.prepare(`INSERT INTO attendance (attendee_type, teacher_id, attendance_date, status, remarks, marked_by) VALUES ('teacher', ?, ?, ?, ?, ?)`).run(
            Number(rec.teacherId),
            date,
            rec.status,
            rec.remarks || '',
            req.session!.userId,
          );
        }
      } else {
        const st = db.prepare(`SELECT id, user_id, class_id, course_id FROM students WHERE id = ?`).get(Number(rec.studentId)) as any;
        if (!st) continue;
        const existing = db.prepare(`SELECT id FROM attendance WHERE attendee_type = 'student' AND student_id = ? AND attendance_date = ?`).get(st.id, date) as any;
        if (existing) {
          db.prepare(`UPDATE attendance SET status = ?, remarks = ?, marked_by = ?, updated_at = datetime('now') WHERE id = ?`).run(
            rec.status,
            rec.remarks || '',
            req.session!.userId,
            existing.id,
          );
        } else {
          db.prepare(`INSERT INTO attendance (attendee_type, student_id, class_id, course_id, attendance_date, status, remarks, marked_by) VALUES ('student', ?, ?, ?, ?, ?, ?, ?)`).run(
            st.id,
            st.class_id,
            st.course_id,
            date,
            rec.status,
            rec.remarks || '',
            req.session!.userId,
          );
        }
        if (rec.status === 'absent') {
          createNotification(st.user_id, 'attendance', 'Absence Recorded', `You were marked absent on ${date}.`);
        }
      }
    }
    logActivity(req.session!.userId, 'MARK_ATTENDANCE', 'attendance', null, `Marked ${records.length} ${attendeeType} attendance record(s) for ${date}.`);
    db.exec('COMMIT');
    res.json({ ok: true, count: records.length });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

academicRouter.get('/attendance/export', requireAuth, requireRole('admin'), (req, res) => {
  const { month = '' } = req.query as Record<string, string>;
  const rows = db.prepare(`
    SELECT a.attendance_date as "Date", a.attendee_type as "Type",
           COALESCE(s.student_code, t.teacher_code) as "Code",
           COALESCE(s.full_name, t.full_name) as "Name",
           a.status as "Status", a.remarks as "Remarks"
    FROM attendance a
    LEFT JOIN students s ON a.student_id = s.id
    LEFT JOIN teachers t ON a.teacher_id = t.id
    ${month ? "WHERE substr(a.attendance_date, 1, 7) = ?" : ''}
    ORDER BY a.attendance_date DESC
  `).all(...(month ? [month] : [])) as any[];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Attendance');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="SindhTech_Attendance_Report.xlsx"');
  res.send(buf);
});

// ============================================================================
// EXAMS & RESULTS MANAGEMENT
// ============================================================================

academicRouter.get('/exams', requireAuth, (req: AuthedRequest, res) => {
  const where: string[] = ['1=1'];
  const params: any[] = [];

  if (req.session!.role === 'student') {
    const st = getStudentByUserId(req.session!.userId);
    if (!st) return res.json({ items: [] });
    where.push('((e.class_id = ? AND ? IS NOT NULL) OR (e.course_id = ? AND ? IS NOT NULL))');
    params.push(st.class_id, st.class_id, st.course_id, st.course_id);
  } else if (req.session!.role === 'teacher') {
    const t = getTeacherByUserId(req.session!.userId);
    if (!t) return res.json({ items: [] });
    where.push('(c.class_teacher_id = ? OR crs.teacher_id = ?)');
    params.push(t.id, t.id);
  }

  const exams = db.prepare(`
    SELECT e.*, c.class_name, crs.course_name,
           (SELECT COUNT(*) FROM marks m WHERE m.exam_id = e.id) as marks_count
    FROM exams e
    LEFT JOIN classes c ON e.class_id = c.id
    LEFT JOIN courses crs ON e.course_id = crs.id
    WHERE ${where.join(' AND ')}
    ORDER BY e.exam_date DESC
  `).all(...params);

  res.json({ items: exams });
});

academicRouter.post('/exams', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.examName || !b.educationCategory || !b.examDate) {
    return res.status(400).json({ error: 'Exam name, category, and date are required.' });
  }
  const r = db.prepare(`
    INSERT INTO exams (exam_name, session_id, education_category, class_id, course_id, exam_date, is_published)
    VALUES (?, (SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1), ?, ?, ?, ?, 0)
  `).run(
    String(b.examName).trim(),
    b.educationCategory,
    b.educationCategory === 'school' && b.classId ? Number(b.classId) : null,
    b.educationCategory === 'course' && b.courseId ? Number(b.courseId) : null,
    b.examDate,
  );
  logActivity(req.session!.userId, 'CREATE_EXAM', 'exam', Number(r.lastInsertRowid), `Created exam ${b.examName}.`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

academicRouter.get('/exams/:id/marks', requireAuth, (req: AuthedRequest, res) => {
  const examId = Number(req.params.id);
  const exam = db.prepare(`
    SELECT e.*, c.class_name, crs.course_name
    FROM exams e LEFT JOIN classes c ON e.class_id = c.id LEFT JOIN courses crs ON e.course_id = crs.id
    WHERE e.id = ?
  `).get(examId) as any;
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  if (req.session!.role === 'student') {
    const st = getStudentByUserId(req.session!.userId);
    if (!exam.is_published) return res.json({ exam, marks: [], students: [] });
    const marks = db.prepare(`SELECT * FROM marks WHERE exam_id = ? AND student_id = ?`).all(examId, st?.id || -1);
    return res.json({ exam, marks, students: [] });
  }

  const students = db.prepare(`
    SELECT id, student_code, full_name FROM students
    WHERE deleted_at IS NULL AND status = 'active'
      AND ((class_id = ? AND ? IS NOT NULL) OR (course_id = ? AND ? IS NOT NULL))
    ORDER BY full_name
  `).all(exam.class_id, exam.class_id, exam.course_id, exam.course_id);

  const marks = db.prepare(`
    SELECT m.*, s.student_code, s.full_name, s.father_name
    FROM marks m JOIN students s ON m.student_id = s.id
    WHERE m.exam_id = ?
    ORDER BY s.full_name, m.subject_name
  `).all(examId);

  const subjects = db.prepare(`
    SELECT * FROM subjects WHERE (class_id = ? AND ? IS NOT NULL) OR (course_id = ? AND ? IS NOT NULL)
  `).all(exam.class_id, exam.class_id, exam.course_id, exam.course_id);

  res.json({ exam, students, marks, subjects });
});

academicRouter.post('/exams/:id/marks', requireAuth, requireRole('admin', 'teacher'), verifyCsrf, (req: AuthedRequest, res) => {
  const examId = Number(req.params.id);
  const exam = db.prepare(`SELECT * FROM exams WHERE id = ?`).get(examId) as any;
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  if (req.session!.role === 'teacher' && exam.is_published) {
    return res.status(403).json({ error: 'Marks cannot be modified by teachers after results are published.' });
  }

  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'At least one mark entry is required.' });
  }

  db.exec('BEGIN');
  try {
    for (const item of entries) {
      const total = Number(item.totalMarks) || 100;
      const obtained = Math.min(total, Math.max(0, Number(item.obtainedMarks) || 0));
      const pct = calculatePercentage(obtained, total);
      const { grade, remarks } = calculateGrade(pct);

      db.prepare(`
        INSERT INTO marks (exam_id, student_id, subject_id, subject_name, total_marks, obtained_marks, percentage, grade, remarks, entered_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(exam_id, student_id, subject_name) DO UPDATE SET
          total_marks = excluded.total_marks,
          obtained_marks = excluded.obtained_marks,
          percentage = excluded.percentage,
          grade = excluded.grade,
          remarks = excluded.remarks,
          entered_by = excluded.entered_by,
          updated_at = datetime('now')
      `).run(
        examId,
        Number(item.studentId),
        item.subjectId ? Number(item.subjectId) : null,
        String(item.subjectName).trim(),
        total,
        obtained,
        pct,
        grade,
        remarks,
        req.session!.userId,
      );
    }
    logActivity(req.session!.userId, 'ENTER_MARKS', 'exam', examId, `Saved ${entries.length} mark record(s) for ${exam.exam_name}.`);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

academicRouter.patch('/exams/:id/publish', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const examId = Number(req.params.id);
  const nextState = req.body?.isPublished ? 1 : 0;
  const exam = db.prepare(`SELECT * FROM exams WHERE id = ?`).get(examId) as any;
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  db.prepare(`UPDATE exams SET is_published = ?, updated_at = datetime('now') WHERE id = ?`).run(nextState, examId);
  if (nextState === 1) {
    const students = db.prepare(`SELECT DISTINCT s.user_id FROM marks m JOIN students s ON m.student_id = s.id WHERE m.exam_id = ?`).all(examId) as any[];
    for (const s of students) {
      createNotification(s.user_id, 'result', 'Exam Results Published', `Results for ${exam.exam_name} are now published in your portal.`);
    }
  }
  logActivity(req.session!.userId, 'PUBLISH_EXAM', 'exam', examId, `${exam.exam_name} marked ${nextState ? 'published' : 'unpublished'}.`);
  res.json({ ok: true, isPublished: Boolean(nextState) });
});

academicRouter.get('/exams/:id/export', requireAuth, requireRole('admin'), (req, res) => {
  const examId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT s.student_code as "Student ID", s.full_name as "Student Name", m.subject_name as "Subject",
           m.total_marks as "Total Marks", m.obtained_marks as "Obtained Marks", m.percentage as "Percentage",
           m.grade as "Grade", m.remarks as "Remarks"
    FROM marks m JOIN students s ON m.student_id = s.id
    WHERE m.exam_id = ?
    ORDER BY s.full_name, m.subject_name
  `).all(examId) as any[];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Exam Results');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="SindhTech_Exam_${examId}_Results.xlsx"`);
  res.send(buf);
});

// ============================================================================
// ASSIGNMENTS & SUBMISSIONS
// ============================================================================

academicRouter.get('/assignments', requireAuth, (req: AuthedRequest, res) => {
  if (req.session!.role === 'student') {
    const st = getStudentByUserId(req.session!.userId);
    if (!st) return res.json({ items: [] });
    const items = db.prepare(`
      SELECT a.*, t.full_name as teacher_name, c.class_name, crs.course_name,
             sub.id as my_submission_id, sub.status as my_status, sub.grade_score as my_grade,
             sub.teacher_feedback as my_feedback, sub.submitted_at as my_submitted_at, sub.file_name as my_file_name
      FROM assignments a
      JOIN teachers t ON a.teacher_id = t.id
      LEFT JOIN classes c ON a.class_id = c.id
      LEFT JOIN courses crs ON a.course_id = crs.id
      LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
      WHERE (a.class_id = ? AND ? IS NOT NULL) OR (a.course_id = ? AND ? IS NOT NULL)
      ORDER BY a.due_date DESC
    `).all(st.id, st.class_id, st.class_id, st.course_id, st.course_id);
    return res.json({ items });
  }

  let where = '1=1';
  const params: any[] = [];
  if (req.session!.role === 'teacher') {
    const t = getTeacherByUserId(req.session!.userId);
    if (!t) return res.json({ items: [] });
    where = 'a.teacher_id = ?';
    params.push(t.id);
  }

  const items = db.prepare(`
    SELECT a.*, t.full_name as teacher_name, c.class_name, crs.course_name,
           (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) as submissions_count
    FROM assignments a
    JOIN teachers t ON a.teacher_id = t.id
    LEFT JOIN classes c ON a.class_id = c.id
    LEFT JOIN courses crs ON a.course_id = crs.id
    WHERE ${where}
    ORDER BY a.id DESC
  `).all(...params);

  res.json({ items });
});

academicRouter.post('/assignments', requireAuth, requireRole('admin', 'teacher'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.title || !b.description || !b.dueDate) {
    return res.status(400).json({ error: 'Title, description, and due date are required.' });
  }

  let teacherId = b.teacherId ? Number(b.teacherId) : null;
  if (req.session!.role === 'teacher') {
    const t = getTeacherByUserId(req.session!.userId);
    if (!t) return res.status(403).json({ error: 'Teacher profile missing.' });
    teacherId = t.id;
  }
  if (!teacherId) return res.status(400).json({ error: 'Assigned teacher is required.' });

  const r = db.prepare(`
    INSERT INTO assignments (title, description, teacher_id, class_id, course_id, due_date, attachment_name, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    String(b.title).trim(),
    String(b.description).trim(),
    teacherId,
    b.classId ? Number(b.classId) : null,
    b.courseId ? Number(b.courseId) : null,
    b.dueDate,
    b.attachmentName || null,
  );

  // Notify matching students
  const targetStudents = db.prepare(`
    SELECT user_id FROM students
    WHERE deleted_at IS NULL AND status = 'active'
      AND ((class_id = ? AND ? IS NOT NULL) OR (course_id = ? AND ? IS NOT NULL))
  `).all(b.classId || null, b.classId || null, b.courseId || null, b.courseId || null) as any[];
  for (const st of targetStudents) {
    createNotification(st.user_id, 'assignment', 'New Assignment Posted', `${b.title} (Due: ${b.dueDate})`);
  }

  logActivity(req.session!.userId, 'CREATE_ASSIGNMENT', 'assignment', Number(r.lastInsertRowid), `Posted assignment "${b.title}".`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

academicRouter.patch('/assignments/:id/status', requireAuth, requireRole('admin', 'teacher'), verifyCsrf, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status === 'closed' ? 'closed' : 'open';
  db.prepare(`UPDATE assignments SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  res.json({ ok: true, status });
});

academicRouter.get('/assignments/:id/submissions', requireAuth, requireRole('admin', 'teacher'), (req, res) => {
  const items = db.prepare(`
    SELECT sub.*, s.student_code, s.full_name
    FROM assignment_submissions sub
    JOIN students s ON sub.student_id = s.id
    WHERE sub.assignment_id = ?
    ORDER BY sub.submitted_at DESC
  `).all(Number(req.params.id));
  res.json({ items });
});

academicRouter.post('/assignments/:id/submit', requireAuth, requireRole('student'), verifyCsrf, (req: AuthedRequest, res) => {
  const st = getStudentByUserId(req.session!.userId);
  if (!st) return res.status(404).json({ error: 'Student profile not found.' });
  const { submissionText, fileName } = req.body || {};
  if (!submissionText && !fileName) {
    return res.status(400).json({ error: 'Provide submission notes or an attachment filename.' });
  }

  db.prepare(`
    INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_name, submitted_at, status)
    VALUES (?, ?, ?, ?, datetime('now'), 'submitted')
    ON CONFLICT(assignment_id, student_id) DO UPDATE SET
      submission_text = excluded.submission_text,
      file_name = excluded.file_name,
      submitted_at = datetime('now'),
      status = 'submitted',
      updated_at = datetime('now')
  `).run(Number(req.params.id), st.id, submissionText || '', fileName || null);

  res.json({ ok: true });
});

academicRouter.post('/submissions/:id/grade', requireAuth, requireRole('admin', 'teacher'), verifyCsrf, (req, res) => {
  const { gradeScore, teacherFeedback } = req.body || {};
  db.prepare(`
    UPDATE assignment_submissions
    SET status = 'graded', grade_score = ?, teacher_feedback = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(gradeScore || '', teacherFeedback || '', Number(req.params.id));
  res.json({ ok: true });
});

// ============================================================================
// NOTICES & NOTIFICATIONS
// ============================================================================

academicRouter.get('/notices', requireAuth, (req: AuthedRequest, res) => {
  const role = req.session!.role;
  if (role === 'admin') {
    const items = db.prepare(`
      SELECT n.*, c.class_name, crs.course_name
      FROM notices n LEFT JOIN classes c ON n.target_class_id = c.id LEFT JOIN courses crs ON n.target_course_id = crs.id
      ORDER BY n.id DESC
    `).all();
    return res.json({ items });
  }
  if (role === 'teacher') {
    const items = db.prepare(`SELECT * FROM notices WHERE target_audience IN ('all', 'teachers') ORDER BY id DESC`).all();
    return res.json({ items });
  }
  const st = getStudentByUserId(req.session!.userId);
  const items = db.prepare(`
    SELECT * FROM notices
    WHERE target_audience IN ('all', 'students')
       OR (target_audience = 'class' AND target_class_id = ?)
       OR (target_audience = 'course' AND target_course_id = ?)
    ORDER BY id DESC
  `).all(st?.class_id || -1, st?.course_id || -1);
  res.json({ items });
});

academicRouter.post('/notices', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.title || !b.content) return res.status(400).json({ error: 'Notice title and content are required.' });

  const r = db.prepare(`
    INSERT INTO notices (title, content, target_audience, target_class_id, target_course_id, priority, published_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(b.title).trim(),
    String(b.content).trim(),
    b.targetAudience || 'all',
    b.targetClassId ? Number(b.targetClassId) : null,
    b.targetCourseId ? Number(b.targetCourseId) : null,
    b.priority || 'normal',
    req.session!.userId,
  );

  let targetUsers: any[] = [];
  if (b.targetAudience === 'teachers') {
    targetUsers = db.prepare(`SELECT id FROM users WHERE role = 'teacher' AND deleted_at IS NULL AND status = 'active'`).all();
  } else if (b.targetAudience === 'students') {
    targetUsers = db.prepare(`SELECT id FROM users WHERE role = 'student' AND deleted_at IS NULL AND status = 'active'`).all();
  } else if (b.targetAudience === 'class' && b.targetClassId) {
    targetUsers = db.prepare(`SELECT user_id as id FROM students WHERE class_id = ? AND deleted_at IS NULL`).all(Number(b.targetClassId));
  } else if (b.targetAudience === 'course' && b.targetCourseId) {
    targetUsers = db.prepare(`SELECT user_id as id FROM students WHERE course_id = ? AND deleted_at IS NULL`).all(Number(b.targetCourseId));
  } else {
    targetUsers = db.prepare(`SELECT id FROM users WHERE role IN ('teacher', 'student') AND deleted_at IS NULL AND status = 'active'`).all();
  }

  for (const u of targetUsers) {
    createNotification(u.id, 'notice', String(b.title).trim(), String(b.content).trim().slice(0, 140));
  }

  logActivity(req.session!.userId, 'CREATE_NOTICE', 'notice', Number(r.lastInsertRowid), `Published notice "${b.title}".`);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

academicRouter.put('/notices/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const b = req.body || {};
  db.prepare(`UPDATE notices SET title = ?, content = ?, priority = ?, updated_at = datetime('now') WHERE id = ?`).run(
    b.title,
    b.content,
    b.priority || 'normal',
    Number(req.params.id),
  );
  res.json({ ok: true });
});

academicRouter.delete('/notices/:id', requireAuth, requireRole('admin'), verifyCsrf, (req, res) => {
  db.prepare(`DELETE FROM notices WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

academicRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const items = db.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20`).all(req.session!.userId);
  const unreadCount = (db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.session!.userId) as any).c;
  res.json({ items, unreadCount });
});

academicRouter.post('/notifications/read-all', requireAuth, verifyCsrf, (req: AuthedRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1, updated_at = datetime('now') WHERE user_id = ?`).run(req.session!.userId);
  res.json({ ok: true });
});

// ============================================================================
// TEACHER SALARIES, LEAVES, SESSIONS, REPORTS, SETTINGS & BACKUPS
// ============================================================================

academicRouter.get('/salaries', requireAuth, requireRole('admin'), (_req, res) => {
  const items = db.prepare(`
    SELECT ts.*, t.teacher_code, t.full_name, t.specialization
    FROM teacher_salaries ts
    JOIN teachers t ON ts.teacher_id = t.id
    ORDER BY ts.salary_month DESC, t.full_name ASC
  `).all();
  res.json({ items });
});

academicRouter.post('/salaries', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const { teacherId, salaryMonth, baseSalary, bonus = 0, deduction = 0, paymentMethod = 'bank_transfer', markPaid = true } = req.body || {};
  if (!teacherId || !salaryMonth) return res.status(400).json({ error: 'Teacher and salary month are required.' });

  const netSalary = Math.max(0, Number(baseSalary) + Number(bonus) - Number(deduction));
  const status = markPaid ? 'paid' : 'pending';
  const payDate = markPaid ? new Date().toISOString().slice(0, 10) : null;

  db.prepare(`
    INSERT INTO teacher_salaries (teacher_id, salary_month, base_salary, bonus, deduction, net_salary, payment_date, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(teacher_id, salary_month) DO UPDATE SET
      base_salary = excluded.base_salary,
      bonus = excluded.bonus,
      deduction = excluded.deduction,
      net_salary = excluded.net_salary,
      payment_date = excluded.payment_date,
      payment_method = excluded.payment_method,
      status = excluded.status,
      updated_at = datetime('now')
  `).run(Number(teacherId), salaryMonth, Number(baseSalary), Number(bonus), Number(deduction), netSalary, payDate, paymentMethod, status);

  logActivity(req.session!.userId, 'RECORD_SALARY', 'teacher_salary', Number(teacherId), `Salary ${salaryMonth} (${netSalary}) marked ${status}.`);
  res.json({ ok: true });
});

academicRouter.get('/leaves', requireAuth, (req: AuthedRequest, res) => {
  if (req.session!.role === 'admin') {
    const items = db.prepare(`
      SELECT l.*, u.full_name, u.username
      FROM leave_requests l JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC
    `).all();
    return res.json({ items });
  }
  const items = db.prepare(`SELECT * FROM leave_requests WHERE user_id = ? ORDER BY id DESC`).all(req.session!.userId);
  res.json({ items });
});

academicRouter.post('/leaves', requireAuth, requireRole('teacher', 'student'), verifyCsrf, (req: AuthedRequest, res) => {
  const { leaveType, startDate, endDate, reason } = req.body || {};
  if (!leaveType || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'All leave application fields are required.' });
  }
  const r = db.prepare(`
    INSERT INTO leave_requests (user_id, requester_role, leave_type, start_date, end_date, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(req.session!.userId, req.session!.role, leaveType, startDate, endDate, reason);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

academicRouter.patch('/leaves/:id', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const status = req.body?.status === 'approved' ? 'approved' : 'rejected';
  const row = db.prepare(`SELECT user_id, start_date FROM leave_requests WHERE id = ?`).get(Number(req.params.id)) as any;
  if (!row) return res.status(404).json({ error: 'Leave request not found.' });
  db.prepare(`UPDATE leave_requests SET status = ?, reviewed_by = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    req.session!.userId,
    Number(req.params.id),
  );
  createNotification(row.user_id, 'leave', `Leave Request ${status.toUpperCase()}`, `Your leave request starting ${row.start_date} was ${status}.`);
  res.json({ ok: true });
});

academicRouter.get('/sessions', requireAuth, (_req, res) => {
  const items = db.prepare(`SELECT * FROM academic_sessions ORDER BY id DESC`).all();
  res.json({ items });
});

academicRouter.post('/sessions', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const { sessionName, startDate, endDate, isActive } = req.body || {};
  if (!sessionName || !startDate || !endDate) return res.status(400).json({ error: 'Session name and dates are required.' });
  db.exec('BEGIN');
  try {
    if (isActive) db.prepare(`UPDATE academic_sessions SET is_active = 0`).run();
    const r = db.prepare(`INSERT INTO academic_sessions (session_name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)`).run(
      sessionName,
      startDate,
      endDate,
      isActive ? 1 : 0,
    );
    db.exec('COMMIT');
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err: any) {
    db.exec('ROLLBACK');
    return res.status(400).json({ error: 'Session name already exists.' });
  }
});

academicRouter.get('/reports', requireAuth, requireRole('admin'), (req, res) => {
  const { reportType = 'fee_collection', from = '', to = '', classId = '', courseId = '' } = req.query as Record<string, string>;

  if (reportType === 'pending_fees') {
    const rows = db.prepare(`
      SELECT f.challan_number, s.student_code, s.full_name,
             CASE
               WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
               ELSE COALESCE(c.class_name, crs.course_name)
             END as program,
             f.fee_type, f.fee_month, f.net_amount, f.paid_amount, f.remaining_amount, f.due_date, f.status
      FROM fees f JOIN students s ON f.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id LEFT JOIN courses crs ON s.course_id = crs.id
      WHERE f.remaining_amount > 0
      ${classId ? 'AND s.class_id = ?' : ''}
      ${courseId ? 'AND s.course_id = ?' : ''}
      ORDER BY f.due_date ASC
    `).all(...[...(classId ? [Number(classId)] : []), ...(courseId ? [Number(courseId)] : [])]);
    return res.json({ reportType, rows });
  }

  if (reportType === 'class_students' || reportType === 'course_enrollments') {
    const rows = db.prepare(`
      SELECT s.student_code, s.full_name, s.father_name, s.gender, s.phone, s.admission_date,
             s.education_category,
             CASE
               WHEN c.class_name IS NOT NULL AND crs.course_name IS NOT NULL THEN (c.class_name || ' + ' || crs.course_name)
               ELSE COALESCE(c.class_name, crs.course_name)
             END as program,
             s.monthly_fee, s.status
      FROM students s LEFT JOIN classes c ON s.class_id = c.id LEFT JOIN courses crs ON s.course_id = crs.id
      WHERE s.deleted_at IS NULL
      ${reportType === 'course_enrollments' ? "AND s.education_category IN ('course', 'both')" : ''}
      ${classId ? 'AND s.class_id = ?' : ''}
      ${courseId ? 'AND s.course_id = ?' : ''}
      ORDER BY program, s.full_name
    `).all(...[...(classId ? [Number(classId)] : []), ...(courseId ? [Number(courseId)] : [])]);
    return res.json({ reportType, rows });
  }

  if (reportType === 'attendance') {
    const rows = db.prepare(`
      SELECT a.attendance_date, a.attendee_type, COALESCE(s.student_code, t.teacher_code) as code,
             COALESCE(s.full_name, t.full_name) as full_name, a.status, a.remarks
      FROM attendance a LEFT JOIN students s ON a.student_id = s.id LEFT JOIN teachers t ON a.teacher_id = t.id
      WHERE 1=1
      ${from ? 'AND a.attendance_date >= ?' : ''}
      ${to ? 'AND a.attendance_date <= ?' : ''}
      ORDER BY a.attendance_date DESC LIMIT 200
    `).all(...[...(from ? [from] : []), ...(to ? [to] : [])]);
    return res.json({ reportType, rows });
  }

  if (reportType === 'salaries') {
    const rows = db.prepare(`
      SELECT ts.salary_month, t.teacher_code, t.full_name, ts.base_salary, ts.bonus, ts.deduction, ts.net_salary, ts.payment_date, ts.status
      FROM teacher_salaries ts JOIN teachers t ON ts.teacher_id = t.id
      ORDER BY ts.salary_month DESC
    `).all();
    return res.json({ reportType, rows });
  }

  // Default: fee_collection
  const rows = db.prepare(`
    SELECT fp.receipt_number, fp.payment_date, s.student_code, s.full_name, f.challan_number,
           f.fee_type, fp.amount_paid, fp.payment_method, fp.transaction_ref
    FROM fee_payments fp JOIN students s ON fp.student_id = s.id JOIN fees f ON fp.fee_id = f.id
    WHERE 1=1
    ${from ? 'AND fp.payment_date >= ?' : ''}
    ${to ? 'AND fp.payment_date <= ?' : ''}
    ORDER BY fp.payment_date DESC
  `).all(...[...(from ? [from] : []), ...(to ? [to] : [])]);
  res.json({ reportType, rows });
});

academicRouter.get('/settings', requireAuth, (_req, res) => {
  const rows = db.prepare(`SELECT setting_key, setting_value FROM system_settings`).all() as any[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.setting_key] = r.setting_value;
  res.json({ settings: map });
});

academicRouter.put('/settings', requireAuth, requireRole('admin'), verifyCsrf, (req: AuthedRequest, res) => {
  const updates = req.body || {};
  db.exec('BEGIN');
  try {
    const stmt = db.prepare(`INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, datetime('now'))`);
    for (const [k, v] of Object.entries(updates)) {
      if (['institute_name', 'institute_tagline', 'institute_phone', 'institute_email', 'institute_address', 'currency_symbol'].includes(k)) {
        stmt.run(k, String(v));
      }
    }
    logActivity(req.session!.userId, 'UPDATE_SETTINGS', 'system_settings', null, 'Updated institute configuration settings.');
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

academicRouter.get('/activity-logs', requireAuth, requireRole('admin'), (_req, res) => {
  const items = db.prepare(`
    SELECT al.*, u.username, u.full_name
    FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.id DESC LIMIT 100
  `).all();
  res.json({ items });
});

academicRouter.get('/backup/mysql-schema', requireAuth, requireRole('admin'), (_req, res) => {
  const sqlFile = path.resolve(process.cwd(), 'database', 'sindhtech_institute.sql');
  if (!fs.existsSync(sqlFile)) return res.status(404).json({ error: 'SQL schema file not found.' });
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="sindhtech_institute.sql"');
  res.send(fs.readFileSync(sqlFile, 'utf8'));
});

academicRouter.get('/backup/json', requireAuth, requireRole('admin'), (req: AuthedRequest, res) => {
  const tables = [
    'academic_sessions', 'classes', 'sections', 'courses', 'subjects',
    'teachers', 'students', 'enrollments', 'attendance', 'fees',
    'fee_payments', 'teacher_salaries', 'timetables', 'exams', 'marks',
    'assignments', 'assignment_submissions', 'notices', 'leave_requests', 'system_settings',
  ];
  const dump: Record<string, any[]> = {};
  for (const t of tables) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  logActivity(req.session!.userId, 'DATABASE_BACKUP', 'system', null, 'Exported full JSON database backup.');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="SindhTech_Backup_${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), tables: dump }, null, 2));
});
