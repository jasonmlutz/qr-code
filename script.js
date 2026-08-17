(() => {
  const textInput = document.getElementById('qr-text');
  const logoModeRadios = document.querySelectorAll('input[name="logo-mode"]');
  const logoTypeRadios = document.querySelectorAll('input[name="logo-type"]');
  const logoInput = document.getElementById('logo-upload');
  const defaultLogoOptionsField = document.getElementById('default-logo-options-field');
  const defaultLogoColorSelect = document.getElementById('default-logo-color');
  const bgColorSelect = document.getElementById('bg-color');
  const qrColorSelect = document.getElementById('qr-color');
  const contrastWarning = document.getElementById('contrast-warning');
  const sizeSelect = document.getElementById('qr-size');
  const ecSelect = document.getElementById('ec-level');
  const ecHint = document.getElementById('ec-hint');
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d');
  const downloadBtn = document.getElementById('download-btn');
  const verifyBtn = document.getElementById('verify-btn');
  const verifyStatus = document.getElementById('verify-status');
  const postmarkDate = document.getElementById('postmark-date');
  const helpBtn = document.getElementById('help-btn');
  const helpOverlay = document.getElementById('help-overlay');
  const helpClose = document.getElementById('help-close');

  const COLORS = ['black', 'red', 'white'];
  const TYPES = ['solid', 'outline'];

  // Paths to the 6 bundled default logos (3 colors x 2 types), relative to
  // index.html. Drop your images at these paths in the repo, or change to match.
  const DEFAULT_LOGO_SRC = {
    black: {
      solid: 'assets/default_logo_black_solid.png',
      outline: 'assets/default_logo_black_outline.png'
    },
    red: {
      solid: 'assets/default_logo_red_solid.png',
      outline: 'assets/default_logo_red_outline.png'
    },
    white: {
      solid: 'assets/default_logo_white_solid.png',
      outline: 'assets/default_logo_white_outline.png'
    }
  };

  // Solid fill color per logo color (same for solid and outline variants),
  // used for contrast checks and for auto-matching the QR color.
  const DEFAULT_LOGO_HEX = {
    black: '#000000',
    red: '#be0f34',
    white: '#ffffff'
  };

  // Sensible default background per default-logo color — shared by both the
  // solid and outline variant of that color, still overridable.
  const DEFAULT_BG_FOR_LOGO = {
    black: '#ffffff',
    red: '#ffffff',
    white: '#000000'
  };

  const defaultLogoImages = {
    black: { solid: null, outline: null },
    red: { solid: null, outline: null },
    white: { solid: null, outline: null }
  };
  let uploadedLogoImage = null;
  let renderTimer = null;

  postmarkDate.textContent = new Date().toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric'
  });

  function currentLogoMode() {
    const checked = document.querySelector('input[name="logo-mode"]:checked');
    return checked ? checked.value : 'none';
  }

  function currentLogoType() {
    const checked = document.querySelector('input[name="logo-type"]:checked');
    return checked ? checked.value : 'solid';
  }

  // Returns { image, hex } for the active logo, or null if none is active.
  // hex is null for custom uploads, since we don't know their fill color.
  function activeLogo() {
    const mode = currentLogoMode();
    if (mode === 'custom' && uploadedLogoImage) {
      return { image: uploadedLogoImage, hex: null };
    }
    if (mode === 'default') {
      const color = defaultLogoColorSelect.value;
      const type = currentLogoType();
      const img = defaultLogoImages[color][type];
      if (img) return { image: img, hex: DEFAULT_LOGO_HEX[color] };
    }
    return null;
  }

  function loadDefaultLogo(color, type) {
    const img = new Image();
    img.onload = () => {
      defaultLogoImages[color][type] = img;
      render();
    };
    img.onerror = () => {
      // Asset missing — leave that slot null; render() just skips drawing a logo.
      render();
    };
    img.src = DEFAULT_LOGO_SRC[color][type];
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  }

  function setVerifyState(state, message) {
    verifyStatus.dataset.state = state;
    verifyStatus.textContent = message || '';
  }

  // --- WCAG-style contrast ratio, used only for the advisory warning ---
  function relativeLuminance(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(hexA, hexB) {
    const lA = relativeLuminance(hexA);
    const lB = relativeLuminance(hexB);
    const lighter = Math.max(lA, lB);
    const darker = Math.min(lA, lB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // Threshold below which we warn. 3:1 is the WCAG floor for non-text
  // graphical elements; QR codes want more headroom than that in practice,
  // but this is advisory only, per design — never blocks the user.
  const WARN_THRESHOLD = 3;

  function updateContrastWarning(logo) {
    const bg = bgColorSelect.value;
    const qrColor = qrColorSelect.value;
    const issues = [];

    const qrBgRatio = contrastRatio(qrColor, bg);
    if (qrBgRatio < WARN_THRESHOLD) {
      issues.push('QR code color is too close to the background — this may not scan.');
    }

    if (logo && logo.hex) {
      const logoBgRatio = contrastRatio(logo.hex, bg);
      if (logoBgRatio < WARN_THRESHOLD) {
        issues.push('Logo color is too close to the background — it may be hard to see.');
      }
    }

    if (issues.length) {
      contrastWarning.textContent = '⚠ ' + issues.join(' ');
      contrastWarning.hidden = false;
    } else {
      contrastWarning.hidden = true;
    }
  }

  function updateEcHint(logo) {
    if (logo) {
      ecHint.textContent = 'A center image is set — H is recommended so the code still scans.';
      if (ecSelect.value !== 'H') {
        ecHint.textContent += ' Currently using ' + ecSelect.value + '.';
      }
    } else {
      ecHint.textContent = 'Higher levels tolerate more damage or overlay, at the cost of a denser code.';
    }
  }

  function updateFieldVisibility() {
    const mode = currentLogoMode();
    logoInput.disabled = mode !== 'custom';
    defaultLogoOptionsField.hidden = mode !== 'default';
  }

  function render() {
    updateFieldVisibility();
    setVerifyState('idle', '');

    const text = textInput.value.trim();
    const size = parseInt(sizeSelect.value, 10);
    const ecLevel = ecSelect.value;
    const bg = bgColorSelect.value;
    const qrColor = qrColorSelect.value;
    const logo = activeLogo();

    canvas.width = size;
    canvas.height = size;

    updateEcHint(logo);
    updateContrastWarning(logo);

    if (!text) {
      downloadBtn.disabled = true;
      verifyBtn.disabled = true;
      ctx.fillStyle = '#f1e9d8';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#c9c2ae';
      ctx.font = '14px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Type something above', size / 2, size / 2);
      return;
    }

    let qr;
    try {
      qr = qrcode(0, ecLevel);
      qr.addData(text);
      qr.make();
    } catch (err) {
      downloadBtn.disabled = true;
      verifyBtn.disabled = true;
      ctx.fillStyle = '#c1443c';
      ctx.font = '13px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Too much data for this error level', size / 2, size / 2);
      return;
    }

    const moduleCount = qr.getModuleCount();
    const cell = size / moduleCount;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = qrColor;

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            Math.round(col * cell),
            Math.round(row * cell),
            Math.ceil(cell),
            Math.ceil(cell)
          );
        }
      }
    }

    if (logo) {
      const logoSize = size * 0.2;
      const x = (size - logoSize) / 2;
      const y = (size - logoSize) / 2;
      const pad = logoSize * 0.12;

      // backing plate matches the background so it doesn't read as a
      // stray box when the background isn't white
      ctx.fillStyle = bg;
      ctx.fillRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2);

      ctx.drawImage(logo.image, x, y, logoSize, logoSize);
    }

    downloadBtn.disabled = false;
    verifyBtn.disabled = false;
  }

  textInput.addEventListener('input', scheduleRender);
  sizeSelect.addEventListener('change', render);
  ecSelect.addEventListener('change', render);
  bgColorSelect.addEventListener('change', render);
  qrColorSelect.addEventListener('change', render);

  logoModeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const mode = currentLogoMode();
      if (mode === 'default') {
        // Auto-match background and QR color to the selected default logo,
        // still fully overridable afterward.
        const color = defaultLogoColorSelect.value;
        bgColorSelect.value = DEFAULT_BG_FOR_LOGO[color];
        qrColorSelect.value = DEFAULT_LOGO_HEX[color];
        if (ecSelect.value !== 'H') ecSelect.value = 'H';
      } else if (mode === 'custom' && uploadedLogoImage) {
        if (ecSelect.value !== 'H') ecSelect.value = 'H';
      }
      render();
    });
  });

  defaultLogoColorSelect.addEventListener('change', () => {
    const color = defaultLogoColorSelect.value;
    bgColorSelect.value = DEFAULT_BG_FOR_LOGO[color];
    qrColorSelect.value = DEFAULT_LOGO_HEX[color];
    render();
  });

  logoTypeRadios.forEach((radio) => {
    radio.addEventListener('change', render);
  });

  logoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        uploadedLogoImage = img;
        if (ecSelect.value !== 'H') ecSelect.value = 'H';
        render();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'qr-code.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  verifyBtn.addEventListener('click', () => {
    const expected = textInput.value.trim();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);

    if (!result) {
      setVerifyState('mismatch', '✕ Could not read a QR code in this image.');
      return;
    }

    // Case-sensitive comparison against exactly what was encoded.
    if (result.data === expected) {
      setVerifyState('match', '✓ Verified — decodes back to the original text.');
    } else {
      setVerifyState('mismatch', '✕ Decoded text does not match the original.');
    }
  });

  function openHelp() {
    helpOverlay.hidden = false;
    helpClose.focus();
  }

  function closeHelp() {
    helpOverlay.hidden = true;
    helpBtn.focus();
  }

  helpBtn.addEventListener('click', openHelp);
  helpClose.addEventListener('click', closeHelp);

  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpOverlay.hidden) closeHelp();
  });

  COLORS.forEach((color) => {
    TYPES.forEach((type) => {
      loadDefaultLogo(color, type);
    });
  });
  render();
})();
