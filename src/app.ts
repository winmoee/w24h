/**
 * Express application setup
 */

import express, { Express, Request, Response } from 'express';
import episodesRouter from './routes/episodes';
import framesRouter from './routes/frames';
import queryRouter from './routes/query';

const app: Express = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/episodes', episodesRouter);
app.use('/api/frames', framesRouter);
app.use('/api/query', queryRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

export default app;

