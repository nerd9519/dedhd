```
██████  ███████ ██████  ██   ██ ██████  
██   ██ ██      ██   ██ ██   ██ ██   ██ 
██   ██ █████   ██   ██ ███████ ██   ██ 
██   ██ ██      ██   ██ ██   ██ ██   ██ 
██████  ███████ ██████  ██   ██ ██████  
```



# dedHD – Cognitive Fatigue-Aware Interface Adapter

A Chrome extension that gently helps users regain focus by detecting ADHD behavioral patterns like rapid scrolling, jittery mouse movement, fast typing, and more.

Instead of blocking or restricting, dedHD provides **subtle interventions** like breathing exercises, UI adjustments, and reminders.

---

## ✨ Features

### Behavior Detection

* Rapid mouse movement (restlessness)
* Fast scrolling / doomscrolling
* High typing speed (mental rush)
* Rage clicking (repeated clicks in same area)
* Idle → sudden activity spikes
* YouTube Shorts detection

---

### 🎯 Smart Interventions

* 🧘 Breathing assistant (calming overlay)
* 🔍 Focus mode (larger text, centered layout)
* 🌙 Calm mode (reduced visual intensity)
* 💬 Gentle popups (non-intrusive reminders)
* 📵 YouTube Shorts interruption (pause + prompt)

---

## 🧩 How It Works

The extension tracks short-term behavioral signals (last few seconds) and maps them to possible attention states.

Example:

* Fast typing → cognitive overload → breathing exercise
* Rage clicking → frustration → calming intervention
* Doomscrolling → passive consumption → blur + prompt

---

## ⚙️ Tech Stack

* JavaScript (Vanilla)
* Chrome Extensions API (Manifest v3)
* DOM event listeners (mousemove, scroll, keydown, click)

---

## ⚠️ Note

This extension does **not diagnose ADHD**.

It detects **behavioral patterns that may correlate with distraction or overload**, and offers helpful interventions.

---

## 💡 Future Ideas

* Settings panel (toggle features, adjust sensitivity)
* Attention analytics dashboard
* AI-based personalization
* Instagram / Reels detection
* Task memory (“What were you doing?” persistence)

