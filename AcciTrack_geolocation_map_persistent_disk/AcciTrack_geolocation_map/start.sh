#!/bin/bash
# AcciTrack - Render startup script
# Initializes the database if it doesn't exist, then starts the server.
#
# AcciTrack.db and the uploads/ folder are addressed with paths *relative to
# the process's working directory*. To make them survive restarts/redeploys,
# we run the app with its working directory set to the mounted persistent
# disk (see render.yaml -> disk.mountPath) instead of the app folder itself.
# The app's own code (db_tables.py, main.py, templates/, static/) still needs
# to be importable, so we keep it on PYTHONPATH rather than relying on cwd.

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="$APP_DIR:$PYTHONPATH"

# DATA_DIR is the persistent disk's mount path. Falls back to the app folder
# itself if no disk is attached (e.g. running locally, or on Render Free
# where disks aren't available) so this script still works either way.
DATA_DIR="${RENDER_DISK_PATH:-/var/data}"

if [ -d "$DATA_DIR" ]; then
    echo "[AcciTrack] Persistent disk found at $DATA_DIR — using it for AcciTrack.db and uploads/."

    # One-time bootstrap: seed the disk's uploads/ folder from the copy
    # bundled with the app (existing avatars, sample docs, etc.) so nothing
    # appears to vanish the first time the disk is attached.
    if [ ! -d "$DATA_DIR/uploads" ] && [ -d "$APP_DIR/uploads" ]; then
        echo "[AcciTrack] Seeding disk uploads/ folder from app bundle (first run only)."
        cp -r "$APP_DIR/uploads" "$DATA_DIR/uploads"
    fi

    cd "$DATA_DIR"
else
    echo "[AcciTrack] No persistent disk found at $DATA_DIR — using local (ephemeral) storage."
    echo "[AcciTrack] Uploads and AcciTrack.db will NOT survive a restart/redeploy in this mode."
    cd "$APP_DIR"
fi

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
