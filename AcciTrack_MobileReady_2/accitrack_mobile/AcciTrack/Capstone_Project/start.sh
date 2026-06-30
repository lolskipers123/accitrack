#!/bin/bash
# AcciTrack - Render startup script
# Initializes the database if it doesn't exist, then starts the server

python -c "
import os, sqlite3
from db_tables import officer_columns, task_columns, report_columns
from PythonSimpleFunctions import EasySQL

db = EasySQL()
if not os.path.exists('AcciTrack.db'):
    db.create_table('AcciTrack', 'AcciTrack_OfficerList', officer_columns)
    db.create_table('AcciTrack', 'AcciTrack_TaskList', task_columns)
    db.create_table('AcciTrack', 'AcciTrack_ReportList', report_columns)
    print('[AcciTrack] Database tables created.')
else:
    print('[AcciTrack] Database already exists, skipping creation.')
"

python -c "
from main import seed_custom_users, seed_security_tables
seed_custom_users()
seed_security_tables()
print('[AcciTrack] Seeding complete.')
"

echo "[AcciTrack] Starting gunicorn..."
exec gunicorn main:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
