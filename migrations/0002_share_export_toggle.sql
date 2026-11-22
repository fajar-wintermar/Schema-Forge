-- Allow share link owners to toggle whether viewers can export diagrams to PNG/SVG
ALTER TABLE share_links ADD COLUMN allow_diagram_export INTEGER NOT NULL DEFAULT 0;
