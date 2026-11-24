import { jsPDF } from 'jspdf';

export function downloadFeeChallanPdf(fee: {
  challan_number: string;
  student_code: string;
  full_name: string;
  father_name?: string;
  enrolled_in?: string;
  fee_type: string;
  fee_month?: string;
  base_amount: number;
  discount: number;
  late_fee: number;
  net_amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  status: string;
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('SINDHTECH INSTITUTE', 16, 15);
  doc.setFontSize(10);
  doc.text('Official Fee Challan Voucher · Academy & Professional Courses (Pakistan)', 16, 23);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(`Challan No: ${fee.challan_number}`, 16, 44);
  doc.text(`Due Date: ${fee.due_date}`, 140, 44);

  doc.setDrawColor(203, 213, 225);
  doc.line(16, 48, 194, 48);

  doc.setFontSize(10);
  const info = [
    ['Student ID:', fee.student_code],
    ['Student Name:', fee.full_name],
    ['Father Name:', fee.father_name || '—'],
    ['Class / Course:', fee.enrolled_in || '—'],
    ['Fee Category:', `${fee.fee_type.toUpperCase()} (${fee.fee_month || 'Current'})`],
    ['Status:', fee.status.toUpperCase()],
  ];

  let y = 58;
  for (const [k, v] of info) {
    doc.setFont('helvetica', 'bold');
    doc.text(k, 16, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), 58, y);
    y += 8;
  }

  y += 6;
  doc.setFillColor(241, 245, 249);
  doc.rect(16, y, 178, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Fee Breakdown', 20, y + 6.5);
  doc.text('Amount (PKR)', 162, y + 6.5);

  const lines = [
    ['Base Tuition / Fee Amount', fee.base_amount.toLocaleString()],
    ['Fee Discount', `- ${fee.discount.toLocaleString()}`],
    ['Late Fee Surcharge', `+ ${fee.late_fee.toLocaleString()}`],
    ['Net Payable Amount', fee.net_amount.toLocaleString()],
    ['Paid Amount', fee.paid_amount.toLocaleString()],
    ['Remaining Balance Due', fee.remaining_amount.toLocaleString()],
  ];

  y += 16;
  for (let i = 0; i < lines.length; i++) {
    const [label, amt] = lines[i];
    doc.setFont('helvetica', i >= 3 ? 'bold' : 'normal');
    doc.text(label, 20, y);
    doc.text(amt, 188, y, { align: 'right' });
    doc.line(16, y + 2.5, 194, y + 2.5);
    y += 9;
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Please retain this challan copy after bank or accounts counter stamp.', 16, y + 14);
  doc.save(`${fee.challan_number}_Fee_Challan.pdf`);
}

export function downloadPaymentReceiptPdf(payment: {
  receipt_number: string;
  challan_number: string;
  student_code: string;
  full_name: string;
  fee_type: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  transaction_ref?: string;
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('SINDHTECH INSTITUTE — PAYMENT RECEIPT', 14, 16);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(`Receipt #: ${payment.receipt_number}`, 14, 38);
  doc.text(`Payment Date: ${payment.payment_date}`, 140, 38);

  const rows = [
    ['Student ID', payment.student_code],
    ['Student Name', payment.full_name],
    ['Challan Reference', payment.challan_number],
    ['Fee Type', payment.fee_type.toUpperCase()],
    ['Payment Method', payment.payment_method.replace('_', ' ').toUpperCase()],
    ['Transaction Ref', payment.transaction_ref || 'N/A'],
    ['Amount Received', `PKR ${Number(payment.amount_paid).toLocaleString()}`],
  ];

  let y = 50;
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(k, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), 70, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y + 2, 196, y + 2);
    y += 9;
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Computer-generated verified fee payment receipt · SindhTech Institute Accounts Office', 14, 132);
  doc.save(`${payment.receipt_number}_Receipt.pdf`);
}

export function downloadResultCardPdf(
  examName: string,
  examDate: string,
  student: { student_code: string; full_name: string; father_name?: string; program?: string },
  marks: Array<{ subject_name: string; total_marks: number; obtained_marks: number; percentage: number; grade: string; remarks?: string }>,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('SINDHTECH INSTITUTE', 16, 15);
  doc.setFontSize(11);
  doc.text(`Official Academic Result Card · ${examName}`, 16, 24);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`Student ID: ${student.student_code}`, 16, 46);
  doc.text(`Student Name: ${student.full_name}`, 16, 53);
  doc.text(`Father Name: ${student.father_name || '—'}`, 120, 46);
  doc.text(`Exam Date: ${examDate}`, 120, 53);
  if (student.program) {
    doc.text(`Program / Class: ${student.program}`, 16, 60);
  }

  let y = 72;
  doc.setFillColor(241, 245, 249);
  doc.rect(16, y, 178, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Subject', 20, y + 6);
  doc.text('Total', 105, y + 6);
  doc.text('Obtained', 128, y + 6);
  doc.text('%', 155, y + 6);
  doc.text('Grade', 174, y + 6);

  y += 14;
  let sumTotal = 0;
  let sumObtained = 0;

  doc.setFont('helvetica', 'normal');
  for (const m of marks) {
    sumTotal += Number(m.total_marks);
    sumObtained += Number(m.obtained_marks);
    doc.text(m.subject_name, 20, y);
    doc.text(String(m.total_marks), 108, y);
    doc.text(String(m.obtained_marks), 132, y);
    doc.text(`${m.percentage}%`, 155, y);
    doc.text(m.grade, 176, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(16, y + 3, 194, y + 3);
    y += 9;
  }

  const overallPct = sumTotal > 0 ? Math.round((sumObtained / sumTotal) * 10000) / 100 : 0;
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Aggregate Score: ${sumObtained} / ${sumTotal} (${overallPct}%)`, 16, y);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Controller of Examinations · SindhTech Institute', 16, 270);
  doc.save(`${student.student_code}_Result_Card.pdf`);
}

export function downloadReportPdf(title: string, rows: Record<string, any>[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(`SindhTech Institute — ${title}`, 14, 15);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  if (rows.length === 0) {
    doc.text('No records matched the selected filter criteria.', 14, 38);
    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    return;
  }

  const headers = Object.keys(rows[0]).slice(0, 8);
  const colW = 268 / headers.length;
  let y = 34;

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 5, 268, 8, 'F');
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => {
    doc.text(h.replace(/_/g, ' ').toUpperCase().slice(0, 18), 16 + i * colW, y);
  });

  y += 8;
  doc.setFont('helvetica', 'normal');
  for (const row of rows.slice(0, 35)) {
    headers.forEach((h, i) => {
      const val = row[h] === null || row[h] === undefined ? '—' : String(row[h]);
      doc.text(val.slice(0, 20), 16 + i * colW, y);
    });
    y += 6.5;
    if (y > 192) {
      doc.addPage();
      y = 20;
    }
  }

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}
