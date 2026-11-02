"use client";

import { useEffect, useRef } from "react";

/**
 * Live, real-time 3D built with a plain 2D canvas and manual perspective
 * projection. No Three.js, no WebGL, no external CDN — keeps mobile data cost low.
 */
export default function Scene3D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resize)
      : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);

    // A cube plus a ground grid, projected by hand.
    const cube: [number, number, number][] = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    const edges: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    const project = (p: [number, number, number], t: number) => {
      const a = t * 0.00042;
      const b = t * 0.00027;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      const cosB = Math.cos(b), sinB = Math.sin(b);
      const x1 = p[0] * cosA - p[2] * sinA;
      const z1 = p[0] * sinA + p[2] * cosA;
      const y1 = p[1] * cosB - z1 * sinB;
      const z2 = p[1] * sinB + z1 * cosB;
      const depth = 4.6 + z2 * 0.55;
      const f = 165 / depth;
      return {
        x: width / 2 + x1 * f * 1.35,
        y: height / 2 - y1 * f * 1.05,
        z: depth,
      };
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // Ground grid, projected with the same camera.
      ctx.strokeStyle = "rgba(11,13,15,0.14)";
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i += 1) {
        const a = project([i * 0.72, 1.35, -3], t);
        const b = project([i * 0.72, 1.35, 3], t);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const c = project([-4.4, 1.35, i * 0.72], t);
        const d = project([4.4, 1.35, i * 0.72], t);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }

      const points = cube.map((p) => project(p, t));
      ctx.strokeStyle = "rgba(11,13,15,0.82)";
      ctx.lineWidth = 1.4;
      for (const [i, j] of edges) {
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[j].x, points[j].y);
        ctx.stroke();
      }
      ctx.fillStyle = "#0b0d0f";
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      frame += 1;
      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      void frame;
    };
  }, []);

  return (
    <div className="scene3d">
      <canvas ref={canvasRef} aria-label="Live real-time 3D scene" role="img" />
      <span className="scene3d-caption">Live · real-time 2D-canvas perspective</span>
    </div>
  );
}
