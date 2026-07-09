/* ---------------------------------------------------------------
   Adaptive Icon Generator

   Android adaptive icons are made of two 108dp x 108dp layers
   (foreground + background). Only the centre ~72dp is guaranteed
   to stay visible after the OS applies its mask (circle, squircle,
   rounded square, etc.), and only the centre 66dp is guaranteed
   to never be clipped by ANY mask ("safe zone").

   This file lets the user pick a foreground (reusing the SVG this
   tool already produced, or a fresh image) and a background (solid
   colour or an image), preview it under different mask shapes, and
   export a ready-to-drop-in Android res/ folder as a .zip:

     res/mipmap-anydpi-v26/ic_launcher.xml         (adaptive-icon)
     res/mipmap-anydpi-v26/ic_launcher_round.xml
     res/drawable/ic_launcher_background.xml       (vector, if solid colour)
     res/drawable/ic_launcher_foreground.xml       (vector, if SVG source)
     res/mipmap-[density]/ic_launcher_background.png  (if image background)
     res/mipmap-[density]/ic_launcher_foreground.png  (if raster foreground)
     res/mipmap-[density]/ic_launcher.png              (legacy pre-API26 icon)
     res/mipmap-[density]/ic_launcher_round.png
     playstore-icon-512.png
---------------------------------------------------------------- */

(function () {

    const DP = 4; // px per dp used for the on-canvas preview (108dp -> 432px)
    const CANVAS_DP = 108;
    const MASK_VISIBLE_DP = 72;   // guaranteed-visible circle most launchers use
    const SAFE_ZONE_DP = 66;      // guaranteed-safe circle across every mask

    const DENSITIES = {
        mdpi: 108,
        hdpi: 162,
        xhdpi: 216,
        xxhdpi: 324,
        xxxhdpi: 432
    };

    const LEGACY_LAUNCHER_SIZES = {
        mdpi: 48,
        hdpi: 72,
        xhdpi: 96,
        xxhdpi: 144,
        xxxhdpi: 192
    };

    const NOTIFICATION_SIZES = {
        mdpi: 24,
        hdpi: 36,
        xhdpi: 48,
        xxhdpi: 72,
        xxxhdpi: 96
    };

    /* ---------------------------
       Element References
    ---------------------------- */

    const useFgFromConverterBtn = document.getElementById("useFgFromConverter");
    const fgImageFile           = document.getElementById("fgImageFile");
    const fgSourceStatus        = document.getElementById("fgSourceStatus");
    const traceFgToXmlBtn       = document.getElementById("traceFgToXmlBtn");

    const bgType                = document.getElementById("bgType");
    const bgColorBlock          = document.getElementById("bgColorBlock");
    const bgImageBlock          = document.getElementById("bgImageBlock");
    const bgColor               = document.getElementById("bgColor");
    const bgColorHex            = document.getElementById("bgColorHex");
    const bgImageFile           = document.getElementById("bgImageFile");
    const bgSourceStatus        = document.getElementById("bgSourceStatus");

    const fgScale                = document.getElementById("fgScale");
    const fgScaleValue          = document.getElementById("fgScaleValue");
    const notifScale             = document.getElementById("notifScale");
    const notifScaleValue        = document.getElementById("notifScaleValue");
    const iconName               = document.getElementById("iconName");

    const vectorOnlyToggle          = document.getElementById("vectorOnlyToggle");
    const includeNotificationToggle = document.getElementById("includeNotificationToggle");

    const generateAdaptiveBtn   = document.getElementById("generateAdaptiveBtn");

    const maskButtons            = document.querySelectorAll(".mask-btn");
    const previewCanvas          = document.getElementById("adaptivePreviewCanvas");
    const homeMockupIconCanvas   = document.getElementById("homeMockupIconCanvas");
    const notificationPreviewCanvas = document.getElementById("notificationPreviewCanvas");
    const notifIconBadge         = document.querySelector(".notif-icon-badge");
    const statusBarIconCanvas    = document.getElementById("statusBarIconCanvas");
    const mockupAppLabel         = document.getElementById("mockupAppLabel");
    const notifAppLabel          = document.getElementById("notifAppLabel");
    const appLabel               = document.getElementById("appLabel");

    if (!previewCanvas) return; // section not present, nothing to wire up

    const ctx = previewCanvas.getContext("2d");
    const mockupCtx = homeMockupIconCanvas ? homeMockupIconCanvas.getContext("2d") : null;
    const notifCtx = notificationPreviewCanvas ? notificationPreviewCanvas.getContext("2d") : null;
    const statusBarCtx = statusBarIconCanvas ? statusBarIconCanvas.getContext("2d") : null;

    /* ---------------------------
       State
    ---------------------------- */

    let fg = { type: null, svgText: null, image: null }; // type: 'svg' | 'image'
    let fgRawDataUrl = null; // raw raster data URL, kept so it can be traced to vector XML later
    let bg = { image: null };

    let currentMask = "circle";

    let lastHandleBox = null;   // {cx, cy, half, size} of the current resize box, in canvas px
    let isDraggingHandle = false;

    /* ---------------------------
       Helpers
    ---------------------------- */

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function isSvgFile(file) {
        return file.type === "image/svg+xml" || /\.svg$/i.test(file.name || "");
    }

    function isXmlFile(file) {
        return file.type === "text/xml" || file.type === "application/xml" || /\.xml$/i.test(file.name || "");
    }

    function canvasToBlob(canvas) {
        return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    }

    // Re-rendering an <img> whose source is an SVG data URL is expensive —
    // the browser re-rasterizes the vector paths on *every* drawImage call,
    // which is fine once but causes visible lag when a slider fires dozens
    // of redraws a second (especially for complex traced icons). So instead,
    // rasterize the source once into a square offscreen canvas and reuse
    // that bitmap for every live preview redraw. Because the source is
    // already contain-fit inside a 1:1 square here, drawing this square
    // into any other square target with drawContain() reproduces the exact
    // same result — just far cheaper, since canvas-to-canvas draws don't
    // re-run any vector rasterization.
    function buildPreviewBitmap(img) {

        const RES = 720;
        const c = document.createElement("canvas");
        c.width = RES;
        c.height = RES;
        const cctx = c.getContext("2d");

        const imgRatio = img.width / img.height;
        let dw, dh;

        if (imgRatio > 1) {
            dw = RES;
            dh = RES / imgRatio;
        } else {
            dh = RES;
            dw = RES * imgRatio;
        }

        cctx.drawImage(img, (RES - dw) / 2, (RES - dh) / 2, dw, dh);

        return c;

    }

    /* ---------------------------
       Foreground: use converter output
    ---------------------------- */

    useFgFromConverterBtn.addEventListener("click", async () => {

        const xmlOutputEl = document.getElementById("xmlOutput");
        const xml = xmlOutputEl ? xmlOutputEl.value.trim() : "";

        if (!xml) {
            alert("Convert or paste Android Vector XML in the section above first.");
            return;
        }

        const svgText = convertVectorToSvg(xml); // from script.js

        if (!svgText) {
            alert("That doesn't look like valid Android Vector XML.");
            return;
        }

        try {

            const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgText)));
            const img = await loadImage(dataUrl);

            fg = { type: "svg", svgText, image: img, previewBitmap: buildPreviewBitmap(img) };
            fgRawDataUrl = null;
            if (traceFgToXmlBtn) traceFgToXmlBtn.style.display = "none";

            fgSourceStatus.textContent = "Using converted XML as foreground";
            fgSourceStatus.classList.add("ok");

            updatePreview();

        } catch (e) {
            alert("Could not read that SVG.");
        }

    });

    /* ---------------------------
       Foreground: file upload
    ---------------------------- */

    fgImageFile.addEventListener("change", async () => {

        const file = fgImageFile.files[0];
        if (!file) return;

        try {

            if (isXmlFile(file)) {

                const xmlText = await readFileAsText(file);
                const svgText = convertVectorToSvg(xmlText); // from script.js

                if (!svgText) {
                    alert("That doesn't look like valid Android Vector XML.");
                    return;
                }

                const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgText)));
                const img = await loadImage(dataUrl);

                fg = { type: "svg", svgText, image: img, previewBitmap: buildPreviewBitmap(img) };
                fgRawDataUrl = null;

                if (traceFgToXmlBtn) traceFgToXmlBtn.style.display = "none";

            } else if (isSvgFile(file)) {

                const svgText = await readFileAsText(file);
                const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgText)));
                const img = await loadImage(dataUrl);

                fg = { type: "svg", svgText, image: img, previewBitmap: buildPreviewBitmap(img) };
                fgRawDataUrl = null;

                if (traceFgToXmlBtn) traceFgToXmlBtn.style.display = "none";

            } else {

                const dataUrl = await readFileAsDataURL(file);
                const img = await loadImage(dataUrl);

                fg = { type: "image", svgText: null, image: img, previewBitmap: buildPreviewBitmap(img) };
                fgRawDataUrl = dataUrl;

                if (traceFgToXmlBtn) {
                    traceFgToXmlBtn.style.display = "inline-flex";
                    traceFgToXmlBtn.disabled = false;
                    traceFgToXmlBtn.innerHTML = `<span class="material-symbols-rounded">auto_fix_high</span> Convert Image to Vector XML`;
                }

            }

            fgSourceStatus.textContent = `Foreground: ${file.name}`;
            fgSourceStatus.classList.add("ok");

            updatePreview();

        } catch (e) {
            alert("Could not load that file as a foreground layer.");
        }

    });

    /* ---------------------------
       Foreground: trace raster image -> vector XML
       (reuses the same ImageTracer pipeline the main converter uses)
    ---------------------------- */

    if (traceFgToXmlBtn) {

        traceFgToXmlBtn.addEventListener("click", () => {

            if (!fgRawDataUrl) {
                alert("Upload a raster image as the foreground first.");
                return;
            }

            if (typeof ImageTracer === "undefined") {
                alert("ImageTracer library not loaded.");
                return;
            }

            traceFgToXmlBtn.disabled = true;
            traceFgToXmlBtn.innerHTML = `<span class="material-symbols-rounded">hourglass_top</span> Tracing...`;

            // Reuse the same colour/detail settings as the main converter above,
            // so results stay consistent across the whole tool.
            const numColors = (typeof colors !== "undefined" && colors) ? Number(colors.value) : 8;
            const detailLevel = (typeof detail !== "undefined" && detail) ? detail.value : "medium";

            ImageTracer.imageToSVG(
                fgRawDataUrl,
                async function (svgString) {

                    try {

                        const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
                        const img = await loadImage(dataUrl);

                        fg = { type: "svg", svgText: svgString, image: img, previewBitmap: buildPreviewBitmap(img) };

                        fgSourceStatus.textContent = "Foreground: traced to vector XML";
                        fgSourceStatus.classList.add("ok");

                        traceFgToXmlBtn.style.display = "none";

                        updatePreview();

                    } catch (e) {
                        alert("Traced, but the result couldn't be loaded as an image.");
                    } finally {
                        traceFgToXmlBtn.disabled = false;
                        traceFgToXmlBtn.innerHTML = `<span class="material-symbols-rounded">auto_fix_high</span> Convert Image to Vector XML`;
                    }

                },
                {
                    numberofcolors: numColors,
                    colorsampling: 2,
                    colorquantcycles: 10,
                    mincolorratio: 0.005,
                    ltres: detailLevel === "high" ? 0.5 : detailLevel === "low" ? 2 : 1,
                    qtres: detailLevel === "high" ? 0.5 : detailLevel === "low" ? 2 : 1,
                    pathomit: 0,
                    scale: 1,
                    viewbox: true
                }
            );

        });

    }

    /* ---------------------------
       Background: type toggle
    ---------------------------- */

    bgType.addEventListener("change", () => {

        const isColor = bgType.value === "color";

        bgColorBlock.style.display = isColor ? "flex" : "none";
        bgImageBlock.style.display = isColor ? "none" : "flex";

        updatePreview();

    });

    bgColor.addEventListener("input", () => {
        bgColorHex.value = bgColor.value.toUpperCase();
        bgColorHex.classList.remove("invalid");
        scheduleUpdatePreview();
    });

    if (bgColorHex) {

        const HEX_RE = /^#([0-9A-F]{6})$/i;

        bgColorHex.addEventListener("input", () => {

            let v = bgColorHex.value.trim();
            if (v && v[0] !== "#") v = "#" + v;

            if (HEX_RE.test(v)) {
                bgColorHex.classList.remove("invalid");
                bgColor.value = v;
                scheduleUpdatePreview();
            } else {
                bgColorHex.classList.add("invalid");
            }

        });

        bgColorHex.addEventListener("blur", () => {
            // On leaving the field, snap back to whatever the last valid colour was
            bgColorHex.value = bgColor.value.toUpperCase();
            bgColorHex.classList.remove("invalid");
        });

    }

    bgImageFile.addEventListener("change", async () => {

        const file = bgImageFile.files[0];
        if (!file) return;

        try {

            const dataUrl = await readFileAsDataURL(file);
            const img = await loadImage(dataUrl);

            bg.image = img;

            bgSourceStatus.textContent = `Background: ${file.name}`;
            bgSourceStatus.classList.add("ok");

            updatePreview();

        } catch (e) {
            alert("Could not load that image as a background layer.");
        }

    });

    /* ---------------------------
       Foreground scale slider
    ---------------------------- */

    fgScale.addEventListener("input", () => {
        fgScaleValue.textContent = fgScale.value + "%";
        scheduleUpdatePreview();
    });

    if (notifScale && notifScaleValue) {
        notifScale.addEventListener("input", () => {
            notifScaleValue.textContent = notifScale.value + "%";
            scheduleUpdatePreview();
        });
    }

    if (appLabel && mockupAppLabel) {
        appLabel.addEventListener("input", () => {
            const label = appLabel.value.trim() || "App Name";
            mockupAppLabel.textContent = label;
            if (notifAppLabel) notifAppLabel.textContent = label;
        });
    }

    /* ---------------------------
       Mask toggle
    ---------------------------- */

    maskButtons.forEach(btn => {

        btn.addEventListener("click", () => {

            maskButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            currentMask = btn.dataset.mask;

            updatePreview();

        });

    });

    /* ---------------------------
       Drawing helpers
    ---------------------------- */

    // Draws bg + fg (no mask) onto a canvas of the given pixel size.
    function drawLayers(targetCtx, size) {

        targetCtx.clearRect(0, 0, size, size);

        // Background
        if (bgType.value === "color") {

            targetCtx.fillStyle = bgColor.value;
            targetCtx.fillRect(0, 0, size, size);

        } else if (bg.image) {

            drawCover(targetCtx, bg.image, size);

        }

        // Foreground
        if (fg.image) {

            const boxSize = size * (Number(fgScale.value) / 100);
            drawContain(targetCtx, fg.previewBitmap || fg.image, size, boxSize);

        }

    }

    function drawCover(targetCtx, img, size) {

        const imgRatio = img.width / img.height;
        let dw, dh;

        if (imgRatio > 1) {
            dh = size;
            dw = size * imgRatio;
        } else {
            dw = size;
            dh = size / imgRatio;
        }

        const dx = (size - dw) / 2;
        const dy = (size - dh) / 2;

        targetCtx.drawImage(img, dx, dy, dw, dh);

    }

    function drawContain(targetCtx, img, size, boxSize) {

        const imgRatio = img.width / img.height;
        let dw, dh;

        if (imgRatio > 1) {
            dw = boxSize;
            dh = boxSize / imgRatio;
        } else {
            dh = boxSize;
            dw = boxSize * imgRatio;
        }

        const dx = (size - dw) / 2;
        const dy = (size - dh) / 2;

        targetCtx.drawImage(img, dx, dy, dw, dh);

    }

    function applyMaskClip(targetCtx, size, mask) {

        const cx = size / 2;
        const cy = size / 2;

        targetCtx.beginPath();

        if (mask === "circle") {

            targetCtx.arc(cx, cy, size * (MASK_VISIBLE_DP / CANVAS_DP) / 2, 0, Math.PI * 2);

        } else if (mask === "squircle") {

            const r = size * 0.28;
            roundRectPath(targetCtx, size * 0.08, size * 0.08, size * 0.84, size * 0.84, r);

        } else {

            // square: full mask area with a very slight corner radius
            const r = size * 0.04;
            roundRectPath(targetCtx, size * 0.08, size * 0.08, size * 0.84, size * 0.84, r);

        }

        targetCtx.closePath();
        targetCtx.clip();

    }

    function roundRectPath(targetCtx, x, y, w, h, r) {

        targetCtx.moveTo(x + r, y);
        targetCtx.arcTo(x + w, y, x + w, y + h, r);
        targetCtx.arcTo(x + w, y + h, x, y + h, r);
        targetCtx.arcTo(x, y + h, x, y, r);
        targetCtx.arcTo(x, y, x + w, y, r);

    }

    /* ---------------------------
       Preview render
    ---------------------------- */

    // Reused offscreen canvases — creating a brand new <canvas> on every
    // single drag/slider tick was the main cause of the lag, so these are
    // allocated once and just redrawn into.
    const _offMain = document.createElement("canvas");
    _offMain.width = 432;
    _offMain.height = 432;
    const _offMainCtx = _offMain.getContext("2d");

    const _offMockup = document.createElement("canvas");
    _offMockup.width = 216;
    _offMockup.height = 216;
    const _offMockupCtx = _offMockup.getContext("2d");

    function updatePreview() {

        const size = previewCanvas.width; // 432, i.e. 108dp * DP

        ctx.clearRect(0, 0, size, size);

        // Offscreen full composite (unmasked)
        drawLayers(_offMainCtx, size);

        // 1. Dimmed full square, so the user can see what gets cropped
        ctx.globalAlpha = 0.25;
        ctx.drawImage(_offMain, 0, 0);
        ctx.globalAlpha = 1;

        // 2. Full-opacity, clipped to the current mask shape
        ctx.save();
        applyMaskClip(ctx, size, currentMask);
        ctx.drawImage(_offMain, 0, 0);
        ctx.restore();

        // 3. Safe-zone guide (dashed circle, 66dp)
        const cx = size / 2;
        const cy = size / 2;
        const safeR = size * (SAFE_ZONE_DP / CANVAS_DP) / 2;

        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(cx, cy, safeR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 4. Foreground resize box + drag handle (only when a foreground is loaded)
        if (fg.image) {

            const half = size * (Number(fgScale.value) / 100) / 2;

            lastHandleBox = { cx, cy, half, size };

            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#6C5CE7";
            ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
            ctx.restore();

            const hx = cx + half;
            const hy = cy + half;
            const handleR = isDraggingHandle ? 12 : 10;

            ctx.beginPath();
            ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
            ctx.fillStyle = "#6C5CE7";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#fff";
            ctx.stroke();

        } else {

            lastHandleBox = null;

        }

    }

    // Small live icon shown inside the home-screen mockup row (always circle-masked,
    // matching the most common launcher default) so size is easy to judge in context.
    function renderHomeMockupIcon() {

        if (!mockupCtx) return;

        const size = homeMockupIconCanvas.width;

        mockupCtx.clearRect(0, 0, size, size);

        drawLayers(_offMockupCtx, size);

        mockupCtx.save();
        applyMaskClip(mockupCtx, size, currentMask);
        mockupCtx.drawImage(_offMockup, 0, 0);
        mockupCtx.restore();

    }

    // Notification icon preview — shows the flat white silhouette exactly as
    // it will appear in the status bar / notification shade, tinted inside a
    // badge that matches the adaptive icon's background colour (Android
    // colours the small icon's circle with the app's notification colour,
    // which is usually the same as its accent/background colour).
    function renderNotificationPreview() {

        if (!notifCtx) return;

        const size = notificationPreviewCanvas.width;

        notifCtx.clearRect(0, 0, size, size);

        if (fg.image) {
            const scalePercent = notifScale ? Number(notifScale.value) : 66;
            drawWhiteSilhouette(notifCtx, fg.previewBitmap || fg.image, size, scalePercent);
        }

        if (notifIconBadge) {
            notifIconBadge.style.background = (bgType.value === "color" && bgColor.value)
                ? bgColor.value
                : "#5a6270";
        }

    }

    // Status bar preview — icons here appear tiny and plain white, with no
    // colour badge behind them (unlike the notification shade), matching
    // how Android actually renders the small icon in the status bar.
    function renderStatusBarIcon() {

        if (!statusBarCtx) return;

        const size = statusBarIconCanvas.width;

        statusBarCtx.clearRect(0, 0, size, size);

        if (fg.image) {
            const scalePercent = notifScale ? Number(notifScale.value) : 66;
            drawWhiteSilhouette(statusBarCtx, fg.previewBitmap || fg.image, size, scalePercent);
        }

    }

    const _updatePreview = updatePreview;
    updatePreview = function () {
        _updatePreview();
        renderHomeMockupIcon();
        renderNotificationPreview();
        renderStatusBarIcon();
    };

    // rAF-throttled scheduler: coalesces bursts of events (dragging the
    // resize handle, dragging the color picker, moving a slider) into at
    // most one redraw per animation frame instead of one per event.
    let _previewRAF = null;
    function scheduleUpdatePreview() {
        if (_previewRAF !== null) return;
        _previewRAF = requestAnimationFrame(() => {
            _previewRAF = null;
            updatePreview();
        });
    }

    /* ---------------------------
       Drag-to-resize on the preview canvas
    ---------------------------- */

    function getCanvasCoords(evt) {

        const rect = previewCanvas.getBoundingClientRect();
        const scaleX = previewCanvas.width / rect.width;
        const scaleY = previewCanvas.height / rect.height;

        const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };

    }

    function isNearHandle(pt) {

        if (!lastHandleBox) return false;

        const hx = lastHandleBox.cx + lastHandleBox.half;
        const hy = lastHandleBox.cy + lastHandleBox.half;

        const dx = pt.x - hx;
        const dy = pt.y - hy;

        return Math.sqrt(dx * dx + dy * dy) <= 22; // generous hit area for touch

    }

    previewCanvas.addEventListener("pointerdown", (e) => {

        const pt = getCanvasCoords(e);

        if (isNearHandle(pt)) {
            isDraggingHandle = true;
            previewCanvas.setPointerCapture(e.pointerId);
            e.preventDefault();
        }

    });

    previewCanvas.addEventListener("pointermove", (e) => {

        const pt = getCanvasCoords(e);

        if (!isDraggingHandle) {
            previewCanvas.style.cursor = isNearHandle(pt) ? "nwse-resize" : "default";
            return;
        }

        if (!lastHandleBox) return;

        const dx = Math.abs(pt.x - lastHandleBox.cx);
        const dy = Math.abs(pt.y - lastHandleBox.cy);

        const newHalf = Math.max(dx, dy);

        let newScale = (newHalf * 2 / lastHandleBox.size) * 100;
        newScale = Math.max(40, Math.min(100, Math.round(newScale)));

        e.preventDefault();

        if (Number(fgScale.value) === newScale) return; // nothing actually changed, skip a redraw

        fgScale.value = newScale;
        fgScaleValue.textContent = newScale + "%";

        scheduleUpdatePreview();

    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(evtName => {

        previewCanvas.addEventListener(evtName, () => {

            if (isDraggingHandle) {
                isDraggingHandle = false;
                updatePreview();
            }

        });

    });

    updatePreview();

    /* ---------------------------
       Foreground vector XML
       (reuses the existing SVG -> Android XML logic in script.js,
       then wraps it in a centred <group> scaled to fit the 108dp
       adaptive icon canvas)
    ---------------------------- */

    function buildForegroundVectorXml(svgText, scalePercent) {

        const vectorStr = convertSvgToVector(svgText); // from script.js

        const wMatch = vectorStr.match(/android:viewportWidth="([\d.]+)"/);
        const hMatch = vectorStr.match(/android:viewportHeight="([\d.]+)"/);

        const origW = wMatch ? parseFloat(wMatch[1]) : 24;
        const origH = hMatch ? parseFloat(hMatch[1]) : 24;

        const bodyMatch = vectorStr.match(/viewportHeight="[\d.]+">([\s\S]*)<\/vector>/);
        const pathsXml = bodyMatch ? bodyMatch[1].trim() : "";

        const boxSize = CANVAS_DP * (scalePercent / 100);
        const scale = boxSize / Math.max(origW, origH);

        const scaledW = origW * scale;
        const scaledH = origH * scale;

        const translateX = (CANVAS_DP - scaledW) / 2;
        const translateY = (CANVAS_DP - scaledH) / 2;

        return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="${translateX.toFixed(2)}"
        android:translateY="${translateY.toFixed(2)}"
        android:scaleX="${scale.toFixed(4)}"
        android:scaleY="${scale.toFixed(4)}">
        ${pathsXml}
    </group>
</vector>`;

    }

    function buildSolidColorVectorXml(hexColor) {

        return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${hexColor}"
        android:pathData="M0,0h108v108h-108z"/>
</vector>`;

    }

    /* ---------------------------
       Notification icon
       (Android requires a flat WHITE silhouette on transparent
       background — colour is ignored/rejected by the system, so every
       fill/stroke is forced to white here regardless of source colour)
    ---------------------------- */

    function buildNotificationVectorXml(svgText, scalePercent) {

        const vectorStr = convertSvgToVector(svgText); // from script.js

        const wMatch = vectorStr.match(/android:viewportWidth="([\d.]+)"/);
        const hMatch = vectorStr.match(/android:viewportHeight="([\d.]+)"/);

        const origW = wMatch ? parseFloat(wMatch[1]) : 24;
        const origH = hMatch ? parseFloat(hMatch[1]) : 24;

        const bodyMatch = vectorStr.match(/viewportHeight="[\d.]+">([\s\S]*)<\/vector>/);
        let pathsXml = bodyMatch ? bodyMatch[1].trim() : "";

        // Force every path to solid white, whatever colour it traced as.
        pathsXml = pathsXml
            .replace(/android:fillColor="[^"]*"/g, 'android:fillColor="#FFFFFF"')
            .replace(/android:strokeColor="[^"]*"/g, 'android:strokeColor="#FFFFFF"');

        const NOTIF_DP = 24;
        const boxSize = NOTIF_DP * ((scalePercent != null ? scalePercent : 66) / 100); // adjustable status-bar-icon padding

        const scale = boxSize / Math.max(origW, origH);
        const scaledW = origW * scale;
        const scaledH = origH * scale;

        const translateX = (NOTIF_DP - scaledW) / 2;
        const translateY = (NOTIF_DP - scaledH) / 2;

        return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <group
        android:translateX="${translateX.toFixed(2)}"
        android:translateY="${translateY.toFixed(2)}"
        android:scaleX="${scale.toFixed(4)}"
        android:scaleY="${scale.toFixed(4)}">
        ${pathsXml}
    </group>
</vector>`;

    }

    // Raster fallback for a raster-sourced foreground: draw it, then flatten
    // every visible pixel to solid white using its own alpha as a mask.
    function drawWhiteSilhouette(targetCtx, img, size, scalePercent) {

        const boxSize = size * ((scalePercent != null ? scalePercent : 66) / 100);
        drawContain(targetCtx, img, size, boxSize);

        targetCtx.globalCompositeOperation = "source-in";
        targetCtx.fillStyle = "#FFFFFF";
        targetCtx.fillRect(0, 0, size, size);
        targetCtx.globalCompositeOperation = "source-over";

    }

    /* ---------------------------
       Generate & download the resource zip
    ---------------------------- */

    generateAdaptiveBtn.addEventListener("click", async () => {

        if (!fg.image) {
            alert("Load a foreground first (use the converted SVG, or upload an image / SVG).");
            return;
        }

        if (bgType.value === "image" && !bg.image) {
            alert("Upload a background image, or switch background type to Solid Color.");
            return;
        }

        if (typeof JSZip === "undefined") {
            alert("JSZip failed to load — check your internet connection and try again.");
            return;
        }

        const vectorOnly = !!(vectorOnlyToggle && vectorOnlyToggle.checked);
        const includeNotification = !!(includeNotificationToggle && includeNotificationToggle.checked);

        if (vectorOnly && fg.type !== "svg") {
            alert("Vector XML Only needs a vector foreground. Click \"Convert Image to Vector XML\" first, or use \"Use Converted SVG\".");
            return;
        }

        if (vectorOnly && bgType.value === "image") {
            alert("Vector XML Only needs a Solid Color background — a photo can't become a vector. Switch background type, or turn off Vector XML Only.");
            return;
        }

        const name = (iconName.value || "ic_launcher").trim().replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "ic_launcher";
        const scalePercent = Number(fgScale.value);

        generateAdaptiveBtn.disabled = true;
        generateAdaptiveBtn.innerHTML = `<span class="material-symbols-rounded">hourglass_top</span> Generating...`;

        try {

            const zip = new JSZip();

            // 1. mipmap-anydpi-v26 adaptive-icon XMLs
            const adaptiveXml =
`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/${name}_background"/>
    <foreground android:drawable="@drawable/${name}_foreground"/>
</adaptive-icon>`;

            zip.file(`res/mipmap-anydpi-v26/${name}.xml`, adaptiveXml);
            zip.file(`res/mipmap-anydpi-v26/${name}_round.xml`, adaptiveXml);

            // 2. Background drawable
            if (bgType.value === "color") {

                zip.file(`res/drawable/${name}_background.xml`, buildSolidColorVectorXml(bgColor.value));

            } else {

                for (const [density, px] of Object.entries(DENSITIES)) {

                    const c = document.createElement("canvas");
                    c.width = px;
                    c.height = px;
                    drawCover(c.getContext("2d"), bg.image, px);

                    const blob = await canvasToBlob(c);
                    zip.file(`res/mipmap-${density}/${name}_background.png`, blob);

                }

            }

            // 3. Foreground drawable
            if (fg.type === "svg") {

                zip.file(`res/drawable/${name}_foreground.xml`, buildForegroundVectorXml(fg.svgText, scalePercent));

            } else {

                for (const [density, px] of Object.entries(DENSITIES)) {

                    const c = document.createElement("canvas");
                    c.width = px;
                    c.height = px;

                    const boxSize = px * (scalePercent / 100);
                    drawContain(c.getContext("2d"), fg.image, px, boxSize);

                    const blob = await canvasToBlob(c);
                    zip.file(`res/mipmap-${density}/${name}_foreground.png`, blob);

                }

            }

            // 4. Legacy (pre-API26) launcher icons, circle-masked composite
            //    (skipped entirely in Vector XML Only mode, since these can only be PNG)
            if (!vectorOnly) {

                for (const [density, px] of Object.entries(LEGACY_LAUNCHER_SIZES)) {

                    const c = document.createElement("canvas");
                    c.width = px;
                    c.height = px;
                    const cctx = c.getContext("2d");

                    const full = document.createElement("canvas");
                    full.width = px;
                    full.height = px;
                    drawLayers(full.getContext("2d"), px);

                    cctx.save();
                    cctx.beginPath();
                    cctx.arc(px / 2, px / 2, px * (MASK_VISIBLE_DP / CANVAS_DP) / 2, 0, Math.PI * 2);
                    cctx.closePath();
                    cctx.clip();
                    cctx.drawImage(full, 0, 0);
                    cctx.restore();

                    const blob = await canvasToBlob(c);
                    zip.file(`res/mipmap-${density}/${name}.png`, blob);
                    zip.file(`res/mipmap-${density}/${name}_round.png`, blob);

                }

            }

            // 5. Notification icon (ic_notification) — white silhouette
            if (includeNotification) {

                const notifScalePercent = notifScale ? Number(notifScale.value) : 66;

                if (fg.type === "svg") {

                    zip.file(`res/drawable/${name}_notification.xml`, buildNotificationVectorXml(fg.svgText, notifScalePercent));

                } else if (!vectorOnly) {

                    for (const [density, px] of Object.entries(NOTIFICATION_SIZES)) {

                        const c = document.createElement("canvas");
                        c.width = px;
                        c.height = px;
                        drawWhiteSilhouette(c.getContext("2d"), fg.image, px, notifScalePercent);

                        const blob = await canvasToBlob(c);
                        zip.file(`res/drawable-${density}/${name}_notification.png`, blob);

                    }

                }

            }

            // 6. Play Store listing icon (512x512, unmasked, no transparency requirements)
            //    (skipped in Vector XML Only mode — Play Console requires a raster PNG anyway)
            if (!vectorOnly) {

                const storeCanvas = document.createElement("canvas");
                storeCanvas.width = 512;
                storeCanvas.height = 512;
                drawLayers(storeCanvas.getContext("2d"), 512);

                const storeBlob = await canvasToBlob(storeCanvas);
                zip.file("playstore-icon-512.png", storeBlob);

            }

            // 7. Readme
            zip.file("README.txt",
`Adaptive icon resources for "${name}"

Copy the "res" folder into your Android project's app/src/main/ directory,
merging with your existing res folder (it will not overwrite unrelated files).

- res/mipmap-anydpi-v26/${name}.xml and ${name}_round.xml
  reference the foreground/background drawables and are used on API 26+.

- res/drawable/${name}_foreground.xml / ${name}_background.xml
  are vector drawables (only generated when the source was an SVG /
  solid color). If your foreground or background came from a raster
  image instead, PNG copies were generated per density under
  res/mipmap-*/ and you should update the adaptive-icon XML's
  android:drawable references to point at "@mipmap/${name}_foreground"
  and/or "@mipmap/${name}_background" accordingly.
${includeNotification ? `
- ${fg.type === "svg" ? `res/drawable/${name}_notification.xml` : `res/drawable-*/${name}_notification.png`}
  is your notification icon — a flat white silhouette on a transparent
  background (Android ignores/ rejects colour here by design). Reference
  it with android:icon="@drawable/${name}_notification" wherever you post
  notifications (e.g. NotificationCompat.Builder.setSmallIcon()).
` : ""}${vectorOnly ? `
Vector XML Only mode was ON, so legacy pre-API26 launcher icons and the
Play Store listing icon were skipped — both of those must be raster PNGs
per Android/Play Store requirements and can't be produced as vector XML.
` : `
- res/mipmap-*/${name}.png and ${name}_round.png
  are legacy fallback icons for devices below Android 8.0 (API 26).

- playstore-icon-512.png
  is a 512x512 unmasked icon for your Play Console store listing.
`}
Generated with the Image → SVG → Android Vector tool's
Adaptive Icon Generator.
`);

            const zipBlob = await zip.generateAsync({ type: "blob" });

            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${name}_adaptive_icon.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (e) {

            console.error(e);
            alert("Something went wrong generating the resources. Check the console for details.");

        } finally {

            generateAdaptiveBtn.disabled = false;
            generateAdaptiveBtn.innerHTML = `<span class="material-symbols-rounded">folder_zip</span> Generate & Download Resources`;

        }

    });

})();
