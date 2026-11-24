export type UserRole = 'admin' | 'teacher' | 'student';
export type EducationCategory = 'school' | 'course' | 'both';
export type AccountStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';
export type FeeStatus = 'pending' | 'partial' | 'paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'other';

export const ADMIN_CANONICAL_USERNAME = 'ADMINID01';

export interface TimetableSlot {
  id?: number;
  day_of_week: string;
  start_time: string; // HH:MM (24h)
  end_time: string;   // HH:MM (24h)
  teacher_id: number;
  class_id?: number | null;
  section_id?: number | null;
  course_id?: number | null;
}

export function formatStudentCode(seq: number): string {
  return `STI-STU-${seq}`;
}

export function formatStudentUsername(seq: number): string {
  return `STUDENTIDSTI${seq}`;
}

export function formatTeacherCode(seq: number): string {
  return `STI-TEA-${seq}`;
}

export function formatTeacherUsername(seq: number): string {
  return `TEACHERID${seq}`;
}

export function detectRoleFromIdentifier(identifier: string): UserRole | null {
  const clean = String(identifier || '').trim().toUpperCase();
  if (!clean) return null;
  if (clean.startsWith('STUDENTID')) return 'student';
  if (clean.startsWith('TEACHERID')) return 'teacher';
  if (clean.startsWith('ADMINID') || clean === 'ADMIN' || clean === 'ADMIN@SINDHTECH.EDU.PK') {
    return 'admin';
  }
  return null;
}

export function normalizePkWhatsAppNumber(phone?: string | null): string | null {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('03') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  } else if (digits.startsWith('3') && digits.length === 10) {
    digits = `92${digits}`;
  } else if (digits.startsWith('0') && digits.length >= 10) {
    digits = `92${digits.slice(1)}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return digits;
}

export function formatProgramLabel(
  className?: string | null,
  courseName?: string | null,
  category?: string | null,
): string {
  const cls = String(className || '').trim();
  const crs = String(courseName || '').trim();
  if (cls && crs) return `${cls} + ${crs}`;
  if (cls) return cls;
  if (crs) return crs;
  if (category === 'both') return 'Academy Class + Course';
  if (category === 'course') return 'Professional Course';
  return 'Academy Class';
}

export function formatSubjectsSummary(subjectNames: string[], maxInline = 4): string {
  const clean = (subjectNames || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length <= maxInline) {
    return `${clean.length} Subject${clean.length === 1 ? '' : 's'} (${clean.join(', ')})`;
  }
  const head = clean.slice(0, maxInline).join(', ');
  const remaining = clean.length - maxInline;
  return `${clean.length} Subjects (${head} +${remaining} more)`;
}

export function validateStudentSubjects(params: {
  educationCategory: EducationCategory;
  availableSubjectCount: number;
  selectedSubjectIds: number[];
}): { valid: boolean; reason?: string } {
  if (params.educationCategory === 'course') {
    return { valid: true };
  }
  if (params.availableSubjectCount > 0 && (!Array.isArray(params.selectedSubjectIds) || params.selectedSubjectIds.length === 0)) {
    return { valid: false, reason: 'Please select at least 1 subject for the selected class.' };
  }
  return { valid: true };
}

export function isFeePastFifthDueDate(
  fee: { dueDate?: string | null; feeMonth?: string | null; remainingAmount: number; status?: string | null },
  referenceDate?: string,
): boolean {
  if ((Number(fee.remainingAmount) || 0) <= 0 || fee.status === 'paid') {
    return false;
  }
  const ref = (referenceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const refMonth = ref.slice(0, 7);
  const refDay = Number(ref.slice(8, 10));

  if (fee.feeMonth && /^\d{4}-\d{2}$/.test(fee.feeMonth)) {
    if (fee.feeMonth < refMonth) return true;
    if (fee.feeMonth === refMonth && refDay >= 5) return true;
    if (fee.feeMonth > refMonth) return false;
  }

  if (fee.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(fee.dueDate)) {
    return fee.dueDate <= ref;
  }
  return false;
}

export function buildFeeReminderMessage(params: {
  studentName: string;
  studentCode?: string | null;
  challanNumber: string;
  feeMonth?: string | null;
  remainingAmount: number;
  programName?: string | null;
  dueDate?: string | null;
}): string {
  const amt = `PKR ${Math.round(Number(params.remainingAmount) || 0).toLocaleString('en-US')}`;
  const monthText = params.feeMonth || 'Current Month';
  const programText = params.programName ? ` (${params.programName})` : '';
  const codeText = params.studentCode ? ` [${params.studentCode}]` : '';
  return (
    `Assalam-o-Alaikum ${params.studentName}${codeText},\n` +
    `SindhTech Institute Fee Reminder: Aap ki ${monthText} ki fee${programText} abhi tk pending hai (Due Date: 5th of Month${params.dueDate ? ` / ${params.dueDate}` : ''}).\n` +
    `Challan #: ${params.challanNumber}\n` +
    `Remaining Fee: ${amt}\n` +
    `Barah-e-meherbani apni fee jald ada karein.\n` +
    `— Administration, SindhTech Institute (Wajid Ali Kolachi)`
  );
}


export function generateTempPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!';
  const all = upper + lower + digits + symbols;

  const chars: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  for (let i = chars.length; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must include uppercase, lowercase, and numeric characters.' };
  }
  return { valid: true };
}

export function calculateNetFee(baseAmount: number, discount: number, lateFee: number): number {
  const safeBase = Math.max(0, Number(baseAmount) || 0);
  const safeDiscount = Math.max(0, Number(discount) || 0);
  const safeLate = Math.max(0, Number(lateFee) || 0);
  return Math.max(0, Math.round((safeBase - safeDiscount + safeLate) * 100) / 100);
}

export function calculateFeeBalance(netAmount: number, paidAmount: number): {
  remaining: number;
  status: FeeStatus;
} {
  const safeNet = Math.max(0, Math.round(netAmount * 100) / 100);
  const safePaid = Math.max(0, Math.round(paidAmount * 100) / 100);
  const remaining = Math.max(0, Math.round((safeNet - safePaid) * 100) / 100);

  if (remaining === 0 && safeNet >= 0) {
    return { remaining: 0, status: 'paid' };
  }
  if (safePaid > 0 && remaining > 0) {
    return { remaining, status: 'partial' };
  }
  return { remaining, status: 'pending' };
}

export function validatePaymentAmount(remaining: number, payment: number): { valid: boolean; reason?: string } {
  if (!Number.isFinite(payment) || payment <= 0) {
    return { valid: false, reason: 'Payment amount must be greater than zero.' };
  }
  if (payment > remaining + 0.001) {
    return { valid: false, reason: `Payment (${payment}) exceeds remaining balance (${remaining}).` };
  }
  return { valid: true };
}

export function calculatePercentage(obtained: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const pct = (Math.max(0, obtained) / total) * 100;
  return Math.round(pct * 100) / 100;
}

export function calculateGrade(percentage: number): { grade: string; remarks: string } {
  if (percentage >= 90) return { grade: 'A+', remarks: 'Outstanding' };
  if (percentage >= 80) return { grade: 'A', remarks: 'Excellent' };
  if (percentage >= 70) return { grade: 'B', remarks: 'Very Good' };
  if (percentage >= 60) return { grade: 'C', remarks: 'Good' };
  if (percentage >= 50) return { grade: 'D', remarks: 'Pass' };
  return { grade: 'F', remarks: 'Needs Improvement' };
}

export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return -1;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return -1;
  }
  return h * 60 + m;
}

export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  if (sA < 0 || eA <= sA || sB < 0 || eB <= sB) return false;
  return sA < eB && sB < eA;
}

export function findTimetableConflict(
  candidate: TimetableSlot,
  existingSlots: TimetableSlot[],
): { conflict: boolean; reason?: string } {
  const s = timeToMinutes(candidate.start_time);
  const e = timeToMinutes(candidate.end_time);
  if (s < 0 || e <= s) {
    return { conflict: true, reason: 'End time must be strictly after start time.' };
  }

  for (const slot of existingSlots) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.day_of_week.toLowerCase() !== candidate.day_of_week.toLowerCase()) continue;
    if (!timesOverlap(candidate.start_time, candidate.end_time, slot.start_time, slot.end_time)) continue;

    if (slot.teacher_id === candidate.teacher_id) {
      return {
        conflict: true,
        reason: `Teacher already has a scheduled session on ${slot.day_of_week} (${slot.start_time}–${slot.end_time}).`,
      };
    }

    if (
      candidate.class_id &&
      slot.class_id === candidate.class_id &&
      (!candidate.section_id || !slot.section_id || slot.section_id === candidate.section_id)
    ) {
      return {
        conflict: true,
        reason: `Class/Section already has a scheduled session on ${slot.day_of_week} (${slot.start_time}–${slot.end_time}).`,
      };
    }

    if (candidate.course_id && slot.course_id === candidate.course_id) {
      return {
        conflict: true,
        reason: `Course already has a scheduled session on ${slot.day_of_week} (${slot.start_time}–${slot.end_time}).`,
      };
    }
  }

  return { conflict: false };
}
