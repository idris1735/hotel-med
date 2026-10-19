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

-- ---------------- AFFILIATE PROGRAM ----------------
-- A booking optionally carries the referral code active (via a 30-day
-- cookie, see assets/referral.js) when the guest started booking. NULL
-- means no affiliate gets credit for it -- the normal, default case.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS affiliate_code TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_affiliate_code ON bookings (affiliate_code);

CREATE TABLE IF NOT EXISTS affiliates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,
  phone              TEXT,
  promotion_channel  TEXT, -- how they plan to refer guests (free text from the application)
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  -- Set once approved; this is what guests' "?ref=" links actually carry,
  -- so it has to be unguessable-adjacent but is not itself a secret (it's
  -- designed to be shared publicly) -- unlike approval_token below.
  referral_code      TEXT UNIQUE,
  -- A single-use random token embedded in the approve/decline links sent
  -- to the hotel's own inbox (see api/_lib/affiliates.js) -- this is what
  -- actually needs to be unguessable, since whoever holds it can approve
  -- an applicant with no login. Cleared (set NULL) once acted on, so a
  -- stale email can't be replayed to flip a decision twice.
  approval_token     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_affiliates_referral_code ON affiliates (referral_code);

-- One row per payout run. "covers_through" is the watermark: the report
-- only ever counts an affiliate's paid bookings created AFTER their own
-- latest payout's covers_through, so a booking can never be paid out
-- twice even though commission itself is always computed live from
-- bookings rather than stored redundantly.
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    UUID NOT NULL REFERENCES affiliates(id),
  amount_subunit  BIGINT NOT NULL,
  currency        TEXT NOT NULL CHECK (currency IN ('NGN', 'USD')),
  covers_through  TIMESTAMPTZ NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON affiliate_payouts (affiliate_id);
