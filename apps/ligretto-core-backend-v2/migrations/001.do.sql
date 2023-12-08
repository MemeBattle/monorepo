CREATE TABLE IF NOT EXISTS games (
    id uuid NOT NULL PRIMARY KEY,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS round_users (
    id integer NOT NULL PRIMARY KEY,
    "roundId" uuid,
    "userId" character varying(255),
    score integer,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);


CREATE TABLE IF NOT EXISTS rounds (
    id uuid NOT NULL PRIMARY KEY,
    "gameId" uuid,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS users (
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    "casId" character varying(255) NOT NULL PRIMARY KEY,
    "isTemporary" boolean
);

ALTER TABLE ONLY round_users
    DROP CONSTRAINT round_users_roundid_userid_unique,
    ADD CONSTRAINT round_users_roundid_userid_unique UNIQUE ("roundId", "userId");

ALTER TABLE ONLY round_users
    DROP CONSTRAINT round_users_roundid_foreign,
    ADD CONSTRAINT round_users_roundid_foreign FOREIGN KEY ("roundId") REFERENCES rounds(id);

ALTER TABLE ONLY round_users
    DROP CONSTRAINT round_users_userid_foreign,
    ADD CONSTRAINT round_users_userid_foreign FOREIGN KEY ("userId") REFERENCES users("casId");

ALTER TABLE ONLY rounds
    DROP CONSTRAINT rounds_gameid_foreign,
    ADD CONSTRAINT rounds_gameid_foreign FOREIGN KEY ("gameId") REFERENCES games(id) ON DELETE CASCADE;

