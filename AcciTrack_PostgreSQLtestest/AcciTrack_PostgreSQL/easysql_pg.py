"""
easysql_pg.py
--------------
Drop-in replacement for `from PythonSimpleFunctions import EasySQL` that
talks to PostgreSQL instead of SQLite. It mimics the three methods main.py
actually relies on:

    db.create_table(db_name, table_name, columns)
    db.insert_to_table(db_name, table_name, values)
    db.get_table_values(db_name, table_name)

`db_name` is accepted for interface compatibility but ignored -- the
target database is whichever one DATABASE_URL points to.

Column definitions (see db_tables.py) come in as a list of single-key
dicts, e.g. [{"officer_first_name": "text"}, ...]. Every table also gets
an explicit auto-incrementing `id` primary key column, since Postgres has
no implicit ROWID the way SQLite does.

`get_table_values` returns rows as plain tuples in the exact column order
the table was defined in (NOT including `id`), so existing code that
indexes into rows positionally (e.g. officer[9], a[11]) keeps working
unmodified.
"""

from db_connection import get_db_connection

# Map the simple "text" type used throughout db_tables.py to a Postgres type.
_TYPE_MAP = {
    "text": "TEXT",
    "integer": "INTEGER",
    "int": "INTEGER",
    "real": "REAL",
    "blob": "BYTEA",
}


class EasySQL:
    def __init__(self, *args, **kwargs):
        # Kept for interface compatibility with PythonSimpleFunctions.EasySQL()
        pass

    @staticmethod
    def _column_names(columns):
        return [list(col.keys())[0] for col in columns]

    def create_table(self, db_name, table_name, columns):
        col_names = self._column_names(columns)
        col_defs = []
        for col in columns:
            name, sqlite_type = list(col.items())[0]
            pg_type = _TYPE_MAP.get(str(sqlite_type).lower(), "TEXT")
            col_defs.append(f'"{name}" {pg_type}')

        ddl = (
            f'CREATE TABLE IF NOT EXISTS "{table_name}" (\n'
            f'    id SERIAL PRIMARY KEY,\n    ' + ",\n    ".join(col_defs) + "\n)"
        )

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(ddl)
            conn.commit()
        finally:
            conn.close()

    def insert_to_table(self, db_name, table_name, values):
        # `values` is a list of single-key dicts, e.g. [{"task_title": "x"}, ...]
        col_names = [list(v.keys())[0] for v in values]
        col_values = [list(v.values())[0] for v in values]

        columns_sql = ", ".join(f'"{c}"' for c in col_names)
        placeholders = ", ".join(["%s"] * len(col_values))

        sql = f'INSERT INTO "{table_name}" ({columns_sql}) VALUES ({placeholders})'

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(sql, col_values)
            conn.commit()
        finally:
            conn.close()

    def get_table_values(self, db_name, table_name):
        """Returns every row as a tuple, ordered by the table's column
        order excluding `id`, matching the old SQLite-based behavior."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            # Pull the column order straight from Postgres so this stays
            # correct even if the table was created elsewhere.
            cursor.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = %s AND column_name != 'id'
                ORDER BY ordinal_position
                """,
                (table_name,),
            )
            columns = [row[0] for row in cursor.fetchall()]
            columns_sql = ", ".join(f'"{c}"' for c in columns)
            cursor.execute(f'SELECT {columns_sql} FROM "{table_name}"')
            return cursor.fetchall()
        finally:
            conn.close()
