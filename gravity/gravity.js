import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let camera, scene, renderer;
let raycaster;
let controls;
let gui;

const fov = 75;
const near = 0.1;
const far = 1000;

let spaceDim = 4;
let spaceMesh;

let spheres = new THREE.Group();
let sphereCount = 3;
let sphereRadius = 0.2;
let sphereMatDensity = 1;

const gravConstant = 10 ** -8;

let lastFrameTime = 0;

class CollidingSphere extends THREE.Mesh {
    constructor(geometry, material, position, velocity, density) {
        super(geometry, material);
        this.radius = geometry.parameters.radius;
        this.position = position;
        this.velocity = velocity;
        this.density = density
        this.mass = density * 4 / 3 * Math.PI * this.radius ** 3;
    }

    updatePosition(meshes, gravityPoints, deltaTime) {
        if (meshes.indexOf(this) > -1) {
            meshes.splice(meshes.indexOf(this), 1);
        }

        const oldVelocity = this.velocity.clone();
        this.updateVelocity(meshes, gravityPoints, deltaTime);

        this.position.add(this.velocity.clone().add(oldVelocity).multiplyScalar(deltaTime / 2));
    }

    updateVelocity(meshes, gravityPoints, deltaTime) {
        if (meshes.indexOf(this) > -1) {
            meshes.splice(meshes.indexOf(this), 1);
        }

        if (meshes.length != 0) {
            meshes.forEach(mesh => {
                const normal = this.checkCollision(mesh, deltaTime);
                if (normal) {
                    this.velocity.reflect(normal);
                }
            });
        }

        const acceleration = this.getAcceleration(gravityPoints);
        this.velocity.add(acceleration.multiplyScalar(deltaTime));
    }

    getAcceleration(meshes) {
        if (meshes.indexOf(this) > -1) {
            meshes.splice(meshes.indexOf(this), 1);
        }

        const netAcceleration = new THREE.Vector3();

        meshes.forEach(mesh => {
            const meshToThis = mesh.position.clone().sub(this.position);
            const distanceSq = meshToThis.lengthSq();
            const acceleration = meshToThis.normalize().multiplyScalar(gravConstant * mesh.mass / distanceSq);

            netAcceleration.add(acceleration);
        });

        return netAcceleration;
    }
    
    checkCollision(mesh, deltaTime) {
        const expectedVelocity = this.velocity.clone().multiplyScalar(deltaTime).sub(mesh.velocity.clone().multiplyScalar(deltaTime));
        if (mesh === this) {
            console.error("Unknown type of mesh");
            return null;
        }

        if (mesh instanceof CollidingSphere) {
            const distance = this.position.clone().add(expectedVelocity).distanceTo(mesh.position);
            if (distance < this.radius + mesh.radius) {
                return mesh.position.clone().sub(this.position).normalize();
            } else {
                return null;
            }
        } else if (mesh instanceof BoundingSpace) {
            //TODO
            if (true) {
                return new THREE.Vector3(1, 0, 0);
            } else {
                return null;
            }
        } else {
            console.error("Unknown type of mesh");
            return null;
        }
    }
}

//TODO
class BoundingSpace extends THREE.Mesh {
    constructor(geometry, material) {
        super(geometry, material);
        this.surfaces = [];
        const normal = geometry.attributes.normal;
        const position = geometry.attributes.position;
        for (let i = 0; i < normal.array.length; i += normal.itemSize) {
            let nVec = new THREE.Vector3(normal.array[i], normal.array[i+1], normal.array[i+2]);
            
        }
    }
}

//TODO
class GravityPoint extends THREE.Mesh {
    constructor(geometry, material, position) {
        super(geometry, material);
        this.position = position;
    }
}

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
    camera.position.z = 5;
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    raycaster = new THREE.Raycaster();

    initSpace();
    initSphere();
    lastFrameTime = performance.now();
}

function initSpace() {
    const spaceGeo = new THREE.BoxGeometry(spaceDim, spaceDim, spaceDim);
    const spaceMat = new THREE.MeshPhongMaterial({color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.5});
    spaceMat.color.set(Math.round(Math.random() * 0x79 + 0x80) * 0x010000 + Math.round(Math.random() * 0x79 + 0x80) * 0x000100 + Math.round(Math.random() * 0x79 + 0x80) * 0x000001);
    spaceMesh = new THREE.Mesh(spaceGeo, spaceMat);

    spaceMesh.receiveShadow = true;
    spaceMesh.material.shadowSide = THREE.DoubleSide;
    scene.add(spaceMesh);
}

function initSphere() {
    for (let i = 0; i < sphereCount; i++) {
        const sphereGeo = new THREE.SphereGeometry(sphereRadius, 128, 128);
        const sphereMat = new THREE.MeshPhongMaterial({color: Math.round(Math.random() * 0xf) * 0x111111});

        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.random().multiplyScalar(spaceDim / 2).sub(-spaceDim / 4, -spaceDim / 4, -spaceDim / 4);
        sphere.userData.velocity = new THREE.Vector3().random().multiplyScalar(0.0003);
        sphere.userData.mass = 4 / 3 * Math.PI * Math.pow(sphereRadius, 3);

        spheres.add(sphere);
    }
}

function animate(currentTime) {
    const delta = currentTime - lastFrameTime;

    spheres.children.forEach(sphere => {
        sphere.updatePosition(spheres.children);
    });

    lastFrameTime = currentTime;
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

init();
requestAnimationFrame(animate);



/*
let camera, scene, renderer;
let raycaster;
let controls;
let gui;
const fov = 75;
const near = 0.1;
const far = 1000;

const boxDim = 4;
const sphereRadius = 0.2;

let box, sphere, center;
let prevTime = 0;
let velocity = new THREE.Vector3(0.001, 0.002, 0.003);
// let velocity = new THREE.Vector3(0, 0.004, 0);

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
    camera.position.z = 5;
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    raycaster = new THREE.Raycaster();

    const pointLight = new THREE.PointLight(0xffffff, 1 , 10);
    pointLight.castShadow = true;
    scene.add(pointLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.01);
    // scene.add(ambient);
    setupGeometry();
    buildInfoMenu();
}

function buildInfoMenu() {
    gui = new GUI();
    const params = {
        gravity: center.visible,
        speed: Math.round(velocity.length),
        x: sphere.position.x,
        y: sphere.position.y,
        z: sphere.position.z
    };

    gui.add(params, 'gravity').onChange(v => {
        center.visible = v;
        // console.log(enableGravity);
        // animate();
    });
    gui.add(params, 'speed').disable();
    gui.add(params, 'x').disable();
    gui.add(params, 'y').disable();
    gui.add(params, 'z').disable();
}

function setupGeometry() {
    center = new THREE.Mesh(new THREE.SphereGeometry(0.05, 32, 32), new THREE.MeshPhongMaterial({color: 0x222222}));
    scene.add(center);
    console.log(center);
    box = new THREE.Mesh(new THREE.BoxGeometry(boxDim, boxDim, boxDim), new THREE.MeshPhongMaterial({color: 0xffffff, side: DoubleSide, transparent: true, opacity: 0.5}));
    box.receiveShadow = true;
    box.rotation.y = Math.PI;
    box.material.shadowSide = THREE.DoubleSide;
    box.material.color.set(Math.round(Math.random() * 0x79 + 0x80) * 0x010000 + Math.round(Math.random() * 0x79 + 0x80) * 0x000100 + Math.round(Math.random() * 0x79 + 0x80) * 0x000001);
    scene.add(box);
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshLambertMaterial({color: 0x444444}));
    floor.position.y = -2.2;
    floor.rotation.x = - Math.PI / 2;
    floor.receiveShadow = true;
    // scene.add(floor);
    sphere = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 128, 128), new THREE.MeshPhongMaterial({color: 0xffffff}));
    sphere.position.set(-1.5, 0, 0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);
}

function checkIntersects(mesh) {
    const intersects = [];
    const intersectedNormals = [];
    raycaster.set(mesh.position, new THREE.Vector3(0, 0, -1));
    intersects.push(...raycaster.intersectObject(box));
    raycaster.set(mesh.position, new THREE.Vector3(0, 0, 1));
    intersects.push(...raycaster.intersectObject(box));
    raycaster.set(mesh.position, new THREE.Vector3(0, -1, 0));
    intersects.push(...raycaster.intersectObject(box));
    raycaster.set(mesh.position, new THREE.Vector3(0, 1, 0));
    intersects.push(...raycaster.intersectObject(box));
    raycaster.set(mesh.position, new THREE.Vector3(-1, 0, 0));
    intersects.push(...raycaster.intersectObject(box));
    raycaster.set(mesh.position, new THREE.Vector3(1, 0, 0));
    intersects.push(...raycaster.intersectObject(box));
    intersects.forEach(intersect => {
        if (mesh.position.distanceTo(intersect.point) <= mesh.geometry.parameters.radius + 0.01) intersectedNormals.push(intersect.face.normal.normalize());
    });
    return intersectedNormals;
}

function getAcceleration(mesh) {
    const acceleration = mesh.position.clone().negate().normalize();
    const centerMass = 10;

    // acceleration.multiplyScalar(centerMass / mesh.position.lengthSq() * 0.000001);
    acceleration.multiplyScalar(0.00001);

    return mesh.position.length() > 0.05 ? acceleration : new THREE.Vector3(Math.random() * 0.001, Math.random() * 0.001, Math.random() * 0.001);
}

function animate(timestamp) {
    requestAnimationFrame(animate);
    const elapsedTime = timestamp - prevTime;
    
    const normalized = checkIntersects(sphere);
    if (normalized.length != 0) {
        normalized.forEach(normal => {
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        });
    }

    if (!isNaN(elapsedTime)) {
        sphere.position.add(velocity.clone().multiplyScalar(elapsedTime));
        if (center.visible) {
            const acc = getAcceleration(sphere);
            sphere.position.add(acc.clone().multiplyScalar(Math.pow(elapsedTime, 2) / 2));
            velocity.add(acc.clone().multiplyScalar(elapsedTime));
        }
    }

    if (velocity.length() > 0.015) {
        console.log(velocity);
        velocity.normalize().multiplyScalar(0.01);
        console.log(velocity);
    }

    if (sphere.position.x > boxDim / 2) {
        sphere.position.x = boxDim / 2 - sphereRadius - 0.05;
        if (velocity.x > 0) {
            let normal = new THREE.Vector3(-1, 0, 0);
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        }
    } else if (sphere.position.x < -boxDim / 2) {
        sphere.position.x = -boxDim / 2 + sphereRadius + 0.05;
        if (velocity.x < 0) {
            let normal = new THREE.Vector3(1, 0, 0);
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        }
    }
    if (sphere.position.y > boxDim / 2) {
        sphere.position.y = boxDim / 2 - sphereRadius - 0.05;
        if (velocity.y > 0) {
            let normal = new THREE.Vector3(0, -1, 0);
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        }
    } else if (sphere.position.y < -boxDim / 2) {
        sphere.position.y = -boxDim / 2 + sphereRadius + 0.05;
        if (velocity.y < 0) {
            let normal = new THREE.Vector3(0, 1, 0);
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        }
    }
    if (sphere.position.z > boxDim / 2) {
        sphere.position.z = boxDim / 2 - sphereRadius - 0.05;
        if (velocity.z > 0) {
            let normal = new THREE.Vector3(0, 0, -1);
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        }
    } else if (sphere.position.z < -boxDim / 2) {
        sphere.position.z = -boxDim / 2 + sphereRadius + 0.05;
        if (velocity.z < 0) {
            let normal = new THREE.Vector3(0, 0, 1);
            let dotProduct = velocity.dot(normal);
            velocity.sub(normal.clone().multiplyScalar(2 * dotProduct));
        }
    }

    prevTime = timestamp;
    render();
}

function render() {
    controls.update();
    gui.controllers[1].setValue(velocity.length());
    gui.controllers[2].setValue(sphere.position.x);
    gui.controllers[3].setValue(sphere.position.y);
    gui.controllers[4].setValue(sphere.position.z);
    renderer.render(scene, camera);
}

init();
animate();
*/