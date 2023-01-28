import * as THREE from 'three';

import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const curveNum = 3;
const controlPtNum = 4;
const nurbsDegree = 3;
const tolerance = 0.001;
const gridSizeFactor = 50;
const circleSegmentCount = 32;

const linewidth = 5;

let colors = [
    0xff4400,
    0x00ffc1,
    0x3f21ff
];
    

let camera, scene, renderer;
let points = new Array(curveNum), knots = new Array(curveNum);
let curves = [];
let curveColors = [];
let curvesDisplayed = new THREE.Group();
let curveCPLines = new THREE.Group();
let circles = new THREE.Group();
let gridSize;

let gui;

let width, height, longerDim;

function init() {
    width = window.innerWidth;
    height = window.innerHeight;
    longerDim = width > height ? width : height;
    gridSize = longerDim / gridSizeFactor;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera( width / -2, width / 2, height / 2, height / -2, 1, 1000);
    camera.position.z = 10;
    camera.position.x = width / 2;
    camera.position.y = height / 2;
    scene.add(camera);

    scene.add(circles);
    scene.add(curvesDisplayed);
    scene.add(curveCPLines);
    
    curvesDisplayed.visible = false;
    curveCPLines.visible = false;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    document.body.appendChild(renderer.domElement);

    //randomizeColors();
    
    drawCurves();
    drawGridCircles();
    buildGUI();

    window.addEventListener( 'resize', onWindowResize );

}

// Generate randomized colors as preset
function randomizeColors() {
    for (let i = 0; i < colors.length; i++) {
        colors[i] = Math.round(Math.random() * 0xffffff);
    }
}

// Randomized points as control points of curves
function populatePoints() {
    for (let i = 0; i < curveNum; i++) {
        points[i] = [];
        knots[i] = [];

        for (let j = 0; j <= nurbsDegree; j++) {
            knots[i].push(0);
        }

        // points[i].push(pointOutsideRect(0, 0, width, height, width / 4, height / 4, width / 2, height / 2));
        points[i].push(pointOutsideRect(width / -2, height / -2, width * 2, height * 2, 0, 0, width, height));
        knots[i].push(THREE.MathUtils.clamp( (0 + 1) / (controlPtNum - nurbsDegree), 0, 1 ));
        for (let j = 1; j < controlPtNum - 1; j++) {
            points[i].push(
                new THREE.Vector4(
                    Math.random() * width / 2 + width / 4,
                    Math.random() * height / 2 + height / 4,
                    0,
                    1
                )
            );
            knots[i].push(THREE.MathUtils.clamp( (j + 1) / (controlPtNum - nurbsDegree), 0, 1 ));
        }
        // points[i].push(pointOutsideRect(0, 0, width, height, width / 4, height / 4, width / 2, height / 2));
        points[i].push(pointOutsideRect(width / -2, height / -2, width * 2, height * 2, 0, 0, width, height));
        knots[i].push(THREE.MathUtils.clamp( (controlPtNum) / (controlPtNum - nurbsDegree), 0, 1 ));
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

function drawCurves() {
    populatePoints();
    for (let i = 0; i < curveNum; i++) {
        // Generate random color
        let curveColor = Math.round(Math.random() * 0xffffff);
        // Choose random color from preset;
        // let curveColor = pickRandomColor(colors);
        curveColors.push(curveColor);

        const nurbsCurve = new NURBSCurve(nurbsDegree, knots[i], points[i]);
        const nurbsGeometry = new THREE.BufferGeometry();
        nurbsGeometry.setFromPoints(nurbsCurve.getPoints(200));

        const nurbsMaterial = new THREE.LineBasicMaterial( { color: curveColor } );
        const nurbsLine = new THREE.Line( nurbsGeometry, nurbsMaterial );

        curves.push(nurbsCurve);
        curvesDisplayed.add(nurbsLine);

        const nurbsControlPointsGeometry = new THREE.BufferGeometry();
        nurbsControlPointsGeometry.setFromPoints( nurbsCurve.controlPoints );

        const nurbsControlPointsMaterial = new THREE.LineBasicMaterial( { color: curveColor, opacity: 0.25, transparent: true } );

        const nurbsControlPointsLine = new THREE.Line( nurbsControlPointsGeometry, nurbsControlPointsMaterial );
        curveCPLines.add( nurbsControlPointsLine );
    }
}

// Pick random color from array of preset colors
function pickRandomColor(givenColors) {
    let num = Math.random();
    for (let i = 0; i < givenColors.length; i++) {
        if (num < 1 / givenColors.length * (i + 1)) return givenColors[i];
    }
    
    return givenColors[givenColors.length - 1];
}

// Draw circles with centers on grid points
function drawGridCircles() {
    for (let x = gridSize / 2; x <= width; x+= gridSize) {
        for (let y = gridSize / 2; y <= height; y+= gridSize) {
            const current = new THREE.Vector3(x, y, 0);
            let distances = [];
            let minDistance = Infinity;
            let r = 0, g = 0, b = 0;

            for (let i = 0; i < curves.length; i++) {
                minDistance = Infinity;
                for (let param = tolerance; param <= 1; param+= tolerance) {
                    const pt = curves[i].getPointAt(param);
                    const distance = current.distanceTo(pt);

                    if (distance < minDistance) minDistance = distance;
                }
                distances.push(minDistance);
            }

            // Circle radius to closest curve
            for (let i = 0; i < curves.length; i++) {
                if (minDistance > distances[i]) minDistance = distances[i];
            }
            const radius = minDistance;
            
            // Circle geometry with circumference points
            const circlePts = [];
            for (let i = 0; i <= circleSegmentCount; i++) {
                let theta = (i / circleSegmentCount) * Math.PI * 2;
                circlePts.push(
                    new THREE.Vector3(
                        Math.cos(theta) * radius,
                        Math.sin(theta) * radius,
                        0
                    )
                );
            }
            const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
                
            // Decide color by proximity to curves
            // Circles closer to curves show similar colors
            for (let i = 0; i < curves.length; i++) {
                const tempR = (1 - distances[i] / longerDim) * curvesDisplayed.children[i].material.color.r;
                const tempG = (1 - distances[i] / longerDim) * curvesDisplayed.children[i].material.color.g;
                const tempB = (1 - distances[i] / longerDim) * curvesDisplayed.children[i].material.color.b;

                r = r > tempR ? r : tempR;
                g = g > tempG ? g : tempG;
                b = b > tempB ? b : tempB;
            }
            
            const matColor = Math.round(r * 0xff) * 0x010000 + Math.round(g * 0xff) * 0x000100 + Math.round(b * 0xff) * 0x000001;
            const circleMat = new THREE.LineBasicMaterial({color: matColor, linewidth: linewidth});
            
            const circle = new THREE.LineLoop(circleGeo, circleMat);
            circle.position.x = x;
            circle.position.y = y;

            circles.add(circle);
        }
    }
}

function buildGUI() {
    gui = new GUI();

    const params = {
        curves: curvesDisplayed.visible,
        curveCPLines: curveCPLines.visible,
        circles: circles.visible
    };

    gui.add(params, 'curves').onChange(function (val) {
        curvesDisplayed.visible = val;
    });

    gui.add(params, 'curveCPLines').onChange(function (val) {
        curveCPLines.visible = val;
    });

    gui.add(params, 'circles').onChange(function (val) {
        circles.visible = val;
    });    

    gui.open();
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

init();
animate();