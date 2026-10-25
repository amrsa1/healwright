import os from 'node:os';
import path from 'node:path';

// The heal summary is persisted so a Playwright runner can read what its
// workers recorded. Give each test process its own file, so tests never write
// into the repo's .self-heal/ folder or read each other's heals.
process.env.HEALWRIGHT_SUMMARY_FILE = path.join(
  os.tmpdir(),
  `healwright-summary-${process.pid}-${Math.random().toString(36).slice(2, 8)}.jsonl`,
);
delete process.env.TEST_WORKER_INDEX;
