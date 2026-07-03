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

colors.oninput = () => {
    colorsValue.textContent = colors.value;
};

let imageData = null; // yeh missing tha — file select hone par kabhi set hi nahi hota tha


/* ---------------------------
   File Select → Preview
---------------------------- */

imageFile.addEventListener("change", () => {

    const file = imageFile.files[0];

    if (!file) return;

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

    ImageTracer.imageToSVG(imageData, function (svgString) {

        svgOutput.value = svgString;

        svgPreview.innerHTML = svgString;

        const svg = svgPreview.querySelector("svg");

        if (svg) {

            // Pehle width/height read karo
            const w = svg.getAttribute("width") || "432";
            const h = svg.getAttribute("height") || "432";

            // Agar viewBox nahi hai to create karo
            if (!svg.hasAttribute("viewBox")) {
                svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
            }

            // Phir width/height remove karo
            svg.removeAttribute("width");
            svg.removeAttribute("height");

            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

            svg.style.width = "100%";
            svg.style.height = "100%";
            svg.style.display = "block";
        }
        

        xmlOutput.value = convertSvgToVector(svgString);

        traceBtn.disabled = false;
        traceBtn.textContent = "Convert";

    });

});


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

        if (fill === "none") return;

        if (fill.startsWith("rgb")) {

            const rgb = fill.match(/\d+/g);

            if (rgb) {

                fill =
                    "#FF" +
                    parseInt(rgb[0]).toString(16).padStart(2, "0") +
                    parseInt(rgb[1]).toString(16).padStart(2, "0") +
                    parseInt(rgb[2]).toString(16).padStart(2, "0");

            }

        }

        if (/^#[0-9a-fA-F]{6}$/.test(fill)) {
            fill = "#FF" + fill.substring(1);
        }

        const opacity = parseFloat(path.getAttribute("opacity") || "1");

        if (opacity <= 0) return;

        const d = path.getAttribute("d");

        if (!d) return;

        xml += `

    <path
        android:pathData="${d}"
        android:fillColor="${fill}" />`;

    });

    xml += `

</vector>`;

    return xml;

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
    a.download = "image.svg";

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
    a.download = "vector.xml";

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

});