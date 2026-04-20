(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') {
    window.NDP = window.NDP || {};
    window.NDP.Sand = window.NDP.Sand || {};
    window.NDP.Sand.Model = mod.Model;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function Circuit() {
    return { version: 2, nodes: [], wires: [], nextNodeId: 1, nextWireId: 1 };
  }
  function addNode(c, type, x, y, props) {
    const id = 'n' + (c.nextNodeId++);
    c.nodes.push({ id, type, x: x | 0, y: y | 0, props: props || {} });
    return id;
  }
  function removeNode(c, id) {
    c.nodes = c.nodes.filter(n => n.id !== id);
    c.wires = c.wires.filter(w => w.from.node !== id && w.to.node !== id);
  }
  function addWire(c, from, to) {
    const id = 'w' + (c.nextWireId++);
    c.wires.push({ id, from, to });
    return id;
  }
  function removeWire(c, id) {
    c.wires = c.wires.filter(w => w.id !== id);
  }
  function clone(c) { return JSON.parse(JSON.stringify(c)); }
  return { Model: { Circuit, addNode, removeNode, addWire, removeWire, clone } };
});
