<script lang="ts">
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
    import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
    import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
    import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

    interface Project {
        title: string;
        status: string;
        technologies: string;
        description: string;
    }

    interface PageData {
        projects: Project[];
    }

    let { data }: { data: PageData } = $props();

    let container = $state();
    let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera;
    let spotLight: THREE.Object3D<THREE.Object3DEventMap>, lightHelper;
    let controls: OrbitControls;
    let accumulatedAngle = 0;
    let mouseX = 0;
    let mouseY = 0;
    let vignetteX = $state(0);
    let vignetteY = $state(0);
    let baseCameraPosition = { x: 3.30, y: -0.45, z: 4.66 };
    let baseCameraTarget = { x: -0.12, y: 0.88, z: 1.16 };
    let composer: EffectComposer;
    let volumetricMesh: THREE.Mesh<THREE.BoxGeometry, THREE.RawShaderMaterial, THREE.Object3DEventMap>;
    let skyMesh;
    let stars: THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.PointsMaterial, THREE.Object3DEventMap>;
    let controlsEnabled = false;
    let isMobile = false;
    let initialOrientation = { beta: 0, gamma: 0 };
    let hasOrientationPermission = false;
    let scrollContainer = $state();
    let scrollAngle = $state(0); // Camera rotation angle based on scroll
    let targetScrollAngle = $state(0); // Target angle for smooth interpolation

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
        (container as HTMLElement).appendChild(renderer.domElement);

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.035;

        // Scene
        scene = new THREE.Scene();
        
        // Create starfield and gradient sky
        createSkyAndStars();

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
        const loader = new THREE.TextureLoader();
        const disturbTexture = loader.load('/textures/disturb.jpg');
        disturbTexture.minFilter = THREE.LinearFilter;  
        disturbTexture.magFilter = THREE.LinearFilter;
        disturbTexture.generateMipmaps = false;
        disturbTexture.colorSpace = THREE.SRGBColorSpace;

        spotLight = new THREE.SpotLight(0xffeeee, 3000);
        spotLight.position.set(2.5, 5, 2.5); // @ts-ignore: exists
        spotLight.angle = Math.PI / 6; // @ts-ignore: exists
        spotLight.penumbra = 1; // @ts-ignore: exists
        spotLight.decay = 1.8; // @ts-ignore: exists
        spotLight.distance = 0; // @ts-ignore: exists
        spotLight.map = disturbTexture;

        spotLight.castShadow = true; // @ts-ignore: exists
        spotLight.shadow.mapSize.width = 512; // @ts-ignore: exists
        spotLight.shadow.mapSize.height = 512; // @ts-ignore: exists
        spotLight.shadow.camera.near = 1; // @ts-ignore: exists
        spotLight.shadow.camera.far = 15; // @ts-ignore: exists
        spotLight.shadow.focus = 1; 
        scene.add(spotLight);

        // Add ambient light to help illuminate fog from all angles
        const ambientLight = new THREE.AmbientLight(0x404045, 60);
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
        
        new GLTFLoader().load('/models/angel-opt.glb', function (gltf) {
            const model = gltf.scene;
            
            // Scale and position the model
            model.scale.set(0.5, 0.5, 0.5);
            model.position.y = -1;
            
            // Enable shadows for all meshes in the group
            model.traverse(function (child) { // @ts-ignore: exists
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            scene.add(model);
        });

        // Set up post-processing for bloom effects
        composer = new EffectComposer(renderer);
        
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.045,    // strength
            45,    // radius  
            10    // threshold
        );
        composer.addPass(bloomPass);

        createVolumetricFog();

        // Detect if device is mobile
        isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Request device orientation permission for iOS 13+
        if (isMobile && typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            // For iOS 13+ devices, we need to request permission
            // This will be triggered by user interaction later
        } else if (isMobile) {
            // For other mobile devices, set up orientation listener immediately
            setupOrientationListener();
        }

        // Window resize handler
        window.addEventListener('resize', onWindowResize);
        
        // Mouse movement handler for subtle camera movement (only when controls are disabled)
        window.addEventListener('mousemove', (event) => {
            if (!controlsEnabled && !isMobile) {
                // Normalize mouse position to -1 to 1 range
                mouseX = (event.clientX / window.innerWidth) * 2 - 1;
                mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
                
                // Update vignette position with smoothing
                vignetteX = (event.clientX / window.innerWidth - 0.5) * 20; // Range: -10 to 10
                vignetteY = (event.clientY / window.innerHeight - 0.5) * 20; // Range: -10 to 10
            }
        });
        
        // Touch handler for mobile to request orientation permission
        window.addEventListener('touchstart', async (event) => {
            if (isMobile && !hasOrientationPermission && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                try {
                    const permission = await (DeviceOrientationEvent as any).requestPermission();
                    if (permission === 'granted') {
                        hasOrientationPermission = true;
                        setupOrientationListener();
                    }
                } catch (error) {
                    console.log('Orientation permission denied');
                }
            }
        }, { once: true });
        
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

    function setupOrientationListener() {
        let isCalibrated = false;
        
        window.addEventListener('deviceorientation', (event) => {
            if (!controlsEnabled && isMobile) {
                // Calibrate on first reading
                if (!isCalibrated && event.beta !== null && event.gamma !== null) {
                    initialOrientation.beta = event.beta;
                    initialOrientation.gamma = event.gamma;
                    isCalibrated = true;
                    return;
                }
                
                if (event.beta !== null && event.gamma !== null && isCalibrated) {
                    // Calculate relative rotation from initial position
                    const deltaBeta = event.beta - initialOrientation.beta;  // Forward/backward tilt
                    const deltaGamma = event.gamma - initialOrientation.gamma; // Left/right tilt
                    
                    // Convert to normalized coordinates (-1 to 1)
                    // Limit the range to prevent extreme movements
                    mouseX = Math.max(-1, Math.min(1, deltaGamma / 30)); // 30 degrees = full range
                    mouseY = Math.max(-1, Math.min(1, deltaBeta / 30));  // 30 degrees = full range
                    
                    // Update vignette position
                    vignetteX = mouseX * 10;
                    vignetteY = mouseY * 10;
                }
            }
        });
    }

    function handleScroll() {
        if (!scrollContainer) return; // @ts-ignore: exists
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const scrollableHeight = scrollHeight - clientHeight;
        
        if (scrollableHeight > 0) {
            const scrollPercentage = scrollTop / scrollableHeight;
            
            // Convert scroll to camera rotation (0 to 2π for full circle) - negative for opposite direction
            targetScrollAngle = -scrollPercentage * Math.PI * 2;
        }
    }

    function onWindowResize() { // @ts-ignore: exists
        camera.aspect = window.innerWidth / window.innerHeight; // @ts-ignore: exists
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    }

    function createSkyAndStars() {
        // Create gradient sky sphere
        const skyGeometry = new THREE.SphereGeometry(90, 32, 16);
        
        // Create gradient material
        const skyMaterial = new THREE.ShaderMaterial({
            vertexShader: /* glsl */`
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    // Create gradient from brighter blue at horizon to dark blue at zenith
                    vec3 bottomColor = vec3(0.15, 0.25, 0.4); // Brighter blue
                    vec3 topColor = vec3(0, 0.4, 0.5); // Dark blue instead of black
                    float gradient = smoothstep(-0.02, 0.5, h);
                    gl_FragColor = vec4(mix(bottomColor, topColor, gradient), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
        scene.add(skyMesh);
        
        // Create stars
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 1024;
        const positions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const radius = 20;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.cos(phi);
            positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xaaddff,
            size: 2,
            vertexColors: false,
            transparent: true,
            opacity: 10,
            sizeAttenuation: false
        });
        
        stars = new THREE.Points(starGeometry, starMaterial);
        scene.add(stars);
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
        const baseSpeed = 0.25; // Base rotation speed
        
        // Normalize angle to 0-2π range
        const normalizedAngle = accumulatedAngle % (Math.PI * 2);
        
        // Check if we're in the "behind" zone (π/2 to 3π/2 = 90° to 270°)
        const speedMultiplier = (normalizedAngle > Math.PI * 1 && normalizedAngle < Math.PI * 1.55) ? 1.75 : 1.0;
        
        accumulatedAngle += baseSpeed * speedMultiplier * deltaTime;
        
        spotLight.position.x = Math.cos(accumulatedAngle) * 2.5;
        spotLight.position.z = Math.sin(accumulatedAngle) * 2.5;

        if (volumetricMesh) {
            volumetricMesh.material.uniforms.cameraPos.value.copy(camera.position);
            volumetricMesh.material.uniforms.spotLightPos.value.copy(spotLight.position);
            volumetricMesh.material.uniforms.frame.value++;
        }

        if (stars) {
            const time = performance.now() * 0.000005; 
            stars.rotation.x = Math.PI / 6; 
            stars.rotation.y = time;
        }

        // Smooth interpolation for scroll angle
        const lerpFactor = 0.1; // Adjust for smoother/faster transitions
        scrollAngle = scrollAngle + (targetScrollAngle - scrollAngle) * lerpFactor;

        if (!controlsEnabled) {
            // Define the center point to orbit around (statue position at origin)
            const orbitCenter = { x: 0, y: 0, z: 0 }; // Statue is at 0,0,0
            
            // Calculate the initial offset from orbit center to starting camera position
            const initialOffset = {
                x: baseCameraPosition.x - orbitCenter.x,
                y: baseCameraPosition.y - orbitCenter.y,
                z: baseCameraPosition.z - orbitCenter.z
            };
            
            // Calculate radius from the initial position
            const radius = Math.sqrt(initialOffset.x * initialOffset.x + initialOffset.z * initialOffset.z);
            
            // Calculate the initial angle from the starting position
            const initialAngle = Math.atan2(initialOffset.z, initialOffset.x);
            
            // Apply scroll rotation on top of initial angle
            const currentAngle = initialAngle + scrollAngle;
            
            // Calculate scroll-based camera position (orbiting around the statue)
            const baseScrollX = orbitCenter.x + Math.cos(currentAngle) * radius;
            const baseScrollZ = orbitCenter.z + Math.sin(currentAngle) * radius;
            
            // Calculate scroll progress (0 to 1) for vertical movement and target adjustment
            const scrollProgress = Math.abs(scrollAngle) / (Math.PI * 2); // 0 to 1 for full rotation
            
            // Gradually move camera upward as you scroll
            const heightOffset = scrollProgress * 4.0; // Move up by 2 units at full scroll
            
            // Calculate the target offset from orbit center to original target
            const targetOffset = {
                x: baseCameraTarget.x - orbitCenter.x,
                y: baseCameraTarget.y - orbitCenter.y,
                z: baseCameraTarget.z - orbitCenter.z
            };
            
            // Calculate target radius (distance from statue to original target)
            const targetRadius = Math.sqrt(targetOffset.x * targetOffset.x + targetOffset.z * targetOffset.z);
            
            // Calculate the initial target angle
            const initialTargetAngle = Math.atan2(targetOffset.z, targetOffset.x);
            
            // Apply scroll rotation to target as well
            const currentTargetAngle = initialTargetAngle + scrollAngle;
            
            // Calculate scroll-based target position (orbiting around the statue)
            const baseScrollTargetX = orbitCenter.x + Math.cos(currentTargetAngle) * targetRadius;
            const baseScrollTargetZ = orbitCenter.z + Math.sin(currentTargetAngle) * targetRadius;
            
            // Gradually lower the target Y position as you scroll to look more downward
            const targetHeightOffset = -scrollProgress * -0.75; // Lower target by 0.8 units at full scroll
            
            // Apply mouse parallax on top of scroll position
            const parallaxStrength = 0.5; 
            camera.position.x = baseScrollX + mouseX * parallaxStrength;
            camera.position.y = baseCameraPosition.y + heightOffset + mouseY * parallaxStrength * 0.5;
            camera.position.z = baseScrollZ + mouseY * parallaxStrength * 0.3;
            
            // Apply parallax to target as well to maintain relationship
            controls.target.x = baseScrollTargetX + mouseX * parallaxStrength * 0.5;
            controls.target.y = baseCameraTarget.y + targetHeightOffset + mouseY * parallaxStrength * 0.3;
            controls.target.z = baseScrollTargetZ;
        }
        
        controls.update();

        composer.render();
    }
</script>

<svelte:window on:resize={onWindowResize} />

<div class="relative w-full h-screen overflow-hidden bg-gray-900">
    <div bind:this={container} class="w-full h-full"></div>
    
    <div class="absolute top-0 left-0 z-30 h-full w-[80%] md:w-[50%] lg:w-[40%] p-6 md:p-8 pointer-events-auto">
        <div bind:this={scrollContainer} onscroll={handleScroll} class="h-full bg-transparent bg-opacity-20 backdrop-blur-sm rounded-lg p-6 md:p-8 overflow-y-auto custom-scrollbar">
            <div class="space-y-8">
                {#each data.projects as project}
                    <div class="relative pl-5">
                        <div class="transform translate-y-[2px] absolute left-0 top-0 h-full">
                            <div class="absolute left-0 top-[5px] h-[calc(50%-22px)] w-0.5 bg-white opacity-60 rounded-[1px]"></div>
                            <div class="absolute left-0 bottom-[5px] h-[calc(50%-22px)] w-0.5 bg-white opacity-60 rounded-[1px]"></div>
                            <div class="absolute left-[-2.5px] top-1/2 transform -translate-y-1/2   w-2 h-2 bg-white opacity-60 rotate-45 rounded-[1px]"></div>
                        </div>
                        <h2 class="text-sm md:text-base font-bold text-white uppercase leading-5 tracking-narrow">{project.title}</h2>
                        <p class="text-gray-300 leading-relaxed">{project.description}</p>
                        <div class="flex items-center gap-4 text-sm text-gray-400">
                            <span>{project.technologies}</span>
                            <span>◆</span>
                            <span>2025</span>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>
    
    <div 
        class="vignette-overlay"
        style="--vignette-x: {vignetteX}px; --vignette-y: {vignetteY}px;"
    ></div>
</div>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
    }
    
    .custom-scrollbar {
        /* Hide default scrollbar */
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* Internet Explorer 10+ */
    }
    
    .custom-scrollbar::-webkit-scrollbar {
        display: none; /* WebKit */
    }
    
    /* Custom scrollbar on the left */
    .custom-scrollbar {
        position: relative;
    }
    
    .vignette-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        background: radial-gradient(
            ellipse 60% 50% at calc(50% + var(--vignette-x, 0px)) calc(50% + var(--vignette-y, 0px)),
            transparent 20%,
            rgba(0, 0, 0, 0.1) 40%,
            rgba(0, 0, 0, 0.3) 70%,
            rgba(0, 0, 0, 0.6) 100%
        );
        backdrop-filter: blur(0.5px);
        transition: all 0.1s ease-out;
        z-index: 10;
    }
</style>