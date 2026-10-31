import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { THEME, CARD_D } from './textures.js';
import { DECK_POS, PILE_POS, pileSlot, pileTop, deckDrawn, PILE_STEP } from './layout.js';
import Card, { CARD_GEOMETRY, cardMaterials } from './Card.jsx';
import { useStore } from '../store.js';

// The middle of the table: the deck (only during the deal), the face-down pile, and the ring that
// pulses around the pile when the turn changes.
//
// The pile is a real stack: every card is the shared card box, one card thickness above the last,
// each with its own fixed scatter (layout.js pileSlot). The top PILE_SHOWN cards are drawn one by
// one; anything under them is one slab of the same stock, so a deep pile stays cheap. A card that
// has just landed settles with a short spring from where its flight ends (PILE_DROP above its slot).

const FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // face down
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export const PILE_SHOWN = 16;
export const PILE_DROP = 0.035; // flights end this far above the slot; the card settles the rest
const SETTLE = { tension: 420, friction: 22 };

// Where the "N cards" label hangs, just in front of the pile.
export const PILE_LABEL_ANCHOR = new THREE.Vector3(PILE_POS.x, 0.02, PILE_POS.z + 0.75);

// The pickup flight tells the pile to hide its top cards the moment it starts (the flying cards
// stand in for them), the same way the fans do (OpponentSeat FAN_LIVE). { depart(count) }.
export const PILE_LIVE = { depart: null };

function Deck({ size, theme }) {
  const n = deckDrawn(size);
  if (n === 0) return null;
  return (
    <group position={[DECK_POS.x, 0, DECK_POS.z]}>
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} theme={theme} position={[i * -0.0015, CARD_D / 2 + i * PILE_STEP, i * 0.001]} quaternion={FLAT_DOWN} />
      ))}
    </group>
  );
}

function PileCard({ index, theme, reduceMotion }) {
  const slot = useMemo(() => pileSlot(index), [index]);
  const { y, s } = useSpring({
    from: { y: slot.position.y + PILE_DROP, s: 1.02 },
    to: { y: slot.position.y, s: 1 },
    config: SETTLE,
    immediate: reduceMotion,
  });
  return (
    <animated.group position-x={slot.position.x} position-y={y} position-z={slot.position.z} rotation={[Math.PI / 2, 0, slot.rotY]} scale={s}>
      <Card theme={theme} />
    </animated.group>
  );
}

function PileCards({ size, theme }) {
  const reduceMotion = useStore((s) => s.reduceMotion);
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    PILE_LIVE.depart = (n) => setHidden((h) => h + n);
    return () => { PILE_LIVE.depart = null; };
  }, []);
  // The game state caught up (the pile shrank, or a new pile started): nothing is pending any more.
  const last = useRef(size);
  useLayoutEffect(() => {
    if (size !== last.current) { last.current = size; setHidden(0); }
  }, [size]);

  const shown = Math.max(0, size - hidden);
  const slabCards = Math.max(0, shown - PILE_SHOWN);
  const slabH = pileTop(slabCards);
  const slabMaterials = useMemo(() => cardMaterials(null, theme), [theme]);
  const cards = [];
  for (let i = slabCards; i < shown; i++) cards.push(<PileCard key={i} index={i} theme={theme} reduceMotion={reduceMotion} />);
  return (
    <group>
      {slabCards > 0 && (
        <mesh
          geometry={CARD_GEOMETRY}
          material={slabMaterials}
          position={[PILE_POS.x, slabH / 2, PILE_POS.z]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, 1, slabH / CARD_D]}
          castShadow
          receiveShadow
        />
      )}
      {cards}
    </group>
  );
}

function Ring({ turn, theme }) {
  const ref = useRef();
  const t0 = useRef(performance.now());
  useEffect(() => { t0.current = performance.now(); }, [turn]);
  useFrame(() => {
    if (!ref.current) return;
    if (useStore.getState().reduceMotion) { ref.current.material.opacity = 0; return; }
    const t = Math.min(1, (performance.now() - t0.current) / 1200);
    const e = easeOut(t);
    ref.current.scale.setScalar(1 + e * 0.5);
    ref.current.material.opacity = (1 - e) * 0.55;
  });
  const future = theme === 'future';
  return (
    <group position={[PILE_POS.x, 0.006, PILE_POS.z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.95, 0.97, 96]} />
        <meshBasicMaterial color={future ? THEME.future.accent : '#ffffff'} transparent opacity={future ? 0.24 : 0.16} depthWrite={false} toneMapped={!future} />
      </mesh>
      <mesh ref={ref} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.95, 0.99, 96]} />
        <meshBasicMaterial color={THEME[theme].accent} transparent opacity={0} depthWrite={false} toneMapped={!future} />
      </mesh>
    </group>
  );
}

export default function Pile({ pileSize, deckSize, turn, theme }) {
  return (
    <>
      <Ring turn={turn} theme={theme} />
      <Deck size={deckSize} theme={theme} />
      <PileCards size={pileSize} theme={theme} />
    </>
  );
}
