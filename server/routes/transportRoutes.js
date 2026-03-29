/**
 * @voygo-doc
 * Module: transportRoutes
 * Fichier: server\routes\transportRoutes.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listTransports, createTransport, updateTransport, deleteTransport } from '../controllers/transportController.js';

const router = Router();

router.use(requireAuth);
router.get('/trip/:tripId', listTransports);
router.post('/trip/:tripId', createTransport);
router.patch('/:id', updateTransport);
router.delete('/:id', deleteTransport);

export default router;
