import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import seedrandom from 'seedrandom';
import './index.css'; // Tailwindを使うために必須

export const PhysicsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- 描画ループ（毎フレームでワールドを再生成し 0→frame まで進めて描画） ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rng = seedrandom('hello-tailwind');
    const engine = Matter.Engine.create();
    const bodies: Matter.Body[] = [];

    // 床と壁
    bodies.push(
      Matter.Bodies.rectangle(width / 2, height, width, 50, { isStatic: true }),
      Matter.Bodies.rectangle(0, height / 2, 50, height, { isStatic: true }),
      Matter.Bodies.rectangle(width, height / 2, 50, height, { isStatic: true })
    );

    // 障害物
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c <= r; c++) {
        const x = width / 2 - (r * 60) / 2 + c * 60;
        const y = 500 + r * 60;
        bodies.push(Matter.Bodies.circle(x, y, 8, { isStatic: true, render: { fillStyle: '#eee' } }));
      }
    }

    // ボール（Tailwindっぽいカラーパレット）
    const colors = ['#F87171', '#60A5FA', '#34D399', '#FBBF24'];
    for (let i = 0; i < 250; i++) {
      const x = width / 2 + (rng() - 0.5) * 40;
      const y = -i * 30 - 100;
      bodies.push(Matter.Bodies.circle(x, y, 12, {
        restitution: 0.9,
        render: { fillStyle: colors[Math.floor(rng() * colors.length)] }
      }));
    }

    Matter.World.add(engine.world, bodies);

    for (let i = 0; i < frame; i++) {
      Matter.Engine.update(engine, 1000 / fps);
    }

    // 描画
    ctx.clearRect(0, 0, width, height);

    const allBodies = Matter.Composite.allBodies(engine.world);
    allBodies.forEach((body) => {
      if (body.bounds.max.y < 0) return;
      ctx.beginPath();
      const vertices = body.vertices;
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let j = 1; j < vertices.length; j++) {
        ctx.lineTo(vertices[j].x, vertices[j].y);
      }
      ctx.lineTo(vertices[0].x, vertices[0].y);
      ctx.fillStyle = body.render.fillStyle || '#fff';
      ctx.fill();
    });
  }, [frame, width, height, fps]);

  return (
    <AbsoluteFill className="bg-zinc-900 flex justify-center items-center">
      {/* 1. 物理演算レイヤー */}
      <canvas ref={canvasRef} width={width} height={height} className="absolute inset-0" />

      {/* 2. テキストレイヤー (Tailwindで装飾) */}
      <div className="absolute top-32 text-center w-full z-10">
        <h1 className="text-8xl font-black text-white drop-shadow-2xl tracking-tighter">
          PHYSICS<span className="text-blue-500">.JS</span>
        </h1>
        <div className="mt-4 bg-white/10 backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/20">
          <p className="text-3xl text-gray-200 font-bold font-mono">
            Frame: <span className="text-yellow-400">{frame}</span>
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
