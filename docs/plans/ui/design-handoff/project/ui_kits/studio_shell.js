/* Studio shell — render top nav and sidebar into a host element.
   Each mode page just calls renderShell({ mode }) and focuses on its own workspace. */

window.renderShell = function ({ mode }) {
  const modes = [
    { key: 'image', label: 'Image', href: 'Studio — Image.html', icon:
      '<svg class="ico" viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 16-6-6-9 9"/></svg>' },
    { key: 'video', label: 'Video', href: 'Studio — Video.html', icon:
      '<svg class="ico" viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 4-2v8l-4-2"/></svg>' },
    { key: 'audio', label: 'Audio', href: 'Studio — Audio.html', icon:
      '<svg class="ico" viewBox="0 0 24 24" width="14" height="14"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 12a6 6 0 0 0 12 0M12 18v3"/></svg>' },
  ];

  const projects = [
    { id: 'p1', name: 'Golden Hour', color: '#d97757', count: 42, active: mode !== 'video' && mode !== 'audio' },
    { id: 'p2', name: 'Espresso Bar Short', color: '#9b59b6', count: 18, active: mode === 'video' },
    { id: 'p3', name: 'Field Notes Podcast', color: '#6d8f5c', count: 7, active: mode === 'audio' },
    { id: 'p4', name: 'Riso Zine 03', color: '#e8a34a', count: 24 },
    { id: 'p5', name: 'Inbox', color: '#a8a29e', count: 128 },
  ];

  return `
  <nav class="top-nav">
    <div class="tn-left">
      <a class="tn-brand" href="#"><span class="mark">P</span>PixelVault</a>
      <div class="tn-links">
        <a class="tn-link" href="#">Gallery</a>
        <a class="tn-link on" href="#">Studio</a>
        <a class="tn-link" href="#">Arena</a>
        <a class="tn-link" href="#">Stories</a>
      </div>
    </div>
    <div class="tn-right">
      <button class="tn-cmd">
        <svg class="ico" viewBox="0 0 24 24" width="13" height="13"><circle cx="11" cy="11" r="7"/><path d="m21 21-5-5"/></svg>
        Search or jump to…
        <span class="kbd">⌘K</span>
      </button>
      <span class="tn-credit">128 credits</span>
      <span class="tn-av">LK</span>
    </div>
  </nav>

  <aside class="sidebar">
    <div class="sb-mode-switch">
      ${modes.map(m => `
        <a class="sb-mode ${m.key} ${mode === m.key ? 'on' : ''}" href="${m.href}">
          <span class="ico-wrap ico">${m.icon}</span>
          ${m.label}
        </a>
      `).join('')}
    </div>

    <div class="sb-section">
      <div class="sb-head">
        <span>Projects</span>
        <button class="sb-head-btn" title="New project">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      ${projects.map(p => `
        <div class="tree-row ${p.active ? 'on' : ''}" data-project="${p.id}">
          <span class="color-tag" style="background:${p.color}"></span>
          <span class="name">${p.name}</span>
          <span class="count">${p.count}</span>
        </div>
      `).join('')}
      <button class="sb-new">
        <svg class="ico" viewBox="0 0 24 24" width="12" height="12"><path d="M12 5v14M5 12h14"/></svg>
        New project
      </button>
    </div>

    <div class="sb-footer">
      <div class="sb-foot-row">
        <svg class="ico" viewBox="0 0 24 24" width="14" height="14"><circle cx="8" cy="15" r="4"/><path d="m10.5 12.5 9-9M15 5l3 3"/></svg>
        API keys
        <span class="tag">3/6</span>
      </div>
      <div class="sb-foot-row">
        <svg class="ico" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M1 12h4M19 12h4M4.2 19.8l2.8-2.8M17 7l2.8-2.8"/></svg>
        Settings
      </div>
    </div>
  </aside>
  `;
};
