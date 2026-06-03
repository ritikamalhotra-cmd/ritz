// GET /api/users — returns staff users for dropdowns (HMs, recruiters, HODs etc.)
// Accessible to all authenticated staff roles

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../utils/db';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        department: true,
      },
      orderBy: { firstName: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
