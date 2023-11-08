import * as THREE from 'three';
import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, -10);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener( 'resize', onWindowResize );

    controls = new OrbitControls( camera, renderer.domElement );
    controls.listenToKeyEvents(window);

    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    controls.screenSpacePanning = false;

    // const loader = new GLTFLoader();
    // 
    // loader.load('../assets/circles.glb', (gltf) => {
    //     console.log(gltf);
    //     scene.add(gltf.scene);
    // }, undefined, (error) => {
    //     console.error(error);
    // });

    const cubeGeo = new THREE.BoxGeometry(3, 3, 3);
    const cubeWireGeo = new THREE.WireframeGeometry(cubeGeo);
    const cubeMat = new THREE.MeshBasicMaterial({color: 0xffffff});
    const cubeWireframe = new THREE.LineSegments(cubeWireGeo, new THREE.LineBasicMaterial({color: 0xff0000}));

    const cube = new THREE.Mesh(cubeGeo, cubeMat);

    // cubeWireframe.material.depthTest = false;

    scene.add(cube, cubeWireframe);
    console.log(cube);
    console.log(cubeWireframe);

    const shape = new THREE.Shape();
    shape.moveTo( 1.5, 1.5, 1.5 );
    shape.lineTo( 1.5, -1.5, 1.5 );
    shape.lineTo( 1.5, -1.5 );
    shape.lineTo( length, 0 );
    shape.lineTo( 0, 0 );

    const extrudeSettings = {
        steps: 2,
        depth: 16,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
        bevelOffset: 0,
        bevelSegments: 1
    };

    const geometry = new THREE.ExtrudeGeometry( shape, extrudeSettings );
    const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    const mesh = new THREE.Mesh( geometry, material ) ;
    scene.add( mesh );
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {
    requestAnimationFrame( animate );

    controls.update();

    render();
}

function render() {
    renderer.render( scene, camera );
}

init();
animate();