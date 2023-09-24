-- Drop triggers
DROP TRIGGER IF EXISTS rounds_update_updated_at_trigger ON rounds;
DROP TRIGGER IF EXISTS games_update_updated_at_trigger ON games;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- Alter rounds table
ALTER TABLE ONLY rounds
    ALTER COLUMN id DROP DEFAULT,
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Alter games table
ALTER TABLE ONLY games
    ALTER COLUMN id DROP DEFAULT,
    ALTER COLUMN "createdAt" DROP DEFAULT,
    ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Drop uuid-ossp extension
DROP EXTENSION IF EXISTS "uuid-ossp";
