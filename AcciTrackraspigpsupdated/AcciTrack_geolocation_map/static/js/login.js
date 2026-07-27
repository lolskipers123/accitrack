const separator_string = "[sprtr_str]";
let login2faBadge = ""; // Cache badge number for Two-Factor login route validation

// Input filtering configuration for login assets
document.addEventListener("DOMContentLoaded", () => {
    // Restrict standard badge inputs to purely numeric characters
    const badgeInputs = ["badgeNumber", "backupBadge", "emailBadge"];
    badgeInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", function() {
                this.value = this.value.replace(/[^0-9]/g, "");
            });
        }
    });

    // Restrict emergency backup code to digits and hyphens
    const backupCodeInput = document.getElementById("backupCodeInput");
    if (backupCodeInput) {
        backupCodeInput.addEventListener("input", function() {
            this.value = this.value.replace(/[^0-9\-]/g, "");
        });
    }

    // Restrict security OTP verification fields to digits
    const otpInputs = ["login2faCode", "emailCode"];
    otpInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", function() {
                this.value = this.value.replace(/[^0-9]/g, "");
            });
        }
    });

    // Restrict all password fields to prevent spaces entirely
    const passwordFields = ["officerPin", "backupNewPin", "backupConfirmPin", "emailNewPin", "emailConfirmPin"];
    passwordFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", function() {
                this.value = this.value.replace(/\s/g, "");
            });
        }
    });
});

// Small helper: show/hide an inline warning box (used instead of native alert()
// popups so recovery errors appear inside the blue modal UI, not a browser dialog)
function showInlineWarning(elementId, message, icon = "fa-triangle-exclamation") {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    el.style.display = "flex";
}

function hideInlineWarning(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.style.display = "none";
    el.innerHTML = "";
}

// Open/Close Account Recovery Overlay Controls
function openForgotModal() {
    document.getElementById("forgotModal").style.display = "flex";
    switchRecoveryTab('backup'); // Defaults on Backup recovery view when opened
}

function closeForgotModal() {
    document.getElementById("forgotModal").style.display = "none";

    // Clear Backup recovery forms
    document.getElementById("backupBadge").value = "";
    document.getElementById("backupCodeInput").value = "";
    document.getElementById("backupNewPin").value = "";
    document.getElementById("backupConfirmPin").value = "";

    // Clear Email recovery forms
    document.getElementById("emailBadge").value = "";
    document.getElementById("emailInput").value = "";
    document.getElementById("emailCode").value = "";
    document.getElementById("emailNewPin").value = "";
    document.getElementById("emailConfirmPin").value = "";

    // Reset view steps
    document.getElementById("emailStep1").style.display = "block";
    document.getElementById("emailStep2").style.display = "none";

    // Clear any lingering inline warnings
    hideInlineWarning("backupWarning");
    hideInlineWarning("emailStep1Warning");
    hideInlineWarning("emailStep2Warning");
}

// Open/Close Login Two-Factor Authentication Modal
function openLogin2faModal() {
    document.getElementById("login2faModal").style.display = "flex";
    hideInlineWarning("login2faWarning");
}

function closeLogin2faModal() {
    document.getElementById("login2faModal").style.display = "none";
    document.getElementById("login2faCode").value = "";
    login2faBadge = "";
    hideInlineWarning("login2faWarning");
}

// Switching tab selector views
function switchRecoveryTab(tab) {
    hideInlineWarning("backupWarning");
    hideInlineWarning("emailStep1Warning");
    hideInlineWarning("emailStep2Warning");

    const tabBackup = document.getElementById("tabBackup");
    const tabEmail = document.getElementById("tabEmail");
    const backupView = document.getElementById("recoveryBackupView");
    const emailView = document.getElementById("recoveryEmailView");

    if (tab === "backup") {
        tabBackup.style.color = "#3b82f6";
        tabBackup.style.borderBottom = "2px solid #3b82f6";
        tabEmail.style.color = "#94a3b8";
        tabEmail.style.borderBottom = "none";
        backupView.style.display = "block";
        emailView.style.display = "none";
    } else {
        tabEmail.style.color = "#3b82f6";
        tabEmail.style.borderBottom = "2px solid #3b82f6";
        tabBackup.style.color = "#94a3b8";
        tabBackup.style.borderBottom = "none";
        backupView.style.display = "none";
        emailView.style.display = "block";
    }
}

// Global form and event handler system
document.addEventListener('submit', e => {

    // 0. OFFICER/ADMIN LOGIN FORM SUBMISSION (AJAX)
    if (e.target.id === 'officerLogin') {
        e.preventDefault();
        const username = document.getElementById("username").value.trim();
        const badgeNumber = document.getElementById("badgeNumber").value.trim();
        const officerPin = document.getElementById("officerPin").value.trim();

        const warningDiv = document.getElementById("loginWarning");
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        // Reset previous warning states
        warningDiv.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in...";

        fetch(`/log-in?username=${encodeURIComponent(username)}&badgeNumber=${encodeURIComponent(badgeNumber)}&officerPin=${encodeURIComponent(officerPin)}`)
        .then(res => res.text())
        .then(data => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;

            // Handle script redirections gracefully, alert errors, lockout states, or prompt for 2FA validation
            if (data.startsWith("2fa_required")) {
                login2faBadge = data.split(separator_string)[1];
                openLogin2faModal();
            } else if (data.startsWith("lockout")) {
                const remaining = data.split(separator_string)[1];
                warningDiv.innerHTML = `<i class="fa-solid fa-clock"></i> Suspicious login attempts detected. Login for this account is suspended. Try again in ${remaining} seconds.`;
                warningDiv.style.display = "flex";
            } else if (data.includes('window.location.href="admin"')) {
                window.location.href = "admin";
            } else if (data.includes('window.location.href="client"')) {
                window.location.href = "client";
            } else if (data.includes('deactivated')) {
                warningDiv.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> This account has been deactivated by an Administrator.`;
                warningDiv.style.display = "flex";
            } else if (data.includes('User does not exist')) {
                warningDiv.innerHTML = `<i class="fa-solid fa-user-xmark"></i> User account does not exist.`;
                warningDiv.style.display = "flex";
            } else {
                // Catches Exception raises ("Incorrect username", "Incorrect badge number", "Incorrect password" Pin, etc.)
                warningDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Incorrect username, badge number, or password.`;
                warningDiv.style.display = "flex";
            }
        })
        .catch(err => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            console.error("Login attempt network error:", err);
            warningDiv.innerHTML = `<i class="fa-solid fa-wifi"></i> Connection failed. Please check network.`;
            warningDiv.style.display = "flex";
        });
    }

    // 1. TWO-FACTOR AUTHENTICATION LOGIN SUBMISSION
    if (e.target.id === 'login2faForm') {
        e.preventDefault();
        const code = document.getElementById("login2faCode").value.trim();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;

        hideInlineWarning("login2faWarning");

        if (!code) {
            showInlineWarning("login2faWarning", "Please enter the 6-digit verification code.");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Verifying...";

        fetch(`/verify-login-2fa?badgeNumber=${encodeURIComponent(login2faBadge)}&code=${encodeURIComponent(code)}`, {
            method: "POST"
        })
        .then(res => res.text())
        .then(data => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;

            if (data.includes('window.location.href="admin"')) {
                window.location.href = "admin";
            } else if (data.includes('window.location.href="client"')) {
                window.location.href = "client";
            } else {
                showInlineWarning("login2faWarning", data);
            }
        })
        .catch(err => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            console.error("2FA validation error:", err);
            showInlineWarning("login2faWarning", "Network connection error. Please try again.", "fa-wifi");
        });
    }

    // 2. BACKUP CODE PASSWORD RESET SUBMISSION
    if (e.target.id === 'backupCodeForm') {
        e.preventDefault();
        const badge = document.getElementById('backupBadge').value.trim();
        const code = document.getElementById('backupCodeInput').value.trim();
        const newPin = document.getElementById('backupNewPin').value.trim();
        const confirmPin = document.getElementById('backupConfirmPin').value.trim();

        hideInlineWarning("backupWarning");

        if (!badge) {
            showInlineWarning("backupWarning", "Please enter your badge number.");
            return;
        }

        if (!code) {
            showInlineWarning("backupWarning", "Please enter your emergency backup code.");
            return;
        }

        // Strict Password Complexity Constraints check
        const minLength = 8;
        const hasUppercase = /[A-Z]/.test(newPin);
        const hasNumber = /[0-9]/.test(newPin);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPin);
        const isLong = newPin.length >= minLength;

        if (!isLong || !hasUppercase || !hasNumber || !hasSpecialChar) {
            showInlineWarning("backupWarning", "Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character.");
            return;
        }

        if (newPin !== confirmPin) {
            showInlineWarning("backupWarning", "New password and confirmation password must match.");
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Resetting...";

        fetch(`/reset-pin-backup-code?badge=${encodeURIComponent(badge)}&code=${encodeURIComponent(code)}&newPin=${encodeURIComponent(newPin)}`, {
            method: "POST"
        })
        .then(res => res.text())
        .then(data => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;

            if (data === "Success") {
                const forgotContent = document.getElementById("forgotContent");
                forgotContent.innerHTML = `
                    <div class="modal-success">
                        <i class="fa-solid fa-circle-check" style="font-size: 48px; margin-bottom: 16px; color: #10b981;"></i>
                        <p style="font-weight: 700; font-size: 18px; margin-bottom: 8px;">Password Reset Successful!</p>
                        <p style="color: #94a3b8; font-size: 14px;">Your backup code has been consumed. You can now close this window and log in with your new password.</p>
                    </div>
                `;
            } else {
                // Surfaces backend messages like "Badge number not found",
                // "No backup codes found for this account", "Invalid backup code", etc.
                showInlineWarning("backupWarning", data);
            }
        })
        .catch(err => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            console.error("Account recovery error:", err);
            showInlineWarning("backupWarning", "Connection error. Could not reset password.", "fa-wifi");
        });
    }

    // 3. GMAIL 2FA RECOVERY: SEND CODE
    if (e.target.id === 'sendEmailForm') {
        e.preventDefault();
        const badge = document.getElementById('emailBadge').value.trim();
        const email = document.getElementById('emailInput').value.trim().toLowerCase();

        hideInlineWarning("emailStep1Warning");

        if (!badge) {
            showInlineWarning("emailStep1Warning", "Please enter your badge number.");
            return;
        }

        // Enforce that the input matches a valid gmail address domain
        if (!email.endsWith("@gmail.com")) {
            showInlineWarning("emailStep1Warning", "Recovery is limited strictly to Google Mail accounts (@gmail.com). Please provide a valid Gmail address.");
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending Code...";

        fetch(`/send-recovery-email?badge=${encodeURIComponent(badge)}&email=${encodeURIComponent(email)}`, {
            method: "POST"
        })
        .then(res => res.text())
        .then(data => {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Verification Code";

            if (data === "Success") {
                document.getElementById("emailStep1").style.display = "none";
                document.getElementById("emailStep2").style.display = "block";
            } else {
                // Surfaces backend messages like "Badge number not found in the system",
                // "Email address does not match our records for this badge number", etc.
                showInlineWarning("emailStep1Warning", data);
            }
        })
        .catch(err => {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Verification Code";
            console.error("Gmail OTP dispatch error:", err);
            showInlineWarning("emailStep1Warning", "Network connection error. Please try again.", "fa-wifi");
        });
    }

    // 4. GMAIL 2FA RECOVERY: VERIFY & RESET
    if (e.target.id === 'verifyEmailForm') {
        e.preventDefault();
        const badge = document.getElementById('emailBadge').value.trim();
        const code = document.getElementById('emailCode').value.trim();
        const newPin = document.getElementById('emailNewPin').value.trim();
        const confirmPin = document.getElementById('emailConfirmPin').value.trim();

        hideInlineWarning("emailStep2Warning");

        if (!code) {
            showInlineWarning("emailStep2Warning", "Please enter the 6-digit verification code sent to your email.");
            return;
        }

        // Strict Password Complexity Constraints check
        const minLength = 8;
        const hasUppercase = /[A-Z]/.test(newPin);
        const hasNumber = /[0-9]/.test(newPin);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPin);
        const isLong = newPin.length >= minLength;

        if (!isLong || !hasUppercase || !hasNumber || !hasSpecialChar) {
            showInlineWarning("emailStep2Warning", "Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character.");
            return;
        }

        if (newPin !== confirmPin) {
            showInlineWarning("emailStep2Warning", "New password and confirmation password must match.");
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Verifying...";

        fetch(`/verify-email-reset?badge=${encodeURIComponent(badge)}&code=${encodeURIComponent(code)}&newPin=${encodeURIComponent(newPin)}`, {
            method: "POST"
        })
        .then(res => res.text())
        .then(data => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;

            if (data === "Success") {
                const forgotContent = document.getElementById("forgotContent");
                forgotContent.innerHTML = `
                    <div class="modal-success">
                        <i class="fa-solid fa-circle-check" style="font-size: 48px; margin-bottom: 16px; color: #10b981;"></i>
                        <p style="font-weight: 700; font-size: 18px; margin-bottom: 8px;">Password Reset Successful!</p>
                        <p style="color: #94a3b8; font-size: 14px;">Your Gmail OTP verification succeeded. You may now close this window and log in with your new password.</p>
                    </div>
                `;
            } else {
                // Surfaces backend messages like "Invalid verification code", "Code has expired", etc.
                showInlineWarning("emailStep2Warning", data);
            }
        })
        .catch(err => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            console.error("OTP validation error:", err);
            showInlineWarning("emailStep2Warning", "Network connection error. Please try again.", "fa-wifi");
        });
    }
});