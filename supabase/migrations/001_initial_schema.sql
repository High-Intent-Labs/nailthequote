-- Email captures (Tier 1 - no account required)
CREATE TABLE IF NOT EXISTS email_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  trade text NOT NULL,
  tool_slug text NOT NULL,
  source_url text NOT NULL,
  marketing_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resend_contact_id text
);

CREATE INDEX idx_email_captures_email ON email_captures(email);
CREATE INDEX idx_email_captures_trade ON email_captures(trade);

-- User profiles (Tier 2 - account holders)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text,
  owner_name text,
  trade text,
  phone text,
  email text,
  address text,
  zip_code text,
  license_number text,
  logo_url text,
  default_hourly_rate decimal,
  default_markup decimal,
  marketing_consent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Saved calculations
CREATE TABLE IF NOT EXISTS saved_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tool_slug text NOT NULL,
  trade text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}',
  outputs jsonb NOT NULL DEFAULT '{}',
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_calculations_user ON saved_calculations(user_id);

-- Saved documents (invoices, estimates, work orders)
CREATE TABLE IF NOT EXISTS saved_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('invoice', 'estimate', 'work_order')),
  client_name text,
  amount decimal,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  content jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_documents_user ON saved_documents(user_id);

-- Row Level Security
ALTER TABLE email_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_documents ENABLE ROW LEVEL SECURITY;

-- email_captures: only service role can insert/read (via API)
CREATE POLICY "Service role full access on email_captures"
  ON email_captures FOR ALL
  USING (true)
  WITH CHECK (true);

-- profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- saved_calculations: users can CRUD their own
CREATE POLICY "Users can view own calculations"
  ON saved_calculations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calculations"
  ON saved_calculations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calculations"
  ON saved_calculations FOR DELETE
  USING (auth.uid() = user_id);

-- saved_documents: users can CRUD their own
CREATE POLICY "Users can view own documents"
  ON saved_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON saved_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON saved_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON saved_documents FOR DELETE
  USING (auth.uid() = user_id);
