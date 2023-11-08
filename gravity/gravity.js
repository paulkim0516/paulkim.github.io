import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer;
let controls;
let gui;

const fov = 75;
const near = 0.1;
const far = 1000;

let spaceDim = 4;
let spaceMesh;

let spheres = new THREE.Group();
let sphereCount = 2;
let sphereRadius = 0.2;
let sphereMatDensity = 1;
let velocityScaleFactor = 0.005;
let timeScale = 0.75;

const gravConstant = 10 ** -3;

let gravPoint;
let gpMass = 0.1;

let lastFrameTime = 0;

class CollidingSphere extends THREE.Mesh {
    /**
     * 
     * @param {THREE.BufferGeometry} geometry 
     * @param {THREE.Material} material 
     * @param {THREE.Vector3} position 
     * @param {THREE.Vector3} velocity 
     * @param {number} density 
     */
    constructor(geometry, material, position, velocity, density) {
        super(geometry, material);
        this.radius = geometry.parameters.radius;
        this.position.copy(position);
        this.prevVelocity = new THREE.Vector3().copy(velocity);
        this.velocity = new THREE.Vector3().copy(velocity);
        this.density = density
        this.mass = density * 4 / 3 * Math.PI * this.radius ** 3;
        this.lastCollision = null;
    }

    updatePosition(meshes, gravityPoints, delta) {
        this.updateVelocity(meshes, gravityPoints, delta);
        if (this.velocity.length() > 2 * velocityScaleFactor) {
            this.velocity.setLength(2 * velocityScaleFactor);
        }
        this.position.add(this.velocity.clone().add(this.prevVelocity).multiplyScalar(delta / 2));
        // this.position.add(this.velocity.clone().multiplyScalar(delta));
        
        gravityPoints.forEach(gravityPoint => {
            if (gravityPoint instanceof GravityPoint) {
                if ((this.position.distanceTo(gravityPoint.position) < this.radius / 2) && (this.velocity.length() < velocityScaleFactor / 50 / timeScale)) {
                    console.log("dd");
                    this.velocity.copy(new THREE.Vector3().randomDirection().multiplyScalar(velocityScaleFactor));
                }
            }
        });

        // console.log(this.velocity.length());
        this.prevVelocity.copy(this.velocity);
    }

    updateVelocity(meshes, gravityPoints, delta) {
        if (meshes.length != 0) {
            meshes.forEach(mesh => {
                if (mesh != this) {
                    const normal = this.checkCollision(mesh, delta);
                    if (normal) {
                        this.prevVelocity.reflect(normal);
                        this.velocity.reflect(normal);
                    }
                }
            });
        }

        const acceleration = this.getAcceleration(gravityPoints);
        this.velocity.add(acceleration.multiplyScalar(delta));
    }

    getAcceleration(meshes) {
        if (!meshes) {
            // console.info("No object for gravitational pull");
            return new THREE.Vector3();
        }

        const netAcceleration = new THREE.Vector3();

        meshes.forEach(mesh => {
            if (mesh instanceof CollidingSphere) {
                if (mesh != this) {
                    if (this.position.distanceTo(mesh.position) > this.radius + mesh.radius) {
                        const meshToThis = mesh.position.clone().sub(this.position);
                        const distanceSq = meshToThis.lengthSq();
                        const acceleration = meshToThis.setLength(gravConstant * mesh.mass / distanceSq);
                        netAcceleration.add(acceleration);
                    }
                }
            } else if (mesh instanceof GravityPoint) {
                const meshToThis = mesh.position.clone().sub(this.position);
                const distanceSq = meshToThis.lengthSq();
                const acceleration = meshToThis.setLength(gravConstant * mesh.mass / distanceSq / 10);
    
                netAcceleration.add(acceleration);
                // const dist = mesh.position.clone().sub(this.position).length();
                // netAcceleration.add(mesh.position.clone().sub(this.position).setLength(gravConstant / 10));
            }
        });

        return netAcceleration;
    }
    
    checkCollision(mesh, delta) {
        if (mesh === this) {
            console.error("Cannot collide itself");
            return null;
        }
        
        if (mesh instanceof CollidingSphere) {
            const expectedVelocity = this.velocity.clone().sub(mesh.velocity);
            // const distance = this.position.clone().distanceTo(mesh.position);
            const distance = this.position.clone().add(expectedVelocity.multiplyScalar(delta)).distanceTo(mesh.position);
            if (distance < this.radius + mesh.radius && this.lastCollision != mesh) {
                this.lastCollision = mesh;
                return mesh.position.clone().sub(this.position).normalize();
            }
        } else if (mesh instanceof BoundingSpace) {
            const plane = mesh.closestPlane(this.position);
            const angle = plane.surface.normal.angleTo(this.velocity);
            if (plane.distance < this.radius && (this.lastCollision != plane.surface || angle < Math.PI / 2)) {
                this.lastCollision = plane.surface;
                return plane.surface.normal;
            }
        } else {
            console.error("Unsupported type of mesh");
        }

        return null;
    }
}

class BoundingSpace extends THREE.Mesh {
    constructor(geometry, material) {
        super(geometry, material);
        this.surfaces = [];
        const index = geometry.getIndex();
        const position = geometry.attributes.position.array;
        if (index) {
            for (let i = 0; i < index.array.length; i+= 3) {
                let v0 = new THREE.Vector3().fromArray(position, index.array[i] * 3);
                let v1 = new THREE.Vector3().fromArray(position, index.array[i + 1] * 3);
                let v2 = new THREE.Vector3().fromArray(position, index.array[i + 2] * 3);
                
                const plane = new THREE.Plane();
                plane.setFromCoplanarPoints(v0, v1, v2);
                this.surfaces.push(plane);
            }
        } else {
            for (let i = 0; i < position.length; i+=9) {
                let v0 = new THREE.Vector3().fromArray(position, i);
                let v1 = new THREE.Vector3().fromArray(position, i + 3);
                let v2 = new THREE.Vector3().fromArray(position, i + 6);
                
                const plane = new THREE.Plane();
                plane.setFromCoplanarPoints(v0, v1, v2);
                this.surfaces.push(plane);
            }
        }
    }
    
    closestPlane(point) {
        let minDist = Infinity;
        let minSurface = null;
        this.surfaces.forEach(surface => {
            if (Math.abs(surface.distanceToPoint(point)) < minDist) {
                minSurface = surface;
                minDist = Math.abs(surface.distanceToPoint(point));
            }
        });

        let pointOnSrf = new THREE.Vector3();
        minSurface.projectPoint(point, pointOnSrf);

        return {surface: minSurface, distance: minDist, pointOnSurface: pointOnSrf};
    }
}

class GravityPoint extends THREE.Mesh {
    /**
     * 
     * @param {THREE.BufferGeometry} geometry 
     * @param {THREE.Material} material 
     * @param {THREE.Vector3} position 
     * @param {number} mass 
     */
    constructor(geometry, material, position, mass) {
        super(geometry, material);
        this.position.copy(position);
        this.mass = mass;
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

    const pointLight = new THREE.PointLight(0xffffff, 1 , 10);
    pointLight.castShadow = true;
    scene.add(pointLight);

    initSpace();
    console.log("d");
    initSphere();
    console.log("s");
    initGravPoint();
    lastFrameTime = performance.now();
}

function initSpace() {
    const spaceGeo = new THREE.BoxGeometry(spaceDim, spaceDim, spaceDim);
    // const spaceGeo = new THREE.OctahedronGeometry(spaceDim);
    const spaceMat = new THREE.MeshPhongMaterial({color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0.5});
    spaceMat.color.set(Math.round(Math.random() * 0x79 + 0x80) * 0x010000 + Math.round(Math.random() * 0x79 + 0x80) * 0x000100 + Math.round(Math.random() * 0x79 + 0x80) * 0x000001);
    spaceMesh = new BoundingSpace(spaceGeo, spaceMat);

    spaceMesh.receiveShadow = true;
    spaceMesh.material.shadowSide = THREE.DoubleSide;
    console.log(spaceMesh);
    scene.add(spaceMesh);
}

function initSphere() {
    for (let i = 0; i < sphereCount; i++) {
        const sphereGeo = new THREE.SphereGeometry(sphereRadius, 128, 128);
        const sphereMat = new THREE.MeshPhongMaterial({color: 0xffffff});
        // const sphereMat = new THREE.MeshPhongMaterial({color: Math.round(Math.random() * 0xf) * 0x111111});

        const sphere = new CollidingSphere(
            sphereGeo,
            sphereMat,
            new THREE.Vector3().randomDirection().multiplyScalar(spaceDim / 4),
            new THREE.Vector3().randomDirection().multiplyScalar(velocityScaleFactor),
            sphereMatDensity
        );
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        console.log(sphere.position);
        spheres.add(sphere);
    }
    scene.add(spheres);
}

function initGravPoint() {
    const gpGeo = new THREE.SphereGeometry(sphereRadius / 4, 32, 32);
    const gpMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    gravPoint = new GravityPoint(gpGeo, gpMat, new THREE.Vector3(), gpMass);
}

function animate(currentTime) {
    controls.update();
    const delta = (currentTime - lastFrameTime) * timeScale;

    spheres.children.forEach(sphere => {
        // sphere.updatePosition(spheres.children.concat(spaceMesh), [], delta);
        sphere.updatePosition(spheres.children.concat(spaceMesh), [gravPoint], delta);
        // sphere.updatePosition(spheres.children.concat(spaceMesh), spheres.children, delta);
        // sphere.updatePosition(spheres.children.concat(spaceMesh), spheres.children.concat(gravPoint), delta);
    });



    lastFrameTime = currentTime;
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

init();
animate(performance.now());