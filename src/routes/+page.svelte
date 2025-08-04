<script>
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { PLYLoader } from '$lib/PLYLoader.js';
    import { OrbitControls } from '$lib/OrbitControls.js';
    import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

    let container = $state();
    let renderer, scene, camera;
    let spotLight, lightHelper;
    let controls;

    onMount(() => {
        init();
        return () => {
            // Cleanup
            if (renderer) {
                renderer.dispose(); 
            }
            if (controls) {
                controls.dispose();
            }
        };
    });

    function init() {
        // Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setAnimationLoop(animate);
        container.appendChild(renderer.domElement);

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.025;

        // Scene
        scene = new THREE.Scene();

        // Load HDR environment map
        const rgbeLoader = new RGBELoader();
        rgbeLoader.load('/src/lib/assets/skies/qwantani_night_1k.hdr', function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
            scene.environment = texture;
        });

        // Camera
        camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 180);

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.minDistance = 2;
        controls.maxDistance = 10;
        controls.maxPolarAngle = Math.PI * 0.8;  // Allow looking more upward (about 144 degrees)
        camera.position.set(3.30, -0.45, 4.66);
        controls.target.set(-0.12, 0.88, 1.16);
        controls.update();

        // Ambient light
        const ambient = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 0.15);
        scene.add(ambient);

        // Load disturb texture
        const loader = new THREE.TextureLoader();
        const disturbTexture = loader.load('/src/lib/assets/textures/disturb.jpg');
        disturbTexture.minFilter = THREE.LinearFilter;  
        disturbTexture.magFilter = THREE.LinearFilter;
        disturbTexture.generateMipmaps = false;
        disturbTexture.colorSpace = THREE.SRGBColorSpace;

        // Spotlight
        spotLight = new THREE.SpotLight(0xffffff, 5000);
        spotLight.position.set(2.5, 5, 2.5);
        spotLight.angle = Math.PI / 6;
        spotLight.penumbra = 1;
        spotLight.decay = 2;
        spotLight.distance = 0;
        spotLight.map = disturbTexture;

        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        spotLight.shadow.camera.near = 1;
        spotLight.shadow.camera.far = 10;
        spotLight.shadow.focus = 1;
        scene.add(spotLight);

        // Light helper
        lightHelper = new THREE.SpotLightHelper(spotLight);
        scene.add(lightHelper);

        // Ground plane
        const geometry = new THREE.PlaneGeometry(200, 200);
        const material = new THREE.MeshLambertMaterial({ color: 0xbcbcbc });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, -1, 0);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // Conditional model loading based on URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const modelParam = urlParams.get('model');
        
        if (modelParam === 'lucy') {
            // Load PLY model (Lucy)
            new PLYLoader().load('/src/lib/assets/models/Lucy100k.ply', function (geometry) {
                geometry.scale(0.0024, 0.0024, 0.0024);
                geometry.computeVertexNormals();

                const material = new THREE.MeshLambertMaterial();

                const mesh = new THREE.Mesh(geometry, material);
                mesh.rotation.y = -Math.PI / 2;
                mesh.position.y = 0.8;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
            });
        } else {
            // Load GLB model (Angel - default)
            new GLTFLoader().load('/src/lib/assets/models/angel-opt.glb', function (gltf) {
                const model = gltf.scene;
                
                // Scale and position the model
                model.scale.set(0.5, 0.5, 0.5);
                model.position.y = -1;
                
                // Enable shadows for all meshes in the group
                model.traverse(function (child) {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                scene.add(model);
            });
        }

        // Window resize handler
        window.addEventListener('resize', onWindowResize);
        
        // Camera position logger (press 'C' key)
        window.addEventListener('keydown', (event) => {
            if (event.key === 'c' || event.key === 'C') {
                console.log('=== CAMERA POSITION ===');
                console.log(`camera.position.set(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)});`);
                console.log(`controls.target.set(${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)});`);
                console.log('======================');
            }
        });
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        const baseTime = performance.now() / 3000;
        
        // Calculate current angle in the circle
        const currentAngle = baseTime % (Math.PI * 2);
        
        // Speed up when behind the model (roughly when angle is between π/2 and 3π/2)
        // This creates a variable speed where it moves faster behind the statue
        let speedMultiplier = 1.0;
        if (currentAngle > Math.PI * 0.4 && currentAngle < Math.PI * 1.6) {
            speedMultiplier = 2.5; // Speed up when behind
        }
        
        // Apply speed multiplier to time
        const adjustedTime = baseTime * speedMultiplier;

        spotLight.position.x = Math.cos(adjustedTime) * 2.5;
        spotLight.position.z = Math.sin(adjustedTime) * 2.5;

        lightHelper.update();

        renderer.render(scene, camera);
    }
</script>

<svelte:window on:resize={onWindowResize} />

<div class="relative w-full h-screen overflow-hidden bg-gray-900">
    <div bind:this={container} class="w-full h-full"></div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
    }
</style>