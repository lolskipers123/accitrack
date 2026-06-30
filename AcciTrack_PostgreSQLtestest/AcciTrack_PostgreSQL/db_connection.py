"""
db_connection.py
-----------------
Centralized PostgreSQL connection helper for AcciTrack.

Replaces the old pattern of `sqlite3.connect("AcciTrack.db")` scattered
throughout main.py. Reads connection info from the DATABASE_URL
environment variable (the standard variable name provided by Render,
Heroku, Railway, etc.) or falls back to individual PG* env vars / a
local default for development.

Usage:
    from db_connection import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM AcciTrack_OfficerList WHERE officer_badge_number = %s", (badge,))
"""

import os
import psycopg

# Render (and most hosts) provide a DATABASE_URL like:
#   postgres://user:password@host:port/dbname
# psycopg2 needs the scheme to be "postgresql://" (or it will accept
# "postgres://" too on recent versions, but we normalize just in case).
DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Fallback for local development if DATABASE_URL isn't set.
if not DATABASE_URL:
    pg_user = os.environ.get("PGUSER", "postgres")
    pg_password = os.environ.get("PGPASSWORD", "postgres")
    pg_host = os.environ.get("PGHOST", "localhost")
    pg_port = os.environ.get("PGPORT", "5432")
    pg_database = os.environ.get("PGDATABASE", "accitrack")
    DATABASE_URL = f"postgresql://{pg_user}:{pg_password}@{pg_host}:{pg_port}/{pg_database}"


def get_db_connection():
    """Return a new psycopg connection. Caller is responsible for
    closing it (same contract the old sqlite3.connect() calls had)."""
    return psycopg.connect(DATABASE_URL)
