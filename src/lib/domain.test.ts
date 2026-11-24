import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStudentCode,
  formatStudentUsername,
  formatTeacherCode,
  formatTeacherUsername,
  detectRoleFromIdentifier,
  normalizePkWhatsAppNumber,
  formatProgramLabel,
  formatSubjectsSummary,
  validateStudentSubjects,
  isFeePastFifthDueDate,
  buildFeeReminderMessage,
  generateTempPassword,
  validatePasswordStrength,
  calculateNetFee,
  calculateFeeBalance,
  validatePaymentAmount,
  calculatePercentage,
  calculateGrade,
  findTimetableConflict,
} from './domain';

test('ID and username formatters match SindhTech prefixed convention', () => {
  assert.equal(formatStudentCode(1013), 'STI-STU-1013');
  assert.equal(formatStudentUsername(1013), 'STUDENTIDSTI1013');
  assert.equal(formatTeacherCode(1001), 'STI-TEA-1001');
  assert.equal(formatTeacherUsername(1001), 'TEACHERID1001');
});

test('Auto-detects role from prefixed login IDs', () => {
  assert.equal(detectRoleFromIdentifier('STUDENTIDSTI1013'), 'student');
  assert.equal(detectRoleFromIdentifier('studentidsti1001'), 'student');
  assert.equal(detectRoleFromIdentifier('TEACHERID1002'), 'teacher');
  assert.equal(detectRoleFromIdentifier('ADMINID01'), 'admin');
  assert.equal(detectRoleFromIdentifier('admin@sindhtech.edu.pk'), 'admin');
  assert.equal(detectRoleFromIdentifier('hamza@example.com'), null);
});

test('Pakistani WhatsApp phone normalization and 5th-date fee reminder rules', () => {
  assert.equal(normalizePkWhatsAppNumber('0300-1112233'), '923001112233');
  assert.equal(normalizePkWhatsAppNumber('+92 333 9876543'), '923339876543');
  assert.equal(normalizePkWhatsAppNumber('00923157778899'), '923157778899');
  assert.equal(normalizePkWhatsAppNumber('123'), null);

  assert.equal(formatProgramLabel('Class 8', 'Video Editing', 'both'), 'Class 8 + Video Editing');

  // Same month: before 5th is not due yet; on/after 5th is overdue
  assert.equal(
    isFeePastFifthDueDate({ feeMonth: '2026-11', dueDate: '2026-11-05', remainingAmount: 4200, status: 'pending' }, '2026-11-04'),
    false,
  );
  assert.equal(
    isFeePastFifthDueDate({ feeMonth: '2026-11', dueDate: '2026-11-05', remainingAmount: 4200, status: 'pending' }, '2026-11-05'),
    true,
  );
  assert.equal(
    isFeePastFifthDueDate({ feeMonth: '2026-11', dueDate: '2026-11-05', remainingAmount: 0, status: 'paid' }, '2026-11-10'),
    false,
  );

  const msg = buildFeeReminderMessage({
    studentName: 'Bilal Ahmed',
    studentCode: 'STI-STU-1013',
    challanNumber: 'CHL-5010',
    feeMonth: '2026-11',
    remainingAmount: 4200,
    programName: 'Class 8 + Video Editing',
  });
  assert.ok(msg.includes('Bilal Ahmed'));
  assert.ok(msg.includes('CHL-5010'));
  assert.ok(msg.includes('PKR 4,200'));
});

test('Subject summary and class subject validation rules work correctly', () => {
  assert.equal(formatSubjectsSummary([]), '');
  assert.equal(formatSubjectsSummary(['English', 'Mathematics', 'Physics']), '3 Subjects (English, Mathematics, Physics)');
  assert.equal(
    formatSubjectsSummary(['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Urdu']),
    '6 Subjects (English, Mathematics, Physics, Chemistry +2 more)',
  );

  assert.equal(
    validateStudentSubjects({ educationCategory: 'school', availableSubjectCount: 8, selectedSubjectIds: [] }).valid,
    false,
  );
  assert.equal(
    validateStudentSubjects({ educationCategory: 'both', availableSubjectCount: 8, selectedSubjectIds: [1, 2, 3] }).valid,
    true,
  );
  assert.equal(
    validateStudentSubjects({ educationCategory: 'course', availableSubjectCount: 0, selectedSubjectIds: [] }).valid,
    true,
  );
});


test('Temporary password generator produces strong passwords', () => {
  const pwd = generateTempPassword(12);
  assert.equal(pwd.length, 12);
  assert.equal(validatePasswordStrength(pwd).valid, true);
});

test('Fee net and balance calculations prevent negative or incorrect balances', () => {
  const net = calculateNetFee(5000, 500, 200);
  assert.equal(net, 4700);
  assert.deepEqual(calculateFeeBalance(net, 0), { remaining: 4700, status: 'pending' });
  assert.deepEqual(calculateFeeBalance(net, 2000), { remaining: 2700, status: 'partial' });
  assert.deepEqual(calculateFeeBalance(net, 4700), { remaining: 0, status: 'paid' });
  assert.equal(validatePaymentAmount(2700, 3000).valid, false);
  assert.equal(validatePaymentAmount(2700, 0).valid, false);
  assert.equal(validatePaymentAmount(2700, 2700).valid, true);
});

test('Exam percentage and grading rules compute accurately', () => {
  assert.equal(calculatePercentage(85, 100), 85);
  assert.equal(calculateGrade(92).grade, 'A+');
  assert.equal(calculateGrade(74).grade, 'B');
  assert.equal(calculateGrade(42).grade, 'F');
});

test('Timetable conflict detector blocks overlapping teacher, class, or course slots', () => {
  const existing = [
    {
      id: 1,
      day_of_week: 'Monday',
      start_time: '09:00',
      end_time: '10:00',
      teacher_id: 1,
      class_id: 2,
      section_id: 1,
      course_id: null,
    },
  ];

  // Teacher conflict
  const teacherConflict = findTimetableConflict(
    { day_of_week: 'Monday', start_time: '09:30', end_time: '10:30', teacher_id: 1, class_id: 3, section_id: 2 },
    existing,
  );
  assert.equal(teacherConflict.conflict, true);

  // Class/section conflict
  const classConflict = findTimetableConflict(
    { day_of_week: 'Monday', start_time: '08:30', end_time: '09:15', teacher_id: 2, class_id: 2, section_id: 1 },
    existing,
  );
  assert.equal(classConflict.conflict, true);

  // Adjacent slot (10:00-11:00) does NOT conflict
  const adjacentOk = findTimetableConflict(
    { day_of_week: 'Monday', start_time: '10:00', end_time: '11:00', teacher_id: 1, class_id: 2, section_id: 1 },
    existing,
  );
  assert.equal(adjacentOk.conflict, false);
});
