/* ---------------------------
   Element References
---------------------------- */

const imageFile     = document.getElementById("imageFile");
const traceBtn       = document.getElementById("traceBtn");

const imagePreview   = document.getElementById("imagePreview");
const svgPreview      = document.getElementById("svgPreview");

const svgOutput       = document.getElementById("svgOutput");
const xmlOutput       = document.getElementById("xmlOutput");

const copySvgBtn      = document.getElementById("copySvgBtn");
const copyXmlBtn      = document.getElementById("copyXmlBtn");

const downloadSvgBtn  = document.getElementById("downloadSvgBtn");
const downloadBtn     = document.getElementById("downloadBtn");
const colors = document.getElementById("colors");
const colorsValue = document.getElementById("colorsValue");
const detail = document.getElementById("detail");
const convertXmlBtn = document.getElementById("convertXmlBtn");
const downloadPreviewBtn = document.getElementById("downloadPreviewBtn");
const convertSvgBtn = document.getElementById("convertSvgBtn");
const dropZone = document.getElementById("dropZone");
colors.oninput = () => {
    colorsValue.textContent = colors.value;
};

let imageData = null; // yeh missing tha — file select hone par kabhi set hi nahi hota tha
let fileName = "image";

/* ---------------------------
   File Select → Preview
---------------------------- */

imageFile.addEventListener("change", () => {

    
const file = imageFile.files[0];

if (!file) return;

fileName = file.name.replace(/\.[^/.]+$/, "");
    const reader = new FileReader();

    reader.onload = (e) => {

        imageData = e.target.result; // data URL — ImageTracer isi ko use karega

        imagePreview.src = imageData;
        imagePreview.style.display = "block";

        // Naya image select karne par purana output clear kar do
        svgPreview.innerHTML = "";
        svgOutput.value = "";
        xmlOutput.value = "";

    };

    reader.readAsDataURL(file);

});
function loadImage(file) {

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {

        imageData = e.target.result;

        imagePreview.src = imageData;
        imagePreview.style.display = "block";

        svgPreview.innerHTML = "";
        svgOutput.value = "";
        xmlOutput.value = "";

    };

    reader.readAsDataURL(file);

}


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

        fileName = file.name.replace(/\.[^/.]+$/, "");
        loadImage(file);

    });

}

/* ---------------------------
   Convert Button
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
    traceBtn.textContent = "Converting...";

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

        traceBtn.disabled = false;
        traceBtn.textContent = "Image → SVG";
    },
    {
        numberofcolors: Number(colors.value),
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

    const paths = vector.querySelectorAll("path");

    paths.forEach(path => {

        const d =
            path.getAttribute("android:pathData") ||
            path.getAttribute("pathData");

        if (!d) return;

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

        svg += `

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

    });

    svg += `

</svg>`;

    return svg;

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
document.addEventListener("paste", async (e) => {

    const items = e.clipboardData.items;

    for (const item of items) {

        if (item.type.startsWith("image/")) {

            const file = item.getAsFile();

            if (!file) return;

            const reader = new FileReader();

            reader.onload = (event) => {

                imageData = event.target.result;

                imagePreview.src = imageData;
                imagePreview.style.display = "block";

                svgPreview.innerHTML = "";
                svgOutput.value = "";
                xmlOutput.value = "";

            };

            reader.readAsDataURL(file);

            break;
        }

    }

});