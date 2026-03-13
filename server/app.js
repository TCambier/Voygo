import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import authRoutes from './routes/authRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import transportRoutes from './routes/transportRoutes.js';
import resourceRoutes from './routes/resourceRoutes.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
// Limit only API routes to avoid blocking static assets/pages
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use(cookieParser());
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
