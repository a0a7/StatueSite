<script>
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { PLYLoader } from '$lib/PLYLoader.js';
    import { OrbitControls } from '$lib/OrbitControls.js';
    import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
    import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
    import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
    import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

    let container = $state();
    let renderer, scene, camera;
    let spotLight, lightHelper;
    let controls;
    let accumulatedAngle = 0;
    let mouseX = 0;
    let mouseY = 0;
    let baseCameraPosition = { x: 3.30, y: -0.45, z: 4.66 };
    let baseCameraTarget = { x: -0.12, y: 0.88, z: 1.16 };
    let composer;
    let volumetricMesh;
    let controlsEnabled = false;

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
        renderer.toneMappingExposure = 0.035;

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
        
        // Disable all mouse interactions
        controls.enableRotate = false;
        controls.enablePan = false;
        controls.enableZoom = false;
        
        controls.update();
        // Load disturb texture
        const loader = new THREE.TextureLoader();
        const disturbTexture = loader.load('/src/lib/assets/textures/disturb.jpg');
        disturbTexture.minFilter = THREE.LinearFilter;  
        disturbTexture.magFilter = THREE.LinearFilter;
        disturbTexture.generateMipmaps = false;
        disturbTexture.colorSpace = THREE.SRGBColorSpace;

        // Spotlight
        spotLight = new THREE.SpotLight(0xffeeee, 3000);
        spotLight.position.set(2.5, 5, 2.5);
        spotLight.angle = Math.PI / 6;
        spotLight.penumbra = 1;
        spotLight.decay = 1.8;
        spotLight.distance = 0;
        spotLight.map = disturbTexture;

        spotLight.castShadow = true;
        spotLight.shadow.mapSize.width = 2048;
        spotLight.shadow.mapSize.height = 2048;
        spotLight.shadow.camera.near = 1;
        spotLight.shadow.camera.far = 15;
        spotLight.shadow.focus = 1;
        scene.add(spotLight);

        // Add ambient light to help illuminate fog from all angles
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        scene.add(ambientLight);

        // lightHelper = new THREE.SpotLightHelper(spotLight);
        // scene.add(lightHelper);

        // Ground plane
        const geometry = new THREE.PlaneGeometry(200, 200);
        const material = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, -1, 0);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        //scene.add(mesh);

        // Conditional model loading based on URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const modelParam = urlParams.get('model');
        const controlsParam = urlParams.get('controls');
        
        // Configure camera controls based on URL parameter
        if (controlsParam === 'true') {
            // Enable all mouse interactions for camera control
            controls.enableRotate = true;
            controls.enablePan = true;
            controls.enableZoom = true;
            controlsEnabled = true;
        } else {
            // Disable all mouse interactions (default behavior)
            controls.enableRotate = false;
            controls.enablePan = false;
            controls.enableZoom = false;
            controlsEnabled = false;
        }
        
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

        // Set up post-processing for bloom effects
        composer = new EffectComposer(renderer);
        
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.075,    // strength
            45,    // radius  
            10    // threshold
        );
        composer.addPass(bloomPass);

        createVolumetricFog();

        // Window resize handler
        window.addEventListener('resize', onWindowResize);
        
        // Mouse movement handler for subtle camera movement (only when controls are disabled)
        window.addEventListener('mousemove', (event) => {
            if (!controlsEnabled) {
                // Normalize mouse position to -1 to 1 range
                mouseX = (event.clientX / window.innerWidth) * 2 - 1;
                mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
            }
        });
        
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
        composer.setSize(window.innerWidth, window.innerHeight);
    }

    function createVolumetricFog() {
        const size = 32;
        const data = new Uint8Array(size * size * size);

        let i = 0;
        const scale = 0.8;
        const perlin = new ImprovedNoise();
        const vector = new THREE.Vector3();

        for (let z = 0; z < size; z++) {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const d = 1.0 - vector.set(x, y, z).subScalar(size / 2).divideScalar(size).length();
                    // Make fog much brighter for low exposure visibility
                    data[i] = (180 + 180 * perlin.noise(x * scale / 1.5, y * scale, z * scale / 1.5)) * d * d;
                    i++;
                }
            }
        }

        const texture = new THREE.Data3DTexture(data, size, size, size);
        texture.format = THREE.RedFormat;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.unpackAlignment = 1;
        texture.needsUpdate = true;

        // Simplified volumetric fog shaders
        const vertexShader = /* glsl */`
            in vec3 position;

            uniform mat4 modelMatrix;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            uniform vec3 cameraPos;

            out vec3 vOrigin;
            out vec3 vDirection;

            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPos, 1.0)).xyz;
                vDirection = position - vOrigin;

                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        const fragmentShader = /* glsl */`
            precision highp float;
            precision highp sampler3D;

            in vec3 vOrigin;
            in vec3 vDirection;

            out vec4 color;

            uniform vec3 base;
            uniform sampler3D map;
            uniform float threshold;
            uniform float range;
            uniform float opacity;
            uniform float steps;
            uniform float frame;
            uniform vec3 cameraPos;
            uniform vec3 spotLightPos;

            uint wang_hash(uint seed) {
                seed = (seed ^ 61u) ^ (seed >> 16u);
                seed *= 9u;
                seed = seed ^ (seed >> 4u);
                seed *= 0x27d4eb2du;
                seed = seed ^ (seed >> 15u);
                return seed;
            }

            float randomFloat(inout uint seed) {
                return float(wang_hash(seed)) / 4294967296.;
            }

            vec2 hitBox(vec3 orig, vec3 dir) {
                const vec3 box_min = vec3(-0.5);
                const vec3 box_max = vec3(0.5);
                vec3 inv_dir = 1.0 / dir;
                vec3 tmin_tmp = (box_min - orig) * inv_dir;
                vec3 tmax_tmp = (box_max - orig) * inv_dir;
                vec3 tmin = min(tmin_tmp, tmax_tmp);
                vec3 tmax = max(tmin_tmp, tmax_tmp);
                float t0 = max(tmin.x, max(tmin.y, tmin.z));
                float t1 = min(tmax.x, min(tmax.y, tmax.z));
                return vec2(t0, t1);
            }

            float sample1(vec3 p) {
                return texture(map, p).r;
            }

            float shading(vec3 coord) {
                float step = 0.01;
                return sample1(coord + vec3(-step)) - sample1(coord + vec3(step));
            }

            void main() {
                vec3 rayDir = normalize(vDirection);
                vec2 bounds = hitBox(vOrigin, rayDir);

                if (bounds.x > bounds.y) discard;

                // Ensure we always have some ray distance even when looking head-on
                bounds.x = max(bounds.x, 0.0);
                float rayLength = bounds.y - bounds.x;
                if (rayLength < 0.01) rayLength = 0.01; // Minimum ray length

                vec3 p = vOrigin + bounds.x * rayDir;
                vec3 inc = 1.0 / abs(rayDir);
                float delta = min(inc.x, min(inc.y, inc.z));
                delta /= steps;
                delta = max(delta, rayLength / steps); // Ensure proper step size

                // Jitter
                uint seed = uint(gl_FragCoord.x) * uint(1973) + uint(gl_FragCoord.y) * uint(9277) + uint(frame) * uint(26699);
                vec3 size = vec3(textureSize(map, 0));
                float randNum = randomFloat(seed) * 2.0 - 1.0;
                p += rayDir * randNum * (1.0 / size);

                vec4 ac = vec4(base, 0.0);

                for (float t = bounds.x; t < bounds.y; t += delta) {
                    float d = sample1(p + 0.5);

                    d = smoothstep(threshold - range, threshold + range, d) * opacity;

                    float col = shading(p + 0.5) * 3.0 + ((p.x + p.y) * 0.25) + 0.2;

                    // Boost visibility for short rays (front-facing views)
                    float rayLengthBoost = 1.0 + (1.0 - rayLength) * 2.0;
                    
                    // Add consistent base visibility regardless of lighting angle
                    float baseVisibility = 0.8; // Always visible base amount
                    d = d * rayLengthBoost + baseVisibility * d;

                    ac.rgb += (1.0 - ac.a) * d * col;
                    ac.a += (1.0 - ac.a) * d;

                    if (ac.a >= 0.95) break;

                    p += rayDir * delta;
                }

                color = ac;
                if (color.a == 0.0) discard;
            }
        `;

        const geometry = new THREE.BoxGeometry(1, 1, 1);  // Standard unit cube
        const material = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                base: { value: new THREE.Color(0xffffff) }, // Bright white for low exposure
                map: { value: texture },
                cameraPos: { value: new THREE.Vector3() },
                spotLightPos: { value: new THREE.Vector3() }, // Add spotlight position
                threshold: { value: 0.4 },  
                opacity: { value: 0.2 },    
                range: { value: 0.2 },     
                steps: { value: 8 },       
                frame: { value: 0 }
            },
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,  // Render both front and back faces
            transparent: true,
            depthWrite: false        // Don't write to depth buffer for better blending
        });

        volumetricMesh = new THREE.Mesh(geometry, material);
        volumetricMesh.scale.set(7.5, 4, 7.5);  // Scale the mesh in world space
        volumetricMesh.position.set(0, -1.45, 0); // Position closer to statue level
        scene.add(volumetricMesh);
    }

    function animate() {
        const deltaTime = 1 / 60; // Assume 60 FPS for consistent speed
        const baseSpeed = 0.5; // Base rotation speed
        
        // Normalize angle to 0-2π range
        const normalizedAngle = accumulatedAngle % (Math.PI * 2);
        
        // Check if we're in the "behind" zone (π/2 to 3π/2 = 90° to 270°)
        const speedMultiplier = (normalizedAngle > Math.PI * 1 && normalizedAngle < Math.PI * 1.55) ? 1.75 : 1.0;
        
        // Update accumulated angle
        accumulatedAngle += baseSpeed * speedMultiplier * deltaTime;
        
        // Position spotlight
        spotLight.position.x = Math.cos(accumulatedAngle) * 2.5;
        spotLight.position.z = Math.sin(accumulatedAngle) * 2.5;

        // Update volumetric fog
        if (volumetricMesh) {
            volumetricMesh.material.uniforms.cameraPos.value.copy(camera.position);
            volumetricMesh.material.uniforms.spotLightPos.value.copy(spotLight.position);
            volumetricMesh.material.uniforms.frame.value++;
            volumetricMesh.rotation.y = performance.now() * 0.0001; // Very slow rotation
        }

        // Apply subtle mouse-based camera movement (only when controls are disabled)
        if (!controlsEnabled) {
            const parallaxStrength = 0.1; // Adjust this for more/less responsiveness
            camera.position.x = baseCameraPosition.x + mouseX * parallaxStrength;
            camera.position.y = baseCameraPosition.y + mouseY * parallaxStrength * 0.5;
            
            controls.target.x = baseCameraTarget.x + mouseX * parallaxStrength * 0.5;
            controls.target.y = baseCameraTarget.y + mouseY * parallaxStrength * 0.3;
        }
        
        controls.update();

        // lightHelper.update(); // Commented out since helper is disabled

        composer.render();
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