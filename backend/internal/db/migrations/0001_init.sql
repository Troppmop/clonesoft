CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    -- Roles are only ever changed directly in the database, never through the API
    role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE notes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title      text NOT NULL DEFAULT '',
    content    text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, user_id)
);
CREATE INDEX notes_user_updated_idx ON notes (user_id, updated_at DESC);

-- Links to notes use composite foreign keys on (note_id, user_id), so the database itself
-- guarantees a user can never link their todos/events to another user's note.
CREATE TABLE events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       text NOT NULL,
    description text NOT NULL DEFAULT '',
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz NOT NULL,
    all_day     boolean NOT NULL DEFAULT false,
    color       text NOT NULL DEFAULT 'blue',
    note_id     uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_time_order CHECK (ends_at >= starts_at),
    FOREIGN KEY (note_id, user_id) REFERENCES notes (id, user_id) ON DELETE SET NULL (note_id)
);
CREATE INDEX events_user_starts_idx ON events (user_id, starts_at);
CREATE INDEX events_note_idx ON events (note_id);

CREATE TABLE todos (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title        text NOT NULL,
    done         boolean NOT NULL DEFAULT false,
    due_date     date,
    priority     smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    note_id      uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    FOREIGN KEY (note_id, user_id) REFERENCES notes (id, user_id) ON DELETE SET NULL (note_id)
);
CREATE INDEX todos_user_due_idx ON todos (user_id, due_date);
CREATE INDEX todos_note_idx ON todos (note_id);
