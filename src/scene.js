/**
 * Atom Pattern Generator - Scene Intermediate Representation (IR)
 *
 * Roles:
 * - structure: hairline lines (1 to 2px)
 * - accent: bolder curves (2.2x base)
 * - nodes: small solid dots at crossings/tangents, hollow rings, star nodes, glow dots
 * - arrows: arrowheads on open paths or spokes
 * - hidden: far side of 3D forms (dashed / dotted)
 * - guides: construction lines, rotated squares, center axes with ticks, guide circles
 */

export class Scene {
  constructor(width = 1000, height = 1000, margin = 60) {
    this.width = width;
    this.height = height;
    this.margin = margin;
    this.center = { x: width / 2, y: height / 2 };
    this.seedCounter = 1000;

    // Geometric element stores
    this.paths = [];      // { points, role, isClosed, allowOvershoot, allowBreak, isAccent, seed }
    this.dots = [];       // { x, y, r, filled, role, isGlow }
    this.arrows = [];     // { x, y, angle, size, filled, role }
    this.stars = [];      // { x, y, size, points, role }
    this.ticks = [];      // { p1, p2, role }

    // Flags for atom hint tracking
    this.hasLobe = false;
    this.hasParticleTrack = false;
    this.hasLatticeNodes = false;
    this.hasDotRidingCurve = false;
    this.hasNucleusOrCenterDot = false;
  }

  addPath(points, options = {}) {
    if (!points || points.length < 2) return;
    this.paths.push({
      points,
      role: options.role || 'structure',
      isClosed: options.isClosed ?? false,
      allowOvershoot: options.allowOvershoot ?? (!options.isClosed),
      allowBreak: options.allowBreak ?? true,
      isAccent: options.isAccent ?? false,
      seed: options.seed ?? ((this.seedCounter = (this.seedCounter + 9973) | 0) >>> 0)
    });
  }

  addDot(x, y, r = 2.5, options = {}) {
    this.dots.push({
      x,
      y,
      r,
      filled: options.filled ?? true,
      role: options.role || 'nodes',
      isGlow: options.isGlow ?? false
    });
  }

  addArrow(x, y, angle, size = 7, options = {}) {
    this.arrows.push({
      x,
      y,
      angle,
      size,
      filled: options.filled ?? false,
      role: options.role || 'arrows'
    });
  }

  addStarNode(x, y, size = 5, rays = 4, options = {}) {
    this.stars.push({
      x,
      y,
      size,
      rays,
      role: options.role || 'nodes'
    });
  }

  addTick(x1, y1, x2, y2, options = {}) {
    this.ticks.push({
      p1: { x: x1, y: y1 },
      p2: { x: x2, y: y2 },
      role: options.role || 'guides'
    });
  }

  // Atom-hint guarantee
  enforceAtomHint(prng) {
    const hasAnyHint =
      this.hasLobe ||
      this.hasParticleTrack ||
      this.hasLatticeNodes ||
      this.hasDotRidingCurve ||
      this.hasNucleusOrCenterDot ||
      this.dots.length > 0;

    if (!hasAnyHint) {
      // Add nucleus-style center glow dot
      this.addDot(this.center.x, this.center.y, prng ? prng.range(3, 4.5) : 3.5, {
        filled: true,
        role: 'nodes',
        isGlow: true
      });
      this.hasNucleusOrCenterDot = true;
    }
  }
}
