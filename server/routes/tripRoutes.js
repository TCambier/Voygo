import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
	listTrips,
	getTrip,
	createTrip,
	updateTrip,
	deleteTrip,
	shareTrip,
	listTripShares,
	updateTripShare,
	deleteTripShare
} from '../controllers/tripController.js';

const router = Router();

router.use(requireAuth);
router.get('/', listTrips);
router.get('/:id', getTrip);
router.post('/', createTrip);
router.get('/:id/share', listTripShares);
router.post('/:id/share', shareTrip);
router.patch('/:id/share/:sharedWithUserId', updateTripShare);
router.delete('/:id/share/:sharedWithUserId', deleteTripShare);
router.patch('/:id', updateTrip);
router.delete('/:id', deleteTrip);

export default router;
