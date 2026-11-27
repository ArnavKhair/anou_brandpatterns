/**
 * Atom Pattern Generator - Analytic Scene Intermediate Representation (IR)
 *
 * Roles:
 * - primary: main structural curves & shapes
 * - accent: bolder emphasis curves (higher zPriority)
 * - secondary: supporting fine detail
 * - guide: construction lines, axes, guide circles
 * - node: dots, star flares, arrowheads
 * - annotation: optional ruler ticks, axis callouts (gated behind annotations toggle)
 *
 * Visibility:
 * - full: standard solid stroke
 * - front: solid front-facing 3D curve
 * - back: far-side 3D curve (serializes with stroke-dasharray="2 5")
 */

export function normalizeRole(role, isAccent = false) {
  if (isAccent || role === 'accent') return 'accent';
  switch (role) {
    case 'structure':
    case 'primary':
      return 'primary';
    case 'hidden':
      return 'primary';
    case 'guides':
    case 'guide':
      return 'guide';
    case 'secondary':
      return 'secondary';
    case 'nodes':
    case 'arrows':
    case 'node':
      return 'node';
    case 'annotation':
    case 'annotations':
      return 'annotation';
    default:
      return 'primary';
  }
}

export class Scene {
  constructor(width = 1000, height = 1000) {
    this.width = width;
    this.height = height;
    this.center = { x: width / 2, y: height / 2 };
    this.seedCounter = 1000;

    // Analytic & polyline geometric stores
    this.paths = [];
    this.dots = [];
    this.arrows = [];
    this.stars = [];
    this.ticks = [];
    this.exclusionHalos = [];

    this.coreBounds = null;
    this.bleedBounds = null;
    this.framingPreset = 'CENTERED EMBLEM';
    this.framingTransform = null;
  }

  _nextSeed(seed) {
    if (seed !== undefined) return seed;
    this.seedCounter = (this.seedCounter + 9973) | 0;
    return this.seedCounter >>> 0;
  }

  _defaultMeta(options = {}) {
    const rawRole = options.role || 'primary';
    const role = normalizeRole(rawRole, options.isAccent);
    const visibility = options.visibility || (rawRole === 'hidden' ? 'back' : 'full');
    const defaultZ = role === 'accent' ? 8 : (visibility === 'back' ? 1 : (role === 'guide' || role === 'annotation' ? 2 : 5));
    return {
      role,
      visibility,
      taper: options.taper ?? null,
      zPriority: options.zPriority ?? defaultZ,
      allowOvershoot: options.allowOvershoot ?? false,
      allowBreak: options.allowBreak ?? true,
      allowKnockout: options.allowKnockout ?? (role !== 'accent' && visibility !== 'back'),
      respectHalos: options.respectHalos ?? false,
      isAccent: role === 'accent',
      strokeWidthOverride: options.strokeWidthOverride ?? null,
      opacity: options.opacity ?? null,
      seed: this._nextSeed(options.seed)
    };
  }

  addCircle(cx, cy, r, options = {}) {
    if (!(r > 0)) return;
    this.paths.push({
      kind: 'circle',
      cx,
      cy,
      r,
      isClosed: true,
      ...this._defaultMeta(options)
    });
  }

  addEllipse(cx, cy, rx, ry, rotation = 0, options = {}) {
    if (!(rx > 0) || !(ry > 0)) return;
    this.paths.push({
      kind: 'ellipse',
      cx,
      cy,
      rx,
      ry,
      rotation,
      isClosed: true,
      ...this._defaultMeta(options)
    });
  }

  addArc(cx, cy, rx, ry, startAngle, endAngle, rotation = 0, options = {}) {
    if (!(rx > 0) || !(ry > 0)) return;
    this.paths.push({
      kind: 'arc',
      cx,
      cy,
      rx,
      ry,
      startAngle,
      endAngle,
      rotation,
      isClosed: false,
      ...this._defaultMeta(options)
    });
  }

  addPath(points, options = {}) {
    if (!points || points.length < 2) return;
    const isClosed = options.isClosed ?? false;
    const isPolygonal = options.isPolygonal ?? false;
    const meta = this._defaultMeta(options);
    const defaultOvershoot = !isClosed && (isPolygonal || meta.role === 'guide');
    this.paths.push({
      kind: 'polyline',
      points,
      isClosed,
      isPolygonal,
      ...meta,
      allowOvershoot: options.allowOvershoot ?? defaultOvershoot
    });
  }

  addExclusionHalo(x, y, r = 8) {
    this.exclusionHalos.push({ x, y, r });
  }

  addDot(x, y, r = 2.5, options = {}) {
    this.dots.push({
      x,
      y,
      r,
      filled: options.filled ?? true,
      role: normalizeRole(options.role || 'node'),
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
      role: normalizeRole(options.role || 'node')
    });
  }

  addStarNode(x, y, size = 5, rays = 4, options = {}) {
    this.stars.push({
      x,
      y,
      size,
      rays,
      role: normalizeRole(options.role || 'node')
    });
  }

  addTick(x1, y1, x2, y2, options = {}) {
    this.ticks.push({
      p1: { x: x1, y: y1 },
      p2: { x: x2, y: y2 },
      role: normalizeRole(options.role || 'annotation')
    });
  }

  setBounds(coreBounds, bleedBounds = null) {
    this.coreBounds = { ...coreBounds };
    this.bleedBounds = bleedBounds ? { ...bleedBounds } : { ...coreBounds };
  }

  computeFallbackBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    for (const p of this.paths) {
      if (p.kind === 'circle') {
        expand(p.cx - p.r, p.cy - p.r);
        expand(p.cx + p.r, p.cy + p.r);
      } else if (p.kind === 'ellipse' || p.kind === 'arc') {
        const mr = Math.max(p.rx, p.ry);
        expand(p.cx - mr, p.cy - mr);
        expand(p.cx + mr, p.cy + mr);
      } else if (p.points) {
        for (const pt of p.points) expand(pt.x, pt.y);
      }
    }
    if (!Number.isFinite(minX)) {
      return { minX: -300, minY: -300, maxX: 300, maxY: 300 };
    }
    return { minX, minY, maxX, maxY };
  }

  cloneForKnockout() {
    const copy = new Scene(this.width, this.height);
    copy.seedCounter = this.seedCounter;
    copy.coreBounds = this.coreBounds ? { ...this.coreBounds } : null;
    copy.bleedBounds = this.bleedBounds ? { ...this.bleedBounds } : null;
    copy.framingPreset = this.framingPreset;
    copy.framingTransform = this.framingTransform ? { ...this.framingTransform } : null;
    copy.paths = this.paths.map(p => ({
      ...p,
      points: p.points ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : undefined,
      taper: p.taper ? { ...p.taper } : null
    }));
    copy.dots = this.dots.map(d => ({ ...d }));
    copy.arrows = this.arrows.map(a => ({ ...a }));
    copy.stars = this.stars.map(s => ({ ...s }));
    copy.ticks = this.ticks.map(t => ({ p1: { ...t.p1 }, p2: { ...t.p2 }, role: t.role }));
    copy.exclusionHalos = this.exclusionHalos.map(h => ({ ...h }));
    return copy;
  }

  getActiveLayers() {
    const layers = [];
    const hasPrimary = this.paths.some(p => p.role === 'primary' && p.visibility !== 'back');
    const hasAccent = this.paths.some(p => p.role === 'accent');
    const hasBack = this.paths.some(p => p.visibility === 'back');
    const hasSecondary = this.paths.some(p => p.role === 'secondary' || p.role === 'guide');
    const hasNodes = this.dots.length > 0 || this.stars.length > 0 || this.arrows.length > 0;
    const hasAnnotations = this.paths.some(p => p.role === 'annotation') || this.ticks.length > 0;

    if (hasPrimary) layers.push('Primary');
    if (hasAccent) layers.push('Accent');
    if (hasSecondary || hasBack) layers.push('Depth & Detail');
    if (hasNodes) layers.push('Nodes & Marks');
    if (hasAnnotations) layers.push('Annotations');
    return layers;
  }
}
