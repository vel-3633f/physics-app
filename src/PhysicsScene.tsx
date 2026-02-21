import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import React, { useEffect, useRef, useMemo } from "react";
import Matter from "matter-js";
import seedrandom from "seedrandom";
import "./index.css";

const GOAL_THRESHOLD = 25; // 先にこの数ゴールに入れたチームの勝ち
const GOAL_ZONE_HEIGHT = 80; // 画面下端からこの高さをゴールとする

type Team = "red" | "blue";

type FrameSnapshot = {
  bodies: {
    vertices: { x: number; y: number }[];
    fillStyle: string;
    team?: Team;
  }[];
  redInGoal: number;
  blueInGoal: number;
  winner: Team | null;
};

export const PhysicsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frameSnapshots = useMemo<FrameSnapshot[]>(() => {
    const rng = seedrandom("hello-tailwind");
    const engine = Matter.Engine.create();
    const bodies: Matter.Body[] = [];

    bodies.push(
      Matter.Bodies.rectangle(width / 2, height, width, 50, { isStatic: true }),
      Matter.Bodies.rectangle(0, height / 2, 50, height, { isStatic: true }),
      Matter.Bodies.rectangle(width, height / 2, 50, height, {
        isStatic: true,
      }),
    );

    // 障害物
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c <= r; c++) {
        const x = width / 2 - (r * 60) / 2 + c * 60;
        const y = 500 + r * 60;
        bodies.push(
          Matter.Bodies.circle(x, y, 8, {
            isStatic: true,
            render: { fillStyle: "#eee" },
          }),
        );
      }
    }

    // ボール：赤チーム vs 青チーム（レース用）
    const goalY = height - GOAL_ZONE_HEIGHT;
    const redColor = "#F87171";
    const blueColor = "#60A5FA";
    for (let i = 0; i < 250; i++) {
      const team: Team = i % 2 === 0 ? "red" : "blue";
      const x = width / 2 + (rng() - 0.5) * 40;
      const y = -i * 30 - 100;
      const body = Matter.Bodies.circle(x, y, 12, {
        restitution: 0.9,
        render: {
          fillStyle: team === "red" ? redColor : blueColor,
        },
      });
      (body as Matter.Body & { team: Team }).team = team;
      bodies.push(body);
    }

    Matter.World.add(engine.world, bodies);

    const snapshots: FrameSnapshot[] = [];
    const dt = 1000 / fps;
    let decidedWinner: Team | null = null;

    for (let f = 0; f < durationInFrames; f++) {
      const allBodies = Matter.Composite.allBodies(engine.world);
      let redInGoal = 0;
      let blueInGoal = 0;

      const snapshotBodies = allBodies.map((body) => {
        const team = (body as Matter.Body & { team?: Team }).team;
        const vertices = body.vertices.map((v) => ({ x: v.x, y: v.y }));
        const fillStyle = body.render.fillStyle || "#fff";

        if (team === "red" || team === "blue") {
          const centerY =
            vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
          if (centerY >= goalY) {
            if (team === "red") redInGoal++;
            else blueInGoal++;
          }
        }

        return {
          vertices,
          fillStyle,
          ...(team && { team }),
        };
      });

      if (decidedWinner === null) {
        if (redInGoal >= GOAL_THRESHOLD) decidedWinner = "red";
        else if (blueInGoal >= GOAL_THRESHOLD) decidedWinner = "blue";
      }

      snapshots.push({
        bodies: snapshotBodies,
        redInGoal,
        blueInGoal,
        winner: decidedWinner,
      });
      Matter.Engine.update(engine, dt);
    }

    return snapshots;
  }, [width, height, fps, durationInFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const snapshot = frameSnapshots[Math.min(frame, frameSnapshots.length - 1)];
    if (!snapshot) return;

    ctx.clearRect(0, 0, width, height);

    snapshot.bodies.forEach(({ vertices, fillStyle }) => {
      if (vertices.length === 0) return;
      const maxY = Math.max(...vertices.map((v) => v.y));
      if (maxY < 0) return;

      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let j = 1; j < vertices.length; j++) {
        ctx.lineTo(vertices[j].x, vertices[j].y);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
    });

    // ゴールゾーン：左半分は赤・右半分は青の帯で「どっちの陣地か」が一目でわかるように
    const goalY = height - GOAL_ZONE_HEIGHT;
    const half = width / 2;
    ctx.fillStyle = "rgba(248, 113, 113, 0.35)";
    ctx.fillRect(0, goalY, half, GOAL_ZONE_HEIGHT);
    ctx.fillStyle = "rgba(96, 165, 250, 0.35)";
    ctx.fillRect(half, goalY, half, GOAL_ZONE_HEIGHT);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, goalY, width, GOAL_ZONE_HEIGHT);
    ctx.beginPath();
    ctx.moveTo(half, goalY);
    ctx.lineTo(half, goalY + GOAL_ZONE_HEIGHT);
    ctx.stroke();
    // 「GOAL」ラベル
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GOAL", width / 2, goalY + GOAL_ZONE_HEIGHT / 2 + 10);
  }, [frame, width, height, frameSnapshots]);

  const currentSnapshot =
    frameSnapshots[Math.min(frame, frameSnapshots.length - 1)];
  const redInGoal = currentSnapshot?.redInGoal ?? 0;
  const blueInGoal = currentSnapshot?.blueInGoal ?? 0;
  const winner = currentSnapshot?.winner ?? null;

  return (
    <AbsoluteFill className="bg-zinc-900 flex justify-center items-center">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0"
      />

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

      {/* レース: 赤 vs 青 スコア（ゴール上の見やすいパネル） */}
      <div className="absolute left-0 right-0 z-10 flex justify-center gap-20 px-6">
        <div
          className="rounded-2xl px-10 py-5 text-center shadow-2xl border-4 border-red-400 bg-red-600/90 backdrop-blur-sm"
          style={{ bottom: GOAL_ZONE_HEIGHT + 24 }}
        >
          <p className="text-red-100 text-xs font-bold uppercase tracking-widest mb-1">
            赤チーム
          </p>
          <p className="text-5xl font-black text-white tabular-nums leading-none">
            {redInGoal}
            <span className="text-2xl font-bold text-red-200">
              /{GOAL_THRESHOLD}
            </span>
          </p>
          <p className="text-red-200/90 text-sm mt-1">ゴールに入った数</p>
        </div>
        <div
          className="rounded-2xl px-10 py-5 text-center shadow-2xl border-4 border-blue-400 bg-blue-600/90 backdrop-blur-sm"
          style={{ bottom: GOAL_ZONE_HEIGHT + 24 }}
        >
          <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-1">
            青チーム
          </p>
          <p className="text-5xl font-black text-white tabular-nums leading-none">
            {blueInGoal}
            <span className="text-2xl font-bold text-blue-200">
              /{GOAL_THRESHOLD}
            </span>
          </p>
          <p className="text-blue-200/90 text-sm mt-1">ゴールに入った数</p>
        </div>
      </div>

      {/* 勝者表示：目立つバナー */}
      {winner && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div
            className={`w-full max-w-2xl mx-6 py-8 rounded-3xl border-4 shadow-2xl text-center ${
              winner === "red"
                ? "bg-red-600 border-red-300 text-white"
                : "bg-blue-600 border-blue-300 text-white"
            }`}
          >
            <p className="text-2xl font-bold opacity-90 mb-1">
              {winner === "red" ? "赤チーム" : "青チーム"}の勝ち！
            </p>
            <p className="text-6xl md:text-7xl font-black uppercase tracking-widest drop-shadow-lg">
              {winner} wins!
            </p>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
