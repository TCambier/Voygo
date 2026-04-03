/**
 * @voygo-doc
 * Module: app
 * Fichier: server\app.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { csrfProtection } from './middleware/csrf.js';
import authRoutes from './routes/authRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import transportRoutes from './routes/transportRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import resourceRoutes from './routes/resourceRoutes.js';

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
        connectSrc: ["'self'", 'https://nominatim.openstreetmap.org'],
        fontSrc: ["'self'", 'data:', 'https://unpkg.com', 'https://cdnjs.cloudflare.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: []
      }
    }
  })
);
// Limit only API routes to avoid blocking static assets/pages
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json({ limit: '1mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..', 'voygo');

app.use('/assets', express.static(path.join(clientRoot, 'assets')));
app.use('/controllers', express.static(path.join(clientRoot, 'controllers')));
app.use('/models', express.static(path.join(clientRoot, 'models')));
app.use('/views', express.static(path.join(clientRoot, 'views')));
app.use(express.static(path.join(clientRoot, 'views')));

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/transports', transportRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api', resourceRoutes);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable.' });
});

if (config.nodeEnv !== 'production') {
  console.log(`Static views served from ${path.join(clientRoot, 'views')}`);
}

export default app;
