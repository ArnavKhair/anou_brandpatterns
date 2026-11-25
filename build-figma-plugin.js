/**
 * Bundle web prototype logic into self-contained figma-plugin/ui.html
 */

import fs from 'fs';

const htmlTemplate = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');

// Read modules
const mathJs = fs.readFileSync('src/math.js', 'utf8').replace(/export /g, '');
const sceneJs = fs.readFileSync('src/scene.js', 'utf8').replace(/export /g, '');
const rosetteJs = fs.readFileSync('src/generators/rosette.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const tangentJs = fs.readFileSync('src/generators/tangent-chain.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const lobesJs = fs.readFileSync('src/generators/lobes.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const fieldJs = fs.readFileSync('src/generators/field-lines.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const burstJs = fs.readFileSync('src/generators/particle-burst.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const wireJs = fs.readFileSync('src/generators/wireframe.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const orbitJs = fs.readFileSync('src/generators/orbit-system.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const genIndexJs = fs.readFileSync('src/generators/index.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const finishJs = fs.readFileSync('src/finish-pipeline.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const svgWriterJs = fs.readFileSync('src/svg-writer.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');
const refsJs = fs.readFileSync('src/initial-references.js', 'utf8').replace(/export /g, '');
const tasteJs = fs.readFileSync('src/taste-profile.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');

let appJs = fs.readFileSync('src/app.js', 'utf8').replace(/export /g, '').replace(/import .*?;/g, '');

// Enhance appJs for Figma integration
appJs += `
// Figma plugin communication
const insertFigmaBtn = document.createElement('button');
insertFigmaBtn.className = 'btn btn-primary';
insertFigmaBtn.style.background = '#10B981';
insertFigmaBtn.textContent = '⚡ Insert to Canvas';
insertFigmaBtn.title = 'Insert into selected Figma frame';
insertFigmaBtn.addEventListener('click', () => {
  if (window.app && window.app.lastRenderedSVG) {
    parent.postMessage({
      pluginMessage: {
        type: 'insert-pattern',
        svg: window.app.lastRenderedSVG,
        family: window.app.currentDesign.family,
        seed: window.app.currentDesign.seed
      }
    }, '*');
  }
});

const headerActions = document.querySelector('.header-actions');
if (headerActions) {
  headerActions.prepend(insertFigmaBtn);
}

// Handle figma messages
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === 'init-favorites' && Array.isArray(msg.data)) {
    if (window.app) {
      window.app.tasteProfile.savedDesigns = msg.data;
      window.app.tasteProfile.computeStatistics();
      window.app.updateFavoritesUI();
      window.app.updateProfileUI();
    }
  }
};
`;

// Build ui.html
let uiHtml = htmlTemplate
  .replace('<link rel="stylesheet" href="style.css">', `<style>${css}\n.app-header { padding: 0 14px; }\n.canvas-panel { padding: 12px; }\n.controls-sidebar { width: 300px; padding: 14px; }\n</style>`)
  .replace('<script type="module" src="src/app.js"></script>', `<script>
${mathJs}
${sceneJs}
${rosetteJs}
${tangentJs}
${lobesJs}
${fieldJs}
${burstJs}
${wireJs}
${orbitJs}
${genIndexJs}
${finishJs}
${svgWriterJs}
${refsJs}
${tasteJs}
${appJs}
</script>`);

fs.writeFileSync('figma-plugin/ui.html', uiHtml, 'utf8');
console.log('✓ Successfully generated figma-plugin/ui.html');
