import { db } from '../config/db.js';

export function healthRoutes(app) {
  app.get('/', (req, res) => {
    res.send({ message: "Server running successfully"});
  });

  app.get('/health', async (req, res) => {
    try {
      await db.admin().ping();
      res.status(200).json({ ok: true, db: 'mywedding' });
    } catch (err) {
      console.error('[health] database check failed:', err);
      res.status(503).json({ ok: false, db: 'mywedding' });
    }
  });
}
