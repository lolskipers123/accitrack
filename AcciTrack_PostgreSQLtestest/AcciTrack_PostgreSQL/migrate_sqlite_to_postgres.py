"""
migrate_sqlite_to_postgres.py
-------------------------------
One-time data migration: copies every row from the old AcciTrack.db
(SQLite) file into the new PostgreSQL database pointed to by
DATABASE_URL.

Run this once, after deploying the new Postgres-backed app (so the
tables already exist) and before you stop using the old SQLite file:

    python migrate_sqlite_to_postgres.py /path/to/AcciTrack.db

If no path is given it looks for "AcciTrack.db" in the current directory.
"""

import sys
import sqlite3

from db_connection import get_db_connection

TABLES = [
    "AcciTrack_OfficerList",
    "AcciTrack_TaskList",
    "AcciTrack_ReportList",
    "AcciTrack_SecuritySettings",
    "AcciTrack_AccessHistory",
    "AcciTrack_SecurityLogs",
    "AcciTrack_Certifications",
    "AcciTrack_ProfileChanges",
]


def migrate(sqlite_path):
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_cur = sqlite_conn.cursor()

    pg_conn = get_db_connection()
    pg_cur = pg_conn.cursor()

    for table in TABLES:
        sqlite_cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
        if not sqlite_cur.fetchone():
            print(f"[skip] {table} not present in SQLite source")
            continue

        sqlite_cur.execute(f"PRAGMA table_info({table})")
        columns = [row[1] for row in sqlite_cur.fetchall()]
        # Drop the implicit/explicit id column when present -- Postgres
        # will assign fresh SERIAL ids so foreign-key-free tables stay simple.
        data_columns = [c for c in columns if c != "id"]

        sqlite_cur.execute(f"SELECT {', '.join(data_columns)} FROM {table}")
        rows = sqlite_cur.fetchall()

        if not rows:
            print(f"[empty] {table}: 0 rows")
            continue

        # Make sure the target table is empty before importing, so this
        # script is safe to re-run without creating duplicates.
        pg_cur.execute(f'DELETE FROM "{table}"')

        columns_sql = ", ".join(f'"{c}"' for c in data_columns)
        placeholders = ", ".join(["%s"] * len(data_columns))
        insert_sql = f'INSERT INTO "{table}" ({columns_sql}) VALUES ({placeholders})'

        pg_cur.executemany(insert_sql, rows)
        print(f"[ok] {table}: migrated {len(rows)} rows")

    pg_conn.commit()
    pg_cur.close()
    pg_conn.close()
    sqlite_conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "AcciTrack.db"
    migrate(path)
