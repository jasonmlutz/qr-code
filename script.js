(() => {
  const textInput = document.getElementById('qr-text');
  const logoInput = document.getElementById('logo-upload');
  const logoClearBtn = document.getElementById('logo-clear');
  const sizeSelect = document.getElementById('qr-size');
  const ecSelect = document.getElementById('ec-level');
  const ecHint = document.getElementById('ec-hint');
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d');
  const downloadBtn = document.getElementById('download-btn');
  const postmarkDate = document.getElementById('postmark-date');

  // Path to a bundled default logo, relative to index.html.
  // Drop your image at this path in the repo, or change the path to match.
  const DEFAULT_LOGO_SRC = 'assets/default-logo.png';

  let logoImage = null;
  let renderTimer = null;

  postmarkDate.textContent = new Date().toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric'
  });

  function loadDefaultLogo() {
    const img = new Image();
    img.onload = () => {
      logoImage = img;
      logoClearBtn.hidden = false;
      if (ecSelect.value !== 'H') ecSelect.value = 'H';
      render();
    };
    // If the file isn't there, just start with no logo — no error shown to the user.
    img.onerror = () => render();
    img.src = DEFAULT_LOGO_SRC;
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 120);
  }

  function updateEcHint() {
    if (logoImage) {
      ecHint.textContent = 'A center image is set — H is recommended so the code still scans.';
      if (ecSelect.value !== 'H') {
        ecHint.textContent += ' Currently using ' + ecSelect.value + '.';
      }
    } else {
      ecHint.textContent = 'Higher levels tolerate more damage or overlay, at the cost of a denser code.';
    }
  }

  function render() {
    const text = textInput.value.trim();
    const size = parseInt(sizeSelect.value, 10);
    const ecLevel = ecSelect.value;

    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    updateEcHint();

    if (!text) {
      downloadBtn.disabled = true;
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
      ctx.fillStyle = '#c1443c';
      ctx.font = '13px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Too much data for this error level', size / 2, size / 2);
      return;
    }

    const moduleCount = qr.getModuleCount();
    const cell = size / moduleCount;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1b2a41';

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

    if (logoImage) {
      const logoSize = size * 0.2;
      const x = (size - logoSize) / 2;
      const y = (size - logoSize) / 2;
      const pad = logoSize * 0.12;

      // white backing plate so the logo doesn't blend into surrounding modules
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2);

      ctx.drawImage(logoImage, x, y, logoSize, logoSize);
    }

    downloadBtn.disabled = false;
  }

  textInput.addEventListener('input', scheduleRender);
  sizeSelect.addEventListener('change', render);
  ecSelect.addEventListener('change', render);

  logoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        logoImage = img;
        logoClearBtn.hidden = false;
        if (ecSelect.value !== 'H') ecSelect.value = 'H';
        render();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  logoClearBtn.addEventListener('click', () => {
    logoImage = null;
    logoInput.value = '';
    logoClearBtn.hidden = true;
    render();
  });

  downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'qr-code.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  loadDefaultLogo();
})();
