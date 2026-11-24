import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { initDatabase } from './server/db';
import { coreRouter } from './server/routes/coreRoutes';
import { academicRouter, runFifthDateFeeReminderJob } from './server/routes/academicRoutes';
import { aiRouter } from './server/routes/aiRoutes';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  initDatabase();
  runFifthDateFeeReminderJob(null).catch((err) => console.error('[5th-Date Fee Reminder Init Error]', err));
  setInterval(() => {
    runFifthDateFeeReminderJob(null).catch((err) => console.error('[5th-Date Fee Reminder Interval Error]', err));
  }, 60 * 60 * 1000);

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', institute: 'SindhTech Institute' });
  });

  app.use('/api', coreRouter);
  app.use('/api', academicRouter);
  app.use('/api', aiRouter);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[SindhTech Server Error]', err);
    res.status(500).json({ error: 'An unexpected server error occurred. Please check logs or try again.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SindhTech Institute Management System running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SindhTech server:', err);
  process.exit(1);
});
