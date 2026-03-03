# Design: Dashboard View Sidebar Hide

**Date:** 2026-03-03
**Status:** Approved
**Scope:** Frontend only (2 files)

## Problem

When navigating to the Dashboard view, the sidebar continues to display the chat session list, which is irrelevant to the dashboard context and wastes horizontal space.

## Goal

Hide the sidebar completely when `currentView === 'dashboard'`, allowing the dashboard to occupy the full window width.

## Approach

Conditional rendering in `App.tsx`. The sidebar and its overlay are only mounted when the current view is not `'dashboard'`.

## Changes

### `frontend/src/App.tsx`

Wrap the sidebar overlay and `<Sidebar>` component in a conditional block:

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

### `frontend/src/App.css` (if needed)

If the `app-layout` uses CSS Grid with a fixed sidebar column, verify that removing the sidebar DOM element causes `.main-content` to automatically expand. If not, add:

```css
.app-layout .main-content {
  /* Ensure full width when sidebar is absent */
  min-width: 0;
  flex: 1;
}
```

## Expected Behavior

| View | Sidebar | Main Content |
|------|---------|--------------|
| `chat` | Visible | Next to sidebar |
| `settings` | Visible | Next to sidebar |
| `dashboard` | **Hidden** | **Full width** |

## Out of Scope

- Dashboard-specific sidebar navigation (Phase 2 consideration)
- Animated slide transition for sidebar on view change
- Mobile responsiveness changes (existing behavior preserved)
