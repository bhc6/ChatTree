/**
 * Tree traversal and conversation building utilities for the chat tree
 */

// Helper to get path from root to a specific node
export const getPathToNode = (nodeId, nodes, edges) => {
  const path = [];
  let currentId = nodeId;

  while (currentId) {
    const node = nodes.find((n) => n.id === currentId);
    if (node) {
      path.unshift(node);
    }

    // Find parent edge
    const parentEdge = edges.find((e) => e.target === currentId);
    currentId = parentEdge ? parentEdge.source : null;
  }

  return path;
};

// Build conversation messages from path
export const buildConversationFromPath = (path) => {
  const messages = [];

  for (const node of path) {
    if (node.data.isRoot && (!node.data.messages || node.data.messages.length === 0) && !node.data.userMessage) continue;
    if (node.data.messages && Array.isArray(node.data.messages)) {
      for (const msg of node.data.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else {
      if (node.data.userMessage) {
        messages.push({ role: "user", content: node.data.userMessage });
      }
      if (node.data.assistantMessage) {
        messages.push({ role: "assistant", content: node.data.assistantMessage });
      }
    }
  }

  return messages;
};

// Find the lowest common ancestor of two nodes
export const findLowestCommonAncestor = (nodeId1, nodeId2, nodes, edges) => {
  const path1 = getPathToNode(nodeId1, nodes, edges);
  const path2 = getPathToNode(nodeId2, nodes, edges);

  const path1Ids = new Set(path1.map((n) => n.id));

  // Walk path2 from node to root, find first match
  for (let i = path2.length - 1; i >= 0; i--) {
    if (path1Ids.has(path2[i].id)) {
      return path2[i].id;
    }
  }

  return "root";
};

// Find the lowest common ancestor of multiple nodes
export const findLowestCommonAncestorMultiple = (nodeIds, nodes, edges) => {
  if (nodeIds.length === 0) return "root";
  if (nodeIds.length === 1) return nodeIds[0];

  // Get all paths
  const paths = nodeIds.map((id) => getPathToNode(id, nodes, edges));
  const pathIdSets = paths.map((path) => new Set(path.map((n) => n.id)));

  // Start from the first path and find ancestors common to all paths
  const firstPath = paths[0];

  // Walk from the deepest node towards root, find first node that's in all paths
  for (let i = firstPath.length - 1; i >= 0; i--) {
    const candidateId = firstPath[i].id;
    const isInAllPaths = pathIdSets.every((set) => set.has(candidateId));
    if (isInAllPaths) {
      return candidateId;
    }
  }

  return "root";
};

// Get all descendants of a node
export const getDescendants = (nodeId, nodes, edges) => {
  const descendants = [];
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const childEdges = edges.filter((e) => e.source === currentId);

    for (const edge of childEdges) {
      descendants.push(edge.target);
      queue.push(edge.target);
    }
  }

  return descendants;
};

// Get chat name from nodes (first non-root user message or "New Chat")
export const getChatName = (nodes) => {
  const firstUserNode = nodes.find(
    (n) => (n.data?.messages && n.data.messages.length > 0) || n.data?.userMessage
  );
  if (firstUserNode) {
    let msg = "";
    if (firstUserNode.data?.messages && firstUserNode.data.messages.length > 0) {
      const firstUserMsg = firstUserNode.data.messages.find((m) => m.role === "user");
      if (firstUserMsg) {
        const content = firstUserMsg.content;
        if (typeof content === "string") {
          msg = content;
        } else if (Array.isArray(content)) {
          const textItem = content.find((item) => item.type === "text");
          msg = textItem ? textItem.text : "";
        } else if (typeof content === "object" && content) {
          msg = content.text || "";
        }
      }
    } else {
      msg = firstUserNode.data?.userMessage || "";
    }

    if (typeof msg !== "string") {
      msg = String(msg || "");
    }

    if (msg) {
      return msg.length > 30 ? msg.substring(0, 30) + "..." : msg;
    }
  }
  return "New Chat";
};

export const renderMessageContent = (content) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textItem = content.find((item) => item.type === "text");
    return textItem ? textItem.text : "";
  }
  if (typeof content === "object") {
    return content.text || "";
  }
  return "";
};

export const getDisplayContent = (content) => {
  const textContent = renderMessageContent(content);
  if (!textContent) return "";
  const index = textContent.indexOf("\n\n=== ATTACHED DOCUMENTS/FILES ===");
  if (index !== -1) {
    return textContent.substring(0, index);
  }
  return textContent;
};

// Subtree-width-based tree layout algorithm to position nodes symmetrically in a tree structure
export const layoutTree = (nodes, edges) => {
  if (!nodes || nodes.length === 0) return [];

  // Find all root nodes
  const roots = nodes.filter(n => n.data?.isRoot || n.id === 'root' || n.id.endsWith(':root'));
  if (roots.length === 0) return nodes;

  // Build children mapping (adjacency list)
  const adjList = {};
  edges.forEach(e => {
    if (!adjList[e.source]) adjList[e.source] = [];
    adjList[e.source].push(e.target);
  });

  // Calculate subtree leaf counts
  const leafCounts = {};
  const visited = new Set();
  const getSubtreeLeafCount = (nodeId) => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    const children = adjList[nodeId] || [];
    if (children.length === 0) {
      leafCounts[nodeId] = 1;
      return 1;
    }
    let count = 0;
    for (const childId of children) {
      count += getSubtreeLeafCount(childId);
    }
    leafCounts[nodeId] = count === 0 ? 1 : count;
    return leafCounts[nodeId];
  };

  roots.forEach(root => getSubtreeLeafCount(root.id));

  const nodePositions = {};
  const leafWidth = 155; // Compact horizontal node spacing
  const verticalGap = 90; // Compact vertical node spacing

  // Lay out each root's subtree
  let currentXStart = 0;
  const visitedLayout = new Set();
  
  roots.forEach(root => {
    const rootLeaves = leafCounts[root.id] || 1;
    const layoutSubtree = (nodeId, xStart, depth) => {
      if (visitedLayout.has(nodeId)) return;
      visitedLayout.add(nodeId);

      const children = adjList[nodeId] || [];
      const numLeaves = leafCounts[nodeId] || 1;
      
      // Center the node in its allocated subtree width
      // Offset by 70px (half of node width 140) to center the node center at the coordinate
      const x = xStart + (numLeaves * leafWidth) / 2 - 70;
      const y = 30 + depth * verticalGap; // Start at y = 30 for compactness
      
      nodePositions[nodeId] = { x, y };
      
      let childXStart = xStart;
      for (const childId of children) {
        const childLeaves = leafCounts[childId] || 1;
        layoutSubtree(childId, childXStart, depth + 1);
        childXStart += childLeaves * leafWidth;
      }
    };
    
    layoutSubtree(root.id, currentXStart, 0);
    currentXStart += rootLeaves * leafWidth + 60; // Add 60px gap between separate root trees
  });

  // Lay out detached artifact nodes to the right of the conversation trees
  const positionedIds = new Set(Object.keys(nodePositions));
  const detachedNodes = nodes.filter(n => !positionedIds.has(n.id));
  
  let detachedX = currentXStart + 30;
  let detachedY = 30;
  detachedNodes.forEach(node => {
    nodePositions[node.id] = { x: detachedX, y: detachedY };
    detachedY += 80; // Compact vertical gap for detached/artifact nodes
  });

  // Map nodes to their newly calculated positions
  return nodes.map(node => {
    if (nodePositions[node.id]) {
      return {
        ...node,
        position: nodePositions[node.id]
      };
    }
    return node;
  });
};
