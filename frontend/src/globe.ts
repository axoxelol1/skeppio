import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import Stats from "three/addons/libs/stats.module.js";
import GUI from "lil-gui";

const globeRadius = 1;

function latLonToCartesian(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const LONGITUDE_OFFSET_DEGREES = 90;

  const latRad = lat * (Math.PI / 180);
  const lonRad = (lon + LONGITUDE_OFFSET_DEGREES) * (Math.PI / 180);

  const x_calc = radius * Math.cos(latRad) * Math.cos(lonRad);
  const z_calc = radius * Math.cos(latRad) * Math.sin(lonRad);
  const y_calc = radius * Math.sin(latRad);

  return new THREE.Vector3(z_calc, y_calc, x_calc);
}

export function setup() {
  const gui = new GUI();
  const settings = {
    rotationSpeed: 0,
    shipCount: 0,
    status: "Connecting...",
  };
  gui.add(settings, "rotationSpeed", 0, 1, 0.01);
  gui.add(settings, "shipCount").listen().disable();
  gui.add(settings, "status").listen().disable();

  const canvas = document.querySelector("canvas.webgl") as Element;

  const scene = new THREE.Scene();

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const textureLoader = new THREE.TextureLoader();
  const earthDayTexture = textureLoader.load("./earth/8k_earth_daymap.jpg");
  earthDayTexture.colorSpace = THREE.SRGBColorSpace;

  const earthGeometry = new THREE.SphereGeometry(globeRadius, 64, 64);
  const earth = new THREE.Mesh(
    earthGeometry,
    new THREE.MeshStandardMaterial({
      map: earthDayTexture,
      roughness: 0.7,
      metalness: 0.1,
    }),
  );
  scene.add(earth);

  const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
  };

  window.addEventListener("resize", () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(sizes.pixelRatio);
  });

  const camera = new THREE.PerspectiveCamera(
    25,
    sizes.width / sizes.height,
    0.1,
    100,
  );
  camera.position.x = 4;
  camera.position.y = 1.5;
  camera.position.z = 3;
  scene.add(camera);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const controls = new OrbitControls(camera, canvas as HTMLElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.1;
  controls.maxDistance = 10;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
  });
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
  renderer.setClearColor("#000000");

  const maxShips = 1_000_000;
  const shipPositions = new Float32Array(maxShips * 3);
  const shipColors = new Float32Array(maxShips * 3);

  const shipGeometry = new THREE.BufferGeometry();
  shipGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(shipPositions, 3),
  );
  shipGeometry.setAttribute("color", new THREE.BufferAttribute(shipColors, 3));

  const shipMaterial = new THREE.PointsMaterial({
    size: 0.01,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });

  const shipPoints = new THREE.Points(shipGeometry, shipMaterial);
  earth.add(shipPoints);

  const shipIndexMap: Map<string, number> = new Map();

  const ws_url = import.meta.env.PROD
    ? `wss://${window.location.hostname}/ws`
    : `ws://${window.location.hostname}:8080/ws`;
  let socket: WebSocket | null = null;
  let reconnectTimeout: number | null = null;

  function connect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    settings.status = "Connecting...";

    socket = new WebSocket(ws_url);

    socket.onopen = () => {
      settings.status = "Connected";
      console.log("WebSocket Connected");
    };

    socket.onmessage = (event) => {
      try {
        let { name, latitude, longitude } = JSON.parse(event.data);
        name = name.trim();

        if (!shipIndexMap.has(name)) {
          if (settings.shipCount >= maxShips) return;
          shipIndexMap.set(name, settings.shipCount);

          const idx = settings.shipCount * 3;
          shipColors[idx] = Math.random();
          shipColors[idx + 1] = Math.random();
          shipColors[idx + 2] = Math.random();

          settings.shipCount++;
          shipGeometry.attributes.color.needsUpdate = true;
        }

        const index = shipIndexMap.get(name)!;
        const pos = latLonToCartesian(latitude, longitude, globeRadius);

        shipPositions[index * 3] = pos.x;
        shipPositions[index * 3 + 1] = pos.y;
        shipPositions[index * 3 + 2] = pos.z;

        shipGeometry.attributes.position.needsUpdate = true;
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    socket.onclose = (event) => {
      settings.status = "Disconnected. Retrying...";
      console.warn(`Socket closed. Reconnecting in 5...`, event.reason);

      reconnectTimeout = window.setTimeout(() => {
        connect();
      }, 5000);
    };

    socket.onerror = (error) => {
      settings.status = "Error occurred";
      console.error("WebSocket error:", error);
      socket?.close();
    };
  }
  connect();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(sizes.width, sizes.height),
      0.2,
      0.4,
      0.85,
    ),
  );

  const clock = new THREE.Clock();

  const tick = () => {
    stats.begin();
    const elapsedTime = clock.getElapsedTime();

    earth.rotation.y = elapsedTime * settings.rotationSpeed;
    controls.update();

    composer.render();

    window.requestAnimationFrame(tick);
    stats.end();
  };

  tick();
}
