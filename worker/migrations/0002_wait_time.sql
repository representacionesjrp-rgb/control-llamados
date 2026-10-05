-- Seconds the phone waited for an answer (dialing/ringing until answered or hung up).
-- NULL for calls from app versions that do not measure it.
ALTER TABLE calls ADD COLUMN ring_sec INTEGER;
