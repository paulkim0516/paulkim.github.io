import * as THREE from 'three';

import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const curveNum = 3;
const controlPtNum = 4;
const nurbsDegree = 3;
const tolerance = 0.001;
const gridSizeFactor = 30;
const circleSegmentCount = 32;

const colors = {
    0: 0xff0000,
    1: 0x00ff00,
    2: 0x0000ff
};

let camera, scene, renderer;
let points = new Array(curveNum), knots = new Array(curveNum);
let curves = [];
let curveCPLines = [];
let circles = new THREE.Group();
let gridSize;

let width, height;

function init() {
    width = window.innerWidth;
    height = window.innerHeight;
    gridSize = width > height ? width / gridSizeFactor : height / gridSizeFactor;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera( width / -2, width / 2, height / 2, height / -2, 1, 1000);
    camera.position.z = 10;
    camera.position.x = width / 2;
    camera.position.y = height / 2;
    scene.add(camera);

    scene.add(circles);

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    document.body.appendChild(renderer.domElement);

    populatePoints();
    drawCurves();
    drawGridCircles();

};

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
};

function pointOutsideRect(xRect1, yRect1, width, height, xRect2, yRect2, rectWidth, rectHeight) {
    let x = 0, y = 0;
    
    do {
        x = Math.random() * width + xRect1;
        y = Math.random() * height + yRect1;
    } while (x >= xRect2 && x < xRect2 + rectWidth && y >= yRect2 && y < yRect2 + rectHeight);
    return new THREE.Vector4(x, y, 0, 1);
};

function drawCurves() {
    for (let i = 0; i < curveNum; i++) {
        const nurbsCurve = new NURBSCurve(nurbsDegree, knots[i], points[i]);
        const nurbsGeometry = new THREE.BufferGeometry();
        nurbsGeometry.setFromPoints(nurbsCurve.getPoints(200));

        const nurbsMaterial = new THREE.LineBasicMaterial( { color: colors[i] } );
        const nurbsLine = new THREE.Line( nurbsGeometry, nurbsMaterial );

        console.log(nurbsCurve.getPoint(1));
        curves.push(nurbsCurve);
        scene.add(nurbsLine);

        const nurbsControlPointsGeometry = new THREE.BufferGeometry();
        nurbsControlPointsGeometry.setFromPoints( nurbsCurve.controlPoints );

        const nurbsControlPointsMaterial = new THREE.LineBasicMaterial( { color: colors[i], opacity: 0.25, transparent: true } );

        const nurbsControlPointsLine = new THREE.Line( nurbsControlPointsGeometry, nurbsControlPointsMaterial );
        curveCPLines.push( nurbsControlPointsLine );
        scene.add(nurbsControlPointsLine);
    }
};

function drawGridCircles() {
    for (let x = gridSize / 2; x <= width; x+= gridSize) {
        for (let y = gridSize / 2; y <= height; y+= gridSize) {
            const current = new THREE.Vector3(x, y, 0);

            let r = Infinity;
            let minPointR = new THREE.Vector3();
            for (let param = tolerance; param <= 1; param+= tolerance) {
                const pt = curves[0].getPointAt(param);
                const distance = current.distanceTo(pt);
                if (distance < r) {
                    r = distance;
                    minPointR = pt;
                }
            }

            let g = Infinity;
            let minPointG = new THREE.Vector3();
            for (let param = 0; param <= 1; param+= tolerance) {
                const pt = curves[1].getPointAt(param);
                const distance = current.distanceTo(pt);
                if (distance < g) {
                    g = distance;
                    minPointG = pt;
                }
            }

            let b = Infinity;
            let minPointB = new THREE.Vector3();
            for (let param = 0; param <= 1; param+= tolerance) {
                const pt = curves[2].getPointAt(param);
                const distance = current.distanceTo(pt);
                if (distance < b) {
                    b = distance;
                    minPointB = pt;
                }
            }

            const radius = Math.min(r, g, b);

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
                
            const circleMat = new THREE.LineBasicMaterial();
            circleMat.color.setRGB(1 - r / width, 1 - g / width, 1 - b / width);
            
            const circle = new THREE.LineLoop(circleGeo, circleMat);
            circle.position.x = x;
            circle.position.y = y;

            console.log(circle);
            circles.add(circle);
        }
    }
};

function animate() {
    requestAnimationFrame( animate );

    renderer.render( scene, camera );
};

init();
animate();