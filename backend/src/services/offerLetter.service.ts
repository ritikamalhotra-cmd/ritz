import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { db } from '../utils/db';
import { amountInWords, formatINR } from './salaryBreakup.service';
import { logger } from '../utils/logger';

// ── Template seed tag ──
const DEFAULT_TEMPLATE_SEED_TAG = 'seed:v2-dotpe-format-apr2026';

// ── Salary calculation — matches actual DotPe letter ──
interface DotpeSalary {
  basicAnnual: number;   basicMonthly: number;
  hraAnnual: number;     hraMonthly: number;
  specialAnnual: number; specialMonthly: number;
  grossAnnual: number;   grossMonthly: number;
  pfAnnual: number;      pfMonthly: number;
  totalAnnual: number;   totalMonthly: number;
  joiningBonus: number;
}

function computeDotpeSalary(ctcAnnual: number, joiningBonus = 0, pfOptIn = true): DotpeSalary {
  const basicAnnual   = Math.round(ctcAnnual * 0.5);
  const hraAnnual     = Math.round(basicAnnual * 0.5);
  const basicMonthly  = Math.round(basicAnnual / 12);
  const pfMonthly     = pfOptIn ? Math.round(Math.min(basicMonthly, 15000) * 0.12) : 0;
  const pfAnnual      = pfMonthly * 12;
  const specialAnnual = ctcAnnual - basicAnnual - hraAnnual - pfAnnual;
  const grossAnnual   = basicAnnual + hraAnnual + specialAnnual;
  return {
    basicAnnual,   basicMonthly,
    hraAnnual,     hraMonthly:   Math.round(hraAnnual / 12),
    specialAnnual, specialMonthly: Math.round(specialAnnual / 12),
    grossAnnual,   grossMonthly:  Math.round(grossAnnual / 12),
    pfAnnual,      pfMonthly,
    totalAnnual:   ctcAnnual,
    totalMonthly:  Math.round(ctcAnnual / 12),
    joiningBonus,
  };
}

// ── PDF layout — matches DOCX margins ──
const PAGE_W   = 595.28;
const PAGE_H   = 841.89;
const ML       = 50;           // left margin  (993 twips → ~50pt)
const MR       = 42;           // right margin (849 twips → ~42pt)
const MT_BODY  = 128;          // top of body text (2552 twips → ~128pt, header logo above)
const MB       = 72;           // bottom margin
const CW       = PAGE_W - ML - MR;  // content width ~503pt
const LOGO_H   = 60;           // logo height in header
const LOGO_W   = LOGO_H * (1015 / 571); // preserve aspect ratio → ~107pt
const GREY     = '#555555';
const BLACK    = '#000000';
const LOGO_PATH = path.join(__dirname, '../assets/dotpe-logo.png');

// ── Date helpers ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')} - ${MONTHS[d.getMonth()]} - ${d.getFullYear()}`;
}

// ── Core PDF builder ──
export function renderOfferLetterPdf(opts: {
  generatedDate: Date;
  doj?: Date | null;
  noticePeriodDays?: number | null;
  candidate: { fullName: string; email: string; phone?: string | null; address?: string | null };
  role: { designation: string; department: string; location?: string | null };
  salary: DotpeSalary;
  signatureBlock?: { signedName: string; signedAt: Date };
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { candidate, role, salary } = opts;
    const firstName  = candidate.fullName.split(' ')[0];
    const location   = role.location || 'Gurugram, Haryana';
    const dojStr     = opts.doj ? fmtDate(opts.doj) : '[Date of Joining]';
    const noticeDays = opts.noticePeriodDays ?? 60;

    // Start first page
    doc.addPage();
    let y = MT_BODY;

    // ── helpers ──
    function ensureSpace(need: number) {
      if (y + need > PAGE_H - MB) { doc.addPage(); y = MT_BODY; }
    }
    function ln(extra = 0) { y += extra; }

    function text(
      content: string,
      tOpts: { bold?: boolean; size?: number; color?: string; align?: 'left'|'center'|'right'|'justify'; indent?: number; width?: number } = {},
    ) {
      const size   = tOpts.size ?? 11;
      const color  = tOpts.color ?? BLACK;
      const indent = tOpts.indent ?? 0;
      const width  = tOpts.width ?? (CW - indent);
      const font   = tOpts.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.fontSize(size).font(font).fillColor(color);
      const h = doc.heightOfString(content, { width }) + 3;
      ensureSpace(h);
      doc.text(content, ML + indent, y, { width, align: tOpts.align ?? 'left', lineBreak: true });
      y = doc.y + 2;
    }

    function para(content: string, indent = 0) {
      text(content, { align: 'justify', indent, size: 11 });
      ln(5);
    }

    function heading(title: string) {
      ln(8);
      ensureSpace(22);
      text(title, { bold: true, size: 11 });
      ln(1);
    }

    function divider() {
      ensureSpace(8);
      doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#AAAAAA').lineWidth(0.5).stroke();
      ln(10);
    }

    // ════════════════════════════════════════════
    // PAGE 1 — Appointment Letter
    // ════════════════════════════════════════════

    // "PRIVATE & CONFIDENTIAL" + Date on same line
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BLACK)
      .text('PRIVATE & CONFIDENTIAL', ML, y, { width: CW / 2 });
    doc.fontSize(11).font('Helvetica').fillColor(BLACK)
      .text(`Date: ${fmtDate(opts.generatedDate)}`, ML + CW / 2, y, { width: CW / 2, align: 'right' });
    y = doc.y + 14;

    // Address block
    text(`To,`);
    text(candidate.fullName, { bold: true });
    if (candidate.address) {
      candidate.address.split('\n').forEach(line => line.trim() && text(line.trim()));
    }
    ln(8);

    // Re: line
    text(`Re: Appointment Letter for the position of "${role.designation}" with Dotpe Private Limited.`, { bold: true });
    ln(8);

    // Salutation
    text(`Dear ${firstName},`);
    ln(4);

    // Opening
    para(`Dotpe Private Limited ("Company") is glad to offer you an appointment with the Company as ${role.designation}. This appointment letter, if accepted, sets forth the terms of your employment with the Company. Your employment with the Company is conditional upon your continued acceptance of the terms of this appointment letter ("Terms and Conditions") and the execution of this appointment letter.`);

    // ── Sections ──

    heading('Date and Scope of Appointment');
    para(`Your appointment will be effective from ${dojStr}. The commencement of your employment with the Company is subject to the Terms and Conditions set out in this appointment letter and on completion of all joining formalities. Further, please treat the contents of this appointment letter as confidential.`);
    para(`You will be employed as ${role.designation} with the Company. The position is a full-time position.`);

    heading('Salary');
    para(`Your annual total salary includes your compensation and perquisites is INR ${formatINR(salary.totalAnnual)}/-. ${salary.joiningBonus > 0 ? `In addition to this, you will receive a one-time joining bonus of INR ${formatINR(salary.joiningBonus)}.` : ''} Detailed break up of your annual total salary is provided in Annexure I ("Compensation"). The Company will communicate any change in Compensation to you in writing.`);
    para(`Your Compensation is strictly confidential between you and the Company and should not be discussed with anyone nor divulged to anyone in any manner whatsoever.`);
    para(`Your Compensation will be payable according to local payroll practices, subject to any deduction, including without limitation the usual deductions for tax and provident fund contributions provided in accordance with law. The Company reserves the right to change your Compensation and/or the components thereof and withhold any bonus or award payment or withdraw any such payment at any time.`);

    heading('Leave Entitlement, National & Public Holidays');
    para(`You will be entitled to leave and other benefits in accordance with the policies of the Company and in accordance with applicable law. National and Festival Holidays will be in keeping with Company policy as well as the provisions of the applicable statutory legislation in the State of your eventual assignment.`);

    heading('Hours of Work');
    para(`A working day shall comprise of Nine (9) hours, irrespective of shifts, which includes 8 working hours and 1 hour of break, subject to applicable law. You may be required to work on a shift basis. Shifts may be scheduled across Twenty-Four (24) hours a day, Seven (7) days a week and Three Hundred and Sixty-Five (365) days a year, subject to applicable laws. The shift timings may change from time to time, which you shall be notified of in advance. At times you may be required to work beyond 9 working hours for business purposes.`);

    heading('Tax');
    para(`All applicable Indian taxes on your Compensation and Benefits stated in this employment contract will be as per subsisting governmental laws as well as any applicable statutory contributions, if any, etc. shall be borne and paid entirely by you. The Company shall, pursuant to applicable law, withhold from any benefit or salary made pursuant to this letter all central, state, municipal, other taxes, contribution, etc. as may be required. You will continue to be responsible for the filing and accuracy of all required tax returns in India.`);

    heading('Reimbursement of Expenses');
    para(`The Company will reimburse you for reasonable travel and other business expenses incurred during the performance of your duties hereunder, in accordance with the policy of the Company with respect thereto, as may be applicable from time to time.`);

    heading('Place of Employment');
    para(`You will be posted in ${location}. Please note that, during the course of your employment, you may be required to report or relocate to another location, within India or outside India, at the discretion of the Company. Further, please note that you may be required to travel on behalf of the Company, which will be notified to you in advance. The Company reserves the right to transfer your services under substantially the same Terms and Conditions contained herein, to any successor-in-interest by virtue of any corporate restructuring, amalgamation, takeover or merger by or of the Company.`);

    heading('Probation Period, Confirmation and Termination');
    para(`The initial Three (3) Months of your employment will be deemed as Probationary Period. The Management reserves the right to reduce / dispense with or extend your probation period at its absolute discretion. Upon successful completion of your probationary period, you will be notified in writing.`);
    para(`During this Probationary Period, either party may, without furnishing reasons, terminate the employment by giving Thirty (30) days' notice or salary in lieu thereof on either side during this probation period with no liability other than for time worked prior to such termination. However, the Company reserves the right to demand a prior notice of Sixty (60) days, during your probation, should there be a requirement of handing over of process and data which cannot be fulfilled in the span of Thirty (30) days.`);
    para(`Following the successful completion of the Probationary period, your employment with the Company may be terminated by either party by giving ${noticeDays} (${noticeDays}) days' notice in writing or payment of the equivalent salary in lieu of such notice.`);

    heading('Code of Conduct');
    para(`The Company prides itself as a Company with the highest order of ethical conduct in dealing with customers, clients, dealers, vendors, suppliers, subcontractors, staff or the like. You shall maintain utmost discipline and good conduct in dealing with your colleagues, customers and any other person with whom you come into contact with as a result of your employment with the Company. You shall, at all times while on duty, act diligently, ethically and honestly; comply with all the policies, procedures, rules and regulations of the Company; maintain the highest standards of personal conduct and integrity; and not undertake any other employment or engage in any external activities of a commercial nature without prior written approval of the Company.`);

    heading('Data Protection');
    para(`The personal data relating to you provided to us in the course of your employment will be subject to the Company's human resources data privacy policy. Should your job function bring you into contact with other employees' or clients' personal data, you agree that you will treat this data as strictly confidential and will administer it in conformity with the relevant applicable policies.`);

    heading('Confidentiality and Intellectual Property Rights');
    para(`You agree that the terms and conditions applying to your employment are strictly confidential. You acknowledge that as a result of employment with the Company, you will be in possession of proprietary and confidential information and trade secrets relating to the business practices of the Company. You agree that you will not, at any time during or after the employment period, directly or indirectly, use or disclose to any person any proprietary or confidential information acquired by you during your employment, without the prior written consent of the Company.`);
    para(`All inventions, ideas, software, and works created by you in the course of employment are the sole property of the Company. You agree to execute such additional documents as may be required to perfect such ownership.`);

    heading('Engagement in Other Business');
    para(`During the term of your employment, you will not (without the Company's prior written consent) directly or indirectly own, manage, control, participate in, consult with, render services to or engage in the business of any other business entity or organization for any consideration, in cash or in kind or otherwise.`);

    heading('Conflict of Interest, Non-Competition and Non-Solicitation');
    para(`You agree that during the employment period plus one year thereafter, you will not, directly or indirectly, solicit or attempt to solicit business from any present or former clients of the Company to which you were providing services, or interfere with the Company's relationships with its clients, service providers, employees, suppliers, or other business partners.`);

    heading('Representation and Warranties');
    para(`You warrant that: you have executed and delivered this appointment letter as a free and voluntary act; the information provided by you in connection with your qualifications, work experience, and personal information is up to date, true and accurate; and you are not prohibited by any agreement or order of court from entering into and carrying out the terms of this appointment letter.`);

    heading('Retirement');
    para(`You will retire in the month of your attaining the age of 58 years of service.`);

    heading('Miscellaneous');
    para(`You will, in addition to the Terms and Conditions of this appointment letter, also be governed by the rules, regulations, and such other practices, systems, procedures and policies framed, amended, modified or omitted by the Company from time to time. This appointment letter shall be construed and governed by the laws of the Republic of India and the parties agree to submit to the sole jurisdiction of the courts of Haryana, India.`);

    divider();

    // Closing
    para(`We are excited about the prospect of you joining our team. Please sign and return this letter within seven (7) days to indicate your acceptance. Should you have any questions, please contact the People team at hr@dotpe.in.`);
    ln(4);
    text(`Yours Sincerely,`);
    ln(2);
    text(`For Dotpe Private Limited`);
    ln(18);
    text(`Authorized Signatory`, { color: GREY });
    text(`__________________________`);
    ln(2);
    text(`Name: Ritika Malhotra`, { bold: true });
    text(`Designation: Vice President – Human Resources`);

    // Employee Acknowledgment
    ln(16);
    ensureSpace(80);
    doc.moveTo(ML, y).lineTo(ML + CW, y).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    ln(8);
    text(`Employee Acknowledgment`, { bold: true });
    ln(2);
    para(`I have carefully read the above terms and conditions and that they are acceptable to me in full.`);

    if (opts.signatureBlock) {
      ln(4);
      text(`E-Signed: ${opts.signatureBlock.signedName}`, { bold: true });
      ln(2);
      text(`Signed on: ${opts.signatureBlock.signedAt.toLocaleString('en-IN')}`, { color: GREY });
    } else {
      ln(4);
      text(`Signature:   ___________________________`);
      ln(8);
      text(`Name:        ___________________________`);
      ln(8);
      text(`Date & Place: ___________________________`);
    }

    // ════════════════════════════════════════════
    // ANNEXURE I — Compensation Structure
    // ════════════════════════════════════════════
    doc.addPage(); y = MT_BODY;

    text(`Annexure I`, { bold: true, size: 13 });
    ln(2);
    text(`Compensation Structure`, { bold: true, size: 11 });
    divider();

    // Meta table
    const metaRows: [string, string][] = [
      ['Name', candidate.fullName],
      ['Designation', role.designation],
      ['State / Location', location],
    ];
    for (const [label, value] of metaRows) {
      ensureSpace(18);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BLACK).text(label,        ML,              y, { width: CW * 0.4 });
      doc.fontSize(11).font('Helvetica').fillColor(BLACK).text(`: ${value}`,      ML + CW * 0.4,   y, { width: CW * 0.6 });
      y = doc.y + 2;
    }
    ln(4);
    text(`Annual Compensation (Rs.): ${formatINR(salary.totalAnnual)}`, { bold: true });
    ln(8);

    // Compensation table
    const COL = [CW * 0.55, CW * 0.225, CW * 0.225];
    function tableHeader() {
      ensureSpace(22);
      doc.rect(ML, y, CW, 18).fill('#1A1A1A');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Components',       ML + 4,            y + 4, { width: COL[0] - 4 });
      doc.text('Rupees Per Month', ML + COL[0],        y + 4, { width: COL[1] - 4, align: 'right' });
      doc.text('Rupees Per Annum', ML + COL[0]+COL[1], y + 4, { width: COL[2] - 4, align: 'right' });
      y += 18;
    }

    function tableRow(label: string, monthly: number, annual: number, idx: number, rowOpts: { bold?: boolean; bg?: string } = {}) {
      const rowH = 18;
      ensureSpace(rowH);
      const bg = rowOpts.bg ?? (idx % 2 === 0 ? '#F8F8F8' : '#FFFFFF');
      doc.rect(ML, y, CW, rowH).fill(bg);
      const font = rowOpts.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.fontSize(9).font(font).fillColor(BLACK);
      doc.text(label,                                       ML + 4,            y + 4, { width: COL[0] - 4 });
      doc.text(monthly > 0 ? formatINR(monthly) : '-',     ML + COL[0],        y + 4, { width: COL[1] - 4, align: 'right' });
      doc.text(annual > 0  ? formatINR(annual)  : '-',     ML + COL[0]+COL[1], y + 4, { width: COL[2] - 4, align: 'right' });
      y += rowH;
    }

    tableHeader();
    tableRow('Basic',               salary.basicMonthly,    salary.basicAnnual,   0);
    tableRow('House Rent Allowance',salary.hraMonthly,      salary.hraAnnual,     1);
    tableRow('Special Allowance',   salary.specialMonthly,  salary.specialAnnual, 2);
    tableRow('Gross Salary',        salary.grossMonthly,    salary.grossAnnual,   3, { bold: true, bg: '#E0E0E0' });
    tableRow("Employer's Contribution to Provident Fund", salary.pfMonthly, salary.pfAnnual, 4);
    tableRow('Total Salary',        salary.totalMonthly,    salary.totalAnnual,   5, { bold: true, bg: '#1A1A1A' });
    // override text color for dark row
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
    y -= 18;
    doc.rect(ML, y, CW, 18).fill('#1A1A1A');
    doc.text('Total Salary',              ML + 4,             y + 4, { width: COL[0] - 4 });
    doc.text(formatINR(salary.totalMonthly), ML + COL[0],      y + 4, { width: COL[1] - 4, align: 'right' });
    doc.text(formatINR(salary.totalAnnual),  ML + COL[0]+COL[1], y + 4, { width: COL[2] - 4, align: 'right' });
    y += 18;

    if (salary.joiningBonus > 0) {
      tableRow(`Joining Bonus*`, 0, salary.joiningBonus, 6, { bg: '#F0F0F0' });
    }

    ln(12);

    // Statutory notes
    text(`Statutory Deductions`, { bold: true });
    ln(2);
    const statutoryItems = [
      `Employee's contribution to Provident Fund shall be deducted & deposited with PF Authorities, along with employer's contribution, as per the statutory requirements.`,
      `Professional Tax and all incidence of income tax will be borne by the employee as per Income Tax rules.`,
      `All applicable tax liability will be borne by the employee as per relevant statutory tax rules.`,
    ];
    for (const item of statutoryItems) {
      ensureSpace(24);
      doc.circle(ML + 5, y + 6, 2).fill(BLACK);
      doc.fontSize(10).font('Helvetica').fillColor(BLACK).text(item, ML + 14, y, { width: CW - 14, align: 'justify' });
      y = doc.y + 4;
    }

    ln(8);
    text(`Additional Benefits`, { bold: true });
    ln(2);
    para(`- You will be entitled to payment of Gratuity after 5 years of continuous service with the company. Gratuity will be paid out in accordance with the Payment of Gratuity Act, 1972.`, 4);
    para(`- Hospitalization and Mediclaim insurance as per applicable Company Policies.`, 4);

    if (salary.joiningBonus > 0) {
      ln(4);
      text(`*Joining Bonus`, { bold: true });
      ln(2);
      para(`- The bonus will be paid along with your first month's salary.`, 4);
      para(`- The bonus amount paid will be fully recoverable in case you exit/resign within 1 year from the date of pay-out.`, 4);
    }

    divider();

    text(`Yours Sincerely,`);
    ln(2);
    text(`For Dotpe Private Limited`);
    ln(18);
    text(`Authorized Signatory`, { color: GREY });
    text(`__________________________`);
    ln(2);
    text(`Name: Ritika Malhotra`, { bold: true });
    text(`Designation: Vice President – Human Resources`);

    // ── Header logo + footer on all pages ──
    const range = doc.bufferedPageRange();
    const logoExists = fs.existsSync(LOGO_PATH);
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);

      // Logo — top-left, in the header band
      if (logoExists) {
        doc.image(LOGO_PATH, ML, 18, { height: LOGO_H, width: LOGO_W });
      }

      // Thin separator line below logo / header area
      doc.moveTo(ML, MT_BODY - 12)
         .lineTo(ML + CW, MT_BODY - 12)
         .strokeColor('#DDDDDD').lineWidth(0.5).stroke();

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#888888')
        .text(
          `Dotpe Private Limited  •  Confidential  •  Page ${i + 1} of ${range.count}`,
          ML, PAGE_H - 40, { width: CW, align: 'center' },
        );
    }

    doc.end();
  });
}

// ── Template seed (kept for DB consistency, body not used for rendering) ──
export async function seedDefaultTemplatesIfMissing(adminId: string): Promise<void> {
  const entity = 'DOTPE';
  const active = await db.offerLetterTemplate.findFirst({
    where: { companyEntity: entity, isActive: true },
    orderBy: { version: 'desc' },
  });
  if (active?.notes === DEFAULT_TEMPLATE_SEED_TAG) return;

  if (active) {
    await db.offerLetterTemplate.update({ where: { id: active.id }, data: { isActive: false } });
  }
  await db.offerLetterTemplate.create({
    data: {
      companyEntity: entity,
      version: (active?.version ?? 0) + 1,
      name: 'Dotpe Appointment Letter (Standard)',
      subject: 'Appointment Letter — Dotpe Private Limited',
      bodyHtml: '{}', // rendering is hardcoded in service, not template-driven
      isActive: true,
      notes: DEFAULT_TEMPLATE_SEED_TAG,
      createdById: adminId,
    },
  });
  logger.info('Seeded offer letter template');
}

// ── Main orchestrator ──
export async function generateLetterForOfferCase(
  offerCaseId: string,
  generatedById?: string,
  reason = 'Generated',
): Promise<{ offerLetterId: string; pdfPath: string }> {
  const offer = await db.offerCase.findUnique({
    where: { id: offerCaseId },
    include: { candidate: true, compensationProposal: true },
  });
  if (!offer) throw new Error(`Offer ${offerCaseId} not found`);
  if (!offer.compensationProposal) throw new Error('No compensation proposal on offer');

  const template = await db.offerLetterTemplate.findFirst({
    where: { companyEntity: offer.companyEntity, isActive: true },
    orderBy: { version: 'desc' },
  });
  if (!template) throw new Error('No active offer letter template found');

  const salary = computeDotpeSalary(
    offer.compensationProposal.proposedFixed,
    offer.compensationProposal.joiningBonus ?? 0,
    offer.pfOptIn,
  );

  const existingLetter = await db.offerLetter.findUnique({ where: { offerCaseId } });
  let signatureBlock: { signedName: string; signedAt: Date } | undefined;
  if (existingLetter?.status === 'SIGNED' && existingLetter.signatureName && existingLetter.candidateSignedAt) {
    signatureBlock = { signedName: existingLetter.signatureName, signedAt: existingLetter.candidateSignedAt };
  }

  const pdfBuffer = await renderOfferLetterPdf({
    generatedDate: new Date(),
    doj: offer.preferredDOJ,
    noticePeriodDays: offer.noticePeriodDays,
    candidate: {
      fullName: offer.candidate.fullName,
      email:    offer.candidate.email,
      phone:    offer.candidate.phone,
      address:  offer.candidate.address,
    },
    role: {
      designation: offer.compensationProposal.proposedDesignation ?? offer.roleTitle,
      department:  offer.department,
      location:    offer.location,
    },
    salary,
    signatureBlock,
  });

  const dir      = path.join(process.cwd(), 'uploads', 'offer-letters');
  fs.mkdirSync(dir, { recursive: true });
  const version  = existingLetter ? existingLetter.version + 1 : 1;
  const fileName = `${String(offer.caseNumber).padStart(6, '0')}-v${version}.pdf`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, pdfBuffer);
  const storedPath = `/uploads/offer-letters/${fileName}`;

  let offerLetterId: string;
  if (existingLetter) {
    await db.offerLetterVersion.create({
      data: {
        offerLetterId:   existingLetter.id,
        version:         existingLetter.version,
        templateId:      existingLetter.templateId,
        templateVersion: existingLetter.templateVersion,
        renderedHtml:    existingLetter.renderedHtml,
        pdfPath:         existingLetter.pdfPath,
        salaryBreakupJson: existingLetter.salaryBreakupJson,
        reason,
        generatedById,
      },
    });
    await db.offerLetter.update({
      where: { id: existingLetter.id },
      data: { version, pdfPath: storedPath, salaryBreakupJson: JSON.stringify(salary), generatedAt: new Date(), generatedById, templateId: template.id, templateVersion: template.version },
    });
    offerLetterId = existingLetter.id;
  } else {
    const letter = await db.offerLetter.create({
      data: {
        offerCaseId,
        templateId:       template.id,
        templateVersion:  template.version,
        companyEntity:    offer.companyEntity,
        version:          1,
        status:           'DRAFT',
        pdfPath:          storedPath,
        salaryBreakupJson: JSON.stringify(salary),
        generatedById,
      },
    });
    offerLetterId = letter.id;
  }

  return { offerLetterId, pdfPath: storedPath };
}

// Re-export for other modules that may still reference these
export { amountInWords, formatINR };
