import * as THREE from 'three';

type DottedSurfaceOptions = {
    container: HTMLElement;
};

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

function isDesktopViewport(): boolean {
    try {
        return window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    } catch {
        return window.innerWidth >= 768;
    }
}

export function mountDottedSurface({ container }: DottedSurfaceOptions) {
    if (!container) return () => { };
    if (prefersReducedMotion()) return () => { };
    if (!isDesktopViewport()) return () => { };

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x041910, 1200, 9000);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 12000);
    camera.position.set(0, 240, 980);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(scene.fog.color, 0);

    container.appendChild(renderer.domElement);

    const SEPARATION = 120;
    const AMOUNTX = 52;
    const AMOUNTY = 70;

    const positions: number[] = [];
    const colors: number[] = [];

    const geometry = new THREE.BufferGeometry();

    for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
            const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
            const y = 0;
            const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;

            positions.push(x, y, z);

            const dist = Math.abs(z) / ((AMOUNTY * SEPARATION) / 2);
            const intensity = Math.max(0.22, 0.95 - dist * 0.9);
            colors.push(intensity * 0.68, intensity, intensity * 0.82);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 4.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    points.rotation.x = -Math.PI / 2.25;
    scene.add(points);

    let count = 0;
    let animationId = 0;

    const animate = () => {
        animationId = window.requestAnimationFrame(animate);

        const positionAttribute = geometry.attributes.position;
        const posArray = positionAttribute.array as Float32Array;
        const pulse = (Math.sin(count * 0.45) + 1) / 2;

        let i = 0;
        for (let ix = 0; ix < AMOUNTX; ix++) {
            for (let iy = 0; iy < AMOUNTY; iy++) {
                const idx = i * 3;
                posArray[idx + 1] =
                    Math.sin((ix + count) * 0.28) * 28 +
                    Math.sin((iy + count) * 0.42) * 28;
                i++;
            }
        }

        positionAttribute.needsUpdate = true;
        material.opacity = 0.72 + pulse * 0.12;
        material.size = 4.3 + pulse * 0.35;

        renderer.render(scene, camera);
        count += 0.1;
    };

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    animate();

    return () => {
        window.removeEventListener('resize', handleResize);
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        scene.remove(points);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    };
}
