import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listTrips, getTrip, createTrip, updateTrip, deleteTrip } from '../controllers/tripController.js';

const router = Router();

router.use(requireAuth);
router.get('/', listTrips);
router.get('/:id', getTrip);
router.post('/', createTrip);
router.patch('/:id', updateTrip);
router.delete('/:id', deleteTrip);

export default router;
