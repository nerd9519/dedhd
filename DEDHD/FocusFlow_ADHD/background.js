// background.js - DEDHD FocusFlow v2 Service Worker
let lastState = { level: 0, score: 0, signals: {} };

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'ADHD_LEVEL_UPDATE') {
        lastState = { level: message.level, score: message.score, signals: message.signals };
        chrome.runtime.sendMessage({
            type: 'ADHD_LEVEL_UPDATE',
            level: message.level,
            score: message.score,
            signals: message.signals
        }).catch(() => {});
    }
    if (message.type === 'GET_LAST_STATE') {
        sendResponse(lastState);
        return true;
    }
});