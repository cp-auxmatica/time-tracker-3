// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, writeBatch, getDocs, setLogLevel } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- App State and Variables ---
let projects = [], tasks = [], goals = [], predefinedTasks = [], activeTimer = null, timerInterval = null;
let currentDetailProjectId = null, currentGoalId = null, currentSort = 'latest';
let dom = {};
let navigationIntent = null;
let taskSearchTerm = '';
let showCompletedTasks = false;
let dailyChartInstance = null;
let currentReportSort = 'time'; // Fixed: Variable declared

// --- Firebase State ---
let db, auth, userId, unsubscribeListeners = [];

// --- UI Element Refs ---
let signInScreen, appContainer, authForm, authLoader, displayNameField, 
    authSubmitBtn, authToggleBtn, authPromptText, displayNameInput;
let isSignUp = false;

const THEME_COLORS = { 
    'theme-teal': '#0d9488', 'theme-indigo': '#4f46e5', 'theme-orange': '#ea580c', 
    'theme-blue': '#2563eb', 'theme-mono': '#1e293b'
};
const DARK_THEME_COLOR = '#000000';
const PALETTE = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

// --- Utility Functions ---
const formatTime=(ms)=>new Date(ms).toISOString().slice(11,19);
const formatDuration=(ms)=>{if(ms<0)ms=0;const tM=Math.floor(ms/60000);if(tM<1)return"0m";const h=Math.floor(tM/60);const m=tM%60;return`${h>0?`${h}h `:''}${m}m`;};
const getTodaysTimeForProjectMs=(projectId)=>{const startOfDay=new Date().setHours(0,0,0,0);let totalMs=tasks.filter(t=>t.projectId===projectId&&t.endTime>=startOfDay).reduce((sum,task)=>sum+(task.endTime-task.startTime),0);if(activeTimer&&activeTimer.projectId===projectId){let elapsed;if(activeTimer.isPaused){elapsed=activeTimer.pauseStartTime-activeTimer.startTime-activeTimer.totalPausedTime;}else{elapsed=Date.now()-activeTimer.startTime-activeTimer.totalPausedTime;}
    totalMs+=elapsed>0?elapsed:0;}
    return totalMs;
};
const downloadFile=(data,name,type)=>{const b=new Blob([data],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);};

// --- Firebase Data Functions ---
const getCollectionRef = (collectionName) => {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    return collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
};
const addData = (collectionName, data) => addDoc(getCollectionRef(collectionName), data);
const updateData = (collectionName, id, data) => setDoc(doc(getCollectionRef(collectionName), id), data, { merge: true });
const deleteData = (collectionName, id) => deleteDoc(doc(getCollectionRef(collectionName), id));
async function clearAllData() {
    const collections = ['projects', 'tasks', 'goals', 'predefinedTasks'];
    for (const collectionName of collections) {
        const querySnapshot = await getDocs(getCollectionRef(collectionName));
        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }
}

const setupFirestoreListeners = () => {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
    const collectionsToSync = {
        'projects': (data) => { projects = data; },
        'tasks': (data) => { tasks = data; },
        'goals': (data) => { goals = data; },
        'predefinedTasks': (data) => { predefinedTasks = data; },
    };
    Object.keys(collectionsToSync).forEach(collectionName => {
        const unsub = onSnapshot(getCollectionRef(collectionName), (snapshot) => {
            const dataArray = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            collectionsToSync[collectionName](dataArray);
            const activePage = document.querySelector('.page.active');
            if (activePage) navigateTo(activePage.id, true);
            updateDashboardTotalTime();
        }, (error) => {
            console.error(`Error listening to ${collectionName}: `, error);
            alert(`There was an error fetching your data. Please ensure Firestore is enabled and security rules are set.`);
        });
        unsubscribeListeners.push(unsub);
    });
};

const checkPersistentTimer=()=>{const s=localStorage.getItem('activeTimerState');if(s){activeTimer=JSON.parse(s);startTimerInterval();}};

const applyTheme=(t)=>{
    const themeMeta = document.getElementById('theme-color-meta');
    const currentAccent = localStorage.getItem('accentTheme') || 'theme-teal';
    if(t==='dark'){
        document.documentElement.classList.add('dark');
        if(themeMeta) themeMeta.setAttribute('content', DARK_THEME_COLOR);
    }else{
        document.documentElement.classList.remove('dark');
        if(themeMeta) themeMeta.setAttribute('content', THEME_COLORS[currentAccent]);
    }
    if(dom.darkModeToggle)dom.darkModeToggle.checked = (t === 'dark');
};
const applyAccentTheme=(themeName)=>{ 
    document.body.classList.remove('theme-teal', 'theme-mono', 'theme-indigo', 'theme-orange', 'theme-blue'); 
    document.body.classList.add(themeName); 
    localStorage.setItem('accentTheme', themeName);
    applyTheme(localStorage.getItem('theme'));
};
const toggleTheme=()=>{const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme);};

const exportDataAsJSON = () => {
    const allData = { projects, tasks, goals, predefinedTasks };
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `work_app_firebase_backup_${dateStr}.json`;
    downloadFile(JSON.stringify(allData, null, 2), filename, 'application/json');
};

const importDataFromJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (!data.projects || !data.tasks) throw new Error("Invalid file format.");
            if (confirm("This will overwrite all current cloud data. Are you sure?")) {
                await clearAllData();
                const batch = writeBatch(db);
                ['projects', 'tasks', 'goals', 'predefinedTasks'].forEach(colName => {
                    (data[colName] || []).forEach(item => {
                        const docRef = item.id ? doc(getCollectionRef(colName), item.id.toString()) : doc(getCollectionRef(colName));
                        batch.set(docRef, item);
                    });
                });
                await batch.commit();
                alert("Import successful!");
            }
        } catch (err) {
            alert("Failed to import data: " + err.message);
        } finally {
            if (dom.importFileInput) dom.importFileInput.value = null;
        }
    };
    reader.readAsText(file);
};

const exportDayNotesAsMarkdown = () => {
    const dayPicker = document.getElementById('reports-day-picker');
    if (!dayPicker || !dayPicker.value) {
        alert("Please select a day to export.");
        return;
    }
    const reportDate = new Date(dayPicker.value + 'T00:00:00');
    reportDate.setHours(0, 0, 0, 0);
    const startOfDay = reportDate.getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000 - 1);

    const dayWorkSessions = tasks.filter(t => t.startTime >= startOfDay && t.startTime <= endOfDay);
    const dayCompletedTasks = predefinedTasks.filter(t => t.isCompleted && t.completedDate >= startOfDay && t.completedDate <= endOfDay);

    if (dayWorkSessions.length === 0 && dayCompletedTasks.length === 0) {
        alert("No activities found for " + reportDate.toLocaleDateString());
        return;
    }

    const activitiesByProject = {};

    const getProjectGroup = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        const projectName = project ? project.name : 'General';
        if (!activitiesByProject[projectName]) {
            activitiesByProject[projectName] = {
                sessions: [],
                completedTasks: []
            };
        }
        return activitiesByProject[projectName];
    };

    dayWorkSessions.forEach(session => {
        getProjectGroup(session.projectId).sessions.push(session);
    });

    dayCompletedTasks.forEach(task => {
        getProjectGroup(task.projectId).completedTasks.push(task);
    });

    let markdown = `# Daily Report: ${reportDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;

    const projectNames = Object.keys(activitiesByProject).sort();

    for (const projectName of projectNames) {
        markdown += `## ${projectName}\n\n`;
        const activities = activitiesByProject[projectName];

        if (activities.sessions.length > 0) {
            markdown += `### Work Sessions\n`;
            activities.sessions.sort((a, b) => a.startTime - b.startTime).forEach(session => {
                const duration = formatDuration(session.endTime - session.startTime);
                markdown += `- **${session.description}** (${duration})\n`;
                if (session.notes) {
                    const indentedNotes = session.notes.split('\n').map(line => `    - ${line}`).join('\n');
                    markdown += `${indentedNotes}\n`;
                }
            });
            markdown += `\n`;
        }

        if (activities.completedTasks.length > 0) {
            markdown += `### Completed Tasks\n`;
            activities.completedTasks.forEach(task => {
                markdown += `- [x] ${task.description}\n`;
            });
            markdown += `\n`;
        }
    }

    const filename = `work_app_report_${reportDate.toISOString().split('T')[0]}.md`;
    downloadFile(markdown, filename, 'text/markdown;charset=utf-8;');
};

const openModal=(el)=>{document.getElementById('modal-backdrop').classList.remove('hidden');el.classList.remove('hidden');};
const closeModal=(el)=>{document.getElementById('modal-backdrop').classList.add('hidden');el.classList.add('hidden');};

const updatePageHeader=(pageId)=>{
    const now=new Date();
    const dateString=now.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    document.getElementById('page-date').textContent = dateString;
    
    let title = 'Timer';
    if (pageId === 'page-session' && activeTimer) {
        const project = projects.find(p => p.id === activeTimer.projectId);
        title = project ? project.name : 'Active Session';
        document.body.classList.add('in-session-mode');
        document.body.style.setProperty('--session-project-color', project?.color || '#cccccc');
    } else {
        document.body.classList.remove('in-session-mode');
        document.body.style.removeProperty('--session-project-color');
        const titles = {
            'page-timer': 'Timer', 'page-projects': 'Projects', 'page-tasks': 'Tasks', 
            'page-reports': 'Reports', 'page-goals': 'Goals', 'page-settings': 'Settings',
            'page-detail': 'Project Details', 'page-goal-detail': 'Goal Details',
            'page-completed-projects': 'Completed Projects'
        };
        title = titles[pageId] || 'Timer';
        if(pageId === 'page-detail' && currentDetailProjectId) {
            const project = projects.find(p => p.id === currentDetailProjectId);
            if(project) title = project.name;
        }
    }
    document.getElementById('page-title').textContent = title;

    const addBtn = document.getElementById('add-btn-header');
    if(addBtn) {
        addBtn.style.display = 'flex';
        if (pageId === 'page-timer') {
            addBtn.innerHTML = '<i data-lucide="clock" class="w-5 h-5"></i>';
        } else {
            addBtn.innerHTML = '<i data-lucide="plus" class="w-6 h-6"></i>';
        }
        lucide.createIcons();
    }
};

const navigateTo=(pageId, isRefresh = false)=>{
    if (!isRefresh) { // Prevent state change on refresh
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
        document.getElementById(pageId)?.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===pageId));
    }
    
    switch(pageId) {
        case 'page-timer': renderTimerPage(); break;
        case 'page-projects': renderProjectsPage(); break;
        case 'page-reports': renderReportsPage(); break;
        case 'page-goals': renderGoalsPage(); break;
        case 'page-settings': renderSettingsPage(); break;
        case 'page-tasks': renderTasksPage(); break;
        case 'page-session': renderSessionPage(); break;
        case 'page-detail': renderProjectDetailPage(); break;
        case 'page-goal-detail': renderGoalDetailPage(); break;
        case 'page-completed-projects': renderCompletedProjectsPage(); break;
    }
    updatePageHeader(pageId);
    lucide.createIcons();
};

const startTimerInterval=()=>{if(timerInterval)clearInterval(timerInterval);timerInterval=setInterval(()=>{if(activeTimer&&!activeTimer.isPaused){const elapsed=Date.now()-activeTimer.startTime-activeTimer.totalPausedTime;const el=document.getElementById(`session-timer-display`);if(el)el.textContent=formatTime(elapsed>0?elapsed:0);updateDashboardTotalTime();}},1000);};
const stopTimerInterval=()=>{clearInterval(timerInterval);timerInterval=null;};

const initiateTimer = async (projectId, sessionName) => {
     if (activeTimer) await stopTimer();
    const now = Date.now();
    activeTimer = { 
        projectId: projectId, 
        sessionName: sessionName,
        startTime: now, 
        totalPausedTime: 0, 
        isPaused: false, 
        pauseStartTime: null,
        sessionTasks: [],
        notes: '',
        tags: []
    };

    const projectTasks = predefinedTasks.filter(t => t.projectId === projectId && !t.isCompleted);
    activeTimer.sessionTasks = projectTasks.map(pt => ({
        description: pt.description,
        completed: false,
        predefinedTaskId: pt.id
    }));

    localStorage.setItem('activeTimerState', JSON.stringify(activeTimer));
    startTimerInterval();
    navigateTo('page-session'); 
}

const pauseTimer=()=>{ if (!activeTimer || activeTimer.isPaused) return; activeTimer.isPaused=true; activeTimer.pauseStartTime=Date.now(); localStorage.setItem('activeTimerState', JSON.stringify(activeTimer)); stopTimerInterval(); renderSessionPage(); };
const resumeTimer=()=>{ if (!activeTimer || !activeTimer.isPaused) return; activeTimer.totalPausedTime += Date.now() - activeTimer.pauseStartTime; activeTimer.isPaused = false; activeTimer.pauseStartTime = null; localStorage.setItem('activeTimerState', JSON.stringify(activeTimer)); startTimerInterval(); renderSessionPage(); };

const stopTimer = async () => {
    if (!activeTimer) return Promise.resolve();
    
    const sessionNotes = document.getElementById('session-notes')?.value || '';
    const sessionTags = document.getElementById('session-tags')?.value.trim().split(/[\s,]+/).filter(Boolean) || [];
    const completedSessionTasks = activeTimer.sessionTasks.filter(t => t.completed).map(t => t.description);

    let combinedNotes = sessionNotes;
    if (completedSessionTasks.length > 0) {
        combinedNotes += `\n\nCompleted Tasks:\n- ${completedSessionTasks.join('\n- ')}`;
    }

    const endTime = activeTimer.isPaused ? activeTimer.pauseStartTime : Date.now();
    const duration = (endTime - activeTimer.startTime) - activeTimer.totalPausedTime;
    
    const t = { 
        projectId: activeTimer.projectId, 
        description: activeTimer.sessionName, 
        notes: combinedNotes.trim(), 
        tags: sessionTags, 
        startTime: activeTimer.startTime, 
        endTime: activeTimer.startTime + duration 
    };
    
    if (duration > 1000) { // Only save if more than a second
        const newSessionTaskRef = await addData('tasks', t);
        const completedPredefinedTasks = activeTimer.sessionTasks.filter(st => st.completed && st.predefinedTaskId);
        for (const sessionTask of completedPredefinedTasks) {
            await updateData('predefinedTasks', sessionTask.predefinedTaskId, { 
                completedInSessionId: newSessionTaskRef.id 
            });
        }
    }
    
    localStorage.removeItem('activeTimerState');
    activeTimer = null; 
    stopTimerInterval();
    
    navigateTo('page-timer'); 
    updateDashboardTotalTime();
    return Promise.resolve();
};

const saveNewProject=async(e)=>{
    e.preventDefault();
    const modal=document.getElementById('add-project-modal');
    const name=modal.querySelector('#new-project-name').value.trim();
    const color=modal.querySelector('#new-project-color').value;
    const description=modal.querySelector('#new-project-description').value.trim();
    if(!name||!color){alert("Project name and color are required.");return;}
    const p={ name, description, color, estimate:parseFloat(modal.querySelector('#new-project-estimate').value)||0, status:'open' };
    try {
        await addData('projects', p);
        closeModal(modal);
        modal.querySelector('form').reset();
    } catch (error) {
        console.error("Error adding project:", error);
        alert("Could not save the project. Please check the console for errors.");
    }
};

const updateDashboardTotalTime=()=>{const el=document.getElementById('dashboard-total-time');if(!el)return;const sD=new Date().setHours(0,0,0,0);let t=tasks.filter(t=>t.endTime>=sD).reduce((s,t)=>s+(t.endTime-t.startTime),0);if(activeTimer){let elapsed;if(activeTimer.isPaused){elapsed=activeTimer.pauseStartTime-activeTimer.startTime-activeTimer.totalPausedTime;}else{elapsed=Date.now()-activeTimer.startTime-activeTimer.totalPausedTime;} t+=elapsed>0?elapsed:0;} el.textContent=formatDuration(t);};

const renderProjectsPage = () => {
    const listEl = document.getElementById('projects-list');
    if(!listEl) return;
    const openProjects = projects.filter(p=>p.status!=='completed');
    if (openProjects.length > 0) {
        listEl.innerHTML = openProjects.map(p=>{
            const timeTodayMs = getTodaysTimeForProjectMs(p.id);
            return `<div class="project-card" data-project-id="${p.id}" style="border-left-color: ${p.color};">
                <div class="project-card-info view-project-detail-btn">
                    <div class="project-card-name">${p.name}</div>
                    <div class="project-card-time">Today: ${formatDuration(timeTodayMs)}</div>
                </div>
                <div class="project-card-action">
                    <button class="action-btn edit-project-btn"><i data-lucide="pencil" class="w-5 h-5"></i></button>
                </div>
            </div>`;
        }).join('');
    } else {
        listEl.innerHTML = `<div class="text-center py-12 text-muted-foreground">
            <i data-lucide="folder-plus" class="mx-auto h-12 w-12 opacity-50"></i>
            <h3 class="mt-2 text-sm font-medium">No active projects</h3>
            <p class="mt-1 text-sm">Click the '+' button above to get started.</p>
        </div>`;
    }
    lucide.createIcons();
};

const renderTimerPage = () => {
    const listEl = document.getElementById('timer-list');
    if(!listEl) return;
    const openProjects = projects.filter(p=>p.status!=='completed');
    let sP=[...openProjects];
    const sortControls = document.querySelector('#page-timer .sort-options');
    if(sortControls) {
        const currentSortBtn = sortControls.querySelector('.sort-btn.active');
        if(currentSortBtn) currentSort = currentSortBtn.dataset.sort;
    }
    if(currentSort==='name'){sP.sort((a,b)=>a.name.localeCompare(b.name));}
    else if(currentSort.startsWith('time')){const direction=currentSort==='time_desc'?-1:1;sP.sort((a,b)=>(getTodaysTimeForProjectMs(b.id)-getTodaysTimeForProjectMs(a.id))*direction);}
    else{const l={};tasks.forEach(t=>{if(!l[t.projectId]||t.endTime>l[t.projectId])l[t.projectId]=t.endTime;});sP.sort((a,b)=>(l[b.id]||0)-(l[a.id]||0));}
    if (sP.length > 0) {
        listEl.innerHTML = sP.map(p => {
            const timeTodayMs = getTodaysTimeForProjectMs(p.id);
            return `<div class="project-card" data-project-id="${p.id}" style="border-left-color: ${p.color};">
                <div class="project-card-info view-project-detail-btn">
                    <div class="project-card-name">${p.name}</div>
                </div>
                <div class="project-card-action flex items-center gap-4">
                    <span class="font-semibold text-muted-foreground">${formatDuration(timeTodayMs)}</span>
                    <button class="action-btn start-timer-btn"><i data-lucide="play" class="w-5 h-5"></i></button>
                </div>
            </div>`;
        }).join('');
    } else {
         listEl.innerHTML = `<div class="text-center py-12 text-muted-foreground">
            <i data-lucide="folder-search" class="mx-auto h-12 w-12 opacity-50"></i>
            <h3 class="mt-2 text-sm font-medium">No projects to track</h3>
            <p class="mt-1 text-sm">Go to the 'Projects' page to add a new project.</p>
        </div>`;
    }
    lucide.createIcons();
};

const renderSessionPage = () => {
    const contentEl = document.getElementById('session-view-content');
    if (!activeTimer) { contentEl.innerHTML = `<p class="text-center text-muted-foreground p-8">No active session.</p>`; return; }
    const project = projects.find(p => p.id === activeTimer.projectId);
    if (!project) { contentEl.innerHTML = `<p class="text-center text-muted-foreground p-8">Error: Project not found.</p>`; return; }
    let elapsed = activeTimer.isPaused ? activeTimer.pauseStartTime - activeTimer.startTime - activeTimer.totalPausedTime : Date.now() - activeTimer.startTime - activeTimer.totalPausedTime;
    const liveDisplayTime = formatTime(elapsed > 0 ? elapsed : 0);
    const startTime = new Date(activeTimer.startTime);
    const startTimeString = startTime.toTimeString().slice(0,5);
    
    const tasksHTML = activeTimer.sessionTasks.map(task => `
        <div class="task-item" data-predefined-task-id="${task.predefinedTaskId}">
            <input type="checkbox" class="session-task-checkbox" ${task.completed ? 'checked' : ''}>
            <span class="flex-grow ${task.completed ? 'line-through text-muted-foreground' : ''}">${task.description}</span>
        </div>
    `).join('');
    contentEl.innerHTML = `
        <div class="bg-card p-4 rounded-xl border border-border mb-4">
            <div class="flex justify-between items-center mb-4">
                <div>
                    <label class="text-sm font-medium text-muted-foreground">Start Time</label>
                    <input type="time" id="session-start-time" value="${startTimeString}" class="bg-transparent font-bold text-lg p-1 rounded-md focus:bg-card-secondary">
                </div>
                <div class="text-right">
                    <div id="session-timer-display" class="text-3xl font-bold" style="color: ${activeTimer.isPaused ? 'var(--warning)' : 'var(--success)'};">${liveDisplayTime}</div>
                </div>
            </div>
            <div class="flex gap-2">
                <button id="session-pause-resume-btn" class="flex-1 text-center py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2" style="background-color: var(--warning);">
                    <i data-lucide="${activeTimer.isPaused ? 'play' : 'pause'}"></i>
                    <span>${activeTimer.isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button id="session-stop-btn" class="flex-1 text-center py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2" style="background-color: var(--danger);">
                    <i data-lucide="stop-circle"></i>
                    <span>Stop & Save</span>
                </button>
            </div>
        </div>
        <div class="bg-card p-4 rounded-xl border border-border mb-4">
            <h3 class="font-semibold mb-2">Session Tasks</h3>
            <div id="session-task-list">${tasksHTML || '<p class="text-sm text-muted-foreground py-2">No predefined tasks for this project.</p>'}</div>
        </div>
        <div id="session-notes-container" class="bg-card p-4 rounded-xl border border-border space-y-3">
            <h3 class="font-semibold">Notes & Tags</h3>
            <textarea id="session-notes" class="w-full p-2 text-sm border rounded-md bg-card-secondary border-input-border" placeholder="Add notes...">${activeTimer.notes || ''}</textarea>
            <input type="text" id="session-tags" class="w-full p-2 text-sm border rounded-md bg-card-secondary border-input-border" placeholder="Add tags... (comma-separated)" value="${(activeTimer.tags || []).join(', ')}">
        </div>
    `;
    lucide.createIcons();
};

const renderProjectDetailPage = () => {
    const contentEl = document.getElementById('detail-view-content');
    if (!currentDetailProjectId) { contentEl.innerHTML = `<p class="text-center text-muted-foreground">Project not found.</p>`; return; }
    const p = projects.find(proj => proj.id === currentDetailProjectId);
    if (!p) { contentEl.innerHTML = `<p class="text-center text-muted-foreground">Project not found.</p>`; return; }
    const statusRadios=`<div class="flex items-center gap-6 mt-4"><p class="text-sm font-medium text-muted-foreground">Status:</p><div class="flex items-center gap-4"><label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="project-status" value="open" class="project-status-radio" ${p.status!=='completed'?'checked':''}> Open</label><label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="project-status" value="completed" class="project-status-radio" ${p.status==='completed'?'checked':''}> Completed</label></div></div>`;
    contentEl.innerHTML = `
        <div id="project-detail-view-mode">
            <button class="back-to-projects-btn font-semibold text-primary-accent hover:underline mb-4">&larr; Back to Projects</button>
            <div class="bg-card p-4 rounded-xl border mb-4">
                <div class="flex justify-between items-start">
                    <h2 class="text-2xl font-bold mb-2">${p.name}</h2>
                    <button id="edit-project-btn-detail" class="action-btn"><i data-lucide="pencil" class="w-5 h-5"></i></button>
                </div>
                <p class="text-sm text-muted-foreground mb-4">${p.description||'No description.'}</p>
                ${statusRadios}
            </div>
        </div>
        <div id="project-detail-edit-mode" class="hidden bg-card p-4 rounded-xl border mb-4 space-y-3">
            <h2 class="text-xl font-bold">Edit Project</h2>
            <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1">Project Name</label>
                <input type="text" id="edit-project-name" class="w-full p-2 border rounded-md text-sm bg-card-secondary text-foreground border-input-border" value="${p.name}">
            </div>
            <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1">Description</label>
                <textarea id="edit-project-description" rows="2" class="w-full p-2 border rounded-md text-sm bg-card-secondary text-foreground border-input-border">${p.description||''}</textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-muted-foreground mb-2">Color</label>
                <div id="edit-color-palette" class="flex flex-wrap gap-2"></div>
                <input type="hidden" id="edit-project-color" value="${p.color}">
            </div>
            <div>
                <label class="block text-sm font-medium text-muted-foreground mb-1">Time Estimate (hours)</label>
                <input type="number" id="edit-project-estimate" placeholder="Estimate (hrs)" value="${p.estimate||''}" class="w-full p-2 border rounded-md text-sm bg-card-secondary">
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <button id="cancel-edit-project-btn" class="px-4 py-2 font-semibold rounded-lg hover:bg-card-secondary">Cancel</button>
                <button id="save-updated-project-btn" class="px-4 py-2 font-semibold rounded-lg text-white" style="background:var(--primary-accent)">Save</button>
            </div>
        </div>
        <div class="bg-card p-4 rounded-xl border">
            <h3 class="font-semibold mb-2">Time Entries</h3>
            <div id="detail-entries-list" class="space-y-3"></div>
        </div>
    `;
    renderProjectEntries(currentDetailProjectId);
    lucide.createIcons();
};

const renderProjectEntries = (projectId) => {
    const listEl = document.getElementById('detail-entries-list');
    if(!listEl) return;
    const projectTasks = tasks.filter(t => t.projectId === projectId).sort((a,b) => b.startTime - a.startTime);
    listEl.innerHTML = projectTasks.length > 0 ? projectTasks.map(t => createTaskEntryHTML(t)).join('') : '<p class="text-sm text-muted-foreground">No time entries yet.</p>';
    lucide.createIcons();
};

const createTaskEntryHTML = (task) => {
    const startTime = new Date(task.startTime), endTime = new Date(task.endTime);
    const duration = formatDuration(endTime - startTime);
    const dateStr = startTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = `${startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    return `<div class="task-entry bg-card p-3 rounded-lg border" data-task-id="${task.id}">
        <div class="view-mode">
            <div class="flex justify-between items-start">
                <div class="flex-grow">
                    <p class="font-semibold">${task.description}</p>
                    <p class="text-sm text-muted-foreground whitespace-pre-wrap">${task.notes || 'No notes'}</p>
                    <div class="text-sm text-muted-foreground mt-2">${dateStr} &bull; ${timeStr}</div>
                </div>
                <div class="flex items-start pt-1 gap-1 ml-2 flex-shrink-0">
                    <span class="font-semibold text-base mr-2">${duration}</span>
                    <button class="edit-task-btn action-btn h-8 w-8"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                    <button class="delete-task-btn action-btn h-8 w-8"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>
    </div>`;
};

const renderReportsPage = () => {
    const template = document.getElementById('reports-page-template');
    if (!template) return;
    const content = template.content.cloneNode(true);
    document.getElementById('reports-content').innerHTML = '';
    document.getElementById('reports-content').appendChild(content);
    const dayPicker = document.getElementById('reports-day-picker');
    if (dayPicker) {
        dayPicker.value = new Date().toISOString().split('T')[0];
        dayPicker.addEventListener('change', () => renderReportData());
    }
     const sortControls = document.querySelector('#reports-summary-controls');
    if (sortControls) {
        sortControls.addEventListener('click', (e) => {
            if (e.target.matches('.sort-btn')) {
                document.querySelectorAll('#reports-summary-controls .sort-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentReportSort = e.target.dataset.sort;
                renderReportData();
            }
        });
    }
    renderReportData();
    lucide.createIcons();
};

const renderReportData=()=>{ 
    const dayPicker = document.getElementById('reports-day-picker');
    const reportDate = dayPicker ? new Date(dayPicker.value + 'T00:00:00') : new Date();
    const startOfDay = new Date(reportDate).setHours(0,0,0,0);
    const endOfDay = new Date(reportDate).setHours(23,59,59,999);
    
    const fTs=tasks.filter(t=>t.startTime>=startOfDay&&t.startTime<=endOfDay); 
    const totalTimeMs = fTs.reduce((sum, task) => sum + (task.endTime - task.startTime), 0); 
    const totalTimeEl = document.getElementById('reports-total-time'); 
    if (totalTimeEl) { totalTimeEl.textContent = formatDuration(totalTimeMs); } 
    
    const summaryEl = document.getElementById('reports-summary');
    if (!summaryEl) return;
    if (currentReportSort === 'time') {
        const sortedTasks = fTs.sort((a, b) => a.startTime - b.startTime);
        summaryEl.innerHTML = sortedTasks.map(task => {
            const project = projects.find(p => p.id === task.projectId);
            const startTime = new Date(task.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endTime = new Date(task.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div class="bg-card p-3 rounded-lg border flex justify-between items-center">
                    <div>
                        <p class="font-semibold">${startTime} - ${endTime}</p>
                        <p class="text-sm text-muted-foreground">${task.description}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full" style="background-color:${project?.color || '#cccccc'}"></span>
                        <span class="text-sm font-semibold">${project?.name || 'Unknown'}</span>
                    </div>
                </div>`;
        }).join('') || '<p class="text-center text-muted-foreground py-8">No time tracked today.</p>';
    } else { // Sort by project
        const groupedByProject = fTs.reduce((acc, task) => {
            (acc[task.projectId] = acc[task.projectId] || []).push(task);
            return acc;
        }, {});
        summaryEl.innerHTML = Object.keys(groupedByProject).map(projectId => {
            const project = projects.find(p => p.id === projectId);
            const projectTasks = groupedByProject[projectId];
            const totalTime = projectTasks.reduce((sum, t) => sum + (t.endTime - t.startTime), 0);
            return `<details class="bg-card p-3 rounded-lg border" open>
                        <summary class="font-semibold flex justify-between items-center cursor-pointer">
                            <span>
                                <span class="inline-block w-3 h-3 rounded-full mr-2" style="background-color:${project?.color || '#cccccc'};"></span>
                                ${project?.name || 'Unknown'}
                            </span>
                            <span>${formatDuration(totalTime)}</span>
                        </summary>
                        <div class="mt-3 pt-3 border-t border-border space-y-2">
                            ${projectTasks.sort((a,b)=>a.startTime-b.startTime).map(t=>`<div class="text-sm flex justify-between report-task-item p-1 rounded-md" data-task-id="${t.id}"><span>${t.description}</span><span class="text-muted-foreground">${formatDuration(t.endTime-t.startTime)}</span></div>`).join('')}
                        </div>
                    </details>`;
        }).join('') || '<p class="text-center text-muted-foreground py-8 col-span-full">No time tracked today.</p>';
    }
    renderDailyActivityChart(startOfDay);
};

const renderDailyActivityChart = (startOfDay) => {
    const canvas = document.getElementById('daily-activity-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dayTasks = tasks.filter(t => t.startTime >= startOfDay && t.startTime < startOfDay + 24 * 60 * 60 * 1000);
    const projectColors = projects.reduce((acc, p) => ({ ...acc, [p.id]: p.color }), {});
    const radius = canvas.width / 2;
    const center = radius;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw clock face
    ctx.beginPath();
    ctx.arc(center, center, radius - 25, 0, 2 * Math.PI);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#e2e8f0';
    ctx.lineWidth = 50;
    ctx.stroke();
    // Draw hour markers
    ctx.font = "10px Roboto";
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim() || '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * 2 * Math.PI - Math.PI / 2;
        const x = center + (radius - 15) * Math.cos(angle);
        const y = center + (radius - 15) * Math.sin(angle);
        let hourText = i % 12;
        if (hourText === 0) hourText = 12;
        ctx.fillText(hourText, x, y);
    }
    const timeToAngle = (time) => {
        const date = new Date(time);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        return (totalMinutes / (24 * 60)) * 2 * Math.PI - Math.PI / 2;
    };
    const legendEl = document.getElementById('chart-legend');
    const usedProjects = new Set();
    dayTasks.forEach(task => {
        const startAngle = timeToAngle(task.startTime);
        const endAngle = timeToAngle(task.endTime);
        ctx.beginPath();
        ctx.arc(center, center, radius - 25, startAngle, endAngle);
        ctx.strokeStyle = projectColors[task.projectId] || '#cccccc';
        ctx.lineWidth = 50;
        ctx.stroke();
        usedProjects.add(task.projectId);
    });
    if (legendEl) {
        legendEl.innerHTML = Array.from(usedProjects).map(projectId => {
            const project = projects.find(p => p.id === projectId);
            return `<div class="flex items-center gap-2 text-sm">
                        <span class="w-3 h-3 rounded-full" style="background-color:${project?.color || '#cccccc'}"></span>
                        <span>${project?.name || 'Unknown'}</span>
                    </div>`;
        }).join('');
    }
};

const renderSettingsPage=()=>{
    const template = document.getElementById('settings-template'); if (!template) return;
    const user = auth.currentUser;
    const content=template.content.cloneNode(true);
    document.getElementById('settings-content').innerHTML='';
    document.getElementById('settings-content').appendChild(content);
    if (user) {
        document.getElementById('user-avatar').src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=random`;
        document.getElementById('user-name').textContent = user.displayName || user.email;
    }
    dom.darkModeToggle=document.getElementById('dark-mode-toggle');
    dom.importFileInput=document.getElementById('import-file-input');
    dom.csvDateStart=document.getElementById('csv-date-start');
    dom.csvDateEnd=document.getElementById('csv-date-end');
    applyTheme(localStorage.getItem('theme')||'light');
    document.getElementById('detected-time-zone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone; 
    const savedTheme=localStorage.getItem('accentTheme')||'theme-teal';
    const activeSwatch = document.querySelector(`.accent-swatch[data-theme="${savedTheme}"]`);
    if (activeSwatch) activeSwatch.classList.add('selected');
};

const renderGoalsPage=()=>{
    const template = document.getElementById('goals-page-template'); if (!template) return;
    const content=template.content.cloneNode(true);
    const ac=document.getElementById('goals-content');ac.innerHTML='';ac.appendChild(content);const listEl=document.getElementById('goals-list');
    
    if (goals.length === 0) {
         listEl.innerHTML = `<div class="text-center py-12 text-muted-foreground">
            <i data-lucide="award" class="mx-auto h-12 w-12 opacity-50"></i>
            <h3 class="mt-2 text-sm font-medium">No goals yet</h3>
            <p class="mt-1 text-sm">Click the '+' button to add a new S.M.A.R.T. goal.</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    const groupedGoals = goals.reduce((acc, goal) => {
        const key = `${goal.fiscalYear} ${goal.quarter}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(goal);
        return acc;
    }, {});

    const sortedGroups = Object.keys(groupedGoals).sort((a,b) => b.localeCompare(a)); // Sort by newest first

    listEl.innerHTML = sortedGroups.map(group => {
        const goalItems = groupedGoals[group].map(goal => {
            return `<div class="bg-card p-3 rounded-lg border view-goal-detail-btn cursor-pointer" data-goal-id="${goal.id}">
                        <p class="font-semibold">${goal.title}</p>
                   </div>`;
        }).join('');
        return `<div>
                    <h2 class="text-lg font-bold my-3">${group}</h2>
                    <div class="space-y-2">${goalItems}</div>
                </div>`
    }).join('');
    lucide.createIcons();
};

const saveGoal=async e=>{
    e.preventDefault();
    const modal=document.getElementById('add-goal-modal');
    const id=modal.querySelector('#goal-id').value;
    const goalData = {
        title: modal.querySelector('#goal-title').value,
        fiscalYear: modal.querySelector('#goal-fy').value,
        quarter: modal.querySelector('#goal-quarter').value,
        specific: modal.querySelector('#goal-specific').value,
        measurable: modal.querySelector('#goal-measurable').value,
        achievable: modal.querySelector('#goal-achievable').value,
        relevant: modal.querySelector('#goal-relevant').value,
        timeBound: modal.querySelector('#goal-timebound').value,
        status: 'On Track',
        updates: []
    };

    if(id){ await updateData('goals',id, goalData); }
    else{ await addData('goals',goalData); }
    closeModal(modal);
};

const renderTasksPage=()=>{
    const template = document.getElementById('tasks-page-template'); if (!template) return;
    const content=template.content.cloneNode(true);
    const tc=document.getElementById('tasks-content');
    tc.innerHTML='';
    tc.appendChild(content);

    const searchInput = document.getElementById('task-search-input');
    const showCompletedToggle = document.getElementById('show-completed-tasks-toggle');

    searchInput.value = taskSearchTerm;
    showCompletedToggle.checked = showCompletedTasks;

    searchInput.addEventListener('input', (e) => {
        taskSearchTerm = e.target.value;
        renderTasksPage();
    });
    showCompletedToggle.addEventListener('change', (e) => {
        showCompletedTasks = e.target.checked;
        renderTasksPage();
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filteredTasks = [...predefinedTasks];

    if(taskSearchTerm) {
        filteredTasks = filteredTasks.filter(t => t.description.toLowerCase().includes(taskSearchTerm.toLowerCase()));
    }

    if(!showCompletedTasks) {
        filteredTasks = filteredTasks.filter(t => !t.isCompleted || new Date(t.completedDate) >= today);
    }

    const todaysTasks = filteredTasks.filter(t => t.dueDate && new Date(t.dueDate + 'T00:00:00').toDateString() === new Date().toDateString());
    const otherTasks = filteredTasks.filter(t => !todaysTasks.includes(t));

    const todaysListEl = document.getElementById('todays-tasks-list');
    const otherTasksListEl = document.getElementById('predefined-tasks-list');

    if (todaysTasks.length > 0) {
        todaysListEl.innerHTML = todaysTasks.map(task => createTaskItemHTML(task)).join('');
    } else {
        todaysListEl.innerHTML = '<p class="text-sm text-muted-foreground">No tasks due today.</p>';
    }
    
    if (otherTasks.length > 0) {
        const groupedByProject=otherTasks.reduce((acc,task)=>{(acc[task.projectId||'none']=acc[task.projectId||'none']||[]).push(task);return acc;},{});
        otherTasksListEl.innerHTML=projects.concat({id:'none',name:'General Tasks'}).filter(p=>groupedByProject[p.id]).map(p=>{return`<div><h2 class="font-bold text-lg mt-4 mb-2" style="color:${p.color||'inherit'}">${p.name}</h2><div class="space-y-2">${(groupedByProject[p.id] || []).map(task=>createTaskItemHTML(task)).join('')}</div></div>`}).join('');
    } else {
        otherTasksListEl.innerHTML = '<p class="text-center text-muted-foreground py-8">No other tasks found.</p>';
    }

    lucide.createIcons();
};

const createTaskItemHTML = (task) => {
    const goal = goals.find(g => g.id === task.goalId);
    return`<div class="flex items-center bg-card p-3 rounded-lg border" data-task-id="${task.id}">
        <input type="checkbox" class="predefined-task-checkbox h-5 w-5 rounded border-gray-300 text-primary-accent focus:ring-primary-accent mr-4 flex-shrink-0" ${task.isCompleted?'checked':''}> 
        <div class="flex-grow min-w-0">
            <p class="font-medium ${task.isCompleted?'line-through text-gray-500':''}">${task.description}</p>
            ${task.dueDate?`<p class="text-sm text-muted-foreground">Due: ${new Date(task.dueDate+'T00:00:00').toLocaleDateString()}</p>`:''}
            ${goal ? `<div class="mt-1"><span class="tag bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">${goal.title}</span></div>` : ''}
            ${task.isCompleted && task.completedDate ? `<p class="text-xs text-muted-foreground mt-1">Completed: ${new Date(task.completedDate).toLocaleDateString()}</p>` : ''}
        </div>
        <div class="flex items-center">
            <button class="edit-predefined-task-btn p-2 rounded-md hover:bg-card-secondary"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button class="delete-predefined-task-btn p-2 rounded-md hover:bg-card-secondary"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    </div>`
};

const savePredefinedTask=async e=>{
    e.preventDefault();
    const modal=document.getElementById('add-predefined-task-modal');
    const id=modal.querySelector('#predefined-task-id').value;
    const description=modal.querySelector('#predefined-task-desc').value.trim();
    if(!description)return;
    const projectId=modal.querySelector('#predefined-task-project').value||null;
    const goalId=modal.querySelector('#predefined-task-goal').value||null;
    const notes=modal.querySelector('#predefined-task-notes').value.trim();
    const tags=modal.querySelector('#predefined-task-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
    const dueDate=modal.querySelector('#predefined-task-due-date').value;
    const taskData={description,projectId,notes,tags,dueDate:dueDate||null, goalId};
    if(id){ await updateData('predefinedTasks',id, taskData); }
    else{ await addData('predefinedTasks',{...taskData,isCompleted:false,completedDate:null}); }
    closeModal(modal);
};
const renderCompletedProjectsPage=()=>{const completedProjects=projects.filter(p=>p.status==='completed');const contentEl=document.getElementById('completed-projects-content');contentEl.innerHTML=`<div class="flex items-center justify-between mb-6"><button class="back-to-projects-btn font-semibold text-primary-accent hover:underline">&larr; Back to Projects</button></div><div class="space-y-2">${completedProjects.length>0?completedProjects.map(p=>`<div class="bg-card p-3 rounded-lg border flex items-center justify-between"><div class="flex items-center space-x-3"><span class="w-3 h-3 rounded-full" style="background-color:${p.color};"></span><button class="font-semibold completed-project-link hover:underline" data-project-id="${p.id}">${p.name}</button></div></div>`).join(''):'<p class="text-center text-muted-foreground py-8 col-span-full">No completed projects.</p>'}</div>`;};
const saveManualEntry=async e=>{
    e.preventDefault();
    const modal=document.getElementById('manual-entry-modal');
    const id=modal.querySelector('#manual-entry-task-id').value;
    const pId=modal.querySelector('#manual-entry-project').value;
    const desc=document.getElementById('manual-entry-desc').value,date=document.getElementById('manual-entry-date').value,start=document.getElementById('manual-entry-start').value,end=document.getElementById('manual-entry-end').value,notes=document.getElementById('manual-entry-notes').value;
    if(!desc||!date||!start||!end||!pId)return;
    const startTime=new Date(`${date}T${start}`).getTime(),endTime=new Date(`${date}T${end}`).getTime();
    if(startTime>=endTime)return;
    const taskData={projectId:pId,description:desc,notes,startTime,endTime,tags:[]};
    if(id){ await updateData('tasks',id, taskData); }
    else{ await addData('tasks',taskData); }
    closeModal(modal);
};
const showUserGuide=()=>{document.getElementById('guide-content').innerHTML=`<h2 class="text-2xl font-bold mb-4">Welcome to time!</h2><div class="prose dark:prose-invert max-w-none space-y-4 text-foreground"><p>This guide explains the features to help you track time effectively.</p><h3 class="font-semibold">1. Projects Page</h3><p>Use the '+' button to create a new project. Click the pencil icon on any project to edit its details or see its history.</p><h3 class="font-semibold">2. Timer Page</h3><p>This is your main dashboard for tracking time. Click a project to see its tasks, then click the play button on a task (or the project itself) to start a timer.</p><h3 class="font-semibold">3. Tasks Page</h3><p>Go to the Tasks page to create reusable tasks that you can assign to projects. This saves you from typing the same task name repeatedly.</p><h3 class="font-semibold">4. PWA & Data Sync</h3><ul><li><strong>Installable App (PWA):</strong> Your browser may show an option to "Install" or "Add to Home Screen" to use this app like a native app.</li><li><strong>Cloud Sync:</strong> Your data is now saved to the cloud and will be available on any device where you use this app.</li></ul></div>`;openModal(document.getElementById('guide-modal'));};
const openManualEntryModalForEdit = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const modal = document.getElementById('manual-entry-modal');
    modal.querySelector('form').reset();
    modal.querySelector('#manual-entry-title').textContent = 'Edit Time Entry';
    modal.querySelector('#manual-entry-task-id').value = task.id;
    const projectSelect = modal.querySelector('#manual-entry-project');
    projectSelect.innerHTML = projects.map(p => `<option value="${p.id}" ${p.id === task.projectId ? 'selected' : ''}>${p.name}</option>`).join('');
    modal.querySelector('#manual-entry-desc').value = task.description;
    const startTime = new Date(task.startTime);
    const endTime = new Date(task.endTime);
    modal.querySelector('#manual-entry-date').value = startTime.toISOString().split('T')[0];
    modal.querySelector('#manual-entry-start').value = startTime.toTimeString().slice(0,5);
    modal.querySelector('#manual-entry-end').value = endTime.toTimeString().slice(0,5);
    modal.querySelector('#manual-entry-notes').value = task.notes || '';
    openModal(modal);
};

// --- AUTHENTICATION FLOW ---
const handleAuthSubmit = async (e) => {
    e.preventDefault();
    authSubmitBtn.disabled = true;
    authLoader.classList.remove('hidden');
    const email = authForm.email.value, password = authForm.password.value, displayName = displayNameInput.value;
    try {
        if (isSignUp) {
            if (!displayName) { alert('Please enter a display name.'); throw new Error('Display name required'); }
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName });
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        alert(`Authentication failed: ${error.message}`);
    } finally {
        authSubmitBtn.disabled = false;
        authLoader.classList.add('hidden');
    }
};
const handleSignOut = async () => { if(confirm("Are you sure?")) { await signOut(auth); } };
const toggleAuthMode = () => {
    isSignUp = !isSignUp;
    displayNameField.classList.toggle('hidden', !isSignUp);
    displayNameInput.required = isSignUp;
    authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    authPromptText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    authToggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
    authForm.reset();
};

// --- EVENT LISTENERS ---
const addEventListeners = () => {
    authForm.addEventListener('submit', handleAuthSubmit);
    authToggleBtn.addEventListener('click', toggleAuthMode);

    document.body.addEventListener('click',async e=>{
        if (e.target.closest('#sign-out-btn')) { handleSignOut(); }
        const navBtn = e.target.closest('.nav-btn'); 
        if (navBtn) { const toPage = navBtn.dataset.page; if (activeTimer && document.querySelector('.page.active').id === 'page-session') { navigationIntent = toPage; openModal(document.getElementById('confirmation-modal')); return; } return navigateTo(toPage); }
        if (e.target.closest('#settings-btn')) { if (activeTimer && document.querySelector('.page.active').id === 'page-session') { navigationIntent = 'page-settings'; openModal(document.getElementById('confirmation-modal')); return; } return navigateTo('page-settings'); }
        if(e.target.closest('#add-btn-header')){
            const activePage = document.querySelector('.page.active').id;
            switch(activePage){
                case 'page-timer': const modal=document.getElementById('manual-entry-modal'); modal.querySelector('form').reset(); modal.querySelector('#manual-entry-task-id').value = ''; modal.querySelector('#manual-entry-title').textContent = 'Add Manual Time Entry'; modal.querySelector('#manual-entry-project').innerHTML = projects.filter(p=>p.status !== 'completed').map(p => `<option value="${p.id}">${p.name}</option>`).join(''); modal.querySelector('#manual-entry-date').value=new Date().toISOString().slice(0,10); openModal(modal); break;
                case 'page-projects': const palette=document.getElementById('color-palette');palette.innerHTML=PALETTE.map(c=>`<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('');document.getElementById('new-project-color').value='';openModal(document.getElementById('add-project-modal')); break;
                case 'page-tasks': 
                    const taskModal=document.getElementById('add-predefined-task-modal');
                    taskModal.querySelector('form').reset();
                    taskModal.querySelector('#predefined-task-modal-title').textContent="New Task";
                    const projectSelect=taskModal.querySelector('#predefined-task-project');
                    projectSelect.innerHTML=`<option value="">General Task</option>`+projects.filter(p=>p.status!=='completed').map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
                    const goalSelect=taskModal.querySelector('#predefined-task-goal');
                    goalSelect.innerHTML=`<option value="">No Associated Goal</option>`+goals.map(g=>`<option value="${g.id}">${g.title}</option>`).join('');
                    openModal(taskModal); 
                    break;
                case 'page-goals':
                    const goalModal = document.getElementById('add-goal-modal');
                    goalModal.querySelector('form').reset();
                    const yearSelect = document.getElementById('goal-fy');
                    const currentYear = new Date().getFullYear();
                    yearSelect.innerHTML = [0,1,2,3,4].map(i => `<option>${currentYear + i}</option>`).join('');
                    openModal(goalModal);
                    break;
            }
        }
        if(e.target.closest('.color-swatch')){
            const swatch = e.target.closest('.color-swatch'), palette = swatch.parentElement;
            palette.querySelectorAll('.color-swatch').forEach(el=>el.classList.remove('selected'));
            swatch.classList.add('selected');
            if (palette.id === 'color-palette') { document.getElementById('new-project-color').value = swatch.dataset.color; }
            else if (palette.id === 'edit-color-palette') { document.getElementById('edit-project-color').value = swatch.dataset.color; }
        }
        if(e.target.closest('#cancel-add-project-btn'))return closeModal(document.getElementById('add-project-modal'));
        if(e.target.closest('.sort-btn')){const sortBtn=e.target.closest('.sort-btn');document.querySelectorAll('#page-timer .sort-btn').forEach(b=>b.classList.remove('active'));sortBtn.classList.add('active');currentSort=sortBtn.dataset.sort;renderTimerPage();}
        
        if(e.target.closest('.edit-goal-btn')){const id=e.target.closest('.edit-goal-btn').dataset.goalId;const goal=goals.find(a=>a.id===id);if(goal){const modal=document.getElementById('add-goal-modal');modal.querySelector('form').reset();modal.querySelector('#goal-modal-title').textContent="Edit Goal";modal.querySelector('#goal-id').value=goal.id;/*... populate all fields ...*/openModal(modal);}}
        if(e.target.closest('#cancel-add-goal-btn'))return closeModal(document.getElementById('add-goal-modal'));if(e.target.closest('#import-json-btn'))dom.importFileInput.click();if(e.target.closest('#export-json-btn'))exportDataAsJSON();if(e.target.closest('#export-csv-btn'))exportTasksAsCSV();if(e.target.closest('#export-day-notes-btn'))exportDayNotesAsMarkdown();if(e.target.closest('#show-guide-btn'))showUserGuide();if(e.target.closest('#close-guide-btn'))closeModal(document.getElementById('guide-modal'));
        if(e.target.closest('#cancel-add-predefined-task-btn'))return closeModal(document.getElementById('add-predefined-task-modal'));
        if(e.target.closest('.delete-predefined-task-btn')){const taskEl=e.target.closest('[data-task-id]');if(taskEl){const taskId=taskEl.dataset.taskId;if(confirm('Delete this task?')) await deleteData('predefinedTasks',taskId);}}
        if(e.target.closest('.edit-predefined-task-btn')){const taskEl=e.target.closest('[data-task-id]');if(taskEl){const taskId=taskEl.dataset.taskId;const task=predefinedTasks.find(t=>t.id===taskId);if(task){const modal=document.getElementById('add-predefined-task-modal');modal.querySelector('form').reset();modal.querySelector('#predefined-task-modal-title').textContent="Edit Task";const pSelect=modal.querySelector('#predefined-task-project');pSelect.innerHTML=`<option value="">General Task</option>`+projects.filter(p=>p.status!=='completed').map(p=>`<option value="${p.id}">${p.name}</option>`).join(''); const gSelect=modal.querySelector('#predefined-task-goal'); gSelect.innerHTML=`<option value="">No Goal</option>`+goals.map(g=>`<option value="${g.id}">${g.title}</option>`).join(''); modal.querySelector('#predefined-task-id').value=task.id;modal.querySelector('#predefined-task-desc').value=task.description;pSelect.value=task.projectId||''; gSelect.value=task.goalId||''; modal.querySelector('#predefined-task-due-date').value=task.dueDate||'';modal.querySelector('#predefined-task-notes').value=task.notes||'';modal.querySelector('#predefined-task-tags').value=(task.tags||[]).join(', ');openModal(modal);}}}
        if(e.target.closest('#view-completed-projects-btn'))navigateTo('page-completed-projects');
        if(e.target.closest('.edit-project-btn')) { currentDetailProjectId = e.target.closest('.project-card').dataset.projectId; navigateTo('page-detail'); }
        if(e.target.closest('.start-timer-btn')) { 
            const projectId = e.target.closest('.project-card').dataset.projectId;
            const modal = document.getElementById('name-session-modal');
            modal.querySelector('#session-project-id').value = projectId;
            openModal(modal);
        }
        if(e.target.closest('.view-project-detail-btn')) { currentDetailProjectId = e.target.closest('.project-card').dataset.projectId; navigateTo('page-detail'); }
        if(e.target.closest('#session-pause-resume-btn')) { if(activeTimer.isPaused) resumeTimer(); else pauseTimer(); }
        if(e.target.closest('#session-stop-btn')) { stopTimer(); }
        if(e.target.closest('#cancel-confirmation-btn')) { closeModal(document.getElementById('confirmation-modal')); navigationIntent=null;}
        if(e.target.closest('#confirm-navigation-btn') && e.target.closest('#confirm-navigation-btn').dataset.action !== 'clear-data') { await stopTimer(); if (navigationIntent) navigateTo(navigationIntent); navigationIntent = null; closeModal(document.getElementById('confirmation-modal')); }
        if (e.target.closest('#edit-project-btn-detail')) {
            document.getElementById('project-detail-view-mode').classList.add('hidden');
            document.getElementById('project-detail-edit-mode').classList.remove('hidden');
            const p = projects.find(proj => proj.id === currentDetailProjectId);
            if (p) {
                const editPalette = document.getElementById('edit-color-palette');
                editPalette.innerHTML = PALETTE.map(c => `<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('');
                const currentSwatch = editPalette.querySelector(`[data-color="${p.color}"]`);
                if(currentSwatch) currentSwatch.classList.add('selected');
            }
        }
        if (e.target.closest('#cancel-edit-project-btn')) {
            document.getElementById('project-detail-view-mode').classList.remove('hidden');
            document.getElementById('project-detail-edit-mode').classList.add('hidden');
        }
        if (e.target.closest('#save-updated-project-btn')) {
            const name = document.getElementById('edit-project-name').value.trim(), description = document.getElementById('edit-project-description').value.trim();
            const color = document.getElementById('edit-project-color').value, estimate = parseFloat(document.getElementById('edit-project-estimate').value) || 0;
            if (!name || !color) { alert("Project name and color are required."); return; }
            await updateData('projects', currentDetailProjectId, { name, description, color, estimate });
            document.getElementById('project-detail-view-mode').classList.remove('hidden');
            document.getElementById('project-detail-edit-mode').classList.add('hidden');
        }
        const sessionPage = e.target.closest('#page-session');
        if(sessionPage && e.target.matches('.session-task-checkbox')) { 
            const predefId = e.target.closest('[data-predefined-task-id]').dataset.predefinedTaskId;
            const sessionTask = activeTimer.sessionTasks.find(t => t.predefinedTaskId === predefId);
            if (sessionTask) {
                sessionTask.completed = e.target.checked;
                await updateData('predefinedTasks', predefId, { isCompleted: e.target.checked, completedDate: e.target.checked ? Date.now() : null });
                localStorage.setItem('activeTimerState', JSON.stringify(activeTimer)); 
                renderSessionPage();
            }
        }
        const completedProjectsView=e.target.closest('#page-completed-projects');if(completedProjectsView){if(e.target.closest('.back-to-dashboard-btn'))navigateTo('page-projects');if(e.target.closest('.completed-project-link')){const pId=e.target.closest('.completed-project-link').dataset.projectId;currentDetailProjectId=pId;navigateTo('page-detail');}}
        if(e.target.closest('.accent-swatch')) { const theme = e.target.dataset.theme; applyAccentTheme(theme); document.querySelectorAll('.accent-swatch').forEach(el => el.classList.remove('selected')); e.target.classList.add('selected'); }
        if(e.target.closest('.report-task-item')) { const taskId = e.target.closest('.report-task-item').dataset.taskId; openManualEntryModalForEdit(taskId); }
        if(e.target.closest('#clear-data-btn')) { document.getElementById('confirmation-title').textContent = 'Clear All Data?'; document.getElementById('confirmation-message').textContent = 'This will permanently delete all data from the cloud. This action cannot be undone.'; document.getElementById('confirm-navigation-btn').dataset.action = 'clear-data'; openModal(document.getElementById('confirmation-modal')); }
        if(e.target.closest('#confirm-navigation-btn') && e.target.closest('#confirm-navigation-btn').dataset.action === 'clear-data') { await clearAllData(); closeModal(document.getElementById('confirmation-modal')); }
         if (e.target.closest('.delete-task-btn')) { const taskEl = e.target.closest('[data-task-id]'); if (taskEl) { const taskId = taskEl.dataset.taskId; if (confirm('Delete this time entry?')) { await deleteData('tasks', taskId); } } }
        if (e.target.closest('.edit-task-btn')) { const taskEl = e.target.closest('[data-task-id]'); if (taskEl) { openManualEntryModalForEdit(taskEl.dataset.taskId); } }
        if (e.target.closest('.back-to-projects-btn')) { navigateTo('page-projects'); }
        if (e.target.closest('#cancel-manual-entry-btn')) { closeModal(document.getElementById('manual-entry-modal')); }
        if (e.target.closest('.view-goal-detail-btn')) { currentGoalId = e.target.closest('[data-goal-id]').dataset.goalId; navigateTo('page-goal-detail'); }
    });
    
    document.getElementById('add-project-form').addEventListener('submit',saveNewProject);
    document.getElementById('manual-entry-form').addEventListener('submit',saveManualEntry);
    document.getElementById('add-predefined-task-form').addEventListener('submit',savePredefinedTask);
    document.getElementById('add-goal-form').addEventListener('submit',saveGoal);
    document.getElementById('name-session-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const modal = document.getElementById('name-session-modal');
        const projectId = modal.querySelector('#session-project-id').value;
        const sessionName = modal.querySelector('#session-name').value.trim();
        initiateTimer(projectId, sessionName);
        modal.querySelector('form').reset();
        closeModal(modal);
    });
    document.getElementById('modal-backdrop').addEventListener('click',()=>{closeModal(document.getElementById('add-project-modal'));closeModal(document.getElementById('guide-modal'));closeModal(document.getElementById('manual-entry-modal'));closeModal(document.getElementById('add-predefined-task-modal'));closeModal(document.getElementById('add-goal-modal'));closeModal(document.getElementById('name-session-modal'));closeModal(document.getElementById('confirmation-modal'));closeModal(document.getElementById('notes-view-modal'));});
    
    document.body.addEventListener('change',async e=>{
        if(e.target.closest('#dark-mode-toggle'))toggleTheme();
        if(e.target.matches('#import-file-input'))importDataFromJSON(e);
        if(e.target.matches('.predefined-task-checkbox')){const taskEl=e.target.closest('[data-task-id]');const taskId=taskEl.dataset.taskId;const task=predefinedTasks.find(t=>t.id===taskId);if(task){const isCompleted=e.target.checked;const completedDate=e.target.checked?Date.now():null;await updateData('predefinedTasks',taskId, {isCompleted, completedDate, completedInSessionId: null });}}
        const sessionPage = e.target.closest('#page-session');
        if(sessionPage && e.target.matches('#session-start-time')) {
            const newTime = e.target.value;
            const [hours, minutes] = newTime.split(':');
            const newStartDate = new Date(activeTimer.startTime);
            newStartDate.setHours(hours, minutes);
            activeTimer.startTime = newStartDate.getTime();
            localStorage.setItem('activeTimerState', JSON.stringify(activeTimer));
            renderSessionPage();
        }
        const detailPage = e.target.closest('#page-detail');
        if(detailPage && e.target.matches('.project-status-radio')) { const p = projects.find(proj => proj.id === currentDetailProjectId); if(p) { await updateData('projects', p.id, {status: e.target.value}); } }
    });
    
    document.addEventListener('input',e=>{const input=e.target;if(input.matches('#session-notes')){ if(activeTimer)activeTimer.notes=input.value;localStorage.setItem('activeTimerState', JSON.stringify(activeTimer));}
    else if(input.matches('#session-tags')){if(!activeTimer)return;activeTimer.tags=input.value.trim().split(/[\s,]+/).filter(Boolean);localStorage.setItem('activeTimerState', JSON.stringify(activeTimer));}});
}

const initializeAppWithUI = () => { 
    // --- Assign UI Element Refs ---
    signInScreen = document.getElementById('sign-in-screen');
    appContainer = document.getElementById('app-container');
    authForm = document.getElementById('auth-form');
    authLoader = document.getElementById('auth-loader');
    displayNameField = document.getElementById('display-name-field');
    displayNameInput = document.getElementById('display-name');
    authSubmitBtn = document.getElementById('auth-submit-btn');
    authToggleBtn = document.getElementById('auth-toggle-btn');
    authPromptText = document.getElementById('auth-prompt-text');

    // --- FIREBASE INITIALIZATION ---
    const firebaseConfig = {
        apiKey: "AIzaSyDM0zahTuXrK5PJ9_uVIciVeXyKf6bui0U",
        authDomain: "buddy-c0f56.firebaseapp.com",
        projectId: "buddy-c0f56",
        storageBucket: "buddy-c0f56.firebasestorage.app",
        messagingSenderId: "1002206808117",
        appId: "1:1002206808117:web:2e83aed7bce117afab897c"
    };

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    // setLogLevel('debug'); // Uncomment for detailed logs
    
    addEventListeners();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            document.getElementById('user-avatar-header').src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=random`;
            document.getElementById('user-name-header').textContent = user.displayName || user.email;
            document.getElementById('user-info').classList.remove('hidden');
            signInScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            setupFirestoreListeners();
            checkPersistentTimer();
            if (activeTimer) { navigateTo('page-session'); } 
            else { navigateTo('page-timer'); }
        } else {
            userId = null;
            unsubscribeListeners.forEach(unsub => unsub());
            unsubscribeListeners = [];
            projects = []; tasks = []; goals = []; predefinedTasks = [];
            
            // Reset auth form to default sign-in state when user logs out
            if (isSignUp) {
                toggleAuthMode();
            }
            authForm.reset();
            
            appContainer.classList.add('hidden');
            signInScreen.classList.remove('hidden');
            document.getElementById('user-info').classList.add('hidden');
        }
    });

    // --- UI INITIALIZATION ---
    applyTheme(localStorage.getItem('theme') || 'light'); 
    applyAccentTheme(localStorage.getItem('accentTheme') || 'theme-teal');
};

// --- Start the App ---
document.addEventListener('DOMContentLoaded', initializeAppWithUI);
