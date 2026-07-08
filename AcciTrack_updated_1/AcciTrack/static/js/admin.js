const separator_string = "[sprtr_str]";
let badgeNumber = "-1";
let hideDetailsGrid = false; // Incident layout view mode state variable
let unreadNotifications = 0;
let activeNotificationFilter = "all"; // Tracks current status filter across background polls

function checkSession(){
    try {
        let requestSession = new XMLHttpRequest();
        requestSession.open("GET", "/session", true);
        requestSession.onreadystatechange = function (){
            if (requestSession.status == 200 && requestSession.readyState == 4){
                let response = requestSession.responseText;
                if (response == "Not logged in."){
                    window.location.href = "login";
                } else {
                    badgeNumber = response.split(separator_string)[1];
                }
            }
        }
        requestSession.send();
    } catch (e){
    }
}

checkSession();

const hour = new Date().getHours();
document.getElementById("greeting").textContent = `${hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening"}`;

function updateClock() {
    const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const formatted = new Date(now).toLocaleDateString("en-PH", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "numeric", hour12: true
    }).replace(",", " •");
    document.getElementById("datetime").textContent = formatted;
}

updateClock();
setInterval(updateClock, 1000);

const accidentIcons = {
    "Minor Traffic Accident":                { icon: "fa-car-burst",        color: "#3b82f6" },
    "Reckless Driving":                      { icon: "fa-gauge-high",       color: "#f97316" },
    "DUI / DWI":                             { icon: "fa-wine-bottle",      color: "#ec4899" },
    "Hit & Run":                             { icon: "fa-person-running",   color: "#8b5cf6" },
    "Multi-Vehicle Pileup":                  { icon: "fa-car-crash",        color: "#dc2626" },
    "Reckless Imprudence Resulting in Homicide": { icon: "fa-skull-crossbones", color: "#991b1b" }
};

const accidentTypes = [
    { type: "Minor Traffic Accident",          icon: "fa-solid fa-car-burst",           color: "blue" },
    { type: "Reckless Driving",               icon: "fa-solid fa-gauge-high",          color: "#f97316" },
    { type: "DUI / DWI",                      icon: "fa-solid fa-wine-bottle",         color: "green" },
    { type: "Hit & Run",                      icon: "fa-solid fa-person-running",      color: "brown" },
    { type: "Multi-Vehicle Pileup",           icon: "fa-solid fa-car-crash",           color: "red" },
    { type: "Reckless Imprudence Resulting in Homicide", icon: "fa-solid fa-skull-crossbones", color: "black" }
];

let currentVideoURL = "";
let currentVideoFile = null;
let reportsToday = 0;
let reportsYesterday = 0;
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

// Initialization procedures
tabClick(0);
refreshTasks();
refreshReports();
refreshProfileData();
refreshDashboardStats();
updateProfilePendingBadges(); // Setup profile badge counts on load

function tabClick(index){
    let sections = document.getElementsByClassName('main');
    let tabs = document.querySelectorAll('.sidebar-menu .menu-item');
    for (let a = 0; a < sections.length; a++){
        if (a != index){
            if(tabs[a]) tabs[a].classList.remove("active");
            sections[a].style.display = "none";
        } else {
            if(tabs[a]) tabs[a].classList.add("active");
            sections[a].style.display = "block";
        }
    }

    const dropdown = document.getElementById("profileDropdown");
    if (dropdown) {
        dropdown.style.display = "none";
    }

    if (index === 0) {
        refreshDashboardStats();
    } else if (index === 1) {
        filterAdminIncidents();
    } else if (index === 2) {
        filterAdminReports();
    } else if (index === 3) {
        refreshProfileData();
    } else if (index === 4) {
        filterNotifications(activeNotificationFilter);
    } else if (index === 5) {
        refreshUsersList();
    }
}

function openTaskModal(){
    document.getElementById("taskModal").style.display = "flex";
}

function closeTaskModal(){
    document.getElementById("taskModal").style.display = "none";
}

function addTask(){
    const titleInput = document.getElementById("taskTitle");
    const descInput = document.getElementById("taskDesc");
    const prioritySelect = document.getElementById("taskPriority");

    if (!titleInput.value.trim()) {
        showErrorModal("Input Required", "Please enter a task title first.", ["taskTitle"]);
        return;
    }
    fetch(`/add-task?title=${encodeURIComponent(titleInput.value.trim())}&description=${encodeURIComponent(descInput.value.trim())}&priority=${encodeURIComponent(prioritySelect.value || "low")}`, {
        method: "POST"
    })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            refreshTasks();
            titleInput.value = "";
            descInput.value = "";
            document.getElementById("taskModal").style.display = "none";
        }
    });
}

function refreshTasks(){
    fetch("/get-tasks", { method: "POST" })
    .then(res => res.json())
    .then(tasks => {
        const taskList = document.getElementById("taskList");
        if (!taskList) return;
        taskList.innerHTML = "";
        let task_counter = 0;
        tasks.forEach((task) => {
            const taskId = task[0];
            const title = task[1];
            const desc = task[2];
            const priority = task[3];
            const taskHTML = `
                <div class="task-item ${priority}" id="task-${taskId}">
                    <i class="fa-solid fa-circle-dot"></i>
                    <div class="task-content">
                        <strong>${title}</strong>
                        <small>${desc || "No details added"}</small>
                    </div>
                    ${priority === "high" ? '<span class="task-badge">URGENT</span>' : ""}
                    <button class="delete-task-btn" title="Delete task" onclick="deleteTask(${taskId})">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
            taskList.insertAdjacentHTML("afterbegin", taskHTML);
            task_counter++;
        });
        const taskCountEl = document.getElementById("taskCount");
        if (taskCountEl) taskCountEl.textContent = task_counter;
    });
}

function deleteTask(taskId){
    fetch(`/delete-task?id=${taskId}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            refreshTasks();
        } else {
            showErrorModal("Transaction Failed", "Failed to delete the selected task.");
        }
    })
    .catch(err => console.error("Error deleting task:", err));
}

function logout(){
    window.location.href = "logout";
}

function getTimeDifference(start, idEnd) {
    let end = idEnd || new Date();
    if (!start || isNaN(start.getTime())) return "Recently";
    let diff = Math.abs(end - start);
    if (diff < 60000) return "Just now";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    diff -= days * (1000 * 60 * 60 * 24);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    diff -= hours * (1000 * 60 * 60);
    const mins = Math.floor(diff / (1000 * 60));
    diff -= mins * (1000 * 60);
    const seconds = Math.floor(diff / 1000);
    return `${days}d ${hours}h ${mins}m ${seconds}s`;
}

function formatTimeAgo(start, end) {
    const result = getTimeDifference(start, end);
    return result === "Just now" || result === "Recently" ? result : `${result} ago`;
}

function cleanDateString(dateStr) {
    if (!dateStr || dateStr === "Invalid Date" || dateStr === "none" || dateStr === "null") {
        const now = new Date();
        return now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return dateStr;
}

function parseDateSafely(report) {
    if (!report) return new Date();
    let dateStr = report[12] || report[2] || "";
    if (!dateStr || dateStr === "none" || dateStr === "Invalid Date") return new Date();
    let cleanStr = String(dateStr).replace("•", "").replace(/\s+/g, " ").trim();
    let timestamp = Date.parse(cleanStr);
    if (isNaN(timestamp)) {
        return new Date();
    }
    return new Date(timestamp);
}

function ensureNotificationModalMarkup() {
    let modal = document.getElementById("notificationModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "notificationModal";
        modal.className = "modal-overlay";
        modal.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(12px);
            z-index: 20000;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; width: 90%; max-width: 600px; overflow: hidden; box-shadow: 0 25px 70px rgba(0,0,0,0.55); position: relative; display: flex; flex-direction: column;">
            <div class="modal-header" style="padding: 24px 32px; display: flex; align-items: center; gap: 18px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #0b2c66; color: white;">
                <div id="modalIcon" class="modal-icon-large" style="width: 60px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; background: rgba(255,255,255,0.1); flex-shrink: 0;"></div>
                <div style="flex: 1; text-align: left;">
                    <h2 id="modalTitle" style="font-size: 19px; font-weight: 800; color: white; margin: 0;">Report Details</h2>
                    <span id="modalStatus" style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 6px; letter-spacing: 0.5px;"></span>
                </div>
                <button onclick="window.closeNotificationModal()" style="all: unset; position: absolute; top: 20px; right: 24px; font-size: 32px; color: #94a3b8; cursor: pointer; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='white'"
                        onmouseout="this.style.background='transparent'; this.style.color='#94a3b8'">&times;</button>
            </div>
            <div class="modal-body" style="padding: 32px; color: #cbd5e1; display: flex; flex-direction: column; overflow-y: auto; max-height: 65vh; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <div id="modalDetails"></div>
            </div>
            <div class="modal-footer" style="padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; background: #1e293b;">
                <div style="display: flex; gap: 12px;">
                    <button class="btn-cancel" id="btnPrintNotification" style="background: #334155; color: white; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 10px; cursor: pointer; border: none; transition: 0.2s;" onmouseover="this.style.background='#475569'" onmouseout="this.style.background='#334155'">
                        <i class="fa-solid fa-print"></i> Print Report
                    </button>
                </div>
                <button onclick="window.closeNotificationModal()" style="background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">Close</button>
            </div>
        </div>
    `;
    return modal;
}

window.closeNotificationModal = function() {
    const modal = document.getElementById("notificationModal");
    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
    }
};

window.goToReportFromNotification = function(caseNum) {
    window.closeNotificationModal();
    const report = window.myReports.find(r => r[0] === caseNum);
    if (report) {
        tabClick(2); // Instantly switches to the Reports tab
        openReportDetailModal(report); // Reveals details drawer
    } else {
        console.error("Report not found for case:", caseNum);
    }
};

window.printNotificationReport = function(caseNum) {
    const report = window.myReports.find(r => r[0] === caseNum);
    if (!report) return;

    let case_num = report[0];
    let submitting_officer = report[1];
    let submitting_datetime = cleanDateString(report[12] || report[2]);
    let location = report[3];
    let type = report[4];
    let status = report[5];
    let reviewing_officer = report[7];
    let reviewing_datetime = cleanDateString(report[8]);
    let reviewing_reason = report[9];

    const isReviewed = status !== "pending";

    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
        <html>
        <head>
            <title>AcciTrack Summary Report - ${case_num}</title>
            <style>
                body {
                    font-family: 'Inter', Arial, sans-serif;
                    color: #1e293b;
                    padding: 40px;
                    line-height: 1.6;
                }
                .header {
                    border-bottom: 2px solid #e2e8f0;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .logo-section h1 {
                    margin: 0;
                    font-size: 28px;
                    color: #0b2c66;
                    font-weight: 800;
                }
                .logo-section p {
                    margin: 4px 0 0;
                    color: #64748b;
                    font-size: 14px;
                }
                .report-title {
                    font-size: 22px;
                    font-weight: 700;
                    margin-bottom: 20px;
                    color: #0f172a;
                }
                .details-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                }
                .details-table th, .details-table td {
                    padding: 12px 16px;
                    text-align: left;
                    border-bottom: 1px solid #f1f5f9;
                }
                .details-table th {
                    background: #f8fafc;
                    color: #475569;
                    font-weight: 600;
                    width: 240px;
                }
                .details-table td {
                    color: #0f172a;
                    font-weight: 500;
                }
                .status-badge {
                    display: inline-block;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .status-badge.approved { background: #dcfce7; color: #15803d; }
                .status-badge.denied { background: #fee2e2; color: #b91c1c; }
                .status-badge.changes_requested { background: #eff6ff; color: #2563eb; }
                .status-badge.pending { background: #fef3c7; color: #92400e; }
                .footer {
                    margin-top: 50px;
                    font-size: 12px;
                    color: #94a3b8;
                    text-align: center;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo-section">
                    <h1>AcciTrack Summary Report</h1>
                    <p>Philippine National Police Command Center</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-weight: bold; color: #0b2c66;">CASE REF: ${case_num}</p>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Generated on: ${new Date().toLocaleString()}</p>
                </div>
            </div>

            <div class="report-title">Incident Analysis Summary</div>

            <table class="details-table">
                <tr>
                    <th>Type of Accident</th>
                    <td>${type}</td>
                </tr>
                <tr>
                    <th>Submitting Officer</th>
                    <td>${submitting_officer}</td>
                </tr>
                <tr>
                    <th>Location of Incident</th>
                    <td>${location}</td>
                </tr>
                <tr>
                    <th>Date & Time of Incident</th>
                    <td>${submitting_datetime}</td>
                </tr>
                <tr>
                    <th>Verification Status</th>
                    <td>
                        <span class="status-badge ${status}">${status.replace("_", " ").toUpperCase()}</span>
                    </td>
                </tr>
                <tr>
                    <th>Reviewing Officer</th>
                    <td>${isReviewed && reviewing_officer !== "none" ? reviewing_officer : "Pending Admin Assignment"}</td>
                </tr>
                <tr>
                    <th>Review Date & Time</th>
                    <td>${isReviewed && reviewing_datetime !== "none" && reviewing_datetime !== "Invalid Date" ? reviewing_datetime : "Pending Admin Review"}</td>
                </tr>
                <tr>
                    <th>Review Decision Reason</th>
                    <td>${isReviewed && reviewing_reason !== "none" ? reviewing_reason : "No notes documented yet"}</td>
                </tr>
            </table>

            <div class="footer">
                This document is a computer-generated official summary of the AcciTrack Incident Registry.<br>
                Philippine National Police AcciTrack Registry.
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

function getAdminReadReports() {
    try {
        return JSON.parse(localStorage.getItem("admin_read_reports") || "[]");
    } catch (e) {
        return [];
    }
}

function markReportAsReadByAdmin(caseNum) {
    try {
        let readList = getAdminReadReports();
        if (!readList.includes(caseNum)) {
            readList.push(caseNum);
            localStorage.setItem("admin_read_reports", JSON.stringify(readList));
        }
    } catch (e) {
        console.error("Error writing read state to localStorage:", e);
    }
}

function openNotificationModal(report) {
    const modal = ensureNotificationModalMarkup();
    const title = document.getElementById("modalTitle");
    const statusEl = document.getElementById("modalStatus");
    const icon = document.getElementById("modalIcon");
    const details = document.getElementById("modalDetails");

    let case_num = report[0];
    let submitting_officer = report[1];
    let submitting_datetime = cleanDateString(report[2]);
    let location = report[3];
    let type = report[4];
    let status = report[5];
    let video = report[6];
    let reviewing_officer = report[7];
    let reviewing_datetime = cleanDateString(report[8]);
    let reviewing_reason = report[9];
    let realdatetime = cleanDateString(report[12]);

    title.textContent = type;

    let statusColor = "#f59e0b"; // Pending (Orange)
    let statusBg = "rgba(245, 158, 11, 0.1)";
    let statusBorder = "#f59e0b";
    let statusText = "PENDING REVIEW";
    let statusIcon = "fa-clock";
    let feedbackHTML = "";

    if (status === "approved") {
        statusColor = "#10b981"; // Approved (Green)
        statusBg = "rgba(16, 185, 129, 0.08)";
        statusBorder = "#10b981";
        statusText = "APPROVED";
        statusIcon = "fa-circle-check";
        feedbackHTML = `
            <div style="background: rgba(16, 185, 129, 0.08); border-left: 5px solid #10b981; padding: 20px; border-radius: 12px; margin-top: 24px; text-align: left;">
                <strong style="color: #10b981; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-check"></i> Approved by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Admin'}
                </strong>
                <p style="color: #cbd5e1; margin: 8px 0 0; font-size: 14.5px; line-height: 1.5; font-style: italic;">
                    "${reviewing_reason && reviewing_reason !== 'none' ? reviewing_reason : 'No decision notes documented.'}"
                </p>
                <small style="color: #94a3b8; display: block; margin-top: 10px; font-size: 12.5px;">
                    Reviewed on: ${reviewing_datetime} by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Chief Administrator'}
                </small>
            </div>
        `;
    } else if (status === "denied") {
        statusColor = "#ef4444"; // Denied (Red)
        statusBg = "rgba(239, 68, 68, 0.08)";
        statusBorder = "#ef4444";
        statusText = "DENIED";
        statusIcon = "fa-circle-xmark";
        feedbackHTML = `
            <div style="background: rgba(239, 68, 68, 0.08); border-left: 5px solid #ef4444; padding: 20px; border-radius: 12px; margin-top: 24px; text-align: left;">
                <strong style="color: #ef4444; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-xmark"></i> Denied by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Admin'}
                </strong>
                <p style="color: #cbd5e1; margin: 8px 0 0; font-size: 14.5px; line-height: 1.5; font-style: italic;">
                    "${reviewing_reason && reviewing_reason !== 'none' ? reviewing_reason : 'No explanation provided.'}"
                </p>
                <small style="color: #94a3b8; display: block; margin-top: 10px; font-size: 12.5px;">
                    Reviewed on: ${reviewing_datetime} by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Chief Administrator'}
                </small>
            </div>
        `;
    } else if (status === "changes_requested") {
        statusColor = "#2563eb"; // Vibrant Blue
        statusBg = "rgba(37, 99, 235, 0.08)";
        statusBorder = "#2563eb";
        statusText = "REVISIONS REQUESTED";
        statusIcon = "fa-triangle-exclamation";
        feedbackHTML = `
            <div style="background: rgba(37, 99, 235, 0.08); border-left: 5px solid #2563eb; padding: 20px; border-radius: 12px; margin-top: 24px; text-align: left;">
                <strong style="color: #2563eb; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Revisions Requested by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Admin'}
                </strong>
                <p style="color: #cbd5e1; margin: 8px 0 0; font-size: 14.5px; line-height: 1.5; font-style: italic;">
                    "${reviewing_reason && reviewing_reason !== 'none' ? reviewing_reason : 'Please review and resubmit details.'}"
                </p>
                <small style="color: #94a3b8; display: block; margin-top: 10px; font-size: 12.5px;">
                    Requested on: ${reviewing_datetime} by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Chief Administrator'}
                </small>
            </div>
        `;
    } else {
        feedbackHTML = `
            <div style="background: rgba(245, 158, 11, 0.08); border-left: 5px solid #f59e0b; padding: 20px; border-radius: 12px; margin-top: 24px; text-align: left;">
                <strong style="color: #f59e0b; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-clock"></i> Waiting for Admin Verification
                </strong>
                <p style="color: #cbd5e1; margin: 8px 0 0; font-size: 14.5px; line-height: 1.5;">
                    This report is currently in the queue. You will be notified here once an Administrator reviews your submission.
                </p>
            </div>
        `;
    }

    const accident = accidentTypes.find(a => a.type === type) || accidentTypes[0];
    icon.innerHTML = `<i class="fa-solid ${accident.icon}" style="color: ${accident.color};"></i>`;

    statusEl.innerHTML = `<i class="fa-solid ${statusIcon}"></i> ${statusText}`;
    statusEl.style.cssText = `display: inline-block; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder}; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 6px; letter-spacing: 0.5px;`;

    let videoHTML = "";
    if (video && video !== "none" && video !== "null") {
        const cleanVideo = video.replaceAll("\\\\", "/");
        videoHTML = `
            <div style="margin-bottom: 24px; text-align: left; width: 100%;">
                <strong style="color: white; font-size: 15px; display: block; margin-bottom: 12px;"><i class="fa-solid fa-video"></i> Captured Video Evidence</strong>
                <video controls style="width: 100%; max-height: 380px; border-radius: 12px; background: black; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                    <source src="${cleanVideo}" type="video/mp4">
                </video>
            </div>
        `;
    }

    let content = `
        ${videoHTML}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; background: rgba(255,255,255,0.02); padding: 24px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 8px;">
            <div>
                <strong style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 4px;">CASE ID</strong>
                <span style="font-size: 15px; font-weight: 700; color: white;">${case_num}</span>
            </div>
            <div>
                <strong style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 4px;">INCIDENT TYPE</strong>
                <span style="font-size: 15px; font-weight: 700; color: white;">${type}</span>
            </div>
            <div>
                <strong style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 4px;">SUBMITTING OFFICER</strong>
                <span style="font-size: 15px; font-weight: 700; color: white;">${submitting_officer}</span>
            </div>
            <div>
                <strong style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 4px;">INCIDENT DATE & TIME</strong>
                <span style="font-size: 15px; font-weight: 700; color: white;">${realdatetime || submitting_datetime}</span>
            </div>
            <div style="grid-column: span 2;">
                <strong style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 4px;">LOCATION OF INCIDENT</strong>
                <span style="font-size: 15px; font-weight: 700; color: white;"><i class="fa-solid fa-location-dot" style="color:#ef4444; margin-right: 6px;"></i> ${location}</span>
            </div>
        </div>
        ${feedbackHTML}
    `;

    details.innerHTML = content;

    const footer = modal.querySelector(".modal-footer");
    if (footer) {
        footer.innerHTML = `
            <div style="display: flex; gap: 12px;">
                <button class="btn-cancel" onclick="window.printNotificationReport('${case_num}')" style="background: #334155; color: white; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 10px; cursor: pointer; border: none; transition: 0.2s;" onmouseover="this.style.background='#475569'" onmouseout="this.style.background='#334155'">
                    <i class="fa-solid fa-print"></i> Print Report
                </button>
                <button class="btn-goto" onclick="window.goToReportFromNotification('${case_num}')" style="background: #0b2c66; color: white; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 10px; cursor: pointer; border: none; transition: 0.2s;" onmouseover="this.style.background='#1e5799'" onmouseout="this.style.background='#0b2c66'">
                    <i class="fa-solid fa-arrow-right-to-bracket"></i> Go to Report
                </button>
            </div>
            <button onclick="window.closeNotificationModal()" style="background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">Close</button>
        `;
    }

    modal.style.display = "flex";
    modal.classList.add("show");

    const report_is_read_admin = getAdminReadReports().includes(case_num) ? "yes" : "no";

    if (report_is_read_admin === "no") {
        markReportAsReadByAdmin(case_num);
        unreadNotifications = Math.max(0, unreadNotifications - 1);
        updateNotificationBadge();

        fetch(`/mark-report-read?caseNum=${encodeURIComponent(case_num)}`, { method: "POST" })
        .then(res => res.text())
        .then(data => {
            if (data === "Success") {
                refreshReports();
            }
        })
        .catch(err => console.error("Error marking report read:", err));
    }
}

function normalizeType(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/&/g, "and").replace(/\//g, " ").replace(/\s+/g, " ").trim();
}

function filterAdminIncidents() {
    const searchInput = document.getElementById("adminIncidentSearch");
    const timeFilter = document.getElementById("adminIncidentTimeFilter");

    if (!searchInput && !timeFilter) return;

    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedTime = timeFilter ? timeFilter.value : "all";

    const grid = document.getElementById("incident-grid");
    if (!grid) return;

    const children = Array.from(grid.children);
    const incidentIdPairs = {};

    // Timestamps
    const now = new Date().getTime();
    const startOfToday = new Date().setHours(0,0,0,0);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    children.forEach(child => {
        const incId = child.getAttribute("data-incident-id");
        if (!incId) return;

        const officer = child.getAttribute("data-officer") || "";
        const dateText = child.getAttribute("data-date") || "";
        const location = child.getAttribute("data-location") || "";
        const type = child.getAttribute("data-type") || "";
        const timestamp = parseInt(child.getAttribute("data-timestamp") || "0", 10);

        let matchesTime = true;
        if (selectedTime === "today") {
            matchesTime = (timestamp >= startOfToday);
        } else if (selectedTime === "24h") {
            matchesTime = (timestamp >= oneDayAgo);
        } else if (selectedTime === "7d") {
            matchesTime = (timestamp >= sevenDaysAgo);
        } else if (selectedTime === "30d") {
            matchesTime = (timestamp >= thirtyDaysAgo);
        }

        const matchesSearch = searchQuery === "" ||
                              officer.includes(searchQuery) ||
                              dateText.includes(searchQuery) ||
                              location.includes(searchQuery) ||
                              type.includes(searchQuery) ||
                              incId.toLowerCase().includes(searchQuery);

        if (!incidentIdPairs[incId]) {
            incidentIdPairs[incId] = { show: (matchesTime && matchesSearch), elements: [] };
        }
        incidentIdPairs[incId].elements.push(child);
    });

    Object.keys(incidentIdPairs).forEach(incId => {
        const pair = incidentIdPairs[incId];
        pair.elements.forEach(el => {
            if (pair.show) {
                el.style.display = "";
            } else {
                el.style.display = "none";
            }
        });
    });
}

function filterAdminReports() {
    const searchInput = document.getElementById("adminReportSearch");
    const filterDropdown = document.getElementById("adminReportTypeFilter");
    const statusDropdown = document.getElementById("adminReportStatusFilter");

    if (!searchInput && !filterDropdown && !statusDropdown) return;

    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedType = filterDropdown ? filterDropdown.value.toLowerCase().trim() : "all";
    const selectedStatus = statusDropdown ? statusDropdown.value.toLowerCase().trim() : "all";

    const rows = document.querySelectorAll("#reportList .report-row");
    rows.forEach(row => {
        const type = row.getAttribute("data-type") || "";
        const officer = row.getAttribute("data-officer") || "";
        const loc = row.getAttribute("data-location") || "";
        const caseNum = row.getAttribute("data-case") || "";
        const status = row.getAttribute("data-status") || "";

        const matchesDropdown = (selectedType === "all" || selectedType === "" || normalizeType(type) === normalizeType(selectedType));
        const matchesStatus = (selectedStatus === "all" || selectedStatus === "" || status === selectedStatus);

        const matchesSearch = searchQuery === "" ||
                              type.includes(searchQuery) ||
                              officer.includes(searchQuery) ||
                              loc.includes(searchQuery) ||
                              caseNum.includes(searchQuery);

        if (matchesDropdown && matchesStatus && matchesSearch) {
            row.style.display = "flex";
        } else {
            row.style.display = "none";
        }
    });
}

function setupFilteringListeners() {
    const searchInput = document.getElementById("adminReportSearch");
    const filterDropdown = document.getElementById("adminReportTypeFilter");
    const statusDropdown = document.getElementById("adminReportStatusFilter");

    if (searchInput) {
        searchInput.removeEventListener("input", filterAdminReports);
        searchInput.addEventListener("input", filterAdminReports);
    }
    if (filterDropdown) {
        filterDropdown.removeEventListener("change", filterAdminReports);
        filterDropdown.addEventListener("change", filterAdminReports);
    }
    if (statusDropdown) {
        statusDropdown.removeEventListener("change", filterAdminReports);
        statusDropdown.addEventListener("change", filterAdminReports);
    }
}

function runGlobalHeaderSearch() {
    const searchInput = document.getElementById("globalHeaderSearch");
    const dropdown = document.getElementById("searchDropdown");
    if (!searchInput || !dropdown) return;

    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        dropdown.style.display = "none";
        return;
    }

    const reports = window.myReports || [];
    const matches = reports.filter(r => {
        const case_num = (r[0] || "").toLowerCase();
        const officer_name = (r[1] || "").toLowerCase();
        const location = (r[3] || "").toLowerCase();
        const type = (r[4] || "").toLowerCase();
        return case_num.includes(query) ||
               officer_name.includes(query) ||
               location.includes(query) ||
               type.includes(query);
    });

    dropdown.innerHTML = "";

    if (matches.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 16px; text-align: center; color: #64748b; font-size: 14px;">
                <i class="fa-solid fa-magnifying-glass" style="margin-right: 8px;"></i> No matching incidents found
            </div>
        `;
        dropdown.style.display = "block";
        return;
    }

    matches.forEach(report => {
        const case_num = report[0];
        const officer_name = report[1];
        const location = report[3];
        const type = report[4];

        const iconInfo = accidentIcons[type] || { icon: "fa-car-burst", color: "#3b82f6" };

        const item = document.createElement("div");
        item.className = "search-dropdown-item";
        item.innerHTML = `
            <i class="fa-solid ${iconInfo.icon}" style="color: ${iconInfo.color};"></i>
            <div class="item-details">
                <strong>${type}</strong>
                <span>${case_num} • By: ${officer_name} • ${location}</span>
            </div>
        `;
        item.onclick = () => {
            openReportDetailModal(report);
            dropdown.style.display = "none";
            searchInput.value = "";
        };
        dropdown.appendChild(item);
    });

    dropdown.style.display = "block";
}

function refreshDashboardStats() {
    fetch("/get-dashboard-stats")
    .then(res => res.json())
    .then(data => {
        const reportsTodayh3 = document.getElementById("reportsTodayh3");
        const reportsComparedFromYesterday = document.getElementById("reportsComparedFromYesterday");
        const resolvedTodayCount = document.getElementById("resolvedTodayCount");
        const personnelOnDutyCount = document.getElementById("personnelOnDutyCount");
        const avgResponseTime = document.getElementById("avgResponseTime");

        if (reportsTodayh3) reportsTodayh3.textContent = data.recent_incidents;
        if (reportsComparedFromYesterday) {
            let compText = data.comparison_text;
            if (compText && compText.startsWith("-")) {
                compText = "+" + compText.substring(1);
            }
            reportsComparedFromYesterday.textContent = compText;
        }
        if (resolvedTodayCount) resolvedTodayCount.textContent = data.resolved_today;
        if (personnelOnDutyCount) personnelOnDutyCount.textContent = data.personnel_on_duty;
        if (avgResponseTime) avgResponseTime.textContent = data.avg_response_time;
    })
    .catch(err => console.error("Error retrieving dashboard statistics:", err));
}

let currentReportUnderReview = null;

function openReportDetailModal(report) {
    currentReportUnderReview = report;
    let case_num = report[0];
    let submitting_officer = report[1];
    let submitting_datetime = cleanDateString(report[2]);
    let location = report[3];
    let type = report[4];
    let status = report[5];
    let video = report[6];
    let reviewing_officer = report[7];
    let reviewing_datetime = cleanDateString(report[8]);
    let reviewing_reason = report[9];
    let realdatetime = cleanDateString(report[12]);

    const report_is_read_admin = getAdminReadReports().includes(case_num) ? "yes" : "no";

    if (report_is_read_admin === "no") {
        markReportAsReadByAdmin(case_num);
        unreadNotifications = Math.max(0, unreadNotifications - 1);
        updateNotificationBadge();

        fetch(`/mark-report-read?caseNum=${encodeURIComponent(case_num)}`, { method: "POST" })
        .then(res => res.text())
        .then(data => {
            if (data === "Success") {
                refreshReports();
            }
        })
        .catch(err => console.error("Error marking report read:", err));
    }

    const header = document.getElementById("detailModel-header");
    if (header) {
        header.innerHTML = `
            <h3 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">Report #${case_num} Review</h3>
            <span class="status ${status}" style="font-weight:700;padding:6px 14px;border-radius:20px;text-transform:uppercase;font-size:12px;background:#fef3c7;color:#92400e;">${status.replace("_", " ").toUpperCase()}</span>
            <button type="button" onclick="document.getElementById('detailModal').style.display='none'" style="all:unset; cursor:pointer; font-size:28px; color:#64748b; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#1e293b'" onmouseout="this.style.background='transparent'; this.style.color='#64748b'">&times;</button>
        `;
        const badge = header.querySelector(".status");
        if (badge) {
            if (status === "approved") {
                badge.style.cssText = "font-weight:700;padding:6px 14px;border-radius:20px;text-transform:uppercase;font-size:12px;background:#dcfce7;color:#15803d;";
            } else if (status === "denied") {
                badge.style.cssText = "font-weight:700;padding:6px 14px;border-radius:20px;text-transform:uppercase;font-size:12px;background:#fee2e2;color:#b91c1c;";
            } else if (status === "changes_requested" || status === "changes") {
                badge.style.cssText = "font-weight:700;padding:6px 14px;border-radius:20px;text-transform:uppercase;font-size:12px;background:#eff6ff;color:#2563eb;";
            }
        }
    }

    const videoEl = document.getElementById("detailModal-evidenceVideo");
    if (videoEl) {
        if (video && video !== "none" && video !== "null") {
            videoEl.src = video.replaceAll("\\\\", "/");
            videoEl.style.display = "block";
        } else {
            videoEl.src = "";
            videoEl.style.display = "none";
        }
    }

    const infoGrid = document.getElementById("detailModal-info-grid");
    if (infoGrid) {
        infoGrid.innerHTML = `
            <div class="info-item"><strong>Submitting Officer</strong><p>${submitting_officer}</p></div>
            <div class="info-item"><strong>Date & Time of Accident</strong><p>${submitting_datetime}</p></div>
            <div class="info-item"><strong>Location</strong><p>${location}</p></div>
            <div class="info-item"><strong>Status</strong><p>${status.replace("_", " ").toUpperCase()}</p></div>
        `;
    }

    const btnApprove = document.getElementById("btn-approve");
    const btnDeny = document.getElementById("btn-deny");
    const btnReq = document.getElementById("btn-req");
    if (status === "pending") {
        if(btnApprove) btnApprove.style.display = "inline-block";
        if(btnDeny) btnDeny.style.display = "inline-block";
        if(btnReq) btnReq.style.display = "inline-block";
    } else {
        if(btnApprove) btnApprove.style.display = "none";
        if(btnDeny) btnDeny.style.display = "none";
        if(btnReq) btnReq.style.display = "none";
    }

    document.getElementById("detailModal").style.display = "flex";
}

function openApproveModal() {
    if (!currentReportUnderReview) return;
    document.getElementById("approveId").textContent = currentReportUnderReview[0];
    document.getElementById("approveTitle").textContent = currentReportUnderReview[4];
    document.getElementById("approveOfficer").textContent = currentReportUnderReview[1];
    document.getElementById("approveDate").textContent = cleanDateString(currentReportUnderReview[2]);
    document.getElementById("approveType").textContent = currentReportUnderReview[4];
    document.getElementById("approveIncidentDate").textContent = cleanDateString(currentReportUnderReview[2]);
    document.getElementById("approveNote").value = "";
    document.getElementById("approveModal").style.display = "flex";
}

function closeApproveModal() {
    document.getElementById("approveModal").style.display = "none";
}

function finalApprove() {
    const note = document.getElementById("approveNote").value.trim();
    if (!note) {
        showErrorModal("Notes Required", "Review notes are required to approve the report.", ["approveNote"]);
        return;
    }
    const caseNum = currentReportUnderReview[0];
    fetch(`/update-report-status?caseNum=${encodeURIComponent(caseNum)}&status=approved&note=${encodeURIComponent(note)}&reviewer=Admin`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Report approved successfully!", "success");
            closeApproveModal();
            document.getElementById("detailModal").style.display = "none";
            refreshReports();
        } else {
            showErrorModal("Update Failed", "Failed to update report status.");
        }
    });
}

function openDenyModal() {
    if (!currentReportUnderReview) return;
    document.getElementById("denyId").textContent = currentReportUnderReview[0];
    document.getElementById("denyTitle").textContent = currentReportUnderReview[4];
    document.getElementById("denyOfficer").textContent = currentReportUnderReview[1];
    document.getElementById("denyDate").textContent = cleanDateString(currentReportUnderReview[2]);
    document.getElementById("denyType").textContent = currentReportUnderReview[4];
    document.getElementById("denyIncidentDate").textContent = cleanDateString(currentReportUnderReview[2]);
    document.getElementById("denyNote").value = "";
    document.getElementById("denyModal").style.display = "flex";
}

function closeDenyModal() {
    document.getElementById("denyModal").style.display = "none";
}

function finalDeny() {
    const note = document.getElementById("denyNote").value.trim();
    if (!note) {
        showErrorModal("Notes Required", "Review notes are required to deny the report.", ["denyNote"]);
        return;
    }
    const caseNum = currentReportUnderReview[0];
    fetch(`/update-report-status?caseNum=${encodeURIComponent(caseNum)}&status=denied&note=${encodeURIComponent(note)}&reviewer=Admin`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Report denied successfully.", "success");
            closeDenyModal();
            document.getElementById("detailModal").style.display = "none";
            refreshReports();
        } else {
            showErrorModal("Update Failed", "Failed to update report status.");
        }
    });
}

function openRequestChanges() {
    if (!currentReportUnderReview) return;
    document.getElementById("reqId").textContent = currentReportUnderReview[0];
    document.getElementById("reqTitle").textContent = currentReportUnderReview[4];
    document.getElementById("reqOfficer").textContent = currentReportUnderReview[1];
    document.getElementById("reqDate").textContent = cleanDateString(currentReportUnderReview[2]);
    document.getElementById("reqType").textContent = currentReportUnderReview[4];
    document.getElementById("reqIncidentDate").textContent = cleanDateString(currentReportUnderReview[2]);
    document.getElementById("reqNote").value = "";
    document.getElementById("requestChangesModal").style.display = "flex";
}

function closeReqModal() {
    document.getElementById("requestChangesModal").style.display = "none";
}

function finalRequestChanges() {
    const note = document.getElementById("reqNote").value.trim();
    if (!note) {
        showErrorModal("Notes Required", "Notes are required to request changes to this report.", ["reqNote"]);
        return;
    }
    const caseNum = currentReportUnderReview[0];
    fetch(`/update-report-status?caseNum=${encodeURIComponent(caseNum)}&status=changes_requested&note=${encodeURIComponent(note)}&reviewer=Admin`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Feedback sent successfully.", "success");
            closeReqModal();
            document.getElementById("detailModal").style.display = "none";
            refreshReports();
        } else {
            showErrorModal("Update Failed", "Failed to update report status.");
        }
    });
}

function saveVideo() {
    if (!currentReportUnderReview) return;
    let videoUrl = currentReportUnderReview[6];
    if (!videoUrl || videoUrl === "none" || videoUrl === "null") {
        showErrorModal("Missing Evidence", "No video evidence is associated with this report.");
        return;
    }
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = videoUrl.split('/').pop() || "evidence_video.mp4";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function printReport() {
    if (!currentReportUnderReview) return;
    let case_num = currentReportUnderReview[0];
    let submitting_officer = currentReportUnderReview[1];
    let submitting_datetime = cleanDateString(currentReportUnderReview[12] || currentReportUnderReview[2]);
    let location = currentReportUnderReview[3];
    let type = currentReportUnderReview[4];
    let status = currentReportUnderReview[5];
    let reviewing_officer = currentReportUnderReview[7];
    let reviewing_datetime = cleanDateString(currentReportUnderReview[8]);
    let reviewing_reason = currentReportUnderReview[9];

    const isReviewed = status !== "pending";

    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
        <html>
        <head>
            <title>AcciTrack Summary Report - ${case_num}</title>
            <style>
                body {
                    font-family: 'Inter', Arial, sans-serif;
                    color: #1e293b;
                    padding: 40px;
                    line-height: 1.6;
                }
                .header {
                    border-bottom: 2px solid #e2e8f0;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .logo-section h1 {
                    margin: 0;
                    font-size: 28px;
                    color: #0b2c66;
                    font-weight: 800;
                }
                .logo-section p {
                    margin: 4px 0 0;
                    color: #64748b;
                    font-size: 14px;
                }
                .report-title {
                    font-size: 22px;
                    font-weight: 700;
                    margin-bottom: 20px;
                    color: #0f172a;
                }
                .details-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                }
                .details-table th, .details-table td {
                    padding: 12px 16px;
                    text-align: left;
                    border-bottom: 1px solid #f1f5f9;
                }
                .details-table th {
                    background: #f8fafc;
                    color: #475569;
                    font-weight: 600;
                    width: 240px;
                }
                .details-table td {
                    color: #0f172a;
                    font-weight: 500;
                }
                .status-badge {
                    display: inline-block;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .status-badge.approved { background: #dcfce7; color: #15803d; }
                .status-badge.denied { background: #fee2e2; color: #b91c1c; }
                .status-badge.changes_requested { background: #eff6ff; color: #2563eb; }
                .status-badge.pending { background: #fef3c7; color: #92400e; }
                .footer {
                    margin-top: 50px;
                    font-size: 12px;
                    color: #94a3b8;
                    text-align: center;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo-section">
                    <h1>AcciTrack Summary Report</h1>
                    <p>Philippine National Police Command Center</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-weight: bold; color: #0b2c66;">CASE REF: ${case_num}</p>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Generated on: ${new Date().toLocaleString()}</p>
                </div>
            </div>

            <div class="report-title">Incident Analysis Summary</div>

            <table class="details-table">
                <tr>
                    <th>Type of Accident</th>
                    <td>${type}</td>
                </tr>
                <tr>
                    <th>Submitting Officer</th>
                    <td>${submitting_officer}</td>
                </tr>
                <tr>
                    <th>Location of Incident</th>
                    <td>${location}</td>
                </tr>
                <tr>
                    <th>Date & Time of Incident</th>
                    <td>${submitting_datetime}</td>
                </tr>
                <tr>
                    <th>Verification Status</th>
                    <td>
                        <span class="status-badge ${status}">${status.replace("_", " ").toUpperCase()}</span>
                    </td>
                </tr>
                <tr>
                    <th>Reviewing Officer</th>
                    <td>${isReviewed && reviewing_officer !== "none" ? reviewing_officer : "Pending Admin Assignment"}</td>
                </tr>
                <tr>
                    <th>Review Date & Time</th>
                    <td>${isReviewed && reviewing_datetime !== "none" && reviewing_datetime !== "Invalid Date" ? reviewing_datetime : "Pending Admin Review"}</td>
                </tr>
                <tr>
                    <th>Review Decision Reason</th>
                    <td>${isReviewed && reviewing_reason !== "none" ? reviewing_reason : "No notes documented yet"}</td>
                </tr>
            </table>

            <div class="footer">
                This document is a computer-generated official summary of the AcciTrack Incident Registry.<br>
                Philippine National Police AcciTrack Registry.
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function refreshReports(){
    fetch("/admin-get-reports", { method: "POST" })
    .then(res => res.json())
    .then(reports => {
        const readReportsList = localStorage.getItem("admin_read_reports") || "[]";
        const currentSortParams = `${document.getElementById("adminIncidentSort")?.value || "newest"}-${document.getElementById("adminReportSort")?.value || "newest"}`;
        const reportsSerialized = JSON.stringify(reports) + currentSortParams + readReportsList;
        if (window.lastReportsSerialized === reportsSerialized) {
            return;
        }
        window.lastReportsSerialized = reportsSerialized;

        window.myReports = reports;

        document.getElementById("reportList").innerHTML = "";
        document.getElementById("reportNotifications").innerHTML = "";
        const pendingReportsList = document.getElementById("pending-reports-list");
        const emptyState = document.getElementById("empty-state");
        const incidentGrid = document.getElementById("incident-grid");

        if (pendingReportsList) pendingReportsList.innerHTML = "";
        if (incidentGrid) incidentGrid.innerHTML = "";

        reportsToday = 0;
        reportsYesterday = 0;
        unreadNotifications = 0;

        const sortVal = document.getElementById("adminIncidentSort") ? document.getElementById("adminIncidentSort").value : "newest";
        reports.sort((a, b) => {
            if (sortVal === "newest") {
                return parseDateSafely(b) - parseDateSafely(a);
            } else if (sortVal === "oldest") {
                return parseDateSafely(a) - parseDateSafely(b);
            } else if (sortVal === "alphabetical") {
                return (a[4] || "").localeCompare(b[4] || "");
            }
            return parseDateSafely(b) - parseDateSafely(a);
        });

        const reportSortVal = document.getElementById("adminReportSort") ? document.getElementById("adminReportSort").value : "newest";
        const reportsForTabList = [...reports];
        reportsForTabList.sort((a, b) => {
            if (reportSortVal === "newest") {
                return parseDateSafely(b) - parseDateSafely(a);
            } else if (reportSortVal === "oldest") {
                return parseDateSafely(a) - parseDateSafely(b);
            }
            return parseDateSafely(b) - parseDateSafely(a);
        });

        let countMinor = 0;
        let countReckless = 0;
        let countDui = 0;
        let countHit = 0;
        let countPile = 0;
        let countHomic = 0;

        reports.forEach(report => {
            let type = report[4];
            if (type === "Minor Traffic Accident") countMinor++;
            else if (type === "Reckless Driving") countReckless++;
            else if (type === "DUI / DWI") countDui++;
            else if (type === "Hit & Run") countHit++;
            else if (type === "Multi-Vehicle Pileup") countPile++;
            else if (type === "Reckless Imprudence Resulting in Homicide") countHomic++;
        });

        const countMinorTraffic = document.getElementById("countMinorTraffic");
        const countRecklessDriving = document.getElementById("countRecklessDriving");
        const countDUI = document.getElementById("countDUI");
        const countHitRun = document.getElementById("countHitRun");
        const countPileup = document.getElementById("countPileup");
        const countHomicide = document.getElementById("countHomicide");

        if (countMinorTraffic) countMinorTraffic.textContent = countMinor;
        if (countRecklessDriving) countRecklessDriving.textContent = countReckless;
        if (countDUI) countDUI.textContent = countDui;
        if (countHitRun) countHitRun.textContent = countHit;
        if (countPileup) countPileup.textContent = countPile;
        if (countHomicide) countHomicide.textContent = countHomic;

        const pendingReports = reports.filter(r => r[5] === "pending");
        const displayPending = pendingReports.slice(0, 3);

        if (pendingReportsList) {
            displayPending.forEach(report => {
                let case_num = report[0];
                let submitting_officer = report[1];
                let submitting_datetime = cleanDateString(report[2]);
                let location = report[3];
                let type = report[4];
                const iconInfo = accidentIcons[type] || accidentIcons["Minor Traffic Accident"];

                const pendingItem = document.createElement("div");
                pendingItem.className = "pending-item";
                pendingItem.innerHTML = `
                    <div class="pending-header">
                        <i class="fa-solid ${iconInfo.icon}" style="color:${iconInfo.color};"></i>
                        <span class="report-id">${case_num}</span>
                        <span class="badge high">${type}</span>
                    </div>
                    <div class="pending-meta">
                        <p><strong>Officer:</strong> ${submitting_officer}</p>
                        <p><strong>Location:</strong> ${location}</p>
                        <p><strong>Time:</strong> ${submitting_datetime}</p>
                    </div>
                    <button class="btn-review" onclick="openReportDetailModal(window.myReports.find(r => r[0] === '${case_num}'))">Review</button>
                `;
                pendingReportsList.appendChild(pendingItem);
            });
        }

        if (emptyState) {
            emptyState.style.display = pendingReports.length === 0 ? "block" : "none";
        }

        reportsForTabList.forEach(report => {
            let case_num = report[0];
            let submitting_officer = report[1];
            let submitting_datetime = cleanDateString(report[2]);
            let location = report[3];
            let type = report[4];
            let status = report[5];

            const iconInfo = accidentIcons[type] || accidentIcons["Minor Traffic Accident"];

            const newRow = document.createElement("div");
            newRow.className = `report-row ${status}`;
            newRow.style.animation = "slideIn 0.5s ease";

            newRow.setAttribute("data-type", type.toLowerCase());
            newRow.setAttribute("data-officer", submitting_officer.toLowerCase());
            newRow.setAttribute("data-location", location.toLowerCase());
            newRow.setAttribute("data-case", case_num.toLowerCase());
            newRow.setAttribute("data-status", status);

            let statusStyle = "background:#fef3c7; color:#92400e;";
            if (status === "approved") {
                statusStyle = "background:#dcfce7; color:#15803d;";
            } else if (status === "denied") {
                statusStyle = "background:#fee2e2; color:#b91c1c;";
            } else if (status === "changes_requested" || status === "changes") {
                statusStyle = "background:#eff6ff; color:#2563eb;";
            }

            newRow.innerHTML = `
                <i class="fa-solid ${iconInfo.icon}" style="color:${iconInfo.color};"></i>
                <div class="report-details">
                    <strong>${type}</strong>
                    <p>${submitting_officer} • ${submitting_datetime} • ${location}</p>
                </div>
                <span class="status" style="${statusStyle}">${status.replace("_", " ").toUpperCase()}</span>
            `;
            newRow.onclick = () => openReportDetailModal(report);
            document.getElementById("reportList").appendChild(newRow);
        });

        reports.forEach(report => {
            let case_num = report[0];
            let submitting_officer = report[1];
            let submitting_datetime = cleanDateString(report[2]);
            let location = report[3];
            let type = report[4];
            let status = report[5];
            let video = report[6];
            let reviewing_officer = report[7];
            let reviewing_datetime = cleanDateString(report[8]);
            let reviewing_reason = report[9];
            let submitting_officer_badge_number = report[11];

            const iconInfo = accidentIcons[type] || accidentIcons["Minor Traffic Accident"];

            const reportDate = parseDateSafely(report);
            if (reportDate.toLocaleString('en-PH', {dateStyle: 'medium'}) == new Date().toLocaleString('en-PH', {dateStyle: 'medium'})){
                reportsToday += 1;
            }
            if (reportDate.toLocaleString('en-PH', {dateStyle: 'medium'}) == yesterday.toLocaleString('en-PH', {dateStyle: 'medium'})){
                reportsYesterday += 1;
            }

            const accident = accidentTypes.find(a => a.type === type) || accidentTypes[0];
            const card = document.createElement("div");
            let badgeClass = status === "changes_requested" ? "changes" : status;

            const isUnread = !getAdminReadReports().includes(case_num);
            card.className = `report-card ${status} ${isUnread ? 'unread' : 'read'}`;
            card.style.cursor = "pointer";

            if (isUnread) {
                card.style.cssText = `
                    cursor: pointer;
                    background: #1e293b;
                    border: 1.5px solid #334155;
                    color: #94a3b8;
                    box-shadow: none;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    padding: 24px;
                    border-radius: 20px;
                    position: relative;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                `;
            } else {
                card.style.cssText = `
                    cursor: pointer;
                    background: #0b2c66;
                    border: 1.5px solid rgba(255, 255, 255, 0.15);
                    color: #f1f5f9;
                    border-radius: 20px;
                    padding: 24px;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    position: relative;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 10px 30px rgba(11, 44, 102, 0.25);
                `;
            }

            const h3StyleColor = isUnread ? '#ffffff' : '#60a5fa';
            const iconBg = isUnread ? '#334155' : 'rgba(255, 255, 255, 0.08)';
            const iconBorder = isUnread ? 'border: 1px solid #475569;' : '';

            const readStatusSign = isUnread
                ? `<div class="read-status-sign unread" style="display: inline-flex; align-items: center; gap: 6px; background: #dc2626; color: #ffffff; padding: 6px 14px; border-radius: 50px; font-size: 11px; font-weight: 800; text-transform: uppercase; border: 1px solid #f87171; margin-top: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);"><i class="fa-solid fa-circle-exclamation"></i> UNREAD</div>`
                : `<div class="read-status-sign read" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #4ade80; padding: 6px 14px; border-radius: 50px; font-size: 11px; font-weight: 800; text-transform: uppercase; border: 1px solid rgba(16, 185, 129, 0.3); margin-top: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);"><i class="fa-solid fa-circle-check"></i> already read</div>`;

            card.innerHTML = `
                <div class="report-icon ${status}" style="background: ${iconBg}; ${iconBorder} width: 70px; height: 70px; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 28px; flex-shrink: 0; box-shadow: 0 8px 20px rgba(0,0,0,0.15);">
                    <i class="fa-solid ${accident.icon}" style="color: ${accident.color};"></i>
                </div>
                <div class="report-content">
                    <h3 style="color: ${h3StyleColor}; font-size: 19px; font-weight: 700; margin: 0 0 8px 0;">${type}</h3>
                    <p style="color: #cbd5e1; font-size: 15.5px; line-height: 1.5; margin: 0;"><strong>Officer:</strong> ${submitting_officer} • <strong>Location:</strong> ${location}</p>
                    ${reviewing_reason && reviewing_reason !== "none" ? `<small style="color: #fb923c; font-weight: 600; font-size: 14px; margin-top: 6px; display: block;">Reason: ${reviewing_reason}</small>` : ""}
                    ${readStatusSign}
                </div>
                <div class="report-meta" style="margin-right: 40px; margin-left: auto; text-align: right;">
                    <div class="status-badge ${badgeClass}" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 50px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 6px 15px rgba(0,0,0,0.15); ${status === 'pending' ? 'background: #f59e0b; color: #000;' : status === 'approved' ? 'background: #22c55e; color: white;' : status === 'changes_requested' || status === 'changes' ? 'background: #2563eb; color: white;' : 'background: #ef4444; color: white;'}">
                        <i class="fa-solid ${status === 'pending' ? 'fa-clock' : status === 'approved' ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${status.replace("_", " ").toUpperCase()}
                    </div>
                    <div class="time-ago" style="margin-top: 8px; font-size: 14px; color: ${isUnread ? '#cbd5e1' : 'white'}; font-weight: 500;">${formatTimeAgo(parseDateSafely(report), new Date())}</div>
                </div>
            `;
            card.onclick = () => openNotificationModal(report);
            document.getElementById("reportNotifications").appendChild(card);

            if (isUnread) {
                unreadNotifications++;
            }

            if (incidentGrid) {
                const videoCard = document.createElement("div");
                const detailsGrid = document.createElement("div");
                videoCard.classList.add("video-card");
                detailsGrid.classList.add("details-grid");
                videoCard.style.cursor = "pointer";
                detailsGrid.style.cursor = "pointer";

                videoCard.setAttribute("data-officer", submitting_officer.toLowerCase());
                videoCard.setAttribute("data-date", submitting_datetime.toLowerCase());
                videoCard.setAttribute("data-location", location.toLowerCase());
                videoCard.setAttribute("data-timestamp", parseDateSafely(report).getTime());
                videoCard.setAttribute("data-incident-id", case_num);
                videoCard.setAttribute("data-type", type.toLowerCase());

                detailsGrid.setAttribute("data-officer", submitting_officer.toLowerCase());
                detailsGrid.setAttribute("data-date", submitting_datetime.toLowerCase());
                detailsGrid.setAttribute("data-location", location.toLowerCase());
                detailsGrid.setAttribute("data-timestamp", parseDateSafely(report).getTime());
                detailsGrid.setAttribute("data-incident-id", case_num);
                detailsGrid.setAttribute("data-type", type.toLowerCase());

                const cleanVideo = video ? video.replaceAll("\\\\", "/") : "none";

                videoCard.innerHTML = `
                <video controls src="${cleanVideo}">
                </video>
                <div class="video-caption">
                    <strong>${case_num}</strong>
                    <p>${type} • ${location}</p>
                </div>
                `;

                detailsGrid.innerHTML = `
                <div class="detail-card officer">
                    <div class="icon-circle officer"><i class="fa-solid fa-user-shield"></i></div>
                    <div class="content">
                        <h4>Officer who caught the video</h4>
                        <p>${submitting_officer}<br><small>Badge #${submitting_officer_badge_number}</small></p>
                    </div>
                </div>
                <div class="detail-card date">
                    <div class="icon-circle date"><i class="fa-solid fa-calendar-check"></i></div>
                    <div class="content">
                        <h4>Date and Time of Accident</h4>
                        <p>${submitting_datetime}</p>
                    </div>
                </div>
                <div class="detail-card critical">
                    <div class="icon-circle critical"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div class="content">
                        <h4>Type of Accident</h4>
                        <p>${type}</p>
                    </div>
                </div>
                <div class="detail-card location">
                    <div class="icon-circle location"><i class="fa-solid fa-location-dot"></i></div>
                    <div class="content">
                        <h4>Location of Accident</h4>
                        <p>${location}</p>
                    </div>
                </div>
                `;

                videoCard.onclick = () => openReportDetailModal(report);
                detailsGrid.onclick = () => openReportDetailModal(report);

                incidentGrid.appendChild(videoCard);
                incidentGrid.appendChild(detailsGrid);
            }
        });

        const unreadCountText = document.getElementById("unreadCountText");
        if (unreadCountText) {
            unreadCountText.textContent = `${unreadNotifications} Unread Report${unreadNotifications !== 1 ? 's' : ''}`;
        }

        const detailsCards = document.querySelectorAll("#incident-grid .details-grid");
        detailsCards.forEach(el => {
            el.style.display = hideDetailsGrid ? "none" : "";
        });
        const grid = document.getElementById("incident-grid");
        if (grid) {
            grid.style.gridTemplateColumns = hideDetailsGrid ? "1fr" : "520px 1fr";
        }

        const recentIncidentsPanel = document.querySelector(".recent-incidents-panel");
        if (recentIncidentsPanel) {
            recentIncidentsPanel.innerHTML = `
                <h3>Recent Incidents</h3>
                <small>Latest reported from body cameras</small>
            `;

            let displayReports = reports.slice(0, 6);

            if (displayReports.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.style.padding = "24px";
                emptyMsg.style.textAlign = "center";
                emptyMsg.style.color = "#64748b";
                emptyMsg.innerHTML = `<i class="fa-solid fa-folder-open" style="font-size:24px;margin-bottom:8px;display:block;"></i>No incidents reported yet.`;
                recentIncidentsPanel.appendChild(emptyMsg);
            }

            displayReports.forEach(report => {
                let case_num = report[0] || "N/A";
                let submitting_officer = report[1] || "Unknown";
                let location = report[3] || "Unknown";
                let type = report[4] || "Unknown";
                let status = report[5] || "pending";

                const priorityClass = type.includes("Homicide") || type.includes("Pileup") ? "high" : "medium";

                let badgeStyle = "background: #7aa9ff; color: white;";
                let badgeText = status.replace("_", " ").toUpperCase();

                if (status === "approved") {
                    badgeStyle = "background: #10b981; color: white;";
                    badgeText = "APPROVED";
                } else if (status === "denied") {
                    badgeStyle = "background: #ef4444; color: white;";
                    badgeText = "DENIED";
                } else if (status === "changes_requested" || status === "changes") {
                    badgeStyle = "background: #2563eb; color: white;";
                    badgeText = "REVISIONS NEEDED";
                } else if (status === "pending") {
                    badgeStyle = "background: #f59e0b; color: white;";
                    badgeText = "PENDING";
                }

                const incidentRow = document.createElement("div");
                incidentRow.className = "incident";
                incidentRow.innerHTML = `
                    <div class="incident-header">
                        <span class="incident-id">${case_num}</span>
                        <span class="badge ${priorityClass}">${priorityClass.toUpperCase()}</span>
                        <span class="badge" style="${badgeStyle}">${badgeText}</span>
                    </div>
                    <div class="incident-title">${type} - Reported by ${submitting_officer}</div>
                    <div class="incident-details">
                        <i class="fa-solid fa-location-dot"></i>
                        ${location}
                        <i class="fa-regular fa-clock"></i>
                        ${formatTimeAgo(parseDateSafely(report), new Date())}
                    </div>
                `;
                incidentRow.onclick = () => openReportDetailModal(report);
                recentIncidentsPanel.appendChild(incidentRow);
            });
        }

        refreshDashboardStats();
        filterAdminIncidents();
        filterAdminReports();
        updateNotificationBadge();
        filterNotifications(activeNotificationFilter);
    });
}

function openProfileTab(tabName) {
    document.querySelectorAll('.profile-tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.profile-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).style.display = 'block';
    if (event && event.target) {
        event.target.classList.add('active');
    }

    if (tabName === 'certifications') {
        loadCertifications();
    }
    if (tabName === 'pending-reviews') {
        loadPendingProfileChanges();
    }
    if (tabName === 'security') {
        loadSecurityData();
    }
}

function openAddCertModal() {
    document.getElementById('addCertModal').style.display = 'flex';
}

function closeAddCertModal() {
    document.getElementById('addCertModal').style.display = 'none';
}

function openDeleteCertModal(id) {
    targetDeleteCertId = id;
    document.getElementById('deleteCertModal').style.display = 'flex';
}

function closeDeleteCertModal() {
    document.getElementById('deleteCertModal').style.display = 'none';
    targetDeleteCertId = null;
}

window.closeAllModals = function() {
    const modals = [
        'detailModal',
        'approveModal',
        'denyModal',
        'requestChangesModal',
        'addCertModal',
        'deleteCertModal',
        'changePasswordModal',
        'backupCodesModal',
        'securityLogModal',
        'editPersonalModal',
        'editContactModal',
        'editEmergencyModal',
        'submitConfirmModal',
        'editEmploymentModal',
        'deleteUserModal',
        'taskModal',
        'validationErrorModal'
    ];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = "none";
    });
};

function showToast(message, type = "success") {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }

    toast.style.background = type === "success" ? "#10b981" : "#ef4444";
    toast.innerHTML = `
        <i class="fa-solid fa-check-circle"></i>
        <span>${message}</span>
    `;
    toast.style.display = "flex";

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => { toast.style.display = "none"; toast.style.opacity = "1"; }, 400);
    }, 4000);
}

function updateNotificationBadge() {
    let notifMenu = document.querySelector('button[onclick*="tabClick(4)"]') ||
                    document.querySelector('[onclick*="tabClick(4)"]');
    if(!notifMenu) return;
    let badge = notifMenu.querySelector('.badge');

    if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge";
        notifMenu.style.position = "relative";
        notifMenu.appendChild(badge);
    }

    if (unreadNotifications > 0) {
        badge.textContent = unreadNotifications > 99 ? "99+" : unreadNotifications;
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }
}

function toggleIncidentViewMode() {
    hideDetailsGrid = !hideDetailsGrid;
    const detailsCards = document.querySelectorAll("#incident-grid .details-grid");
    detailsCards.forEach(el => {
        el.style.display = hideDetailsGrid ? "none" : "";
    });
    const grid = document.getElementById("incident-grid");
    if (grid) {
        grid.style.gridTemplateColumns = hideDetailsGrid ? "1fr" : "520px 1fr";
    }
    const btnSpan = document.querySelector("#toggleIncidentView span");
    if (btnSpan) {
        btnSpan.textContent = hideDetailsGrid ? "Show Details Grid" : "Hide Details Grid";
    }
}

function filterNotifications(status) {
    activeNotificationFilter = status;

    const chips = document.querySelectorAll(".notif-filter-chips .filter-chip");
    chips.forEach(chip => {
        chip.classList.remove("active");
    });

    const activeChip = Array.from(chips).find(chip => {
        if (status === 'all' && chip.textContent.toLowerCase() === 'all') return true;
        if (status === 'pending' && chip.classList.contains("pending")) return true;
        if (status === 'approved' && chip.classList.contains("approved")) return true;
        if (status === 'denied' && chip.classList.contains("denied")) return true;
        if (status === 'changes_requested' && chip.classList.contains("revisions")) return true;
        return false;
    });
    if (activeChip) activeChip.classList.add("active");

    const cards = document.querySelectorAll("#reportNotifications .report-card");
    cards.forEach(card => {
        if (status === "all") {
            card.style.display = "flex";
        } else {
            if (card.classList.contains(status)) {
                card.style.display = "flex";
            } else {
                card.style.display = "none";
            }
        }
    });
}

function markAllReportsAsRead() {
    fetch("/admin-get-reports", { method: "POST" })
    .then(res => res.json())
    .then(reports => {
        let readList = getAdminReadReports();
        let newlyRead = [];
        reports.forEach(r => {
            let caseNum = r[0];
            if (!readList.includes(caseNum)) {
                readList.push(caseNum);
                newlyRead.push(caseNum);
            }
        });

        if (newlyRead.length === 0) {
            showToast("All report notifications are already marked as read.", "success");
            return;
        }

        localStorage.setItem("admin_read_reports", JSON.stringify(readList));
        unreadNotifications = 0;
        updateNotificationBadge();
        showToast("All report notifications marked as read!", "success");

        let promises = newlyRead.map(caseNum => {
            return fetch(`/mark-report-read?caseNum=${encodeURIComponent(caseNum)}`, { method: "POST" });
        });
        Promise.all(promises).then(() => {
            refreshReports();
        });
    })
    .catch(err => console.error("Error marking all read:", err));
}

function showErrorModal(title, message, fieldsToHighlight = []) {
    let modal = document.getElementById("validationErrorModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "validationErrorModal";
        modal.className = "modal-overlay";
        modal.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(8px);
            z-index: 100000;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="background: #ffffff; border: 1.5px solid #fecaca; border-radius: 20px; width: 100%; max-width: 480px; overflow: hidden; box-shadow: 0 20px 50px rgba(220, 38, 38, 0.15); display: flex; flex-direction: column; font-family: 'Inter', sans-serif;">
            <div class="modal-header" style="padding: 20px 24px; display: flex; align-items: center; gap: 14px; background: #fee2e2; color: #991b1b; border-bottom: 1px solid #fca5a5;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 22px;"></i>
                <h3 style="font-size: 18px; font-weight: 700; margin: 0; color: #991b1b;">${title}</h3>
            </div>
            <div class="modal-body" style="padding: 24px; color: #1e293b; font-size: 15px; line-height: 1.6; text-align: left;">
                <p style="margin: 0; font-weight: 500;">${message}</p>
            </div>
            <div class="modal-footer" style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                <button onclick="closeErrorModal()" style="background: #dc2626; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#b91c1c'" onmouseout="this.style.background='#dc2626'">OK</button>
            </div>
        </div>
    `;

    modal.style.display = "flex";

    fieldsToHighlight.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.style.borderColor = "#ef4444";
            el.style.boxShadow = "0 0 0 4px rgba(239, 68, 68, 0.15)";

            const clearError = () => {
                el.style.borderColor = "";
                el.style.boxShadow = "";
                el.removeEventListener("input", clearError);
                el.removeEventListener("change", clearError);
            };
            el.addEventListener("input", clearError);
            el.addEventListener("change", clearError);
        }
    });
}

function closeErrorModal() {
    const modal = document.getElementById("validationErrorModal");
    if (modal) {
        modal.style.display = "none";
    }
}

function createNewAccount() {
    const fullName = document.getElementById("newName").value.trim();
    const age = document.getElementById("newAge").value.trim();
    const gender = document.getElementById("newGender").value;
    const badge = document.getElementById("newBadge").value.trim().replace("#", "");
    const phone = document.getElementById("newPhone").value.trim();
    const email = document.getElementById("newEmail").value.trim();
    const username = document.getElementById("newUsername").value.trim();
    const pin = document.getElementById("newPin").value.trim(); // password value
    const roleRadio = document.querySelector('input[name="role"]:checked');
    const role = roleRadio ? roleRadio.value : "employee";

    const fields = [
        { id: "newName", val: fullName, label: "Full Name" },
        { id: "newAge", val: age, label: "Age" },
        { id: "newGender", val: gender, label: "Gender" },
        { id: "newBadge", val: badge, label: "Badge Number" },
        { id: "newPhone", val: phone, label: "Contact Number" },
        { id: "newEmail", val: email, label: "Email Address" },
        { id: "newUsername", val: username, label: "System Username" },
        { id: "newPin", val: pin, label: "Login Password" }
    ];

    const emptyFields = fields.filter(f => !f.val);
    if (emptyFields.length > 0) {
        const missingLabels = emptyFields.map(f => f.label).join(", ");
        const missingIds = emptyFields.map(f => f.id);
        showErrorModal(
            "Registration Incomplete",
            `Please complete the following required fields before proceeding:<br><br><strong style="color: #dc2626;">${missingLabels}</strong>`,
            missingIds
        );
        return;
    }

    // STRICT PASSWORD COMPLEXITY FILTERS (Length, uppercase, numbers, and special characters)
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(pin);
    const hasNumber = /[0-9]/.test(pin);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pin);
    const isLong = pin.length >= minLength;

    if (!isLong || !hasUppercase || !hasNumber || !hasSpecialChar) {
        showErrorModal(
            "Weak Password Detected",
            `Your password does not satisfy our minimum security guidelines. It must meet all of the following requirements:<br><br>` +
            `<ul style="margin: 10px 0 0 20px; padding: 0; text-align: left;">` +
            `<li>At least <strong>8 characters</strong> in length</li>` +
            `<li>At least <strong>one uppercase letter</strong> (A-Z)</li>` +
            `<li>At least <strong>one number</strong> (0-9)</li>` +
            `<li>At least <strong>one special character</strong> (e.g., @, #, $, %)</li>` +
            `</ul>`,
            ["newPin"]
        );
        return;
    }

    const nameParts = fullName.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts[nameParts.length - 1] || "";
    const middleName = nameParts.length > 2 ? nameParts.slice(1, nameParts.length - 1).join(" ") : "";
    const preferredName = firstName;

    const isAdminFlag = role === "admin" ? "yes" : "no";

    const url = `/create-user?first_name=${encodeURIComponent(firstName)}` +
                `&middle_name=${encodeURIComponent(middleName)}` +
                `&last_name=${encodeURIComponent(lastName)}` +
                `&preferred_name=${encodeURIComponent(preferredName)}` +
                `&gender=${encodeURIComponent(gender)}` +
                `&badge=${encodeURIComponent(badge)}` +
                `&phone=${encodeURIComponent(phone)}` +
                `&email=${encodeURIComponent(email)}` +
                `&role=${encodeURIComponent(isAdminFlag)}` +
                `&pin=${encodeURIComponent(pin)}` +
                `&username=${encodeURIComponent(username)}`;

    fetch(url, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            const createSuccess = document.getElementById("createSuccess");
            createSuccess.innerHTML = `
                <h3 style="margin:0;font-size:20px;">
                    <i class="fa-solid fa-circle-check"></i> Account Registered Successfully!
                </h3>
                <p style="margin:12px 0 0;">
                    User written to database. Provide the following system credentials to the officer:
                </p>
                <div style="background:rgba(255,255,255,0.7); padding:18px; border-radius:12px; margin-top:14px; font-family:monospace; font-size:16px; line-height:1.6; text-align:left; color:#155724; border:1px solid #c3e6cb;">
                    <strong>Login Username:</strong> ${username}<br>
                    <strong>Login Password:</strong> ${pin}<br>
                    <strong>Badge Reference:</strong> #${badge}<br>
                    <strong>System Privileges:</strong> ${role === "admin" ? "System Administrator" : "Officer / Employee"}
                </div>
                <p style="margin:12px 0 0; font-size:12.5px; opacity:0.9;">
                    * The new user can instantly access system panels by entering their username, badge number, and Password.
                </p>
            `;
            createSuccess.style.display = "block";
            document.getElementById("createUserForm").reset();
        } else if (data.includes("Badge number already exists")) {
            showErrorModal(
                "Duplicate Registration Entry",
                "The badge number you specified is already registered to an existing account. Please verify the badge number or remove the previous registration first.",
                ["newBadge"]
            );
        } else if (data.includes("Username already exists")) {
            showErrorModal(
                "Username Taken",
                "The system username you provided is already linked to another account. Please select a unique username.",
                ["newUsername"]
            );
        } else {
            showErrorModal("Registration Failed", "Failed to register account: " + data);
        }
    })
    .catch(err => {
        console.error("Account registration error:", err);
        showErrorModal("Connection Error", "A network connection error occurred. Could not register account.");
    });
}

function refreshUsersList(){
    fetch("/get-users", { method: "POST" })
    .then(res => res.json())
    .then(users => {
        const tableBody = document.getElementById("existingUsersTableBody");
        if (!tableBody) return;
        tableBody.innerHTML = "";

        const usersCount = document.getElementById("usersCount");
        if (usersCount) {
            usersCount.textContent = `A total of ${users.length} active employee registry entries found.`;
        }

        users.forEach(user => {
            const fullName = `${user[0]} ${user[2]}`;
            const badge = user[9];
            const username = user[30];
            const role = user[31] === "yes" ? "Administrator" : "Officer / Employee";
            const phone = user[14] || "N/A";

            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid #cbd5e1";
            row.style.color = "black";
            row.innerHTML = `
                <td style="padding:12px; font-weight:600;">${fullName}</td>
                <td style="padding:12px;">#${badge}</td>
                <td style="padding:12px; font-family:monospace;">${username}</td>
                <td style="padding:12px;">
                    <span style="background:${user[31] === 'yes' ? '#e0e7ff' : '#f1f5f9'}; color:${user[31] === 'yes' ? '#0b2c66' : '#475569'}; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:700; text-transform:uppercase;">
                        ${user[31] === 'yes' ? 'ADMIN' : 'OFFICER'}
                    </span>
                </td>
                <td style="padding:12px;">${phone}</td>
                <td style="padding:12px;">
                    ${badge !== badgeNumber ? `
                        <button type="button" onclick="openDeleteUserModal('${badge}', '${fullName}')" style="background:#fee2e2; color:#dc2626; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px; transition:0.2s;" onmouseover="this.style.background='#fca5a5'" onmouseout="this.style.background='#fee2e2'">
                            <i class="fa-solid fa-trash-can"></i> Remove
                        </button>
                    ` : `<span style="font-size:13px; color:#64748b; font-style:italic;">Current Session</span>`}
                </td>
            `;
            tableBody.appendChild(row);
        });
    });
}

function loadProfilePicture() {
    fetch("/get-profile-picture")
    .then(res => {
        if (res.status === 200) {
            return res.text();
        }
        throw new Error("Unable to resolve dynamic image path");
    })
    .then(path => {
        const img = document.getElementById("adminProfilePic");
        if (img) {
            img.src = path + "?t=" + new Date().getTime();
        }
        const avatars = document.querySelectorAll(".user-avatar-img");
        avatars.forEach(avatar => {
            avatar.src = path + "?t=" + new Date().getTime();
        });
    })
    .catch(err => {
        console.error("Error retrieving profile picture path:", err);
        const img = document.getElementById("adminProfilePic");
        if (img) {
            img.src = "/static/images/icon.png";
        }
        const avatars = document.querySelectorAll(".user-avatar-img");
        avatars.forEach(avatar => {
            avatar.src = "/static/images/icon.png";
        });
    });
}

function refreshProfileData() {
    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        if (!user) return;

        window.currentUserProfile = user;

        const first_name = user[0] || "";
        const middle_name = user[1] || "";
        const last_name = user[2] || "";
        const preferred_name = user[3] || "";
        const birthday = user[4] || "";
        const gender = user[5] || "";
        const nationality = user[6] || "";
        const email = user[11] || "";
        const sec_email = user[12] || "";
        const work_phone = user[13] || "";
        const mobile_phone = user[14] || "";
        const emerg_name = user[15] || "";
        const emerg_phone = user[16] || "";
        const emerg_rel = user[17] || "";
        const emerg_name2 = user[18] || "";
        const emerg_phone2 = user[19] || "";
        const emerg_rel2 = user[20] || "";
        const job_title = user[21] || "";
        const department = user[22] || "";
        const emp_type = user[23] || "";
        const start_date = user[24] || "";
        const supervisor = user[25] || "";
        const location = user[26] || "";
        const schedule = user[27] || "";

        const sidebarAdminName = document.getElementById("sidebarAdminName");
        if (sidebarAdminName) sidebarAdminName.textContent = `Admin ${preferred_name}`;

        const sidebarAdminBadge = document.getElementById("sidebarAdminBadge");
        if (sidebarAdminBadge) sidebarAdminBadge.textContent = `Badge #${user[9]}`;

        const headerAdminWelcome = document.getElementById("headerAdminWelcome");
        if (headerAdminWelcome) headerAdminWelcome.textContent = `Admin ${preferred_name}!`;

        const headerProfileName = document.getElementById("headerProfileName");
        if (headerProfileName) headerProfileName.textContent = `Admin ${preferred_name}`;

        const bannerFullName = document.getElementById("upperFullName");
        if (bannerFullName) bannerFullName.textContent = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}`;

        const upperJobTitle = document.getElementById("upperJobTitle");
        if (upperJobTitle) upperJobTitle.textContent = job_title;

        const upperEmail = document.getElementById("upperEmail");
        if (upperEmail) upperEmail.textContent = email;

        const upperPhone = document.getElementById("upperPhone");
        if (upperPhone) upperPhone.textContent = mobile_phone;

        let serviceText = "12 years";
        if (start_date) {
            try {
                const startYear = new Date(start_date).getFullYear();
                if (!isNaN(startYear)) {
                    const currentYear = new Date().getFullYear();
                    const diff = Math.max(0, currentYear - startYear);
                    serviceText = `${diff} year${diff !== 1 ? 's' : ''}`;
                }
            } catch(e) {}
        }

        const upperYearsOfService = document.getElementById("upperYearsOfService");
        if (upperYearsOfService) upperYearsOfService.textContent = serviceText;

        const upperDepartment = document.getElementById("upperDepartment");
        if (upperDepartment) upperDepartment.textContent = department;

        const upperBadge = document.getElementById("upperBadge");
        if (upperBadge) upperBadge.textContent = `Badge #${user[9]}`;

        const personalFirstName = document.getElementById("personalFirstName");
        if (personalFirstName) personalFirstName.textContent = first_name;

        const personalMiddleName = document.getElementById("personalMiddleName");
        if (personalMiddleName) personalMiddleName.textContent = middle_name || "-";

        const personalLastName = document.getElementById("personalLastName");
        if (personalLastName) personalLastName.textContent = last_name;

        const personalBirthDate = document.getElementById("personalBirthDate");
        if (personalBirthDate) personalBirthDate.textContent = birthday;

        const personalGender = document.getElementById("personalGender");
        if (personalGender) personalGender.textContent = gender;

        const personalNationality = document.getElementById("personalNationality");
        if (personalNationality) personalNationality.textContent = nationality;

        const contactEmail = document.getElementById("contactEmail");
        if (contactEmail) contactEmail.textContent = email;

        const contactEmailSec = document.getElementById("contactEmailSec");
        if (contactEmailSec) contactEmailSec.textContent = sec_email || "N/A";

        const contactPhoneWork = document.getElementById("contactPhoneWork");
        if (contactPhoneWork) contactPhoneWork.textContent = work_phone || "N/A";

        const contactPhoneMobile = document.getElementById("contactPhoneMobile");
        if (contactPhoneMobile) contactPhoneMobile.textContent = mobile_phone || "N/A";

        const emergencyName = document.getElementById("emergencyName");
        if (emergencyName) emergencyName.textContent = emerg_name;

        const emergencyRel = document.getElementById("emergencyRel");
        if (emergencyRel) emergencyRel.textContent = emerg_rel;

        const emergencyPhone = document.getElementById("emergencyPhone");
        if (emergencyPhone) emergencyPhone.textContent = emerg_phone;

        const emergencyNameSec = document.getElementById("emergencyNameSec");
        if (emergencyNameSec) emergencyNameSec.textContent = emerg_name2 || "N/A";

        const emergencyRelSec = document.getElementById("emergencyRelSec");
        if (emergencyRelSec) emergencyRelSec.textContent = emerg_rel2 || "N/A";

        const emergencyPhoneSec = document.getElementById("emergencyPhoneSec");
        if (emergencyPhoneSec) emergencyPhoneSec.textContent = emerg_phone2 || "N/A";

        const employmentJobTitle = document.getElementById("employmentJobTitle");
        if (employmentJobTitle) employmentJobTitle.textContent = job_title;

        const employmentDepartment = document.getElementById("employmentDepartment");
        if (employmentDepartment) employmentDepartment.textContent = department;

        const employmentId = document.getElementById("employmentId");
        if (employmentId) employmentId.textContent = user[8] || "";

        const employmentBadge = document.getElementById("employmentBadge");
        if (employmentBadge) employmentBadge.textContent = user[9] || "";

        const employmentStartDate = document.getElementById("employmentStartDate");
        if (employmentStartDate) employmentStartDate.textContent = start_date;

        const employmentYearsOfService = document.getElementById("employmentYearsOfService");
        if (employmentYearsOfService) employmentYearsOfService.textContent = serviceText;

        const employmentSupervisor = document.getElementById("employmentSupervisor");
        if (employmentSupervisor) employmentSupervisor.textContent = supervisor;

        const employmentLocation = document.getElementById("employmentLocation");
        if (employmentLocation) employmentLocation.textContent = location;

        const employmentSchedule = document.getElementById("employmentSchedule");
        if (employmentSchedule) employmentSchedule.textContent = schedule;
    })
    .catch(err => console.error("Error loading profile data:", err));
}

function openEditModal(modalType) {
    const user = window.currentUserProfile;
    if (!user) return;

    if (modalType === 'Personal') {
        document.getElementById("editFirst").value = user[0] || "";
        document.getElementById("editMiddle").value = user[1] || "";
        document.getElementById("editLast").value = user[2] || "";
        document.getElementById("editBirth").value = user[4] || "";
        document.getElementById("editGender").value = user[5] || "Female";
        document.getElementById("editNation").value = user[6] || "";
        document.getElementById("editPersonalModal").style.display = "flex";
    } else if (modalType === 'Contact') {
        document.getElementById("editContactEmail").value = user[11] || "";
        document.getElementById("editContactEmailSec").value = user[12] || "";
        document.getElementById("editContactPhoneWork").value = user[13] || "";
        document.getElementById("editContactPhoneMobile").value = user[14] || "";
        document.getElementById("editContactModal").style.display = "flex";
    } else if (modalType === 'Emergency') {
        document.getElementById("editEmergName").value = user[15] || "";
        document.getElementById("editEmergRel").value = user[17] || "";
        document.getElementById("editEmergPhone").value = user[16] || "";
        document.getElementById("editEmergNameSec").value = user[18] || "";
        document.getElementById("editEmergRelSec").value = user[20] || "";
        document.getElementById("editEmergPhoneSec").value = user[19] || "";
        document.getElementById("editEmergencyModal").style.display = "flex";
    } else if (modalType === 'Employment') {
        document.getElementById("editEmploymentJobTitle").value = user[21] || "";
        document.getElementById("editEmploymentDepartment").value = user[22] || "";
        document.getElementById("editEmploymentType").value = user[23] || "";
        document.getElementById("editEmploymentStartDate").value = user[24] || "";
        document.getElementById("editEmploymentSupervisor").value = user[25] || "";
        document.getElementById("editEmploymentLocation").value = user[26] || "";
        document.getElementById("editEmploymentSchedule").value = user[27] || "";
        document.getElementById("editEmploymentModal").style.display = "flex";
    }
}

function closeEditModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = "none";
}

function submitChanges(modalType) {
    let url = "";
    if (modalType === 'Personal') {
        const first = document.getElementById("editFirst").value.trim();
        const middle = document.getElementById("editMiddle").value.trim();
        const last = document.getElementById("editLast").value.trim();
        const birth = document.getElementById("editBirth").value;
        const gender = document.getElementById("editGender").value;
        const nation = document.getElementById("editNation").value.trim();

        if (!first || !last) {
            showErrorModal("First Name and Last Name are required!", "Please complete the missing fields.", ["editFirst", "editLast"]);
            return;
        }

        url = `/update-personal-details?first_name=${encodeURIComponent(first)}` +
              `&middle_name=${encodeURIComponent(middle)}` +
              `&last_name=${encodeURIComponent(last)}` +
              `&birthday=${encodeURIComponent(birth)}` +
              `&gender=${encodeURIComponent(gender)}` +
              `&nationality=${encodeURIComponent(nation)}`;

    } else if (modalType === 'Contact') {
        const email = document.getElementById("editContactEmail").value.trim();
        const emailSec = document.getElementById("editContactEmailSec").value.trim();
        const phoneWork = document.getElementById("editContactPhoneWork").value.trim();
        const phoneMobile = document.getElementById("editContactPhoneMobile").value.trim();

        url = `/update-contact-details?email=${encodeURIComponent(email)}` +
              `&sec_email=${encodeURIComponent(emailSec)}` +
              `&work_phone=${encodeURIComponent(phoneWork)}` +
              `&mobile_phone=${encodeURIComponent(phoneMobile)}`;

    } else if (modalType === 'Emergency') {
        const name = document.getElementById("editEmergName").value.trim();
        const rel = document.getElementById("editEmergRel").value.trim();
        const phone = document.getElementById("editEmergPhone").value.trim();
        const nameSec = document.getElementById("editEmergNameSec").value.trim();
        const relSec = document.getElementById("editEmergRelSec").value.trim();
        const phoneSec = document.getElementById("editEmergPhoneSec").value.trim();

        url = `/update-emergency-details?emerg_name=${encodeURIComponent(name)}` +
              `&emerg_rel=${encodeURIComponent(rel)}` +
              `&emerg_phone=${encodeURIComponent(phone)}` +
              `&emerg_name2=${encodeURIComponent(nameSec)}` +
              `&emerg_rel2=${encodeURIComponent(relSec)}` +
              `&emerg_phone2=${encodeURIComponent(phoneSec)}`;

    } else if (modalType === 'Employment') {
        const job = document.getElementById("editEmploymentJobTitle").value.trim();
        const dept = document.getElementById("editEmploymentDepartment").value.trim();
        const type = document.getElementById("editEmploymentType").value.trim();
        const start = document.getElementById("editEmploymentStartDate").value.trim();
        const superv = document.getElementById("editEmploymentSupervisor").value.trim();
        const loc = document.getElementById("editEmploymentLocation").value.trim();
        const sched = document.getElementById("editEmploymentSchedule").value.trim();

        url = `/update-employment-details?job_title=${encodeURIComponent(job)}` +
              `&department=${encodeURIComponent(dept)}` +
              `&emp_type=${encodeURIComponent(type)}` +
              `&start_date=${encodeURIComponent(start)}` +
              `&supervisor=${encodeURIComponent(superv)}` +
              `&location=${encodeURIComponent(loc)}` +
              `&schedule=${encodeURIComponent(sched)}`;
    }

    if (!url) return;

    fetch(url, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Profile changes updated successfully!", "success");
            closeEditModal(`edit${modalType}Modal`);
            refreshProfileData();
        } else {
            showErrorModal("Update Failed", "Failed to update profile changes.");
        }
    })
    .catch(err => {
        console.error("Error submitting profile modifications:", err);
        showErrorModal("Error", "An unexpected error occurred during profile update.");
    });
}

function loadSecurityData() {
    fetch("/get-security-settings", { method: "POST" })
    .then(res => res.json())
    .then(data => {
        if (!data) return;

        document.getElementById("toggleTFA").checked = (data.tfa_enabled === "yes");
        document.getElementById("toggleNotif").checked = (data.login_notifications === "yes");
        document.getElementById("toggleActivity").checked = (data.activity_logs_enabled === "yes");

        document.getElementById("statTotalLogins").textContent = `${data.successful_logins_count} times`;

        const accountStatusBadge = document.getElementById("badgeAccountStatus");
        if (accountStatusBadge) {
            accountStatusBadge.textContent = data.account_status;
            if (data.account_status === "Active") {
                accountStatusBadge.style.cssText = "background:#ecfdf5;color:#166534;padding:6px 16px;border-radius:30px;font-weight:700;font-size:14px;";
            } else {
                accountStatusBadge.style.cssText = "background:#fee2e2;color:#991b1b;padding:6px 16px;border-radius:30px;font-weight:700;font-size:14px;";
            }
        }

        const tfaStatusBadge = document.getElementById("badgeTFAStatus");
        if (tfaStatusBadge) {
            tfaStatusBadge.textContent = data.tfa_enabled === "yes" ? "Enabled" : "Disabled";
            if (data.tfa_enabled === "yes") {
                tfaStatusBadge.style.cssText = "background:#dbeafe;color:#1d4ed8;padding:6px 16px;border-radius:30px;font-weight:700;font-size:14px;";
            } else {
                tfaStatusBadge.style.cssText = "background:#cbd5e1;color:#1e293b;padding:6px 16px;border-radius:30px;font-weight:700;font-size:14px;";
            }
        }

        let lastLoginTime = "-";
        if (data.history && data.history.length > 0) {
            const prevSession = data.history.find(session => session[3] === "no");
            if (prevSession) {
                lastLoginTime = prevSession[2];
            } else if (data.history[0]) {
                lastLoginTime = data.history[0][2];
            }
        }
        const statLastLogin = document.getElementById("statLastLogin");
        if (statLastLogin) {
            statLastLogin.textContent = lastLoginTime;
        }

        const containerRecentSessions = document.getElementById("containerRecentSessions");
        if (containerRecentSessions && data.history) {
            containerRecentSessions.innerHTML = "";
            data.history.forEach(session => {
                const isCurrent = session[3] === "yes";
                const sessionHTML = `
                    <div style="background:#f8fafc;padding:16px;border-radius:12px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 15px rgba(0,0,0,0.03); border: 1px solid #e2e8f0;">
                        <div style="display:flex;align-items:center;gap:14px;">
                            <i class="${session[0].toLowerCase().includes("phone") || session[0].toLowerCase().includes("android") || session[0].toLowerCase().includes("ios") ? "fa-solid fa-mobile-screen" : "fa-solid fa-desktop"}" style="font-size:24px;color:#0b2c66;"></i>
                            <div>
                                <strong style="font-size:15px;color:#0f172a;display:block;">${session[0]}</strong>
                                <span style="color:#64748b;font-size:13px;">${session[1]} • ${session[2]}</span>
                            </div>
                        </div>
                        ${isCurrent ? '<span style="background:#ecfdf5;color:#166534;padding:4px 12px;border-radius:30px;font-weight:700;font-size:12px;text-transform:uppercase;">Current</span>' : ''}
                    </div>
                `;
                containerRecentSessions.insertAdjacentHTML("beforeend", sessionHTML);
            });
        }

        window.currentBackupCodes = data.backup_codes;
        updateBackupCodesUI(data.backup_codes);

        window.currentSecurityLogs = data.logs;
        updateSecurityLogsUI(data.logs);
    })
    .catch(err => console.error("Error loading security data:", err));
}

function updateSecurityToggle(type, isChecked) {
    const val = isChecked ? "yes" : "no";
    fetch(`/update-security-toggle?type=${type}&value=${val}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Security toggle updated successfully!", "success");
            loadSecurityData();
        } else {
            showToast("Failed to update toggle state.", "error");
        }
    })
    .catch(err => console.error("Error updating toggle state:", err));
}

function updateBackupCodesUI(codesString) {
    const container = document.getElementById("backupCodesContainer");
    if (container && codesString) {
        const codes = codesString.split(",");
        container.innerHTML = codes.join("<br>");
    }
}

function regenerateBackupCodes() {
    fetch("/regenerate-backup-codes", { method: "POST" })
    .then(res => res.json())
    .then(data => {
        if (data && data.backup_codes) {
            showToast("New backup codes successfully regenerated!", "success");
            window.currentBackupCodes = data.backup_codes;
            updateBackupCodesUI(data.backup_codes);
            loadSecurityData();
        } else {
            showToast("Failed to regenerate emergency codes.", "error");
        }
    })
    .catch(err => console.error("Error regenerating background backup codes:", err));
}

function copyBackupCodes() {
    if (window.currentBackupCodes) {
        const cleanCodes = window.currentBackupCodes.split(",").join("\n");
        navigator.clipboard.writeText(cleanCodes)
        .then(() => showToast("Emergency codes copied to clipboard!", "success"))
        .catch(err => alert("Failed to copy backup codes: " + err));
    }
}

function updateSecurityLogsUI(logs) {
    const container = document.getElementById("securityLogContainer");
    if (container && logs) {
        container.innerHTML = "";
        if (logs.length === 0) {
            container.innerHTML = "<p style='color:#64748b;text-align:center;'>No security logs captured yet.</p>";
            return;
        }
        logs.forEach(log => {
            const eventType = log[0];
            const details = log[1];
            const timestamp = log[2];

            let alertClass = "background:#f0fdf4; border-left:4px solid #10b981; color:#14532d;";
            if (eventType.includes("Failed") || eventType.includes("Toggle") || eventType.includes("Log Toggle") || eventType.includes("Deactivated") || eventType.includes("Purged")) {
                alertClass = "background:#fef2f2; border-left:4px solid #dc2626; color:#7f1d1d;";
            } else if (eventType.includes("Toggle") || eventType.includes("Generated") || eventType.includes("Changed")) {
                alertClass = "background:#fffbeb; border-left:4px solid #fbbf24; color:#78350f;";
            }

            const logHtml = `
                <div style="${alertClass} padding:16px; border-radius:8px; display:flex; flex-direction:column; gap:4px; font-size:14px; text-align:left; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; font-weight:700;">
                        <span>${eventType}</span>
                        <span style="font-weight:400; opacity:0.8; font-size:12px;">${timestamp}</span>
                    </div>
                    <span style="opacity:0.9;">${details}</span>
                </div>
            `;
            container.insertAdjacentHTML("beforeend", logHtml);
        });
    }
}

function submitAdminPasswordChange() {
    const currentPin = document.getElementById("changePassCurrent").value.trim();
    const newPin = document.getElementById("changePassNew").value.trim();
    const confirmPin = document.getElementById("changePassConfirm").value.trim();

    if (!currentPin || !newPin || !confirmPin) {
        showErrorModal("All fields required.", "Please make sure to enter all the input fields.");
        return;
    }

    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(newPin);
    const hasNumber = /[0-9]/.test(newPin);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPin);
    const isLong = newPin.length >= minLength;

    if (!isLong || !hasUppercase || !hasNumber || !hasSpecialChar) {
        showErrorModal("Weak Password", "Please construct a password satisfying all requirements.");
        return;
    }

    if (newPin !== confirmPin) {
        showErrorModal("Mismatch Error", "The new password and password confirmation entries do not match.");
        return;
    }

    fetch(`/change-pin?currentPin=${encodeURIComponent(currentPin)}&newPin=${encodeURIComponent(newPin)}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Account password changed successfully!", "success");
            document.getElementById("changePassCurrent").value = "";
            document.getElementById("changePassNew").value = "";
            document.getElementById("changePassConfirm").value = "";
            closeAllModals();
            loadSecurityData();
        } else {
            showErrorModal("Error", "Error updating password: " + data);
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Error processing change password command.", "error");
    });
}

let targetDeleteUserBadge = null;

function openDeleteUserModal(badge, fullName) {
    targetDeleteUserBadge = badge;
    document.getElementById("deleteUserTargetName").textContent = fullName;
    document.getElementById("deleteUserTargetBadge").textContent = badge;

    const radios = document.getElementsByName("deleteAction");
    for (let i = 0; i < radios.length; i++) {
        if (radios[i].value === "deactivate") {
            radios[i].checked = true;
        }
    }

    document.getElementById("deleteUserModal").style.display = "flex";
}

function updateProfilePendingBadges() {
    fetch("/get-pending-profile-changes", { method: "POST" })
    .then(res => res.json())
    .then(data => {
        const pendingCount = data.length;

        const profileMenu = document.querySelector('button[onclick*="tabClick(3)"]') ||
                            document.querySelector('[onclick*="tabClick(3)"]');
        if (profileMenu) {
            let badge = profileMenu.querySelector('.badge');
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "badge";
                profileMenu.style.position = "relative";
                profileMenu.appendChild(badge);
            }
            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }

        const tabBtn = document.getElementById("pendingReviewsTabBtn");
        if (tabBtn) {
            tabBtn.innerHTML = `Pending Reviews ${pendingCount > 0 ? `<span style="background:#ef4444; color:white; font-size:11px; font-weight:700; padding:2px 6px; border-radius:10px; margin-left:6px;">${pendingCount}</span>` : ''}`;
        }

        const countHeader = document.getElementById("pendingReviewsCountHeader");
        if (countHeader) {
            countHeader.textContent = `${pendingCount} Pending`;
        }
    })
    .catch(err => console.error("Error updating profile badges:", err));
}

function closeDeleteUserModal() {
    document.getElementById("deleteUserModal").style.display = "none";
    targetDeleteUserBadge = null;
}

function submitDeleteUser() {
    if (!targetDeleteUserBadge) return;

    const selectedAction = document.querySelector('input[name="deleteAction"]:checked').value;

    fetch(`/delete-user?badge=${encodeURIComponent(targetDeleteUserBadge)}&action=${encodeURIComponent(selectedAction)}`, {
        method: "POST"
    })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast(`User account removed successfully (${selectedAction === "deactivate" ? "Deactivated" : "Purged"}).`, "success");
            closeDeleteUserModal();
            refreshUsersList();

            if (typeof loadSecurityData === "function") {
                loadSecurityData();
            }
        } else {
            showErrorModal("Removal Failed", "Error removing user account: " + data);
        }
    })
    .catch(err => {
        console.error("Error deleting user:", err);
        showErrorModal("Error", "Failed to submit request.");
    });
}

function loadCertifications() {
    fetch("/get-certifications", { method: "POST" })
    .then(res => res.json())
    .then(certs => {
        const container = document.getElementById("certificationsContainer");
        if (!container) return;
        container.innerHTML = "";

        if (certs.length === 0) {
            container.innerHTML = `
                <div style="grid-column: span 2; text-align: center; padding: 60px; color: #64748b; font-weight: 600;">
                    <i class="fa-solid fa-award" style="font-size: 48px; margin-bottom: 12px; color: #cbd5e1; display: block;"></i>
                    No active licenses or certifications documented yet.
                </div>
            `;
            return;
        }

        certs.forEach(cert => {
            const id = cert.id;
            const name = cert.cert_name;
            const org = cert.issuing_org;
            const issued = cert.issued_date;
            const expiry = cert.expiry_date || "N/A";
            const filePath = cert.file_path;

            let issuedStr = issued;
            let expiryStr = expiry;
            try {
                const opt = { month: 'short', year: 'numeric' };
                issuedStr = new Date(issued).toLocaleDateString('en-US', opt);
                if (expiry !== "N/A") {
                    expiryStr = new Date(expiry).toLocaleDateString('en-US', opt);
                }
            } catch(e) {}

            const hasFile = filePath && filePath !== "none";
            const cardHTML = `
                <div style="background:#f8fafc;border-radius:20px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,0.06); display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                            <div style="display:flex;align-items:center;gap:16px;">
                                <i class="fa-solid fa-award" style="font-size:36px;color:#0b2c66;"></i>
                                <div>
                                    <strong style="font-size:18px;color:#0f172a;display:block;">${name}</strong>
                                    <span style="color:#64748b;font-size:14px;">${org}</span>
                                </div>
                            </div>
                            <span style="background:#ecfdf5;color:#166534;padding:6px 16px;border-radius:30px;font-weight:700;font-size:13px;">Active</span>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0;">
                            <div>
                                <strong style="color:#64748b;font-size:14px;">Issued</strong>
                                <p style="font-weight:700;color:#0f172a;margin:6px 0 0;">${issuedStr}</p>
                            </div>
                            <div>
                                <strong style="color:#64748b;font-size:14px;">Expires</strong>
                                <p style="font-weight:700;color:#0f172a;margin:6px 0 0;">${expiryStr}</p>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;gap:16px;margin-top:24px;">
                        <button onclick="viewCertificateFile('${filePath}')" ${hasFile ? "" : "disabled"} style="flex:1;background:#f1f5f9;color:#0b2c66;padding:12px;border-radius:12px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:${hasFile ? "pointer" : "not-allowed"};opacity:${hasFile ? 1 : 0.5};">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                        <button onclick="downloadCertificateFile('${filePath}')" ${hasFile ? "" : "disabled"} style="flex:1;background:#f1f5f9;color:#0b2c66;padding:12px;border-radius:12px;font-weight:600;border:none;cursor:${hasFile ? "pointer" : "not-allowed"};opacity:${hasFile ? 1 : 0.5};">
                            <i class="fa-solid fa-download"></i> Download
                        </button>
                        <button class="btn-delete" onclick="openDeleteCertModal(${id})" style="background:#fee2e2;color:#dc2626;padding:12px 20px;border-radius:12px;font-weight:600;cursor:pointer;border:none;">Delete</button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML("beforeend", cardHTML);
        });
    })
    .catch(err => console.error("Error loading certifications:", err));
}

function viewCertificateFile(filePath) {
    if (filePath && filePath !== "none") {
        window.open(filePath, "_blank");
    }
}

// Full admin.js complete file
function downloadCertificateFile(filePath) {
    if (filePath && filePath !== "none") {
        const link = document.createElement("a");
        link.href = filePath;
        link.download = filePath.split("/").pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function addNewCertificate() {
    const certName = document.getElementById("addCertName").value.trim();
    const issuingOrg = document.getElementById("addCertOrg").value.trim();
    const issuedDate = document.getElementById("addCertIssued").value;
    const expiryDate = document.getElementById("addCertExpiry").value;
    const fileInput = document.getElementById("addCertFile");

    if (!certName || !issuingOrg || !issuedDate) {
        showErrorModal("Validation Error", "Certification Name, Issuing Organization, and Issued Date are required!", ["addCertName", "addCertOrg", "addCertIssued"]);
        return;
    }

    const formData = new FormData();
    formData.append("cert_name", certName);
    formData.append("issuing_org", issuingOrg);
    formData.append("issued_date", issuedDate);
    formData.append("expiry_date", expiryDate);

    if (fileInput.files.length > 0) {
        formData.append("file", fileInput.files[0]);
    }

    fetch("/add-certification", {
        method: "POST",
        body: formData
    })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Certification added successfully!", "success");
            closeAddCertModal();

            document.getElementById("addCertName").value = "";
            document.getElementById("addCertOrg").value = "";
            document.getElementById("addCertIssued").value = "";
            document.getElementById("addCertExpiry").value = "";
            fileInput.value = "";

            loadCertifications();
        } else {
            showErrorModal("Error", "Failed to add certification: " + data);
        }
    })
    .catch(err => {
        console.error("Error adding certification:", err);
        showErrorModal("Connection Error", "Could not add certification due to network issues.");
    });
}

let targetDeleteCertId = null;

function confirmDeleteCertificate() {
    if (!targetDeleteCertId) return;

    fetch(`/delete-certification?id=${targetDeleteCertId}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Certification deleted permanently.", "success");
            closeDeleteCertModal();
            loadCertifications();
        } else {
            showErrorModal("Deletion Failed", "Error deleting certification: " + data);
        }
    })
    .catch(err => {
        console.error("Error deleting certification:", err);
        showErrorModal("Connection Error", "Could not delete certification.");
    });
}

function loadPendingProfileChanges() {
    fetch("/get-pending-profile-changes", { method: "GET" })
    .then(res => res.json())
    .then(data => {
        const countHeader = document.getElementById("pendingReviewsCountHeader");
        if (countHeader) {
            countHeader.textContent = `${data.length} Pending`;
        }

        const container = document.getElementById("pendingProfileChangesContainer");
        if (!container) return;

        container.innerHTML = "";

        if (data.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 48px; color: #64748b;">
                    <i class="fa-solid fa-clipboard-check" style="font-size: 48px; margin-bottom: 12px; color: #cbd5e1; display: block;"></i>
                    No pending profile changes to review.
                </div>
            `;
            return;
        }

        data.forEach(req => {
            const initials = ((req.first_name || "")[0] || "") + ((req.last_name || "")[0] || "");
            const parsedData = JSON.parse(req.requested_data);

            let detailsHTML = "";
            if (req.change_type === "Employment") {
                detailsHTML = `
                    <strong>Job Title:</strong> ${parsedData.job_title || "N/A"}<br>
                    <strong>Department:</strong> ${parsedData.department || "N/A"}<br>
                    <strong>Type:</strong> ${parsedData.emp_type || "N/A"}<br>
                    <strong>Supervisor:</strong> ${parsedData.supervisor || "N/A"}<br>
                    <strong>Location:</strong> ${parsedData.location || "N/A"}
                `;
            } else {
                detailsHTML = `
                    <strong>Primary Email:</strong> ${parsedData.email || "N/A"}<br>
                    <strong>Secondary Email:</strong> ${parsedData.sec_email || "N/A"}<br>
                    <strong>Work Phone:</strong> ${parsedData.work_phone || "N/A"}<br>
                    <strong>Mobile Phone:</strong> ${parsedData.mobile_phone || "N/A"}<br>
                    <strong>Primary Emergency Contact:</strong> ${parsedData.emerg_name || "N/A"} (${parsedData.emerg_rel || "N/A"}) - ${parsedData.emerg_phone || "N/A"}
                `;
            }

            const itemHTML = `
                <div class="pending-item" style="padding: 24px; border-bottom: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 16px;">
                    <div class="pending-item-header" style="display: flex; align-items: center; gap: 16px;">
                        <div class="pending-item-avatar" style="width: 48px; height: 48px; border-radius: 50%; background: #0b2c66; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                            ${initials.toUpperCase()}
                        </div>
                        <div class="pending-item-info">
                            <strong style="font-size: 16px; color: #0f172a;">Officer ${req.first_name} ${req.last_name}</strong><br>
                            <small style="color: #64748b; font-size: 13px;">Badge #${req.badge_number} • ${req.department || "Patrol"}</small>
                        </div>
                        <span class="time-ago" style="margin-left: auto; color: #94a3b8; font-size: 13px;">Proposed ${req.timestamp}</span>
                    </div>

                    <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border-left: 4px solid #f97316; font-size: 14px; color: #1e293b; line-height: 1.6;">
                        <strong style="color: #f97316; display: block; margin-bottom: 8px;">Requested Category: ${req.change_type} Details</strong>
                        ${detailsHTML}
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button type="button" onclick="reviewProfileChange(${req.id}, 'reject')" style="background: #fee2e2; color: #dc2626; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                            <i class="fa-solid fa-circle-xmark"></i> Deny
                        </button>
                        <button type="button" onclick="reviewProfileChange(${req.id}, 'approve')" style="background: #ecfdf5; color: #10b981; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                            <i class="fa-solid fa-circle-check"></i> Approve & Apply
                        </button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML("beforeend", itemHTML);
        });
        updateProfilePendingBadges();
    })
    .catch(err => console.error("Error loading pending profile changes:", err));
}

function reviewProfileChange(id, action) {
    fetch(`/review-profile-change?id=${id}&action=${action}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Proposal processed successfully.", "success");
            loadPendingProfileChanges();
            updateProfilePendingBadges();
        } else {
            showToast("Failed to process transaction: " + data, "error");
        }
    })
    .catch(err => {
        console.error("Error reviewing profile change:", err);
        showToast("Connection error occurred.", "error");
    });
}

function checkOnboardingStatus() {
    fetch('/check-onboarding')
    .then(res => res.text())
    .then(status => {
        if (status === 'yes') {
            document.getElementById('onboardingOverlay').style.display = 'flex';

            fetch('/get-profile-data', { method: "POST" })
            .then(res2 => res2.json())
            .then(user => {
                if (user) {
                    document.getElementById('obFirst').value = user[0] || '';
                    document.getElementById('obMiddle').value = user[1] || '';
                    document.getElementById('obLast').value = user[2] || '';
                    document.getElementById('obPref').value = user[3] || '';
                    document.getElementById('obBirth').value = user[4] || '';
                    document.getElementById('obGender').value = user[5] || 'Male';
                    document.getElementById('obNation').value = user[6] || 'Philippines';
                    document.getElementById('obBlood').value = user[7] || 'O+';
                    document.getElementById('obSSN').value = user[10] || '';
                    document.getElementById('obEmail').value = user[11] || '';
                    document.getElementById('obWorkPhone').value = user[13] || '';
                    document.getElementById('obMobilePhone').value = user[14] || '';
                    document.getElementById('obEmergName').value = user[15] || '';
                    document.getElementById('obEmergPhone').value = user[16] || '';
                    document.getElementById('obEmergRel').value = user[17] || '';

                    document.getElementById('obJobTitle').value = user[21] || '';
                    document.getElementById('obDepartment').value = user[22] || '';
                    document.getElementById('obEmpType').value = user[23] || 'Full Time';
                    document.getElementById('obStartDate').value = user[24] || '';
                    document.getElementById('obSupervisor').value = user[25] || '';
                    document.getElementById('obWorkLocation').value = user[26] || '';

                    if (user[31] === 'yes') {
                        const schedGroup = document.getElementById('obScheduleGroup');
                        if (schedGroup) schedGroup.style.display = 'flex';
                        if (document.getElementById('obSchedule')) {
                            document.getElementById('obSchedule').value = user[27] || 'Operation (Mon-Sat, 07:00–18:00)';
                        }
                    }
                }
            });
        }
    });
}

function previewOnboardingPic(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('onboardingPicPreview').src = e.target.result;
            document.getElementById('onboardingPicPreview').style.display = 'block';
            document.getElementById('onboardingUploadPlaceholder').style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
}

function uploadOnboardingPic() {
    const fileInput = document.getElementById('onboardingFile');
    if (fileInput.files.length === 0) {
        alert("Please upload a profile photo first!");
        return;
    }
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    fetch("/upload-profile-picture", {
        method: "POST",
        body: formData
    })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            document.getElementById('onboardingStep1').style.display = 'none';
            document.getElementById('onboardingStep2').style.display = 'flex';

            document.getElementById('stepIndicator1').style.color = '#10b981';
            document.getElementById('stepIndicator1').querySelector('span').style.background = '#10b981';

            document.getElementById('stepIndicator2').style.color = '#3b82f6';
            document.getElementById('stepIndicator2').querySelector('span').style.background = '#3b82f6';
            document.getElementById('stepIndicator2').querySelector('span').color = 'white';
        } else {
            alert("Upload transaction failed. Please try again.");
        }
    });
}

function saveOnboardingPersonal() {
    const first = document.getElementById('obFirst').value.trim();
    const last = document.getElementById('obLast').value.trim();
    const email = document.getElementById('obEmail').value.trim();
    const mobile = document.getElementById('obMobilePhone').value.trim();
    const emergName = document.getElementById('obEmergName').value.trim();
    const emergPhone = document.getElementById('obEmergPhone').value.trim();
    const emergRel = document.getElementById('obEmergRel').value.trim();

    if (!first || !last || !email || !mobile || !emergName || !emergPhone || !emergRel) {
        alert("Please specify all required personal information details.");
        return;
    }

    const middle = document.getElementById('obMiddle').value.trim();
    const pref = document.getElementById('obPref').value.trim();
    const birth = document.getElementById('obBirth').value;
    const gender = document.getElementById('obGender').value;
    const nation = document.getElementById('obNation').value.trim();
    const blood = document.getElementById('obBlood').value.trim();
    const ssn = document.getElementById('obSSN').value.trim();
    const workPhone = document.getElementById('obWorkPhone').value.trim();

    const personalUrl = `/update-personal-details?first_name=${encodeURIComponent(first)}` +
                        `&middle_name=${encodeURIComponent(middle)}` +
                        `&last_name=${encodeURIComponent(last)}` +
                        `&birthday=${encodeURIComponent(birth)}` +
                        `&gender=${encodeURIComponent(gender)}` +
                        `&nationality=${encodeURIComponent(nation)}`;

    const contactUrl = `/update-contact-details?email=${encodeURIComponent(email)}` +
                       `&sec_email=${encodeURIComponent(ssn)}` +
                       `&work_phone=${encodeURIComponent(workPhone)}` +
                       `&mobile_phone=${encodeURIComponent(mobile)}`;

    const emergencyUrl = `/update-emergency-details?emerg_name=${encodeURIComponent(emergName)}` +
                         `&emerg_rel=${encodeURIComponent(emergRel)}` +
                         `&emerg_phone=${encodeURIComponent(emergPhone)}` +
                         `&emerg_name2=` +
                         `&emerg_rel2=` +
                         `&emerg_phone2=`;

    Promise.all([
        fetch(personalUrl, { method: "POST" }),
        fetch(contactUrl, { method: "POST" }),
        fetch(emergencyUrl, { method: "POST" })
    ])
    .then(() => {
        document.getElementById('onboardingStep2').style.display = 'none';
        document.getElementById('onboardingStep3').style.display = 'flex';

        document.getElementById('stepIndicator2').style.color = '#10b981';
        document.getElementById('stepIndicator2').querySelector('span').style.background = '#10b981';

        document.getElementById('stepIndicator3').style.color = '#3b82f6';
        document.getElementById('stepIndicator3').querySelector('span').style.background = '#3b82f6';
        document.getElementById('stepIndicator3').querySelector('span').color = 'white';
    })
    .catch(err => {
        console.error(err);
        alert("Connectivity transaction failed. Please retry.");
    });
}

function saveOnboardingDeployment() {
    const job = document.getElementById('obJobTitle').value.trim();
    const dept = document.getElementById('obDepartment').value.trim();
    const type = document.getElementById('obEmpType').value.trim();
    const start = document.getElementById('obStartDate').value;
    const supervisor = document.getElementById('obSupervisor').value.trim();
    const locationVal = document.getElementById('obWorkLocation').value.trim();
    const schedule = document.getElementById('obSchedule') ? document.getElementById('obSchedule').value.trim() : '';

    if (!job || !dept || !type || !start || !supervisor || !locationVal) {
        alert("Please complete the remaining deployment inputs.");
        return;
    }

    const deploymentUrl = `/update-employment-details?job_title=${encodeURIComponent(job)}` +
                          `&department=${encodeURIComponent(dept)}` +
                          `&emp_type=${encodeURIComponent(type)}` +
                          `&start_date=${encodeURIComponent(start)}` +
                          `&supervisor=${encodeURIComponent(supervisor)}` +
                          `&location=${encodeURIComponent(locationVal)}` +
                          `&schedule=${encodeURIComponent(schedule)}`;

    fetch(deploymentUrl, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            fetch('/complete-onboarding', { method: "POST" })
            .then(res2 => res2.text())
            .then(data2 => {
                if (data2 === "Success") {
                    document.getElementById('onboardingOverlay').style.display = 'none';
                    showToast("Account Setup Completed successfully!", "success");

                    if (typeof refreshProfileData === "function") refreshProfileData();
                    if (typeof loadProfilePicture === "function") loadProfilePicture();
                } else {
                    alert("Unable to conclude registration details.");
                }
            });
        } else {
            alert("Deployment synchronization failed.");
        }
    });
}

window.openSecurityLogModal = function() {
    document.getElementById('securityLogModal').style.display = 'flex';
    loadSecurityData();
};

document.addEventListener("DOMContentLoaded", () => {
    updateNotificationBadge();
    loadProfilePicture();
    checkOnboardingStatus();
    loadSecurityData();

    setInterval(refreshReports, 5000);
    setInterval(updateProfilePendingBadges, 5000);
    setInterval(refreshDashboardStats, 5000);

    const adminIncidentSearch = document.getElementById("adminIncidentSearch");
    const adminIncidentTimeFilter = document.getElementById("adminIncidentTimeFilter");
    const adminIncidentSort = document.getElementById("adminIncidentSort");

    if (adminIncidentSearch) {
        adminIncidentSearch.addEventListener("input", filterAdminIncidents);
    }
    if (adminIncidentTimeFilter) {
        adminIncidentTimeFilter.addEventListener("change", filterAdminIncidents);
    }
    if (adminIncidentSort) {
        adminIncidentSort.addEventListener("change", refreshReports);
    }

    const adminReportSearch = document.getElementById("adminReportSearch");
    const adminReportTypeFilter = document.getElementById("adminReportTypeFilter");
    const adminReportSort = document.getElementById("adminReportSort");

    if (adminReportSearch) {
        adminReportSearch.addEventListener("input", filterAdminReports);
    }
    if (adminReportTypeFilter) {
        adminReportTypeFilter.addEventListener("change", filterAdminReports);
    }
    if (adminReportSort) {
        adminReportSort.addEventListener("change", refreshReports);
    }

    const globalSearchInput = document.getElementById("globalHeaderSearch");
    if (globalSearchInput) {
        const parent = globalSearchInput.parentElement;
        parent.style.position = "relative";

        const dropdown = document.createElement("div");
        dropdown.id = "searchDropdown";
        dropdown.className = "search-dropdown";
        dropdown.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
            border: 1px solid #cbd5e1;
            z-index: 9999;
            max-height: 320px;
            overflow-y: auto;
            margin-top: 6px;
            box-sizing: border-box;
        `;
        parent.appendChild(dropdown);

        globalSearchInput.addEventListener("input", runGlobalHeaderSearch);
        globalSearchInput.addEventListener("focus", () => {
            if (globalSearchInput.value.trim()) {
                runGlobalHeaderSearch();
            }
        });
    }

    document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("searchDropdown");
        const searchInput = document.getElementById("globalHeaderSearch");
        if (dropdown && searchInput && !dropdown.contains(e.target) && e.target !== searchInput) {
            dropdown.style.display = "none";
        }
    });

    const dropdownTrigger = document.getElementById("headerProfileTrigger");
    const dropdownMenu = document.getElementById("profileDropdown");

    if (dropdownTrigger && dropdownMenu) {
        dropdownTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = dropdownMenu.style.display === "block";
            dropdownMenu.style.display = isOpen ? "none" : "block";
        });

        document.addEventListener("click", () => {
            dropdownMenu.style.display = "none";
        });
    }

    const wrapper = document.getElementById("profilePicWrapper");
    const fileInput = document.getElementById("profilePicInput");

    if (wrapper && fileInput) {
        wrapper.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append("file", file);

            fetch("/upload-profile-picture", {
                method: "POST",
                body: formData
            })
            .then(res => res.text())
            .then(data => {
                if (data === "Success") {
                    showToast("Profile picture updated successfully!", "success");
                    loadProfilePicture();
                } else {
                    showToast("Failed to upload profile picture.", "error");
                }
            })
            .catch(err => {
                console.error("An error occurred during avatar upload:", err);
                showToast("An error occurred during upload.", "error");
            });
        });
    }
});

const animStyle = document.createElement('style');
animStyle.textContent = `
    @keyframes slideIn { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
    .status-pending, .status-approved { display:flex; align-items:center; gap:16px; padding:16px; border-radius:12px; }
    .status-pending { background:#fffbeb; border:1px solid #fcd34d; }
    .status-approved { background:#f0fdf4; border-color:#86efac; }
    .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin:24px 0; font-size:15px; }
    .detail-grid p { margin:6px 0 0; color:#475569; }

    .search-dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        cursor: pointer;
        transition: background 0.2s;
        color: #1e293b;
        text-align: left;
        border-bottom: 1px solid #f1f5f9;
    }
    .search-dropdown-item:last-child {
        border-bottom: none;
    }
    .search-dropdown-item:hover {
        background: #f1f5f9;
    }
    .search-dropdown-item i {
        font-size: 16px;
        color: #0b2c66;
        width: 24px;
        text-align: center;
    }
    .search-dropdown-item .item-details {
        display: flex;
        flex-direction: column;
    }
    .search-dropdown-item .item-details strong {
        font-size: 14px;
        color: #0f172a;
    }
    .search-dropdown-item .item-details span {
        font-size: 12px;
        color: #64748b;
        margin-top: 2px;
    }
`;
document.head.appendChild(animStyle);