/**
 * @voygo-doc
 * Module: authRoutes
 * Fichier: server\routes\authRoutes.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { Router } from 'express';
import {
  signup,
  login,
  me,
  logout,
  refreshSession,
  emailExists,
  forgotPassword,
  resetPassword,
  updateProfile,
  updateEmail,
  updatePassword,
  deleteAccount
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/email-exists', emailExists);
router.post('/email-exists', emailExists);
router.get('/me', requireAuth, me);
router.post('/logout', logout);
router.post('/refresh', refreshSession);
router.patch('/profile', requireAuth, updateProfile);
router.post('/email', requireAuth, updateEmail);
router.post('/password', requireAuth, updatePassword);
router.post('/delete', requireAuth, deleteAccount);

export default router;
