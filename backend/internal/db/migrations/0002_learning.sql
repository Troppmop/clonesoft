-- A reading plan divides one corpus (Tanakh, Mishnah or Bavli) into `days` daily portions starting
-- on start_date. The portions themselves are computed by the frontend from its book catalog, so the
-- database only records which day indexes (0-based) the user has completed.
CREATE TABLE reading_plans (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    corpus           text NOT NULL CHECK (corpus IN ('tanakh', 'mishnah', 'bavli')),
    title            text NOT NULL,
    start_date       date NOT NULL,
    days             integer NOT NULL CHECK (days BETWEEN 1 AND 10000),
    -- Local time of day to send a push reminder, in `timezone`; NULL means no reminders
    reminder_time    time,
    timezone         text NOT NULL DEFAULT 'UTC',
    -- The local date a reminder was last sent, so each plan is reminded at most once a day
    last_reminded_on date,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reading_plans_user_idx ON reading_plans (user_id, created_at);
CREATE INDEX reading_plans_reminder_idx ON reading_plans (reminder_time) WHERE reminder_time IS NOT NULL;

CREATE TABLE reading_progress (
    plan_id      uuid NOT NULL REFERENCES reading_plans (id) ON DELETE CASCADE,
    day_index    integer NOT NULL CHECK (day_index >= 0),
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, day_index)
);

-- A bookmark points at a section ("Genesis 1", "Berakhot 2a") and optionally one segment in it
CREATE TABLE bookmarks (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    ref        text NOT NULL,
    segment    integer CHECK (segment >= 1),
    label      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bookmarks_user_ref_key ON bookmarks (user_id, ref, coalesce(segment, 0));
CREATE INDEX bookmarks_user_created_idx ON bookmarks (user_id, created_at DESC);

-- Hebrew texts fetched from Sefaria, shared by all users. Texts don't change, so entries never expire.
CREATE TABLE text_cache (
    ref        text PRIMARY KEY,
    he_ref     text NOT NULL,
    segments   jsonb NOT NULL,
    version    text NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint   text NOT NULL UNIQUE,
    p256dh     text NOT NULL,
    auth       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- Server-generated secrets that must stay stable across restarts, such as the VAPID key pair
-- (used when VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set)
CREATE TABLE app_secrets (
    name       text PRIMARY KEY,
    value      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
