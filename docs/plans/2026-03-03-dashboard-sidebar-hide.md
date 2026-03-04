# Dashboard Sidebar Hide Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide the sidebar and sidebar overlay when `currentView === 'dashboard'` so the dashboard occupies the full window width.

**Architecture:** Conditional rendering in `App.tsx` — wrap the `<Sidebar>` and sidebar overlay `<div>` in a fragment guarded by `currentView !== 'dashboard'`. The existing `flex: 1` on `.main-content` means no CSS changes are needed; removing the sidebar from the DOM automatically gives the main content full width.

**Tech Stack:** React 19, TypeScript, Vite

---

### Task 1: Conditionally render sidebar in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Read the current render block**

Open `frontend/src/App.tsx` and locate the `return (...)` block. Find these two adjacent elements (around line 120):

```tsx
<div
  className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
  onClick={() => setSidebarOpen(false)}
/>
<Sidebar
  sessions={sessions}
  activeSessionId={activeSessionId}
  onSelectSession={handleSelectSession}
  onNewSession={handleNewSession}
  onDeleteSession={handleDeleteSession}
  onOpenSettings={() => setCurrentView('settings')}
  onOpenDashboard={() => setCurrentView('dashboard')}
  currentView={currentView}
  className={sidebarOpen ? 'open' : 'collapsed'}
/>
```

**Step 2: Wrap both elements in a conditional fragment**

Replace the two elements above with:

```tsx
{currentView !== 'dashboard' && (
  <>
    <div
      className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
      onClick={() => setSidebarOpen(false)}
    />
    <Sidebar
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      onDeleteSession={handleDeleteSession}
      onOpenSettings={() => setCurrentView('settings')}
      onOpenDashboard={() => setCurrentView('dashboard')}
      currentView={currentView}
      className={sidebarOpen ? 'open' : 'collapsed'}
    />
  </>
)}
```

**Step 3: Verify no TypeScript errors**

```bash
cd frontend && npm run lint
```

Expected: no errors

**Step 4: Manual verification in browser**

```bash
# From project root
make start
```

Then open http://localhost:5173:
- Navigate to Dashboard → sidebar should be completely gone, dashboard fills full width
- Navigate to Chat → sidebar should appear again
- Navigate to Settings → sidebar should appear

**Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): hide sidebar in dashboard view"
```

---

## Done

The sidebar is now hidden in dashboard view. No CSS changes required because `.main-content` already has `flex: 1` which causes it to expand automatically when the sidebar is removed from the DOM.
