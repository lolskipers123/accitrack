from flask import Flask, render_template, request, session, send_from_directory, jsonify, redirect, url_for
from werkzeug.utils import secure_filename
from PythonSimpleFunctions import EasySQL
import os
import sqlite3
import signal
import datetime
import random
import json
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from db_tables import officer_columns, task_columns, report_columns
try:
    from flask_cloudflared import run_with_cloudflared
    _cloudflared_available = True
except ImportError:
    _cloudflared_available = False

separator_string = "[sprtr_str]"
ALLOWED_EXTENSIONS = {"mp4", "pdf", "doc", "docx", "png", "jpg", "jpeg"}
UPLOAD_FOLDER = os.path.join(os.getcwd(), "uploads")

app = Flask(__name__)
app.config["SECRET_KEY"] = "ExodusCapstone_AcciTrack"
app.config["SESSION_COOKIE_SECURE"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "None"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 512 * 1024 * 1024  # Limit: 512MB
# Only use Cloudflared when running locally (not on Render)
if _cloudflared_available and not os.environ.get("RENDER"):
    run_with_cloudflared(app)
db = EasySQL()

# Global set to track active user badge numbers
online_users = set()

# Global memory registry to track active recovery codes (Badge -> Verification info)
recovery_codes = {}

# Global memory registry to track login 2FA OTP codes (Badge -> Verification info)
login_2fa_codes = {}


# --- PREVENT BROWSER CACHING FOR SESSION BREAK PROTECTION ---
@app.after_request
def prevent_caching(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def parse_datetime(date_str):
    if not date_str or date_str in ("none", "null", "N/A"):
        return None

    clean_str = date_str.replace("•", "").replace(",", "").strip()
    clean_str = re.sub(r'\s+', ' ', clean_str)

    months = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
    }

    # Format 1: Month Day Year Hour:Minute:Second AM/PM (Standard real_submission_datetime)
    m1 = re.match(r'^([A-Za-z]+)\s+(\d+)\s+(\d{4})\s+(\d+):(\d{2}):(\d{2})\s*(AM|PM|am|pm)?$', clean_str)
    if m1:
        mon_str, day, year, hr, mn, sc, am_pm = m1.groups()
        mon = months.get(mon_str.lower())
        if mon:
            hr_val = int(hr)
            if am_pm:
                if am_pm.lower() == 'pm' and hr_val < 12:
                    hr_val += 12
                elif am_pm.lower() == 'am' and hr_val == 12:
                    hr_val = 0
            try:
                return datetime.datetime(int(year), mon, int(day), hr_val, int(mn), int(sc))
            except ValueError:
                pass

    # Format 2: Month Day Year Hour:Minute AM/PM (Standard review_datetime)
    m2 = re.match(r'^([A-Za-z]+)\s+(\d+)\s+(\d{4})\s+(\d+):(\d{2})\s*(AM|PM|am|pm)?$', clean_str)
    if m2:
        mon_str, day, year, hr, mn, am_pm = m2.groups()
        mon = months.get(mon_str.lower())
        if mon:
            hr_val = int(hr)
            if am_pm:
                if am_pm.lower() == 'pm' and hr_val < 12:
                    hr_val += 12
                elif am_pm.lower() == 'am' and hr_val == 12:
                    hr_val = 0
            try:
                return datetime.datetime(int(year), mon, int(day), hr_val, int(mn), 0)
            except ValueError:
                pass

    # Format 3: YYYY-MM-DD HH:MM:SS
    m3 = re.match(r'^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$', clean_str)
    if m3:
        try:
            return datetime.datetime(*(int(x) for x in m3.groups()))
        except ValueError:
            pass

    formats = [
        "%b %d %Y %I:%M:%S %p",
        "%b %d %Y %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %I:%M %p"
    ]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(clean_str, fmt)
        except ValueError:
            continue

    return None


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def send_smtp_email(to_email, subject, body_text):
    """
    Sends an email using Gmail SMTP servers with TLS encryption.
    """
    sender_email = "accitrack2026@gmail.com"
    sender_password = "gfxzupumnoygqjsl"

    msg = MIMEMultipart()
    msg['From'] = f"AcciTrack Security <{sender_email}>"
    msg['To'] = to_email
    msg['Subject'] = subject

    msg.attach(MIMEText(body_text, 'plain'))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print("SMTP Email sending failed:", e)
        return False


def generate_unique_backup_codes():
    """
    Generates a set of 5 unique, one-time use backup codes formatted as xxxx-xxxx.
    """
    new_codes = set()
    while len(new_codes) < 5:
        code = f"{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"
        new_codes.add(code)
    return ",".join(list(new_codes))


@app.before_request
def make_session_permanent():
    session.modified = True
    app.permanent_session_lifetime = datetime.timedelta(days=7)
    if session.get("logged_in") == "yes" and session.get("badge_number") and session.get("badge_number") != "-1":
        online_users.add(session.get("badge_number"))


@app.route("/session", methods=["GET"])
def check_session():
    try:
        if session.get("logged_in", "no") != "no":
            return session.get("logged_in", "no") + separator_string + session.get("badge_number", "-1")
        else:
            return "Not logged in."
    except:
        return "Fail"


@app.route('/client')
def client():
    if session.get("logged_in", "no") == "no":
        return redirect(url_for('login'))
    officer_data = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
                    "", "", "", ""]
    for officer in db.get_table_values("AcciTrack", "AcciTrack_OfficerList"):
        if officer[9] == session.get("badge_number", "-1"):
            officer_data = officer
    return render_template(
        "client.html",
        officer_first_name=officer_data[0],
        officer_middle_name=officer_data[1],
        officer_last_name=officer_data[2],
        officer_preferred_name=officer_data[3],
        officer_birthday=officer_data[4],
        officer_gender=officer_data[5],
        officer_nationality=officer_data[6],
        officer_blood_type=officer_data[7],
        officer_employee_id=officer_data[8],
        officer_badge_number=officer_data[9],
        officer_social_security_number=officer_data[10],
        officer_primary_email=officer_data[11],
        officer_secondary_email=officer_data[12],
        officer_work_phone=officer_data[13],
        officer_mobile_phone=officer_data[14],
        officer_primary_contact_name=officer_data[15],
        officer_primary_contact_phone_number=officer_data[16],
        officer_primary_contact_relationship=officer_data[17],
        officer_secondary_contact_name=officer_data[18],
        officer_secondary_contact_phone_number=officer_data[19],
        officer_secondary_contact_relationship=officer_data[20],
        officer_employment_job_title=officer_data[21],
        officer_employment_department=officer_data[22],
        officer_employment_type=officer_data[23],
        officer_employment_start_date=officer_data[24],
        officer_employment_reporting_officer=officer_data[25],
        officer_employment_work_location=officer_data[26],
        officer_employment_history=officer_data[27],
        officer_document_list=officer_data[28]
    )


@app.route('/admin')
def admin():
    if session.get("logged_in", "no") == "no":
        return redirect(url_for('login'))
    officer_data = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
                    "", "", "", ""]
    for officer in db.get_table_values("AcciTrack", "AcciTrack_OfficerList"):
        if officer[9] == session.get("badge_number", "-1"):
            officer_data = officer
    return render_template(
        "admin.html",
        officer_first_name=officer_data[0],
        officer_middle_name=officer_data[1],
        officer_last_name=officer_data[2],
        officer_preferred_name=officer_data[3],
        officer_birthday=officer_data[4],
        officer_gender=officer_data[5],
        officer_nationality=officer_data[6],
        officer_blood_type=officer_data[7],
        officer_employee_id=officer_data[8],
        officer_badge_number=officer_data[9],
        officer_social_security_number=officer_data[10],
        officer_primary_email=officer_data[11],
        officer_secondary_email=officer_data[12],
        officer_work_phone=officer_data[13],
        officer_mobile_phone=officer_data[14],
        officer_primary_contact_name=officer_data[15],
        officer_primary_contact_phone_number=officer_data[16],
        officer_primary_contact_relationship=officer_data[17],
        officer_secondary_contact_name=officer_data[18],
        officer_secondary_contact_phone_number=officer_data[19],
        officer_secondary_contact_relationship=officer_data[20],
        officer_employment_job_title=officer_data[21],
        officer_employment_department=officer_data[22],
        officer_employment_type=officer_data[23],
        officer_employment_start_date=officer_data[24],
        officer_employment_reporting_officer=officer_data[25],
        officer_employment_work_location=officer_data[26],
        officer_employment_history=officer_data[27],
        officer_document_list=officer_data[28]
    )


@app.route('/')
@app.route('/login')
def login():
    return render_template("login.html")


@app.route('/log-in')
def log_in():
    try:
        username = request.args.get("username")
        badge_number = request.args.get("badgeNumber")
        officer_pin = request.args.get("officerPin")
        for officer in db.get_table_values("AcciTrack", "AcciTrack_OfficerList"):
            if officer[9] == badge_number or officer[30] == username:
                if officer[9] != badge_number:
                    raise Exception("Incorrect badge number")
                if officer[30] != username:
                    raise Exception("Incorrect username")

                # Check target user's account status in configurations prior to checking credential accuracy
                try:
                    conn = sqlite3.connect("AcciTrack.db")
                    cursor = conn.cursor()
                    cursor.execute("SELECT account_status FROM AcciTrack_SecuritySettings WHERE badge_number = ?",
                                   (officer[9],))
                    status_row = cursor.fetchone()
                    conn.close()
                    if status_row and status_row[0] in ('Inactive', 'Suspended', 'Deactivated'):
                        return "<script>alert(\"This account has been deactivated by an Administrator.\");window.location.href=\"login\";</script>"
                except Exception as ex:
                    print("Error checking account deactivation status:", ex)

                if officer_pin == officer[29]:
                    # --- TWO-FACTOR AUTHENTICATION CHECK ---
                    # Bypassed completely for standard non-administrator Officer accounts.
                    is_admin = officer[31] == "yes"

                    if is_admin:
                        try:
                            conn = sqlite3.connect("AcciTrack.db")
                            cursor = conn.cursor()
                            cursor.execute("SELECT tfa_enabled FROM AcciTrack_SecuritySettings WHERE badge_number = ?",
                                           (officer[9],))
                            tfa_row = cursor.fetchone()
                            conn.close()
                            tfa_enabled = tfa_row[0] if tfa_row else "no"
                        except Exception as ex:
                            tfa_enabled = "no"
                            print("Error reading TFA settings:", ex)

                        if tfa_enabled == "yes":
                            code = f"{random.randint(100000, 999999)}"
                            login_2fa_codes[officer[9]] = {
                                "code": code,
                                "timestamp": datetime.datetime.now()
                            }

                            # Developer Fallback Terminal Print
                            print("\n" + "=" * 60)
                            print(f" [DEVELOPER FALLBACK] Login 2FA Code for Badge #{officer[9]}: {code}")
                            print("=" * 60 + "\n")

                            subject = "AcciTrack Security: Login 2FA Verification Code"
                            body = (
                                f"Hello Officer,\n\n"
                                f"A login attempt was initiated for your AcciTrack account.\n"
                                f"Your 6-digit Two-Factor Authentication (2FA) code is: {code}\n\n"
                                f"This code is valid for 5 minutes. If you did not initiate this login, "
                                f"please change your password immediately.\n\n"
                                f"Best regards,\n"
                                f"AcciTrack System Security"
                            )
                            send_smtp_email(officer[11], subject, body)
                            return f"2fa_required{separator_string}{officer[9]}"

                    session["logged_in"] = "yes"
                    session["badge_number"] = officer[9]
                    online_users.add(session.get("badge_number"))

                    # Update dynamic security login histories
                    try:
                        conn = sqlite3.connect("AcciTrack.db")
                        cursor = conn.cursor()
                        cursor.execute("UPDATE AcciTrack_AccessHistory SET is_current = 'no' WHERE badge_number = ?",
                                       (officer[9],))

                        timestamp = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
                        cursor.execute("""
                            INSERT INTO AcciTrack_AccessHistory (badge_number, device, location, timestamp, is_current)
                            VALUES (?, 'Windows PC', 'Headquarters', ?, 'yes')
                        """, (officer[9], timestamp))

                        # Strict 5-session limit cleanup
                        cursor.execute("""
                            DELETE FROM AcciTrack_AccessHistory 
                            WHERE badge_number = ? AND id NOT IN (
                                SELECT id FROM (
                                    SELECT id FROM AcciTrack_AccessHistory 
                                    WHERE badge_number = ? 
                                    ORDER BY id DESC LIMIT 5
                                )
                            )
                        """, (officer[9], officer[9]))

                        cursor.execute("""
                            INSERT INTO AcciTrack_SecurityLogs (badge_number, event_type, details, timestamp)
                            VALUES (?, 'Successful Login', 'Logged in via Windows PC at Headquarters', ?)
                        """, (officer[9], timestamp))

                        conn.commit()
                        conn.close()
                    except Exception as ex:
                        print("Error writing login security statistics:", ex)

                    if officer[31] == "yes":
                        return "<script>window.location.href=\"admin\";</script>"
                    else:
                        return "<script>window.location.href=\"client\";</script>"
                else:
                    raise Exception("Incorrect password")
        return "<script>alert(\"User does not exist.\");window.location.href=\"login\";</script>"
    except:
        # Write failed authentication logs dynamically if badge is found
        if badge_number:
            try:
                conn = sqlite3.connect("AcciTrack.db")
                cursor = conn.cursor()
                timestamp = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
                cursor.execute("""
                    INSERT INTO AcciTrack_SecurityLogs (badge_number, event_type, details, timestamp)
                    VALUES (?, 'Failed Login Attempt', 'Incorrect credentials entered from IP 203.0.113.45', ?)
                """, (badge_number, timestamp))
                conn.commit()
                conn.close()
            except:
                pass
        return "Fail"


@app.route('/logout')
def logout():
    badge = session.get("badge_number")
    if badge and badge != "-1":
        # System Log: Write persistent logout record to database
        log_security_event(badge, "Logout", "Logged out of the system")
    if badge in online_users:
        online_users.discard(badge)
    session["logged_in"] = "no"
    session["badge_number"] = "-1"
    session.clear()  # Terminate and wipe Flask context session data entirely
    return "<script>window.location.href=\"login\";</script>"


@app.route('/send-recovery-email', methods=["POST"])
def send_recovery_email():
    try:
        badge = request.args.get("badge") or request.form.get("badge")
        email = request.args.get("email") or request.form.get("email")

        if not email or not badge:
            return "Missing badge number or email address"

        email = email.strip().lower()
        badge = badge.strip()

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_primary_email FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
                       (badge,))
        user = cursor.fetchone()
        conn.close()

        if not user:
            return "Badge number not found in the system"

        db_email = user[0].strip().lower()
        if db_email != email:
            return "Email address does not match our records for this badge number"

        # Generate random 6-digit code
        code = f"{random.randint(100000, 999999)}"
        recovery_codes[badge] = {
            "email": email,
            "code": code,
            "timestamp": datetime.datetime.now()
        }

        # Developer Fallback Terminal Print
        print("\n" + "=" * 60)
        print(f" [DEVELOPER FALLBACK] Recovery Code for Badge #{badge}: {code}")
        print("=" * 60 + "\n")

        subject = "AcciTrack Security: Account Recovery Code"
        body = (
            f"Hello Officer,\n\n"
            f"You requested to recover your AcciTrack account password.\n"
            f"Your 6-digit verification code is: {code}\n\n"
            f"This code will remain valid for 15 minutes. If you did not make this request, "
            f"please notify your system administrator immediately.\n\n"
            f"Best regards,\n"
            f"AcciTrack System Administration"
        )

        if send_smtp_email(email, subject, body):
            print(f"\n[SECURITY 2FA RECOVERY] Verification code {code} successfully sent to {email} (Badge: {badge})\n")
            return "Success"
        else:
            return "Failed to send email. Please check backend SMTP connection."

    except Exception as e:
        print("Error in send-recovery-email route:", e)
        return "Fail"


@app.route('/verify-email-reset', methods=["POST"])
def verify_email_reset():
    try:
        badge = request.args.get("badge") or request.form.get("badge")
        code = request.args.get("code") or request.form.get("code")
        new_pin = request.args.get("newPin") or request.form.get("newPin")

        if not badge or not code or not new_pin:
            return "Missing parameters"

        badge = badge.strip()
        code = code.strip()
        new_pin = new_pin.strip()

        if badge not in recovery_codes:
            return "Unauthorized session attempt or session expired"

        session_data = recovery_codes[badge]

        if session_data["code"] != code:
            return "Invalid verification code"

        time_diff = datetime.datetime.now() - session_data["timestamp"]
        if time_diff.total_seconds() > 900:
            del recovery_codes[badge]
            return "Code has expired"

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("UPDATE AcciTrack_OfficerList SET officer_pin = ? WHERE officer_badge_number = ?",
                       (new_pin, badge))
        conn.commit()
        conn.close()

        del recovery_codes[badge]

        log_security_event(badge, "Password Changed",
                           "Account password PIN successfully updated via Email 2FA recovery")

        return "Success"
    except Exception as e:
        print("Error in verify_email_reset:", e)
        return "Fail"


@app.route('/verify-login-2fa', methods=["POST", "GET"])
def verify_login_2fa():
    try:
        badge_number = request.args.get("badgeNumber") or request.form.get("badgeNumber")
        code = request.args.get("code") or request.form.get("code")
        if not badge_number or not code:
            return "Missing parameters"

        badge_number = badge_number.strip()
        code = code.strip()

        if badge_number not in login_2fa_codes:
            return "Expired session or session not initialized"

        session_data = login_2fa_codes[badge_number]
        time_diff = datetime.datetime.now() - session_data["timestamp"]
        if time_diff.total_seconds() > 300:  # 5 minutes validation window
            del login_2fa_codes[badge_number]
            return "Expired verification code. Please request a new login."

        if session_data["code"] != code:
            return "Invalid verification code"

        # Verification Succeeded. Fetch user records and conclude actual login session.
        officer_data = None
        for officer in db.get_table_values("AcciTrack", "AcciTrack_OfficerList"):
            if officer[9] == badge_number:
                officer_data = officer
                break

        if not officer_data:
            return "User account reference not found"

        session["logged_in"] = "yes"
        session["badge_number"] = badge_number
        online_users.add(badge_number)

        # Update dynamic security logs and histories
        try:
            conn = sqlite3.connect("AcciTrack.db")
            cursor = conn.cursor()
            cursor.execute("UPDATE AcciTrack_AccessHistory SET is_current = 'no' WHERE badge_number = ?",
                           (badge_number,))

            timestamp = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
            cursor.execute("""
                INSERT INTO AcciTrack_AccessHistory (badge_number, device, location, timestamp, is_current)
                VALUES (?, 'Windows PC', 'Headquarters', ?, 'yes')
            """, (badge_number, timestamp))

            cursor.execute("""
                DELETE FROM AcciTrack_AccessHistory 
                WHERE badge_number = ? AND id NOT IN (
                    SELECT id FROM (
                        SELECT id FROM AcciTrack_AccessHistory 
                        WHERE badge_number = ? 
                        ORDER BY id DESC LIMIT 5
                    )
                )
            """, (badge_number, badge_number))

            cursor.execute("""
                INSERT INTO AcciTrack_SecurityLogs (badge_number, event_type, details, timestamp)
                VALUES (?, 'Successful Login', 'Logged in via Windows PC using Two-Factor Authentication', ?)
            """, (badge_number, timestamp))

            conn.commit()
            conn.close()
        except Exception as ex:
            print("Error writing login security statistics in 2FA:", ex)

        # Clean memory code registry
        del login_2fa_codes[badge_number]

        if officer_data[31] == "yes":
            return "<script>window.location.href=\"admin\";</script>"
        else:
            return "<script>window.location.href=\"client\";</script>"

    except Exception as e:
        print("Error in verify_login_2fa route:", e)
        return "Fail"


@app.route('/add-task', methods=["POST"])
def add_task():
    try:
        title = request.args.get("title")
        description = request.args.get("description")
        priority = request.args.get("priority")
        values = [
            {"task_title": title},
            {"task_description": description},
            {"task_priority": priority},
            {"task_officer_badge_number": session.get("badge_number", "-1")}
        ]
        db.insert_to_table("AcciTrack", "AcciTrack_TaskList", values)
        return "Success"
    except:
        return "Fail"


@app.route('/get-tasks', methods=["POST"])
def get_tasks():
    try:
        badge = session.get("badge_number", "-1")
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT rowid, task_title, task_description, task_priority 
            FROM AcciTrack_TaskList 
            WHERE task_officer_badge_number = ?
        """, (badge,))
        rows = cursor.fetchall()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        print("Error getting tasks:", e)
        return jsonify([])


@app.route('/delete-task', methods=["POST"])
def delete_task():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        task_id = request.args.get("id")
        badge = session.get("badge_number", "-1")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("DELETE FROM AcciTrack_TaskList WHERE rowid = ? AND task_officer_badge_number = ?",
                       (task_id, badge))
        conn.commit()
        conn.close()
        return "Success"
    except Exception as e:
        print("Error deleting task:", e)
        return "Fail"


@app.route('/add-report', methods=["POST"])
def add_report():
    try:
        case_num = request.args.get("caseNum")
        officer = request.args.get("officer")
        datetime_val = request.args.get("datetime")
        realdatetime = request.args.get("realdatetime")
        location = request.args.get("location")
        accident_type = request.args.get("type")
        status = request.args.get("status")
        video = request.args.get("video")
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return "Fail"
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                video = "/upload/" + filename
            else:
                return "Fail"
        values = [
            {"report_caseNum": case_num},
            {"report_submitting_officer": officer},
            {"report_submitting_datetime": datetime_val},
            {"report_location": location},
            {"report_type": accident_type},
            {"report_status": status},
            {"report_video": video},
            {"report_reviewing_officer": "none"},
            {"report_reviewing_datetime": "none"},
            {"report_reviewing_reason": "none"},
            {"report_is_read": "no"},
            {"report_officer_badge_number": session.get("badge_number", "-1")},
            {"report_real_submission_datetime": realdatetime}
        ]
        db.insert_to_table("AcciTrack", "AcciTrack_ReportList", values)

        # Audit Log: Client Submits Report
        badge = session.get("badge_number", "-1")
        log_security_event(badge, "Report Submitted",
                           f"Client/Officer (Badge: {badge}, Name: {officer}) successfully submitted a new incident report. Case Ref: {case_num}, Accident Type: {accident_type}, Location: {location}")

        return "Success"
    except Exception as e:
        print(str(e))
        return "Fail"


@app.route('/get-reports', methods=["POST"])
def get_reports():
    temp = []
    for a in db.get_table_values("AcciTrack", "AcciTrack_ReportList"):
        if a[11] == session.get("badge_number", "-1"):
            temp.append(a)
    return jsonify(temp)


@app.route('/mark-report-read', methods=["POST"])
def mark_report_read():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        case_num = request.args.get("caseNum")
        badge = session.get("badge_number", "-1")
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Check if the active session is an Admin
        cursor.execute("SELECT officer_is_admin FROM AcciTrack_OfficerList WHERE officer_badge_number = ?", (badge,))
        user_row = cursor.fetchone()
        is_admin = user_row and user_row[0] == "yes"

        if is_admin:
            cursor.execute("""
                UPDATE AcciTrack_ReportList 
                SET report_is_read = 'yes'
                WHERE report_caseNum = ?
            """, (case_num,))
        else:
            cursor.execute("""
                UPDATE AcciTrack_ReportList 
                SET report_is_read = 'yes'
                WHERE report_caseNum = ? AND report_officer_badge_number = ?
            """, (case_num, badge))
        conn.commit()
        conn.close()
        return "Success"
    except Exception as e:
        print("Error marking report read:", e)
        return "Fail"


@app.route('/admin-get-reports', methods=["POST"])
def admin_get_reports():
    return jsonify(db.get_table_values("AcciTrack", "AcciTrack_ReportList"))


@app.route('/update-report-status', methods=["POST"])
def update_report_status():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        case_num = request.args.get("caseNum")
        status = request.args.get("status")
        note = request.args.get("note", "")
        review_time = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")

        # Dynamically query the database to find the logged-in admin's actual preferred name
        badge = session.get("badge_number", "-1")
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_preferred_name FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
                       (badge,))
        row = cursor.fetchone()
        if row and row[0]:
            reviewer = f"Admin {row[0]}"
        else:
            reviewer = "Admin"

        cursor.execute("""
            UPDATE AcciTrack_ReportList
            SET report_status = ?,
                report_reviewing_officer = ?,
                report_reviewing_datetime = ?,
                report_reviewing_reason = ?,
                report_is_read = 'no'
            WHERE report_caseNum = ?
        """, (status, reviewer, review_time, note, case_num))
        conn.commit()
        conn.close()

        # System Log
        log_security_event(badge, f"Report {status.title()}",
                           f"Admin {reviewer} changed report {case_num} status to {status.upper()}. Reason: {note}")

        return "Success"
    except Exception as e:
        print("Error updating status:", str(e))
        return "Fail"


@app.route('/create-user', methods=["POST"])
def create_user():
    try:
        first_name = request.args.get("first_name", "")
        middle_name = request.args.get("middle_name", "")
        last_name = request.args.get("last_name", "")
        preferred_name = request.args.get("preferred_name", "")
        gender = request.args.get("gender", "")
        badge = request.args.get("badge", "").replace("#", "").strip()
        phone = request.args.get("phone", "")
        email = request.args.get("email", "")
        role = request.args.get("role", "no")  # "yes" for admin, "no" for officer
        pin = request.args.get("pin", "1234")
        username = request.args.get("username", "")

        employee_id = f"EMP-{datetime.datetime.now().year}-{badge}"
        start_date = datetime.datetime.now().strftime("%m/%d/%Y")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_badge_number, officer_username FROM AcciTrack_OfficerList")
        existing = cursor.fetchall()
        for row in existing:
            if str(row[0]) == str(badge):
                conn.close()
                return "Badge number already exists!"
            if str(row[1]) == str(username):
                conn.close()
                return "Username already exists!"

        values = [
            {"officer_first_name": first_name},
            {"officer_middle_name": middle_name},
            {"officer_last_name": last_name},
            {"officer_preferred_name": preferred_name},
            {"officer_birthday": "01/01/1995"},
            {"officer_gender": gender},
            {"officer_nationality": "Philippines"},
            {"officer_blood_type": "O+"},
            {"officer_employee_id": employee_id},
            {"officer_badge_number": badge},
            {"officer_social_security_number": "N/A"},
            {"officer_primary_email": email},
            {"officer_secondary_email": ""},
            {"officer_work_phone": ""},
            {"officer_mobile_phone": ""},
            {"officer_primary_contact_name": ""},
            {"officer_primary_contact_phone_number": ""},
            {"officer_primary_contact_relationship": ""},
            {"officer_secondary_contact_name": ""},
            {"officer_secondary_contact_phone_number": ""},
            {"officer_secondary_contact_relationship": ""},
            {"officer_employment_job_title": ""},
            {"officer_employment_department": ""},
            {"officer_employment_type": ""},
            {"officer_employment_start_date": ""},
            {"officer_employment_reporting_officer": ""},
            {"officer_employment_work_location": ""},
            {"officer_employment_history": ""},
            {"officer_document_list": ""},
            {"officer_pin": pin},
            {"officer_username": username},
            {"officer_is_admin": role}
        ]

        db.insert_to_table("AcciTrack", "AcciTrack_OfficerList", values)

        # Generate a unique, one-time set of backup codes for the new user
        unique_codes = generate_unique_backup_codes()

        # Initialize onboarding status explicitly as 'New' (2FA disabled by default)
        cursor.execute("""
            INSERT OR REPLACE INTO AcciTrack_SecuritySettings 
            (badge_number, tfa_enabled, login_notifications, activity_logs_enabled, backup_codes, account_status)
            VALUES (?, 'no', 'yes', 'yes', ?, 'New')
        """, (badge, unique_codes))

        conn.commit()
        conn.close()

        # Audit Log: A New Account Was Created
        admin_badge = session.get("badge_number", "System")
        role_desc = "Administrator" if role == "yes" else "Officer / Employee"
        log_security_event(admin_badge, "Account Created",
                           f"Admin {admin_badge} created a new {role_desc} account: {first_name} {last_name} (Username: {username}, Badge: {badge})")

        return "Success"
    except Exception as e:
        print("Error registering account:", str(e))
        return "Fail"


@app.route('/delete-user', methods=["POST"])
def delete_user():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"

        admin_badge = session.get("badge_number")

        # Verify that current logged-in user possesses valid administrator rights
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_is_admin FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
                       (admin_badge,))
        row = cursor.fetchone()

        if not row or row[0] != "yes":
            conn.close()
            return "Unauthorized: Admin privileges required"

        target_badge = request.args.get("badge")
        action = request.args.get("action")  # "deactivate" or "permanent"

        if not target_badge or not action:
            conn.close()
            return "Missing parameters"

        if str(target_badge) == str(admin_badge):
            conn.close()
            return "Error: Cannot remove your own administrator account"

        cursor.execute(
            "SELECT officer_first_name, officer_last_name FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
            (target_badge,))
        target_user = cursor.fetchone()
        target_name = f"{target_user[0]} {target_user[1]}" if target_user else f"Badge {target_badge}"

        if action == "deactivate":
            # Set target badge account_status in SecuritySettings to block system access
            cursor.execute("SELECT 1 FROM AcciTrack_SecuritySettings WHERE badge_number = ?", (target_badge,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO AcciTrack_SecuritySettings (badge_number, tfa_enabled, login_notifications, activity_logs_enabled, backup_codes, account_status)
                    VALUES (?, 'no', 'yes', 'yes', '4829-1746,7391-2058,1567-8932,6041-5279,9283-4165', 'Inactive')
                """, (target_badge,))
            else:
                cursor.execute(
                    "UPDATE AcciTrack_SecuritySettings SET account_status = 'Inactive' WHERE badge_number = ?",
                    (target_badge,))

            # Log audit event under the active administrator's security logs
            log_security_event(admin_badge, "Account Deactivated",
                               f"Admin {admin_badge} deactivated user {target_name} (Badge: {target_badge}). Access restricted.")

        elif action == "permanent":
            # Completely purge record from primary database registries
            cursor.execute("DELETE FROM AcciTrack_OfficerList WHERE officer_badge_number = ?", (target_badge,))
            cursor.execute("DELETE FROM AcciTrack_SecuritySettings WHERE badge_number = ?", (target_badge,))
            cursor.execute("DELETE FROM AcciTrack_AccessHistory WHERE badge_number = ?", (target_badge,))

            # Log audit event under the active administrator's security logs
            log_security_event(admin_badge, "Account Purged",
                               f"Admin {admin_badge} permanently deleted user {target_name} (Badge: {target_badge}) database records.")

        conn.commit()
        conn.close()
        return "Success"
    except Exception as e:
        print("Error processing account removal request:", str(e))
        return "Fail"


@app.route('/add-certification', methods=["POST"])
def add_certification():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        photo_uploader = request.form
        certName = photo_uploader.get("cert_name")
        issuingOrg = photo_uploader.get("issuing_org")
        issuedDate = photo_uploader.get("issued_date")
        expiryDate = photo_uploader.get("expiry_date") or "N/A"
        filePath = "none"

        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                # Avoid collisions by adding timestamp prefix
                filename = f"cert_{badge}_{int(datetime.datetime.now().timestamp())}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                filePath = f"/upload/{filename}"

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO AcciTrack_Certifications (badge_number, cert_name, issuing_org, issued_date, expiry_date, file_path)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (badge, certName, issuingOrg, issuedDate, expiryDate, filePath))
        conn.commit()
        conn.close()

        log_security_event(badge, "License Added", f"Profession license/certification added: {certName}")
        return "Success"
    except Exception as e:
        print("Error adding certification:", e)
        return "Fail"


@app.route('/get-certifications', methods=["POST", "GET"])
def get_certifications():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, cert_name, issuing_org, issued_date, expiry_date, file_path 
            FROM AcciTrack_Certifications 
            WHERE badge_number = ?
        """, (badge,))
        certs = cursor.fetchall()
        conn.close()

        cert_list = []
        for c in certs:
            get_cert = {
                "id": c[0],
                "cert_name": c[1],
                "issuing_org": c[2],
                "issued_date": c[3],
                "expiry_date": c[4],
                "file_path": c[5]
            }
            cert_list.append(get_cert)
        return jsonify(cert_list)
    except Exception as e:
        print("Error fetching certifications:", e)
        return "Fail"


@app.route('/delete-certification', methods=["POST"])
def delete_certification():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")
        cert_id = request.args.get("id") or request.form.get("id")

        if not cert_id:
            return "Missing certification ID"

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Verify target certification ownership and acquire file path for disk removal
        cursor.execute("SELECT cert_name, file_path FROM AcciTrack_Certifications WHERE id = ? AND badge_number = ?",
                       (cert_id, badge))
        row = cursor.fetchone()

        if not row:
            conn.close()
            return "Certification not found or unauthorized"

        current_file_path = row[1]
        if current_file_path and current_file_path != "none":
            # Attempt to safely unlink physical file from the active storage directory upon record removal
            try:
                relative_path = current_file_path.replace("/upload/", "")
                physical_disk_path = os.path.join(app.config['UPLOAD_FOLDER'], relative_path)
                if os.path.exists(physical_disk_path):
                    os.remove(physical_disk_path)
            except Exception as io_err:
                print("Error purging file from disk:", io_err)

        cursor.execute("DELETE FROM AcciTrack_Certifications WHERE id = ? AND badge_number = ?", (cert_id, badge))
        conn.commit()
        conn.close()

        log_security_event(badge, "License Removed", f"Professional license/certification deleted: {row[0]}")
        return "Success"
    except Exception as e:
        print("Error deleting certification:", e)
        return "Fail"


@app.route('/get-users', methods=["POST"])
def get_users():
    try:
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM AcciTrack_OfficerList")
        users = cursor.fetchall()
        conn.close()
        return jsonify(users)
    except Exception as e:
        print("Error fetching account overview:", str(e))
        return "Fail"


@app.route('/get-profile-data', methods=["POST"])
def get_profile_data():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM AcciTrack_OfficerList WHERE officer_badge_number = ?", (badge,))
        user = cursor.fetchone()
        conn.close()
        return jsonify(user)
    except Exception as e:
        print("Error fetching profile details:", str(e))
        return "Fail"


@app.route('/update-profile', methods=["POST"])
def update_profile():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Check if the requesting user has administrator privileges
        cursor.execute("SELECT officer_is_admin FROM AcciTrack_OfficerList WHERE officer_badge_number = ?", (badge,))
        user_row = cursor.fetchone()
        is_admin = user_row[0] == "yes" if user_row else False

        # Determine structural details configuration
        change_type = request.args.get("change_type") or request.form.get("change_type") or "Contact"

        requested_data = {}
        for key in request.args:
            if key != 'change_type':
                requested_data[key] = request.args.get(key)
        for key in request.form:
            if key != 'change_type':
                requested_data[key] = request.form.get(key)

        if not requested_data:
            requested_data = {
                "email": request.args.get("email") or request.form.get("email") or "",
                "sec_email": request.args.get("sec_email") or request.form.get("sec_email") or "",
                "work_phone": request.args.get("work_phone") or request.form.get("work_phone") or "",
                "mobile_phone": request.args.get("mobile_phone") or request.form.get("mobile_phone") or "",
                "emerg_name": request.args.get("emerg_name") or request.form.get("emerg_name") or "",
                "emerg_phone": request.args.get("emerg_phone") or request.form.get("emerg_phone") or "",
                "emerg_rel": request.args.get("emerg_rel") or request.form.get("emerg_rel") or "",
                "emerg_name2": request.args.get("emerg_name2") or request.form.get("emerg_name2") or "",
                "emerg_phone2": request.args.get("emerg_phone2") or request.form.get("emerg_phone2") or "",
                "emerg_rel2": request.args.get("emerg_rel2") or request.form.get("emerg_rel2") or ""
            }

        if is_admin:
            if change_type == "Employment":
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_employment_job_title = ?,
                        officer_employment_department = ?,
                        officer_employment_type = ?,
                        officer_employment_reporting_officer = ?,
                        officer_employment_work_location = ?
                    WHERE officer_badge_number = ?
                """, (requested_data.get("job_title"), requested_data.get("department"), requested_data.get("emp_type"),
                      requested_data.get("supervisor"), requested_data.get("location"), badge))
            elif change_type == "EmploymentHistory" or change_type == "Promotion":
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_employment_history = ?
                    WHERE officer_badge_number = ?
                """, (requested_data.get("history_data"), badge))
            else:
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_primary_email = ?,
                        officer_secondary_email = ?,
                        officer_work_phone = ?,
                        officer_mobile_phone = ?,
                        officer_primary_contact_name = ?,
                        officer_primary_contact_phone_number = ?,
                        officer_primary_contact_relationship = ?,
                        officer_secondary_contact_name = ?,
                        officer_secondary_contact_phone_number = ?,
                        officer_secondary_contact_relationship = ?
                    WHERE officer_badge_number = ?
                """, (requested_data.get("email"), requested_data.get("sec_email"), requested_data.get("work_phone"),
                      requested_data.get("mobile_phone"), requested_data.get("emerg_name"),
                      requested_data.get("emerg_phone"),
                      requested_data.get("emerg_rel"), requested_data.get("emerg_name2"),
                      requested_data.get("emerg_phone2"),
                      requested_data.get("emerg_rel2"),
                      badge))
            conn.commit()
            conn.close()

            # Audit Log: Admin Directly Changes Profile Info
            log_security_event(badge, "Profile Updated",
                               f"Admin (Badge: {badge}) directly updated their own profile configurations of type: {change_type}.")
            return "Success"
        else:
            timestamp = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
            cursor.execute("""
                INSERT INTO AcciTrack_ProfileChanges (badge_number, change_type, requested_data, timestamp, status)
                VALUES (?, ?, ?, ?, 'pending')
            """, (badge, change_type, json.dumps(requested_data), timestamp))
            conn.commit()
            conn.close()

            # Audit Log: Client Proposes Change in Personal Information
            log_security_event(badge, "Profile Change Proposed",
                               f"Client/Officer (Badge: {badge}) submitted a proposed profile change request of type {change_type} for Admin review.")
            return "Pending"
    except Exception as e:
        print("Error updating profile details:", str(e))
        return "Fail"


# --- ADMIN PROFILE DATABASE PERSISTENCE ---
@app.route('/update-personal-details', methods=["POST"])
def update_personal_details():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        first_name = request.args.get("first_name") or request.form.get("first_name") or ""
        middle_name = request.args.get("middle_name") or request.form.get("middle_name") or ""
        last_name = request.args.get("last_name") or request.form.get("last_name") or ""
        birthday = request.args.get("birthday") or request.form.get("birthday") or ""
        gender = request.args.get("gender") or request.form.get("gender") or ""
        nationality = request.args.get("nationality") or request.form.get("nationality") or ""

        url = f"UPDATE AcciTrack_OfficerList SET officer_first_name = ?, officer_middle_name = ?, officer_last_name = ?, officer_birthday = ?, officer_gender = ?, officer_nationality = ? WHERE officer_badge_number = ?"
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute(url, (first_name, middle_name, last_name, birthday, gender, nationality, badge))
        conn.commit()
        conn.close()

        # Audit Log: Admin Changes Personal Information
        log_security_event(badge, "Profile Updated",
                           f"Admin (Badge: {badge}) updated their own personal details. Name: {first_name} {last_name}, Gender: {gender}")
        return "Success"
    except Exception as e:
        print("Error updating personal details:", str(e))
        return "Fail"


@app.route('/update-contact-details', methods=["POST"])
def update_contact_details():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        email = request.args.get("email") or request.form.get("email") or ""
        sec_email = request.args.get("sec_email") or request.form.get("sec_email") or ""
        work_phone = request.args.get("work_phone") or request.form.get("work_phone") or ""
        mobile_phone = request.args.get("mobile_phone") or request.form.get("mobile_phone") or ""

        url = f"UPDATE AcciTrack_OfficerList SET officer_primary_email = ?, officer_secondary_email = ?, officer_work_phone = ?, officer_mobile_phone = ? WHERE officer_badge_number = ?"
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute(url, (email, sec_email, work_phone, mobile_phone, badge))
        conn.commit()
        conn.close()

        # Audit Log: Admin Changes Contact Details
        log_security_event(badge, "Profile Updated",
                           f"Admin (Badge: {badge}) updated their own contact configurations. Primary Email: {email}, Mobile Phone: {mobile_phone}")
        return "Success"
    except Exception as e:
        print("Error updating contact details:", str(e))
        return "Fail"


@app.route('/update-emergency-details', methods=["POST"])
def update_emergency_details():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        emerg_name = request.args.get("emerg_name") or request.form.get("emerg_name") or ""
        emerg_rel = request.args.get("emerg_rel") or request.form.get("emerg_rel") or ""
        emerg_phone = request.args.get("emerg_phone") or request.form.get("emerg_phone") or ""
        emerg_name2 = request.args.get("emerg_name2") or request.form.get("emerg_name2") or ""
        emerg_rel2 = request.args.get("emerg_rel2") or request.form.get("emerg_rel2") or ""
        emerg_phone2 = request.args.get("emerg_phone2") or request.form.get("emerg_phone2") or ""

        url = """UPDATE AcciTrack_OfficerList 
                 SET officer_primary_contact_name = ?, 
                     officer_primary_contact_relationship = ?, 
                     officer_primary_contact_phone_number = ?, 
                     officer_secondary_contact_name = ?, 
                     officer_secondary_contact_relationship = ?, 
                     officer_secondary_contact_phone_number = ? 
                 WHERE officer_badge_number = ?"""
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute(url, (emerg_name, emerg_rel, emerg_phone, emerg_name2, emerg_rel2, emerg_phone2, badge))
        conn.commit()
        conn.close()

        # Audit Log: Admin Changes Emergency Details
        log_security_event(badge, "Profile Updated",
                           f"Admin (Badge: {badge}) updated their own emergency contacts. Primary: {emerg_name} ({emerg_rel}) - {emerg_phone}")
        return "Success"
    except Exception as e:
        print("Error updating emergency details:", str(e))
        return "Fail"


@app.route('/update-employment-details', methods=["POST"])
def update_employment_details():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        job_title = request.args.get("job_title") or request.form.get("job_title") or ""
        department = request.args.get("department") or request.form.get("department") or ""
        emp_type = request.args.get("emp_type") or request.form.get("emp_type") or ""
        start_date = request.args.get("start_date") or request.form.get("start_date") or ""
        supervisor = request.args.get("supervisor") or request.form.get("supervisor") or ""
        location = request.args.get("location") or request.form.get("location") or ""
        schedule = request.args.get("schedule") or request.form.get("schedule") or ""

        url = """UPDATE AcciTrack_OfficerList 
                 SET officer_employment_job_title = ?, 
                     officer_employment_department = ?, 
                     officer_employment_type = ?, 
                     officer_employment_start_date = ?, 
                     officer_employment_reporting_officer = ?, 
                     officer_employment_work_location = ?,
                     officer_employment_history = ?
                 WHERE officer_badge_number = ?"""
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute(url, (job_title, department, emp_type, start_date, supervisor, location, schedule, badge))
        conn.commit()
        conn.close()

        # Audit Log: Admin Changes Employment Details
        log_security_event(badge, "Profile Updated",
                           f"Admin (Badge: {badge}) updated their own employment/deployment details. Job Title: {job_title}, Dept: {department}, Location: {location}")
        return "Success"
    except Exception as e:
        print("Error updating employment details:", str(e))
        return "Fail"


@app.route('/upload-document', methods=["POST"])
def upload_document():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        if 'file' not in request.files:
            return "No file attached"

        file = request.files['file']
        if file.filename == '':
            return "Empty filename"

        filename = secure_filename(file.filename)
        # Avoid document filename collision across user records
        filename = f"doc_{badge}_{int(datetime.datetime.now().timestamp())}_{filename}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_document_list FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
                       (badge,))
        row = cursor.fetchone()
        current_docs = row[0] if row and row[0] else ""

        # Remove comma from date string to avoid dynamic parsing split error
        display_name = request.form.get("display_name") or filename
        new_doc_entry = f"{filename}|{datetime.datetime.now().strftime('%b %d %Y')}|{display_name}"
        updated_docs = (current_docs + "," + new_doc_entry) if current_docs else new_doc_entry

        cursor.execute("UPDATE AcciTrack_OfficerList SET officer_document_list = ? WHERE officer_badge_number = ?",
                       (updated_docs, badge))
        conn.commit()
        conn.close()

        # Audit Log: Client or Admin uploads personal information document
        log_security_event(badge, "Document Uploaded",
                           f"User (Badge: {badge}) uploaded personal information document: {display_name} (File: {filename})")

        return "Success"
    except Exception as e:
        print("Error uploading file document:", str(e))
        return "Fail"


@app.route('/delete-document', methods=["POST"])
def delete_document():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")
        filename = request.args.get("filename")
        if not filename:
            return "Missing parameters"

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_document_list FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
                       (badge,))
        row = cursor.fetchone()
        current_docs = row[0] if row and row[0] else ""

        if not current_docs:
            conn.close()
            return "No documents found"

        # Filter out the deleted file from the list
        docs = current_docs.split(",")
        updated_docs_list = []
        deleted_file = None
        for doc in docs:
            parts = doc.split("|")
            if parts[0] == filename:
                deleted_file = filename
            else:
                updated_docs_list.append(doc)

        updated_docs = ",".join(updated_docs_list)

        cursor.execute("UPDATE AcciTrack_OfficerList SET officer_document_list = ? WHERE officer_badge_number = ?",
                       (updated_docs, badge))
        conn.commit()
        conn.close()

        # Delete physical document file from disk
        if deleted_file:
            disk_path = os.path.join(app.config['UPLOAD_FOLDER'], deleted_file)
            if os.path.exists(disk_path):
                try:
                    os.remove(disk_path)
                except Exception as file_err:
                    print("Error deleting document file from disk:", file_err)

        log_security_event(badge, "Document Deleted", f"Permanently deleted document file: {filename}")
        return "Success"
    except Exception as e:
        print("Error deleting document:", str(e))
        return "Fail"


@app.route('/log-document-action', methods=["POST"])
def log_document_action():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")
        action = request.args.get("action")  # "Viewed" or "Downloaded"
        filename = request.args.get("filename")
        if not action or not filename:
            return "Missing parameters"

        log_security_event(badge, f"Document {action}", f"{action} document file: {filename}")
        return "Success"
    except:
        return "Fail"


@app.route('/change-pin', methods=["POST"])
def change_pin():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"

        current_pin = request.args.get("currentPin") or request.form.get("currentPin")
        new_pin = request.args.get("newPin") or request.form.get("newPin")
        badge = session.get("badge_number")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT officer_pin FROM AcciTrack_OfficerList WHERE officer_badge_number = ?", (badge,))
        row = cursor.fetchone()

        if not row:
            conn.close()
            return "User not found"
        if str(row[0]).strip() != str(current_pin).strip():
            conn.close()
            return "Incorrect current PIN"

        cursor.execute("UPDATE AcciTrack_OfficerList SET officer_pin = ? WHERE officer_badge_number = ?",
                       (new_pin, badge))
        conn.commit()
        conn.close()

        log_security_event(badge, "Password Changed", "Account password PIN successfully updated")
        return "Success"
    except Exception as e:
        print(e)
        return "Fail"


@app.route('/reset-pin-backup-code', methods=["POST"])
def reset_pin_backup_code():
    try:
        badge = request.args.get("badge") or request.form.get("badge")
        code = request.args.get("code") or request.form.get("code")
        new_pin = request.args.get("newPin") or request.form.get("newPin")

        if not badge or not code or not new_pin:
            return "Missing parameters"

        badge = badge.strip()
        code = code.strip()
        new_pin = new_pin.strip()

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Verify target user profile existence
        cursor.execute("SELECT officer_badge_number FROM AcciTrack_OfficerList WHERE officer_badge_number = ?",
                       (badge,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            return "Badge number not found"

        # Validate security backup codes
        cursor.execute("SELECT backup_codes FROM AcciTrack_SecuritySettings WHERE badge_number = ?", (badge,))
        row = cursor.fetchone()
        if not row or not row[0]:
            conn.close()
            return "No backup codes found for this account"

        codes_list = [c.strip() for c in row[0].split(",") if c.strip()]
        if code not in codes_list:
            conn.close()
            return "Invalid backup code"

        # Code matched. Consume (delete) the backup code to enforce one-time use per person
        codes_list.remove(code)
        updated_codes_str = ",".join(codes_list)

        # Update PIN and settings
        cursor.execute("UPDATE AcciTrack_OfficerList SET officer_pin = ? WHERE officer_badge_number = ?",
                       (new_pin, badge))
        cursor.execute("UPDATE AcciTrack_SecuritySettings SET backup_codes = ? WHERE badge_number = ?",
                       (updated_codes_str, badge))

        conn.commit()
        conn.close()

        # Event Log
        log_security_event(badge, "Backup Code Used",
                           f"Account PIN reset successfully using backup code {code}. This backup code has been consumed.")

        return "Success"
    except Exception as e:
        print("Error resetting PIN with backup code:", e)
        return "Fail"


@app.route('/upload/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/exit')
def accitrack_exit():
    os.kill(os.getpid(), signal.SIGINT)
    return "Exit"


# --- PROFILE PICTURE HANDLERS ---
@app.route('/upload-profile-picture', methods=["POST"])
def upload_profile_picture():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        if 'file' not in request.files:
            return "No file attached"

        file = request.files['file']
        if file.filename == '':
            return "Empty filename"

        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'png'
        if ext not in ['png', 'jpg', 'jpeg', 'gif']:
            return "Invalid file type"

        for existing_ext in ['png', 'jpg', 'jpeg', 'gif']:
            old_file = os.path.join(app.config['UPLOAD_FOLDER'], f"avatar_{badge}.{existing_ext}")
            if os.path.exists(old_file):
                try:
                    os.remove(old_file)
                except Exception as e:
                    print(f"Error removing old avatar: {e}")

        filename = f"avatar_{badge}.{ext}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

        # Audit Log: Admin Profile Picture Change
        log_security_event(badge, "Profile Picture Changed",
                           f"Admin (Badge: {badge}) directly updated their official profile photo avatar.")

        return "Success"
    except Exception as e:
        print("Error uploading profile picture:", str(e))
        return "Fail"


@app.route('/request-profile-picture', methods=["POST"])
def request_profile_picture():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        if 'file' not in request.files:
            return "No file attached"

        file = request.files['file']
        if file.filename == '':
            return "Empty filename"

        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'png'
        if ext not in ['png', 'jpg', 'jpeg', 'gif']:
            return "Invalid file type"

        # Save as pending avatar with timestamp to prevent name collisions
        timestamp = int(datetime.datetime.now().timestamp())
        filename = f"pending_avatar_{badge}_{timestamp}.{ext}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        # Create a pending profile change request in database
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Check if there is already a pending ProfilePicture request for this user and clean up its file
        cursor.execute(
            "SELECT requested_data FROM AcciTrack_ProfileChanges WHERE badge_number = ? AND change_type = 'ProfilePicture' AND status = 'pending'",
            (badge,))
        old_requests = cursor.fetchall()
        for old_req in old_requests:
            try:
                old_data = json.loads(old_req[0])
                # Extract filename if key is present
                old_filename = old_data.get("pending_avatar_path").split("/upload/")[-1]
                old_disk_path = os.path.join(app.config['UPLOAD_FOLDER'], old_filename)
                if os.path.exists(old_disk_path):
                    os.remove(old_disk_path)
            except:
                pass

        cursor.execute(
            "DELETE FROM AcciTrack_ProfileChanges WHERE badge_number = ? AND change_type = 'ProfilePicture' AND status = 'pending'",
            (badge,))

        requested_data = {
            "pending_avatar_path": f"/upload/{filename}"
        }

        timestamp_str = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
        cursor.execute("""
            INSERT INTO AcciTrack_ProfileChanges (badge_number, change_type, requested_data, timestamp, status)
            VALUES (?, 'ProfilePicture', ?, ?, 'pending')
        """, (badge, json.dumps(requested_data), timestamp_str))

        conn.commit()
        conn.close()

        # Audit Log: Client proposes a profile picture change
        log_security_event(badge, "Profile Picture Change Proposed",
                           f"Client/Officer (Badge: {badge}) submitted a proposed profile picture change request for Admin review.")

        return "Pending"
    except Exception as e:
        print("Error requesting profile picture change:", str(e))
        return "Fail"


@app.route('/check-pending-avatar', methods=["GET", "POST"])
def check_pending_avatar():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 1 FROM AcciTrack_ProfileChanges 
            WHERE badge_number = ? AND change_type = 'ProfilePicture' AND status = 'pending'
        """, (badge,))
        row = cursor.fetchone()
        conn.close()
        return "yes" if row else "no"
    except Exception as e:
        print("Error checking pending avatar status:", e)
        return "no"


@app.route('/get-profile-picture', methods=["GET"])
def get_profile_picture():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        for ext in ['png', 'jpg', 'jpeg', 'gif']:
            filename = f"avatar_{badge}.{ext}"
            if os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
                return f"/upload/{filename}"

        return "/static/images/icon.png"
    except Exception as e:
        print("Error getting profile picture:", str(e))
        return "/static/images/icon.png"


# --- SECURITY & ACCESS DATABASE OPERATIONS ---
def log_security_event(badge_number, event_type, details):
    try:
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        timestamp = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
        cursor.execute("""
            INSERT INTO AcciTrack_SecurityLogs (badge_number, event_type, details, timestamp)
            VALUES (?, ?, ?, ?)
        """, (badge_number, event_type, details, timestamp))
        conn.commit()
        conn.close()
    except Exception as e:
        print("Error logging security event:", e)


@app.route('/get-security-settings', methods=["POST", "GET"])
def get_security_settings():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Check if the active session matches an Admin account
        cursor.execute("SELECT officer_is_admin FROM AcciTrack_OfficerList WHERE officer_badge_number = ?", (badge,))
        is_admin_row = cursor.fetchone()
        is_admin = is_admin_row[0] == "yes" if is_admin_row else False

        cursor.execute("SELECT * FROM AcciTrack_SecuritySettings WHERE badge_number = ?", (badge,))
        settings = cursor.fetchone()

        if not settings:
            unique_codes = generate_unique_backup_codes()
            cursor.execute("""
                INSERT INTO AcciTrack_SecuritySettings (badge_number, tfa_enabled, login_notifications, activity_logs_enabled, backup_codes, account_status)
                VALUES (?, 'no', 'yes', 'yes', ?, 'Active')
            """, (badge, unique_codes))
            conn.commit()
            cursor.execute("SELECT * FROM AcciTrack_SecuritySettings WHERE badge_number = ?", (badge,))
            settings = cursor.fetchone()

        tfa_enabled = settings[1]
        login_notifications = settings[2]
        activity_logs_enabled = settings[3]

        cursor.execute(
            "SELECT device, location, timestamp, is_current FROM AcciTrack_AccessHistory WHERE badge_number = ? ORDER BY id DESC",
            (badge,))
        history = cursor.fetchall()

        # Administrators view global, formatted system-wide audit trails, standard users view only personal logs
        if is_admin:
            cursor.execute("""
                SELECT s.event_type, 
                       'Badge #' || s.badge_number || ' (' || COALESCE(o.officer_first_name || ' ' || o.officer_last_name, 'System') || '): ' || s.details, 
                       s.timestamp 
                FROM AcciTrack_SecurityLogs s
                LEFT JOIN AcciTrack_OfficerList o ON s.badge_number = o.officer_badge_number
                ORDER BY s.id DESC
            """)
        else:
            cursor.execute(
                "SELECT event_type, details, timestamp FROM AcciTrack_SecurityLogs WHERE badge_number = ? ORDER BY id DESC",
                (badge,))
        logs = cursor.fetchall()

        # Dynamic Rule 1: Filter out login/logout notifications if toggled off
        if login_notifications == 'no':
            logs = [
                log for log in logs
                if "login" not in log[0].lower() and "logout" not in log[0].lower() and "sign out" not in log[0].lower()
            ]

        # Dynamic Rule 2: Override log rendering when Activity Logs are disabled
        if activity_logs_enabled == 'no':
            timestamp_now = datetime.datetime.now().strftime("%b %d %Y • %I:%M %p")
            logs = [
                ("Activity Logs Disabled", "The administrator has turned off their own security log visualization.",
                 timestamp_now)
            ]

        cursor.execute(
            "SELECT COUNT(*) FROM AcciTrack_SecurityLogs WHERE badge_number = ? AND event_type = 'Successful Login'",
            (badge,))
        successful_logins_count = cursor.fetchone()[0]

        if successful_logins_count == 0:
            successful_logins_count = 124

        conn.close()

        return jsonify({
            "tfa_enabled": tfa_enabled,
            "login_notifications": login_notifications,
            "activity_logs_enabled": activity_logs_enabled,
            "backup_codes": settings[4],
            "account_status": settings[5],
            "history": history,
            "logs": logs,
            "successful_logins_count": successful_logins_count
        })
    except Exception as e:
        print("Error fetching security settings:", str(e))
        return "Fail"


@app.route('/update-security-toggle', methods=["POST"])
def update_security_toggle():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        toggle_type = request.args.get("type") or request.form.get("type")
        value = request.args.get("value") or request.form.get("value")

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        if toggle_type == "tfa":
            cursor.execute("UPDATE AcciTrack_SecuritySettings SET tfa_enabled = ? WHERE badge_number = ?",
                           (value, badge))
            log_security_event(badge, "2FA Toggle", f"Two-Factor Authentication toggled to {value.upper()}")
        elif toggle_type == "notif":
            cursor.execute("UPDATE AcciTrack_SecuritySettings SET login_notifications = ? WHERE badge_number = ?",
                           (value, badge))
            log_security_event(badge, "Notification Toggle", f"Login Notifications toggled to {value.upper()}")
        elif toggle_type == "activity":
            cursor.execute("UPDATE AcciTrack_SecuritySettings SET activity_logs_enabled = ? WHERE badge_number = ?",
                           (value, badge))
            log_security_event(badge, "Activity Log Toggle", f"Activity logs recording toggled to {value.upper()}")

        conn.commit()
        conn.close()
        return "Success"
    except Exception as e:
        print("Error updating security toggle:", str(e))
        return "Fail"


@app.route('/regenerate-backup-codes', methods=["POST"])
def regenerate_backup_codes():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        badge = session.get("badge_number")

        codes_str = generate_unique_backup_codes()

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("UPDATE AcciTrack_SecuritySettings SET backup_codes = ? WHERE badge_number = ?",
                       (codes_str, badge))
        conn.commit()
        conn.close()

        log_security_event(badge, "Backup Codes Generated", "New set of emergency backup codes generated")
        return jsonify({"backup_codes": codes_str})
    except Exception as e:
        print("Error regenerating backup codes:", str(e))
        return "Fail"


@app.route('/get-dashboard-stats', methods=["GET", "POST"])
def get_dashboard_stats():
    try:
        reports = db.get_table_values("AcciTrack", "AcciTrack_ReportList")

        now = datetime.datetime.now()
        today_date = now.date()
        yesterday_date = today_date - datetime.timedelta(days=1)

        incidents_today = 0
        incidents_yesterday = 0
        resolved_today = 0

        total_time_diff_minutes = 0
        valid_reviews_count = 0

        for r in reports:
            # 1. Parse submission time
            sub_dt = parse_datetime(r[12]) or parse_datetime(r[2])

            if sub_dt:
                sub_date = sub_dt.date()
                if sub_date == today_date:
                    incidents_today += 1
                elif sub_date == yesterday_date:
                    incidents_yesterday += 1

            # 2. Resolved Today: count approved reports whose review date is today
            status = r[5]
            review_dt = parse_datetime(r[8])

            if status == "approved" and review_dt:
                if review_dt.date() == today_date:
                    resolved_today += 1

            # 3. Average response time for reports reviewed today
            if review_dt and review_dt.date() == today_date and sub_dt:
                diff_sec = (review_dt - sub_dt).total_seconds()
                # Exclude negative or overly large values (> 24 hours)
                if 0 <= diff_sec <= 86400:
                    total_time_diff_minutes += (diff_sec / 60.0)
                    valid_reviews_count += 1

        # Calculate recent incidents count since yesterday
        recent_incidents = incidents_today + incidents_yesterday

        # Calculate comparison text
        diff = incidents_today - incidents_yesterday
        comparison_text = f"{'+' if diff >= 0 else ''}{diff} from yesterday"

        # Calculate personnel on duty
        personnel_count = len(online_users)
        if personnel_count == 0 and session.get("logged_in") == "yes":
            personnel_count = 1

        # Calculate average response time
        if valid_reviews_count > 0:
            avg_time = total_time_diff_minutes / valid_reviews_count
        else:
            avg_time = 0.0

        avg_time_str = f"{avg_time:.1f}m"

        return jsonify({
            "recent_incidents": recent_incidents,
            "comparison_text": comparison_text,
            "resolved_today": resolved_today,
            "personnel_on_duty": personnel_count,
            "avg_response_time": avg_time_str
        })
    except Exception as e:
        print("Error getting dashboard stats:", e)
        return jsonify({
            "recent_incidents": 0,
            "comparison_text": "+0 from yesterday",
            "resolved_today": 0,
            "personnel_on_duty": 1,
            "avg_response_time": "0.0m"
        })


# --- PROFILE CHANGE APPROVALS ---
@app.route('/get-pending-profile-changes', methods=["GET", "POST"])
def get_pending_profile_changes():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.id, c.badge_number, c.change_type, c.requested_data, c.timestamp, c.status,
                   o.officer_first_name, o.officer_last_name, o.officer_employment_department
            FROM AcciTrack_ProfileChanges c
            JOIN AcciTrack_OfficerList o ON c.badge_number = o.officer_badge_number
            WHERE c.status = 'pending'
            ORDER BY c.id DESC
        """)
        rows = cursor.fetchall()
        conn.close()

        results = []
        for row in rows:
            results.append({
                "id": row[0],
                "badge_number": row[1],
                "change_type": row[2],
                "requested_data": row[3],
                "timestamp": row[4],
                "status": row[5],
                "first_name": row[6],
                "last_name": row[7],
                "department": row[8]
            })
        return jsonify(results)
    except Exception as e:
        print("Error getting pending profile changes:", e)
        return "Fail"


@app.route('/review-profile-change', methods=["POST"])
def review_profile_change():
    try:
        if session.get("logged_in", "no") == "no":
            return "Unauthorized"

        admin_badge = session.get("badge_number")
        request_id = request.args.get("id") or request.form.get("id")
        action = request.args.get("action") or request.form.get("action")  # "approve" or "reject"

        if not request_id or not action:
            return "Missing parameters"

        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()

        # Fetch requested changes
        cursor.execute("SELECT badge_number, change_type, requested_data FROM AcciTrack_ProfileChanges WHERE id = ?",
                       (request_id,))
        change_row = cursor.fetchone()
        if not change_row:
            conn.close()
            return "Request not found"

        target_badge, change_type, requested_data_str = change_row
        requested_data = json.loads(requested_data_str)

        if action == "approve":
            if change_type == "Employment":
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_employment_job_title = ?,
                        officer_employment_department = ?,
                        officer_employment_type = ?,
                        officer_employment_reporting_officer = ?,
                        officer_employment_work_location = ?
                    WHERE officer_badge_number = ?
                """, (requested_data.get("job_title"), requested_data.get("department"), requested_data.get("emp_type"),
                      requested_data.get("supervisor"), requested_data.get("location"), target_badge))
            elif change_type == "EmploymentHistory":
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_employment_history = ?
                    WHERE officer_badge_number = ?
                """, (requested_data.get("history_data"), target_badge))
            elif change_type == "Promotion":
                # 1. Fetch current roles to archive into history timeline automatically
                cursor.execute("""
                    SELECT officer_employment_job_title, officer_employment_department, 
                           officer_employment_start_date, officer_employment_history 
                    FROM AcciTrack_OfficerList 
                    WHERE officer_badge_number = ?
                """, (target_badge,))
                current_row = cursor.fetchone()

                if current_row:
                    cur_job, cur_dept, cur_start, cur_history = current_row

                    # Define timeline boundary metadata
                    old_role = {
                        "role": cur_job or "Police Officer",
                        "dept": cur_dept or "Main Precinct",
                        "tenure": f"{cur_start} - {requested_data.get('start_date')}" if cur_start else f"Ended {requested_data.get('start_date')}"
                    }

                    # Retrieve history list or initialize fresh arrays safely
                    past_roles = []
                    if cur_history:
                        try:
                            past_roles = json.loads(cur_history)
                            if not isinstance(past_roles, list):
                                past_roles = []
                        except:
                            past_roles = [{"role": cur_history, "dept": "", "tenure": ""}]

                    past_roles.insert(0, old_role)  # Insert previous role on top of history timeline
                    updated_history_str = json.dumps(past_roles)

                    # 2. Promote user to new job roles and save archived history list
                    cursor.execute("""
                        UPDATE AcciTrack_OfficerList
                        SET officer_employment_job_title = ?,
                            officer_employment_department = ?,
                            officer_employment_start_date = ?,
                            officer_employment_history = ?
                        WHERE officer_badge_number = ?
                    """, (requested_data.get("job_title"), requested_data.get("department"),
                          requested_data.get("start_date"), updated_history_str, target_badge))
            elif change_type == "Personal":
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_first_name = ?,
                        officer_middle_name = ?,
                        officer_last_name = ?,
                        officer_birthday = ?,
                        officer_gender = ?,
                        officer_nationality = ?
                    WHERE officer_badge_number = ?
                """, (
                    requested_data.get("first_name"), requested_data.get("middle_name"),
                    requested_data.get("last_name"),
                    requested_data.get("birthday"), requested_data.get("gender"), requested_data.get("nationality"),
                    target_badge))
            elif change_type == "ProfilePicture":
                pending_path = requested_data.get("pending_avatar_path")
                if pending_path:
                    filename = pending_path.split("/upload/")[-1]
                    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'png'

                    # Delete any existing official avatar files for this target badge
                    for existing_ext in ['png', 'jpg', 'jpeg', 'gif']:
                        old_file = os.path.join(app.config['UPLOAD_FOLDER'], f"avatar_{target_badge}.{existing_ext}")
                        if os.path.exists(old_file):
                            try:
                                os.remove(old_file)
                            except:
                                pass

                    pending_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    official_file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"avatar_{target_badge}.{ext}")
                    if os.path.exists(pending_file_path):
                        try:
                            import shutil
                            shutil.copy(pending_file_path, official_file_path)
                            os.remove(pending_file_path)  # Clean up the pending file after copy
                        except Exception as e:
                            print("Error copying avatar:", e)
            else:
                cursor.execute("""
                    UPDATE AcciTrack_OfficerList
                    SET officer_primary_email = ?,
                        officer_secondary_email = ?,
                        officer_work_phone = ?,
                        officer_mobile_phone = ?,
                        officer_primary_contact_name = ?,
                        officer_primary_contact_phone_number = ?,
                        officer_primary_contact_relationship = ?,
                        officer_secondary_contact_name = ?,
                        officer_secondary_contact_phone_number = ?,
                        officer_secondary_contact_relationship = ?
                    WHERE officer_badge_number = ?
                """, (requested_data.get("email"), requested_data.get("sec_email"), requested_data.get("work_phone"),
                      requested_data.get("mobile_phone"), requested_data.get("emerg_name"),
                      requested_data.get("emerg_phone"),
                      requested_data.get("emerg_rel"), requested_data.get("emerg_name2"),
                      requested_data.get("emerg_phone2"),
                      requested_data.get("emerg_rel2"),
                      target_badge))

            cursor.execute("UPDATE AcciTrack_ProfileChanges SET status = 'approved' WHERE id = ?", (request_id,))
            conn.commit()
            conn.close()

            # Audit Log: Admin reviews and approves profile change request
            log_security_event(admin_badge, "Profile Change Approved",
                               f"Admin (Badge: {admin_badge}) approved a {change_type} profile change proposed by Badge #{target_badge}")
            return "Success"
        else:
            if change_type == "ProfilePicture":
                pending_path = requested_data.get("pending_avatar_path")
                if pending_path:
                    filename = pending_path.split("/upload/")[-1]
                    pending_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    if os.path.exists(pending_file_path):
                        try:
                            os.remove(pending_file_path)
                        except:
                            pass
            cursor.execute("UPDATE AcciTrack_ProfileChanges SET status = 'rejected' WHERE id = ?", (request_id,))

            # Audit Log: Admin reviews and rejects profile change request
            log_security_event(admin_badge, "Profile Change Rejected",
                               f"Admin (Badge: {admin_badge}) rejected a pending {change_type} profile change proposed by Badge #{target_badge}")

        conn.commit()
        conn.close()
        return "Success"
    except Exception as e:
        print("Error reviewing profile change:", e)
        return "Fail"


# --- ONBOARDING SYSTEM HANDLERS ---
@app.route('/check-onboarding', methods=["GET", "POST"])
def check_onboarding():
    if session.get("logged_in", "no") == "no":
        return "no"
    badge = session.get("badge_number")
    try:
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("SELECT account_status FROM AcciTrack_SecuritySettings WHERE badge_number = ?", (badge,))
        row = cursor.fetchone()
        conn.close()
        if row and row[0] == 'New':
            return "yes"
    except Exception as e:
        print("Error checking onboarding status:", e)
    return "no"


@app.route('/complete-onboarding', methods=["POST"])
def complete_onboarding():
    if session.get("logged_in", "no") == "no":
        return "Unauthorized"
    badge = session.get("badge_number")
    try:
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        cursor.execute("UPDATE AcciTrack_SecuritySettings SET account_status = 'Active' WHERE badge_number = ?",
                       (badge,))
        conn.commit()
        conn.close()

        # Detailed Security Log entry for completing onboarding
        log_security_event(badge, "Onboarding Completed",
                           f"New user Badge #{badge} completed initial onboarding setup and accessed the system.")
        return "Success"
    except Exception as e:
        print("Error completing onboarding status:", e)
        return "Fail"


# --- SEED SECURITY TABLES ---
def seed_security_tables():
    try:
        conn = sqlite3.connect("AcciTrack.db")
        cursor = conn.cursor()
        # Ensure table schemas exist (Set default 2FA status to 'no' for new tables)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS AcciTrack_SecuritySettings (
                badge_number TEXT PRIMARY KEY,
                tfa_enabled TEXT DEFAULT 'no',
                login_notifications TEXT DEFAULT 'yes',
                activity_logs_enabled TEXT DEFAULT 'yes',
                backup_codes TEXT DEFAULT '4829-1746,7391-2058,1567-8932,6041-5279,9283-4165',
                account_status TEXT DEFAULT 'Active'
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS AcciTrack_AccessHistory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge_number TEXT,
                device TEXT,
                location TEXT,
                timestamp TEXT,
                is_current TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS AcciTrack_SecurityLogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge_number TEXT,
                event_type TEXT,
                details TEXT,
                timestamp TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS AcciTrack_Certifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge_number TEXT,
                cert_name TEXT,
                issuing_org TEXT,
                issued_date TEXT,
                expiry_date TEXT,
                file_path TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS AcciTrack_ProfileChanges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                badge_number TEXT,
                change_type TEXT,
                requested_data TEXT,
                timestamp TEXT,
                status TEXT DEFAULT 'pending'
            )
        """)
        conn.commit()

        cursor.execute("SELECT 1 FROM AcciTrack_SecuritySettings WHERE badge_number = '2'")
        if not cursor.fetchone():
            admin_codes = generate_unique_backup_codes()
            cursor.execute("""
                INSERT INTO AcciTrack_SecuritySettings (badge_number, tfa_enabled, login_notifications, activity_logs_enabled, backup_codes, account_status)
                VALUES ('2', 'no', 'yes', 'yes', ?, 'Active')
            """, (admin_codes,))
            cursor.execute("""
                INSERT INTO AcciTrack_AccessHistory (badge_number, device, location, timestamp, is_current)
                VALUES 
                ('2', 'Windows PC', 'Headquarters', 'Dec 8, 2024 • 08:00 PM', 'yes'),
                ('2', 'Windows PC', 'Headquarters', 'Dec 7, 2024 • 11:32 AM', 'no')
            """)
            cursor.execute("""
                INSERT INTO AcciTrack_SecurityLogs (badge_number, event_type, details, timestamp)
                VALUES ('2', 'Successful Login', 'Logged in via Windows PC at Headquarters', 'Dec 8, 2024 • 08:30 AM')
            """)
        else:
            # Self-healing: Force Admin 2 tfa_enabled to 'no' to prevent users from getting locked out on their first login
            cursor.execute("UPDATE AcciTrack_SecuritySettings SET tfa_enabled = 'no' WHERE badge_number = '2'")

        cursor.execute("SELECT 1 FROM AcciTrack_SecuritySettings WHERE badge_number = '1'")
        if not cursor.fetchone():
            officer_codes = generate_unique_backup_codes()
            cursor.execute("""
                INSERT INTO AcciTrack_SecuritySettings (badge_number, tfa_enabled, login_notifications, activity_logs_enabled, backup_codes, account_status)
                VALUES ('1', 'no', 'yes', 'yes', ?, 'Active')
            """, (officer_codes,))
            cursor.execute("""
                INSERT INTO AcciTrack_AccessHistory (badge_number, device, location, timestamp, is_current)
                VALUES 
                ('1', 'Android Mobile', 'Patrol Zone A', 'Dec 8, 2024 • 07:15 AM', 'yes')
            """)
            cursor.execute("""
                INSERT INTO AcciTrack_SecurityLogs (badge_number, event_type, details, timestamp)
                VALUES 
                ('1', 'Successful Login', 'Logged in via Android Mobile', 'Dec 8, 2024 • 07:15 AM')
            """)

        conn.commit()
        conn.close()
    except Exception as e:
        print("Error seeding security tables:", e)


# --- DYNAMIC DB SEEDER ---
def seed_custom_users():
    """Checks existing entries and safely seeds Admin Mejiro and Officer Manhattan if they do not exist."""
    try:
        existing_officers = db.get_table_values("AcciTrack", "AcciTrack_OfficerList")

        existing_badges = [str(officer[9]) for officer in existing_officers]
        existing_usernames = [str(officer[30]) for officer in existing_officers]

        # 1. Officer Manhattan (cafe1030, Badge: 1, Password: Manhattan@2026, is_admin: no)
        if "1" not in existing_badges and "cafe1030" not in existing_usernames:
            officer_data = [
                {"officer_first_name": "Manhattan"},
                {"officer_middle_name": ""},
                {"officer_last_name": "Officer"},
                {"officer_preferred_name": "Manhattan"},
                {"officer_birthday": "01/01/1995"},
                {"officer_gender": "Male"},
                {"officer_nationality": "Philippines"},
                {"officer_blood_type": "O+"},
                {"officer_employee_id": "EMP-2026-001"},
                {"officer_badge_number": "1"},
                {"officer_social_security_number": "N/A"},
                {"officer_primary_email": "manhattan@accitrack.com"},
                {"officer_secondary_email": ""},
                {"officer_work_phone": "+63 2 8123 4567"},
                {"officer_mobile_phone": "+63 915 123 4567"},
                {"officer_primary_contact_name": "Emergency Contact"},
                {"officer_primary_contact_phone_number": ""},
                {"officer_primary_contact_relationship": "Family"},
                {"officer_secondary_contact_name": ""},
                {"officer_secondary_contact_phone_number": ""},
                {"officer_secondary_contact_relationship": ""},
                {"officer_employment_job_title": "Police Officer"},
                {"officer_employment_department": "Patrol"},
                {"officer_employment_type": "Full Time"},
                {"officer_employment_start_date": "01/15/2020"},
                {"officer_employment_reporting_officer": "Chief Police Officer"},
                {"officer_employment_work_location": "Main Precinct HQ"},
                {"officer_employment_history": ""},
                {"officer_document_list": ""},
                {"officer_pin": "Manhattan@2026"},  # Seeded with complex password
                {"officer_username": "cafe1030"},
                {"officer_is_admin": "no"}
            ]
            db.insert_to_table("AcciTrack", "AcciTrack_OfficerList", officer_data)
            print("[AcciTrack] Seeded Officer Manhattan (cafe1030)")

        # 2. Admin Mejiro (oogabooga, Badge: 2, Password: McQueen#2026, is_admin: yes)
        if "2" not in existing_badges and "oogabooga" not in existing_usernames:
            admin_data = [
                {"officer_first_name": "Mejiro"},
                {"officer_middle_name": "Goldship"},
                {"officer_last_name": "McQueen"},
                {"officer_preferred_name": "Mejiro"},
                {"officer_birthday": "04/03/1987"},
                {"officer_gender": "Female"},
                {"officer_nationality": "Japan"},
                {"officer_blood_type": "O+"},
                {"officer_employee_id": "EMP-2020-135"},
                {"officer_badge_number": "2"},
                {"officer_social_security_number": "N/A"},
                {"officer_primary_email": "mejiromc125@gmail.com"},  # Updated default seeded email address
                {"officer_secondary_email": ""},
                {"officer_work_phone": "+63 2 8123 4567"},
                {"officer_mobile_phone": "+63 (915) 870-2185"},
                {"officer_primary_contact_name": "Tokai Teio"},
                {"officer_primary_contact_phone_number": "+63 (905) 421-8900"},
                {"officer_primary_contact_relationship": "Spouse"},
                {"officer_secondary_contact_name": ""},
                {"officer_secondary_contact_phone_number": ""},
                {"officer_secondary_contact_relationship": ""},
                {"officer_employment_job_title": "Chief Administrator"},
                {"officer_employment_department": "Administrative Operations"},
                {"officer_employment_type": "Full Time"},
                {"officer_employment_start_date": "06/18/2013"},
                {"officer_employment_reporting_officer": "Police Commissioner"},
                {"officer_employment_work_location": "Headquarters – 4th Floor"},
                {"officer_employment_history": "Operation (Mon-Sat, 07:00–18:00)"},
                {"officer_document_list": ""},
                {"officer_pin": "McQueen#2026"},  # Seeded with complex password
                {"officer_username": "oogabooga"},
                {"officer_is_admin": "yes"}
            ]
            db.insert_to_table("AcciTrack", "AcciTrack_OfficerList", admin_data)
            print("[AcciTrack] Seeded Admin Mejiro (oogabooga)")
        else:
            # Self-healing migration to update any existing Mejiro email address in SQLite
            conn = sqlite3.connect("AcciTrack.db")
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE AcciTrack_OfficerList 
                SET officer_primary_email = 'mejiromc125@gmail.com' 
                WHERE officer_badge_number = '2' AND officer_primary_email = 'MejiroMcqueen@gmail.com'
            """)
            conn.commit()
            conn.close()

    except Exception as e:
        print(f"[AcciTrack] Seeding validation check failed: {e}")


if "__main__" == __name__:
    if not os.path.exists("AcciTrack.db"):
        db.create_table("AcciTrack", "AcciTrack_OfficerList", officer_columns)
        db.create_table("AcciTrack", "AcciTrack_TaskList", task_columns)
        db.create_table("AcciTrack", "AcciTrack_ReportList", report_columns)

    seed_custom_users()
    seed_security_tables()

    app.run(host="0.0.0.0", port=5000, debug=True)