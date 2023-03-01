import * as THREE from 'three';

import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import { TorusGeometry } from 'three';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let curveNum = 3;

let camera, scene, renderer;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let points = [], knots = [];
let curves = [];
let curvesDisplayed = new THREE.Group();
let curveCP = new THREE.Group();
let curveCPLines = new THREE.Group();
let circles = new THREE.Group();

const maxDegree = 5;
let nurbsDegree = 3;
const maxCPNum = 8;
let controlPtNum = 4;
const cpColor = 0xffffff;
let tolerance = 0.001;
let gridSizeFactor = 50;
const maxCircleSegment = 200;
let circleSegmentCount = 32;

let selectedCurve = -1;
let selectedCurveColor = 0xffffff;

const maxLinewidth = 50;
let linewidth = 5;
let gridSize;

let removeCurveButton;
let curveColorButton;

let width, height, longerDim;

function init() {
    width = window.innerWidth;
    height = window.innerHeight;
    longerDim = Math.max(width, height);
    gridSize = longerDim / gridSizeFactor;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera( width / -2, width / 2, height / 2, height / -2, 1, 1000);
    camera.position.z = 10;
    camera.position.x = width / 2;
    camera.position.y = height / 2;
    scene.add(camera);

    scene.add(circles);
    scene.add(curvesDisplayed);
    scene.add(curveCP);
    scene.add(curveCPLines);
    
    curvesDisplayed.visible = false;
    curveCP.visible = false;
    curveCPLines.visible = false;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    document.body.appendChild(renderer.domElement);

    for (let i = 0; i < curveNum; i++) {
        drawCurve(i);
    }
    drawGridCircles();
    buildGUI();

    window.addEventListener( 'resize', onWindowResize );
    document.addEventListener('pointermove', onPointerMove);
}

// Randomized points as control points of curves
function populatePoints(idx) {
    points[idx] = [];
    knots[idx] = [];

    for (let i = 0; i <= nurbsDegree; i++) {
        knots[idx].push(0);
    }

    // points[i].push(pointOutsideRect(0, 0, width, height, width / 4, height / 4, width / 2, height / 2));
    points[idx].push(pointOutsideRect(
        window.innerWidth / 2 - width, 
        window.innerHeight / 2 - height, 
        width * 2, height * 2, 
        window.innerWidth / 2 - width / 2, 
        window.innerHeight / 2 - height / 2, 
        width, 
        height
    ));
    knots[idx].push(THREE.MathUtils.clamp( (0 + 1) / (controlPtNum - nurbsDegree), 0, 1 ));
    for (let i = 1; i < controlPtNum - 1; i++) {
        points[idx].push(
            new THREE.Vector4(
                Math.random() * width + window.innerWidth / 2 - width / 2,
                Math.random() * height + window.innerHeight / 2 - height / 2,
                0,
                1
            )
        );
        knots[idx].push(THREE.MathUtils.clamp( (i + 1) / (controlPtNum - nurbsDegree), 0, 1 ));
    }
    // points[i].push(pointOutsideRect(0, 0, width, height, width / 4, height / 4, width / 2, height / 2));
    points[idx].push(pointOutsideRect(width / -2, height / -2, width * 2, height * 2, 0, 0, width, height));
    knots[idx].push(THREE.MathUtils.clamp( (controlPtNum) / (controlPtNum - nurbsDegree), 0, 1 ));

    
    for (const point of points[idx]) {
        const boxDim = Math.min(window.innerWidth, window.innerHeight) / 40;
        const boxGeo = new THREE.BoxGeometry(boxDim, boxDim, boxDim);
        const boxMat = new THREE.MeshBasicMaterial({color: cpColor, side: THREE.DoubleSide});
        
        const ptBox = new THREE.Mesh(boxGeo, boxMat);
        ptBox.position.x = point.x;
        ptBox.position.y = point.y;
        curveCP.add(ptBox);
    }
}

// To make sure both ends of a curve are outside the screen
function pointOutsideRect(xRect1, yRect1, width, height, xRect2, yRect2, rectWidth, rectHeight) {
    let x = 0, y = 0;
    
    do {
        x = Math.random() * width + xRect1;
        y = Math.random() * height + yRect1;
    } while (x >= xRect2 && x < xRect2 + rectWidth && y >= yRect2 && y < yRect2 + rectHeight);
    return new THREE.Vector4(x, y, 0, 1);
}

function drawCurve(idx) {
    populatePoints(idx);

    // Generate random color
    let curveColor = Math.round(Math.random() * 0xffffff);

    const nurbsCurve = new NURBSCurve(Math.round(nurbsDegree), knots[idx], points[idx]);
    const nurbsGeometry = new THREE.BufferGeometry();
    nurbsGeometry.setFromPoints(nurbsCurve.getPoints(200));

    const nurbsMaterial = new THREE.LineBasicMaterial( { color: curveColor } );
    const nurbsLine = new THREE.Line( nurbsGeometry, nurbsMaterial );

    curves[idx] = nurbsCurve;
    curvesDisplayed.add(nurbsLine);

    const nurbsControlPointsGeometry = new THREE.BufferGeometry();
    nurbsControlPointsGeometry.setFromPoints( nurbsCurve.controlPoints );

    const nurbsControlPointsMaterial = new THREE.LineBasicMaterial( { color: curveColor, opacity: 0.25, transparent: true } );

    const nurbsControlPointsLine = new THREE.Line( nurbsControlPointsGeometry, nurbsControlPointsMaterial );
    curveCPLines.add( nurbsControlPointsLine );
}

// Draw circles with centers on grid points
function drawGridCircles() {
    for (let x = window.innerWidth / 2 - width / 2; x <= window.innerWidth / 2 + width / 2; x+= gridSize) {
        for (let y = window.innerHeight / 2 - height / 2; y <= window.innerHeight / 2 + height / 2; y+= gridSize) {
            const current = new THREE.Vector3(x, y, 0);
            let distances = [];
            let minDistance = Infinity;
            let r = 0, g = 0, b = 0;

            for (const curve of curves) {
                minDistance = Infinity;
                for (let param = 0; param <= 1; param+= tolerance) {
                    const pt = curve.getPointAt(param);
                    const distance = current.distanceTo(pt);

                    minDistance = Math.min(distance, minDistance);
                }
                distances.push(minDistance);
            }

            // Circle radius to closest curve
            for (const distance of distances) {
                minDistance = Math.min(distance, minDistance);
            }
            const radius = isFinite(minDistance) ? minDistance : 3;
            
            // Circle geometry with circumference points
            // const circlePts = [];
            // for (let i = 0; i <= circleSegmentCount; i++) {
            //     let theta = (i / circleSegmentCount) * Math.PI * 2;
            //     circlePts.push(
            //         new THREE.Vector3(
            //             Math.cos(theta) * radius,
            //             Math.sin(theta) * radius,
            //             0
            //         )
            //     );
            // }
            // const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePts);

            // Circle with lineweight using TorusGeometry
            const circleGeo = new THREE.TorusGeometry(
                radius, 
                Math.min(radius, linewidth),
                2,
                circleSegmentCount
            );

            // Decide color by proximity to curves
            // Circles closer to curves show similar colors
            for (let i = 0; i < curves.length; i++) {
                r = Math.max(r, (1 - distances[i] / longerDim) * curvesDisplayed.children[i].material.color.r);
                g = Math.max(g, (1 - distances[i] / longerDim) * curvesDisplayed.children[i].material.color.g);
                b = Math.max(b, (1 - distances[i] / longerDim) * curvesDisplayed.children[i].material.color.b);
            }
            
            const matColor = Math.round(r * 0xff) * 0x010000 + Math.round(g * 0xff) * 0x000100 + Math.round(b * 0xff) * 0x000001;
            // const circleMat = new THREE.LineBasicMaterial({color: matColor, linewidth: linewidth});
            const circleMat = new THREE.MeshBasicMaterial({color: matColor});
            // const circle = new THREE.LineLoop(circleGeo, circleMat);
            const circle = new THREE.Mesh(circleGeo, circleMat);
            circle.position.x = x;
            circle.position.y = y;

            circles.add(circle);
        }
    }
}

function addCurve() {
    drawCurve(curveNum++);
    // render();
}

function removeCurve() {

}

function buildGUI() {
    const gui = new GUI();

    const generalFolder = gui.addFolder('General');
    const curvesFolder = gui.addFolder('Curves');
    const circlesFolder = gui.addFolder('Circles');

    const params = {
        general: {
            width: width,
            height: height,
        },

        curves: {
            visible: curvesDisplayed.visible,
            controlPoints: curveCP.visible,
            cpLines: curveCPLines.visible,
            tolerance: tolerance,
            nurbsDegree: nurbsDegree,
            cpNum: controlPtNum,
            addCurve: addCurve,
            removeCurve: removeCurve,
            curveColor: selectedCurveColor
        },

        circles: {
            visible: circles.visible,
            gridSize: gridSize,
            linewidth: linewidth,
            segments: circleSegmentCount,
        }
    };

    generalFolder.add(params.general, 'width', 0, window.innerWidth).onChange(w => {
        width = w;
        longerDim = Math.max(width, height);
    });
    generalFolder.add(params.general, 'height', 0, window.innerHeight).onChange(h => {
        height = h;
        longerDim = Math.max(width, height);
    });
    generalFolder.open();

    curvesFolder.add(params.curves, 'visible').onChange(v => {
        curvesDisplayed.visible = v;
        // render();
    });
    curvesFolder.add(params.curves, 'controlPoints').onChange(v => {
        curveCP.visible = v;
        // render();
    });
    curvesFolder.add(params.curves, 'cpLines').onChange(v => {
        curveCPLines.visible = v;
        // render();
    });
    curvesFolder.add(params.curves, 'tolerance', 0.00001, 1).onChange(t => {
        tolerance = t;
        // render();
    });

    curvesFolder.add(params.curves, 'nurbsDegree', 1, maxDegree, 1).onChange(d => nurbsDegree = d);
    curvesFolder.add(params.curves, 'cpNum', nurbsDegree + 1, maxCPNum).onChange(n => cpNum = n);
    curvesFolder.add(params.curves, 'addCurve');
    removeCurveButton = curvesFolder.add(params.curves, 'removeCurve').disable();
    curveColorButton = curvesFolder.addColor(params.curves, 'curveColor').disable();
    curvesFolder.open();

    circlesFolder.add(params.circles, 'visible').onChange(v => {
        circles.visible = v;
        // render();
    });
    circlesFolder.add(params.circles, 'gridSize', 1, longerDim, 1).onChange();
    circlesFolder.add(params.circles, 'linewidth', 1, maxLinewidth).onChange(w => linewidth = w);
    circlesFolder.add(params.circles, 'segments', 3, maxCircleSegment, 1).onChange(c => circleSegmentCount = c);
    circlesFolder.open();

    gui.open();
}

function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    removeCurveButton.enable();
    curveColorButton.enable();

    const intersects = raycaster.intersectObjects(curvesDisplayed.children, false);
    const intersects2 = raycaster.intersectObjects(curveCP.children, false);

    for (const curve of curvesDisplayed.children) {
        curve.material.r = 1;
    }

    if (intersects.length > 0) {
        intersects[0].object.material.color.setHex(0x00ffff);
    }

    if (intersects2.length > 0) {
        console.log(intersects2);
        intersects2[0].object.material.color.setHex(0x00ffff);
    }
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {
    requestAnimationFrame( animate );

    renderer.render( scene, camera );
}

function render() {
    renderer.render(scene, camera);
}

init();
// render();
animate();