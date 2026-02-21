import { Composition } from 'remotion';
import { PhysicsScene } from './PhysicsScene';
import './index.css'; // 重要

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PhysicsSimulation"
        component={PhysicsScene}
        durationInFrames={900} // 30秒
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
