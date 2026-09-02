-- Run this once against your Vercel Postgres (Neon) database before going
-- live. In the Vercel dashboard: Storage -> your Postgres DB -> Query, and
-- paste this in. Or via psql using the DATABASE_URL Vercel gives you.

CREATE TABLE IF NOT EXISTS bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT NOT NULL UNIQUE,
  room_type           TEXT NOT NULL,
  check_in            DATE NOT NULL,
  check_out           DATE NOT NULL,
  adults              INTEGER NOT NULL DEFAULT 1,
  children            INTEGER NOT NULL DEFAULT 0,
  guest_name          TEXT NOT NULL,
  guest_email         TEXT NOT NULL,
  guest_phone         TEXT,
  special_requests    TEXT,
  currency            TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD')),
  -- Smallest currency unit for whichever `currency` this row is in (kobo
  -- for NGN, cents for USD -- both are a x100 minor-unit convention, hence
  -- one generically-named column rather than amount_kobo/amount_cents).
  amount_subunit      BIGINT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  paystack_event_data JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings (reference);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
