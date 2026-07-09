/* ---------------------------
   Element References
---------------------------- */

const imageFile          = document.getElementById("imageFile");
const traceBtn            = document.getElementById("traceBtn");

const imagePreview        = document.getElementById("imagePreview");
const svgPreview           = document.getElementById("svgPreview");

const svgOutput            = document.getElementById("svgOutput");
const xmlOutput            = document.getElementById("xmlOutput");

const copySvgBtn           = document.getElementById("copySvgBtn");
const copyXmlBtn           = document.getElementById("copyXmlBtn");

const downloadSvgBtn       = document.getElementById("downloadSvgBtn");
const downloadBtn          = document.getElementById("downloadBtn");
const downloadPreviewBtn   = document.getElementById("downloadPreviewBtn");

const convertXmlBtn        = document.getElementById("convertXmlBtn");
const convertSvgBtn        = document.getElementById("convertSvgBtn");

const colors               = document.getElementById("colors");
const colorsValue          = document.getElementById("colorsValue");
const detail                = document.getElementById("detail");

const dropZone              = document.getElementById("dropZone");

const progressWrap          = document.getElementById("progressWrap");
const progressFill          = document.getElementById("progressFill");
const progressText          = document.getElementById("progressText");

const TRACE_BTN_ICON  = `<span class="material-symbols-rounded">sync_alt</span>`;
const TRACE_BTN_LABEL = "Image → XML";

let imageData = null;
let fileName  = "image";

colors.oninput = () => {
    colorsValue.textContent = colors.value;
};

/* ---------------------------
   Progress Bar Helper
   (ImageTracer callback real progress nahi deta,
   isliye ek counter chalate hain jo 1,2,3...
   karke gradually badhta hai. Processing ke doran
   97% tak jaata hai, aur jaise hi asli kaam khatam
   hota hai baaki ke numbers jaldi jaldi count karke
   100 tak pahुnch jaata hai)
---------------------------- */

let _counterInterval = null;
let _currentProgress = 0;

function setProgress(pct) {
    _currentProgress = pct;
    progressFill.style.width = pct + "%";
    progressText.textContent = Math.round(pct) + "%";
}

function startCounting() {

    progressWrap.classList.add("active");
    setProgress(0);

    clearInterval(_counterInterval);

    _counterInterval = setInterval(() => {

        if (_currentProgress < 97) {
            setProgress(_currentProgress + 1);
        }

    }, 30);

}

function finishCounting(onComplete) {

    clearInterval(_counterInterval);

    function tick() {

        if (_currentProgress < 100) {
            setProgress(_currentProgress + 1);
            setTimeout(tick, 12);
            return;
        }

        setTimeout(() => {
            progressWrap.classList.remove("active");
            setProgress(0);
            if (onComplete) onComplete();
        }, 300);

    }

    tick();

}

/* ---------------------------
   Image Loading (file input, drag&drop, paste — sabke liye ek hi function)
---------------------------- */

function loadImage(file) {

    if (!file) return;

    fileName = file.name ? file.name.replace(/\.[^/.]+$/, "") : fileName;

    const reader = new FileReader();

    reader.onload = (e) => {

        imageData = e.target.result;

        imagePreview.src = imageData;
        imagePreview.style.display = "block";

        // Naya image aane par purana output clear kar do
        svgPreview.innerHTML = "";
        svgOutput.value = "";
        xmlOutput.value = "";

    };

    reader.readAsDataURL(file);

}

imageFile.addEventListener("change", () => {
    loadImage(imageFile.files[0]);
});

/* ---------------------------
   Drag & Drop
---------------------------- */

if (dropZone) {

    ["dragenter", "dragover"].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("dragover");
        });
    });

    dropZone.addEventListener("drop", (e) => {

        const file = e.dataTransfer.files && e.dataTransfer.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please drop an image file.");
            return;
        }

        loadImage(file);

    });

}

/* ---------------------------
   Paste Image
---------------------------- */

document.addEventListener("paste", (e) => {

    const items = e.clipboardData.items;

    for (const item of items) {

        if (item.type.startsWith("image/")) {
            loadImage(item.getAsFile());
            break;
        }

    }

});

/* ---------------------------
   Convert Button (Image → SVG → Android XML)
---------------------------- */

traceBtn.addEventListener("click", () => {

    if (!imageData) {
        alert("Please select an image first.");
        return;
    }

    if (typeof ImageTracer === "undefined") {
        alert("ImageTracer library not loaded.");
        return;
    }

    traceBtn.disabled = true;
    traceBtn.innerHTML = `${TRACE_BTN_ICON} Converting...`;

    startCounting();

    ImageTracer.imageToSVG(
        imageData,
        function (svgString) {

            svgOutput.value = svgString;
            svgPreview.innerHTML = svgString;

            const svg = svgPreview.querySelector("svg");

            if (svg) {

                const w = svg.getAttribute("width") || "432";
                const h = svg.getAttribute("height") || "432";

                if (!svg.hasAttribute("viewBox")) {
                    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
                }

                svg.removeAttribute("width");
                svg.removeAttribute("height");

                svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

                svg.style.width = "100%";
                svg.style.height = "100%";
                svg.style.display = "block";
            }

            xmlOutput.value = convertSvgToVector(svgString);

            finishCounting(() => {
                traceBtn.disabled = false;
                traceBtn.innerHTML = `${TRACE_BTN_ICON} ${TRACE_BTN_LABEL}`;
            });
        },
        {
            numberofcolors: Number(colors.value),
            colorsampling: 2,
            colorquantcycles: 10,
            mincolorratio: 0.005,
            ltres: detail.value === "high" ? 0.5 : detail.value === "low" ? 2 : 1,
            qtres: detail.value === "high" ? 0.5 : detail.value === "low" ? 2 : 1,
            pathomit: 0,
            scale: 1,
            viewbox: true
        }
    );

});

/* ---------------------------
   SVG Helper Functions
---------------------------- */

// 1x1 canvas jo browser ke apne CSS color parser ko use karta hai —
// isse rgb(), rgba(), hsl(), hsla(), named colors (red, cornflowerblue, etc.)
// sab automatically handle ho jaate hain, alag regex likhne ki zaroorat nahi.
let _colorCanvasCtx = null;
function _normalizeColor(color) {

    if (!_colorCanvasCtx) {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        _colorCanvasCtx = c.getContext("2d");
    }

    _colorCanvasCtx.fillStyle = "#000000"; // reset, taaki invalid color purani value na le
    _colorCanvasCtx.fillStyle = color;
    _colorCanvasCtx.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = _colorCanvasCtx.getImageData(0, 0, 1, 1).data;

    return { r, g, b, a: a / 255 };

}

function svgColorToAndroid(color) {

    if (!color || color === "none") return null;

    color = color.trim();

    try {

        const { r, g, b, a } = _normalizeColor(color);

        const alphaHex = Math.round(a * 255)
            .toString(16)
            .padStart(2, "0");

        return (
            "#" + alphaHex +
            r.toString(16).padStart(2, "0") +
            g.toString(16).padStart(2, "0") +
            b.toString(16).padStart(2, "0")
        ).toUpperCase();

    } catch (e) {

        return color;

    }

}

function getSvgAlpha(path, attribute) {

    const value = path.getAttribute(attribute);

    if (!value) return null;

    const alpha = parseFloat(value);

    if (isNaN(alpha) || alpha >= 1) return null;

    return alpha;

}

function getSvgFillType(path) {

    const rule = path.getAttribute("fill-rule");

    if (!rule) return null;

    return rule === "evenodd"
        ? "evenOdd"
        : "nonZero";

}
function getStyleValue(path, property) {

    const style = path.getAttribute("style");

    if (!style) return null;

    const styles = style.split(";");

    for (const item of styles) {

        const parts = item.split(":");

        if (parts.length !== 2) continue;

        if (parts[0].trim() === property) {
            return parts[1].trim();
        }

    }

    return null;

}
/* ---------------------------
   SVG → Android XML
---------------------------- */


function convertSvgToVector(svg) {

    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");

    const svgElement = doc.querySelector("svg");

    if (!svgElement) return "Invalid SVG";

    let viewportWidth = svgElement.getAttribute("width") || "24";
    let viewportHeight = svgElement.getAttribute("height") || "24";

    const viewBox = svgElement.getAttribute("viewBox");

    if (viewBox) {

        const vb = viewBox.trim().split(/\s+/);

        viewportWidth = vb[2];
        viewportHeight = vb[3];

    }

    let xml = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${viewportWidth}dp"
    android:height="${viewportHeight}dp"
    android:viewportWidth="${viewportWidth}"
    android:viewportHeight="${viewportHeight}">`;

    const paths = doc.querySelectorAll("path");

    paths.forEach(path => {

        let fill = path.getAttribute("fill") || "#000000";
        if (!path.getAttribute("fill")) {

    const styleFill = getStyleValue(path, "fill");

    if (styleFill) {
        fill = styleFill;
    }

}

       const hasFill = fill.trim() !== "none";

        fill = svgColorToAndroid(fill);

        const opacity = parseFloat(path.getAttribute("opacity") || "1");

        if (opacity <= 0) return;

        const d = path.getAttribute("d");

        if (!d) return;
        // Stroke
let stroke = path.getAttribute("stroke");
if (!stroke) {
    stroke = getStyleValue(path, "stroke");
}

if (stroke && stroke !== "none") {
    stroke = svgColorToAndroid(stroke);
} else {
    stroke = null;
}

// Stroke Width
const strokeWidth = path.getAttribute("stroke-width");
const finalStrokeWidth =
    strokeWidth || getStyleValue(path, "stroke-width");

// Fill Alpha
const fillAlpha = getSvgAlpha(path, "fill-opacity");

// Stroke Alpha
const strokeAlpha = getSvgAlpha(path, "stroke-opacity");

// Fill Rule
const fillType = getSvgFillType(path);
xml += `

    <path
        android:pathData="${d}"`;

if (hasFill)
    xml += `
        android:fillColor="${fill}"`;
if (stroke)
    xml += `
        android:strokeColor="${stroke}"`;

if (fillAlpha !== null)
    xml += `
        android:fillAlpha="${fillAlpha}"`;

if (finalStrokeWidth)
    xml += `
        android:strokeWidth="${finalStrokeWidth}"`;
if (strokeAlpha !== null)
    xml += `
        android:strokeAlpha="${strokeAlpha}"`;
if (fillType)
    xml += `
        android:fillType="${fillType}"`;

xml += ` />`;

    });

    xml += `

</vector>`;

    return xml;

}

function convertVectorToSvg(xml) {

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const vector = doc.querySelector("vector");

    if (!vector) return null;

    const width =
        vector.getAttribute("android:viewportWidth") ||
        vector.getAttribute("viewportWidth") ||
        "24";

    const height =
        vector.getAttribute("android:viewportHeight") ||
        vector.getAttribute("viewportHeight") ||
        "24";

    let svg =
`<svg xmlns="http://www.w3.org/2000/svg"
viewBox="0 0 ${width} ${height}">`;

    svg += renderVectorNode(vector);

    svg += `

</svg>`;

    return svg;

}

// Turns a single Android <path> element into an SVG <path> string.
function renderVectorPath(path) {

    const d =
        path.getAttribute("android:pathData") ||
        path.getAttribute("pathData");

    if (!d) return "";

    let fill =
        path.getAttribute("android:fillColor") ||
        path.getAttribute("fillColor");

    if (!fill) fill = "#000000";

    if (/^#FF/i.test(fill)) {
        fill = "#" + fill.substring(3);
    }

    let fillAlpha =
        path.getAttribute("android:fillAlpha") ||
        path.getAttribute("fillAlpha");

    let stroke =
        path.getAttribute("android:strokeColor") ||
        path.getAttribute("strokeColor");

    if (stroke && /^#FF/i.test(stroke)) {
        stroke = "#" + stroke.substring(3);
    }

    let strokeWidth =
        path.getAttribute("android:strokeWidth") ||
        path.getAttribute("strokeWidth");

    let strokeAlpha =
        path.getAttribute("android:strokeAlpha") ||
        path.getAttribute("strokeAlpha");

    let fillType =
        path.getAttribute("android:fillType") ||
        path.getAttribute("fillType");

    let svg = `

<path
d="${d}"
fill="${fill}"`;

    if (fillAlpha)
        svg += `
fill-opacity="${fillAlpha}"`;

    if (stroke)
        svg += `
stroke="${stroke}"`;

    if (strokeWidth)
        svg += `
stroke-width="${strokeWidth}"`;

    if (strokeAlpha)
        svg += `
stroke-opacity="${strokeAlpha}"`;

    if (fillType)
        svg += `
fill-rule="${fillType === "evenOdd" ? "evenodd" : "nonzero"}"`;

    svg += `
/>`;

    return svg;

}

// Builds an SVG transform= string matching Android's <group> transform
// order: translate(translateX,translateY) -> pivot -> rotate -> scale -> -pivot.
// Returns null when the group has no actual transform (nothing to wrap).
function androidGroupTransform(group) {

    const attr = (name, def) => {
        const v =
            group.getAttribute("android:" + name) ||
            group.getAttribute(name);
        const n = v !== null ? parseFloat(v) : NaN;
        return isNaN(n) ? def : n;
    };

    const translateX = attr("translateX", 0);
    const translateY = attr("translateY", 0);
    const scaleX = attr("scaleX", 1);
    const scaleY = attr("scaleY", 1);
    const pivotX = attr("pivotX", 0);
    const pivotY = attr("pivotY", 0);
    const rotation = attr("rotation", 0);

    if (translateX === 0 && translateY === 0 && scaleX === 1 && scaleY === 1 && rotation === 0) {
        return null; // identity transform, no need to wrap in a <g>
    }

    let t = `translate(${translateX} ${translateY})`;

    if (pivotX || pivotY) t += ` translate(${pivotX} ${pivotY})`;
    if (rotation) t += ` rotate(${rotation})`;
    if (scaleX !== 1 || scaleY !== 1) t += ` scale(${scaleX} ${scaleY})`;
    if (pivotX || pivotY) t += ` translate(${-pivotX} ${-pivotY})`;

    return t;

}

// Recursively walks <path> and <group> children of a vector/group node,
// applying each group's transform so nested/grouped Android vector XML
// (like the adaptive icon foreground exports) previews correctly instead
// of paths silently landing outside the viewBox.
function renderVectorNode(node) {

    let out = "";

    for (const child of Array.from(node.children)) {

        const tag = child.tagName.toLowerCase();

        if (tag === "path") {

            out += renderVectorPath(child);

        } else if (tag === "group") {

            const transform = androidGroupTransform(child);
            const inner = renderVectorNode(child);

            out += transform
                ? `<g transform="${transform}">${inner}</g>`
                : inner;

        }

    }

    return out;

}

/* ---------------------------
   Copy Buttons
---------------------------- */

copySvgBtn.addEventListener("click", () => {

    if (!svgOutput.value) return;

    navigator.clipboard.writeText(svgOutput.value);

    alert("SVG copied!");

});

copyXmlBtn.addEventListener("click", () => {

    if (!xmlOutput.value) return;

    navigator.clipboard.writeText(xmlOutput.value);

    alert("XML copied!");

});

/* ---------------------------
   Download SVG
---------------------------- */

downloadSvgBtn.addEventListener("click", () => {

    if (!svgOutput.value) return;

    const blob = new Blob([svgOutput.value], {
        type: "image/svg+xml"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = `${fileName}.svg`;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

});

/* ---------------------------
   Download XML
---------------------------- */

downloadBtn.addEventListener("click", () => {

    if (!xmlOutput.value) return;

    const blob = new Blob([xmlOutput.value], {
        type: "application/xml"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
a.download = `${fileName}.xml`;
    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

});
/* ---------------------------
   SVG → XML
---------------------------- */

convertXmlBtn.addEventListener("click", () => {

    const svg = svgOutput.value.trim();

    if (!svg) {
        alert("Paste or generate SVG first.");
        return;
    }

    svgPreview.innerHTML = svg;

    const svgElement = svgPreview.querySelector("svg");

    if (svgElement) {

        const w = svgElement.getAttribute("width") || "432";
        const h = svgElement.getAttribute("height") || "432";

        if (!svgElement.hasAttribute("viewBox")) {
            svgElement.setAttribute("viewBox", `0 0 ${w} ${h}`);
        }

        svgElement.removeAttribute("width");
        svgElement.removeAttribute("height");

        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.display = "block";

        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }

    xmlOutput.value = convertSvgToVector(svg);

});
/* ---------------------------
   Download PNG
---------------------------- */

downloadPreviewBtn.addEventListener("click", () => {

    const svg = svgPreview.querySelector("svg");

    if (!svg) {
        alert("No preview available.");
        return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);

    const svgBlob = new Blob([svgData], {
        type: "image/svg+xml"
    });

    const url = URL.createObjectURL(svgBlob);

    const img = new Image();

    img.onload = function () {

        const canvas = document.createElement("canvas");

        canvas.width = svg.viewBox.baseVal.width || 512;
        canvas.height = svg.viewBox.baseVal.height || 512;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);

        const a = document.createElement("a");

       a.download = `${fileName}_preview.png`;
        a.href = canvas.toDataURL("image/png");

        a.click();

    };

    img.src = url;

});
/* ---------------------------
   XML → SVG
---------------------------- */

convertSvgBtn.addEventListener("click", () => {

    const xml = xmlOutput.value.trim();

    if (!xml) {
        alert("Paste Android Vector XML first.");
        return;
    }

    const svg = convertVectorToSvg(xml);

    if (!svg) {
        alert("Invalid Android Vector XML.");
        return;
    }

    svgOutput.value = svg;

    svgPreview.innerHTML = svg;

    const svgElement = svgPreview.querySelector("svg");

    if (svgElement) {

        svgElement.removeAttribute("width");
        svgElement.removeAttribute("height");

        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.display = "block";

        svgElement.setAttribute(
            "preserveAspectRatio",
            "xMidYMid meet"
        );

    }

});