/* Share — select menu items, render to canvas, copy to clipboard or share */

var Share = (() => {
  /* ── Constants ────────────────────────────────────────── */

  const CANVAS_WIDTH = 720;
  const PADDING = 36;
  const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;
  const LOGO_SIZE = 44;
  const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Catppuccin Mocha — consistent branding regardless of user theme
  const COLOR = {
    bg:        '#1e1e2e',
    text:      '#cdd6f4',
    secondary: '#a6adc8',
    muted:     '#6c7086',
    accent:    '#cba6f7',
    border:    '#45475a',
  };

  const TAG_COLORS = {
    Vegan:            { bg: 'rgba(166,227,161,0.18)', fg: '#a6e3a1' },
    Vegetarisch:      { bg: 'rgba(148,226,213,0.18)', fg: '#94e2d5' },
    Fisch:            { bg: 'rgba(137,180,250,0.18)', fg: '#89b4fa' },
    'Meeresfrüchte':  { bg: 'rgba(137,180,250,0.18)', fg: '#89b4fa' },
    'Geflügel':       { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
    Huhn:             { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
    Pute:             { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
    Ente:             { bg: 'rgba(250,179,135,0.18)', fg: '#fab387' },
    Fleisch:          { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
    Lamm:             { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
    Schweinefleisch:  { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
    Rindfleisch:      { bg: 'rgba(243,139,168,0.18)', fg: '#f38ba8' },
    Glutenfrei:       { bg: 'rgba(249,226,175,0.18)', fg: '#f9e2af' },
    Laktosefrei:      { bg: 'rgba(180,190,254,0.18)', fg: '#b4befe' },
  };
  const TAG_COLOR_DEFAULT = { bg: 'rgba(203,166,247,0.18)', fg: '#cba6f7' };

  const BADGE_COLORS = {
    Edenred: '#f38ba8',
    Stempelkarte: '#94e2d5',
  };

  const TOAST_DURATION_MS = 2500;
  const VIBRATE_MS = 8;
  const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

  let selectionBar = null;
  let logoImage = null;
  let headerTitle = 'Mittagsmen\u00fc';
  let headerSubtitle = 'Austria Campus, Wien';
  let getSelectionData = null;

  /* ── Public API ───────────────────────────────────────── */

  function setup({ title, subtitle, logo, getSelectionData: selectionDataFn } = {}) {
    if (title) headerTitle = title;
    if (subtitle) headerSubtitle = subtitle;
    if (logo) prepareLogo(logo);
    if (selectionDataFn) getSelectionData = selectionDataFn;
    createSelectionBar();

    document.addEventListener('click', event => {
      if (event.target.closest('.share-bar-picture')) { shareSelectionAsPicture(); return; }
      if (event.target.closest('.share-bar-text'))    { shareSelectionAsText(); return; }
      if (event.target.closest('.share-bar-clear'))   { clearSelection(); return; }

      const selectBtn = event.target.closest('.share-select-btn');
      if (selectBtn) {
        const card = selectBtn.closest('.restaurant-card');
        if (card) {
          const wasSelected = card.classList.contains('share-selected');
          card.querySelectorAll('.menu-item.share-selected').forEach(el => el.classList.remove('share-selected'));
          card.classList.toggle('share-selected', !wasSelected);
          navigator.vibrate?.(VIBRATE_MS);
          updateSelectionBar();
        }
        return;
      }

      // Menu item selection toggle (ignore clicks on links/buttons inside items)
      const menuItem = event.target.closest('.menu-item');
      if (menuItem && !event.target.closest('a, button')) {
        const card = menuItem.closest('.restaurant-card');
        if (card) card.classList.remove('share-selected');
        menuItem.classList.toggle('share-selected');
        navigator.vibrate?.(VIBRATE_MS);
        updateSelectionBar();
      }
    });
  }

  function renderShareImage(data) {
    const measureCtx = document.createElement('canvas').getContext('2d');
    const height = layoutCanvas(measureCtx, data, false);

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    fillRoundRect(ctx, 0, 0, CANVAS_WIDTH, height, 16, COLOR.bg);
    layoutCanvas(ctx, data, true);

    return canvas;
  }

  /* ── Selection & sharing ──────────────────────────────── */

  async function shareSelectionAsPicture() {
    const data = getSelectionData?.();
    if (!data) return;
    const canvas = renderShareImage(data);
    const filename = data.sections.length === 1 ? data.sections[0].restaurant : 'auswahl';
    await exportImage(canvas, filename);
    clearSelection();
  }

  async function shareSelectionAsText() {
    const data = getSelectionData?.();
    if (!data) return;
    const text = formatAsText(data);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Text kopiert', null, text);
    } catch {
      // Clipboard blocked — try native share (Firefox Android, etc.)
      if (navigator.share) {
        try {
          await navigator.share({ text });
          clearSelection();
          return;
        } catch (error) {
          if (error.name === 'AbortError') { clearSelection(); return; }
        }
      }
      showToast('Kopieren fehlgeschlagen');
    }
    clearSelection();
  }

  function formatAsText(data) {
    const lines = [];
    if (data.day) lines.push(formatDayLabel(data.day));

    for (const restaurant of data.sections) {
      if (lines.length) lines.push('');
      lines.push(restaurant.name);

      for (const category of restaurant.categories) {
        for (const item of category.items) {
          const price = item.price ? `  ${item.price}` : '';
          lines.push(`- ${item.title.replace(/\n/g, ' ')}${price}`);
          if (item.description) lines.push(`  ${item.description}`);
        }
      }
    }

    lines.push('');
    lines.push(window.location.origin + window.location.pathname);

    return lines.join('\n');
  }

  function clearSelection() {
    document.querySelectorAll('.share-selected').forEach(el => el.classList.remove('share-selected'));
    updateSelectionBar();
  }

  /* ── Floating selection bar ───────────────────────────── */

  function createSelectionBar() {
    const bar = document.createElement('div');
    bar.className = 'share-bar';
    bar.innerHTML = `
      <span class="share-bar-label">Share</span>
      <span class="share-bar-count"></span>
      <div class="share-bar-actions">
        <button class="share-bar-picture" aria-label="Als Bild teilen" title="Als Bild">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
        <button class="share-bar-text" aria-label="Als Text kopieren" title="Als Text">Txt</button>
        <button class="share-bar-clear" aria-label="Auswahl aufheben" title="Aufheben">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
    document.body.appendChild(bar);
    selectionBar = bar;
  }

  function updateSelectionBar() {
    if (!selectionBar) return;
    const selectedItems = document.querySelectorAll('.day-panel.active .menu-item.share-selected:not(.hidden)').length;
    const selectedCards = document.querySelectorAll('.day-panel.active .restaurant-card.share-selected').length;
    const totalSelected = selectedItems + selectedCards;
    const countLabel = selectionBar.querySelector('.share-bar-count');
    countLabel.textContent = totalSelected === 1 ? '1 ausgewählt' : totalSelected + ' ausgewählt';
    selectionBar.classList.toggle('visible', totalSelected > 0);
  }

  /* ── Image export (clipboard / share / download) ──────── */

  async function exportImage(canvas, name) {
    const filename = (name || 'menu') + '.png';

    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      // Try with Blob first (Chrome, Firefox)
      try {
        const blob = await canvasToBlob(canvas);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('In Zwischenablage kopiert', canvas);
        return;
      } catch { /* fall through */ }

      // Try with Promise (Safari — preserves user activation)
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'image/png': new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
        })]);
        showToast('In Zwischenablage kopiert', canvas);
        return;
      } catch { /* fall through */ }
    }

    // Web Share API with file (Chrome Android, iOS Safari 15+)
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], filename, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          url: window.location.origin + window.location.pathname,
        });
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
    }

    // Download fallback (Firefox Android, desktop without clipboard support)
    downloadBlob(blob, filename);
    showToast('Bild heruntergeladen', canvas);
  }

  function showToast(message, canvas, text) {
    const existing = document.querySelector('.share-toast');
    if (existing) existing.remove();
    const existingBackdrop = document.querySelector('.share-toast-backdrop');
    if (existingBackdrop) existingBackdrop.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'share-toast-backdrop';

    const toast = document.createElement('div');
    toast.className = 'share-toast';

    if (canvas) {
      const preview = document.createElement('img');
      preview.className = 'share-toast-preview';
      preview.src = canvas.toDataURL('image/png');
      toast.appendChild(preview);
    } else if (text) {
      const preview = document.createElement('pre');
      preview.className = 'share-toast-text-preview';
      preview.textContent = text;
      toast.appendChild(preview);
    }

    const label = document.createElement('span');
    label.className = 'share-toast-label';
    label.textContent = message;
    toast.appendChild(label);

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      toast.classList.remove('visible');
      backdrop.classList.remove('visible');
      setTimeout(() => { toast.remove(); backdrop.remove(); }, 400);
    }

    backdrop.addEventListener('click', dismiss);
    toast.addEventListener('click', dismiss);

    document.body.appendChild(backdrop);
    document.body.appendChild(toast);
    // Force layout so the browser registers the initial state before transitioning
    toast.offsetHeight;
    if (canvas) backdrop.classList.add('flash');
    backdrop.classList.add('visible');
    toast.classList.add('visible');
    setTimeout(dismiss, TOAST_DURATION_MS);
  }

  /* ── Canvas rendering ─────────────────────────────────── */

  function layoutCanvas(ctx, data, draw) {
    let y = PADDING;

    const titleX = PADDING + LOGO_SIZE + 12;
    if (draw && logoImage) ctx.drawImage(logoImage, PADDING, y, LOGO_SIZE, LOGO_SIZE);

    setFont(ctx, '700 22px');
    if (draw) { ctx.fillStyle = COLOR.accent; ctx.fillText(headerTitle, titleX, y + 19); }
    setFont(ctx, '15px');
    if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(headerSubtitle, titleX, y + 38); }

    if (data.day) {
      setFont(ctx, '16px');
      const dayLabel = formatDayLabel(data.day);
      const dayLabelWidth = ctx.measureText(dayLabel).width;
      if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(dayLabel, CANVAS_WIDTH - PADDING - dayLabelWidth, y + 19); }
    }

    y += LOGO_SIZE;

    y += 8;
    if (draw) { ctx.fillStyle = COLOR.border; ctx.fillRect(PADDING, y, CONTENT_WIDTH, 1); }
    y += 18;

    const restaurants = data.sections || [data];
    for (let ri = 0; ri < restaurants.length; ri++) {
      if (ri > 0) {
        y += 10;
        if (draw) { ctx.fillStyle = COLOR.border; ctx.fillRect(PADDING, y, CONTENT_WIDTH, 2); }
        y += 20;
      }
      y = drawRestaurant(ctx, restaurants[ri], y, draw);
    }

    return y + PADDING;
  }

  function drawRestaurant(ctx, restaurant, y, draw) {
    setFont(ctx, '700 22px');
    const nameLines = wrapText(ctx, restaurant.name, CONTENT_WIDTH);
    for (const line of nameLines) {
      if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(line, PADDING, y + 20); }
      y += 30;
    }

    if (restaurant.cuisine || restaurant.badges.length) {
      y += 3;
      let x = PADDING;
      if (restaurant.cuisine) {
        setFont(ctx, '600 12px');
        const textWidth = ctx.measureText(restaurant.cuisine).width;
        if (draw) {
          fillRoundRect(ctx, x, y, textWidth + 14, 22, 11, COLOR.border);
          ctx.fillStyle = COLOR.secondary;
          ctx.fillText(restaurant.cuisine, x + 7, y + 15);
        }
        x += textWidth + 18;
      }
      for (const badge of restaurant.badges) {
        setFont(ctx, 'bold 12px');
        const textWidth = ctx.measureText(badge).width;
        const badgeColor = BADGE_COLORS[badge] || COLOR.accent;
        if (draw) {
          fillRoundRect(ctx, x, y, textWidth + 14, 22, 11, badgeColor + '30');
          ctx.fillStyle = badgeColor;
          ctx.fillText(badge, x + 7, y + 15);
        }
        x += textWidth + 18;
      }
      y += 28;
    }

    y += 10;

    if (restaurant.categories.length === 0 && restaurant.noData) {
      setFont(ctx, 'italic 15px');
      if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(restaurant.noData, PADDING, y + 14); }
      y += 26;
    }

    for (let ci = 0; ci < restaurant.categories.length; ci++) {
      const category = restaurant.categories[ci];

      if (draw) { ctx.fillStyle = COLOR.accent; ctx.fillRect(PADDING, y + 4, 3, 14); }
      setFont(ctx, '600 13px');
      if (draw) { ctx.fillStyle = COLOR.muted; ctx.fillText(category.name.toUpperCase(), PADDING + 10, y + 16); }
      y += 28;

      for (let ii = 0; ii < category.items.length; ii++) {
        const item = category.items[ii];

        setFont(ctx, '17px');
        const priceWidth = item.price ? ctx.measureText(item.price).width : 0;
        const titleMaxWidth = item.price ? CONTENT_WIDTH - priceWidth - 20 : CONTENT_WIDTH;
        const titleLines = wrapText(ctx, item.title, titleMaxWidth);

        for (let li = 0; li < titleLines.length; li++) {
          if (draw) { ctx.fillStyle = COLOR.text; ctx.fillText(titleLines[li], PADDING, y + 16); }
          if (li === 0 && item.price && draw) {
            setFont(ctx, '600 17px');
            ctx.fillStyle = COLOR.accent;
            ctx.fillText(item.price, CANVAS_WIDTH - PADDING - priceWidth, y + 16);
            setFont(ctx, '17px');
          }
          y += 24;
        }

        if (item.description) {
          setFont(ctx, '15px');
          const descriptionLines = wrapText(ctx, item.description, CONTENT_WIDTH);
          for (const line of descriptionLines) {
            if (draw) { ctx.fillStyle = COLOR.secondary; ctx.fillText(line, PADDING, y + 14); }
            y += 20;
          }
        }

        if (item.tags.length) {
          y += 3;
          let x = PADDING;
          setFont(ctx, '600 11px');
          for (const tag of item.tags) {
            const tagColor = TAG_COLORS[tag] || TAG_COLOR_DEFAULT;
            const tagLabel = tag.toUpperCase();
            const tagWidth = ctx.measureText(tagLabel).width;
            if (draw) {
              fillRoundRect(ctx, x, y, tagWidth + 10, 18, 9, tagColor.bg);
              ctx.fillStyle = tagColor.fg;
              ctx.fillText(tagLabel, x + 5, y + 13);
            }
            x += tagWidth + 14;
          }
          y += 22;
        }

        if (ii < category.items.length - 1) {
          y += 4;
          if (draw) { ctx.fillStyle = COLOR.border; ctx.fillRect(PADDING, y, CONTENT_WIDTH, 0.5); }
          y += 8;
        } else {
          y += 5;
        }
      }

      if (ci < restaurant.categories.length - 1) y += 10;
    }

    return y;
  }

  /* ── Helpers ──────────────────────────────────────────── */

  function prepareLogo(svgElement) {
    const clone = svgElement.cloneNode(true);
    clone.setAttribute('width', '64');
    clone.setAttribute('height', '64');
    clone.querySelector('.logo-bg')?.setAttribute('fill', COLOR.accent);
    clone.querySelectorAll('.logo-fg').forEach(el => el.setAttribute('fill', COLOR.bg));
    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' });
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { logoImage = img; URL.revokeObjectURL(blobUrl); };
    img.src = blobUrl;
  }

  function setFont(ctx, style) {
    ctx.font = style + ' ' + FONT_STACK;
  }

  function wrapText(ctx, text, maxWidth) {
    if (!text) return [''];
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(candidate).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  function fillRoundRect(ctx, x, y, width, height, radius, fill) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function formatDayLabel(day) {
    const dayIndex = WEEKDAYS.indexOf(day);
    if (dayIndex === -1) return day;

    const now = new Date();
    const target = new Date(now);
    target.setDate(now.getDate() - ((now.getDay() + 6) % 7) + dayIndex);

    return target.toLocaleDateString('de-AT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  function canvasToBlob(canvas) {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { setup, renderShareImage };
})();
