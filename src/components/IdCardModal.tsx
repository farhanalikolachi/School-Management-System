import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { Printer, Download } from 'lucide-react';
import { Modal, ImageWithFallback } from './UiPrimitives';

export interface IdCardPerson {
  role: 'Student' | 'Teacher';
  code: string;
  fullName: string;
  subtitle: string;
  contact: string;
  photo?: string | null;
  validUntil?: string;
}

export function IdCardModal({
  person,
  onClose,
}: {
  person: IdCardPerson | null;
  onClose: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (!person) return;
    const payload = JSON.stringify({
      institute: 'SindhTech Institute',
      id: person.code,
      name: person.fullName,
      role: person.role,
      program: person.subtitle,
      valid: person.validUntil || '2027-03-31',
    });
    QRCode.toDataURL(payload, { width: 180, margin: 1 })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [person]);

  if (!person) return null;

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: [85.6, 54], orientation: 'landscape' });
    doc.setFillColor(15, 41, 66);
    doc.rect(0, 0, 85.6, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SINDHTECH INSTITUTE', 5, 7);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(`${person.role.toUpperCase()} IDENTITY CARD`, 5, 11);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(person.fullName, 5, 22);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`ID: ${person.code}`, 5, 28);
    doc.text(`${person.role === 'Student' ? 'Program' : 'Dept'}: ${person.subtitle}`, 5, 33);
    doc.text(`Contact: ${person.contact}`, 5, 38);
    doc.text(`Valid Thru: ${person.validUntil || 'March 31, 2027'}`, 5, 43);

    if (qrUrl) {
      doc.addImage(qrUrl, 'PNG', 61, 18, 20, 20);
    }

    doc.setFillColor(217, 119, 6);
    doc.rect(0, 51.5, 85.6, 2.5, 'F');
    doc.save(`${person.code}_ID_Card.pdf`);
  };

  return (
    <Modal open={Boolean(person)} onClose={onClose} title={`${person.role} Identity Card — ${person.code}`} maxWidth="max-w-lg">
      <div className="space-y-6">
        <div
          id="printable-id-card"
          className="mx-auto w-full max-w-[380px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white text-slate-900 shadow-md"
        >
          <div className="bg-[#0F2942] px-5 py-3.5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/institute_crest_1794654889307.jpg"
                alt="SindhTech Institute Logo"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-lg object-cover bg-white p-0.5 shrink-0"
              />
              <div>
                <div className="font-display font-bold text-sm tracking-tight">SINDHTECH INSTITUTE</div>
                <div className="text-[11px] text-slate-300">{person.role} Official Identity Card</div>
              </div>
            </div>
          </div>

          <div className="p-5 flex items-start gap-4">
            <ImageWithFallback
              src={person.photo}
              alt={person.fullName}
              fallbackText={person.fullName}
              className="w-20 h-24 rounded-lg object-cover border border-slate-200 shrink-0 text-xl"
            />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="font-display font-bold text-base text-slate-900 truncate">{person.fullName}</div>
              <div className="font-mono-tabular text-xs font-semibold text-blue-700">{person.code}</div>
              <div className="text-xs text-slate-600 truncate">
                {person.role === 'Student' ? 'Enrolled:' : 'Specialization:'}{' '}
                <span className="font-medium text-slate-800">{person.subtitle}</span>
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular">Ph: {person.contact}</div>
              <div className="text-[11px] text-slate-500 pt-1">
                Valid Thru: {person.validUntil || '31 Mar 2027'}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center">
              {qrUrl ? (
                <img src={qrUrl} alt={`QR verification for ${person.code}`} className="w-16 h-16 border border-slate-200 rounded" />
              ) : (
                <div className="w-16 h-16 bg-slate-100 rounded" />
              )}
              <span className="text-[9px] text-slate-400 mt-1">Verify ID</span>
            </div>
          </div>

          <div className="px-5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
            <span>PECHS Block 6, Karachi</span>
            <span>admin@sindhtech.edu.pk</span>
          </div>
          <div className="h-1.5 bg-amber-600" />
        </div>

        <div className="flex items-center justify-end gap-3 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-4 h-4" />
            Print Card
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#0F2942] text-white hover:bg-[#163A5C]"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>
    </Modal>
  );
}
