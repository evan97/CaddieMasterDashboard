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
    const modalContent = document.getElementById('modal-content');

    // Dashboard elements
    const upcomingCountEl = document.getElementById('upcoming-count');
    const unassignedCountEl = document.getElementById('unassigned-count');
    const activeCaddiesCountEl = document.getElementById('active-caddies-count');
    const forecastNeedEl = document.getElementById('forecast-need');

    // Search elements
    const teeTimeSearch = document.getElementById('tee-time-search');
    const caddieSearch = document.getElementById('caddie-search');

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

    // --- Notification System ---
    /**
     * Shows a notification to the user
     * @param {string} message - The message to display
     * @param {string} type - The type of notification: 'success', 'warning', 'error', or 'info'
     * @param {number} duration - How long to show the notification in milliseconds (0 for no auto-dismiss)
     */
    const showNotification = (message, type = 'info', duration = 5000) => {
        const container = document.getElementById('notification-container');
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Create title based on type
        let title = '';
        switch(type) {
            case 'success': title = 'Success!'; break;
            case 'warning': title = 'Warning'; break;
            case 'error': title = 'Error'; break;
            default: title = 'Information'; break;
        }
        
        // Add content
        notification.innerHTML = `
            <span class="notification-close">&times;</span>
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        `;
        
        // Add to container
        container.appendChild(notification);
        
        // Add close handler
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            dismissNotification(notification);
        });
        
        // Auto-dismiss after duration (if not 0)
        if (duration > 0) {
            setTimeout(() => {
                dismissNotification(notification);
            }, duration);
        }
        
        return notification;
    };

    /**
     * Dismisses a notification with animation
     * @param {HTMLElement} notification - The notification element to dismiss
     */
    const dismissNotification = (notification) => {
        notification.style.animation = 'slide-out 0.3s ease-out forwards';
        
        // Remove after animation completes
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    };

    // --- Dashboard Stats Functions ---
    const updateDashboardStats = () => {
        // Upcoming tee times (next 24 hours)
        const nextDay = new Date(now);
        nextDay.setHours(now.getHours() + 24);
        
        const upcomingTeeTimes = teeTimes.filter(tt => {
            const teeDateTime = new Date(`${tt.date}T${tt.time}:00`);
            return teeDateTime >= now && teeDateTime <= nextDay;
        });
        
        // Unassigned tee times
        const unassignedTeeTimes = teeTimes.filter(tt => {
            const teeDateTime = new Date(`${tt.date}T${tt.time}:00`);
            return !tt.assignedCaddieId && teeDateTime >= now;
        });
        
        // Active caddies available today
        const activeCaddies = caddies.filter(c => 
            c.status === 'Active' && 
            (!c.lastAssignmentTime || !isCaddieAssignedToday(c))
        );
        
        // Tomorrow's forecasted need
        const tomorrowTeeTimes = teeTimes.filter(tt => 
            tt.date === tomorrow.toISOString().split('T')[0]
        );
        
        // Update the dashboard
        upcomingCountEl.textContent = upcomingTeeTimes.length;
        unassignedCountEl.textContent = unassignedTeeTimes.length;
        activeCaddiesCountEl.textContent = activeCaddies.length;
        forecastNeedEl.textContent = tomorrowTeeTimes.length;
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

    // --- Search Functions ---
    const handleTeeTimeSearch = () => {
        const searchText = teeTimeSearch.value.toLowerCase();
        renderTeeTimes(searchText);
    };

    const handleCaddieSearch = () => {
        const searchText = caddieSearch.value.toLowerCase();
        renderCaddieRoster(searchText);
    };

    // --- Filtering Logic ---
    const filterTeeTimes = (searchText = '') => {
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

            // Search Text
            let searchMatch = true;
            if (searchText) {
                const playerMatch = tt.player.toLowerCase().includes(searchText);
                const caddieMatch = tt.assignedCaddieId ? 
                    getCaddieById(tt.assignedCaddieId).name.toLowerCase().includes(searchText) : 
                    false;
                const notesMatch = tt.notes ? tt.notes.toLowerCase().includes(searchText) : false;
                searchMatch = playerMatch || caddieMatch || notesMatch;
            }

            return dateMatch && assignmentMatch && searchMatch;
        }).sort((a, b) => { // Sort by date then time
            const dateA = new Date(`${a.date}T${a.time}:00`);
            const dateB = new Date(`${b.date}T${b.time}:00`);
            return dateA - dateB;
        });
    };

    const filterCaddies = (searchText = '') => {
        const statusValue = caddieStatusFilter.value;
        return caddies.filter(c => {
            let statusMatch = true;
            if (statusValue !== 'all') {
                statusMatch = c.status === statusValue;
            }
            
            let searchMatch = true;
            if (searchText) {
                searchMatch = c.name.toLowerCase().includes(searchText) || 
                            (c.notes && c.notes.toLowerCase().includes(searchText));
            }
            
            return statusMatch && searchMatch;
        }).sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
    };

    // --- Rendering Functions ---
    const renderTeeTimes = (searchText = '') => {
        teeTimesBody.innerHTML = ''; // Clear existing rows
        const filteredTeeTimes = filterTeeTimes(searchText);

        if (filteredTeeTimes.length === 0) {
            const row = teeTimesBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7; // Match number of columns
            cell.textContent = 'No tee times match the current filters.';
            cell.style.textAlign = 'center';
            cell.style.fontStyle = 'italic';
            cell.style.color = 'var(--muted-text-color)';
        }

        filteredTeeTimes.forEach(tt => {
            const row = teeTimesBody.insertRow();
            const assignedCaddie = tt.assignedCaddieId ? getCaddieById(tt.assignedCaddieId) : null;
            const statusInfo = getStatusInfo(tt, assignedCaddie);

            // Add row data attributes for drag and drop
            row.dataset.teeTimeId = tt.id;
            
            // Add visual indicator for today's bookings
            const ttDate = new Date(tt.date + 'T00:00:00');
            const isToday = ttDate.getTime() === today.getTime();
            if (isToday) {
                row.classList.add('today-booking');
            }
            
            // Add highlight animation for recent changes
            if (tt.recentlyModified) {
                row.classList.add('highlight-row');
                // Reset the flag after highlighting
                setTimeout(() => {
                    tt.recentlyModified = false;
                }, 2000);
            }

            // Create and insert cells
            const dateCell = row.insertCell();
            dateCell.textContent = formatDate(tt.date);
            dateCell.classList.add('data-priority-high'); // Mark as important for mobile view

            row.insertCell().textContent = formatTime(tt.time);

            const playerCell = row.insertCell();
            playerCell.textContent = tt.player;
            playerCell.classList.add('data-priority-high'); // Mark as important for mobile view
            
            // Add tooltip for notes if present
            if (tt.notes) {
                playerCell.setAttribute('data-tooltip', tt.notes);
            }

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
                
                // Add droppable area for drag and drop
                caddieCell.classList.add('droppable');
                caddieCell.addEventListener('dragover', (e) => {
                    e.preventDefault(); // Allow drop
                    caddieCell.classList.add('drop-target');
                });
                
                caddieCell.addEventListener('dragleave', () => {
                    caddieCell.classList.remove('drop-target');
                });
                
                caddieCell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    caddieCell.classList.remove('drop-target');
                    
                    const caddieId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    handleDragAssign(tt.id, caddieId);
                });
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
            
            // Edit Button
            const editButton = document.createElement('button');
            editButton.textContent = 'Edit';
            editButton.dataset.teeTimeId = tt.id;
            editButton.addEventListener('click', () => handleShowEditModal(tt, 'teeTime'));
            actionCell.appendChild(editButton);
        });
    };

    const renderCaddieRoster = (searchText = '') => {
        caddieRosterBody.innerHTML = ''; // Clear existing rows
        const filteredCaddies = filterCaddies(searchText);

         if (filteredCaddies.length === 0) {
            const row = caddieRosterBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 5; // Match number of columns
            cell.textContent = 'No caddies match the current filter.';
            cell.style.textAlign = 'center';
            cell.style.fontStyle = 'italic';
            cell.style.color = 'var(--muted-text-color)';
            return;
        }

        filteredCaddies.forEach(c => {
            const row = caddieRosterBody.insertRow();
            const assignedToday = isCaddieAssignedToday(c);

            // Add data attributes for drag and drop
            if (c.status === 'Active') {
                row.setAttribute('draggable', true);
                row.dataset.caddieId = c.id;
                
                // Add drag event handlers
                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', c.id);
                    row.classList.add('dragging');
                });
                
                row.addEventListener('dragend', () => {
                    row.classList.remove('dragging');
                });
            }

            if (c.status === 'Inactive') {
                row.classList.add('caddie-inactive');
            }

            // Name Cell with Status Dot
            const nameCell = row.insertCell();
            
            // Add status dot
            const statusDot = document.createElement('span');
            statusDot.classList.add('status-dot');
            statusDot.classList.add(c.status.toLowerCase());
            nameCell.appendChild(statusDot);
            
            // Add name text
            nameCell.appendChild(document.createTextNode(c.name));

            // Status Cell
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

            // Last Assignment Cell
            row.insertCell().textContent = formatDateTime(c.lastAssignmentTime, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
            
            // Notes Cell with Tooltip
            const notesCell = row.insertCell();
            notesCell.textContent = c.notes || '';
            if (c.notes) {
                notesCell.setAttribute('data-tooltip', c.notes);
            }
            
            // Add edit action to row
            row.addEventListener('dblclick', () => handleShowEditModal(c, 'caddie'));
        });
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
            assignArea.style.color = 'var(--muted-text-color)';
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
            showNotification('Please select a caddie.', 'warning');
            return;
        }

        const selectedCaddie = getCaddieById(selectedCaddieId);
        if (!selectedCaddie) return; // Should not happen if list is correct

        // --- UPDATE DATA ---
        teeTime.assignedCaddieId = selectedCaddie.id;
        teeTime.assignmentMethod = 'Manual';
        teeTime.recentlyModified = true;
        selectedCaddie.lastAssignmentTime = `${teeTime.date}T${teeTime.time}:00`;

        showNotification(`Assigned ${selectedCaddie.name} to ${teeTime.player} at ${formatTime(teeTime.time)}`, 'success');
        renderAll();
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
            showNotification(`No eligible caddies found for ${teeTime.player} at ${formatTime(teeTime.time)}`, 'warning');
            return;
        }

        const randomIndex = Math.floor(Math.random() * eligibleCaddies.length);
        const selectedCaddie = eligibleCaddies[randomIndex];

        // --- UPDATE DATA ---
        teeTime.assignedCaddieId = selectedCaddie.id;
        teeTime.assignmentMethod = 'Random';
        teeTime.recentlyModified = true;
        selectedCaddie.lastAssignmentTime = `${teeTime.date}T${teeTime.time}:00`;

        showNotification(`Randomly assigned ${selectedCaddie.name} to tee time for ${teeTime.player}`, 'success');
        renderAll();
    };

    const handleUnassign = (event) => {
        const teeTimeId = parseInt(event.target.dataset.teeTimeId, 10);
        const teeTime = getTeeTimeById(teeTimeId);
        if (!teeTime || !teeTime.assignedCaddieId) return;

        const caddieName = getCaddieById(teeTime.assignedCaddieId).name;

        // --- UPDATE DATA ---
        teeTime.assignedCaddieId = null;
        teeTime.assignmentMethod = null;
        teeTime.recentlyModified = true;
        // Note: We don't revert the caddie's last assignment time here.
        // This assumes unassigning doesn't erase history, just frees the slot.

        showNotification(`Unassigned ${caddieName} from tee time for ${teeTime.player}`, 'info');
        renderAll();
    };

    const handleAddDummyTeeTime = () => {
        // Open the edit modal with empty data to add a new tee time
        handleShowEditModal(null, 'teeTime');
    };

    // --- Drag and Drop Assignment ---
    const handleDragAssign = (teeTimeId, caddieId) => {
        const teeTime = getTeeTimeById(teeTimeId);
        const caddie = getCaddieById(caddieId);
        
        if (!teeTime || !caddie) return;
        
        // Check for conflicts
        const teeDateTimeStr = `${teeTime.date}T${teeTime.time}:00`;
        const hasConflict = checkConflict(caddie, teeDateTimeStr);
        
        if (hasConflict) {
            if (!confirm(`Warning: This caddie was assigned less than ${MIN_HOURS_BETWEEN_LOOPS} hours ago. Proceed anyway?`)) {
                return;
            }
        }
        
        // Make the assignment
        teeTime.assignedCaddieId = caddie.id;
        teeTime.assignmentMethod = 'Drag & Drop';
        teeTime.recentlyModified = true;
        caddie.lastAssignmentTime = teeDateTimeStr;
        
        showNotification(`Assigned ${caddie.name} to ${teeTime.player} via drag & drop`, 'success');
        renderAll();
    };

    // --- New Function: Auto-assignment Algorithm ---
    const autoAssignTeeTimes = () => {
        // Get unassigned tee times sorted by date/time
        const unassignedTeeTimes = teeTimes.filter(tt => {
            const teeDateTime = new Date(`${tt.date}T${tt.time}:00`);
            return !tt.assignedCaddieId && teeDateTime >= now;
        }).sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time}:00`);
            const dateB = new Date(`${b.date}T${b.time}:00`);
            return dateA - dateB;
        });
        
        let assignmentsMade = 0;
        
        // Process each unassigned tee time
        unassignedTeeTimes.forEach(teeTime => {
            const eligibleCaddies = findEligibleCaddies(teeTime);
            
            if (eligibleCaddies.length === 0) return;
            
            // Sort caddies by last assignment time (prioritize those who haven't worked recently)
            eligibleCaddies.sort((a, b) => {
                if (!a.lastAssignmentTime) return -1;
                if (!b.lastAssignmentTime) return 1;
                
                const dateA = new Date(a.lastAssignmentTime);
                const dateB = new Date(b.lastAssignmentTime);
                return dateA - dateB; // Oldest assignment first
            });
            
            // Assign the first eligible caddie
            const selectedCaddie = eligibleCaddies[0];
            
            // Update data
            teeTime.assignedCaddieId = selectedCaddie.id;
            teeTime.assignmentMethod = 'Auto';
            teeTime.recentlyModified = true; // Flag for animation
            selectedCaddie.lastAssignmentTime = `${teeTime.date}T${teeTime.time}:00`;
            
            assignmentsMade++;
        });
        
        if (assignmentsMade > 0) {
            // Show success message based on assignments made
            showNotification(`Auto-assignment complete: ${assignmentsMade} tee times assigned.`, 'success');
            renderAll();
        } else {
            showNotification('No eligible assignments available at this time.', 'info');
        }
    };

    // --- Export Data ---
    const exportData = (dataType) => {
        let dataToExport;
        let filename;
        
        if (dataType === 'teeTimes') {
            dataToExport = teeTimes;
            filename = 'tee-times-export.json';
        } else if (dataType === 'caddies') {
            dataToExport = caddies;
            filename = 'caddies-export.json';
        } else {
            // Export both
            dataToExport = { teeTimes, caddies };
            filename = 'caddie-scheduler-export.json';
        }
        
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification(`Data exported to ${filename}`, 'success', 3000);
    };

    // --- Enhanced Modal Handling ---
    const handleShowEditModal = (item, type) => {
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        const confirmBtn = document.getElementById('confirmBtn');
        
        // Set up the modal based on type
        if (type === 'teeTime') {
            modalTitle.textContent = item ? `Edit Tee Time: ${item.player}` : 'Add New Tee Time';
            
            // Create form content for tee time
            const date = item ? item.date : new Date().toISOString().split('T')[0];
            const time = item ? item.time : '12:00';
            const player = item ? item.player : '';
            const loopType = item ? item.loopType : 'Single';
            const notes = item ? item.notes : '';
            
            modalContent.innerHTML = `
                <div class="form-row">
                    <div class="form-group">
                        <label for="modal-date">Date:</label>
                        <input type="date" id="modal-date" class="form-control" value="${date}">
                    </div>
                    <div class="form-group">
                        <label for="modal-time">Time:</label>
                        <input type="time" id="modal-time" class="form-control" value="${time}">
                    </div>
                </div>
                <div class="form-group">
                    <label for="modal-player">Player/Group:</label>
                    <input type="text" id="modal-player" class="form-control" value="${player}" placeholder="Enter player or group name">
                </div>
                <div class="form-group">
                    <label for="modal-loop-type">Loop Type:</label>
                    <select id="modal-loop-type" class="form-control">
                        <option value="Single" ${loopType === 'Single' ? 'selected' : ''}>Single</option>
                        <option value="Double" ${loopType === 'Double' ? 'selected' : ''}>Double</option>
                        <option value="Forecaddie" ${loopType === 'Forecaddie' ? 'selected' : ''}>Forecaddie</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="modal-notes">Notes:</label>
                    <textarea id="modal-notes" class="form-control" rows="3" placeholder="Add any special instructions or notes">${notes}</textarea>
                </div>
            `;
            
            // Set up confirmation action
            confirmBtn.onclick = () => {
                const modalDate = document.getElementById('modal-date').value;
                const modalTime = document.getElementById('modal-time').value;
                const modalPlayer = document.getElementById('modal-player').value;
                const modalLoopType = document.getElementById('modal-loop-type').value;
                const modalNotes = document.getElementById('modal-notes').value;
                
                if (!modalDate || !modalTime || !modalPlayer) {
                    showNotification('Please fill in all required fields', 'warning');
                    return false; // Prevent dialog from closing
                }
                
                if (item) {
                    // Update existing tee time
                    item.date = modalDate;
                    item.time = modalTime;
                    item.player = modalPlayer;
                    item.loopType = modalLoopType;
                    item.notes = modalNotes;
                    item.recentlyModified = true;
                    
                    showNotification('Tee time updated successfully', 'success');
                } else {
                    // Create new tee time
                    const newId = teeTimes.length > 0 ? Math.max(...teeTimes.map(t => t.id)) + 1 : 1;
                    const newTeeTime = {
                        id: newId,
                        date: modalDate,
                        time: modalTime,
                        player: modalPlayer,
                        loopType: modalLoopType,
                        assignedCaddieId: null,
                        assignmentMethod: null,
                        status: 'Not Started',
                        notes: modalNotes,
                        recentlyModified: true
                    };
                    
                    teeTimes.push(newTeeTime);
                    showNotification('New tee time added successfully', 'success');
                }
                
                renderAll();
                return true; // Allow dialog to close
            };
        } else if (type === 'caddie') {
            modalTitle.textContent = item ? `Edit Caddie: ${item.name}` : 'Add New Caddie';
            
            // Create form content for caddie
            const name = item ? item.name : '';
            const status = item ? item.status : 'Active';
            const notes = item ? item.notes : '';
            
            modalContent.innerHTML = `
                <div class="form-group">
                    <label for="modal-caddie-name">Name:</label>
                    <input type="text" id="modal-caddie-name" class="form-control" value="${name}" placeholder="Enter caddie name">
                </div>
                <div class="form-group">
                    <label for="modal-caddie-status">Status:</label>
                    <select id="modal-caddie-status" class="form-control">
                        <option value="Active" ${status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="Inactive" ${status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="modal-caddie-notes">Notes:</label>
                    <textarea id="modal-caddie-notes" class="form-control" rows="3" placeholder="Add any special instructions or preferences">${notes}</textarea>
                </div>
            `;
            
            // Set up confirmation action
            confirmBtn.onclick = () => {
                const modalName = document.getElementById('modal-caddie-name').value;
                const modalStatus = document.getElementById('modal-caddie-status').value;
                const modalNotes = document.getElementById('modal-caddie-notes').value;
                
                if (!modalName) {
                    showNotification('Please enter a name for the caddie', 'warning');
                    return false; // Prevent dialog from closing
                }
                
                if (item) {
                    // Update existing caddie
                    item.name = modalName;
                    item.status = modalStatus;
                    item.notes = modalNotes;
                    
                    showNotification('Caddie information updated successfully', 'success');
                } else {
                    // Create new caddie
                    const newId = caddies.length > 0 ? Math.max(...caddies.map(c => c.id)) + 1 : 101;
                    const newCaddie = {
                        id: newId,
                        name: modalName,
                        status: modalStatus,
                        lastAssignmentTime: null,
                        notes: modalNotes
                    };
                    
                    caddies.push(newCaddie);
                    showNotification('New caddie added successfully', 'success');
                }
                
                renderAll();
                return true; // Allow dialog to close
            };
        }
        
        // Show the modal
        editModal.showModal();
    };

    // --- Initialize Quick Actions ---
    const initializeQuickActions = () => {
        const quickActionsToggle = document.getElementById('quick-actions-toggle');
        const quickActionsContainer = document.querySelector('.quick-actions-container');
        const quickAutoAssign = document.getElementById('quick-auto-assign');
        const quickAddTeeTime = document.getElementById('quick-add-tee-time');
        const quickExport = document.getElementById('quick-export');
        const quickRefresh = document.getElementById('quick-refresh');
        
        // Toggle the quick actions menu
        quickActionsToggle.addEventListener('click', () => {
            quickActionsToggle.classList.toggle('active');
            quickActionsContainer.classList.toggle('show');
        });
        
        // Auto-assign action
        quickAutoAssign.addEventListener('click', () => {
            autoAssignTeeTimes();
            quickActionsToggle.click(); // Close the menu
        });
        
        // Add tee time action
        quickAddTeeTime.addEventListener('click', () => {
            handleAddDummyTeeTime();
            quickActionsToggle.click(); // Close the menu
        });
        
        // Export data action
        quickExport.addEventListener('click', () => {
            exportData('all');
            quickActionsToggle.click(); // Close the menu
        });
        
        // Refresh view action
        quickRefresh.addEventListener('click', () => {
            renderAll();
            showNotification('View refreshed', 'info', 2000);
            quickActionsToggle.click(); // Close the menu
        });
        
        // Close the menu if clicked outside
        document.addEventListener('click', (event) => {
            const isQuickActionsClick = event.target.closest('.quick-actions-menu');
            if (!isQuickActionsClick && quickActionsContainer.classList.contains('show')) {
                quickActionsToggle.classList.remove('active');
                quickActionsContainer.classList.remove('show');
            }
        });
    };

    // --- Event Listeners and Initialization ---
    const addEventListeners = () => {
        // Filter and Search
        dateFilter.addEventListener('change', renderTeeTimes);
        assignmentFilter.addEventListener('change', renderTeeTimes);
        caddieStatusFilter.addEventListener('change', renderCaddieRoster);
        teeTimeSearch.addEventListener('input', handleTeeTimeSearch);
        caddieSearch.addEventListener('input', handleCaddieSearch);
        
        // Add buttons
        addTeeTimeButton.addEventListener('click', handleAddDummyTeeTime);
        
        // Add Auto-Assign button
        const autoAssignButton = document.createElement('button');
        autoAssignButton.textContent = '🤖 Auto-Assign All';
        autoAssignButton.classList.add('primary');
        autoAssignButton.addEventListener('click', autoAssignTeeTimes);
        document.querySelector('#tee-time-module .card-header').appendChild(autoAssignButton);
        
        // Add Export buttons
        const exportTeeTimesButton = document.createElement('button');
        exportTeeTimesButton.textContent = '📥 Export';
        exportTeeTimesButton.addEventListener('click', () => exportData('teeTimes'));
        document.querySelector('#tee-time-module .card-header').appendChild(exportTeeTimesButton);
        
        const exportCaddiesButton = document.createElement('button');
        exportCaddiesButton.textContent = '📥 Export';
        exportCaddiesButton.addEventListener('click', () => exportData('caddies'));
        document.querySelector('#caddie-roster-module .card-header').appendChild(exportCaddiesButton);
        
        // Add a "New Caddie" button
        const addCaddieButton = document.createElement('button');
        addCaddieButton.textContent = '+ Add Caddie';
        addCaddieButton.addEventListener('click', () => handleShowEditModal(null, 'caddie'));
        document.querySelector('#caddie-roster-module .table-container').appendChild(addCaddieButton);
        
        // Close modal when clicking close button
        document.getElementById('modal-close-btn').addEventListener('click', () => {
            editModal.close();
        });
        
        // Close modal if clicked outside content
        editModal.addEventListener('click', (event) => {
            if (event.target === editModal) {
                editModal.close();
            }
        });
    };

    // --- Modified renderAll function ---
    const renderAll = () => {
        renderTeeTimes();
        renderCaddieRoster();
        updateDashboardStats();
    };

    // --- Initialization ---
    currentTimeSpan.textContent = formatDateTime(now.toISOString(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    addEventListeners();
    initializeQuickActions();
    renderAll(); // Initial render
});
