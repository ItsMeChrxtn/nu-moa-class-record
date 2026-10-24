import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import routes from './routes.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}

const app = express();
// Behind proxies (Vercel rewrite → Render), trust that many hops so req.ip is the visitor's IP
// for the login rate limit. 0 when running locally.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 0);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api', routes);

// Serve the built React app in production (npm run build in client/).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res, next) =>
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next())
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = Number(process.env.PORT) || 5000;
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/class-record');
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
