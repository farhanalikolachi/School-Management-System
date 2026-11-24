-- ============================================================================
-- SINDHTECH INSTITUTE – SCHOOL & COURSE MANAGEMENT SYSTEM
-- Complete MySQL 8.0+ Relational Database Schema (24 Tables)
-- Ready for phpMyAdmin / MySQL Import
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `sindhtech_institute`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `sindhtech_institute`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. users
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(60) NOT NULL,
  `email` VARCHAR(120) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'teacher', 'student') NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `avatar_url` VARCHAR(255) NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
  `failed_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME NULL,
  `last_login_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role_status` (`role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. academic_sessions
CREATE TABLE IF NOT EXISTS `academic_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_name` VARCHAR(60) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_name` (`session_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. teachers
CREATE TABLE IF NOT EXISTS `teachers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `teacher_code` VARCHAR(32) NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `father_name` VARCHAR(120) NOT NULL,
  `gender` ENUM('Male', 'Female', 'Other') NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(120) NULL,
  `address` TEXT NULL,
  `qualification` VARCHAR(120) NOT NULL,
  `specialization` VARCHAR(120) NOT NULL,
  `joining_date` DATE NOT NULL,
  `salary` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `working_hours` VARCHAR(80) NOT NULL DEFAULT '08:00 AM - 02:00 PM',
  `profile_picture` VARCHAR(255) NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `deleted_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teachers_code` (`teacher_code`),
  UNIQUE KEY `uq_teachers_user` (`user_id`),
  CONSTRAINT `fk_teachers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. classes
CREATE TABLE IF NOT EXISTS `classes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `class_name` VARCHAR(80) NOT NULL,
  `class_code` VARCHAR(30) NOT NULL,
  `level_order` INT NOT NULL DEFAULT 0,
  `class_teacher_id` BIGINT UNSIGNED NULL,
  `class_timing` VARCHAR(80) NOT NULL DEFAULT '08:00 AM - 01:30 PM',
  `monthly_fee` DECIMAL(12,2) NOT NULL DEFAULT 3000.00,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `deleted_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classes_code` (`class_code`),
  CONSTRAINT `fk_classes_teacher` FOREIGN KEY (`class_teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. sections
CREATE TABLE IF NOT EXISTS `sections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `class_id` BIGINT UNSIGNED NOT NULL,
  `section_name` VARCHAR(40) NOT NULL,
  `capacity` INT UNSIGNED NOT NULL DEFAULT 35,
  `room_number` VARCHAR(30) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_section` (`class_id`, `section_name`),
  CONSTRAINT `fk_sections_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. courses
CREATE TABLE IF NOT EXISTS `courses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_name` VARCHAR(120) NOT NULL,
  `course_code` VARCHAR(32) NOT NULL,
  `category` VARCHAR(80) NOT NULL DEFAULT 'Professional Courses',
  `duration` VARCHAR(60) NOT NULL,
  `course_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `description` TEXT NULL,
  `teacher_id` BIGINT UNSIGNED NULL,
  `class_timing` VARCHAR(80) NOT NULL,
  `max_students` INT UNSIGNED NOT NULL DEFAULT 25,
  `course_image` VARCHAR(255) NULL,
  `admission_status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `deleted_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_courses_code` (`course_code`),
  CONSTRAINT `fk_courses_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. subjects
CREATE TABLE IF NOT EXISTS `subjects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subject_name` VARCHAR(100) NOT NULL,
  `subject_code` VARCHAR(30) NOT NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `teacher_id` BIGINT UNSIGNED NULL,
  `total_marks` INT UNSIGNED NOT NULL DEFAULT 100,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subject_code` (`subject_code`),
  CONSTRAINT `fk_subjects_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subjects_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subjects_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. students
CREATE TABLE IF NOT EXISTS `students` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `student_code` VARCHAR(32) NOT NULL,
  `full_name` VARCHAR(120) NOT NULL,
  `father_name` VARCHAR(120) NOT NULL,
  `dob` DATE NOT NULL,
  `gender` ENUM('Male', 'Female', 'Other') NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `guardian_phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(120) NULL,
  `address` TEXT NULL,
  `profile_picture` VARCHAR(255) NULL,
  `admission_date` DATE NOT NULL,
  `education_category` ENUM('school', 'course') NOT NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `section_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `assigned_teacher_id` BIGINT UNSIGNED NULL,
  `monthly_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `admission_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `deleted_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_students_code` (`student_code`),
  UNIQUE KEY `uq_students_user` (`user_id`),
  KEY `idx_students_category_status` (`education_category`, `status`),
  CONSTRAINT `fk_students_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_students_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_students_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_students_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_students_teacher` FOREIGN KEY (`assigned_teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. enrollments
CREATE TABLE IF NOT EXISTS `enrollments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `education_category` ENUM('school', 'course') NOT NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `section_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `enrollment_date` DATE NOT NULL,
  `status` ENUM('active', 'promoted', 'completed', 'dropped') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_enrollments_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enrollments_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enrollments_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. attendance
CREATE TABLE IF NOT EXISTS `attendance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendee_type` ENUM('student', 'teacher') NOT NULL,
  `student_id` BIGINT UNSIGNED NULL,
  `teacher_id` BIGINT UNSIGNED NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `attendance_date` DATE NOT NULL,
  `status` ENUM('present', 'absent', 'late', 'leave') NOT NULL,
  `remarks` VARCHAR(255) NULL,
  `marked_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_attendance_date` (`attendance_date`, `attendee_type`),
  CONSTRAINT `fk_attendance_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_marked_by` FOREIGN KEY (`marked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. fees
CREATE TABLE IF NOT EXISTS `fees` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `session_id` BIGINT UNSIGNED NULL,
  `challan_number` VARCHAR(40) NOT NULL,
  `fee_type` ENUM('monthly', 'admission', 'course', 'exam', 'other') NOT NULL,
  `fee_month` VARCHAR(20) NULL,
  `base_amount` DECIMAL(12,2) NOT NULL,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `late_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_amount` DECIMAL(12,2) NOT NULL,
  `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `remaining_amount` DECIMAL(12,2) NOT NULL,
  `due_date` DATE NOT NULL,
  `status` ENUM('pending', 'partial', 'paid', 'overdue') NOT NULL DEFAULT 'pending',
  `notes` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fees_challan` (`challan_number`),
  KEY `idx_fees_student_status` (`student_id`, `status`),
  CONSTRAINT `fk_fees_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. fee_payments
CREATE TABLE IF NOT EXISTS `fee_payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fee_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `receipt_number` VARCHAR(40) NOT NULL,
  `amount_paid` DECIMAL(12,2) NOT NULL,
  `payment_date` DATE NOT NULL,
  `payment_method` ENUM('cash', 'bank_transfer', 'other') NOT NULL,
  `transaction_ref` VARCHAR(100) NULL,
  `received_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee_payments_receipt` (`receipt_number`),
  CONSTRAINT `fk_payments_fee` FOREIGN KEY (`fee_id`) REFERENCES `fees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. teacher_salaries
CREATE TABLE IF NOT EXISTS `teacher_salaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `teacher_id` BIGINT UNSIGNED NOT NULL,
  `salary_month` VARCHAR(20) NOT NULL,
  `base_salary` DECIMAL(12,2) NOT NULL,
  `bonus` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `deduction` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_salary` DECIMAL(12,2) NOT NULL,
  `payment_date` DATE NULL,
  `payment_method` ENUM('cash', 'bank_transfer', 'other') NULL,
  `status` ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teacher_salary_month` (`teacher_id`, `salary_month`),
  CONSTRAINT `fk_salary_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. timetables
CREATE TABLE IF NOT EXISTS `timetables` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `day_of_week` ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
  `start_time` VARCHAR(10) NOT NULL,
  `end_time` VARCHAR(10) NOT NULL,
  `teacher_id` BIGINT UNSIGNED NOT NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `section_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `subject_id` BIGINT UNSIGNED NULL,
  `room` VARCHAR(40) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_tt_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tt_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tt_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tt_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. exams
CREATE TABLE IF NOT EXISTS `exams` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exam_name` VARCHAR(120) NOT NULL,
  `session_id` BIGINT UNSIGNED NULL,
  `education_category` ENUM('school', 'course') NOT NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `exam_date` DATE NOT NULL,
  `is_published` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_exams_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exams_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. marks
CREATE TABLE IF NOT EXISTS `marks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exam_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `subject_id` BIGINT UNSIGNED NULL,
  `subject_name` VARCHAR(100) NOT NULL,
  `total_marks` DECIMAL(8,2) NOT NULL,
  `obtained_marks` DECIMAL(8,2) NOT NULL,
  `percentage` DECIMAL(5,2) NOT NULL,
  `grade` VARCHAR(5) NOT NULL,
  `remarks` VARCHAR(80) NULL,
  `entered_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_student_subject` (`exam_id`, `student_id`, `subject_name`),
  CONSTRAINT `fk_marks_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_marks_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. assignments
CREATE TABLE IF NOT EXISTS `assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(160) NOT NULL,
  `description` TEXT NOT NULL,
  `teacher_id` BIGINT UNSIGNED NOT NULL,
  `class_id` BIGINT UNSIGNED NULL,
  `course_id` BIGINT UNSIGNED NULL,
  `due_date` DATE NOT NULL,
  `attachment_name` VARCHAR(255) NULL,
  `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_assign_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. assignment_submissions
CREATE TABLE IF NOT EXISTS `assignment_submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `submission_text` TEXT NULL,
  `file_name` VARCHAR(255) NULL,
  `submitted_at` DATETIME NOT NULL,
  `status` ENUM('submitted', 'graded', 'late') NOT NULL DEFAULT 'submitted',
  `grade_score` VARCHAR(30) NULL,
  `teacher_feedback` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assign_student` (`assignment_id`, `student_id`),
  CONSTRAINT `fk_sub_assign` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. notices
CREATE TABLE IF NOT EXISTS `notices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(180) NOT NULL,
  `content` TEXT NOT NULL,
  `target_audience` ENUM('all', 'teachers', 'students', 'class', 'course') NOT NULL DEFAULT 'all',
  `target_class_id` BIGINT UNSIGNED NULL,
  `target_course_id` BIGINT UNSIGNED NULL,
  `priority` ENUM('normal', 'important', 'urgent') NOT NULL DEFAULT 'normal',
  `published_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(60) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user_read` (`user_id`, `is_read`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. leave_requests
CREATE TABLE IF NOT EXISTS `leave_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `requester_role` ENUM('teacher', 'student') NOT NULL,
  `leave_type` VARCHAR(60) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_leave_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. activity_logs
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(120) NOT NULL,
  `entity_type` VARCHAR(60) NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `details` TEXT NULL,
  `ip_address` VARCHAR(60) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. password_resets
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `reset_token` VARCHAR(128) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reset_token` (`reset_token`),
  CONSTRAINT `fk_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. system_settings
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Initial Academic Session, Classes (Nursery - Class 8), and Video Editing Course
INSERT IGNORE INTO `academic_sessions` (`session_name`, `start_date`, `end_date`, `is_active`)
VALUES ('2026-2027', '2026-04-01', '2027-03-31', 1);

INSERT IGNORE INTO `classes` (`class_name`, `class_code`, `level_order`, `class_timing`, `monthly_fee`) VALUES
('Nursery', 'NUR', 1, '08:00 AM - 12:00 PM', 2500.00),
('KG', 'KG', 2, '08:00 AM - 12:30 PM', 2700.00),
('Class 1', 'CLS-1', 3, '08:00 AM - 01:00 PM', 3000.00),
('Class 2', 'CLS-2', 4, '08:00 AM - 01:00 PM', 3000.00),
('Class 3', 'CLS-3', 5, '08:00 AM - 01:30 PM', 3200.00),
('Class 4', 'CLS-4', 6, '08:00 AM - 01:30 PM', 3200.00),
('Class 5', 'CLS-5', 7, '08:00 AM - 01:30 PM', 3500.00),
('Class 6', 'CLS-6', 8, '08:00 AM - 02:00 PM', 3800.00),
('Class 7', 'CLS-7', 9, '08:00 AM - 02:00 PM', 4000.00),
('Class 8', 'CLS-8', 10, '08:00 AM - 02:00 PM', 4200.00);

INSERT IGNORE INTO `courses` (`course_name`, `course_code`, `category`, `duration`, `course_fee`, `description`, `class_timing`, `max_students`, `admission_status`, `status`)
VALUES ('Video Editing', 'VID-101', 'Professional Courses', '3 Months', 8500.00, 'Comprehensive non-linear video editing, color grading, motion graphics, and audio post-production.', '03:00 PM - 05:00 PM', 25, 'open', 'active');

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('institute_name', 'SindhTech Institute'),
('institute_tagline', 'Excellence in School Education & Technical Skills'),
('institute_phone', '+92 300 1234567'),
('institute_email', 'info@sindhtech.edu.pk'),
('institute_address', 'Main Shahrah-e-Faisal, Karachi, Sindh'),
('currency_symbol', 'PKR');

SET FOREIGN_KEY_CHECKS = 1;
