document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const MIN_HOURS_BETWEEN_LOOPS = 5.5;
    const MS_PER_HOUR = 1000 * 60 * 60;
    // Use the provided fixed current time for consistent prototyping
    const now = new Date('2025-03-29T12:01:00'); // Saturday, March 29, 2025 12:01 PM
    const today = new Date(now);
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

    // --- DATA (Simulated Database) ---
    let teeTimes = [
         // Past Due Unassigned
        { id: 1, date: '2025-03-28', time: '14:00', player: 'Jones Party', loopType: 'Single', assignedCaddieId: null, assignmentMethod: null, status: 'Not Started', notes: 'Past due!' },
         // Assigned Yesterday (will test conflict)
        { id: 2, date: '2025-03-28', time: '15:00', player: 'Alpha Group', loopType: 'Double', assignedCaddieId: 101, assignmentMethod: 'Manual', status: 'Complete', notes: '' },
        // Today - Unassigned Morning (Critical)
        { id: 3, date: '2025-03-29', time: '08:15', player: 'Smith Group', loopType: 'Double', assignedCaddieId: null, assignmentMethod: null, status: 'Not Started', notes: 'Cart path only' },
         // Today - Assigned Morning (Conflict likely for Caddie 101)
        { id: 4, date: '2025-03-29', time: '08:30', player: 'Williams Member', loopType: 'Forecaddie', assignedCaddieId: 102, assignmentMethod: 'Manual', status: 'Not Started', notes: '' },
        // Today - Unassigned Afternoon (Warning)
        { id: 5, date: '2025-03-29', time: '13:00', player: 'Golf Outing A', loopType: 'Double', assignedCaddieId: null, assignmentMethod: null, status: 'Not Started', notes: 'Check group size' },
         // Today - Assigned Afternoon (OK)
         { id: 6, date: '2025-03-29', time: '14:00', player: 'Johnson Duo', loopType: 'Single', assignedCaddieId: 103, assignmentMethod: 'Random', status: 'Not Started', notes: '' },
        // Tomorrow - Unassigned (Warning)
        { id: 7, date: '2025-03-30', time: '09:00', player: 'Brown, A.', loopType: 'Single', assignedCaddieId: null, assignmentMethod: null, status: 'Not Started', notes: '' },
         // Tomorrow - Assigned
        { id: 8, date: '2025-03-30', time: '10:30', player: 'Beta Group', loopType: 'Forecaddie', assignedCaddieId: 105, assignmentMethod: 'Manual', status: 'Not Started', notes: 'Needs range finder' },
    ];

    let caddies = [
        // Caddie 101 worked late yesterday, likely conflict for early morning today
        { id: 101, name: 'John Doe', status: 'Active', lastAssignmentTime: '2025-03-28T15:00:00', notes: 'Prefers mornings' },
        { id: 102, name: 'Jane Smith', status: 'Active', lastAssignmentTime: '2025-03-27T10:00:00', notes: 'Good with new members' },
        { id: 103, name: 'Robert Johnson', status: 'Active', lastAssignmentTime: '2025-03-28T09:00:00', notes: '' },
        { id: 104, name: 'Emily White', status: 'Inactive', lastAssignmentTime: '2025-03-20T10:00:00', notes: 'On leave' },
        { id: 105, name: 'Michael Brown', status: 'Active', lastAssignmentTime: null, notes: 'Forecaddie specialist' },
         { id: 106, name: 'Chris Green', status: 'Active', lastAssignmentTime: '2025-03-29T08:00:00', notes: 'Available afternoon' }, // Just finished
    ];

    // --- DOM Elements ---
    const teeTimesBody = document.getElementById('tee-times-body');
    const caddieRosterBody = document.getElementById('caddie-roster-body');
    const currentTimeSpan = document.getElementById('current-time');
    const dateFilter = document.getElementById('date-filter');
    const assignmentFilter = document.getElementById('assignment-filter');
    const caddieStatusFilter = document.getElementById('caddie-status-filter');
    const addTeeTimeButton = document.getElementById('add-dummy-tee-time');
    const editModal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content'); // Example usage

    // --- Utility Functions ---
    const getCaddieById = (id) => caddies.find(c => c.id === id);
    const getTeeTimeById = (id) => teeTimes.find(t => t.id === id);

    const formatDateTime = (isoString, options = {}) => {
        if (!isoString) return 'N/A';
        const defaultOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
        const mergedOptions = { ...defaultOptions, ...options };
        try {
            const date = new Date(isoString);
            if (isNaN(date)) return 'Invalid Date';
            return date.toLocaleString('en-US', mergedOptions);
        } catch (e) {
            return 'Invalid Date';
        }
    };

    const formatDate = (isoDateString) => formatDateTime(`${isoDateString}T00:00:00`, { year: undefined, hour: undefined, minute: undefined, hour12: undefined });
    const formatTime = (timeString) => formatDateTime(`1970-01-01T${timeString}:00`, { year: undefined, month: undefined, day: undefined });

    const isCaddieAssignedToday = (caddie) => {
        if (!caddie.lastAssignmentTime) return false;
        const lastAssignDate = new Date(caddie.lastAssignmentTime);
        lastAssignDate.setHours(0, 0, 0, 0);
        return lastAssignDate.getTime() === today.getTime();
    };

    const calculateTimeDifferenceHours = (dateTime1, dateTime2) => {
        if (!dateTime1 || !dateTime2) return Infinity;
        try {
            const date1 = new Date(dateTime1);
            const date2 = new Date(dateTime2);
            if (isNaN(date1) || isNaN(date2)) return Infinity;
            return Math.abs(date1 - date2) / MS_PER_HOUR;
        } catch (e) {
            return Infinity;
        }
    };

    // --- Core Logic ---
    const checkConflict = (caddie, newTeeDateTimeStr) => {
        if (!caddie || !caddie.lastAssignmentTime) return false;
        const diffHours = calculateTimeDifferenceHours(newTeeDateTimeStr, caddie.lastAssignmentTime);
        return diffHours < MIN_HOURS_BETWEEN_LOOPS;
    };

    const findEligibleCaddies = (teeTime) => {
        const teeDateTimeStr = `${teeTime.date}T${teeTime.time}:00`;
        return caddies.filter(caddie => {
            if (caddie.status !== 'Active') return false;
            if (checkConflict(caddie, teeDateTimeStr)) return false;
            return true;
        });
    };

    const getStatusInfo = (teeTime, assignedCaddie) => {
        const teeDateTime = new Date(`${teeTime.date}T${teeTime.time}:00`);
        const warnings = [];
        let primaryStatus = { text: teeTime.status, class: 'badge-secondary' }; // Default like 'Not Started'

        // 1. Assignment Status & Timing
        if (!assignedCaddie) {
            const hoursUntilTeeTime = (teeDateTime - now) / MS_PER_HOUR;
            if (teeDateTime < now) {
                // Past due & Unassigned
                warnings.push({ text: '🔴 Past Due', class: 'badge-critical' });
                 primaryStatus = { text: 'Unassigned', class: 'badge-critical' };
            } else if (hoursUntilTeeTime <= 24) {
                // Due within 24 hours & Unassigned
                warnings.push({ text: '🔴 Urgent', class: 'badge-critical' });
                 primaryStatus = { text: 'Unassigned', class: 'badge-critical' };
            } else {
                 // Future & Unassigned
                 warnings.push({ text: '🟡 Unassigned', class: 'badge-warning' });
                 primaryStatus = { text: 'Needs Caddie', class: 'badge-warning' };
            }
        } else {
             primaryStatus = { text: 'Assigned', class: 'badge-success' }; // Change primary if assigned
             // Add Loop status if needed e.g. In Progress
             if(teeTime.status !== 'Not Started') {
                primaryStatus = { text: teeTime.status, class: 'badge-info'}
             }
        }


        // 2. Conflict Check (only if assigned)
        if (assignedCaddie) {
            const hasConflict = checkConflict(assignedCaddie, `${teeTime.date}T${teeTime.time}:00`);
            if (hasConflict) {
                warnings.push({ text: '⚠️ Conflict (5.5hr)', class: 'badge-conflict' });
            }
        }

         // 3. Add Assignment Method if relevant
        if(teeTime.assignmentMethod) {
            warnings.push({ text: teeTime.assignmentMethod, class: 'badge-secondary'});
        }

        return { primary: primaryStatus, warnings };
    };


    // --- Rendering Functions ---
    const renderTeeTimes = () => {
        teeTimesBody.innerHTML = ''; // Clear existing rows
        const filteredTeeTimes = filterTeeTimes();

        if (filteredTeeTimes.length === 0) {
            const row = teeTimesBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7; // Match number of columns
            cell.textContent = 'No tee times match the current filters.';
            cell.style.textAlign = 'center';
            cell.style.fontStyle = 'italic';
            cell.style.color = var(--muted-text-color);
        }

        filteredTeeTimes.forEach(tt => {
            const row = teeTimesBody.insertRow();
            const assignedCaddie = tt.assignedCaddieId ? getCaddieById(tt.assignedCaddieId) : null;
            const statusInfo = getStatusInfo(tt, assignedCaddie);

            row.insertCell().textContent = formatDate(tt.date);
            row.insertCell().textContent = formatTime(tt.time);
            row.insertCell().textContent = tt.player;
            row.insertCell().textContent = tt.loopType;

            // Assigned Caddie Cell
            const caddieCell = row.insertCell();
            if (assignedCaddie) {
                caddieCell.textContent = assignedCaddie.name;
            } else {
                // Create a container for manual assignment UI
                 const assignArea = document.createElement('div');
                 assignArea.classList.add('action-area');
                 assignArea.id = `assign-area-${tt.id}`;

                 const manualButton = document.createElement('button');
                 manualButton.textContent = 'Assign Manually';
                 manualButton.dataset.teeTimeId = tt.id;
                 manualButton.addEventListener('click', handleShowManualAssign);
                 assignArea.appendChild(manualButton);

                 caddieCell.appendChild(assignArea);
            }


            // Status/Warnings Cell
            const statusCell = row.insertCell();
            statusCell.innerHTML = `<span class="badge ${statusInfo.primary.class}">${statusInfo.primary.text}</span>`;
            statusInfo.warnings.forEach(w => {
                 statusCell.innerHTML += ` <span class="badge ${w.class}">${w.text}</span>`;
             });


            // Action Cell (Random Assign, Unassign, Edit)
            const actionCell = row.insertCell();
            if (!assignedCaddie) {
                const randomButton = document.createElement('button');
                randomButton.textContent = 'Assign Random';
                randomButton.classList.add('primary'); // Style as primary action
                randomButton.dataset.teeTimeId = tt.id;
                randomButton.addEventListener('click', handleAssignRandom);
                actionCell.appendChild(randomButton);
            } else {
                const unassignButton = document.createElement('button');
                unassignButton.textContent = 'Unassign';
                unassignButton.classList.add('danger'); // Style as danger action
                unassignButton.dataset.teeTimeId = tt.id;
                unassignButton.addEventListener('click', handleUnassign);
                actionCell.appendChild(unassignButton);
            }
             // Placeholder Edit Button
            const editButton = document.createElement('button');
            editButton.textContent = 'Edit';
            editButton.disabled = true; // Disable for now
            editButton.title = "Edit functionality not implemented";
            // editButton.addEventListener('click', () => handleShowEditModal(tt, 'teeTime'));
            actionCell.appendChild(editButton);

        });
    };

    const renderCaddieRoster = () => {
        caddieRosterBody.innerHTML = ''; // Clear existing rows
        const filteredCaddies = filterCaddies();

         if (filteredCaddies.length === 0) {
            const row = caddieRosterBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 5; // Match number of columns
            cell.textContent = 'No caddies match the current filter.';
            cell.style.textAlign = 'center';
             cell.style.fontStyle = 'italic';
             cell.style.color = var(--muted-text-color);
        }


        filteredCaddies.forEach(c => {
            const row = caddieRosterBody.insertRow();
            const assignedToday = isCaddieAssignedToday(c);

            if (c.status === 'Inactive') {
                row.classList.add('caddie-inactive');
            }

            row.insertCell().textContent = c.name;
            row.insertCell().textContent = c.status;
             // Assigned Today Cell
            const assignedCell = row.insertCell();
             assignedCell.textContent = assignedToday ? 'Yes' : 'No';
             if (assignedToday) {
                 const marker = document.createElement('span');
                 marker.classList.add('assigned-today-marker');
                 marker.title = 'Assigned Today';
                 assignedCell.appendChild(marker);
             }

            row.insertCell().textContent = formatDateTime(c.lastAssignmentTime, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
            row.insertCell().textContent = c.notes;
        });
    };

    // --- Filtering Logic ---
    const filterTeeTimes = () => {
        const dateValue = dateFilter.value;
        const assignmentValue = assignmentFilter.value;

        return teeTimes.filter(tt => {
            // Date Filter
            const ttDate = new Date(tt.date + 'T00:00:00');
            let dateMatch = true;
            if (dateValue === 'today') {
                dateMatch = ttDate.getTime() === today.getTime();
            } else if (dateValue === 'tomorrow') {
                dateMatch = ttDate.getTime() === tomorrow.getTime();
            } // 'all' matches everything

            // Assignment Filter
            let assignmentMatch = true;
            if (assignmentValue === 'unassigned') {
                assignmentMatch = !tt.assignedCaddieId;
            } else if (assignmentValue === 'assigned') {
                assignmentMatch = !!tt.assignedCaddieId;
            } // 'all' matches everything

            return dateMatch && assignmentMatch;
        }).sort((a, b) => { // Sort by date then time
             const dateA = new Date(`${a.date}T${a.time}:00`);
             const dateB = new Date(`${b.date}T${b.time}:00`);
             return dateA - dateB;
         });
    };

     const filterCaddies = () => {
         const statusValue = caddieStatusFilter.value;
         return caddies.filter(c => {
             if (statusValue === 'all') return true;
             return c.status === statusValue;
         }).sort((a,b) => a.name.localeCompare(b.name)); // Sort alphabetically
     };

    // --- Event Handlers ---
     const handleShowManualAssign = (event) => {
        const teeTimeId = parseInt(event.target.dataset.teeTimeId, 10);
        const teeTime = getTeeTimeById(teeTimeId);
        if (!teeTime) return;

        const assignArea = document.getElementById(`assign-area-${teeTimeId}`);
        if (!assignArea) return;

        // Prevent multiple dropdowns if clicked again quickly
        if (assignArea.querySelector('select')) return;

        const eligibleCaddies = findEligibleCaddies(teeTime);

        // Clear the button
        assignArea.innerHTML = '';

        if (eligibleCaddies.length === 0) {
            assignArea.textContent = 'No eligible caddies';
            assignArea.style.fontStyle = 'italic';
             assignArea.style.color = var(--muted-text-color);
             // Optionally add back the button after a delay
             setTimeout(() => {
                 const manualButton = document.createElement('button');
                 manualButton.textContent = 'Assign Manually';
                 manualButton.dataset.teeTimeId = teeTime.id;
                 manualButton.addEventListener('click', handleShowManualAssign);
                 assignArea.innerHTML = ''; // Clear message
                 assignArea.appendChild(manualButton);
             }, 3000); // Show message for 3 seconds
            return;
        }

        const select = document.createElement('select');
        select.id = `manual-select-${teeTimeId}`;
        select.innerHTML = '<option value="">-- Select Caddie --</option>'; // Default option

        eligibleCaddies.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.name;
            select.appendChild(option);
        });

         const confirmButton = document.createElement('button');
         confirmButton.textContent = '✓'; // Checkmark symbol
         confirmButton.classList.add('primary');
         confirmButton.title = 'Confirm Assignment';
         confirmButton.onclick = () => handleManualAssignConfirm(teeTimeId); // Use onclick for simplicity here

         const cancelButton = document.createElement('button');
         cancelButton.textContent = '✕'; // X symbol
         cancelButton.title = 'Cancel';
          cancelButton.onclick = () => handleManualAssignCancel(teeTimeId);


        assignArea.appendChild(select);
        assignArea.appendChild(confirmButton);
        assignArea.appendChild(cancelButton);
     };

    const handleManualAssignConfirm = (teeTimeId) => {
         const teeTime = getTeeTimeById(teeTimeId);
         const select = document.getElementById(`manual-select-${teeTimeId}`);
         if (!teeTime || !select) return;

         const selectedCaddieId = parseInt(select.value, 10);
         if (!selectedCaddieId) {
             alert('Please select a caddie.');
             return;
         }

         const selectedCaddie = getCaddieById(selectedCaddieId);
         if (!selectedCaddie) return; // Should not happen if list is correct

         // --- UPDATE DATA ---
         teeTime.assignedCaddieId = selectedCaddie.id;
         teeTime.assignmentMethod = 'Manual';
         selectedCaddie.lastAssignmentTime = `${teeTime.date}T${teeTime.time}:00`;

         console.log(`Manually assigned ${selectedCaddie.name} to tee time ${teeTimeId}`);
         renderAll(); // Re-render everything
     };

     const handleManualAssignCancel = (teeTimeId) => {
          const assignArea = document.getElementById(`assign-area-${teeTimeId}`);
          if (!assignArea) return;

          // Restore the original button
           assignArea.innerHTML = ''; // Clear select/buttons
           const manualButton = document.createElement('button');
           manualButton.textContent = 'Assign Manually';
           manualButton.dataset.teeTimeId = teeTimeId;
           manualButton.addEventListener('click', handleShowManualAssign);
           assignArea.appendChild(manualButton);
     };


    const handleAssignRandom = (event) => {
        const teeTimeId = parseInt(event.target.dataset.teeTimeId, 10);
        const teeTime = getTeeTimeById(teeTimeId);
        if (!teeTime) return;

        const eligibleCaddies = findEligibleCaddies(teeTime);

        if (eligibleCaddies.length === 0) {
            alert(`No eligible caddies found for ${teeTime.player} at ${formatTime(teeTime.time)} on ${formatDate(teeTime.date)}.`);
            return;
        }

        const randomIndex = Math.floor(Math.random() * eligibleCaddies.length);
        const selectedCaddie = eligibleCaddies[randomIndex];

        // --- UPDATE DATA ---
        teeTime.assignedCaddieId = selectedCaddie.id;
        teeTime.assignmentMethod = 'Random';
        selectedCaddie.lastAssignmentTime = `${teeTime.date}T${teeTime.time}:00`;

        console.log(`Randomly assigned ${selectedCaddie.name} to tee time ${teeTimeId}`);
        renderAll();
    };

    const handleUnassign = (event) => {
        const teeTimeId = parseInt(event.target.dataset.teeTimeId, 10);
        const teeTime = getTeeTimeById(teeTimeId);
        if (!teeTime || !teeTime.assignedCaddieId) return;

        console.log(`Unassigning caddie from tee time ${teeTimeId}`);

        // --- UPDATE DATA ---
        teeTime.assignedCaddieId = null;
        teeTime.assignmentMethod = null;
        // Note: We don't revert the caddie's last assignment time here.
        // This assumes unassigning doesn't erase history, just frees the slot.

        renderAll();
    };

    const handleAddDummyTeeTime = () => {
         const newId = teeTimes.length > 0 ? Math.max(...teeTimes.map(t => t.id)) + 1 : 1;
         const nextDay = new Date(now);
         nextDay.setDate(now.getDate() + 2); // Add tee time for 2 days from 'now'
         const nextDayStr = nextDay.toISOString().split('T')[0];

        teeTimes.push({
             id: newId,
             date: nextDayStr,
             time: '11:00',
             player: `Added Group ${newId}`,
             loopType: 'Single',
             assignedCaddieId: null,
             assignmentMethod: null,
             status: 'Not Started',
             notes: 'Test Add'
         });
         renderAll();
     };

     // --- Modal Handling (Placeholder) ---
     const handleShowEditModal = (item, type) => {
         // Example: Populating modal for editing a tee time
         if (type === 'teeTime' && item) {
             modalTitle.textContent = `Edit Tee Time: ${item.player}`;
             modalContent.innerHTML = `
                 <label for="modal-date">Date:</label>
                 <input type="date" id="modal-date" value="${item.date}"><br>
                 <label for="modal-time">Time:</label>
                 <input type="time" id="modal-time" value="${item.time}"><br>
                 <label for="modal-player">Player:</label>
                 <input type="text" id="modal-player" value="${item.player}">
                 <p><em>(Note: Saving changes is not implemented in prototype)</em></p>
             `;
             editModal.showModal();
         } else {
             // Handle other types or clear modal
              modalTitle.textContent = `Edit Item`;
              modalContent.innerHTML = `<p>Edit form would appear here.</p>`;
              editModal.showModal(); // Show generic for now
         }
     };

     // Close modal if clicked outside content (basic implementation)
     editModal.addEventListener('click', (event) => {
         if (event.target === editModal) {
             editModal.close();
         }
     });

    // --- Initial Setup ---
    const renderAll = () => {
        renderTeeTimes();
        renderCaddieRoster();
    };

    currentTimeSpan.textContent = formatDateTime(now.toISOString(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    dateFilter.addEventListener('change', renderTeeTimes);
    assignmentFilter.addEventListener('change', renderTeeTimes);
    caddieStatusFilter.addEventListener('change', renderCaddieRoster);
    addTeeTimeButton.addEventListener('click', handleAddDummyTeeTime);

    renderAll(); // Initial render
});