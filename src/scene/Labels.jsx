import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// DOM labels placed over the canvas from 3D anchors (name plates, the pile count).
//
// Plain DOM in the Scene's own React tree, projected each frame from inside the Canvas. drei's
// <Html> opens a separate React root per label, and React 19 StrictMode unmounts that root
// synchronously inside the Canvas commit ("Attempted to synchronously unmount a root..."), so the
// labels live here instead: no nested roots, and the plates share the app's React context.
//
//   <Label registry anchor layer clamp room edge>
//                                         a DOM node that follows a world position; `clamp` keeps
//                                         the whole node inside the stage (CLAMP_PAD from the edge),
//                                         for the side seats' plates on narrow screens; `room` (px)
//                                         says the node has something hanging over it (the plate's
//                                         speech bubble) that needs that much headroom: when the
//                                         node's top edge comes nearer the stage's top than that, the
//                                         node gets data-tight="right" or "left" (the side with more
//                                         stage) and the CSS moves the bubble beside the node; `edge`
//                                         is a second world point (the middle of a seat panel's right
//                                         edge) whose screen offset from the node is written to the
//                                         node as --dx and --dy, in px, so the CSS can put the bubble
//                                         beside something drawn in the scene
//   <LabelTracker registry>                inside the Canvas; writes the transforms
//   OVERLAY_STYLE                          for the div that holds the labels over the canvas
//
// The tracker gives every label a large z-index (layer, then depth), so the overlay isolates its own
// stacking context: the plates order among themselves and never rise above the sheets, the verdict
// label or the loading screen that sit over the stage.

export const OVERLAY_STYLE = { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', isolation: 'isolate' };
const LABEL_STYLE = { position: 'absolute', left: 0, top: 0, visibility: 'hidden', willChange: 'transform' };
const CLAMP_PAD = 4;
// A tight label stays tight until it has this much headroom over `room` again, so the reveal's
// camera nudge and a small drag of the view never flip a bubble back and forth.
const TIGHT_SLACK = 16;
const TIGHT_LEFT_FROM = 0.6; // labels right of this fraction of the stage put their bubble on the left

export function Label({ registry, anchor, layer = 0, clamp = false, room = 0, edge = null, children }) {
  const el = useRef();
  useLayoutEffect(() => {
    const node = el.current;
    const entry = {
      el: node, anchor, layer, clamp, room, edge,
      x: -1e9, y: -1e9, dx: -1e9, dy: -1e9, depth: -1, shown: false, tight: node.dataset.tight || '',
    };
    registry.add(entry);
    return () => { registry.delete(entry); };
  }, [registry, anchor, layer, clamp, room, edge]);
  return <div ref={el} style={LABEL_STYLE}>{children}</div>;
}

export function LabelTracker({ registry }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    registry.forEach((l) => {
      v.copy(l.anchor).project(camera);
      const shown = v.z < 1;
      let x = (v.x * 0.5 + 0.5) * size.width;
      let y = (0.5 - v.y * 0.5) * size.height;
      let hh = 0;
      if (l.clamp || l.room) {
        // the node is centred on (x, y); offsetWidth/Height are cheap here as nothing has dirtied layout
        hh = l.el.offsetHeight / 2;
        if (l.clamp) {
          const hw = l.el.offsetWidth / 2;
          x = Math.min(Math.max(x, hw + CLAMP_PAD), size.width - hw - CLAMP_PAD);
          y = Math.min(Math.max(y, hh + CLAMP_PAD), size.height - hh - CLAMP_PAD);
        }
      }
      if (Math.abs(x - l.x) > 0.05 || Math.abs(y - l.y) > 0.05) {
        l.x = x; l.y = y;
        l.el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
      if (l.room) {
        const headroom = y - hh;
        const tight = headroom < (l.tight ? l.room + TIGHT_SLACK : l.room);
        if (tight && !l.tight) {
          l.tight = x > size.width * TIGHT_LEFT_FROM ? 'left' : 'right';
          l.el.dataset.tight = l.tight;
        } else if (!tight && l.tight) {
          l.tight = '';
          delete l.el.dataset.tight;
        }
      }
      if (l.edge) {
        v.copy(l.edge).project(camera);
        const dx = (v.x * 0.5 + 0.5) * size.width - x;
        const dy = (0.5 - v.y * 0.5) * size.height - y;
        if (Math.abs(dx - l.dx) > 0.5 || Math.abs(dy - l.dy) > 0.5) {
          l.dx = dx; l.dy = dy;
          l.el.style.setProperty('--dx', `${dx.toFixed(1)}px`);
          l.el.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        }
      }
      // Nearer labels stack on top of farther ones within a layer.
      const depth = l.layer * 100000 + Math.round((1 - v.z) * 1e5);
      if (depth !== l.depth) { l.depth = depth; l.el.style.zIndex = String(depth); }
      if (shown !== l.shown) { l.shown = shown; l.el.style.visibility = shown ? 'visible' : 'hidden'; }
    });
  });
  return null;
}
