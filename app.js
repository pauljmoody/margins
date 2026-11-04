"use strict";

(() => {
  const MM_PER_INCH = 25.4;

  const els = {
    fileInput: document.getElementById("fileInput"),
    orientation: document.getElementById("orientation"),
    dpi: document.getElementById("dpi"),
    marginTop: document.getElementById("marginTop"),
    marginRight: document.getElementById("marginRight"),
    marginBottom: document.getElementById("marginBottom"),
    marginLeft: document.getElementById("marginLeft"),
    zoom: document.getElementById("zoom"),
    zoomOut: document.getElementById("zoomOut"),
    panX: document.getElementById("panX"),
    panY: document.getElementById("panY"),
    panXOut: document.getElementById("panXOut"),
    panYOut: document.getElementById("panYOut"),
    resetBtn: document.getElementById("resetBtn"),
    exportPngBtn: document.getElementById("exportPngBtn"),
    exportJpgBtn: document.getElementById("exportJpgBtn"),
    meta: document.getElementById("meta"),
    status: document.getElementById("status"),
    previewCanvas: document.getElementById("previewCanvas"),
  };

  const previewCtx = els.previewCanvas.getContext("2d", { alpha: false });

  const state = {
    image: null,
    imageURL: "",
    zoom: 1,
    panXRatio: 0,
    panYRatio: 0,
    lastBounds: null,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartPanXRatio: 0,
    dragStartPanYRatio: 0,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function currentPrintSizeIn() {
    return els.orientation.value === "6x4"
      ? { wIn: 6, hIn: 4 }
      : { wIn: 4, hIn: 6 };
  }

  function getMarginsIn() {
    const values = {
      top: (Number(els.marginTop.value) || 0) / MM_PER_INCH,
      right: (Number(els.marginRight.value) || 0) / MM_PER_INCH,
      bottom: (Number(els.marginBottom.value) || 0) / MM_PER_INCH,
      left: (Number(els.marginLeft.value) || 0) / MM_PER_INCH,
    };

    const { wIn, hIn } = currentPrintSizeIn();

    values.top = clamp(values.top, 0, hIn);
    values.bottom = clamp(values.bottom, 0, hIn);
    values.left = clamp(values.left, 0, wIn);
    values.right = clamp(values.right, 0, wIn);

    if (values.left + values.right >= wIn) {
      const scale = (wIn - 0.01) / (values.left + values.right || 1);
      values.left *= scale;
      values.right *= scale;
    }

    if (values.top + values.bottom >= hIn) {
      const scale = (hIn - 0.01) / (values.top + values.bottom || 1);
      values.top *= scale;
      values.bottom *= scale;
    }

    return values;
  }

  function updateOutputs() {
    els.zoomOut.textContent = `${state.zoom.toFixed(2)}x`;
    els.panXOut.textContent = `${Math.round(state.panXRatio * 100)}%`;
    els.panYOut.textContent = `${Math.round(state.panYRatio * 100)}%`;

    const dpi = clamp(Number(els.dpi.value) || 300, 150, 1200);
    const { wIn, hIn } = currentPrintSizeIn();
    const pxW = Math.round(wIn * dpi);
    const pxH = Math.round(hIn * dpi);
    els.meta.textContent = `Export size: ${pxW} x ${pxH} px @ ${dpi} DPI`;
  }

  function setStatus(message) {
    els.status.textContent = message || "";
  }

  function getRenderConfig(widthPx, heightPx, forExport = false) {
    const { wIn, hIn } = currentPrintSizeIn();
    const marginsIn = getMarginsIn();

    const ppiX = widthPx / wIn;
    const ppiY = heightPx / hIn;

    const marginPx = {
      top: Math.round(marginsIn.top * ppiY),
      right: Math.round(marginsIn.right * ppiX),
      bottom: Math.round(marginsIn.bottom * ppiY),
      left: Math.round(marginsIn.left * ppiX),
    };

    const rect = {
      x: marginPx.left,
      y: marginPx.top,
      w: Math.max(1, widthPx - marginPx.left - marginPx.right),
      h: Math.max(1, heightPx - marginPx.top - marginPx.bottom),
    };

    return { rect, forExport };
  }

  function renderToCanvas(ctx, widthPx, heightPx, forExport = false) {
    const { rect } = getRenderConfig(widthPx, heightPx, forExport);

    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    if (!state.image) {
      ctx.strokeStyle = "#d6dbe8";
      ctx.lineWidth = Math.max(2, Math.round(Math.min(widthPx, heightPx) * 0.004));
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.setLineDash([]);

      if (!forExport) {
        ctx.fillStyle = "#8a93a9";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${Math.round(Math.min(widthPx, heightPx) * 0.035)}px system-ui`;
        ctx.fillText("Upload a photo", widthPx / 2, heightPx / 2);
      }

      state.lastBounds = null;
      return;
    }

    const iw = state.image.naturalWidth;
    const ih = state.image.naturalHeight;

    const baseScale = Math.max(rect.w / iw, rect.h / ih);
    const scale = baseScale * state.zoom;

    const drawW = iw * scale;
    const drawH = ih * scale;

    const maxPanX = Math.max(0, (drawW - rect.w) / 2);
    const maxPanY = Math.max(0, (drawH - rect.h) / 2);

    state.panXRatio = maxPanX === 0 ? 0 : clamp(state.panXRatio, -1, 1);
    state.panYRatio = maxPanY === 0 ? 0 : clamp(state.panYRatio, -1, 1);

    const panX = state.panXRatio * maxPanX;
    const panY = state.panYRatio * maxPanY;

    const x = rect.x + (rect.w - drawW) / 2 + panX;
    const y = rect.y + (rect.h - drawH) / 2 + panY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.drawImage(state.image, x, y, drawW, drawH);
    ctx.restore();

    if (!forExport) {
      ctx.strokeStyle = "#8493b8";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    }

    state.lastBounds = { maxPanX, maxPanY };
  }

  function resizePreviewCanvas() {
    const { wIn, hIn } = currentPrintSizeIn();
    const aspect = wIn / hIn;

    const maxH = 1200;
    const maxW = Math.round(maxH * aspect);

    els.previewCanvas.width = maxW;
    els.previewCanvas.height = maxH;
  }

  function syncPanSlidersFromState() {
    els.panX.value = String(Math.round(state.panXRatio * 100));
    els.panY.value = String(Math.round(state.panYRatio * 100));
  }

  function redraw() {
    resizePreviewCanvas();
    renderToCanvas(previewCtx, els.previewCanvas.width, els.previewCanvas.height, false);
    syncPanSlidersFromState();
    updateOutputs();
  }

  async function loadImageFromFile(file) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }

    if (state.imageURL) {
      URL.revokeObjectURL(state.imageURL);
      state.imageURL = "";
    }

    const imageURL = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageURL;
    }).catch(() => {
      URL.revokeObjectURL(imageURL);
      setStatus("Could not load image.");
    });

    if (!img.naturalWidth || !img.naturalHeight) {
      return;
    }

    state.image = img;
    state.imageURL = imageURL;
    state.zoom = 1;
    state.panXRatio = 0;
    state.panYRatio = 0;

    els.zoom.value = "1";
    els.panX.value = "0";
    els.panY.value = "0";

    setStatus(`Loaded ${file.name} (${img.naturalWidth} x ${img.naturalHeight}px)`);
    redraw();
  }

  function getExportSizePx() {
    const dpi = clamp(Number(els.dpi.value) || 300, 150, 1200);
    const { wIn, hIn } = currentPrintSizeIn();
    return {
      widthPx: Math.max(1, Math.round(wIn * dpi)),
      heightPx: Math.max(1, Math.round(hIn * dpi)),
      dpi,
    };
  }

  function exportImage(type) {
    if (!state.image) {
      setStatus("Upload an image before exporting.");
      return;
    }

    const { widthPx, heightPx, dpi } = getExportSizePx();

    const totalPixels = widthPx * heightPx;
    if (totalPixels > 120_000_000) {
      setStatus("Export too large for browser memory. Lower DPI.");
      return;
    }

    const outCanvas = document.createElement("canvas");
    outCanvas.width = widthPx;
    outCanvas.height = heightPx;
    const outCtx = outCanvas.getContext("2d", { alpha: false });

    renderToCanvas(outCtx, widthPx, heightPx, true);

    const ext = type === "image/jpeg" ? "jpg" : "png";
    const quality = type === "image/jpeg" ? 0.98 : undefined;

    outCanvas.toBlob(
      (blob) => {
        if (!blob) {
          setStatus("Failed to export image.");
          return;
        }

        const a = document.createElement("a");
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
        a.download = `print-4x6-${dpi}dpi-${stamp}.${ext}`;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);

        setStatus(`Exported ${widthPx} x ${heightPx}px ${ext.toUpperCase()}.`);
      },
      type,
      quality
    );
  }

  function onDragStart(event) {
    if (!state.image) {
      return;
    }

    state.dragging = true;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragStartPanXRatio = state.panXRatio;
    state.dragStartPanYRatio = state.panYRatio;

    els.previewCanvas.setPointerCapture(event.pointerId);
  }

  function onDragMove(event) {
    if (!state.dragging || !state.lastBounds) {
      return;
    }

    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;

    const maxPanX = state.lastBounds.maxPanX;
    const maxPanY = state.lastBounds.maxPanY;

    if (maxPanX > 0) {
      const deltaRatioX = dx / maxPanX;
      state.panXRatio = clamp(state.dragStartPanXRatio + deltaRatioX, -1, 1);
    }

    if (maxPanY > 0) {
      const deltaRatioY = dy / maxPanY;
      state.panYRatio = clamp(state.dragStartPanYRatio + deltaRatioY, -1, 1);
    }

    redraw();
  }

  function onDragEnd(event) {
    state.dragging = false;
    try {
      els.previewCanvas.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  }

  function wireEvents() {
    els.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      void loadImageFromFile(file);
    });

    els.orientation.addEventListener("change", redraw);

    els.dpi.addEventListener("input", () => {
      const v = clamp(Number(els.dpi.value) || 300, 150, 1200);
      els.dpi.value = String(v);
      updateOutputs();
    });

    [els.marginTop, els.marginRight, els.marginBottom, els.marginLeft].forEach((input) => {
      input.addEventListener("input", redraw);
    });

    els.zoom.addEventListener("input", () => {
      state.zoom = clamp(Number(els.zoom.value) || 1, 1, 4);
      redraw();
    });

    els.panX.addEventListener("input", () => {
      state.panXRatio = clamp((Number(els.panX.value) || 0) / 100, -1, 1);
      redraw();
    });

    els.panY.addEventListener("input", () => {
      state.panYRatio = clamp((Number(els.panY.value) || 0) / 100, -1, 1);
      redraw();
    });

    els.resetBtn.addEventListener("click", () => {
      state.zoom = 1;
      state.panXRatio = 0;
      state.panYRatio = 0;
      els.zoom.value = "1";
      redraw();
      setStatus("Crop reset.");
    });

    els.exportPngBtn.addEventListener("click", () => exportImage("image/png"));
    els.exportJpgBtn.addEventListener("click", () => exportImage("image/jpeg"));

    els.previewCanvas.addEventListener("pointerdown", onDragStart);
    els.previewCanvas.addEventListener("pointermove", onDragMove);
    els.previewCanvas.addEventListener("pointerup", onDragEnd);
    els.previewCanvas.addEventListener("pointercancel", onDragEnd);
  }

  wireEvents();
  redraw();
})();
