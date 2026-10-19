-- Scratch schema only (the Worker creates hd_spike and drops it afterwards).
CREATE TABLE hd_spike.spike_note (id int4 PRIMARY KEY, body text NOT NULL);
INSERT INTO hd_spike.spike_note VALUES (1, 'hello from a migration');
