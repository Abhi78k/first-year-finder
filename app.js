/**
 * First Year Finder — app.js
 * Clean Light Mode version
 *
 * 1. Filter 1st semester B.E/B.Tech students
 * 2. Hierarchy: Department -> Academic Block -> Room
 * 3. Each room card ONLY contains the room number and number of students present
 * 4. Custom time slot filtering (e.g. 10-12, 8:25-9:50, or custom From/To pickers)
 */

const TARGET_TERM = 'B.E/B.Tech ACY 2026-27 ODD_1st Sem';
const CSV_FILE = 'Timetable_Report__5_.csv';

// Department abbreviations and full names
const DEPT_INFO = {
    AERO: 'Aeronautical Engineering',
    AIDS: 'Artificial Intelligence & Data Science',
    AIML: 'Artificial Intelligence & Machine Learning',
    AUTO: 'Automobile Engineering',
    BME: 'Biomedical Engineering',
    BT: 'Biotechnology',
    CHEM: 'Chemical Engineering',
    CIVIL: 'Civil Engineering',
    CSBS: 'Computer Science & Business Systems',
    CSD: 'Computer Science & Design',
    CSE: 'Computer Science & Engineering',
    CSECS: 'CSE (Cyber Security)',
    ECE: 'Electronics & Communication Engineering',
    EEE: 'Electrical & Electronics Engineering',
    FT: 'Fashion Technology',
    IT: 'Information Technology',
    MCT: 'Mechatronics Engineering',
    MECH: 'Mechanical Engineering',
    RA: 'Robotics & Automation'
};

const BLOCK_NAMES = {
    A: 'A Block',
    B: 'B Block',
    C: 'C Block',
    D: 'D Block',
    I: 'I Block',
    K: 'K Block',
    V: 'V Block',
    W: 'Workshop Block'
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// DOM Elements
const dateFilter = document.getElementById('dateFilter');
const customTimeInput = document.getElementById('customTimeInput');
const timeFrom = document.getElementById('timeFrom');
const timeTo = document.getElementById('timeTo');
const deptFilter = document.getElementById('deptFilter');
const blockFilter = document.getElementById('blockFilter');
const resetBtn = document.getElementById('resetBtn');
const presetChips = document.querySelectorAll('.preset-chip');

const headerStats = document.getElementById('headerStats');
const summarySection = document.getElementById('summarySection');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const resultsContainer = document.getElementById('resultsContainer');

// Data State
let allRecords = [];
let uniqueDates = [];
let uniqueDepts = [];
let uniqueBlocks = [];

// ============================================================
// CSV Parsing (handles quoted values)
// ============================================================
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current.trim());
    return fields;
}

// ============================================================
// Extract department code from Class Name (e.g. "..._CSE_2026_...")
// ============================================================
function extractDept(className) {
    const match = className.match(/_([A-Z]+)_2026_/);
    return match ? match[1] : null;
}

// ============================================================
// Infer block and room from venue string
// ============================================================
function parseVenue(venue) {
    if (!venue || venue === '-No Value-' || venue === '' || venue === '0.00') return null;
    const trimmed = venue.trim();

    let blockLetter;
    if (trimmed.startsWith('WS ')) {
        blockLetter = 'W';
    } else if (/^[A-Z]G\d/.test(trimmed)) {
        blockLetter = trimmed[0]; // e.g. BG14 -> B, DG02 -> D
    } else if (trimmed.startsWith('ANew')) {
        blockLetter = 'A';
    } else if (trimmed.startsWith('KSL')) {
        blockLetter = 'K';
    } else if (/^IV\s/.test(trimmed)) {
        blockLetter = 'I';
    } else {
        blockLetter = trimmed[0].toUpperCase();
    }

    return {
        block: blockLetter,
        room: trimmed
    };
}

// Convert "HH:MM:SS" or "HH:MM" to minutes from midnight
function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

// Format "HH:MM:SS" -> "HH:MM"
function fmtTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
}

// Format Date: "2026-10-13" -> "Tue, 13 Oct 2026"
function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = DAY_NAMES[d.getDay()];
    const dd = d.getDate();
    const mon = d.toLocaleString('en', { month: 'short' });
    return `${day}, ${dd} ${mon} ${d.getFullYear()}`;
}

// Short Date: "Tue, 13 Oct"
function fmtShortDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = DAY_NAMES[d.getDay()];
    const dd = d.getDate();
    const mon = d.toLocaleString('en', { month: 'short' });
    return `${day}, ${dd} ${mon}`;
}

// ============================================================
// Flexible Time Range Parser (e.g. "10-12", "10:00-12:00", "8:25-9:50", "2-4")
// ============================================================
function parseTimeString(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    const isPM = str.includes('pm');
    const isAM = str.includes('am');
    str = str.replace(/(am|pm)/g, '').trim();

    let h = 0;
    let m = 0;

    if (str.includes(':')) {
        const parts = str.split(':');
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
    } else {
        h = parseInt(str, 10) || 0;
        m = 0;
    }

    if (isPM && h < 12) {
        h += 12;
    } else if (isAM && h === 12) {
        h = 0;
    } else if (!isAM && !isPM && h >= 1 && h <= 6) {
        // College timing context: 1, 2, 3, 4, 5, 6 refers to PM
        h += 12;
    }

    return h * 60 + m;
}

function getActiveTimeFilter() {
    // 1. Check custom text input
    const text = customTimeInput.value.trim();
    if (text) {
        const separators = ['-', ' to ', '~', '–', '..'];
        let foundSep = null;
        for (const sep of separators) {
            if (text.includes(sep)) {
                foundSep = sep;
                break;
            }
        }

        if (foundSep) {
            const parts = text.split(foundSep);
            if (parts.length >= 2) {
                let startMin = parseTimeString(parts[0]);
                let endMin = parseTimeString(parts[1]);
                if (startMin !== null && endMin !== null) {
                    if (endMin <= startMin && endMin < 12 * 60) {
                        endMin += 12 * 60;
                    }
                    return { startMin, endMin };
                }
            }
        }

        // Single hour input like "10" or "10:00"
        const single = parseTimeString(text);
        if (single !== null) {
            return { startMin: single, endMin: single + 60 };
        }
    }

    // 2. Check time picker inputs (timeFrom, timeTo)
    const fromVal = timeFrom.value;
    const toVal = timeTo.value;

    if (fromVal || toVal) {
        const startMin = fromVal ? timeToMinutes(fromVal) : 0;
        const endMin = toVal ? timeToMinutes(toVal) : 24 * 60;
        return { startMin, endMin };
    }

    return null;
}

// Convert minutes to "HH:MM" for time pickers
function minToTimeStr(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ============================================================
// Load and Parse CSV Data
// ============================================================
async function loadData() {
    try {
        const resp = await fetch(CSV_FILE);
        const text = await resp.text();
        const lines = text.split('\n').filter(l => l.trim().length > 0);

        const header = parseCSVLine(lines[0]);
        const colIdx = {};
        header.forEach((h, i) => colIdx[h] = i);

        const dateSet = new Set();
        const deptSet = new Set();
        const blockSet = new Set();

        for (let i = 1; i < lines.length; i++) {
            const fields = parseCSVLine(lines[i]);
            if (fields.length < header.length) continue;

            const term = fields[colIdx['Term']];
            if (term !== TARGET_TERM) continue;

            const className = fields[colIdx['Class Name']];
            const dept = extractDept(className);
            if (!dept) continue;

            const venue = fields[colIdx['Venue']];
            const venueInfo = parseVenue(venue);
            if (!venueInfo) continue;

            const sessionDate = fields[colIdx['Session Date']];
            const startTimeStr = fields[colIdx['Start Time']];
            const endTimeStr = fields[colIdx['End Time']];
            const totalStudents = parseInt(fields[colIdx['Total Students']], 10) || 0;

            const startMin = timeToMinutes(startTimeStr);
            const endMin = timeToMinutes(endTimeStr);

            const record = {
                dept,
                sessionDate,
                startTimeStr,
                endTimeStr,
                startMin,
                endMin,
                totalStudents,
                block: venueInfo.block,
                room: venueInfo.room
            };

            allRecords.push(record);
            dateSet.add(sessionDate);
            deptSet.add(dept);
            blockSet.add(venueInfo.block);
        }

        uniqueDates = [...dateSet].sort();
        uniqueDepts = [...deptSet].sort();
        uniqueBlocks = [...blockSet].sort();

    } catch (err) {
        console.error('Failed to load CSV:', err);
        loadingState.innerHTML = `<p style="color: #ef4444;">Error loading data: ${err.message}</p>`;
    }
}

// ============================================================
// Populate Filter Dropdowns
// ============================================================
function populateFilters() {
    uniqueDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = fmtDate(d);
        dateFilter.appendChild(opt);
    });

    uniqueDepts.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept;
        opt.textContent = `${dept} — ${DEPT_INFO[dept] || dept}`;
        deptFilter.appendChild(opt);
    });

    uniqueBlocks.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = BLOCK_NAMES[b] || `${b} Block`;
        blockFilter.appendChild(opt);
    });
}

// ============================================================
// Filter Records
// ============================================================
function getFilteredRecords() {
    const dVal = dateFilter.value;
    const dpVal = deptFilter.value;
    const bVal = blockFilter.value;
    const timeFilterRange = getActiveTimeFilter();

    return allRecords.filter(r => {
        if (dVal && r.sessionDate !== dVal) return false;
        if (dpVal && r.dept !== dpVal) return false;
        if (bVal && r.block !== bVal) return false;

        if (timeFilterRange) {
            // Overlap check: sessionStart < filterEnd && sessionEnd > filterStart
            const overlaps = (r.startMin < timeFilterRange.endMin) && (r.endMin > timeFilterRange.startMin);
            if (!overlaps) return false;
        }

        return true;
    });
}

// ============================================================
// Build Hierarchy: Department -> Block -> Rooms (with student count & occupied timings)
// ============================================================
function buildHierarchy(records) {
    const tree = {};
    const isSingleDateSelected = Boolean(dateFilter.value);

    records.forEach(r => {
        if (!tree[r.dept]) tree[r.dept] = {};
        if (!tree[r.dept][r.block]) tree[r.dept][r.block] = {};

        if (!tree[r.dept][r.block][r.room]) {
            tree[r.dept][r.block][r.room] = {
                room: r.room,
                students: r.totalStudents,
                timingsMap: new Map()
            };
        } else {
            // Take maximum session capacity active for this room
            tree[r.dept][r.block][r.room].students = Math.max(
                tree[r.dept][r.block][r.room].students,
                r.totalStudents
            );
        }

        // Timing label: "10:00 – 10:50" if date is selected, or "Tue, 13 Oct · 10:00 – 10:50" if all dates
        const timeSlotStr = `${fmtTime(r.startTimeStr)} – ${fmtTime(r.endTimeStr)}`;
        const label = isSingleDateSelected 
            ? timeSlotStr 
            : `${fmtShortDate(r.sessionDate)} · ${timeSlotStr}`;
        const key = `${r.sessionDate}__${r.startMin}`;

        if (!tree[r.dept][r.block][r.room].timingsMap.has(key)) {
            tree[r.dept][r.block][r.room].timingsMap.set(key, {
                date: r.sessionDate,
                startMin: r.startMin,
                label: label
            });
        }
    });

    // Convert timingsMap to sorted array for each room
    Object.keys(tree).forEach(dept => {
        Object.keys(tree[dept]).forEach(block => {
            Object.keys(tree[dept][block]).forEach(room => {
                const map = tree[dept][block][room].timingsMap;
                tree[dept][block][room].timings = Array.from(map.values())
                    .sort((a, b) => {
                        if (a.date !== b.date) return a.date.localeCompare(b.date);
                        return a.startMin - b.startMin;
                    });
            });
        });
    });

    return tree;
}

// ============================================================
// Render UI
// ============================================================
function render() {
    const records = getFilteredRecords();

    if (records.length === 0) {
        resultsContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        updateSummary(records);
        updateHeader(records);
        return;
    }

    emptyState.classList.add('hidden');
    resultsContainer.classList.remove('hidden');

    const tree = buildHierarchy(records);
    let html = '';

    const sortedDepts = Object.keys(tree).sort();

    sortedDepts.forEach(dept => {
        const blocks = tree[dept];
        const sortedBlocks = Object.keys(blocks).sort();

        // Total students for this department
        let deptTotal = 0;
        let totalRoomsCount = 0;
        sortedBlocks.forEach(b => {
            Object.values(blocks[b]).forEach(rm => {
                deptTotal += rm.students;
                totalRoomsCount++;
            });
        });

        const deptFullName = DEPT_INFO[dept] || dept;

        html += `
        <div class="dept-card">
            <div class="dept-header" onclick="toggleDept('${dept}')" id="deptHeader-${dept}">
                <span class="dept-badge">${dept}</span>
                <div class="dept-title-group">
                    <span class="dept-name">${deptFullName}</span>
                    <span class="dept-meta">${sortedBlocks.length} block${sortedBlocks.length > 1 ? 's' : ''} &bull; ${totalRoomsCount} room${totalRoomsCount > 1 ? 's' : ''}</span>
                </div>
                <span class="dept-total-pill">${deptTotal.toLocaleString()} students</span>
                <svg class="dept-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="dept-body" id="deptBody-${dept}">
        `;

        sortedBlocks.forEach(blockLetter => {
            const roomsMap = blocks[blockLetter];
            const roomList = Object.values(roomsMap);
            const blockName = BLOCK_NAMES[blockLetter] || `${blockLetter} Block`;
            const blockId = `${dept}-${blockLetter}`;
            const blockTotal = roomList.reduce((sum, rm) => sum + rm.students, 0);

            // Sort rooms naturally (e.g. B101, B102, D109, D110...)
            roomList.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));

            html += `
            <div class="block-group">
                <div class="block-header" onclick="toggleBlock('${blockId}')" id="blockHeader-${blockId}">
                    <div class="block-tag">${blockLetter}</div>
                    <span class="block-name">${blockName}</span>
                    <span class="block-count-badge">${roomList.length} room${roomList.length > 1 ? 's' : ''} &bull; ${blockTotal} students</span>
                    <svg class="block-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div class="block-body" id="blockBody-${blockId}">
                    <div class="rooms-grid">
            `;

            // VENUE CARD: ROOM NUMBER, STUDENTS COUNT, AND OCCUPIED TIMING(S)
            roomList.forEach(rm => {
                html += `
                <div class="room-card">
                    <div class="room-card-header">
                        <span class="room-number">${escapeHTML(rm.room)}</span>
                        <span class="room-students">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            ${rm.students} students
                        </span>
                    </div>
                    ${rm.timings && rm.timings.length > 0 ? `
                    <div class="room-timings">
                        ${rm.timings.map(t => `
                            <span class="room-time-tag" title="Occupied Timing">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                ${escapeHTML(t.label)}
                            </span>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
                `;
            });

            html += `
                    </div>
                </div>
            </div>
            `;
        });

        html += `
            </div>
        </div>
        `;
    });

    resultsContainer.innerHTML = html;
    updateSummary(records);
    updateHeader(records);
}

// ============================================================
// Collapsible Toggles
// ============================================================
window.toggleDept = function(dept) {
    const header = document.getElementById(`deptHeader-${dept}`);
    const body = document.getElementById(`deptBody-${dept}`);
    header.classList.toggle('collapsed');
    body.classList.toggle('collapsed');
};

window.toggleBlock = function(blockId) {
    const header = document.getElementById(`blockHeader-${blockId}`);
    const body = document.getElementById(`blockBody-${blockId}`);
    header.classList.toggle('collapsed');
    body.classList.toggle('collapsed');
};

// ============================================================
// Update Summary Metrics
// ============================================================
function updateSummary(records) {
    const deptSet = new Set();
    const blockSet = new Set();
    const roomSet = new Set();
    let totalStudents = 0;

    const tree = buildHierarchy(records);
    Object.keys(tree).forEach(dept => {
        deptSet.add(dept);
        Object.keys(tree[dept]).forEach(block => {
            blockSet.add(block);
            Object.keys(tree[dept][block]).forEach(room => {
                roomSet.add(room);
                totalStudents += tree[dept][block][room].students;
            });
        });
    });

    summarySection.innerHTML = `
        <div class="summary-card card-depts">
            <div class="summary-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            </div>
            <div class="summary-card-content">
                <span class="summary-card-value">${deptSet.size}</span>
                <span class="summary-card-label">Departments</span>
            </div>
        </div>
        <div class="summary-card card-blocks">
            <div class="summary-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/></svg>
            </div>
            <div class="summary-card-content">
                <span class="summary-card-value">${blockSet.size}</span>
                <span class="summary-card-label">Academic Blocks</span>
            </div>
        </div>
        <div class="summary-card card-rooms">
            <div class="summary-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div class="summary-card-content">
                <span class="summary-card-value">${roomSet.size}</span>
                <span class="summary-card-label">Occupied Rooms</span>
            </div>
        </div>
        <div class="summary-card card-students">
            <div class="summary-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="summary-card-content">
                <span class="summary-card-value">${totalStudents.toLocaleString()}</span>
                <span class="summary-card-label">Students Present</span>
            </div>
        </div>
    `;
}

// Update Top Header Counter
function updateHeader(records) {
    headerStats.innerHTML = `
        <div class="header-stat-badge">
            <span>Filtered Sessions:</span>
            <span class="header-stat-num">${records.length.toLocaleString()}</span>
        </div>
    `;
}

// Helper: Escape HTML
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// Sync Time Inputs
// ============================================================
function syncFromTextToPickers() {
    const range = getActiveTimeFilter();
    if (range) {
        timeFrom.value = minToTimeStr(range.startMin);
        timeTo.value = minToTimeStr(range.endMin);
    }
}

function syncFromPickersToText() {
    if (timeFrom.value && timeTo.value) {
        customTimeInput.value = `${timeFrom.value} - ${timeTo.value}`;
    } else if (timeFrom.value) {
        customTimeInput.value = `From ${timeFrom.value}`;
    } else if (timeTo.value) {
        customTimeInput.value = `Until ${timeTo.value}`;
    } else {
        customTimeInput.value = '';
    }
}

// Update Active Preset Chip Styling
function updatePresetChips(activeSlot) {
    presetChips.forEach(chip => {
        if (chip.getAttribute('data-slot') === activeSlot) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

// ============================================================
// Initialization & Event Listeners
// ============================================================
async function init() {
    await loadData();

    loadingState.classList.add('hidden');
    populateFilters();
    render();

    // Dropdown filters
    dateFilter.addEventListener('change', render);
    deptFilter.addEventListener('change', render);
    blockFilter.addEventListener('change', render);

    // Custom time input (debounce typing for responsive feel)
    let timeInputTimeout;
    customTimeInput.addEventListener('input', () => {
        clearTimeout(timeInputTimeout);
        timeInputTimeout = setTimeout(() => {
            syncFromTextToPickers();
            updatePresetChips('');
            render();
        }, 250);
    });

    // Time Pickers
    timeFrom.addEventListener('change', () => {
        syncFromPickersToText();
        updatePresetChips('');
        render();
    });

    timeTo.addEventListener('change', () => {
        syncFromPickersToText();
        updatePresetChips('');
        render();
    });

    // Quick Preset Chips
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const slot = chip.getAttribute('data-slot');
            if (slot === 'all') {
                customTimeInput.value = '';
                timeFrom.value = '';
                timeTo.value = '';
                updatePresetChips('all');
            } else {
                customTimeInput.value = slot;
                syncFromTextToPickers();
                updatePresetChips(slot);
            }
            render();
        });
    });

    // Reset Button
    resetBtn.addEventListener('click', () => {
        dateFilter.value = '';
        customTimeInput.value = '';
        timeFrom.value = '';
        timeTo.value = '';
        deptFilter.value = '';
        blockFilter.value = '';
        updatePresetChips('all');
        render();
    });
}

init();
