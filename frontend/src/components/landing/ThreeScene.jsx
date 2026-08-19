import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ThreeScene — a real, lit, rotating mesh, for the /styles comparison.
 *
 * Only imported through a lazy() boundary in StyleLab, so three.js never lands
 * in the product bundle. Check the build output: it comes out as its own chunk.
 *
 * Deliberately not a Spline embed and not an amorphous blob. Blob heroes are the
 * current Framer/v0 default and would land straight back in the look this whole
 * exercise is trying to get away from. This is a faceted icosahedron with a
 * clear light direction, so it reads as an object with a material rather than a
 * gradient that happens to move.
 *
 * Colours are pulled from the surrounding palette's CSS variables at mount, so
 * the object belongs to whichever scope it is rendered inside instead of
 * carrying its own hardcoded hues.
 */

function readVar(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export default function ThreeScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Respect the same preference the grain overlay does: no ambient motion for
    // users who asked for a calmer interface.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const width = mount.clientWidth;
    const height = 300;

    const accent = readVar(mount, '--color-accent', '#e03c1f');
    const canvasCol = readVar(mount, '--color-canvas', '#141110');
    const inkCol = readVar(mount, '--color-ink', '#f7f2ea');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(canvasCol);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // No WebGL (older machine, hardware acceleration off, some VMs). Bail out
      // rather than throwing inside an effect and blanking the page.
      mount.textContent = 'WebGL unavailable on this device';
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(1.5, 0);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accent),
      roughness: 0.32,
      metalness: 0.15,
      flatShading: true, // facets, so the light direction is legible
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // A wireframe shell in ink, slightly larger — gives the object an edge and
    // ties it to the palette's text colour rather than leaving it a lone blob.
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.53, 0),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(inkCol),
        wireframe: true,
        transparent: true,
        opacity: 0.14,
      }),
    );
    scene.add(shell);

    // One clear key light plus a soft fill: the same single-light-source rule
    // the CSS depth treatments follow, so the two read as one system.
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(inkCol), 0.5);
    rim.position.set(-4, -1, -2);
    scene.add(rim);

    let frame;
    let pointerX = 0;
    let pointerY = 0;

    const onPointer = e => {
      const rect = mount.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    mount.addEventListener('pointermove', onPointer);

    const onResize = () => {
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', onResize);

    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (!reduced) {
        mesh.rotation.y = t * 0.35 + pointerX * 0.4;
        mesh.rotation.x = Math.sin(t * 0.25) * 0.18 + pointerY * 0.25;
      } else {
        mesh.rotation.set(0.2, 0.6, 0);
      }
      shell.rotation.copy(mesh.rotation);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      mount.removeEventListener('pointermove', onPointer);
      // Explicit teardown: WebGL contexts are a limited resource and React will
      // mount/unmount this repeatedly during development.
      geometry.dispose();
      material.dispose();
      shell.geometry.dispose();
      shell.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="overflow-hidden rounded-[12px] border border-line"
      style={{ height: 300 }}
      aria-hidden="true"
    />
  );
}
