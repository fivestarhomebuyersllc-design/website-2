CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  service_needed TEXT NOT NULL,
  message TEXT NOT NULL,
  form_type TEXT NOT NULL,
  source TEXT NOT NULL,
  page_path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads(submitted_at DESC);
