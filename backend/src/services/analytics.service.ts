// Analytics / dashboard metrics service

import { db } from '../utils/db';

export async function getRequisitionMetrics() {
  const [total, byStatus, byDept, byPriority] = await Promise.all([
    db.requisition.count(),
    db.requisition.groupBy({ by: ['status'], _count: { id: true } }),
    db.requisition.groupBy({ by: ['department'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }),
    db.requisition.groupBy({ by: ['priority'], _count: { id: true } }),
  ]);

  return { total, byStatus, byDept, byPriority };
}

export async function getPipelineMetrics() {
  const [total, byStage, recentActivity] = await Promise.all([
    db.application.count({ where: { isActive: true } }),
    db.application.groupBy({ by: ['stage'], _count: { id: true }, where: { isActive: true } }),
    db.applicationStageHistory.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        application: {
          include: {
            candidate: { select: { fullName: true } },
            requisition: { select: { title: true } },
          },
        },
        changedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return { total, byStage, recentActivity };
}

export async function getOfferMetrics() {
  const [total, byStatus, acceptanceRate, thisMonth] = await Promise.all([
    db.offerCase.count(),
    db.offerCase.groupBy({ by: ['status'], _count: { id: true } }),
    db.offerCase.count({ where: { status: 'ACCEPTED' } }),
    db.offerCase.count({
      where: {
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ]);

  return {
    total,
    byStatus,
    acceptanceRate: total > 0 ? Math.round((acceptanceRate / total) * 100) : 0,
    thisMonth,
  };
}

export async function getRecruiterDashboard(recruiterId: string) {
  const [myReqs, myApps, pendingFeedback] = await Promise.all([
    db.requisition.findMany({
      where: { recruiterId },
      include: {
        applications: { where: { isActive: true }, select: { id: true, stage: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.application.findMany({
      where: { assignedToId: recruiterId, isActive: true },
      include: {
        candidate: { select: { fullName: true, email: true } },
        requisition: { select: { title: true, department: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    db.interviewFeedback.count({ where: { interviewerId: recruiterId, isSubmitted: false } }),
  ]);

  return { myReqs, myApps, pendingFeedback };
}

export async function getHRHeadDashboard() {
  const [reqMetrics, pipelineMetrics, offerMetrics, recentReqs] = await Promise.all([
    getRequisitionMetrics(),
    getPipelineMetrics(),
    getOfferMetrics(),
    db.requisition.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        hiringManager: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return { reqMetrics, pipelineMetrics, offerMetrics, recentReqs };
}

export async function getTimeToHireMetrics() {
  // Average days from application APPLIED to OFFER
  const offeredApps = await db.applicationStageHistory.findMany({
    where: { toStage: 'OFFER' },
    include: {
      application: {
        include: {
          stageHistory: { where: { fromStage: null }, orderBy: { createdAt: 'asc' }, take: 1 },
        },
      },
    },
  });

  const timings = offeredApps
    .map((h) => {
      const start = h.application.stageHistory[0]?.createdAt;
      if (!start) return null;
      return Math.round((h.createdAt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    })
    .filter((n): n is number => n !== null && n >= 0);

  const avg = timings.length > 0 ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : null;
  return { avgDaysToOffer: avg, sampleSize: timings.length };
}
