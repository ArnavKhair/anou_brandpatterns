/**
 * Figma Plugin Main Code (Phase 4)
 * Inserts vector layers with intact named groups into selected Figma frames.
 * Persists favorites using figma.clientStorage.
 */

figma.showUI(__html__, { width: 440, height: 740, title: "Atom Pattern Generator" });

// Load stored favorites on launch
figma.clientStorage.getAsync('atom_saved_favorites').then(favs => {
  if (favs) {
    figma.ui.postMessage({ type: 'init-favorites', data: favs });
  }
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'insert-pattern') {
    const svgStr = msg.svg;
    if (!svgStr) return;

    try {
      const node = figma.createNodeFromSvg(svgStr);
      node.name = `Atom Pattern - ${msg.family || 'Generative'} (#${msg.seed || ''})`;

      const selection = figma.currentPage.selection;
      if (selection.length > 0 && selection[0].type === 'FRAME') {
        const targetFrame = selection[0];
        // Resize to match frame bounds while preserving square ratio
        const targetDim = Math.min(targetFrame.width, targetFrame.height);
        node.resize(targetDim, targetDim);
        node.x = (targetFrame.width - targetDim) / 2;
        node.y = (targetFrame.height - targetDim) / 2;
        targetFrame.appendChild(node);
      } else {
        // Place in center of viewport
        node.x = figma.viewport.center.x - 500;
        node.y = figma.viewport.center.y - 500;
        figma.currentPage.appendChild(node);
      }

      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.notify('✓ Inserted vector pattern with named groups');
    } catch (err) {
      figma.notify('Error inserting SVG: ' + err.message, { error: true });
    }
  } else if (msg.type === 'save-favorites') {
    await figma.clientStorage.setAsync('atom_saved_favorites', msg.data);
  }
};
