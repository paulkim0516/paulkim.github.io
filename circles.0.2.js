import * as THREE from 'three';
import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let width, height;

let camera, scene, renderer;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let grid = new THREE.Group();
let curves = new THREE.Group();
let controlPoints = new THREE.Group();
let cpLines = new THREE.Group();
let circles = new THREE.Group();

let nurbsDegree = 3;
let cpCount = 4;
let cpColor = 0xffffff;

let circleSegmentCount = 32;
let linewidth = 3;

let numRow = 15;
let numCol = 30;
let gridWidth, gridHeight, cellSize;

const defaultCurveCount = 3;
const cpRelativeSize = 0.02;

const tolerance = 0.001;

function init() {
    width = window.innerWidth;
    height = window.innerHeight;

    gridWidth = width / 2;
    gridHeight = height / 2;
    
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera( 0, width, height, 0, 1, 1000); // origin at lower left corner
    camera.position.z = 10;
    camera.position.x = 0;
    camera.position.y = 0;
    scene.add(camera);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    document.body.appendChild(renderer.domElement);

    initCurves();
    initCircles();

    updateCurves();
    updateCircles();
    
    // buildGUI();

    scene.add(grid);
    scene.add(curves, controlPoints, cpLines);
    scene.add(circles);

    grid.visible = true;
    curves.visible = true;
    controlPoints.visible = true;
    cpLines.visible = true;
    circles.visible = true;
    
    window.addEventListener( 'resize', onWindowResize );
    // document.addEventListener('pointermove', onPointerMove);
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
 * @param {THREE.Curve} curve — Curve to project onto
 * @param {number} tolerance — Level of sampling on curve.
 * @returns {THREE.Vector3} The closest point on the given curve.
 */
function curveClosestPoint(point, curve, tolerance) {
    let minDistance = Infinity;
    let t = 0;
    console.log(curve);

    for (let param = 0; param <= 1; param+= tolerance) {
        let dist = point.distanceTo(curve.getPointAt(param));
        if (dist < minDistance) {
            minDistance = dist;
            t = param;
        }
    }

    return curve.getPointAt(t);
}

function initCurves() {
    for (let i = 0; i < defaultCurveCount; i++) {
        populateCP();
    }
}

function populateCP() {
    const cpGroup = new THREE.Group();
    let points = [];
    let knots = [];

    for (let i = 0; i <= nurbsDegree; i++) {
        knots.push(0);
    }

    points.push(pointOutsideRect(
        0, 
        0, 
        width,
        height,
        (width - gridWidth) / 2,
        (height - gridHeight) / 2,
        gridWidth,
        gridHeight));
    knots.push(THREE.MathUtils.clamp( (0 + 1) / (cpCount - nurbsDegree), 0, 1 ));

    for (let i = 1; i < cpCount - 1; i++) {
        points.push(
            new THREE.Vector4(
                Math.random() * gridWidth + (width - gridWidth) / 2,
                Math.random() * gridHeight + (height - gridHeight) / 2,
                0,
                1
            )
        );
        knots.push(THREE.MathUtils.clamp( (i + 1) / (cpCount - nurbsDegree), 0, 1 ));
    }

    points.push(pointOutsideRect(
        0, 
        0, 
        width,
        height,
        (width - gridWidth) / 2,
        (height - gridHeight) / 2,
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

        cpGroup.add(ptBox);
    });

    cpGroup.userData = {
        points: points,
        knots: knots,
        cpCount: cpCount,
        nurbsDegree: nurbsDegree
    };
    
    controlPoints.add(cpGroup);
}

function updateCurves() {
    for (let i = 0; i < controlPoints.children.length; i++) {
        updateCurve(i);
        console.log("dd");
    }
    console.log(curves);
}

/**
 * Update the curve with given index.
 * @param {number} index 
 */
function updateCurve(index) {
    let curveColor = Math.random() * 0xffffff;

    const points = controlPoints.children[index].userData.points;
    const knots = controlPoints.children[index].userData.knots;
    const nurbsDegree = controlPoints.children[index].userData.nurbsDegree;
    console.log(controlPoints.children[index]);

    const nurbsCurve = new NURBSCurve(nurbsDegree, knots, points);
    const nurbsGeometry = new THREE.BufferGeometry();
    nurbsGeometry.setFromPoints(nurbsCurve.getPoints(200));
    nurbsGeometry.userData = {
        curve: nurbsCurve
    };

    const nurbsMaterial = new THREE.LineBasicMaterial( { color: curveColor } );
    const nurbsLine = new THREE.Line( nurbsGeometry, nurbsMaterial );

    // curves[idx] = nurbsCurve;
    curves.add(nurbsLine);

    const nurbsControlPointsGeometry = new THREE.BufferGeometry();
    nurbsControlPointsGeometry.setFromPoints(points);

    const nurbsControlPointsMaterial = new THREE.LineBasicMaterial( { color: curveColor, opacity: 0.25, transparent: true } );

    const nurbsControlPointsLine = new THREE.Line( nurbsControlPointsGeometry, nurbsControlPointsMaterial );
    cpLines.add( nurbsControlPointsLine );
}

function initCircles() {
    cellSize = Math.min(gridWidth / (numCol - 1), gridHeight / (numRow - 1));

    const circleGeo = new THREE.TorusGeometry(
        10, 
        Math.min(10, linewidth),
        2,
        circleSegmentCount
    );
    const circleMat = new THREE.MeshBasicMaterial({color: 0xffffff});
    
    const paddingX = (width - cellSize * numCol) / 2;
    const paddingY = (height - cellSize * numRow) / 2;

    for (let row = 0; row < numRow; row++) {
        const rowGroup = new THREE.Group();
        for (let col = 0; col < numCol; col++) {
            const circle = new THREE.Mesh(circleGeo, circleMat);
            circle.position.x = paddingX + cellSize * col;
            circle.position.y = paddingY + cellSize * row;
            rowGroup.add(circle);
        }

        circles.add(rowGroup);
    }
}

function updateCircles() {
    circles.children.forEach(row => {
        row.children.forEach(circle => {
            let r = 0, g = 0, b = 0;
            let minDistance = Infinity;
            for (let i = 0; i < curves.children.length; i++) {
                let distance = circle.position.distanceTo(curveClosestPoint(circle.position, curves.children[i].geometry.userData.curve, tolerance));
                minDistance = Math.min(distance, minDistance);
                let factor = 1 - distance / Math.max(width, height);
                r+= factor * curves.children[i].material.color.r;
                g+= factor * curves.children[i].material.color.g;
                b+= factor * curves.children[i].material.color.b;
            }

            let max = Math.max(r, g, b);
            let circleColor = Math.round(r / max * 0xff) * 0x010000 + Math.round(g / max * 0xff) * 0x000100 + Math.round(b / max * 0xff) * 0x000001;
            const circleMat = new THREE.MeshBasicMaterial({color: circleColor});
            const circleGeo = new THREE.TorusGeometry(
                minDistance, 
                Math.min(minDistance, linewidth),
                2,
                circleSegmentCount
            );

            circle.geometry.dispose();
            circle.geometry = circleGeo;
            circle.material.dispose();
            circle.material = circleMat;
        });
    });
}

// function buildGUI() {
//     const gui = new GUI();

//     const generalFolder = gui.addFolder('General');
//     const curvesFolder = gui.addFolder('Curves');
//     const circlesFolder = gui.addFolder('Circles');

//     const params = {
//         general: {
//             width: width,
//             height: height,
//         },

//         curves: {
//             visible: curves.visible,
//             controlPoints: controlPoints.visible,
//             cpLines: cpLines.visible,
//             tolerance: tolerance,
//             nurbsDegree: nurbsDegree,
//             cpNum: controlPtNum,
//             addCurve: addCurve,
//             removeCurve: removeCurve,
//             curveColor: selectedCurveColor
//         },

//         circles: {
//             visible: circles.visible,
//             gridSize: gridSize,
//             linewidth: linewidth,
//             segments: circleSegmentCount,
//         }
//     };

//     generalFolder.add(params.general, 'width', 0, window.innerWidth).onChange(w => {
//         width = w;
//         longerDim = Math.max(width, height);
//     });
//     generalFolder.add(params.general, 'height', 0, window.innerHeight).onChange(h => {
//         height = h;
//         longerDim = Math.max(width, height);
//     });
//     generalFolder.open();

//     curvesFolder.add(params.curves, 'visible').onChange(v => {
//         curvesDisplayed.visible = v;
//         // render();
//     });
//     curvesFolder.add(params.curves, 'controlPoints').onChange(v => {
//         curveCP.visible = v;
//         // render();
//     });
//     curvesFolder.add(params.curves, 'cpLines').onChange(v => {
//         curveCPLines.visible = v;
//         // render();
//     });
//     curvesFolder.add(params.curves, 'tolerance', 0.00001, 1).onChange(t => {
//         tolerance = t;
//         // render();
//     });

//     curvesFolder.add(params.curves, 'nurbsDegree', 1, maxDegree, 1).onChange(d => nurbsDegree = d);
//     curvesFolder.add(params.curves, 'cpNum', nurbsDegree + 1, maxCPNum).onChange(n => cpNum = n);
//     curvesFolder.add(params.curves, 'addCurve');
//     removeCurveButton = curvesFolder.add(params.curves, 'removeCurve').disable();
//     curveColorButton = curvesFolder.addColor(params.curves, 'curveColor').disable();
//     curvesFolder.open();

//     circlesFolder.add(params.circles, 'visible').onChange(v => {
//         circles.visible = v;
//         // render();
//     });
//     circlesFolder.add(params.circles, 'gridSize', 1, longerDim, 1).onChange();
//     circlesFolder.add(params.circles, 'linewidth', 1, maxLinewidth).onChange(w => linewidth = w);
//     circlesFolder.add(params.circles, 'segments', 3, maxCircleSegment, 1).onChange(c => circleSegmentCount = c);
//     circlesFolder.open();

//     gui.open();
// }


function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    width = window.innerWidth;
    height = window.innerHeight;

    renderer.setSize( window.innerWidth, window.innerHeight );

    //update everything
}

function animate() {
    requestAnimationFrame( animate );

    renderer.render( scene, camera );
}

init();
animate();