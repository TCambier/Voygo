/**
 * @voygo-doc
 * Module: resourceRoutes
 * Fichier: server\routes\resourceRoutes.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listResource, createResource, updateResource, deleteResource } from '../controllers/resourceController.js';

const router = Router();

const allowed = new Set(['accommodations', 'activities', 'budgets', 'notes']);

router.param('resource', (req, res, next, resource) => {
  if (!allowed.has(resource)) {
    return res.status(404).json({ error: 'Ressource inconnue.' });
  }
  req.resourceTable = resource;
  return next();
});

router.use(requireAuth);
router.get('/:resource', listResource);
router.post('/:resource', createResource);
router.patch('/:resource/:id', updateResource);
router.delete('/:resource/:id', deleteResource);

export default router;
