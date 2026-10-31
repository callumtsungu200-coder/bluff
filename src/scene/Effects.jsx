import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

// Post-processing for the futuristic look: a subtle bloom that only the emissive edges reach
// (rim line, seat posts, the hologram). Scene lazy-loads this module and mounts it only for the
// Futuristic theme with motion on, so Classic and reduced-motion users never download the
// post-processing stack. Off on very small canvases, where the cost shows and the glow does not.

const MIN_W = 480;
const MIN_H = 320;

export default function Effects() {
  const { size } = useThree();
  if (size.width < MIN_W || size.height < MIN_H) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.25} intensity={0.6} radius={0.7} mipmapBlur />
    </EffectComposer>
  );
}
