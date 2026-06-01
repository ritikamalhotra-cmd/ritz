import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  console.log('Seeding...');

  // ── SUPER_ADMIN ──
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@dotpe.in';
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin@dotpe1';
  const adminHash = await bcrypt.hash(adminPass, 12);

  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`Admin user: ${adminEmail} / ${adminPass}`);

  // ── Sample users ──
  const sampleUsers = [
    { email: 'ta.manager@dotpe.in', firstName: 'TA', lastName: 'Manager', role: 'TA_MANAGER' as const },
    { email: 'recruiter@dotpe.in', firstName: 'Test', lastName: 'Recruiter', role: 'RECRUITER' as const },
    { email: 'hod@dotpe.in', firstName: 'Head', lastName: 'Of Dept', role: 'HOD' as const, department: 'Engineering' },
    { email: 'hr.head@dotpe.in', firstName: 'Ritika', lastName: 'Malhotra', role: 'HR_HEAD' as const },
  ];

  for (const u of sampleUsers) {
    const hash = await bcrypt.hash('Password@1', 12);
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: hash },
    });
  }

  // ── Approval rule — ALL offers: TA_MANAGER → HOD → HR_HEAD ──
  await db.approvalRule.upsert({
    where: { id: 'default-rule' },
    update: {},
    create: {
      id: 'default-rule',
      name: 'Default — All Offers (TA → HOD → HR Head)',
      approvalChain: JSON.stringify([
        { role: 'TA_MANAGER', slaHours: 48 },
        { role: 'HOD', slaHours: 48 },
        { role: 'HR_HEAD', slaHours: 48 },
      ]),
      slaHours: 144,
      priority: 0,
      isActive: true,
    },
  });

  // ── Role bands (sample) ──
  const bands = [
    { roleFamily: 'Software Engineer', level: 'L1', grade: 'SDE1', minFixed: 600000, midFixed: 800000, maxFixed: 1000000, minTotal: 700000, midTotal: 900000, maxTotal: 1200000 },
    { roleFamily: 'Software Engineer', level: 'L2', grade: 'SDE2', minFixed: 1000000, midFixed: 1400000, maxFixed: 1800000, minTotal: 1200000, midTotal: 1600000, maxTotal: 2200000 },
    { roleFamily: 'Product Manager', level: 'L2', grade: 'PM2', minFixed: 1200000, midFixed: 1600000, maxFixed: 2000000, minTotal: 1400000, midTotal: 1800000, maxTotal: 2400000 },
    { roleFamily: 'Product Manager', level: 'L3', grade: 'PM3', minFixed: 1800000, midFixed: 2400000, maxFixed: 3000000, minTotal: 2200000, midTotal: 2800000, maxTotal: 3500000 },
  ];

  for (const b of bands) {
    const exists = await db.roleBand.findFirst({ where: { roleFamily: b.roleFamily, level: b.level } });
    if (!exists) {
      await db.roleBand.create({ data: { ...b, currency: 'INR' } });
    }
  }

  // ── System config ──
  await db.systemConfig.upsert({
    where: { key: 'DEFAULT_OFFER_VALIDITY_DAYS' },
    update: {},
    create: { key: 'DEFAULT_OFFER_VALIDITY_DAYS', value: JSON.stringify(7) },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
