import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import React, { useEffect, useRef, useMemo } from "react";
import Matter from "matter-js";
import "./index.css";

type CollisionEvent = {
  frame: number;
  platformIndex: number;
  velocity: number;
};

type FrameSnapshot = {
  bodies: {
    vertices: { x: number; y: number }[];
    fillStyle: string;
    isBall?: boolean;
  }[];
  collisions: CollisionEvent[];
  ballY: number;
  virtualBallY: number;
};

const _createSlopes = () => {
  const platforms: Matter.Body[] = [];
  const segmentWidth = 300;
  const numSegments = 25;
  
  const baseAngle = 35 * (Math.PI / 180);
  const baseSlopeRatio = Math.tan(baseAngle);
  const startX = 0;
  const startY = 100;
  const waveAmplitude = 40;
  const wavelength = 600;

  for (let i = 0; i < numSegments; i++) {
    const x1 = startX + i * segmentWidth;
    const x2 = startX + (i + 1) * segmentWidth;
    
    const baseY1 = startY + x1 * baseSlopeRatio;
    const waveOffset1 = waveAmplitude * Math.sin((x1 / wavelength) * Math.PI * 2);
    const y1 = baseY1 + waveOffset1;
    
    const baseY2 = startY + x2 * baseSlopeRatio;
    const waveOffset2 = waveAmplitude * Math.sin((x2 / wavelength) * Math.PI * 2);
    const y2 = baseY2 + waveOffset2;
    
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const localAngle = Math.atan2(y2 - y1, x2 - x1);
    const segmentLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

    const slope = Matter.Bodies.rectangle(
      centerX,
      centerY,
      segmentLength + 5,
      30,
      {
        isStatic: true,
        render: { fillStyle: "#8B4513" },
        friction: 0.5,
        angle: localAngle,
      }
    );
    (slope as Matter.Body & { platformIndex: number }).platformIndex = i;
    platforms.push(slope);
  }

  return platforms;
};

const _synthesizeBounceSound = (
  velocity: number,
  duration: number,
  sampleRate: number,
): Float32Array => {
  const samples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(samples);
  const frequency = 200 + velocity * 50;

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-8 * t);
    const sound = Math.sin(2 * Math.PI * frequency * t * (1 - t * 2));
    buffer[i] = envelope * sound * 0.4;
  }

  return buffer;
};

export const PhysicsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const { frameSnapshots, allCollisions } = useMemo(() => {
    const engine = Matter.Engine.create();
    engine.gravity.y = 2.0;
    engine.timing.timeScale = 1;
    const bodies: Matter.Body[] = [];

    bodies.push(
      Matter.Bodies.rectangle(width / 2, 10000, width, 50, {
        isStatic: true,
        render: { fillStyle: "#333" },
      }),
      Matter.Bodies.rectangle(-25, 2500, 50, 5000, {
        isStatic: true,
        render: { fillStyle: "#333" },
      }),
      Matter.Bodies.rectangle(width + 25, 2500, 50, 5000, {
        isStatic: true,
        render: { fillStyle: "#333" },
      }),
    );

    const platforms = _createSlopes();
    bodies.push(...platforms);

    const ball = Matter.Bodies.circle(100, 50, 35, {
      restitution: 0.7,
      friction: 0.1,
      density: 0.008,
      slop: 0.05,
      render: { fillStyle: "#9333EA" },
    });
    Matter.Body.setVelocity(ball, { x: 5, y: 2 });
    (ball as Matter.Body & { isBall: boolean }).isBall = true;
    bodies.push(ball);

    Matter.World.add(engine.world, bodies);

    const collisions: CollisionEvent[] = [];
    const collisionMap = new Map<string, number>();

    Matter.Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA as Matter.Body & {
          isBall?: boolean;
          platformIndex?: number;
        };
        const bodyB = pair.bodyB as Matter.Body & {
          isBall?: boolean;
          platformIndex?: number;
        };

        let ballBody: typeof bodyA | null = null;
        let platformBody: typeof bodyA | null = null;

        if (bodyA.isBall && bodyB.platformIndex !== undefined) {
          ballBody = bodyA;
          platformBody = bodyB;
        } else if (bodyB.isBall && bodyA.platformIndex !== undefined) {
          ballBody = bodyB;
          platformBody = bodyA;
        }

        if (ballBody && platformBody) {
          const key = `${currentFrame}-${platformBody.platformIndex}`;
          if (!collisionMap.has(key)) {
            collisionMap.set(key, 1);
            const velocity = Math.abs(ballBody.velocity.y);
            collisions.push({
              frame: currentFrame,
              platformIndex: platformBody.platformIndex!,
              velocity,
            });
          }
        }
      });
    });

    const snapshots: FrameSnapshot[] = [];
    const dt = 1000 / fps;
    let currentFrame = 0;

    for (let f = 0; f < durationInFrames; f++) {
      currentFrame = f;

      Matter.Engine.update(engine, dt / 2);
      Matter.Engine.update(engine, dt / 2);

      const allBodies = Matter.Composite.allBodies(engine.world);

      const snapshotBodies = allBodies.map((body) => {
        const bodyWithFlags = body as Matter.Body & { isBall?: boolean };
        const vertices = body.vertices.map((v) => ({ x: v.x, y: v.y }));
        const fillStyle = body.render.fillStyle || "#fff";

        return {
          vertices,
          fillStyle,
          isBall: bodyWithFlags.isBall,
        };
      });

      snapshots.push({
        bodies: snapshotBodies,
        collisions: [],
        ballY: ball.position.y,
        virtualBallY: ball.position.x,
      });
    }

    return { frameSnapshots: snapshots, allCollisions: collisions };
  }, [width, height, fps, durationInFrames]);

  useEffect(() => {
    const collisionsAtFrame = allCollisions.filter((c) => c.frame === frame);
    if (collisionsAtFrame.length > 0 && typeof window !== "undefined") {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      collisionsAtFrame.forEach((collision) => {
        const ctx = audioContextRef.current!;
        const sampleRate = ctx.sampleRate;
        const duration = 0.3;

        const audioBuffer = _synthesizeBounceSound(
          collision.velocity,
          duration,
          sampleRate,
        );
        const buffer = ctx.createBuffer(1, audioBuffer.length, sampleRate);
        buffer.copyToChannel(audioBuffer, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(ctx.currentTime);
      });
    }
  }, [frame, allCollisions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const snapshot = frameSnapshots[Math.min(frame, frameSnapshots.length - 1)];
    if (!snapshot) return;

    const cameraX = snapshot.virtualBallY - width / 2;
    const cameraY = snapshot.ballY - height * 0.4;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#1a1a2e");
    gradient.addColorStop(1, "#0f0f1e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    snapshot.bodies.forEach(({ vertices, fillStyle, isBall }) => {
      if (vertices.length === 0) return;

      if (isBall) {
        const centerX = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
        const centerY = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
        const radius = Math.sqrt(
          Math.pow(vertices[0].x - centerX, 2) +
            Math.pow(vertices[0].y - centerY, 2),
        );

        ctx.save();
        ctx.shadowColor = "rgba(147, 51, 234, 0.6)";
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10;

        const ballGradient = ctx.createRadialGradient(
          centerX - radius * 0.3,
          centerY - radius * 0.3,
          radius * 0.1,
          centerX,
          centerY,
          radius,
        );
        ballGradient.addColorStop(0, "#E9D5FF");
        ballGradient.addColorStop(0.3, "#C084FC");
        ballGradient.addColorStop(1, "#7C3AED");
        ctx.fillStyle = ballGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.beginPath();
        ctx.arc(
          centerX - radius * 0.4,
          centerY - radius * 0.4,
          radius * 0.25,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let j = 1; j < vertices.length; j++) {
          ctx.lineTo(vertices[j].x, vertices[j].y);
        }
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();

        if (fillStyle === "#8B4513") {
          ctx.strokeStyle = "#654321";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    });

    ctx.restore();
  }, [frame, width, height, frameSnapshots]);

  return (
    <AbsoluteFill className="bg-zinc-900 flex justify-center items-center">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0"
      />
    </AbsoluteFill>
  );
};
