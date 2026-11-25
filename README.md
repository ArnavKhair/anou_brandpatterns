# Atom Pattern Generator (Prototype & Figma Plugin)

A fast, procedural, atom-themed line pattern generator built according to the **Atom Pattern Generator Prototype Plan**.

---

## 🚀 Quick Start

### 1. Web Prototype
Serve the project directory using any static HTTP server:
```bash
# Using Python 3:
python3 -m http.server 3000

# Or using npx:
npx serve .
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Phase 1 Review Material (Contact Sheet)
Open `contact-sheet.html` directly in your browser to inspect 6 seeds generated across all 7 motif families (42 designs total).

### 3. Figma Plugin (Phase 4)
1. Open Figma Desktop.
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `figma-plugin/manifest.json` inside this repository.
4. Run the plugin. Select any Frame and click **⚡ Insert to Canvas** to insert vector layers with all 6 named groups (`structure`, `accent`, `nodes`, `arrows`, `hidden`, `guides`) intact.

---

## 🎨 Architectural Overview

### 1. The 7 Motif Families
1. **Rosettes and circle lattices**: Overlapping circles on hex, square, ring, or nested lattices with center glow dots and crossing nodes.
2. **Tangent chains and spirals**: Progressively shrinking tangent circles ($r_{next} / r \in [0.55, 0.85]$) curling into epicycles and spirals with construction squares.
3. **Lobes and envelopes**: Polar orbital shapes $r = a \cos(k\theta)$ ($k \in \{1, 2, 3, 4\}$), pinched bowtie ellipse stacks, and foreshortened ellipse fans.
4. **Field lines**: Dipole field curves $r = L \sin^2\theta$ with geometric spacing, orthogonal equipotential rings, asymptotes, and pole markers.
5. **Particle bursts**: Scattering tracks fanning from origin with power-law skewed lengths, arrowheads, and broken detector arcs.
6. **Wireframes**: Spheres, ellipsoids, and tori projected from 3D rotations with far-side dotted lines (`hidden`), tick-marked axes, and rotation arrows.
7. **Orbit systems**: Keplerian field orbits sharing one focal point (default) and Bohr-profile orbits with guardrails (open arcs 55%–85%, irregular tilts, no glossy nucleus balls).

### 2. Dual-Layer Reactive Architecture
- **Composition Controls (Rebuilds Scene Intermediate Representation)**:
  - `Complexity`: 0 to 1 (element count, curve mixing, scale).
  - `Symmetry`: 0 to 1 (asymmetry to rotational/mirror symmetry).
  - `Focus`: 0 to 1 (scattered to central focal concentration).
  - `Depth / 3D Tilt`: 20°–70° 3D projection or 2D affine squash/shear.
  - `Annotation Artifacts`: Arrowheads, guide circles, ticks, and dotted far-sides.
- **Finish Controls (Instant Restyling < 50ms)**:
  - `Rough to Clean`: Displaces paths with smooth gradient noise up to 3.5px + fine jitter (> 0.6) + faint pencil redraw pass (> 0.5).
  - `Line Breaks`: Cuts deterministic gaps (up to 6 per 1000px).
  - `Stroke Weight`: Hairline (0.6px) to bold (6.0px), default 1.4px; accents draw at 2.2×.
  - `Weight Variation`: Chunks paths into 8–24 segments with smooth sinusoidal width swing.
  - `Overshoot`: Extends open ends by up to 6% like construction lines.

### 3. Taste Profile & Adaptive Learning
- **Statistical learning (No AI, zero API cost)**: Learns from your saves and tweaks.
- **Initial Baseline**: Pre-scored against the 25 library references.
- **Smoothing**: Laplace-smoothed family weights ensure no family drops to zero.
- **Next Algorithm**:
  - Samples family by learned weight.
  - Draws control values from Gaussian distribution around saved means ($\sigma \ge 0.12$).
  - Respects **locked sliders** (locks keep current values across generations).
  - Enforces **skip rule**: skips candidates within 0.1 on every control of the last 5 in the same family.
  - **Wildcard rule**: every 5th "Next" ignores profile to break out of ruts.
- **Export & Import**: Full profile and saved favorites export/import as JSON.

### 4. Figma Vector Export
- Pure black strokes (`#000000`), `fill="none"`, `stroke-linecap="round"`.
- Dots are filled circles (`fill="#000000"`, `stroke="none"`).
- Six named groups: `structure`, `accent`, `nodes`, `arrows`, `hidden`, `guides`.
- Anchor points capped under 3000.
- One-click **Copy SVG** markup for instant paste onto any Figma canvas.

---

## ⌨️ Keyboard Shortcuts
- `Space` or `→`: Next pattern
- `←`: Back to previous pattern
- `S`: Save design to favorites & update taste profile
- `C`: Copy SVG markup to clipboard
# anou_brandpatterns
