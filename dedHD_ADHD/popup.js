// popup.js - DEDHD FocusFlow v2
document.addEventListener('DOMContentLoaded', () => {
    chrome.runtime.sendMessage({ type: 'GET_LAST_STATE' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response) updateUI(response.score, response.level, response.signals);
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'ADHD_LEVEL_UPDATE') {
            updateUI(message.score, message.level, message.signals);
        }
    });
});

const SIGNAL_META = {
    typingSpeed:       { label: 'Typing Speed',      icon: '⌨️' },
    mouseJitter:       { label: 'Mouse Jitter',       icon: '🖱️' },
    idle:              { label: 'Idle',                icon: '💤' },
    scrollSpeed:       { label: 'Scroll Speed',       icon: '📜' },
    tabSwitching:      { label: 'Tab Switching',      icon: '🗂️' },
    rapidClicking:     { label: 'Rapid Clicking',     icon: '👆' },
    copyPaste:         { label: 'Copy-Paste',         icon: '📋' },
    inputInactivity:   { label: 'Input Inactivity',   icon: '⏸️' },
    windowResize:      { label: 'Window Resize',      icon: '↔️' },
    cursorLeaving:     { label: 'Cursor Leaving',     icon: '🚪' },
    readingSpeed:      { label: 'Reading Speed',      icon: '👁️' },
    backspaceRate:     { label: 'Backspace Rate',     icon: '⌫' },
    rageClicking:      { label: 'Rage Clicking',      icon: '😤' },
    zoomChanges:       { label: 'Zoom Changes',       icon: '🔍' },
    timeOnPage:        { label: 'Time on Page',       icon: '⏱️' },
};

const LEVEL_COLORS = ['#555', '#00FF88', '#FFA500', '#FF4D4D'];

function updateUI(score, level, signals) {
    const bar = document.getElementById('progress-bar');
    document.getElementById('score-text').innerText = Math.round(score);
    document.getElementById('level-text').innerText = level;
    bar.style.width = score + '%';

    const masterColors = { 0:'#4CAF50', 1:'#00FF88', 2:'#FFA500', 3:'#FF4D4D' };
    const masterModes  = { 0:'Standby', 1:'Clean', 2:'Readability', 3:'Zen' };
    const masterDescs  = {
        0: 'All signals nominal.',
        1: 'Mild fatigue. Distractions hidden.',
        2: 'Moderate load. Sepia mode on.',
        3: 'High load. Full zen mode active.'
    };

    bar.style.backgroundColor = masterColors[level] ?? '#555';
    document.getElementById('mode-text').innerText  = masterModes[level] ?? 'Unknown';
    document.getElementById('description-text').innerText = masterDescs[level] ?? '';

    // Render signal grid
    const grid = document.getElementById('signal-grid');
    if (!grid || !signals) return;
    grid.innerHTML = '';

    Object.entries(signals).forEach(([key, lvl]) => {
        const meta = SIGNAL_META[key];
        if (!meta) return;
        const cell = document.createElement('div');
        cell.className = 'signal-cell';
        cell.innerHTML = `
            <span class="signal-icon">${meta.icon}</span>
            <span class="signal-label">${meta.label}</span>
            <div class="signal-bars">
                <div class="signal-bar ${lvl >= 1 ? 'active' : ''}" style="--bar-color:${lvl >= 1 ? LEVEL_COLORS[1] : '#333'}"></div>
                <div class="signal-bar ${lvl >= 2 ? 'active' : ''}" style="--bar-color:${lvl >= 2 ? LEVEL_COLORS[2] : '#333'}"></div>
                <div class="signal-bar ${lvl >= 3 ? 'active' : ''}" style="--bar-color:${lvl >= 3 ? LEVEL_COLORS[3] : '#333'}"></div>
            </div>`;
        grid.appendChild(cell);
    });
}