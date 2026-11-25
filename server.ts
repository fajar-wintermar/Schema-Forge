import { startNodeServer } from './server/bootstrap/nodeServer';

startNodeServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
