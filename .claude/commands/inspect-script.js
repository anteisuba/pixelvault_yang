(function () {
  if (window.__CLAUDE_INSPECTOR_ACTIVE) {
    console.log('[CLAUDE_INSPECT]{"already_active":true}');
    return;
  }
  window.__CLAUDE_INSPECTOR_ACTIVE = true;

  // --- Overlay elements ---
  var overlay = document.createElement('div');
  overlay.id = '__claude-inspector-overlay';
  overlay.style.cssText =
    'position:fixed;pointer-events:none;border:2px solid #d97757;' +
    'background:rgba(217,119,87,0.08);z-index:2147483647;' +
    'transition:top .08s ease-out,left .08s ease-out,width .08s ease-out,height .08s ease-out;' +
    'top:0;left:0;width:0;height:0;display:none;';

  var label = document.createElement('div');
  label.style.cssText =
    'position:absolute;top:-22px;left:-2px;background:#d97757;color:#fff;' +
    'font:bold 11px/20px system-ui,sans-serif;padding:0 6px;border-radius:3px 3px 0 0;' +
    'white-space:nowrap;pointer-events:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;';
  overlay.appendChild(label);

  var hint = document.createElement('div');
  hint.style.cssText =
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'background:#141413;color:#faf9f5;font:13px/32px system-ui,sans-serif;' +
    'padding:0 16px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.25);' +
    'pointer-events:none;';
  hint.textContent = 'Inspector active — click to capture, Esc to cancel';

  document.body.appendChild(overlay);
  document.body.appendChild(hint);

  // --- React fiber helpers ---
  function getReactFiber(el) {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].startsWith('__reactFiber$')) return el[keys[i]];
    }
    return null;
  }

  function getReactComponentInfo(el) {
    var fiber = getReactFiber(el);
    if (!fiber) return { componentName: null, displayName: null, debugSource: null };

    var current = fiber;
    while (current) {
      // FunctionComponent or ClassComponent
      if (typeof current.type === 'function' && current.type.name) {
        return {
          componentName: current.type.name,
          displayName: current.type.displayName || current.type.name,
          debugSource: current._debugSource || null,
        };
      }
      // memo() / forwardRef() wrappers
      if (current.type && typeof current.type === 'object') {
        var inner = current.type.type || current.type.render;
        if (typeof inner === 'function' && inner.name) {
          return {
            componentName: inner.name,
            displayName: current.type.displayName || inner.name,
            debugSource: current._debugSource || null,
          };
        }
      }
      current = current.return;
    }
    return { componentName: null, displayName: null, debugSource: null };
  }

  function getQuickLabel(el) {
    var info = getReactComponentInfo(el);
    if (info.componentName) return '<' + info.componentName + '>';
    var tag = el.tagName.toLowerCase();
    var cls =
      el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/)[0]
        : '';
    return tag + cls;
  }

  // --- DOM helpers ---
  function getDomPath(el) {
    var parts = [];
    var cur = el;
    while (cur && cur !== document.body && parts.length < 8) {
      var sel = cur.tagName.toLowerCase();
      if (cur.id) sel += '#' + cur.id;
      else if (cur.className && typeof cur.className === 'string') {
        var first = cur.className.trim().split(/\s+/)[0];
        if (first) sel += '.' + first;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function getDataAttributes(el) {
    var result = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (attr.name.startsWith('data-')) result[attr.name] = attr.value;
    }
    return result;
  }

  // --- Event handlers ---
  var lastTarget = null;

  function onMouseMove(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || overlay.contains(el) || el === hint) return;
    if (el === lastTarget) return;
    lastTarget = el;

    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    label.textContent = getQuickLabel(el);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var el = e.target;
    if (el === overlay || overlay.contains(el) || el === hint) return;

    var rect = el.getBoundingClientRect();
    var computed = window.getComputedStyle(el);
    var reactInfo = getReactComponentInfo(el);

    var data = {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes:
        el.className && typeof el.className === 'string'
          ? el.className.trim()
          : '',
      textContent: (el.textContent || '').trim().slice(0, 200),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      styles: {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        padding: computed.padding,
        margin: computed.margin,
        borderRadius: computed.borderRadius,
        display: computed.display,
        position: computed.position,
      },
      react: {
        componentName: reactInfo.componentName,
        displayName: reactInfo.displayName,
        debugSource: reactInfo.debugSource
          ? {
              fileName: reactInfo.debugSource.fileName,
              lineNumber: reactInfo.debugSource.lineNumber,
              columnNumber: reactInfo.debugSource.columnNumber,
            }
          : null,
      },
      domPath: getDomPath(el),
      dataAttributes: getDataAttributes(el),
    };

    console.log('[CLAUDE_INSPECT]' + JSON.stringify(data));
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      console.log('[CLAUDE_INSPECT]{"cancelled":true}');
      cleanup();
    }
  }

  // --- Cleanup ---
  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (hint.parentNode) hint.parentNode.removeChild(hint);
    window.__CLAUDE_INSPECTOR_ACTIVE = false;
    window.__CLAUDE_INSPECTOR_CLEANUP = null;
  }

  window.__CLAUDE_INSPECTOR_CLEANUP = cleanup;

  // --- Attach listeners ---
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();
