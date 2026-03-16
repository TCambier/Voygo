import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listActivitiesByTrip,
  createActivity,
  updateActivity,
  deleteActivity,
  suggestActivities
} from '../controllers/activityController.js';

const router = Router();

router.use(requireAuth);
router.get('/suggestions', suggestActivities);
router.get('/trip/:tripId', listActivitiesByTrip);
router.post('/trip/:tripId', createActivity);
router.patch('/:id', updateActivity);
router.delete('/:id', deleteActivity);

export default router;
