import * as T from "../vendor/engine.mjs";
import { buildScene, metrics } from "./model.js";
const ISO = new T.Vector3(1.48, 1.03, 2.38).normalize();
export class Viewport {
  constructor(canvas, { pick, commitTransform, updateTransform }) {
    this.canvas = canvas;
    this.pick = pick;
    this.commitTransform = commitTransform;
    this.updateTransform = updateTransform;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(2501161, 6, 21);
    this.envRoom = new T.RoomEnvironment();
    const pm = new T.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(this.envRoom, 0.04);
    pm.dispose();
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.68;
    const hemi = new T.HemisphereLight(15134439, 6907982, 1.42);
    this.scene.add(hemi);
    this.light = new T.DirectionalLight(16773326, 2.7);
    this.light.position.set(-2, 4, 3);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.bias = -18e-5;
    this.light.shadow.normalBias = 1e-3;
    this.scene.add(this.light, this.light.target);
    const rim = new T.DirectionalLight(14215413, 1.55);
    rim.position.set(3, 2, -3);
    this.scene.add(rim);
    this.floor = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.26, depthWrite: false }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid = new T.GridHelper(24, 96, 7567468, 5857371);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.46;
    this.grid.material.toneMapped = false;
    this.grid.renderOrder = 2;
    this.grid.material.depthWrite = false;
    this.scene.add(this.grid);
    this.persp = new T.PerspectiveCamera(34, 1, 0.01, 100);
    this.ortho = new T.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
    this.camera = this.persp;
    this.camera.position.copy(ISO).multiplyScalar(4);
    this.controls = new T.OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.93;
    this.controls.addEventListener("change", () => this.invalidate());
    this.controls.enableDamping = false;
    this.gizmo = new T.TransformControls(this.camera, canvas);
    this.gizmo.setSize(0.72);
    this.gizmoHelper = this.gizmo.getHelper();
    this.scene.add(this.gizmoHelper);
    this.gizmo.addEventListener("change", () => this.invalidate());
    this.gizmo.addEventListener("objectChange", () => {
      if (this.gizmo.dragging && this.selected) this.updateTransform(this.selected, this.transform());
    });
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.controls.enabled = !e.value;
      if (e.value) {
        this.gizmoDrag = true;
      } else if (this.selected) {
        this.commitTransform(this.selected, this.transform());
      }
    });
    this.outline = new T.Box3Helper(new T.Box3(), 11980168);
    this.outline.material.transparent = true;
    this.outline.material.opacity = 0.52;
    this.outline.material.depthWrite = false;
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.mode = "select";
    this.grid.visible = true;
    this.wire = false;
    this.span = 2;
    this.view = "iso";
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 0) {
        this.start = [e.clientX, e.clientY];
        this.gizmoDrag = !!this.gizmo.dragging;
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      if (e.button !== 0 || !this.start) return;
      const delta = Math.hypot(e.clientX - this.start[0], e.clientY - this.start[1]);
      this.start = null;
      if (delta < 4 && !this.gizmoDrag && !this.gizmo.axis) {
        const bounds = canvas.getBoundingClientRect(), mouse = new T.Vector2((e.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (e.clientY - bounds.top) / bounds.height * 2);
        const ray = new T.Raycaster();
        ray.setFromCamera(mouse, this.camera);
        const hit = ray.intersectObjects(this.model?.root.children ?? [], true)[0];
        this.pick(hit?.object.userData.partId ?? null);
      }
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);
    this.resize();
  }
  invalidate() {
    if (this.next) return;
    this.next = requestAnimationFrame(() => {
      this.next = 0;
      this.renderer.render(this.scene, this.camera);
      this.axisUpdate?.(this.camera);
    });
  }
  resize() {
    const w = this.canvas.parentElement.clientWidth, h = this.canvas.parentElement.clientHeight;
    if (!w || !h) return;
    this.aspect = w / h;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    this.applyOrtho();
    if (this.model && this.lastWidth && Math.abs(w - this.lastWidth) > 100) this.frame(false);
    this.lastWidth = w;
    this.invalidate();
  }
  applyOrtho() {
    this.ortho.left = -this.span * this.aspect / 2;
    this.ortho.right = -this.ortho.left;
    this.ortho.top = this.span / 2;
    this.ortho.bottom = -this.span / 2;
    this.ortho.updateProjectionMatrix();
  }
  transform() {
    const o = this.model.objects.get(this.selected);
    return { position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(T.MathUtils.radToDeg), scale: o.scale.toArray() };
  }
  load(p) {
    this.gizmo.detach();
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
    }
    this.model = buildScene(p);
    this.scene.add(this.model.root);
    if (this.wire) this.setWire(true);
    this.select(this.selected);
    this.fitLighting();
    this.invalidate();
    return metrics(this.model.root);
  }
  fitLighting() {
    const box = new T.Box3().setFromObject(this.model.root, true);
    if (box.isEmpty()) box.set(new T.Vector3(-0.5, 0, -0.5), new T.Vector3(0.5, 1, 0.5));
    const c = box.getCenter(new T.Vector3()), s = Math.max(...box.getSize(new T.Vector3()).toArray(), 0.05);
    this.floor.position.set(c.x, box.min.y - s * 3e-3, c.z);
    this.floor.scale.setScalar(s * 90);
    this.grid.position.set(c.x, box.min.y - s * 2e-3, c.z);
    this.grid.scale.setScalar(s / 1.8);
    this.light.target.position.copy(c);
    this.light.position.copy(c).add(new T.Vector3(-2, 4, 3).multiplyScalar(s));
    Object.assign(this.light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: s * 0.1, far: s * 12 });
    this.light.shadow.camera.updateProjectionMatrix();
    for (const cam of [this.persp, this.ortho]) {
      cam.near = Math.max(1e-4, s * 1e-3);
      cam.far = Math.max(100, s * 200);
      cam.updateProjectionMatrix();
    }
    this.scene.fog.near = s * 3.6;
    this.scene.fog.far = s * 11;
    this.controls.minDistance = s * 0.07;
    this.controls.maxDistance = s * 40;
  }
  frame(selected = false, direction) {
    const target = selected && this.selected ? this.model.objects.get(this.selected) : this.model?.root;
    let bounds = target ? new T.Box3().setFromObject(target, true) : new T.Box3();
    if (bounds.isEmpty()) bounds.set(new T.Vector3(-0.5, 0, -0.5), new T.Vector3(0.5, 1, 0.5));
    const center = bounds.getCenter(new T.Vector3()), dir = (direction || this.camera.position.clone().sub(this.controls.target)).normalize();
    if (!dir.lengthSq()) dir.copy(ISO);
    const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), dir).normalize(), up = new T.Vector3().crossVectors(dir, right).normalize();
    const f = Math.tan(T.MathUtils.degToRad(this.persp.fov / 2));
    let dist = 0.01, half = 0.01;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const v = new T.Vector3(x, y, z).sub(center), need = Math.max(Math.abs(v.dot(right)) / (this.aspect || 1), Math.abs(v.dot(up)));
      dist = Math.max(dist, v.dot(dir) + need * 1.23 / f);
      half = Math.max(half, need);
    }
    this.span = half * 2.5;
    this.ortho.zoom = 1;
    this.applyOrtho();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center);
    this.controls.update();
    this.invalidate();
  }
  setView(id) {
    this.view = id;
    this.camera = id === "iso" ? this.persp : this.ortho;
    this.controls.object = this.camera;
    this.gizmo.camera = this.camera;
    const dirs = { iso: ISO, front: new T.Vector3(0, 0, 1), side: new T.Vector3(1, 0, 0), back: new T.Vector3(0, 0, -1), top: new T.Vector3(0, 1, 1e-4) };
    this.controls.enableRotate = id === "iso";
    this.frame(false, dirs[id]);
  }
  select(id, highlight = this.highlight) {
    this.highlight = highlight;
    this.selected = this.model?.objects.has(id) ? id : null;
    this.gizmo.detach();
    if (this.selected && this.mode !== "select") {
      this.gizmo.setMode(this.mode);
      this.gizmo.attach(this.model.objects.get(id));
    }
    this.outline.visible = false;
    if (this.highlight && this.selected && this.mode === "select") {
      this.outline.box.setFromObject(this.model.objects.get(id), true);
      this.outline.visible = !this.outline.box.isEmpty();
    }
    this.invalidate();
  }
  setMode(mode) {
    this.mode = mode;
    this.select(this.selected);
  }
  setWire(on) {
    this.wire = on;
    this.model?.root.traverse((o) => {
      if (o.isMesh) o.material.wireframe = on;
    });
    this.invalidate();
  }
  setGrid(on) {
    this.grid.visible = on;
    this.invalidate();
  }
}
