/**
 * @voygo-doc
 * Module: activityRoutes
 * Fichier: server\routes\activityRoutes.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
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
