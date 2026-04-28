import 'dotenv/config';
import app from './app';
import { startReorderScheduler } from './services/scheduler.service';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Fire-and-forget: scheduler boot is best-effort and never blocks the server.
  void startReorderScheduler();
});
