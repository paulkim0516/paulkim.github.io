import * as THREE from 'three';
import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { DragControls } from 'three/addons/controls/DragControls.js';

let width, height;
let fWidth = 956, fHeight = 722;
let ratio = 1;

let camera, scene, renderer;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let selectable = [];
let curves = new THREE.Group();
let cpLines = new THREE.Group();
let circles = new THREE.Group();
let dragControls;
let colorPicker = false;

let changed = true;

let selectedCurve;
let selectedCurveColor = 0xffffff;
let curveColorButton;
let nurbsDegree = 3;
let cpCount = 4;
let cpColor = 0xffffff;

const circleSegmentCount = 128;
const linewidth = 0.5;

const numRow = 45;
const numCol = 60;
let gridWidth, gridHeight, cellSize;

const defaultCurveCount = 3;
const cpRelativeSize = 0.02;

const tolerance = 0.001;

// Decide whether initial curves are set with preset data. Once loaded, update to false to prevent malfunction.
let preset = true;
const cpPreset = [
    [
        new THREE.Vector3(98.61,    343.47, 0),
        new THREE.Vector3(497.41,   519.31, 0),
        new THREE.Vector3(650.08,   21.31,  0),
        new THREE.Vector3(925.52,   321.77, 0)
    ],
    [
        new THREE.Vector3(452.88,   20.12,  0),
        new THREE.Vector3(727.13,   386.20, 0),
        new THREE.Vector3(341.59,   506.30, 0),
        new THREE.Vector3(854.38,   611.25, 0)
    ],
    [
        new THREE.Vector3(147.75,   19.29,  0),
        new THREE.Vector3(610.11,   335.64, 0),
        new THREE.Vector3(68.27,    420.08, 0),
        new THREE.Vector3(515.40,   679.47, 0)
    ]
];

function init() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('preset')) preset = searchParams.get('preset') !== 'false';
    scene = new THREE.Scene();
    
    updateDimensions(window.innerWidth, window.innerHeight, window.innerWidth / 2, window.innerHeight / 2);
    
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(width, height);
    document.body.appendChild(renderer.domElement);

    if (preset) {
        if (width / 956 < height / 722) {
            ratio = width / 956;
        } else {
            ratio = height / 722;
        }
        cpPreset.forEach(curveCP => {
            curveCP.forEach(cp => {
                cp.add(new THREE.Vector3(-956/2, -722/2,0)).multiplyScalar(ratio);
            });
        });
    } else {
        fWidth = width;
        fHeight = height;
    }

    initCurves();
    initCircles();

    scene.add(curves);
    scene.add(cpLines);
    scene.add(circles);
    
    curves.visible = false;
    cpLines.visible = false;
    circles.visible = true;

    buildGUI();
    
    updateDraggables();
    curves.visible ? dragControls.activate() : dragControls.deactivate();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onWindowResize);
    preset = false;
}

function buildGUI() {
    const gui = new GUI();
    const params = {
        curve: curves.visible,
        circle: circles.visible,
        addCurve: addCurve,
        removeCurve: removeCurve,
        curveColor: selectedCurveColor
    };

    gui.add(params, 'curve').onChange(v =>{
        curves.visible = v;
        cpLines.visible = v;
        v ? dragControls.activate() : dragControls.deactivate();
        render();
    });
    gui.add(params, 'circle').onChange(v =>{
        circles.visible = v;
        if (v && changed) updateCircles();
        render();
    });
    gui.add(params, 'addCurve');
    gui.add(params, 'removeCurve');
    curveColorButton = gui.addColor(params, 'curveColor').onChange(c => {
        if (selectedCurve) {
            updateCurve({curve: selectedCurve, color: c});
            if (circles.visible) updateCircles(selectedCurve);
            render();
        }
    }).disable();

    gui.close();
}

function updateDraggables() {
    dragControls = new DragControls(selectable, camera, renderer.domElement);
    dragControls.addEventListener('dragstart', onDragStart);
    dragControls.addEventListener('drag', onDrag);
    dragControls.addEventListener('dragend', onDragEnd);
    dragControls.addEventListener('hoveron', onHoverOn);
    dragControls.addEventListener('hoveroff', onHoverOff);
}

/**
 * Generate a random point that is both inside a bounding box and outside a specified rectangle.
 * If there cannot be a point with given parameters, it will return a vector with w component value of -1.
 * @param {number} boundX — X coordinate of the bounding box.
 * @param {number} boundY — Y coordinate of the bounding box.
 * @param {number} boundWidth — Width of the bounding box.
 * @param {number} boundHeight — Height of the bounding box where the point should be in.
 * @param {number} rectX — X coordinate of the rectangle.
 * @param {number} rectY — Y coordinate of the rectangle.
 * @param {number} rectWidth — Width of the rectangle.
 * @param {number} rectHeight — Height of the rectangle.
 * @returns {THREE.Vector4} A random point inside the bounding box and outside the rectangle.
 */
function pointOutsideRect(boundX, boundY, boundWidth, boundHeight, rectX, rectY, rectWidth, rectHeight) {
    let x = 0, y = 0;
    if (boundX > rectX && boundY > rectY && boundX + boundWidth < rectX + rectWidth && boundY + boundHeight < rectY + rectHeight) {
        return new THREE.Vector4(0, 0, 0, -1);
    }
    do {
        x = Math.random() * boundWidth + boundX;
    } while (x >= rectX && x < rectX + rectWidth);
    
    do {
        y = Math.random() * boundHeight + boundY;
    } while (y >= rectY && y < rectY + rectHeight);
    return new THREE.Vector4(x, y, 0, 1);
}

/**
 * Brute-force method to find the closest point on a given curve from a given point.
 * Tolerance should be a positive number less than 1. Closer to 0 means higher accuracy
 * but may take more time to compute.
 * @param {THREE.Vector3} point — Point to project onto curve
 * @param {THREE.Line} curve — Line object of curve to project onto
 * @param {number} tolerance — Level of sampling on curve.
 * @returns {THREE.Vector3} The closest point on the given curve.
 */
function curveClosestPoint(point, curve, tolerance) {
    let curveGeo = curve.geometry.userData.curve;
    let minDistance = Infinity;
    let t = 0;

    for (let param = 0; param <= 1; param+= tolerance) {
        let pointOnCurve = curveGeo.getPointAt(param).add(curve.position);
        let dist = point.distanceTo(pointOnCurve);
        if (dist < minDistance) {
            minDistance = dist;
            t = param;
        }
    }
    return curveGeo.getPointAt(t).add(curve.position);
}

/**
 * Called when page is loaded.
 */
function initCurves() {
    for (let i = 0; i < defaultCurveCount; i++) {
        addCurve();
    }
}

/**
 * Function to call required functions for adding new curve.
 */
function addCurve() {
    const cpGroup = populateCP(preset ? cpPreset[curves.children.length] : null);
    const newCurve = updateCurve({cpGroup: cpGroup, color: preset ? Math.pow(0x100, curves.children.length) * 0xff : Math.random() * 0xffffff});
    updateCircles(newCurve);
    render();
}

/**
 * Removes a curve and its associated CP line from the screen. If a curve is selected, remove that curve.
 * Update circles to correct the curve closest point data and color of each circle.
 */
function removeCurve() {
    if (curves.children.length != 0) {
        const index = selectedCurve ? curves.children.indexOf(selectedCurve) : curves.children.length - 1;
        if (selectedCurve) {
            selectedCurve = null;
            curveColorButton.disable();
        }
        const curve = curves.children[index];
        const cpLine = curve.userData.cpLine;
        cpLines.remove(cpLine);
        disposeObject(cpLine);
        curves.remove(curve);
        disposeObject(curve);
        updateCircles(curve, true);
        render();
    } else {
        console.log("There's no more curve to remove");

    }
}

/**
 * Generic function to dispose an object and associated geometry/material and children as well.
 * @param {THREE.Object3D} object An object to dispose
 */
function disposeObject(object) {
    if (object.geometry) {
        object.geometry.dispose();
    }

    if (object.material) {
        if (Array.isArray(object.material)) {
            object.material.forEach(function(material) {
                material.dispose();
            });
        } else {
            object.material.dispose();
        }
    }

    if (object.children) {
        while (object.children.length) {
            disposeObject(object.children[0]);
            object.remove(object.children[0]);
        }
    }
}

/**
 * Populate control points with meshes on control point coordinates and essential data for NURBSCurve.
 * @param {THREE.Vector3[]} vertices Optional array of THREE.Vector3 to populate control points with.
 * @returns A THREE.Group object of control point box meshes and their data in userData.
 */
function populateCP(vertices = null) {
    const cpGroup = new THREE.Group();
    let points = vertices ? vertices : [];
    if (vertices) cpCount = vertices.length;
    let knots = [];

    for (let i = 0; i <= nurbsDegree; i++) {
        knots.push(0);
    }

    if (!vertices) points.push(pointOutsideRect(
        -width / 2, 
        -height / 2, 
        width,
        height,
        -gridWidth / 2,
        -gridHeight / 2,
        gridWidth,
        gridHeight));
    knots.push(THREE.MathUtils.clamp( (0 + 1) / (cpCount - nurbsDegree), 0, 1 ));

    for (let i = 1; i < cpCount - 1; i++) {
        if (!vertices) points.push(
            new THREE.Vector4(
                Math.random() * gridWidth - gridWidth / 2,
                Math.random() * gridHeight - gridHeight / 2,
                0,
                1
            )
        );
        knots.push(THREE.MathUtils.clamp( (i + 1) / (cpCount - nurbsDegree), 0, 1 ));
    }

    if (!vertices) points.push(pointOutsideRect(
        -width / 2, 
        -height / 2, 
        width,
        height,
        -gridWidth / 2,
        -gridHeight / 2,
        gridWidth,
        gridHeight));
    knots.push(THREE.MathUtils.clamp( (cpCount) / (cpCount - nurbsDegree), 0, 1 ));

    const boxDim = Math.min(window.innerWidth, window.innerHeight) * cpRelativeSize;

    points.forEach(point => {
        const ptBox = new THREE.Mesh(
            new THREE.BoxGeometry(boxDim, boxDim, boxDim), 
            new THREE.MeshBasicMaterial({color: cpColor, side: THREE.DoubleSide})
        );
        ptBox.position.x = point.x;
        ptBox.position.y = point.y;
        ptBox.position.z = -5;
        ptBox.selectable = true;
        selectable.push(ptBox);
        cpGroup.add(ptBox);
    });

    cpGroup.userData = {
        knots: knots,
        cpCount: cpCount,
        nurbsDegree: nurbsDegree
    };
    
    return cpGroup;
}

/**
 * Function to either add/update geometry or material of a curve.
 * @param {*} param0 Either curve or control point group should be given.
 * @returns THREE.Line object of added/updated curve.
 */
function updateCurve({curve = null, cpGroup = null, color = null}) {
    if (curve == null && cpGroup == null) {
        console.error("Either curve or cpGroup should be defined");
        return;
    }
    
    // variables for constructing a curve
    let points = [];
    let updateGeometry = curve ? false : true;
    let updateMaterial = curve ? false : true;
    let nurbsLine = curve ? curve : new THREE.Line(new THREE.BufferGeometry());
    let nurbsGeometry;
    let nurbsCurve;
    let cpLine = curve ? curve.userData.cpLine : new THREE.Line();
    let curveColor = curve ? curve.material.color.getHex() : Math.random() * 0xffffff;

    nurbsLine.selectable = true;
    cpLine.selectable = false;
    
    if (cpGroup) {
        cpGroup.children.forEach(point => {
            const pt = new THREE.Vector3().copy(point.position).setComponent(2, 0);
            points.push(pt);
        });
        const knots = cpGroup.userData.knots;
        const nurbsDegree = cpGroup.userData.nurbsDegree;
        nurbsCurve = new NURBSCurve(nurbsDegree, knots, points);
        nurbsGeometry = nurbsLine.geometry;
        nurbsGeometry.setFromPoints(nurbsCurve.getPoints(200));
        nurbsGeometry.userData = {
            curve: nurbsCurve
        };

        updateGeometry = true;
    }

    if (color && curveColor != color) {
        curveColor = color;
        updateMaterial = true;
    }
    
    if (updateGeometry) {
        nurbsLine.geometry = nurbsGeometry;
        nurbsLine.geometry.needsUpdate = true;
        cpLine.geometry.setFromPoints(points);
        cpLine.geometry.needsUpdate = true;
        nurbsLine.attach(cpGroup);
    }
    
    if (updateMaterial) {
        nurbsLine.material.color.set(curveColor);
        nurbsLine.material.needsUpdate = true;
        cpLine.material.color.set(curveColor);
        cpLine.material.opacity = 0.5;
        cpLine.material.transparent = true;
        cpLine.material.needsUpdate = true;
    }
    
    if (!curve) cpLines.add(cpLine);
    nurbsLine.userData = {
        cpLine: cpLine
    };
    curves.add(nurbsLine);
    selectable.push(nurbsLine);

    changed = true;
    return nurbsLine;
}

/**
 * A function to initialize grid of circles.
 */
function initCircles() {
    const circleGeo = new THREE.TorusGeometry(
        10, 
        Math.min(10, linewidth),
        2,
        circleSegmentCount
    );

    for (let row = 0; row < numRow; row++) {
        const rowGroup = new THREE.Group();
        for (let col = 0; col < numCol; col++) {
            const circle = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({color: 0xffffff}));
            circle.position.z = -col * 0.01;
            rowGroup.add(circle);
        }

        circles.add(rowGroup);
    }

    updateCirclesPosition();
    updateCircles();
}

/**
 * A function to update positions of circles with grid information stored in global variables.
 */
function updateCirclesPosition() {
    cellSize = Math.min(gridWidth / (numCol - 1), gridHeight / (numRow - 1));
    const paddingX = (width - cellSize * numCol) / 2 + cellSize / 2;
    const paddingY = (height - cellSize * numRow) / 2 + cellSize / 2;

    for (let row = 0; row < numRow; row++) {
        const rowGroup = circles.children[row];
        for (let col = 0; col < numCol; col++) {
            const circle = rowGroup.children[col];
            circle.position.x = paddingX + cellSize * col - width / 2;
            circle.position.y = paddingY + cellSize * row - height / 2;
        }

    }
}

/**
 * A function to update geometry/material of grid of circles.
 * @param {THREE.Line} affectingCurve The curved that has been updated. If not given, data of circles will be updated for all present curves.
 * @param {Boolean} remove Set to true if update on curves is removing a curve.
 */
function updateCircles(affectingCurve = null, remove = false) {
    let curveUUID = affectingCurve ? affectingCurve.uuid : null;
    console.log("provided with uuid=" + curveUUID + " to " + (remove ? "remove" : "add/update"));
    circles.children.forEach(row => {
        row.children.forEach(circle => {
            let r = 0, g = 0, b = 0;
            let minDistance = Infinity;
            if (remove) {
                if (curveUUID) {
                    delete circle.userData[curveUUID];
                } else {
                    console.error("Must provide valid UUID if removing a curve");
                }
            }

            curves.children.forEach(curve => {
                let distance = minDistance;
                if (!curveUUID || curve.uuid == curveUUID || !(curveUUID in circle.userData)) {
                    const circleCenter = new THREE.Vector3().copy(circle.position).setComponent(2, 0);
                    distance = circleCenter.distanceTo(curveClosestPoint(circleCenter, curve, tolerance));
                    circle.userData[curve.uuid] = distance;
                } else {
                    distance = circle.userData[curve.uuid];
                }
                minDistance = Math.min(distance, minDistance);
                let factor = 1 - distance / Math.min(width, height);
                r= Math.max(r, factor * curve.material.color.r);
                g= Math.max(g, factor * curve.material.color.g);
                b= Math.max(b, factor * curve.material.color.b);
            });
            
            let max = Math.max(r, g, b);
            let min = Math.min(r, g, b);
            let colorHex = {
                r: Math.round((r - min) / (max - min) * 0xff),
                g: Math.round((g - min) / (max - min) * 0xff),
                b: Math.round((b - min) / (max - min) * 0xff),
                fullHex: function() {
                    return this.r * 0x010000 + this.g * 0x000100 + this.b;
                }
            };
            let circleColor = colorHex.fullHex();
            if (!isFinite(minDistance) || isNaN(minDistance)) {
                minDistance = 10;
                circleColor = 0xaaaaaa;
            }
            const circleGeo = new THREE.TorusGeometry(
                minDistance, 
                Math.min(minDistance, linewidth),
                2,
                circleSegmentCount
            );

            circle.geometry.dispose();
            circle.geometry = circleGeo;
            circle.material.color.set(circleColor).offsetHSL(0, -0.3, 0);
        });
    });

    changed = false;
}

/**
 * A function to update screen size and grid size.
 * @param {number} newWidth 
 * @param {number} newHeight 
 * @param {number} newGridWidth 
 * @param {number} newGridHeight 
 */
function updateDimensions(newWidth, newHeight, newGridWidth, newGridHeight) {
    width = newWidth;
    height = newHeight;
    gridWidth = newGridWidth;
    gridHeight = newGridHeight;

    if (camera) {
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();

        curves.scale.set(1 / ratio, 1/ ratio, 1);
        cpLines.scale.set(1 / ratio, 1 / ratio, 1);
        circles.scale.set(1 / ratio, 1 / ratio, 1);
        ratio = width / fWidth > height / fHeight ? height / fHeight : width / fWidth;
        curves.scale.set(ratio, ratio, 1);
        cpLines.scale.set(ratio, ratio, 1);
        circles.scale.set(ratio, ratio, 1);

        if (circles.visible) updateCircles();
    } else {
        camera = new THREE.OrthographicCamera( -width / 2, width / 2, height / 2, -height / 2, -100, 100); // origin at lower left corner
        camera.position.z = 10;
        camera.position.x = 0;
        camera.position.y = 0;
        scene.add(camera);
    }
}

function onPointerDown(event) {
    const tagName = event.srcElement.tagName;
    console.log(tagName);
    colorPicker = tagName === "INPUT" || tagName === "DIV" || tagName === "LABEL" ? true : false;
}

function onPointerUp(event) {
    pointer.x = (event.clientX / width) * 2 - 1;
    pointer.y = -(event.clientY / height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const intersections = raycaster.intersectObjects(selectable, true);

    if (intersections.length > 0) {
        const object = intersections[0].object;
        if (object.isLine) {
            selectedCurve = object;
        } else if (object.isMesh) {
            selectedCurve = object.parent.parent;
        }
        curveColorButton.enable().setValue(selectedCurve.material.color.getHex());
    } else if (!colorPicker) {
        selectedCurve = null;
        curveColorButton.disable();
    }
}

function onWindowResize() {

    updateDimensions(window.innerWidth, window.innerHeight, window.innerWidth / 2, window.innerHeight / 2);
    renderer.setSize( window.innerWidth, window.innerHeight );
    
    render();
}

function onDragStart(event) {
    if (event.object.isLine) {
        const cpLine = event.object.userData.cpLine;
        event.object.attach(cpLine);
        if (circles.visible) updateCircles(event.object);
    }
    
    if (event.object.isMesh) {
        const curve = event.object.parent.parent;
        const cpGroup = event.object.parent;
        const index = cpGroup.children.indexOf(event.object);
        cpGroup.children[index].position.copy(event.object.position);
        updateCurve({curve: curve, cpGroup: cpGroup});
        if (circles.visible) updateCircles(curve);
    }

    render();
}

function onDrag(event) {
    if (event.object.isLine) {
        if (circles.visible) updateCircles(event.object);
    }

    if (event.object.isMesh) {
        const curve = event.object.parent.parent;
        const cpGroup = event.object.parent;
        const index = cpGroup.children.indexOf(event.object);
        cpGroup.children[index].position.copy(event.object.position);
        updateCurve({curve: curve, cpGroup: cpGroup});
        if (circles.visible) updateCircles(curve);
    }
    render();
}

function onDragEnd(event) {
    if (event.object.isLine) {
        const cpLine = event.object.userData.cpLine;
        event.object.remove(cpLine);
        cpLine.position.copy(event.object.position);
        cpLines.add(cpLine);
        if (circles.visible) updateCircles(event.object);
    }

    if (event.object.isMesh) {
        const curve = event.object.parent.parent;
        const cpGroup = event.object.parent;
        const index = cpGroup.children.indexOf(event.object);
        cpGroup.children[index].position.copy(event.object.position);
        updateCurve({curve: curve, cpGroup: cpGroup});
        if (circles.visible) updateCircles(curve);
    }
    render();
}

function onHoverOn(event) {
    if (event.object.isMesh) {
        event.object.material.color.set(0xffff00);
    }
    render();
}

function onHoverOff(event) {
    if (event.object.isMesh) event.object.material.color.set(0xffffff);
    render();
}

function render() {
    renderer.render( scene, camera );
}

init();
render();