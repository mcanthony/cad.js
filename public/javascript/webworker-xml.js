// Import the XML parser
importScripts("/javascript/libs/tinyxmldom.js");

/*** Utility functions ****/

function parseColor(hex) {
    var cval = parseInt(hex, 16);
    return {
        r: ((cval >>16) & 0xff) / 255,
        g: ((cval >>8) & 0xff) / 255,
        b: ((cval >>0) & 0xff) / 255
    };
}

/*********************************************************************/

function processAssembly(url, xml) {
    var message = {
        type: "rootLoad",
        url: url,
        data: xml
    };
    self.postMessage(message);
}

/*********************************************************************/

function loadPoints(el) {
    // Load all of the point information
    var verts = el.getElements("verts")[0].getElements("v");
    var points = new Float32Array(verts.length * 3);
    var index = 0, pt, coords;
    for (var i = 0; i < verts.length; i++) {
        pt = verts[i].getAttribute("p");
        coords = pt.split(" ", 3);
        points[index++] = parseFloat(coords[0]);
        points[index++] = parseFloat(coords[1]);
        points[index++] = parseFloat(coords[2]);
    }
    return points;
}

function processShell(url, xml, expectedSize) {
    var xmlDoc = new XMLDoc(xml, function(err) {
        console.log("Webworker-xml parser error: " + err);
    });
    var xmlRoot = xmlDoc.docNode;
    var size = expectedSize * 9;
    //console.log("Process XML of shell: " + size);
    var defaultColor = parseColor("d8d8d8");
    // Load the points array
    var points = loadPoints(xmlRoot);
    // Get all of the facet information ready
    var facets = xmlRoot.getElements("facets");
    // Now load the rest of the data
    var position = new Float32Array(size);
    var normals = new Float32Array(size);
    var colors = new Float32Array(size);
    var pIndex = 0, nIndex = 0, cIndex = 0, totalTris = 0;
    for (var i = 0; i < facets.length; i++) {
        // Set the color
        var color = facets[i].getAttribute("color");
        color = color ? parseColor(color) : defaultColor;
        // Work through each triangle - an 'F' is one
        var tris = facets[i].getElements("f");
        var indexVals, tri, norms, index0, index1, index2, normCoordinates;
        for (var j = 0; j < tris.length; j++) {
            tri = tris[j];
            // Get the index information
            indexVals = tri.getAttribute("v").split(" ", 3);
            index0 = parseInt(indexVals[0]) * 3;
            index1 = parseInt(indexVals[1]) * 3;
            index2 = parseInt(indexVals[2]) * 3;

            position[pIndex++] = points[index0];
            position[pIndex++] = points[index0 + 1];
            position[pIndex++] = points[index0 + 2];
            position[pIndex++] = points[index1];
            position[pIndex++] = points[index1 + 1];
            position[pIndex++] = points[index1 + 2];
            position[pIndex++] = points[index2];
            position[pIndex++] = points[index2 + 1];
            position[pIndex++] = points[index2 + 2];

            // Get the normal information
            norms = tri.getElements("n");
            normCoordinates = norms[0].getAttribute("d").split(" ", 3);
            normals[nIndex++] = parseFloat(normCoordinates[0]);
            normals[nIndex++] = parseFloat(normCoordinates[1]);
            normals[nIndex++] = parseFloat(normCoordinates[2]);
            normCoordinates = norms[1].getAttribute("d").split(" ", 3);
            normals[nIndex++] = parseFloat(normCoordinates[0]);
            normals[nIndex++] = parseFloat(normCoordinates[1]);
            normals[nIndex++] = parseFloat(normCoordinates[2]);
            normCoordinates = norms[2].getAttribute("d").split(" ", 3);
            normals[nIndex++] = parseFloat(normCoordinates[0]);
            normals[nIndex++] = parseFloat(normCoordinates[1]);
            normals[nIndex++] = parseFloat(normCoordinates[2]);

            // Set the color information
            colors[cIndex++] = color.r;
            colors[cIndex++] = color.g;
            colors[cIndex++] = color.b;
            colors[cIndex++] = color.r;
            colors[cIndex++] = color.g;
            colors[cIndex++] = color.b;
            colors[cIndex++] = color.r;
            colors[cIndex++] = color.g;
            colors[cIndex++] = color.b;
        }
    }
    var data = {
        position: position,
        normals: normals,
        colors: colors
    };
    self.postMessage({
        type: "shellLoad",
        data: data,
        url: url
    }, [data.position.buffer, data.normals.buffer, data.colors.buffer]);
}

/*********************************************************************/


self.addEventListener("message", function(e) {
    // event is a new file to request and process
    // Get the request URL info
    var url = e.data.url;
    var xhr = new XMLHttpRequest();

    xhr.addEventListener("load", function() {
        self.postMessage({ type: "loadEnd", url: e.data.url });
        // What did we get back
        switch(e.data.type) {
            case "shell":
                processShell(url, xhr.responseText, e.data.shellSize);
                break;
            case "assembly":
                processAssembly(url, xhr.responseText);
                break;
            default:
                throw Error("DataLoader.webworker-xml - Invalid request type: " + e.data.type)
                break;
        }
    });
    xhr.addEventListener("loadend", function() {
        self.postMessage({ type: "loadComplete" });
    });
    xhr.addEventListener("progress", function(event) {
        var parts = url.split("/");
        var message = { type: "loadProgress", file: parts[parts.length - 1] };
        if (event.lengthComputable) {
            message.loaded = event.loaded / event.total * 100.0;
        }
        self.postMessage(message);
    });

    xhr.open("GET", url, true);
    // Go get it
    try {
        xhr.send();
    } catch (ex) {
        console.log ("DataLoader.webworker-xml - Error loading file: " + url);
    }
}, false);