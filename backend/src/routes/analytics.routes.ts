import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getRequisitionMetrics,
  getPipelineMetrics,
  getOfferMetrics,
  getRecruiterDashboard,
  getHRHeadDashboard,
  getTimeToHireMetrics,
} from '../services/analytics.service';

const router = Router();
router.use(authenticate);

router.get('/overview', async (req, res, next) => {
  try {
    const [req_, pipeline, offers, tti] = await Promise.all([
      getRequisitionMetrics(),
      getPipelineMetrics(),
      getOfferMetrics(),
      getTimeToHireMetrics(),
    ]);
    res.json({ requisitions: req_, pipeline, offers, timeToHire: tti });
  } catch (e) { next(e); }
});

router.get('/recruiter', async (req, res, next) => {
  try {
    const data = await getRecruiterDashboard(req.user!.id);
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/hr-head', async (req, res, next) => {
  try {
    const data = await getHRHeadDashboard();
    res.json(data);
  } catch (e) { next(e); }
});

export default router;
