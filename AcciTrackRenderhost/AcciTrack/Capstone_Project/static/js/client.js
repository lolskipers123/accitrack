const separator_string = "[sprtr_str]";
let badgeNumber = "-1";
let currentVideoURL = "";
let currentVideoFile = null;
let reportsToday = 0;
let reportsYesterday = 0;
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
let unreadNotifications = 0;
let hideDetailsGrid = false; // Incident layout view mode state variable

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

tabClick(0);
refreshTasks();
refreshReports();
refreshDashboardStats();

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
        alert("Please enter a task title!");
        return;
    }
    fetch(`/add-task?title=${encodeURIComponent(titleInput.value.trim())}&description=${encodeURIComponent(descInput.value.trim())}&priority=${encodeURIComponent(prioritySelect.value || "low")}`, {
        method: "POST"
    })
    .then(res => res.text())
    .then(data => {
        if (data === "Success"){
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
        if (data === "Success"){
            refreshTasks();
        } else {
            alert("Failed to delete task.");
        }
    })
    .catch(err => console.error("Error deleting task:", err));
}

function logout(){
    window.location.href = "logout";
}

function openReportModal() {
    const modal = document.getElementById("reportModal1");
    modal.classList.add("active");

    document.getElementById("location").value = "";
    document.getElementById("accidentType").value = "";
    document.getElementById("videoPreview").innerHTML = "";
    document.getElementById("videoUpload").value = "";

    const phDate = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Manila"}));
    const formattedDate = phDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

    const datetimeInput = document.getElementById("reportDateTime");
    if (datetimeInput) {
        datetimeInput.value = formattedDate;
    }

    const dropArea = document.getElementById("videoDropArea");
    const fileInput = document.getElementById("videoUpload");

    dropArea.onclick = () => fileInput.click();

    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            currentVideoFile = file;
            const url = URL.createObjectURL(file);
            currentVideoURL = url;

            document.getElementById("videoPreview").innerHTML = `
                <video controls>
                    <source src="${url}" type="${file.type}">
                </video>
                <p style="margin:8px 0 0; color:#475569; font-size:14px;">
                    <strong>${file.name}</strong> (${(file.size/1024/1024).toFixed(2)} MB)</p>`;
        }
    };
}

function closeReportModal(){
    document.getElementById("reportModal1").classList.remove("active");
    document.getElementById("videoPreview").innerHTML = "";
    document.getElementById("videoUpload").value = "";
    currentVideoURL = "";
    currentVideoFile = null;
}

function openReportModalWithTemplate(type) {
    openReportModal();

    const selectElement = document.getElementById("accidentType");
    if (selectElement) {
        selectElement.value = type;
    }

    const officerInput = document.getElementById("officerName");
    if (officerInput && !officerInput.value) {
        const sidebarName = document.getElementById("sidebarOfficerName");
        if (sidebarName) {
            officerInput.value = sidebarName.textContent.trim();
        }
    }
}

function addReport(){
    if (!document.getElementById("location").value || !document.getElementById("accidentType").value) {
        alert("Please fill in location and accident type");
        return;
    }

    // ENFORCE VIDEO REQUIREMENT: Prevent submission if video evidence is missing
    if (!currentVideoFile) {
        alert("Please attach a video evidence file before submitting the report!");
        return;
    }

    // Retrieve and disable submit button to prevent duplicate clicks during upload
    const submitBtn = document.querySelector("#reportModal1 .submit-btn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    }

    try {
        const caseNum = document.getElementById("accidentType").value.substring(0,3).toUpperCase() + "-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random()*9999)+1000).padStart(4, '0');

        let executed = false;
        const dateVal = document.getElementById("reportDateTime").value.trim();

        const formData = new FormData();
        formData.append("file", currentVideoFile, currentVideoFile.name);

        let req = new XMLHttpRequest();
        req.open("POST", `/add-report?caseNum=${caseNum}&officer=${encodeURIComponent(document.getElementById("officerName").value.trim())}&datetime=${encodeURIComponent(dateVal)}&location=${encodeURIComponent(document.getElementById("location").value.trim())}&type=${encodeURIComponent(document.getElementById("accidentType").value.trim())}&status=pending&video=none&realdatetime=${encodeURIComponent(dateVal)}`, true);

        req.onreadystatechange = () => {
            if (req.readyState === 4){
                // Safely restore and re-enable button on complete
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Report';
                }

                if (!executed){
                    if (req.responseText.trim() === "Success"){
                        closeReportModal();

                        const confirmModal = document.getElementById("reportSubmitConfirmModal");
                        if (confirmModal) {
                            confirmModal.style.display = "flex";
                        }

                        refreshReports();

                        document.getElementById("location").value = "";
                        document.getElementById("accidentType").value = "";
                        executed = true;
                    } else {
                        showToast("Failed to submit report.", "error");
                    }
                }
            }
        };
        req.send(formData);
    } catch (e){
        console.error(e);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Report';
        }
        showToast("Error submitting report", "error");
    }
}

function getTimeDifference(start, end) {
    if (!start || isNaN(start.getTime())) return "Recently";
    let diff = Math.abs(end - start);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    diff -= days * (1000 * 60 * 60 * 24);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    diff -= hours * (1000 * 60 * 60);
    const mins = Math.floor(diff / (1000 * 60));
    diff -= mins * (1000 * 60);
    const seconds = Math.floor(diff / 1000);
    return `${days}d ${hours}h ${mins}m ${seconds}s`;
}

function cleanDateString(dateStr) {
    if (!dateStr || dateStr === "Invalid Date" || dateStr === "none" || dateStr === "null") {
        const now = new Date();
        return now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return dateStr;
}

function parseDateSafely(report) {
    let dateStr = report[12] || report[2] || "";
    if (!dateStr || dateStr === "none" || dateStr === "Invalid Date") return new Date(0);
    let cleanStr = String(dateStr).replace("•", "").replace(/\s+/g, " ").trim();
    let timestamp = Date.parse(cleanStr);
    if (isNaN(timestamp)) {
        return new Date(0);
    }
    return new Date(timestamp);
}

function normalizeType(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/&/g, "and").replace(/\//g, " ").replace(/\s+/g, " ").trim();
}

function filterClientReports() {
    const searchInput = document.getElementById("clientReportSearch");
    const filterDropdown = document.getElementById("clientReportTypeFilter");
    const statusDropdown = document.getElementById("clientReportStatusFilter");

    if (!searchInput && !filterDropdown && !statusDropdown) return;

    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedType = filterDropdown ? filterDropdown.value.toLowerCase().trim() : "all types";
    const selectedStatus = statusDropdown ? statusDropdown.value.toLowerCase().trim() : "all";

    const rows = document.querySelectorAll("#reportList .report-row");
    rows.forEach(row => {
        const type = row.getAttribute("data-type") || "";
        const officer = row.getAttribute("data-officer") || "";
        const loc = row.getAttribute("data-location") || "";
        const caseNum = row.getAttribute("data-case") || "";
        const status = row.getAttribute("data-status") || "";

        const matchesType = (selectedType === "all types" || selectedType === "all" || selectedType === "" || normalizeType(type) === normalizeType(selectedType));
        const matchesStatus = (selectedStatus === "all" || selectedStatus === "" || status === selectedStatus);

        const matchesSearch = searchQuery === "" ||
                              type.includes(searchQuery) ||
                              officer.includes(searchQuery) ||
                              loc.includes(searchQuery) ||
                              caseNum.includes(searchQuery);

        if (matchesType && matchesStatus && matchesSearch) {
            row.style.display = "flex";
        } else {
            row.style.display = "none";
        }
    });
}

function filterClientIncidents() {
    const searchInput = document.getElementById("incidentSearch");
    const timeFilter = document.getElementById("incidentTimeFilter");

    if (!searchInput && !timeFilter) return;

    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedTime = timeFilter ? timeFilter.value : "all";

    const grid = document.getElementById("incident-grid");
    if (!grid) return;

    const children = Array.from(grid.children);
    const incidentIdPairs = {};

    children.forEach(child => {
        const incId = child.getAttribute("data-incident-id");
        if (!incId) return;

        const officer = child.getAttribute("data-officer") || "";
        const dateText = child.getAttribute("data-date") || "";
        const location = child.getAttribute("data-location") || "";
        const type = child.getAttribute("data-type") || "";

        const matchesSearch = searchQuery === "" ||
                              officer.includes(searchQuery) ||
                              dateText.includes(searchQuery) ||
                              location.includes(searchQuery) ||
                              type.includes(searchQuery) ||
                              incId.toLowerCase().includes(searchQuery);

        if (!incidentIdPairs[incId]) {
            incidentIdPairs[incId] = { show: matchesSearch, elements: [] };
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
                <span>${case_num} • ${location}</span>
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

function refreshReports(){
    // Fetch personal reports submitted by the logged-in officer
    fetch("/get-reports", { method: "POST" })
    .then(res => res.json())
    .then(myReports => {
        // Fetch all reports across the department to populate the Incident Grid, Recent Incidents Panel, and Active Cases
        return fetch("/admin-get-reports", { method: "POST" })
        .then(res => res.json())
        .then(allReports => {

            const sortVal = document.getElementById("incidentSort") ? document.getElementById("incidentSort").value : "newest";

            // SMART SERIALIZATION CHECK: Skips rebuilding the DOM if no reports data or sorting selection has changed.
            // This prevents sudden jumps or flickering on scroll when background threads perform validation polls.
            const reportsSerialized = JSON.stringify(myReports) + "_" + JSON.stringify(allReports) + "_" + sortVal;
            if (window.lastReportsSerialized === reportsSerialized) {
                return;
            }
            window.lastReportsSerialized = reportsSerialized;

            window.myReports = myReports;
            window.allReports = allReports;

            const reportList = document.getElementById("reportList");
            const reportNotifications = document.getElementById("reportNotifications");

            if (reportList) reportList.innerHTML = "";
            if (reportNotifications) reportNotifications.innerHTML = "";

            unreadNotifications = 0;

            myReports.sort((a, b) => {
                if (sortVal === "newest") {
                    return parseDateSafely(b) - parseDateSafely(a);
                } else if (sortVal === "oldest") {
                    return parseDateSafely(a) - parseDateSafely(b);
                } else if (sortVal === "alphabetical") {
                    return (a[4] || "").localeCompare(b[4] || "");
                }
                return parseDateSafely(b) - parseDateSafely(a);
            });

            let countMinor = 0;
            let countReckless = 0;
            let countDui = 0;
            let countHit = 0;
            let countPile = 0;
            let countHomic = 0;

            myReports.forEach(report => {
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

            const totalCases = myReports.length;
            const approvedCases = myReports.filter(r => r[5] === "approved").length;

            const profileTotalCases = document.getElementById("profileTotalCases");
            const profileApprovedCases = document.getElementById("profileApprovedCases");
            if (profileTotalCases) profileTotalCases.textContent = totalCases;
            if (profileApprovedCases) profileApprovedCases.textContent = approvedCases;

            myReports.forEach(report => {
                let case_num = report[0] || "N/A";
                let submitting_officer = report[1] || "Unknown";
                let submitting_datetime = cleanDateString(report[2] || "N/A");
                let location = report[3] || "Unknown";
                let type = report[4] || "Unknown";
                let status = report[5] || "pending";
                let reviewing_reason = report[9] || "none";
                let report_is_read = report[10] || "yes";

                const iconInfo = accidentIcons[type] || accidentIcons["Minor Traffic Accident"];

                if (reportList) {
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
                        statusStyle = "background:#eff6ff; color:#1d4ed8;";
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
                    reportList.appendChild(newRow);
                }

                const isUnread = (report_is_read === "no");

                if (reportNotifications) {
                    const accident = accidentTypes.find(a => a.type === type) || accidentTypes[0];
                    const card = document.createElement("div");
                    let badgeClass = status === "changes_requested" ? "changes" : status;

                    card.className = `report-card ${status} ${isUnread ? 'unread' : 'read'}`;
                    card.style.cursor = "pointer";

                    card.innerHTML = `
                        <div class="report-icon ${status}">
                            <i class="${accident.icon}" style="color: ${accident.color};"></i>
                        </div>
                        <div class="report-content">
                            <h3>${type}</h3>
                            <p><strong>Officer:</strong> ${submitting_officer} • <strong>Location:</strong> ${location}</p>
                            ${reviewing_reason && reviewing_reason !== "none" ? `<small>Reason: ${reviewing_reason}</small>` : ""}
                        </div>
                        <div class="report-meta" style="${isUnread ? 'margin-right: 40px;' : ''}">
                            <div class="status-badge ${badgeClass}">
                                <i class="fa-solid ${status === 'pending' ? 'fa-clock' : status === 'approved' ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                ${status.replace("_", " ").toUpperCase()}
                            </div>
                            <div class="time-ago">${getTimeDifference(parseDateSafely(report), new Date())} ago</div>
                        </div>
                    `;
                    card.onclick = () => openNotificationModal(report);
                    reportNotifications.appendChild(card);
                }

                if (isUnread) {
                    unreadNotifications++;
                }
            });

            updateNotificationBadge();

            const incidentGrid = document.getElementById("incident-grid");
            if (incidentGrid) incidentGrid.innerHTML = "";

            const recentIncidentsPanel = document.querySelector(".recent-incidents-panel");
            if (recentIncidentsPanel) {
                recentIncidentsPanel.innerHTML = `
                    <h3>Recent Incidents</h3>
                    <small>Latest reported from body cameras</small>
                `;
            }

            reportsToday = 0;
            reportsYesterday = 0;

            allReports.sort((a, b) => parseDateSafely(b) - parseDateSafely(a));

            const activeCasesPanel = document.querySelector(".panel.active-cases");
            if (activeCasesPanel) {
                const existingCases = activeCasesPanel.querySelectorAll(".case");
                existingCases.forEach(c => c.remove());

                const top3Reports = allReports.slice(0, 3);
                window.activeCasesReports = top3Reports;

                top3Reports.forEach((report, index) => {
                    const case_num = report[0] || "N/A";
                    const submitting_officer = report[1] || "Unknown Officer";
                    const type = report[4] || "Unknown Incident";
                    const status = report[5] || "pending";

                    let badgeText = "Pending";
                    let badgeClass = "medium";
                    let progressWidth = "40%";

                    if (status === "approved") {
                        badgeText = "Resolved";
                        badgeClass = "resolved";
                        progressWidth = "100%";
                    } else if (status === "denied") {
                        badgeText = "Rejected";
                        badgeClass = "high";
                        progressWidth = "100%";
                    } else if (status === "changes_requested" || status === "changes") {
                        badgeText = "Revisions Required";
                        badgeClass = "high";
                        progressWidth = "70%";
                    }

                    const caseHtml = `
                        <div class="case" onclick="openReportDetailModal(window.activeCasesReports[${index}])">
                            <div class="case-header">
                                <i class="fa-solid fa-file-lines"></i>
                                <span class="case-id">${case_num}</span>
                                <span class="badge ${badgeClass}">${badgeText}</span>
                            </div>
                            <div class="case-title">${type}</div>
                            <div class="case-officer">Submitted by ${submitting_officer}</div>
                            <div class="progress-bar">
                                <div class="progress" style="width: ${progressWidth}"></div>
                            </div>
                            <div class="progress-percent">${progressWidth}</div>
                        </div>
                    `;
                    activeCasesPanel.insertAdjacentHTML("beforeend", caseHtml);
                });
            }

            allReports.forEach(report => {
                let submitting_datetime = cleanDateString(report[2] || "N/A");
                let video = report[6] || "none";
                let submitting_officer = report[1] || "Unknown";
                let submitting_officer_badge_number = report[11] || "N/A";
                let type = report[4] || "Unknown";
                let location = report[3] || "Unknown";
                let case_num = report[0] || "N/A";

                try {
                    if (new Date(submitting_datetime).toLocaleString('en-PH', {dateStyle: 'medium'}) == new Date().toLocaleString('en-PH', {dateStyle: 'medium'})){
                        reportsToday += 1;
                    }
                    if (new Date(submitting_datetime).toLocaleString('en-PH', {dateStyle: 'medium'}) == yesterday.toLocaleString('en-PH', {dateStyle: 'medium'})){
                        reportsYesterday += 1;
                    }
                } catch(e) {}

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
                    videoCard.setAttribute("data-incident-id", case_num);
                    videoCard.setAttribute("data-type", type.toLowerCase());

                    detailsGrid.setAttribute("data-officer", submitting_officer.toLowerCase());
                    detailsGrid.setAttribute("data-date", submitting_datetime.toLowerCase());
                    detailsGrid.setAttribute("data-location", location.toLowerCase());
                    detailsGrid.setAttribute("data-incident-id", case_num);
                    detailsGrid.setAttribute("data-type", type.toLowerCase());

                    const cleanVideo = video ? video.replaceAll("\\\\", "/") : "none";

                    videoCard.innerHTML = `
                    <video controls>
                        <source src="${cleanVideo}" type="video/mp4">
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

            if (recentIncidentsPanel) {
                let displayReports = allReports.slice(0, 6);

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
                        badgeText = "RESOLVED";
                    } else if (status === "denied") {
                        badgeStyle = "background: #ef4444; color: white;";
                        badgeText = "DENIED";
                    } else if (status === "changes_requested" || status === "changes") {
                        badgeStyle = "background: #3b82f6; color: white;";
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
                            ${getTimeDifference(parseDateSafely(report), new Date())} ago
                        </div>
                    `;
                    incidentRow.onclick = () => openReportDetailModal(report);
                    recentIncidentsPanel.appendChild(incidentRow);
                });
            }

            refreshDashboardStats();
            filterClientIncidents();
            filterClientReports();

            const detailsCards = document.querySelectorAll("#incident-grid .details-grid");
            detailsCards.forEach(el => {
                el.style.display = hideDetailsGrid ? "none" : "";
            });
            const grid = document.getElementById("incident-grid");
            if (grid) {
                grid.style.gridTemplateColumns = hideDetailsGrid ? "1fr" : "520px 1fr";
            }
        });
    })
    .catch(err => console.error("Error loading reports and incidents:", err));
}

function openReportDetailModal(report){
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
    let report_is_read = report[10] || "yes";

    // Mark reviewed reports as read on opening details modal
    if (report_is_read === "no") {
        unreadNotifications = Math.max(0, unreadNotifications - 1);
        updateNotificationBadge();

        fetch(`/mark-report-read?caseNum=${encodeURIComponent(case_num)}`, { method: "POST" })
        .then(res => res.text())
        .then(data => {
            if (data === "Success") {
                report[10] = "yes";
                refreshReports();
            }
        })
        .catch(err => console.error("Error marking report read:", err));
    }

    const iconInfo = accidentIcons[type] || accidentIcons["Minor Traffic Accident"];
    let statusHTML = "";
    if (status === "pending") {
        statusHTML = `<div class="status-pending"><i class="fa-solid fa-clock"></i><div><strong>Pending Review</strong><p>Waiting for Administrator approval</p></div></div>`;
    } else if (status === "approved") {
        statusHTML = `<div class="status-approved"><i class="fa-solid fa-circle-check"></i><div><strong>Approved by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Admin'}</strong><p>Approved on ${reviewing_datetime}</p></div></div>`;
    } else if (status === "denied") {
        statusHTML = `<div class="status-approved" style="background:#fee2e2; border-color:#fca5a5;"><i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i><div><strong>Denied by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Admin'}</strong><p>Reason: ${reviewing_reason}</p></div></div>`;
    } else if (status === "changes_requested" || status === "changes") {
        statusHTML = `<div class="status-approved" style="background:#eff6ff; border-color:#bfdbfe;"><i class="fa-solid fa-triangle-exclamation" style="color:#2563eb;"></i><div><strong>Changes Requested by ${reviewing_officer && reviewing_officer !== 'none' ? reviewing_officer : 'Admin'}</strong><p>Instructions: ${reviewing_reason}</p></div></div>`;
    }

    const header = document.querySelector("#detailModal .modal-header h2");
    if (header) {
        header.innerHTML = `<i class="fa-solid fa-file-lines"></i> Case ${case_num}`;
    }

    const body = document.getElementById("detailContent");
    if (body) {
        let videoHTML = "";
        if (video && video !== "none" && video !== "null") {
            const cleanVideo = video.replaceAll("\\\\", "/");
            videoHTML = `
                <div class="video-section">
                    <h3>Captured Video Evidence</h3>
                    <video controls style="width:100%; max-height:400px; border-radius:12px; background:black; box-shadow:0 4px 15px rgba(0,0,0,0.5);">
                        <source src="${cleanVideo}" type="video/mp4">
                    </video>
                </div>
            `;
        }

        body.innerHTML = `
            ${videoHTML}
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left; background: rgba(0,0,0,0.02); padding: 24px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.05); margin-top: 24px; margin-bottom: 24px; color: black;">
                <div>
                    <strong style="color: #64748b; font-size: 13px; display: block; margin-bottom: 4px; text-transform: uppercase;">Incident Type</strong>
                    <span style="font-size: 15px; font-weight: 700; color: #1e293b;">${type}</span>
                </div>
                <div>
                    <strong style="color: #64748b; font-size: 13px; display: block; margin-bottom: 4px; text-transform: uppercase;">Submitting Officer</strong>
                    <span style="font-size: 15px; font-weight: 700; color: #1e293b;">${submitting_officer}</span>
                </div>
                <div>
                    <strong style="color: #64748b; font-size: 13px; display: block; margin-bottom: 4px; text-transform: uppercase;">Date & Time of Incident</strong>
                    <span style="font-size: 15px; font-weight: 700; color: #1e293b;">${realdatetime || submitting_datetime}</span>
                </div>
                <div>
                    <strong style="color: #64748b; font-size: 13px; display: block; margin-bottom: 4px; text-transform: uppercase;">Incident Location</strong>
                    <span style="font-size: 15px; font-weight: 700; color: #1e293b;"><i class="fa-solid fa-location-dot" style="color:#ef4444; margin-right: 6px;"></i> ${location}</span>
                </div>
            </div>
            <div style="margin-top:24px;">
                ${statusHTML}
            </div>
        `;
    }

    document.getElementById("detailModal").classList.add("active");
}

function closeReportDetailModal(){
    document.getElementById("detailModal").classList.remove("active");
}

function openNotificationModal(report) {
    const modal = document.getElementById("notificationModal");
    if (!modal) return;

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
    let report_is_read = report[10];
    let realdatetime = cleanDateString(report[12]);

    const iconInfo = accidentIcons[type] || accidentIcons["Minor Traffic Accident"];

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
        statusColor = "#3b82f6"; // Changes Requested (Blue)
        statusBg = "rgba(59, 130, 246, 0.08)";
        statusBorder = "#3b82f6";
        statusText = "REVISIONS REQUESTED";
        statusIcon = "fa-triangle-exclamation";
        feedbackHTML = `
            <div style="background: rgba(59, 130, 246, 0.08); border-left: 5px solid #3b82f6; padding: 20px; border-radius: 12px; margin-top: 24px; text-align: left;">
                <strong style="color: #3b82f6; font-size: 16px; display: flex; align-items: center; gap: 8px;">
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

    let videoHTML = "";
    if (video && video !== "none" && video !== "null") {
        const cleanVideo = video.replaceAll("\\\\", "/");
        videoHTML = `
            <div style="margin-bottom: 24px; text-align: left;">
                <strong style="color: white; font-size: 15px; display: block; margin-bottom: 12px;"><i class="fa-solid fa-video"></i> Captured Video Evidence</strong>
                <video controls style="width: 100%; max-height: 380px; border-radius: 12px; background: black; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                    <source src="${cleanVideo}" type="video/mp4">
                </video>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; width: 90%; max-width: 760px; overflow: hidden; box-shadow: 0 25px 70px rgba(0,0,0,0.55); position: relative; display: flex; flex-direction: column;">
            <div class="modal-header" style="padding: 24px 32px; display: flex; align-items: center; gap: 18px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #0b2c66; color: white; position: relative;">
                <div style="width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; background: rgba(255,255,255,0.1); flex-shrink: 0;">
                    <i class="fa-solid ${iconInfo.icon}" style="color: ${iconInfo.color};"></i>
                </div>
                <div style="flex: 1; text-align: left;">
                    <h2 style="font-size: 19px; font-weight: 800; color: white; margin: 0;">${type}</h2>
                    <span style="display: inline-block; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder}; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-top: 6px; letter-spacing: 0.5px;">
                        <i class="fa-solid ${statusIcon}"></i> ${statusText}
                    </span>
                </div>
                <button onclick="closeNotificationModal()" style="all: unset; position: absolute; top: 16px; right: 20px; font-size: 32px; color: #94a3b8; cursor: pointer; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='white'"
                        onmouseout="this.style.background='transparent'; this.style.color='#94a3b8'">&times;</button>
            </div>
            <div class="modal-body" style="padding: 32px; color: #cbd5e1; display: flex; flex-direction: column; overflow-y: auto; max-height: 65vh; border-bottom: 1px solid rgba(255,255,255,0.08);">
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
            </div>
            <div class="modal-footer" style="padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; background: #1e293b;">
                <div style="display: flex; gap: 12px;">
                    <button class="btn-cancel" onclick="window.printNotificationReport('${case_num}')" style="background: #334155; color: white; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 10px; cursor: pointer; border: none; transition: 0.2s;" onmouseover="this.style.background='#475569'" onmouseout="this.style.background='#334155'">
                        <i class="fa-solid fa-print"></i> Print Report
                    </button>
                </div>
                <button onclick="closeNotificationModal()" style="background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">Close</button>
            </div>
        </div>
    `;

    modal.style.display = "flex";
    modal.classList.add("show");

    if (report_is_read === "no") {
        unreadNotifications = Math.max(0, unreadNotifications - 1);
        updateNotificationBadge();

        fetch(`/mark-report-read?caseNum=${encodeURIComponent(case_num)}`, { method: "POST" })
        .then(res => res.text())
        .then(data => {
            if (data === "Success") {
                report[10] = "yes";
                refreshReports();
            }
        })
        .catch(err => console.error("Error marking report read:", err));
    }
}

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
                .status-badge.changes_requested { background: #eff6ff; color: #1d4ed8; }
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
                    <p style="margin: 0; font-weight: bold; color: #0b2c66; font-size: 17px;">CASE REF: ${case_num}</p>
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
                This document is generated by PNP AcciTrack Registry Center.<br>
                Confidential Personnel Data Sheet • Philippine National Police
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

window.closeNotificationModal = function() {
    const modal = document.getElementById("notificationModal");
    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("show");
    }
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
    const notifMenu = document.querySelector('button[onclick="tabClick(4)"]');
    if (notifMenu) {
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

    const unreadCountText = document.getElementById("unreadCountText");
    if (unreadCountText) {
        unreadCountText.textContent = `${unreadNotifications} Unread Report${unreadNotifications !== 1 ? 's' : ''}`;
    }
}

function openClientEditModal(type) {
    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        if (!user) return;

        if (type === "Personal") {
            document.getElementById("client-edit-first-name").value = user[0] || "";
            document.getElementById("client-edit-middle-name").value = user[1] || "";
            document.getElementById("client-edit-last-name").value = user[2] || "";
            document.getElementById("client-edit-birthday").value = user[4] || "";
            document.getElementById("client-edit-gender").value = user[5] || "Male";
            document.getElementById("client-edit-nationality").value = user[6] || "";
            document.getElementById("clientEditPersonalModal").style.display = "flex";
        } else if (type === "Contact") {
            document.getElementById("client-edit-email").value = user[11] || "";
            document.getElementById("client-edit-sec-email").value = user[12] || "";
            document.getElementById("client-edit-work-phone").value = user[13] || "";
            document.getElementById("client-edit-mobile-phone").value = user[14] || "";
            document.getElementById("clientEditContactModal").style.display = "flex";
        } else if (type === "Emergency") {
            document.getElementById("client-edit-emerg-name").value = user[15] || "";
            document.getElementById("client-edit-emerg-phone").value = user[16] || "";
            document.getElementById("client-edit-emerg-rel").value = user[17] || "";
            document.getElementById("client-edit-emerg-name2").value = user[18] || "";
            document.getElementById("client-edit-emerg-rel2").value = user[20] || "";
            document.getElementById("client-edit-emerg-phone2").value = user[19] || "";
            document.getElementById("clientEditEmergencyModal").style.display = "flex";
        }
    });
}

function openEmploymentEditModal() {
    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        if (!user) return;
        document.getElementById("client-edit-job-title").value = user[21] || "";
        document.getElementById("client-edit-department").value = user[22] || "";
        document.getElementById("client-edit-type").value = user[23] || "";
        document.getElementById("client-edit-reporting").value = user[25] || "";
        document.getElementById("client-edit-location").value = user[26] || "";
        document.getElementById("clientEditEmploymentModal").style.display = "flex";
    });
}

function openHistoryEditModal() {
    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        if (!user) return;

        document.getElementById("client-promo-job").value = "";
        document.getElementById("client-promo-dept").value = "";
        document.getElementById("client-promo-start").value = "";

        document.getElementById("clientEditHistoryModal").style.display = "flex";
    });
}

function submitPersonalChangeRequest() {
    const first_name = document.getElementById("client-edit-first-name").value.trim();
    const middle_name = document.getElementById("client-edit-middle-name").value.trim();
    const last_name = document.getElementById("client-edit-last-name").value.trim();
    const birthday = document.getElementById("client-edit-birthday").value.trim();
    const gender = document.getElementById("client-edit-gender").value;
    const nationality = document.getElementById("client-edit-nationality").value.trim();

    const url = `/update-profile?change_type=Personal` +
                `&first_name=${encodeURIComponent(first_name)}` +
                `&middle_name=${encodeURIComponent(middle_name)}` +
                `&last_name=${encodeURIComponent(last_name)}` +
                `&birthday=${encodeURIComponent(birthday)}` +
                `&gender=${encodeURIComponent(gender)}` +
                `&nationality=${encodeURIComponent(nationality)}`;

    fetch(url, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success" || data === "Pending") {
            closeEditModal("clientEditPersonalModal");
            const confirmModal = document.getElementById("submitConfirmModal");
            if (confirmModal) confirmModal.style.display = "flex";
        } else {
            showToast("Failed to submit request", "error");
        }
    })
    .catch(err => console.error("Error submitting personal details:", err));
}

function submitContactChangeRequest() {
    const email = document.getElementById("client-edit-email").value.trim();
    const sec_email = document.getElementById("client-edit-sec-email").value.trim();
    const work_phone = document.getElementById("client-edit-work-phone").value.trim();
    const mobile_phone = document.getElementById("client-edit-mobile-phone").value.trim();

    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        const url = `/update-profile?change_type=Contact` +
                    `&email=${encodeURIComponent(email)}` +
                    `&sec_email=${encodeURIComponent(sec_email)}` +
                    `&work_phone=${encodeURIComponent(work_phone)}` +
                    `&mobile_phone=${encodeURIComponent(mobile_phone)}` +
                    `&emerg_name=${encodeURIComponent(user[15] || "")}` +
                    `&emerg_phone=${encodeURIComponent(user[16] || "")}` +
                    `&emerg_rel=${encodeURIComponent(user[17] || "")}` +
                    `&emerg_name2=${encodeURIComponent(user[18] || "")}` +
                    `&emerg_phone2=${encodeURIComponent(user[19] || "")}` +
                    `&emerg_rel2=${encodeURIComponent(user[20] || "")}`;

        fetch(url, { method: "POST" })
        .then(res => res.text())
        .then(data => {
            if (data === "Success" || data === "Pending") {
                closeEditModal("clientEditContactModal");
                const confirmModal = document.getElementById("submitConfirmModal");
                if (confirmModal) {
                    confirmModal.style.display = "flex";
                }
            } else {
                showToast("Failed to submit request", "error");
            }
        });
    });
}

function submitEmergencyChangeRequest() {
    const emergName = document.getElementById("client-edit-emerg-name").value.trim();
    const emergRel = document.getElementById("client-edit-emerg-rel").value.trim();
    const emergPhone = document.getElementById("client-edit-emerg-phone").value.trim();
    const emergName2 = document.getElementById("client-edit-emerg-name2").value.trim();
    const emergRel2 = document.getElementById("client-edit-emerg-rel2").value.trim();
    const emergPhone2 = document.getElementById("client-edit-emerg-phone2").value.trim();

    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        const url = `/update-profile?change_type=Contact` +
                    `&email=${encodeURIComponent(user[11] || "")}` +
                    `&sec_email=${encodeURIComponent(user[12] || "")}` +
                    `&work_phone=${encodeURIComponent(user[13] || "")}` +
                    `&mobile_phone=${encodeURIComponent(user[14] || "")}` +
                    `&emerg_name=${encodeURIComponent(emergName)}` +
                    `&emerg_phone=${encodeURIComponent(emergPhone)}` +
                    `&emerg_rel=${encodeURIComponent(emergRel)}` +
                    `&emerg_name2=${encodeURIComponent(emergName2)}` +
                    `&emerg_phone2=${encodeURIComponent(emergPhone2)}` +
                    `&emerg_rel2=${encodeURIComponent(emergRel2)}`;

        fetch(url, { method: "POST" })
        .then(res => res.text())
        .then(data => {
            if (data === "Success" || data === "Pending") {
                closeEditModal("clientEditEmergencyModal");
                const confirmModal = document.getElementById("submitConfirmModal");
                if (confirmModal) confirmModal.style.display = "flex";
            } else {
                showToast("Failed to submit request", "error");
            }
        });
    });
}

function submitEmploymentChangeRequest() {
    const job_title = document.getElementById("client-edit-job-title").value.trim();
    const department = document.getElementById("client-edit-department").value.trim();
    const emp_type = document.getElementById("client-edit-type").value.trim();
    const supervisor = document.getElementById("client-edit-reporting").value.trim();
    const location = document.getElementById("client-edit-location").value.trim();

    const url = `/update-profile?change_type=Employment` +
                `&job_title=${encodeURIComponent(job_title)}` +
                `&department=${encodeURIComponent(department)}` +
                `&emp_type=${encodeURIComponent(emp_type)}` +
                `&supervisor=${encodeURIComponent(supervisor)}` +
                `&location=${encodeURIComponent(location)}`;

    fetch(url, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success" || data === "Pending") {
            closeEditModal("clientEditEmploymentModal");
            const confirmModal = document.getElementById("submitConfirmModal");
            if (confirmModal) confirmModal.style.display = "flex";
        } else {
            showToast("Failed to submit request", "error");
        }
    })
    .catch(err => console.error("Error submitting employment details:", err));
}

function submitHistoryChangeRequest() {
    const job = document.getElementById("client-promo-job").value.trim();
    const dept = document.getElementById("client-promo-dept").value.trim();
    const start = document.getElementById("client-promo-start").value;

    if (!job || !dept || !start) {
        alert("Please fill in all the promotion fields.");
        return;
    }

    const url = `/update-profile?change_type=Promotion` +
                `&job_title=${encodeURIComponent(job)}` +
                `&department=${encodeURIComponent(dept)}` +
                `&start_date=${encodeURIComponent(start)}`;

    fetch(url, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success" || data === "Pending") {
            closeEditModal("clientEditHistoryModal");
            const confirmModal = document.getElementById("submitConfirmModal");
            if (confirmModal) confirmModal.style.display = "flex";
        } else {
            showToast("Failed to submit promotion request", "error");
        }
    })
    .catch(err => console.error("Error submitting history change request:", err));
}

function getFormattedStartDate(dateText) {
    if (!dateText) return "N/A";
    try {
        const date = new Date(dateText);
        if (isNaN(date.getTime())) return dateText;
        return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
        return dateText;
    }
}

function getTenureYears(startDateText) {
    if (!startDateText) return "0 years";
    try {
        const start = new Date(startDateText);
        if (isNaN(start.getTime())) return "0 years";
        const diffMs = Date.now() - start.getTime();
        const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
        return `${diffYears} year${diffYears !== 1 ? 's' : ''}`;
    } catch {
        return "0 years";
    }
}

function updateEmploymentHistorySection() {
    const user = window.currentUserProfile;
    if (!user) return;

    const currentJob = user[21] || "Senior Police Officer";
    const currentDept = user[22] || "Patrol Division";
    const startDate = user[24] || "";
    const historyDataRaw = user[27] || "";

    const historyCurrentJob = document.getElementById("historyCurrentJob");
    const historyCurrentDept = document.getElementById("historyCurrentDept");
    const historyCurrentTenure = document.getElementById("historyCurrentTenure");

    if (historyCurrentJob) historyCurrentJob.textContent = currentJob;
    if (historyCurrentDept) historyCurrentDept.textContent = currentDept;
    if (historyCurrentTenure) {
        const formattedStart = getFormattedStartDate(startDate);
        const tenureYears = getTenureYears(startDate);
        historyCurrentTenure.innerHTML = `${formattedStart} – Present • <strong>${tenureYears}</strong>`;
    }

    const historyList = document.querySelector(".history-list");
    if (!historyList) return;

    // Preserving current item
    const currentItemHTML = historyList.querySelector(".history-item.current") ? historyList.querySelector(".history-item.current").outerHTML : "";
    let timelineHTML = currentItemHTML;

    if (historyDataRaw) {
        try {
            const pastRoles = JSON.parse(historyDataRaw);
            if (Array.isArray(pastRoles)) {
                pastRoles.forEach(role => {
                    timelineHTML += `
                        <div class="history-item" style="border-left: 5px solid #64748b; margin-top: 16px; background:#f8fafc; padding:20px; border-radius:14px; display:flex; justify-content:space-between; align-items:center;">
                            <div class="role-info">
                                <h4 style="font-size:16px; font-weight:700; color:#1a1a1a; margin:0 0 4px 0;">${role.role || "N/A"}</h4>
                                <p style="font-size:14px; color:#666; margin:0;">${role.dept || "N/A"}</p>
                                <p class="tenure" style="font-size:13px; color:#777; margin-top:6px;">${role.tenure || "N/A"}</p>
                            </div>
                            <div class="past-badge" style="background:#64748b; color:white; font-size:11px; font-weight:800; padding:6px 14px; border-radius:20px;">Previous</div>
                        </div>
                    `;
                });
            }
        } catch (e) {
            timelineHTML += `
                <div class="history-item" style="border-left: 5px solid #64748b; margin-bottom:16px; background:#f8fafc; padding:20px; border-radius:14px;">
                    <div class="role-info">
                        <p style="font-size:14px; color:#666; margin:0;">${historyDataRaw}</p>
                    </div>
                </div>
            `;
        }
    }

    historyList.innerHTML = timelineHTML;
}

function refreshProfileData() {
    fetch("/get-profile-data", { method: "POST" })
    .then(res => res.json())
    .then(user => {
        window.currentUserProfile = user; // Cached globally for dynamic printing
        const inputs = document.querySelectorAll("#personal input");
        if (inputs.length > 0) {
            if (inputs[0]) inputs[0].value = `${user[0]} ${user[1] || ""} ${user[2]}`.replace(/\s+/g, " ");
            if (inputs[1]) inputs[1].value = user[3] || "";
            if (inputs[2]) inputs[2].value = user[4] || "";
            if (inputs[3]) inputs[3].value = user[5] || "";
            if (inputs[4]) inputs[4].value = user[6] || "";
            if (inputs[5]) inputs[5].value = user[7] || "";
            if (inputs[6]) inputs[6].value = user[8] || "";
            if (inputs[7]) inputs[7].value = "#" + (user[9] || "");
            if (inputs[8]) inputs[8].value = user[10] || "";
            if (inputs[9]) inputs[9].value = user[11] || "";
            if (inputs[10]) inputs[10].value = user[12] || "";
            if (inputs[11]) inputs[11].value = user[13] || "";
            if (inputs[12]) inputs[12].value = user[14] || "";
            if (inputs[13]) inputs[13].value = `${user[15]} (${user[17]})`;
            if (inputs[14]) inputs[14].value = user[16] || "";
            if (inputs[15]) inputs[15].value = user[17] || "";
            if (inputs[16]) inputs[16].value = `${user[18]} (${user[20]})`;
            if (inputs[17]) inputs[17].value = user[19] || "";
        }

        const preferred_name = user[3] || "";
        const email = user[11] || "";
        const work_phone = user[13] || "";
        const job_title = user[21] || "";
        const department = user[22] || "";
        const start_date = user[24] || "";
        const location = user[26] || "";

        const headerGreetingName = document.getElementById("headerGreetingName");
        if (headerGreetingName) headerGreetingName.textContent = `Officer ${preferred_name}`;

        const headerProfileName = document.getElementById("headerProfileName");
        if (headerProfileName) headerProfileName.textContent = `Officer ${preferred_name}`;

        const sidebarOfficerName = document.getElementById("sidebarOfficerName");
        if (sidebarOfficerName) sidebarOfficerName.textContent = `Officer ${preferred_name}`;

        const bannerFullName = document.getElementById("bannerFullName");
        if (bannerFullName) bannerFullName.textContent = `${job_title || "Police Officer"} • ${department || "Police Headquarters"}`;

        const bannerLocation = document.getElementById("bannerLocation");
        if (bannerLocation) bannerLocation.textContent = location || "San Pedro, Laguna";

        const bannerYearsSpan = document.getElementById("bannerYearsSpan");
        if (bannerYearsSpan) bannerYearsSpan.textContent = `Since ${start_date}`;

        const bannerEmail = document.getElementById("bannerEmail");
        if (bannerEmail) bannerEmail.textContent = email;

        const bannerPhone = document.getElementById("bannerPhone");
        if (bannerPhone) bannerPhone.textContent = work_phone;

        loadDocuments(user[28]);
        updateEmploymentHistorySection(user);
    })
    .catch(err => console.error("Error refreshing profile data:", err));
}

function loadDocuments(docListString) {
    const grid = document.querySelector(".documents-grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!docListString || docListString.trim() === "") {
        grid.innerHTML = '<p style="color:#64748b; padding: 20px;">No custom documents uploaded yet.</p>';
        return;
    }

    const docs = docListString.split(",");
    docs.forEach(doc => {
        const parts = doc.split("|");
        const filename = parts[0];
        const date = parts[1] || "N/A";
        const displayName = parts[2] || filename;

        if (!filename || filename.trim() === "" || filename === "2026" || filename === " 2026") {
            return;
        }

        const card = document.createElement("div");
        card.className = "doc-card";
        card.innerHTML = `
            <div class="doc-icon"><i class="fa-solid fa-file-pdf"></i></div>
            <div class="doc-info" style="flex: 1; min-width: 0;">
                <h4 style="word-break: break-all; margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #1e293b;">${displayName}</h4>
                <p style="margin: 0; font-size: 13px; color: #64748b;">Uploaded: ${date}</p>
            </div>
            <div class="doc-actions" style="display:flex; flex-direction:column; gap:8px; margin-left:16px; align-items:flex-end; flex-shrink: 0;">
                <button class="btn-view" onclick="viewDocumentFile('${filename}')" style="width: 110px; height: 36px; background: #f1f5f9; color: #0f172a; border-radius: 8px; font-size: 13px; font-weight:600; cursor:pointer; border:none; display:flex; align-items:center; justify-content:center; gap:6px; transition: background 0.2s;"><i class="fa-solid fa-eye"></i> View</button>
                <button class="btn-download" onclick="downloadDocumentFile('${filename}')" style="width: 110px; height: 36px; background: #f1f5f9; color: #0b2c66; border-radius: 8px; font-size: 13px; font-weight:600; cursor:pointer; border:none; display:flex; align-items:center; justify-content:center; gap:6px; transition: background 0.2s;"><i class="fa-solid fa-download"></i> Download</button>
                <button class="btn-delete" onclick="deleteDocumentFile('${filename}')" style="width: 110px; height: 36px; background: #fee2e2; color: #dc2626; border-radius: 8px; font-size: 13px; font-weight:600; cursor:pointer; border:none; display:flex; align-items:center; justify-content:center; gap:6px; transition: background 0.2s;"><i class="fa-solid fa-trash-can"></i> Delete</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function viewDocumentFile(filename) {
    fetch(`/log-document-action?action=Viewed&filename=${encodeURIComponent(filename)}`, { method: "POST" })
    .then(() => {
        window.open(`/upload/${filename}`, "_blank");
    })
    .catch(err => console.error("Error logging document view action:", err));
}

function downloadDocumentFile(filename) {
    fetch(`/log-document-action?action=Downloaded&filename=${encodeURIComponent(filename)}`, { method: "POST" })
    .then(() => {
        const link = document.createElement("a");
        link.href = `/upload/${filename}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    })
    .catch(err => console.error("Error logging document download action:", err));
}

function deleteDocumentFile(filename) {
    if (!confirm(`Are you sure you want to permanently delete "${filename}"?`)) {
        return;
    }
    fetch(`/delete-document?filename=${encodeURIComponent(filename)}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Document deleted permanently.", "success");
            refreshProfileData();
        } else {
            showToast("Failed to delete document file.", "error");
        }
    })
    .catch(err => console.error("Error deleting document request:", err));
}

function submitDocUpload() {
    const nameInput = document.getElementById("uploadDocName");
    const fileInput = document.getElementById("uploadDocFile");

    const displayName = nameInput.value.trim();
    if (!displayName) {
        alert("Please provide a name for this document.");
        return;
    }

    if (fileInput.files.length === 0) {
        alert("Please select a file to upload.");
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("display_name", displayName);

    fetch("/upload-document", {
        method: "POST",
        body: formData
    })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("Document uploaded successfully!", "success");
            closeEditModal("uploadDocModal");
            refreshProfileData();
        } else {
            showToast("Document upload failed.", "error");
        }
    })
    .catch(err => {
        console.error("Error uploading document:", err);
        showToast("An error occurred during upload.", "error");
    });
}

function createPinModal() {
    if (document.getElementById("changePinModal")) return;

    const modalHtml = `
        <div class="modal-overlay" id="changePinModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(8px); z-index:20000; align-items:center; justify-content:center;">
            <div class="modal" style="max-width:400px; width:90%; background:white; border-radius:20px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.3); display:flex; flex-direction:column;">
                <div class="modal-header" style="background:#0b2c66; color:white; padding:20px 24px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:20px; font-weight:700;"><i class="fa-solid fa-key"></i> Change Password</h3>
                    <button class="close-btn" onclick="closePinModal()" style="background:none; border:none; color:white; font-size:28px; cursor:pointer;">×</button>
                </div>
                <div class="modal-body" style="padding:24px; display:flex; flex-direction:column; gap:16px; color: black;">
                    <div class="form-group" style="margin:0;">
                        <label style="display:block; font-weight:600; margin-bottom:6px; color:#374151;">Current Password</label>
                        <input type="password" id="currentPinInput" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:10px; color:black;" placeholder="Enter current password">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="display:block; font-weight:600; margin-bottom:6px; color:#374151;">New Password</label>
                        <input type="password" id="newPinInput" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:10px; color:black;" placeholder="Enter new password" title="Password must have special characters, numbers, it's supposed to be long, and have some uppercase.">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label style="display:block; font-weight:600; margin-bottom:6px; color:#374151;">Confirm New Password</label>
                        <input type="password" id="confirmPinInput" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:10px; color:black;" placeholder="Confirm new password">
                    </div>
                </div>
                <div class="modal-footer" style="padding:16px 24px; background:#f8fafc; text-align:right; border-top:1px solid #e2e8f0; display:flex; gap:12px; justify-content:flex-end;">
                    <button class="btn-cancel" onclick="closePinModal()" style="padding:10px 20px; border-radius:8px; background:#e2e8f0; color:#475569; border:none; cursor:pointer; font-weight:600;">Cancel</button>
                    <button class="btn-submit" onclick="submitPinChange()" style="padding:10px 24px; border-radius:8px; background:#0b2c66; color:white; border:none; cursor:pointer; font-weight:700;">Update Password</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function openPinModal() {
    createPinModal();
    document.getElementById("currentPinInput").value = "";
    document.getElementById("newPinInput").value = "";
    document.getElementById("confirmPinInput").value = "";
    document.getElementById("changePinModal").style.display = "flex";
}

function closePinModal() {
    const el = document.getElementById("changePinModal");
    if (el) el.style.display = "none";
}

function submitPinChange() {
    const currentPin = document.getElementById("currentPinInput").value.trim();
    const newPin = document.getElementById("newPinInput").value.trim();
    const confirmPin = document.getElementById("confirmPinInput").value.trim();

    if (!currentPin || !newPin || !confirmPin) {
        alert("All fields require a valid input.");
        return;
    }

    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(newPin);
    const hasNumber = /[0-9]/.test(newPin);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPin);
    const isLong = newPin.length >= minLength;

    if (!isLong || !hasUppercase || !hasNumber || !hasSpecialChar) {
        alert("Warning: Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character.");
        return;
    }

    if (newPin !== confirmPin) {
        alert("New password and confirmation password do not match.");
        return;
    }

    fetch(`/change-pin?currentPin=${encodeURIComponent(currentPin)}&newPin=${encodeURIComponent(newPin)}`, { method: "POST" })
    .then(res => res.text())
    .then(data => {
        if (data === "Success") {
            showToast("System Password modified successfully!", "success");
            closePinModal();
        } else {
            alert("Error: " + data);
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Error processing password change query", "error");
    });
}

function closeEditModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
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
        alert("Please complete the remaining deployment details.");
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

function loadProfilePicture() {
    fetch("/get-profile-picture")
    .then(res => {
        if (res.status === 200) {
            return res.text();
        }
        throw new Error("Unable to resolve dynamic image path");
    })
    .then(path => {
        const img = document.getElementById("clientProfilePic");
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
        const img = document.getElementById("clientProfilePic");
        if (img) {
            img.src = "/static/images/icon.png";
        }
        const avatars = document.querySelectorAll(".user-avatar-img");
        avatars.forEach(avatar => {
            avatar.src = "/static/images/icon.png";
        });
    });
}

function checkPendingAvatarStatus() {
    fetch("/check-pending-avatar")
    .then(res => res.text())
    .then(status => {
        const overlay = document.getElementById("profilePicOverlay");
        const wrapper = document.getElementById("profilePicWrapper");
        if (status === "yes") {
            if (overlay) {
                overlay.innerHTML = `<i class="fa-solid fa-clock"></i> Pending Approval`;
                overlay.style.opacity = "1";
            }
            if (wrapper) {
                wrapper.style.pointerEvents = "none";
                wrapper.title = "A profile picture change is currently pending administrator approval.";
            }
        } else {
            if (overlay) {
                overlay.innerHTML = `<i class="fa-solid fa-camera" style="margin-right:4px;"></i> Change Photo`;
                overlay.style.opacity = "";
            }
            if (wrapper) {
                wrapper.style.pointerEvents = "auto";
                wrapper.title = "";
            }
        }
    })
    .catch(err => console.error("Error checking pending avatar status:", err));
}

document.addEventListener("DOMContentLoaded", () => {
    updateNotificationBadge();
    refreshProfileData();
    loadProfilePicture();
    checkOnboardingStatus();
    checkPendingAvatarStatus();

    // Background polling cycles to keep dashboard center fully responsive and synchronized
    setInterval(refreshReports, 5000);
    setInterval(refreshDashboardStats, 5000);

    const searchInput = document.getElementById("globalHeaderSearch");
    if (searchInput) {
        const parent = searchInput.parentElement;
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
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            border: 1px solid #cbd5e1;
            z-index: 9999;
            max-height: 320px;
            overflow-y: auto;
            margin-top: 6px;
            box-sizing: border-box;
        `;
        parent.appendChild(dropdown);

        searchInput.addEventListener("input", runGlobalHeaderSearch);
        searchInput.addEventListener("focus", () => {
            if (searchInput.value.trim()) {
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

            fetch("/request-profile-picture", {
                method: "POST",
                body: formData
            })
            .then(res => res.text())
            .then(data => {
                if (data === "Pending") {
                    showToast("Profile picture request submitted for Admin approval!", "success");
                    const confirmModal = document.getElementById("submitConfirmModal");
                    if (confirmModal) confirmModal.style.display = "flex";
                    checkPendingAvatarStatus();
                } else {
                    showToast("Failed to request profile picture change.", "error");
                }
            })
            .catch(err => {
                console.error("An error occurred during avatar upload request:", err);
                showToast("An error occurred during upload.", "error");
            });
        });
    }

    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');

            document.querySelectorAll('.tab-content, .profile-tab-content').forEach(c => {
                c.classList.remove('active');
                c.style.display = "none";
            });

            document.querySelectorAll(`#${tabId}`).forEach(c => {
                c.classList.add('active');
                c.style.display = "block";
            });
        });
    });

    const pinBtn = Array.from(document.querySelectorAll(".profile-actions .btn")).find(btn => btn.textContent.trim() === "Change Password");
    if (pinBtn) pinBtn.onclick = openPinModal;

    const uploadBtn = document.querySelector("#documents .btn-upload");
    if (uploadBtn) {
        uploadBtn.onclick = () => {
            document.getElementById("uploadDocName").value = "";
            document.getElementById("uploadDocFile").value = "";
            document.getElementById("uploadDocModal").style.display = "flex";
        };
    }

    const clientReportSearch = document.getElementById("clientReportSearch");
    if (clientReportSearch) {
        clientReportSearch.addEventListener("input", filterClientReports);
    }
    const clientReportTypeFilter = document.getElementById("clientReportTypeFilter");
    if (clientReportTypeFilter) {
        clientReportTypeFilter.addEventListener("change", filterClientReports);
    }
    const clientReportStatusFilter = document.getElementById("clientReportStatusFilter");
    if (clientReportStatusFilter) {
        clientReportStatusFilter.addEventListener("change", filterClientReports);
    }

    const incidentSearch = document.getElementById("incidentSearch");
    if (incidentSearch) {
        incidentSearch.addEventListener("input", filterClientIncidents);
    }
    const incidentTimeFilter = document.getElementById("incidentTimeFilter");
    if (incidentTimeFilter) {
        incidentTimeFilter.addEventListener("change", filterClientIncidents);
    }
    const incidentSort = document.getElementById("incidentSort");
    if (incidentSort) {
        incidentSort.addEventListener("change", refreshReports);
    }
});

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
    const chips = document.querySelectorAll(".notif-filter-chips .filter-chip");
    chips.forEach(chip => {
        chip.classList.remove("active");
        if (status === 'all' && chip.textContent.toLowerCase() === 'all') {
            chip.classList.add("active");
        } else if (status === 'pending' && chip.classList.contains("pending")) {
            chip.classList.add("active");
        } else if (status === 'approved' && chip.classList.contains("approved")) {
            chip.classList.add("active");
        } else if (status === 'denied' && chip.classList.contains("denied")) {
            chip.classList.add("active");
        } else if (status === 'changes_requested' && chip.classList.contains("revisions")) {
            chip.classList.add("active");
        }
    });

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
    fetch("/get-reports", { method: "POST" })
    .then(res => res.json())
    .then(reports => {
        const unread = reports.filter(r => r[10] === "no");
        if (unread.length === 0) {
            showToast("All report notifications are already marked as read.", "success");
            return;
        }
        let promises = unread.map(r => {
            return fetch(`/mark-report-read?caseNum=${encodeURIComponent(r[0])}`, { method: "POST" });
        });

        unreadNotifications = 0;
        updateNotificationBadge();

        Promise.all(promises).then(() => {
            showToast("All report notifications marked as read!", "success");
            refreshReports();
        });
    })
    .catch(err => console.error("Error marking all read:", err));
}

async function printEmployeeProfile() {
    let user = window.currentUserProfile;
    if (!user) {
        try {
            const res = await fetch("/get-profile-data", { method: "POST" });
            user = await res.json();
            window.currentUserProfile = user;
        } catch (e) {
            console.error("Error fetching profile details for print:", e);
            alert("Could not load profile data for printing. Please try again.");
            return;
        }
    }

    const first_name = user[0] || "";
    const middle_name = user[1] || "";
    const last_name = user[2] || "";
    const preferred_name = user[3] || "";
    const birthday = user[4] || "";
    const gender = user[5] || "";
    const nationality = user[6] || "";
    const blood_type = user[7] || "";
    const employee_id = user[8] || "";
    const badge_number = user[9] || "";
    const ssn = user[10] || "N/A";
    const email = user[11] || "";
    const sec_email = user[12] || "N/A";
    const work_phone = user[13] || "N/A";
    const mobile_phone = user[14] || "";
    const emerg_name = user[15] || "";
    const emerg_phone = user[16] || "";
    const emerg_rel = user[17] || "";
    const emerg_name2 = user[18] || "N/A";
    const emerg_phone2 = user[19] || "N/A";
    const emerg_rel2 = user[20] || "N/A";
    const job_title = user[21] || "";
    const department = user[22] || "";
    const emp_type = user[23] || "";
    const start_date = user[24] || "";
    const supervisor = user[25] || "";
    const location = user[26] || "";

    const tenureYears = getTenureYears(start_date);

    let pastRolesHTML = "";
    const historyRaw = user[27] || "";
    if (historyRaw) {
        try {
            const pastRoles = JSON.parse(historyRaw);
            if (Array.isArray(pastRoles)) {
                pastRoles.forEach(role => {
                    pastRolesHTML += `
                        <div style="border-left: 3px solid #64748b; margin-top: 12px; padding-left: 12px; text-align: left;">
                            <strong style="font-size: 14px; color: #1e293b; display: block;">${role.role || "N/A"}</strong>
                            <span style="font-size: 13px; color: #64748b; display: block;">${role.dept || "N/A"}</span>
                            <span style="font-size: 12px; color: #94a3b8; display: block;">${role.tenure || "N/A"}</span>
                        </div>
                    `;
                });
            }
        } catch (e) {
            pastRolesHTML = `
                <div style="border-left: 3px solid #64748b; margin-top: 12px; padding-left: 12px; text-align: left;">
                    <span style="font-size: 13px; color: #64748b;">${historyRaw}</span>
                </div>
            `;
        }
    }

    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
        <html>
        <head>
            <title>Personnel Sheet - ${first_name} ${last_name}</title>
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
                .profile-title {
                    font-size: 22px;
                    font-weight: 700;
                    margin-bottom: 20px;
                    color: #0f172a;
                    border-bottom: 2px solid #f1f5f9;
                    padding-bottom: 8px;
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
                .section-group {
                    margin-bottom: 40px;
                }
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
                    <h1>AcciTrack Personnel Sheets</h1>
                    <p>Philippine National Police Command Center</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-weight: bold; color: #0b2c66; font-size: 17px;">BADGE: #${badge_number}</p>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Generated on: ${new Date().toLocaleString()}</p>
                </div>
            </div>

            <div class="section-group">
                <div class="profile-title">I. Personal Information</div>
                <table class="details-table">
                    <tr>
                        <th>Full Name</th>
                        <td>${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}</td>
                    </tr>
                    <tr>
                        <th>Preferred Name</th>
                        <td>${preferred_name || "N/A"}</td>
                    </tr>
                    <tr>
                        <th>Date of Birth</th>
                        <td>${birthday}</td>
                    </tr>
                    <tr>
                        <th>Gender</th>
                        <td>${gender}</td>
                    </tr>
                    <tr>
                        <th>Nationality</th>
                        <td>${nationality}</td>
                    </tr>
                    <tr>
                        <th>Blood Type</th>
                        <td>${blood_type}</td>
                    </tr>
                </table>
            </div>

            <div class="section-group">
                <div class="profile-title">II. Identification & Contacts</div>
                <table class="details-table">
                    <tr>
                        <th>Employee ID</th>
                        <td>${employee_id}</td>
                    </tr>
                    <tr>
                        <th>Social Security Number</th>
                        <td>${ssn}</td>
                    </tr>
                    <tr>
                        <th>Primary Email</th>
                        <td>${email}</td>
                    </tr>
                    <tr>
                        <th>Secondary Email</th>
                        <td>${sec_email}</td>
                    </tr>
                    <tr>
                        <th>Work Phone</th>
                        <td>${work_phone}</td>
                    </tr>
                    <tr>
                        <th>Mobile Phone</th>
                        <td>${mobile_phone}</td>
                    </tr>
                </table>
            </div>

            <div class="section-group">
                <div class="profile-title">III. Employment Details</div>
                <table class="details-table">
                    <tr>
                        <th>Job Title / Rank</th>
                        <td>${job_title}</td>
                    </tr>
                    <tr>
                        <th>Department</th>
                        <td>${department}</td>
                    </tr>
                    <tr>
                        <th>Employment Type</th>
                        <td>${emp_type}</td>
                    </tr>
                    <tr>
                        <th>Start Date</th>
                        <td>${start_date}</td>
                    </tr>
                    <tr>
                        <th>Years of Service</th>
                        <td>${tenureYears}</td>
                    </tr>
                    <tr>
                        <th>Reporting Manager</th>
                        <td>${supervisor}</td>
                    </tr>
                    <tr>
                        <th>Work Location</th>
                        <td>${location}</td>
                    </tr>
                    <tr>
                        <th>Past Roles / History</th>
                        <td>${pastRolesHTML || "No prior history recorded."}</td>
                    </tr>
                </table>
            </div>

            <div class="section-group">
                <div class="profile-title">IV. Emergency Contacts</div>
                <table class="details-table">
                    <tr>
                        <th>Primary Emergency Contact</th>
                        <td>${emerg_name} (${emerg_rel}) - ${emerg_phone}</td>
                    </tr>
                    <tr>
                        <th>Secondary Emergency Contact</th>
                        <td>${emerg_name2} (${emerg_rel2}) - ${emerg_phone2}</td>
                    </tr>
                </table>
            </div>

            <div class="footer">
                This document is a computer-generated official summary of the AcciTrack Personnel Registry.<br>
                Confidential Personnel Data Sheet • Philippine National Police
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