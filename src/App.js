import React, { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { drag } from 'd3';
import './App.css';

/**
 * GraphEditor component replicates the functionality of the original Python/Tkinter Graph Editor:
 * - Add Node: Click on the background (SVG) to add a node.
 * - Add Edge: Click on first node, then second node. Prompt for weight.
 * - Delete: Click on a node to delete it (and its connected edges).
 *
 * Nodes are rendered as circles, edges as lines, and weights as text on the midpoint of the line.
 * For simplicity, this example uses an undirected graph. You could extend it
 * to store direction and draw arrows accordingly.
 */
export default function GraphEditor() {
  // State: list of nodes, edges, current mode, and "edgeStart" (the first node in an edge pair)
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [mode, setMode] = useState('add_node'); // can be 'add_node', 'add_edge', 'delete', 'rename_edge'
  const [edgeStart, setEdgeStart] = useState(null);
  const [highlightedNodes, setHighlightedNodes] = useState([]);
  const [isWeighted, setIsWeighted] = useState(true);
  const [isDirected, setIsDirected] = useState(false);
  const [directedEdgeMemory, setDirectedEdgeMemory] = useState({});
  const [bfsAnimationState, setBfsAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    queue: [],
    currentNode: null,
    sourceNode: null,
    predecessors: {},
    distances: {},
  });
  const [animationSpeed, setAnimationSpeed] = useState(50); // Default 50%
  const [dfsAnimationState, setDfsAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    stack: [],
    currentNode: null,
    sourceNode: null,
    predecessors: {},
    distances: {},
  });
  const [timedDfsAnimationState, setTimedDfsAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    stack: [],
    currentNode: null,
    sourceNode: null,
    predecessors: {},
    distances: {},
    startTimes: {},
    finishTimes: {},
    time: 0,
    hasBackEdge: false
  });
  const [bellmanFordAnimationState, setBellmanFordAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    currentEdge: null,
    sourceNode: null,
    predecessors: {},
    distances: {},
    iteration: 0,
    edgeOrder: [],
    hasNegativeCycle: false,
    currentStep: 0,
    showShortestPaths: false,
  });

  // Add Dijkstra's algorithm state
  const [dijkstraAnimationState, setDijkstraAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    currentNode: null,
    sourceNode: null,
    predecessors: {},
    distances: {},
    priorityQueue: [], // Array of [nodeId, distance] pairs
    processedNodes: new Set(),
    currentEdge: null,
    relaxedEdges: new Set(),
    iterationCount: 0,
  });

  // Add Prim's algorithm state
  const [primAnimationState, setPrimAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    currentNode: null,
    sourceNode: null,
    priorityQueue: [], // Array of [edgeId, weight] pairs
    processedNodes: new Set(),
    currentEdge: null,
    mstEdges: new Set(),
    totalWeight: 0,
    iterationCount: 0,
    error: null
  });

  // Add Kruskal's algorithm state
  const [kruskalAnimationState, setKruskalAnimationState] = useState({
    isRunning: false,
    isPaused: false,
    isComplete: false, //  this flag
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    currentEdge: null,
    mstEdges: new Set(),
    totalWeight: 0,
    edgesProcessed: 0,
    sortedEdges: [],
    currentStep: 0,
    components: new Map(), // Maps node uniqueId to component id
    numComponents: 0,
    error: null
  });

  // DisjointSet class for Kruskal's algorithm
  class DisjointSet {
    constructor() {
      this.parent = new Map();
      this.rank = new Map();
    }

    makeSet(x) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }

    find(x) {
      if (!this.parent.has(x)) {
        this.makeSet(x);
      }
      if (this.parent.get(x) !== x) {
        this.parent.set(x, this.find(this.parent.get(x))); // Path compression
      }
      return this.parent.get(x);
    }

    union(x, y) {
      const rootX = this.find(x);
      const rootY = this.find(y);

      if (rootX !== rootY) {
        // Union by rank
        if (this.rank.get(rootX) < this.rank.get(rootY)) {
          this.parent.set(rootX, rootY);
        } else if (this.rank.get(rootX) > this.rank.get(rootY)) {
          this.parent.set(rootY, rootX);
        } else {
          this.parent.set(rootY, rootX);
          this.rank.set(rootX, this.rank.get(rootX) + 1);
        }
        return true;
      }
      return false;
    }

    inSameSet(x, y) {
      return this.find(x) === this.find(y);
    }

    getComponents() {
      const components = new Map();
      let componentCount = 0;
      const componentSizes = new Map();

      // First pass: assign components
      for (const x of this.parent.keys()) {
        const root = this.find(x);
        if (!components.has(root)) {
          components.set(root, componentCount++);
          componentSizes.set(root, 0);
        }
        componentSizes.set(root, componentSizes.get(root) + 1);
      }

      // Second pass: map each node to its component
      const nodeToComponent = new Map();
      for (const x of this.parent.keys()) {
        const root = this.find(x);
        nodeToComponent.set(x, components.get(root));
      }

      return {
        nodeToComponent,
        numComponents: componentCount,
        componentSizes
      };
    }
  }

  // A ref to keep track of the next node id
  const nextNodeId = useRef(0);
  // Add a ref for unique edge IDs
  const nextEdgeId = useRef(0);

  // Add state for collapse/expand
  const [isMatrixExpanded, setIsMatrixExpanded] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);

  // Add useEffect for setting up drag behavior
  useEffect(() => {
    const dragHandler = drag()
      .on('drag', (event, nodeData) => {
        setNodes(prevNodes => 
          prevNodes.map(node => 
            node.uniqueId === nodeData.uniqueId
              ? { ...node, x: event.x, y: event.y }
              : node
          )
        );
      });

    // Only apply drag behavior when in drag mode
    if (mode === 'drag') {
      d3.selectAll('.node').call(dragHandler);
    } else {
      d3.selectAll('.node').on('.drag', null); // Remove drag behavior
    }
  }, [nodes.length, mode]); // Reapply when nodes change or mode changes

  /**
   * Handle clicks on the SVG background for adding nodes (when in 'add_node' mode).
   */
  const handleSvgClick = (e) => {
    // Only add a node if we're in "add_node" mode
    if (mode !== 'add_node') return;

    // Get SVG-relative coordinates
    // We use d3's clientPoint to reliably get the [x, y] inside the SVG.
    const svg = e.currentTarget;
    const point = d3.pointer(e, svg);
    const [x, y] = point;

    // Create a new node
    const newNode = {
      id: nextNodeId.current,
      uniqueId: `node-${Date.now()}-${Math.random()}`, // Add unique identifier
      x,
      y
    };
    
    nextNodeId.current += 1;
    setNodes((prev) => [...prev, newNode]);
  };

  /**
   * Handle clicks on a node. Behavior depends on current mode:
   * - add_edge: If edgeStart is null, set edgeStart to this node; otherwise prompt for weight, create edge.
   * - delete: Prompt for confirmation, then delete node (and associated edges).
   */
  const handleNodeClick = (nodeId, uniqueId, event) => {
    // Ignore node clicks during drag events
    if (event.defaultPrevented) return;

    if (mode === 'add_edge') {
      if (edgeStart === null) {
        setEdgeStart(uniqueId);
        setHighlightedNodes([uniqueId]);
      } else {
        if (edgeStart !== uniqueId) {
          setHighlightedNodes([edgeStart, uniqueId]);
          
          // Check for existing edges between these nodes
          const existingEdge = edges.find(e => 
            (e.source === edgeStart && e.target === uniqueId) ||
            (!isDirected && e.source === uniqueId && e.target === edgeStart)
          );

          if (!existingEdge) {
            if (isWeighted) {
              const weight = prompt('Enter edge weight (numeric value):', '1');
              if (weight !== null) {
                const newEdge = {
                  id: nextEdgeId.current,
                  source: edgeStart,
                  target: uniqueId,
                  weight: parseFloat(weight),
                };
                nextEdgeId.current += 1;
                setEdges((prevEdges) => [...prevEdges, newEdge]);
                // Remember the original direction
                setDirectedEdgeMemory(prev => ({
                  ...prev,
                  [newEdge.id]: { source: edgeStart, target: uniqueId }
                }));
              }
            } else {
              const newEdge = {
                id: nextEdgeId.current,
                source: edgeStart,
                target: uniqueId,
                weight: 1,
              };
              nextEdgeId.current += 1;
              setEdges((prevEdges) => [...prevEdges, newEdge]);
              // Remember the original direction
              setDirectedEdgeMemory(prev => ({
                ...prev,
                [newEdge.id]: { source: edgeStart, target: uniqueId }
              }));
            }
          }
        }
        setHighlightedNodes([]);
        setEdgeStart(null);
      }
    } else if (mode === 'delete') {
      // Remove confirmation and directly delete the node
      setNodes((prevNodes) => prevNodes.filter((n) => n.uniqueId !== uniqueId));
      // Remove edges that are connected to this node
      setEdges((prevEdges) =>
        prevEdges.filter(
          (e) => e.source !== uniqueId && e.target !== uniqueId
        )
      );
    } else if (mode === 'bfs') {
      startBFS(nodeId);
    } else if (mode === 'dfs') {
      startDFS(nodeId);
    } else if (mode === 'timed_dfs') {
      startTimedDFS(nodeId);
    } else if (mode === 'bellman_ford') {
      initializeBellmanFord(nodeId);
    } else if (mode === 'dijkstra') {
      initializeDijkstra(nodeId);
    } else if (mode === 'prim') {
      initializePrim(nodeId);
    }
  };

  /**
   * Button handlers for changing the editor mode.
   */
  const setModeAddNode = () => {
    setMode('add_node');
    setEdgeStart(null);
  };

  const setModeAddEdge = () => {
    setMode('add_edge');
    setEdgeStart(null);
  };

  const setModeDelete = () => {
    setMode('delete');
    setEdgeStart(null);
  };

  const setModeRenameEdge = () => {
    setMode('rename_edge');
    setEdgeStart(null);
  };

  /**
   * Helper function to find the midpoint for edge label placement.
   */
  const getMidpoint = (x1, y1, x2, y2, offset = 0) => {
    // If there's an offset, calculate a point displaced perpendicular to the line
    if (offset !== 0) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate the perpendicular offset
      const offsetX = -dy * offset / length;
      const offsetY = dx * offset / length;
      
      return [(x1 + x2) / 2 + offsetX, (y1 + y2) / 2 + offsetY];
    }
    
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  };

  //  helper function to get the edge path
  const getEdgePath = (sourceX, sourceY, targetX, targetY, offset = 0) => {
    if (offset === 0) {
      return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    }

    // Calculate the midpoint
    const mpX = (sourceX + targetX) / 2;
    const mpY = (sourceY + targetY) / 2;

    // Calculate the perpendicular offset
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    const offsetX = -dy * offset / length;
    const offsetY = dx * offset / length;

    // Return a quadratic curve with offset control point
    return `M ${sourceX} ${sourceY} 
            Q ${mpX + offsetX} ${mpY + offsetY} ${targetX} ${targetY}`;
  };

  const handleEdgeClick = (edge, e) => {
    e.stopPropagation();
    if (mode === 'rename_edge') {
      const newWeight = prompt('Enter new edge weight:', edge.weight);
      if (newWeight !== null) {
        setEdges(prevEdges =>
          prevEdges.map(e =>
            e.id === edge.id
              ? { ...e, weight: parseFloat(newWeight) }
              : e
          )
        );
      }
    } else if (mode === 'delete') {
      setEdges(prevEdges => prevEdges.filter(e => e.id !== edge.id));
    }
  };

  // Add reset counter function
  const resetNodeCounter = () => {
    nextNodeId.current = 0;
  };

  // Add delete all function
  const deleteAll = () => {
    setNodes([]);
    setEdges([]);
    nextNodeId.current = 0;
    nextEdgeId.current = 0;
    setEdgeStart(null);
    setHighlightedNodes([]);
    resetBFS();
    resetDFS();
    resetTimedDFS();
    resetBellmanFord();
    resetDijkstra();
    resetPrim();
    resetKruskal();
  };

  // Add function to handle directed/undirected toggle
  const handleDirectedToggle = (directed) => {
    setIsDirected(directed);
    
    if (directed) {
      // Switching to directed: restore original directions
      setEdges(prevEdges => {
        const newEdges = prevEdges.map(edge => ({
          ...edge,
          source: directedEdgeMemory[edge.id]?.source || edge.source,
          target: directedEdgeMemory[edge.id]?.target || edge.target,
        }));
        
        // Remove duplicate undirected edges
        return newEdges.filter((edge, index, self) => 
          index === self.findIndex(e => 
            (e.source === edge.source && e.target === edge.target) ||
            (e.source === edge.target && e.target === edge.source)
          )
        );
      });
    } else {
      // Switching to undirected: normalize edges to prevent duplicates
      setEdges(prevEdges => {
        const normalizedEdges = [];
        const edgePairs = new Set();

        prevEdges.forEach(edge => {
          const pair = [edge.source, edge.target].sort().join('-');
          if (!edgePairs.has(pair)) {
            edgePairs.add(pair);
            normalizedEdges.push(edge);
          }
        });

        return normalizedEdges;
      });
    }
  };

  //  helper functions to GraphEditor component
  const getAdjacencyList = () => {
    // Create a mapping of uniqueId to simple numeric id
    const idMapping = {};
    nodes.forEach(node => {
      idMapping[node.uniqueId] = node.id;
    });

    // Create adjacency list
    const adjacencyList = {};
    nodes.forEach(node => {
      adjacencyList[node.id] = [];
    });

    edges.forEach(edge => {
      const sourceId = idMapping[edge.source];
      const targetId = idMapping[edge.target];
      
      // Add edge with weight
      adjacencyList[sourceId].push({
        node: targetId,
        weight: edge.weight
      });

      // If undirected, add reverse edge
      if (!isDirected) {
        adjacencyList[targetId].push({
          node: sourceId,
          weight: edge.weight
        });
      }
    });

    return adjacencyList;
  };


  // Add new mode setter
  const setModeDrag = () => {
    setMode('drag');
    setEdgeStart(null);
  };

  //  function to format the adjacency list for display
  const getFormattedAdjacencyList = () => {
    const adjList = getAdjacencyList();
    let formatted = '';
    
    Object.keys(adjList).sort((a, b) => a - b).forEach(nodeId => {
      formatted += `Node ${nodeId}: [\n`;
      if (adjList[nodeId].length === 0) {
        formatted += '  No connections\n';
      } else {
        adjList[nodeId].forEach(({ node, weight }) => {
          formatted += `  → Node ${node}${isWeighted ? ` (weight: ${weight})` : ''}\n`;
        });
      }
      formatted += ']\n\n';
    });
    
    return formatted || 'Empty graph';
  };

  //  function to generate the adjacency matrix
  const getAdjacencyMatrix = () => {
    // Create a mapping of uniqueId to simple numeric id
    const idMapping = {};
    nodes.forEach(node => {
      idMapping[node.uniqueId] = node.id;
    });

    // Initialize matrix with zeros
    const size = nodes.length;
    const matrix = Array(size).fill().map(() => Array(size).fill(0));

    // Fill matrix based on edges
    edges.forEach(edge => {
      const sourceIdx = idMapping[edge.source];
      const targetIdx = idMapping[edge.target];
      
      matrix[sourceIdx][targetIdx] = 1;
      
      // For undirected graphs, make it symmetrical
      if (!isDirected) {
        matrix[targetIdx][sourceIdx] = 1;
      }
    });

    return matrix;
  };

  //  function to render the matrix
  const renderAdjacencyMatrix = () => {
    const matrix = getAdjacencyMatrix();
    
    if (nodes.length === 0) {
      return <p>Empty graph</p>;
    }

    return (
      <table>
        <thead>
          <tr>
            <th></th>
            {nodes.sort((a, b) => a.id - b.id).map(node => (
              <th key={node.id}>{node.id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <th>{i}</th>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // new functions to handle BFS
  const startBFS = (sourceNodeId) => {
    if (bfsAnimationState.isRunning) return;
    
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    // Initialize distances and predecessors for all nodes
    const initialDistances = {};
    const initialPredecessors = {};
    nodes.forEach(node => {
      initialDistances[node.uniqueId] = Infinity;
      initialPredecessors[node.uniqueId] = null;
    });

    // Set source node distance to 0
    initialDistances[sourceNode.uniqueId] = 0;

    setBfsAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      visitedNodes: new Set([sourceNode.uniqueId]),
      visitedEdges: new Set(),
      queue: [sourceNode.uniqueId],
      currentNode: sourceNode.uniqueId,
      sourceNode: sourceNode.uniqueId,
      predecessors: initialPredecessors,
      distances: initialDistances,
    }));

    runBFSStep();
  };

  const getAnimationDelay = () => {
    // Convert slider value (1-100) to delay (1500ms - 100ms)
    // Reversed so that higher slider value = faster animation
    return 3600 - (animationSpeed * 15);
  };

  const runBFSStep = async () => {
    setBfsAnimationState(prev => {
      if (prev.queue.length === 0 || prev.isPaused) {
        return prev;
      }

      const currentNode = prev.queue[0];
      const newQueue = prev.queue.slice(1);
      const adjList = getAdjacencyList();
      const currentNodeId = nodes.find(n => n.uniqueId === currentNode).id;
      
      // Get unvisited neighbors
      const neighbors = adjList[currentNodeId]
        .map(({node}) => {
          const nodeObj = nodes.find(n => n.id === node);
          return nodeObj ? { uniqueId: nodeObj.uniqueId, visibleId: nodeObj.id } : null;
        })
        .filter(node => node && !prev.visitedNodes.has(node.uniqueId));
      
      // Sort neighbors by their visible node values (node.id)
      neighbors.sort((a, b) => a.visibleId - b.visibleId);
      
      // Extract just the uniqueIds after sorting
      const sortedNeighborIds = neighbors.map(node => node.uniqueId);

      // Update predecessors and distances for newly discovered nodes
      const newPredecessors = { ...prev.predecessors };
      const newDistances = { ...prev.distances };
      sortedNeighborIds.forEach(neighborId => {
        newPredecessors[neighborId] = currentNode;
        newDistances[neighborId] = prev.distances[currentNode] + 1;
      });

      // Add edges to visited edges
      const newVisitedEdges = new Set(prev.visitedEdges);
      sortedNeighborIds.forEach(neighborId => {
        const edge = edges.find(e => 
          (e.source === currentNode && e.target === neighborId) ||
          (!isDirected && e.target === currentNode && e.source === neighborId)
        );
        if (edge) newVisitedEdges.add(edge.id);
      });

      return {
        ...prev,
        queue: [...newQueue, ...sortedNeighborIds],
        visitedNodes: new Set([...prev.visitedNodes, ...sortedNeighborIds]),
        visitedEdges: newVisitedEdges,
        currentNode: currentNode,
        predecessors: newPredecessors,
        distances: newDistances,
      };
    });

    setTimeout(() => {
      setBfsAnimationState(prev => {
        if (prev.queue.length > 0 && !prev.isPaused) {
          runBFSStep();
        } else if (prev.queue.length === 0) {
          return { ...prev, isRunning: false };
        }
        return prev;
      });
    }, getAnimationDelay());
  };

  const togglePauseBFS = () => {
    setBfsAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.queue.length > 0) {
        runBFSStep();
      }
      return newState;
    });
  };

  const resetBFS = () => {
    setBfsAnimationState({
      isRunning: false,
      isPaused: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      queue: [],
      currentNode: null,
      sourceNode: null,
      predecessors: {},
      distances: {},
    });
  };

  // Add DFS functions
  const startDFS = (sourceNodeId) => {
    if (dfsAnimationState.isRunning) return;
    
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    // Initialize distances and predecessors
    const initialDistances = {};
    const initialPredecessors = {};
    nodes.forEach(node => {
      initialDistances[node.uniqueId] = Infinity;
      initialPredecessors[node.uniqueId] = null;
    });

    initialDistances[sourceNode.uniqueId] = 0;

    setDfsAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      visitedNodes: new Set([sourceNode.uniqueId]),
      visitedEdges: new Set(),
      stack: [sourceNode.uniqueId],
      currentNode: sourceNode.uniqueId,
      sourceNode: sourceNode.uniqueId,
      predecessors: initialPredecessors,
      distances: initialDistances,
    }));

    runDFSStep();
  };

  const runDFSStep = async () => {
    setDfsAnimationState(prev => {
      if (prev.stack.length === 0 || prev.isPaused) {
        return prev;
      }

      const currentNode = prev.stack[prev.stack.length - 1]; // Get top of stack
      const currentNodeId = nodes.find(n => n.uniqueId === currentNode).id;
      const adjList = getAdjacencyList();
      
      // Get unvisited neighbors
      const neighbors = adjList[currentNodeId]
        .map(({node}) => {
          const nodeObj = nodes.find(n => n.id === node);
          return nodeObj ? { uniqueId: nodeObj.uniqueId, visibleId: nodeObj.id } : null;
        })
        .filter(node => node && !prev.visitedNodes.has(node.uniqueId));
      
      // Sort neighbors by their visible node values (node.id)
      neighbors.sort((a, b) => a.visibleId - b.visibleId);

      if (neighbors.length > 0) {
        // If there are unvisited neighbors, visit the first one (with lowest visible ID)
        const nextNode = neighbors[0].uniqueId;
        
        // Update predecessors and distances
        const newPredecessors = { ...prev.predecessors };
        const newDistances = { ...prev.distances };
        newPredecessors[nextNode] = currentNode;
        newDistances[nextNode] = prev.distances[currentNode] + 1;

        // Add edge to visited edges
        const newVisitedEdges = new Set(prev.visitedEdges);
        const edge = edges.find(e => 
          (e.source === currentNode && e.target === nextNode) ||
          (!isDirected && e.target === currentNode && e.source === nextNode)
        );
        if (edge) newVisitedEdges.add(edge.id);

        return {
          ...prev,
          stack: [...prev.stack, nextNode],
          visitedNodes: new Set([...prev.visitedNodes, nextNode]),
          visitedEdges: newVisitedEdges,
          currentNode: nextNode,
          predecessors: newPredecessors,
          distances: newDistances,
        };
      } else {
        // If no unvisited neighbors, backtrack
        const newStack = prev.stack.slice(0, -1);
        return {
          ...prev,
          stack: newStack,
          currentNode: newStack[newStack.length - 1] || null,
        };
      }
    });

    setTimeout(() => {
      setDfsAnimationState(prev => {
        if (prev.stack.length > 0 && !prev.isPaused) {
          runDFSStep();
        } else if (prev.stack.length === 0) {
          return { ...prev, isRunning: false };
        }
        return prev;
      });
    }, getAnimationDelay());
  };

  const togglePauseDFS = () => {
    setDfsAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.stack.length > 0) {
        runDFSStep();
      }
      return newState;
    });
  };

  const resetDFS = () => {
    setDfsAnimationState({
      isRunning: false,
      isPaused: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      stack: [],
      currentNode: null,
      sourceNode: null,
      predecessors: {},
      distances: {},
    });
  };

  // Update node rendering to include DFS highlighting
  const getNodeFill = (node) => {
    if (bellmanFordAnimationState.isRunning) {
      // Source node is always gold
      if (bellmanFordAnimationState.sourceNode === node.uniqueId) {
        return "#FFD700";
      }
      
      // If we're currently processing an edge
      if (bellmanFordAnimationState.currentEdge) {
        const currentEdge = edges.find(e => e.id === bellmanFordAnimationState.currentEdge);
        if (currentEdge) {
          // Source node of current edge being processed
          if (currentEdge.source === node.uniqueId) {
            return "#ff8c00"; // Orange
          }
          // Target node of current edge being processed
          if (currentEdge.target === node.uniqueId) {
            // If this relaxation step will update the distance
            const sourceDistance = bellmanFordAnimationState.distances[currentEdge.source];
            const targetDistance = bellmanFordAnimationState.distances[currentEdge.target];
            const newDistance = sourceDistance + currentEdge.weight;
            if (newDistance < targetDistance) {
              return "#90EE90"; // Light green for successful relaxation
            }
            return "#ff8c00"; // Orange for attempted relaxation
          }
        }
      }
      
      // Nodes that have been updated (have finite distance)
      if (bellmanFordAnimationState.distances[node.uniqueId] !== Infinity) {
        return "#98FB98"; // Pale green
      }
    }

    // Dijkstra's algorithm states
    if (dijkstraAnimationState.isRunning || dijkstraAnimationState.visitedNodes.size > 0) {
      // Source node is always orange
      if (dijkstraAnimationState.sourceNode === node.uniqueId) {
        return "#ff8c00";
      }
      
      // Current node being processed is yellow
      if (dijkstraAnimationState.currentNode === node.uniqueId) {
        return "#FFD700";
      }
      
      // Processed nodes are green
      if (dijkstraAnimationState.processedNodes.has(node.uniqueId)) {
        return "#90EE90";
      }
      
      // Nodes in priority queue are light orange
      if (dijkstraAnimationState.priorityQueue.some(([id]) => id === node.uniqueId)) {
        return "#FFE4B5";
      }
    }

    // Prim's algorithm states
    if (primAnimationState.isRunning || primAnimationState.visitedNodes.size > 0) {
      // Source node is always orange
      if (primAnimationState.sourceNode === node.uniqueId) {
        return "#ff8c00";
      }
      
      // Current node being processed is yellow
      if (primAnimationState.currentNode === node.uniqueId) {
        return "#FFD700";
      }
      
      // Nodes in MST are green
      if (primAnimationState.processedNodes.has(node.uniqueId)) {
        return "#90EE90";
      }
      
      // Nodes adjacent to MST (candidates) are light orange
      const isCandidate = primAnimationState.priorityQueue.some(([edgeId]) => {
        const edge = edges.find(e => e.id === edgeId);
        return edge && (edge.source === node.uniqueId || edge.target === node.uniqueId);
      });
      if (isCandidate) {
        return "#FFE4B5";
      }
    }

    // Other algorithm states remain the same
    if (bfsAnimationState.currentNode === node.uniqueId) return "#ff8c00";
    if (dfsAnimationState.currentNode === node.uniqueId || 
        timedDfsAnimationState.currentNode === node.uniqueId) return "#ff4500";
    if (bfsAnimationState.visitedNodes.has(node.uniqueId)) return "#90EE90";
    if (dfsAnimationState.visitedNodes.has(node.uniqueId) || 
        timedDfsAnimationState.visitedNodes.has(node.uniqueId)) return "#98FB98";
    if (bfsAnimationState.sourceNode === node.uniqueId || 
        dfsAnimationState.sourceNode === node.uniqueId ||
        timedDfsAnimationState.sourceNode === node.uniqueId) return "#FFD700";
    return "lightblue";
  };

  //  helper function inside the GraphEditor component
  const getCurrentStateText = () => {
    if (bellmanFordAnimationState.isRunning) return 'Running Bellman-Ford';
    if (bfsAnimationState.isRunning) return 'Running BFS';
    if (dfsAnimationState.isRunning) return 'Running DFS';
    if (timedDfsAnimationState.isRunning) return 'Running Topological Sort (DFS)';
    
    switch (mode) {
      case 'add_node':
        return 'Adding Nodes';
      case 'add_edge':
        return 'Adding Edges';
      case 'delete':
        return 'Delete Mode';
      case 'rename_edge':
        return 'Change Edge Weight';
      case 'drag':
        return 'Drag Mode';
      case 'bfs':
        return 'Select Node for BFS';
      case 'dfs':
        return 'Select Node for DFS';
      case 'timed_dfs':
        return 'Select Node for Topological Sort (DFS)';
      default:
        return mode;
    }
  };

  // new functions for Timed DFS
  const startTimedDFS = (sourceNodeId) => {
    if (timedDfsAnimationState.isRunning) return;
    
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    const initialDistances = {};
    const initialPredecessors = {};
    nodes.forEach(node => {
      initialDistances[node.uniqueId] = Infinity;
      initialPredecessors[node.uniqueId] = null;
    });

    initialDistances[sourceNode.uniqueId] = 0;

    setTimedDfsAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      visitedNodes: new Set([sourceNode.uniqueId]),
      visitedEdges: new Set(),
      stack: [sourceNode.uniqueId],
      currentNode: sourceNode.uniqueId,
      sourceNode: sourceNode.uniqueId,
      predecessors: initialPredecessors,
      distances: initialDistances,
      startTimes: { [sourceNode.uniqueId]: 1 },
      finishTimes: {},
      time: 1,
      hasBackEdge: false,
      remainingNodes: new Set(nodes.map(n => n.uniqueId).filter(id => id !== sourceNode.uniqueId))
    }));

    runTimedDFSStep();
  };

  const runTimedDFSStep = async () => {
    setTimedDfsAnimationState(prev => {
      if (prev.isPaused) {
        return prev;
      }

      // If stack is empty but there are unvisited nodes, start new DFS from an unvisited node
      if (prev.stack.length === 0 && prev.remainingNodes.size > 0) {
        // Get all remaining nodes with their visible IDs
        const remainingNodesWithIds = Array.from(prev.remainingNodes).map(uniqueId => {
          const node = nodes.find(n => n.uniqueId === uniqueId);
          return { uniqueId, visibleId: node ? node.id : Infinity };
        });
        
        // Sort by visible node ID and take the one with lowest ID
        remainingNodesWithIds.sort((a, b) => a.visibleId - b.visibleId);
        const nextStartNode = remainingNodesWithIds[0].uniqueId;
        
        const newTime = prev.time + 1;
        
        return {
          ...prev,
          stack: [nextStartNode],
          visitedNodes: new Set([...prev.visitedNodes, nextStartNode]),
          currentNode: nextStartNode,
          startTimes: { ...prev.startTimes, [nextStartNode]: newTime },
          time: newTime,
          remainingNodes: new Set(Array.from(prev.remainingNodes).filter(id => id !== nextStartNode))
        };
      }

      if (prev.stack.length === 0) {
        return { ...prev, isRunning: false };
      }

      const currentNode = prev.stack[prev.stack.length - 1];
      const currentNodeId = nodes.find(n => n.uniqueId === currentNode).id;
      const adjList = getAdjacencyList();
      
      // Get all neighbors (not just unvisited ones)
      const allNeighbors = adjList[currentNodeId]
        .map(({node}) => {
          const nodeObj = nodes.find(n => n.id === node);
          return nodeObj ? { uniqueId: nodeObj.uniqueId, visibleId: nodeObj.id } : null;
        })
        .filter(node => node);

      // Check for back edges
      let foundBackEdge = prev.hasBackEdge;
      if (isDirected) {
        allNeighbors.forEach(neighbor => {
          if (prev.visitedNodes.has(neighbor.uniqueId) && 
              prev.stack.includes(neighbor.uniqueId) && 
              !prev.finishTimes[neighbor.uniqueId]) {
            foundBackEdge = true;
          }
        });
      }

      // Get unvisited neighbors
      const neighbors = allNeighbors.filter(node => !prev.visitedNodes.has(node.uniqueId));
      
      // Sort neighbors by their visible node values (node.id)
      neighbors.sort((a, b) => a.visibleId - b.visibleId);

      if (neighbors.length > 0) {
        const nextNode = neighbors[0].uniqueId;
        const newTime = prev.time + 1;
        
        return {
          ...prev,
          stack: [...prev.stack, nextNode],
          visitedNodes: new Set([...prev.visitedNodes, nextNode]),
          currentNode: nextNode,
          startTimes: { ...prev.startTimes, [nextNode]: newTime },
          time: newTime,
          hasBackEdge: foundBackEdge,
          remainingNodes: new Set(Array.from(prev.remainingNodes).filter(id => id !== nextNode))
        };
      } else {
        const newStack = prev.stack.slice(0, -1);
        const newTime = prev.time + 1;
        
        return {
          ...prev,
          stack: newStack,
          currentNode: newStack[newStack.length - 1] || null,
          finishTimes: { ...prev.finishTimes, [currentNode]: newTime },
          time: newTime,
          hasBackEdge: foundBackEdge
        };
      }
    });

    setTimeout(() => {
      setTimedDfsAnimationState(prev => {
        if (!prev.isPaused && (prev.stack.length > 0 || prev.remainingNodes.size > 0)) {
          runTimedDFSStep();
        } else if (prev.stack.length === 0 && prev.remainingNodes.size === 0) {
          return { ...prev, isRunning: false };
        }
        return prev;
      });
    }, getAnimationDelay());
  };

  const togglePauseTimedDFS = () => {
    setTimedDfsAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.stack.length > 0) {
        runTimedDFSStep();
      }
      return newState;
    });
  };

  const resetTimedDFS = () => {
    setTimedDfsAnimationState({
      isRunning: false,
      isPaused: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      stack: [],
      currentNode: null,
      sourceNode: null,
      predecessors: {},
      distances: {},
      startTimes: {},
      finishTimes: {},
      time: 0,
      hasBackEdge: false,
      remainingNodes: new Set()
    });
  };

  // First, add a helper function to get the topological sort
  const getTopologicalSort = (finishTimes) => {
    // Convert finish times object to array of [nodeId, finishTime] pairs
    const pairs = Object.entries(finishTimes).map(([uniqueId, time]) => ({
      uniqueId,
      id: nodes.find(n => n.uniqueId === uniqueId)?.id,
      time
    }));
    
    // Sort by finish times in descending order
    return pairs.sort((a, b) => b.time - a.time)
      .map(pair => pair.id);
  };

  const startBellmanFord = () => {
    if (bellmanFordAnimationState.isRunning) return;
    
    // Check if the graph is directed
    if (!isDirected) {
      alert('Bellman-Ford algorithm requires a directed graph. Please switch to directed mode before starting.');
      return;
    }
    
    // Prompt user to select source node
    setMode('bellman_ford');
    alert('Click a node to start Bellman-Ford algorithm');
  };

  const initializeBellmanFord = (sourceNodeId) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;
    
    // Initialize distances and predecessors
    const initialDistances = {};
    const initialPredecessors = {};
    nodes.forEach(node => {
      initialDistances[node.uniqueId] = Infinity;
      initialPredecessors[node.uniqueId] = null;
    });
    
    initialDistances[sourceNode.uniqueId] = 0;

    // Create edge sequence for visualization - use same edge order for each iteration
    const edgeSequence = [];
    const maxIterations = nodes.length - 1;
    
    // Sort edges by source and target node visible IDs
    const sortedEdges = [...edges].sort((a, b) => {
      const aSource = nodes.find(n => n.uniqueId === a.source)?.id || 0;
      const aTarget = nodes.find(n => n.uniqueId === a.target)?.id || 0;
      const bSource = nodes.find(n => n.uniqueId === b.source)?.id || 0;
      const bTarget = nodes.find(n => n.uniqueId === b.target)?.id || 0;
      
      // First compare by source node ID
      if (aSource !== bSource) {
        return aSource - bSource;
      }
      // If source is the same, compare by target node ID
      return aTarget - bTarget;
    });
    
    for (let i = 0; i < maxIterations; i++) {
      sortedEdges.forEach(edge => {
        edgeSequence.push({
          ...edge,
          iteration: i + 1
        });
      });
    }

    setBellmanFordAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      visitedNodes: new Set([sourceNode.uniqueId]),
      visitedEdges: new Set(),
      currentEdge: null,
      sourceNode: sourceNode.uniqueId,
      predecessors: initialPredecessors,
      distances: initialDistances,
      iteration: 1,
      edgeOrder: edgeSequence,
      hasNegativeCycle: false,
      currentStep: 0,
      anyChanges: false,
      edgeSequenceDisplay: edgeSequence.map(edge => ({
        from: nodes.find(n => n.uniqueId === edge.source)?.id,
        to: nodes.find(n => n.uniqueId === edge.target)?.id,
        iteration: edge.iteration
      }))
    }));

    runBellmanFordStep();
  };

  const runBellmanFordStep = async () => {
    setBellmanFordAnimationState(prev => {
      if (prev.isPaused) return prev;

      const n = nodes.length;
      
      // Check if we've completed current iteration
      if (prev.currentStep % edges.length === 0 && prev.currentStep > 0) {
        if (!prev.anyChanges) {
          // Algorithm has completed successfully
          return {
            ...prev,
            isRunning: false,
            hasNegativeCycle: false,
            currentEdge: null,
            iterationCount: Math.floor(prev.currentStep / edges.length),
            // Keep predecessors and distances in final state for path highlighting
            showShortestPaths: true //  flag
          };
        }
        prev.anyChanges = false;
      }

      // Check if we've completed all iterations
      if (prev.iteration >= n) {
        return {
          ...prev,
          isRunning: false,
          hasNegativeCycle: prev.anyChanges,
          currentEdge: null, // Clear current edge
          iterationCount: n
        };
      }

      // Get current edge to process
      const edgeIndex = prev.currentStep % prev.edgeOrder.length;
      const edge = prev.edgeOrder[edgeIndex];
      const { source, target, weight } = edge;

      // Calculate new distance before updating state
      const newDistance = prev.distances[source] + weight;
      
      // Perform relaxation
      const newDistances = { ...prev.distances };
      const newPredecessors = { ...prev.predecessors };

      let changed = false;
      if (newDistance < prev.distances[target]) {
        newDistances[target] = newDistance;
        newPredecessors[target] = source;
        changed = true;
      }

      const nextStep = prev.currentStep + 1;
      const nextIteration = Math.floor(nextStep / prev.edgeOrder.length) + 1;

      return {
        ...prev,
        currentEdge: edge.id,
        currentStep: nextStep,
        iteration: nextIteration,
        distances: newDistances,
        predecessors: newPredecessors,
        anyChanges: prev.anyChanges || changed,
        iterationCount: Math.floor(nextStep / edges.length)
      };
    });

    // Add a small delay to make the animation more visible
    await new Promise(resolve => setTimeout(resolve, getAnimationDelay()));

    // Continue if still running
    setBellmanFordAnimationState(prev => {
      if (!prev.isPaused && prev.isRunning) {
        runBellmanFordStep();
      }
      return prev;
    });
  };

  const togglePauseBellmanFord = () => {
    setBellmanFordAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.isRunning) {
        runBellmanFordStep();
      }
      return newState;
    });
  };

  const resetBellmanFord = () => {
    setBellmanFordAnimationState({
      isRunning: false,
      isPaused: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      currentEdge: null,
      sourceNode: null,
      predecessors: {},
      distances: {},
      iteration: 0,
      edgeOrder: [],
      hasNegativeCycle: false,
      currentStep: 0,
      showShortestPaths: false
    });
  };

  // Add Dijkstra's algorithm functions
  const startDijkstra = () => {
    if (dijkstraAnimationState.isRunning) return;
    
    // Check if graph is undirected
    if (!isDirected) {
      alert('Dijkstra\'s algorithm requires a directed graph. Please switch to directed mode before starting.');
      return;
    }
    
    // Check for negative weights
    const hasNegativeWeights = edges.some(edge => edge.weight < 0);
    if (hasNegativeWeights) {
      alert('Dijkstra\'s algorithm cannot handle negative weights. Please use Bellman-Ford instead.');
      return;
    }
    
    // Prompt user to select source node
    setMode('dijkstra');
    alert('Click a node to start Dijkstra\'s algorithm');
  };

  const initializeDijkstra = (sourceNodeId) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;
    
    // Initialize distances and predecessors
    const initialDistances = {};
    const initialPredecessors = {};
    nodes.forEach(node => {
      initialDistances[node.uniqueId] = Infinity;
      initialPredecessors[node.uniqueId] = null;
    });
    
    initialDistances[sourceNode.uniqueId] = 0;

    setDijkstraAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      visitedNodes: new Set([sourceNode.uniqueId]),
      visitedEdges: new Set(),
      currentNode: sourceNode.uniqueId,
      sourceNode: sourceNode.uniqueId,
      predecessors: initialPredecessors,
      distances: initialDistances,
      priorityQueue: [[sourceNode.uniqueId, 0]], // [nodeId, distance]
      processedNodes: new Set(),
      currentEdge: null,
      relaxedEdges: new Set(),
      iterationCount: 0
    }));

    runDijkstraStep();
  };

  const runDijkstraStep = async () => {
    setDijkstraAnimationState(prev => {
      if (prev.isPaused || prev.priorityQueue.length === 0) {
        return prev;
      }

      // Sort priority queue by distance, then by node ID for equal distances
      prev.priorityQueue.sort((a, b) => {
        const [aNodeId, aDistance] = a;
        const [bNodeId, bDistance] = b;
        
        // First sort by distance
        if (aDistance !== bDistance) {
          return aDistance - bDistance;
        }
        
        // If distances are equal, sort by visible node ID
        const aVisibleId = nodes.find(n => n.uniqueId === aNodeId)?.id || 0;
        const bVisibleId = nodes.find(n => n.uniqueId === bNodeId)?.id || 0;
        return aVisibleId - bVisibleId;
      });
      
      const [currentNode, currentDistance] = prev.priorityQueue.shift();
      
      // Skip if node already processed
      if (prev.processedNodes.has(currentNode)) {
        return {
          ...prev,
          iterationCount: prev.iterationCount + 1
        };
      }

      // Mark node as processed
      const newProcessedNodes = new Set(prev.processedNodes);
      newProcessedNodes.add(currentNode);

      // Get current node's neighbors
      const currentNodeId = nodes.find(n => n.uniqueId === currentNode).id;
      const adjList = getAdjacencyList();
      const neighbors = adjList[currentNodeId];

      // Process each neighbor
      const newDistances = { ...prev.distances };
      const newPredecessors = { ...prev.predecessors };
      const newPriorityQueue = [...prev.priorityQueue];
      const newVisitedEdges = new Set(prev.visitedEdges);
      const newRelaxedEdges = new Set(prev.relaxedEdges);

      // Sort neighbors by their visible node values (node.id)
      const sortedNeighbors = [...neighbors].sort((a, b) => {
        const aNodeId = a.node;
        const bNodeId = b.node;
        return aNodeId - bNodeId;
      });

      sortedNeighbors.forEach(({ node: neighborId, weight }) => {
        const neighborUniqueId = nodes.find(n => n.id === neighborId)?.uniqueId;
        if (!neighborUniqueId || newProcessedNodes.has(neighborUniqueId)) return;

        // Only add edges connected to the current node being processed
        const edge = edges.find(e => 
          (e.source === currentNode && e.target === neighborUniqueId) ||
          (!isDirected && e.source === neighborUniqueId && e.target === currentNode)
        );
        
        if (edge) {
          newVisitedEdges.add(edge.id);
          const newDistance = prev.distances[currentNode] + weight;
          if (newDistance < prev.distances[neighborUniqueId]) {
            newDistances[neighborUniqueId] = newDistance;
            newPredecessors[neighborUniqueId] = currentNode;
            newPriorityQueue.push([neighborUniqueId, newDistance]);
            newRelaxedEdges.add(edge.id);
          }
        }
      });

      return {
        ...prev,
        currentNode,
        priorityQueue: newPriorityQueue,
        distances: newDistances,
        predecessors: newPredecessors,
        processedNodes: newProcessedNodes,
        visitedEdges: newVisitedEdges,
        relaxedEdges: newRelaxedEdges,
        iterationCount: prev.iterationCount + 1
      };
    });

    // Add a small delay to make the animation more visible
    await new Promise(resolve => setTimeout(resolve, getAnimationDelay()));

    // Continue if still running
    setDijkstraAnimationState(prev => {
      if (!prev.isPaused && prev.priorityQueue.length > 0) {
        runDijkstraStep();
      } else if (prev.priorityQueue.length === 0) {
        return { ...prev, isRunning: false };
      }
      return prev;
    });
  };

  const togglePauseDijkstra = () => {
    setDijkstraAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.priorityQueue.length > 0) {
        runDijkstraStep();
      }
      return newState;
    });
  };

  const resetDijkstra = () => {
    setDijkstraAnimationState({
      isRunning: false,
      isPaused: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      currentNode: null,
      sourceNode: null,
      predecessors: {},
      distances: {},
      priorityQueue: [],
      processedNodes: new Set(),
      currentEdge: null,
      relaxedEdges: new Set(),
      iterationCount: 0
    });
  };

  const getEdgeStyle = (edge) => {
    // Kruskal's algorithm styling - moved to top priority
    if (kruskalAnimationState.isRunning || kruskalAnimationState.isComplete) {
      // Edge is part of the MST
      if (kruskalAnimationState.mstEdges.has(edge.id)) {
        return "#90EE90"; // Light green for MST edges
      }
      
      // Current edge being evaluated (only during running)
      if (kruskalAnimationState.isRunning && kruskalAnimationState.currentEdge === edge.id) {
        return "#ff4500"; // Red-orange for current candidate edge
      }
      
      // Edge that has been visited but not added to MST
      if (kruskalAnimationState.visitedEdges.has(edge.id)) {
        return "#ddd"; // Light gray for visited edges
      }
    }
    // After algorithm completion, highlight shortest path edges
    else if (!bellmanFordAnimationState.isRunning && bellmanFordAnimationState.visitedNodes.size > 0) {
      // Check if this edge represents a final shortest path
      const targetNode = edge.target;
      const predecessorNode = bellmanFordAnimationState.predecessors[targetNode];
      if (predecessorNode === edge.source) {
        return "#90EE90"; // Light green for shortest path edges
      }
    }
    // During algorithm execution
    else if (bellmanFordAnimationState.isRunning) {
      // Current edge being evaluated
      if (bellmanFordAnimationState.currentEdge === edge.id) {
        return "#ff8c00"; // Orange for current edge
      }
      
      // Check if this edge represents a current shortest path
      const targetNode = edge.target;
      const predecessorNode = bellmanFordAnimationState.predecessors[targetNode];
      if (predecessorNode === edge.source) {
        return "#90EE90"; // Light green for predecessor edges
      }
    }
    // Dijkstra's algorithm styling
    else if (!dijkstraAnimationState.isRunning && dijkstraAnimationState.visitedNodes.size > 0) {
      // Check if this edge represents a final shortest path
      const targetNode = edge.target;
      const predecessorNode = dijkstraAnimationState.predecessors[targetNode];
      if (predecessorNode === edge.source) {
        return "#90EE90"; // Light green for shortest path edges
      }
    }
    else if (dijkstraAnimationState.isRunning) {
      // Only highlight edges connected to the current node
      if (edge.source === dijkstraAnimationState.currentNode || 
          (!isDirected && edge.target === dijkstraAnimationState.currentNode)) {
        // Edge that has been relaxed (improved the distance)
        if (dijkstraAnimationState.relaxedEdges.has(edge.id)) {
          return "#90EE90"; // Light green for relaxed edges
        }
        
        // Edge that has been visited but not relaxed
        if (dijkstraAnimationState.visitedEdges.has(edge.id)) {
          return "#ddd"; // Light gray for visited edges
        }
      }
    }
    // Prim's algorithm styling
    else if (primAnimationState.isRunning || primAnimationState.visitedNodes.size > 0) {
      // Edge is part of the MST
      if (primAnimationState.mstEdges.has(edge.id)) {
        return "#90EE90"; // Light green for MST edges
      }
      
      // Current edge being evaluated
      if (primAnimationState.currentEdge === edge.id) {
        return "#ff4500"; // Red-orange for current candidate edge
      }
      
      // Edge that has been visited but not added to MST
      if (primAnimationState.visitedEdges.has(edge.id)) {
        return "#ddd"; // Light gray for visited edges
      }
    }
    
    return "#999"; // Default edge color
  };

  // Add Prim's algorithm functions
  const startPrim = () => {
    if (primAnimationState.isRunning) return;
    
    // Check if graph is weighted
    if (!isWeighted) {
      alert('Prim\'s algorithm requires a weighted graph. Please switch to weighted mode before starting.');
      return;
    }
    
    // Prompt user to select source node
    setMode('prim');
    alert('Click a node to start Prim\'s algorithm');
  };

  const initializePrim = (sourceNodeId) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;
    
    // Initialize priority queue with edges from source node
    const initialPriorityQueue = [];
    const currentNodeId = nodes.find(n => n.uniqueId === sourceNode.uniqueId).id;
    const adjList = getAdjacencyList();
    
    adjList[currentNodeId].forEach(({ node: neighborId, weight }) => {
      const neighborUniqueId = nodes.find(n => n.id === neighborId)?.uniqueId;
      if (!neighborUniqueId) return;

      const edge = edges.find(e => 
        (e.source === sourceNode.uniqueId && e.target === neighborUniqueId) ||
        (!isDirected && e.source === neighborUniqueId && e.target === sourceNode.uniqueId)
      );
      
      if (edge) {
        initialPriorityQueue.push([edge.id, weight]);
      }
    });

    setPrimAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      visitedNodes: new Set([sourceNode.uniqueId]),
      visitedEdges: new Set(),
      currentNode: sourceNode.uniqueId,
      sourceNode: sourceNode.uniqueId,
      priorityQueue: initialPriorityQueue,
      processedNodes: new Set([sourceNode.uniqueId]),
      currentEdge: null,
      mstEdges: new Set(),
      totalWeight: 0,
      iterationCount: 0,
      error: null
    }));

    runPrimStep();
  };

  const runPrimStep = async () => {
    setPrimAnimationState(prev => {
      if (prev.isPaused) {
        return prev;
      }

      // If priority queue is empty but we haven't processed all nodes, graph is disconnected
      if (prev.priorityQueue.length === 0) {
        if (prev.processedNodes.size < nodes.length) {
          return {
            ...prev,
            isRunning: false,
            error: "Graph is disconnected. Cannot construct complete MST."
          };
        }
        // If we've processed all nodes, we're done
        return { ...prev, isRunning: false };
      }

      // Sort priority queue by weight first, then by node IDs for edges with equal weights
      const sortedQueue = [...prev.priorityQueue].sort((a, b) => {
        const [aEdgeId, aWeight] = a;
        const [bEdgeId, bWeight] = b;
        
        // First sort by weight
        if (aWeight !== bWeight) {
          return aWeight - bWeight;
        }
        
        // If weights are equal, sort by source and target node IDs
        const aEdge = edges.find(e => e.id === aEdgeId);
        const bEdge = edges.find(e => e.id === bEdgeId);
        
        if (!aEdge || !bEdge) return 0;
        
        const aSource = nodes.find(n => n.uniqueId === aEdge.source)?.id || 0;
        const aTarget = nodes.find(n => n.uniqueId === aEdge.target)?.id || 0;
        const bSource = nodes.find(n => n.uniqueId === bEdge.source)?.id || 0;
        const bTarget = nodes.find(n => n.uniqueId === bEdge.target)?.id || 0;
        
        // First compare by source node ID
        if (aSource !== bSource) {
          return aSource - bSource;
        }
        // If source is the same, compare by target node ID
        return aTarget - bTarget;
      });
      
      // Get edge with minimum weight
      const [currentEdgeId, weight] = sortedQueue[0];
      const currentEdge = edges.find(e => e.id === currentEdgeId);
      
      if (!currentEdge) return prev;

      // Determine which node is new (not in MST)
      const sourceInMST = prev.processedNodes.has(currentEdge.source);
      const targetInMST = prev.processedNodes.has(currentEdge.target);
      
      // Skip if both nodes are already in MST
      if (sourceInMST && targetInMST) {
        // Remove this edge from priority queue and continue
        return {
          ...prev,
          priorityQueue: sortedQueue.slice(1)
        };
      }

      // Get the new node to add to MST
      const newNode = sourceInMST ? currentEdge.target : currentEdge.source;
      
      // Add edge to MST
      const newMSTEdges = new Set(prev.mstEdges);
      newMSTEdges.add(currentEdgeId);

      // Add new node to processed nodes
      const newProcessedNodes = new Set(prev.processedNodes);
      newProcessedNodes.add(newNode);

      // Get new edges to add to priority queue
      const newNodeId = nodes.find(n => n.uniqueId === newNode)?.id;
      const adjList = getAdjacencyList();
      const newPriorityQueue = sortedQueue.slice(1); // Remove the current edge

      if (adjList[newNodeId]) {
        // Sort neighbors by their visible node values (node.id)
        const sortedNeighbors = [...adjList[newNodeId]].sort((a, b) => a.node - b.node);
        
        sortedNeighbors.forEach(({ node: neighborId, weight: edgeWeight }) => {
          const neighborUniqueId = nodes.find(n => n.id === neighborId)?.uniqueId;
          if (!neighborUniqueId || newProcessedNodes.has(neighborUniqueId)) return;

          const edge = edges.find(e => 
            (e.source === newNode && e.target === neighborUniqueId) ||
            (!isDirected && e.source === neighborUniqueId && e.target === newNode)
          );
          
          if (edge) {
            // Only add edge if it's not already in the priority queue
            if (!newPriorityQueue.some(([id]) => id === edge.id)) {
              newPriorityQueue.push([edge.id, edgeWeight]);
            }
          }
        });
      }

      // Debug logging
      console.log('Current state:', {
        processedNodesSize: newProcessedNodes.size,
        totalNodes: nodes.length,
        queueSize: newPriorityQueue.length,
        currentEdge: currentEdgeId,
        newNode,
        mstEdgesSize: newMSTEdges.size
      });

      return {
        ...prev,
        currentNode: newNode,
        priorityQueue: newPriorityQueue,
        processedNodes: newProcessedNodes,
        visitedEdges: new Set([...prev.visitedEdges, currentEdgeId]),
        mstEdges: newMSTEdges,
        totalWeight: prev.totalWeight + weight,
        currentEdge: currentEdgeId,
        iterationCount: prev.iterationCount + 1
      };
    });

    // Add a small delay to make the animation more visible
    await new Promise(resolve => setTimeout(resolve, getAnimationDelay()));

    // Continue if still running
    setPrimAnimationState(prev => {
      // Continue if we haven't processed all nodes yet
      if (!prev.isPaused && prev.isRunning && prev.processedNodes.size < nodes.length) {
        runPrimStep();
      } else if (prev.processedNodes.size === nodes.length) {
        // If we've processed all nodes, we're done
        return { ...prev, isRunning: false };
      }
      return prev;
    });
  };

  const togglePausePrim = () => {
    setPrimAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.priorityQueue.length > 0) {
        runPrimStep();
      }
      return newState;
    });
  };

  const resetPrim = () => {
    setPrimAnimationState({
      isRunning: false,
      isPaused: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      currentNode: null,
      sourceNode: null,
      priorityQueue: [],
      processedNodes: new Set(),
      currentEdge: null,
      mstEdges: new Set(),
      totalWeight: 0,
      iterationCount: 0,
      error: null
    });
  };

  const startKruskal = () => {
    if (kruskalAnimationState.isRunning) return;
    
    // Check if graph is weighted and undirected
    if (!isWeighted) {
      alert('Kruskal\'s algorithm requires a weighted graph. Please switch to weighted mode before starting.');
      return;
    }

    if (isDirected) {
      alert('Kruskal\'s algorithm requires an undirected graph. Please switch to undirected mode before starting.');
      return;
    }

    // Initialize algorithm
    const dsu = new DisjointSet();
    nodes.forEach(node => dsu.makeSet(node.uniqueId));

    // Sort edges by weight first, then by node IDs for edges with equal weights
    const sortedEdges = [...edges].sort((a, b) => {
      // First sort by weight
      if (a.weight !== b.weight) {
        return a.weight - b.weight;
      }
      
      // If weights are equal, sort by source and target node IDs
      const aSource = nodes.find(n => n.uniqueId === a.source)?.id || 0;
      const aTarget = nodes.find(n => n.uniqueId === a.target)?.id || 0;
      const bSource = nodes.find(n => n.uniqueId === b.source)?.id || 0;
      const bTarget = nodes.find(n => n.uniqueId === b.target)?.id || 0;
      
      // For undirected edges, use the smaller node ID as source and larger as target for consistent sorting
      const [aMinId, aMaxId] = aSource <= aTarget ? [aSource, aTarget] : [aTarget, aSource];
      const [bMinId, bMaxId] = bSource <= bTarget ? [bSource, bTarget] : [bTarget, bSource];
      
      // First compare by smaller node ID
      if (aMinId !== bMinId) {
        return aMinId - bMinId;
      }
      // If smaller node IDs are the same, compare by larger node ID
      return aMaxId - bMaxId;
    });

    // Get initial components
    const { nodeToComponent, numComponents } = dsu.getComponents();

    setKruskalAnimationState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      isComplete: false, //  flag
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      currentEdge: null,
      mstEdges: new Set(),
      totalWeight: 0,
      edgesProcessed: 0,
      sortedEdges,
      currentStep: 0,
      components: nodeToComponent,
      numComponents,
      error: null
    }));

    runKruskalStep(dsu);
  };

  const runKruskalStep = async (dsu) => {
    setKruskalAnimationState(prev => {
      if (prev.isPaused || prev.currentStep >= prev.sortedEdges.length) {
        return prev;
      }

      const currentEdge = prev.sortedEdges[prev.currentStep];
      const { source, target, weight } = currentEdge;

      // Check if adding this edge would create a cycle
      const wouldCreateCycle = dsu.inSameSet(source, target);
      
      let newMSTEdges = new Set(prev.mstEdges);
      let newTotalWeight = prev.totalWeight;
      
      if (!wouldCreateCycle) {
        dsu.union(source, target);
        newMSTEdges.add(currentEdge.id);
        newTotalWeight += weight;
      }

      // Get updated components
      const { nodeToComponent, numComponents } = dsu.getComponents();

      return {
        ...prev,
        currentEdge: currentEdge.id,
        visitedEdges: new Set([...prev.visitedEdges, currentEdge.id]),
        mstEdges: newMSTEdges,
        totalWeight: newTotalWeight,
        edgesProcessed: prev.edgesProcessed + 1,
        currentStep: prev.currentStep + 1,
        components: nodeToComponent,
        numComponents
      };
    });

    // Add a small delay to make the animation more visible
    await new Promise(resolve => setTimeout(resolve, getAnimationDelay()));

    // Continue if still running
    setKruskalAnimationState(prev => {
      if (!prev.isPaused && prev.currentStep < prev.sortedEdges.length) {
        runKruskalStep(dsu);
      } else if (prev.currentStep >= prev.sortedEdges.length) {
        // Check if we have a valid MST (all nodes connected)
        const isConnected = prev.numComponents === 1;
        return {
          ...prev,
          isRunning: false,
          isComplete: true, // Set this to true when algorithm completes
          error: isConnected ? null : "Graph is disconnected. Forest of MSTs generated."
        };
      }
      return prev;
    });
  };

  const togglePauseKruskal = () => {
    setKruskalAnimationState(prev => {
      const newState = { ...prev, isPaused: !prev.isPaused };
      if (!newState.isPaused && newState.currentStep < newState.sortedEdges.length) {
        const dsu = new DisjointSet();
        nodes.forEach(node => dsu.makeSet(node.uniqueId));
        // Reconstruct DSU state
        Array.from(newState.mstEdges).forEach(edgeId => {
          const edge = edges.find(e => e.id === edgeId);
          if (edge) {
            dsu.union(edge.source, edge.target);
          }
        });
        runKruskalStep(dsu);
      }
      return newState;
    });
  };

  const resetKruskal = () => {
    // Create a fresh state object with all values cleared
    setKruskalAnimationState({
      isRunning: false,
      isPaused: false,
      isComplete: false,
      visitedNodes: new Set(),
      visitedEdges: new Set(),
      currentEdge: null,
      mstEdges: new Set(),
      totalWeight: 0,
      edgesProcessed: 0,
      sortedEdges: [],
      currentStep: 0,
      components: new Map(),
      numComponents: 0,
      error: null
    });
  };

  return (
    <div className="graph-editor">
      <header className="graph-editor__header">
        <h1 className="graph-editor__title">Graph Theory</h1>
      </header>

      <div className="graph-editor__controls">
        <div className="left-controls">
          <div className="current-state">
            <div className="current-state-indicator"></div>
            <span className="current-state-text">Current Mode: {getCurrentStateText()}</span>
          </div>
          
          {/* Graph Type and Speed Controls */}
          <div className="control-group">
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="weighted"
                  checked={isWeighted}
                  onChange={() => setIsWeighted(true)}
                /> 
                Weighted
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="unweighted"
                  checked={!isWeighted}
                  onChange={() => setIsWeighted(false)}
                /> 
                Unweighted
              </label>
              <label className="radio-label" style={{ 
                opacity: nodes.length > 0 ? 0.5 : 1,
                cursor: nodes.length > 0 ? 'not-allowed' : 'pointer'
              }}>
                <input
                  type="radio"
                  value="directed"
                  checked={isDirected}
                  onChange={() => handleDirectedToggle(true)}
                  disabled={nodes.length > 0}
                /> 
                Directed
              </label>
              <label className="radio-label" style={{ 
                opacity: nodes.length > 0 ? 0.5 : 1,
                cursor: nodes.length > 0 ? 'not-allowed' : 'pointer'
              }}>
                <input
                  type="radio"
                  value="undirected"
                  checked={!isDirected}
                  onChange={() => handleDirectedToggle(false)}
                  disabled={nodes.length > 0}
                /> 
                Undirected
              </label>
            </div>

            <div className="speed-slider">
              <label htmlFor="speed-control">Animation Speed:</label>
              <input
                id="speed-control"
                type="range"
                min="1"
                max="100"
                value={animationSpeed}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  setAnimationSpeed(value);
                  // Update the background gradient
                  e.target.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${value}%, var(--background) ${value}%, var(--background) 100%)`;
                }}
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${animationSpeed}%, var(--background) ${animationSpeed}%, var(--background) 100%)`
                }}
                disabled={bfsAnimationState.isRunning && !bfsAnimationState.isPaused}
              />
              <span>{animationSpeed}%</span>
            </div>
          </div>

          {/* Main Graph Controls */}
          <div className="button-group">
            <button className="btn btn-primary" onClick={setModeAddNode}>Add Node</button>
            <button className="btn btn-primary" onClick={setModeAddEdge}>Add Edge</button>
            <button className="btn btn-secondary" onClick={setModeDelete}>Delete</button>
            <button className="btn btn-secondary" onClick={setModeRenameEdge}>Change Edge Weight</button>
            <button 
              className={`btn ${mode === 'drag' ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={setModeDrag}
            >
              Drag Mode
            </button>
            <button className="btn btn-secondary" onClick={resetNodeCounter}>Reset Counter</button>
            <button className="btn btn-danger" onClick={deleteAll}>Delete All</button>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="graph-container">
          <svg
            className="graph-canvas"
            width="100%"
            height="600"
            data-directed={isDirected}
            onClick={handleSvgClick}
          >
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="20"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#999" />
              </marker>
              
              <marker
                id="arrowhead-with-background"
                viewBox="0 0 12 12"
                refX="20"
                refY="6"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
              >
                <path d="M 0 0 L 12 6 L 0 12 z" fill="white" />
                <path d="M 1 1 L 11 6 L 1 11 z" fill="#999" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const sourceNode = nodes.find((n) => n.uniqueId === edge.source);
              const targetNode = nodes.find((n) => n.uniqueId === edge.target);
              if (!sourceNode || !targetNode) return null;

              // Check for bidirectional edges
              const oppositeEdge = edges.find(e => 
                e.source === edge.target && 
                e.target === edge.source
              );

              // Apply offset if there's a bidirectional connection
              const offset = oppositeEdge ? 20 : 0;
              
              const [labelX, labelY] = getMidpoint(
                sourceNode.x, 
                sourceNode.y, 
                targetNode.x, 
                targetNode.y,
                offset
              );

              const edgeColor = getEdgeStyle(edge);
              return (
                <g key={edge.id} className="edge" onClick={(e) => handleEdgeClick(edge, e)}>
                  <path
                    d={getEdgePath(
                      sourceNode.x, 
                      sourceNode.y, 
                      targetNode.x, 
                      targetNode.y,
                      oppositeEdge ? 20 : 0
                    )}
                    stroke={edgeColor}
                    strokeWidth={edge.id === bellmanFordAnimationState.currentEdge ? "3" : "2"}
                    markerEnd={isDirected ? `url(#arrowhead-with-background)` : undefined}
                    style={{
                      '--marker-color': edgeColor
                    }}
                    fill="none"
                  />
                  {isWeighted && (
                    <text 
                      x={labelX} 
                      y={labelY}  
                      dy="-5"
                      textAnchor="middle"
                      alignmentBaseline="middle"
                    >
                      {edge.weight}
                    </text>
                  )}
                </g>
              );
            })}

            {nodes.map((node) => (
              <g
                key={node.uniqueId}
                className="node"
                onClick={(e) => {
                  e.stopPropagation();
                  if (mode === 'bfs') {
                    startBFS(node.id);
                  } else if (mode === 'dfs') {
                    startDFS(node.id);
                  } else if (mode === 'timed_dfs') {
                    startTimedDFS(node.id);
                  } else if (!bfsAnimationState.isRunning && !dfsAnimationState.isRunning && !timedDfsAnimationState.isRunning) {
                    handleNodeClick(node.id, node.uniqueId, e);
                  }
                }}
                style={{ cursor: mode === 'drag' ? 'move' : 'pointer' }}
                ref={(el) => {
                  if (el) {
                    d3.select(el).datum(node);
                  }
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={20}
                  fill={getNodeFill(node)}
                  stroke={highlightedNodes.includes(node.uniqueId) ? "green" : "darkblue"}
                  strokeWidth={highlightedNodes.includes(node.uniqueId) ? "4" : "2"}
                />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dy=".3em"
                  style={{ fontWeight: 'bold' }}
                >
                  {node.id}
                </text>
              </g>
            ))}
          </svg>

          <div className="matrix-list-container">
            <div className="matrix-list">
              <div className="section-header" onClick={() => setIsMatrixExpanded(!isMatrixExpanded)}>
                <h2>Adjacency Matrix</h2>
                <span className={`arrow ${isMatrixExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              {isMatrixExpanded && renderAdjacencyMatrix()}
            </div>

            <div className="adjacency-list">
              <div className="section-header" onClick={() => setIsListExpanded(!isListExpanded)}>
                <h2>Adjacency List</h2>
                <span className={`arrow ${isListExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              {isListExpanded && <pre>{getFormattedAdjacencyList()}</pre>}
            </div>
          </div>

          {(bfsAnimationState.isRunning || bfsAnimationState.visitedNodes.size > 0) && (
            <div className="bfs-status-container">
              <h3>BFS Status</h3>
              <div className="bfs-status">
                <div className="current-node">
                  <strong>Current Node:</strong> {
                    bfsAnimationState.currentNode ? 
                    ` Node ${nodes.find(n => n.uniqueId === bfsAnimationState.currentNode)?.id}` : 
                    ' None'
                  }
                </div>
                <div className="queue-section">
                  <strong>Queue:</strong>
                  <div className="queue-visualization">
                    {bfsAnimationState.queue.map((nodeId, index) => (
                      <div key={index} className="queue-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="dictionary-section">
                  <strong>Predecessors:</strong>
                  <div className="dictionary-visualization">
                    {Object.entries(bfsAnimationState.predecessors).map(([nodeId, predId]) => (
                      <div key={nodeId} className="dictionary-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}: {
                          predId ? `Node ${nodes.find(n => n.uniqueId === predId)?.id}` : 'None'
                        }
                      </div>
                    ))}
                  </div>
                </div>

                <div className="dictionary-section">
                  <strong>Distances:</strong>
                  <div className="dictionary-visualization">
                    {Object.entries(bfsAnimationState.distances).map(([nodeId, distance]) => (
                      <div key={nodeId} className="dictionary-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}: {distance === Infinity ? '∞' : distance}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(dfsAnimationState.isRunning || dfsAnimationState.visitedNodes.size > 0) && (
            <div className="dfs-status-container">
              <h3>DFS Status</h3>
              <div className="dfs-status">
                <div className="current-node">
                  <strong>Current Node:</strong> {
                    dfsAnimationState.currentNode ? 
                    ` Node ${nodes.find(n => n.uniqueId === dfsAnimationState.currentNode)?.id}` : 
                    ' None'
                  }
                </div>
                <div className="stack-section">
                  <strong>Stack:</strong>
                  <div className="stack-visualization">
                    {dfsAnimationState.stack.map((nodeId, index) => (
                      <div key={index} className="stack-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="dictionary-section">
                  <strong>Predecessors:</strong>
                  <div className="dictionary-visualization">
                    {Object.entries(dfsAnimationState.predecessors).map(([nodeId, predId]) => (
                      <div key={nodeId} className="dictionary-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}: {
                          predId ? `Node ${nodes.find(n => n.uniqueId === predId)?.id}` : 'None'
                        }
                      </div>
                    ))}
                  </div>
                </div>

                <div className="dictionary-section">
                  <strong>Distances:</strong>
                  <div className="dictionary-visualization">
                    {Object.entries(dfsAnimationState.distances).map(([nodeId, distance]) => (
                      <div key={nodeId} className="dictionary-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}: {distance === Infinity ? '∞' : distance}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(timedDfsAnimationState.isRunning || timedDfsAnimationState.visitedNodes.size > 0) && (
            <div className="timed-dfs-status-container">
              <h3>Topological Sort (DFS) Status</h3>
              <div className="dfs-status">
                <div className="current-node">
                  <strong>Current Node:</strong> {
                    timedDfsAnimationState.currentNode ? 
                    ` Node ${nodes.find(n => n.uniqueId === timedDfsAnimationState.currentNode)?.id}` : 
                    ' None'
                  }
                </div>
                <div className="stack-section">
                  <strong>Stack:</strong>
                  <div className="stack-visualization">
                    {timedDfsAnimationState.stack.map((nodeId, index) => (
                      <div key={index} className="stack-item">
                        Node {nodes.find(n => n.uniqueId === nodeId)?.id}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="timed-dfs-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Node</th>
                        <th>Start</th>
                        <th>Finish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.sort((a, b) => a.id - b.id).map(node => (
                        <tr key={node.id}>
                          <td>{node.id}</td>
                          <td>{timedDfsAnimationState.startTimes[node.uniqueId] || '-'}</td>
                          <td>{timedDfsAnimationState.finishTimes[node.uniqueId] || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!timedDfsAnimationState.isRunning && timedDfsAnimationState.visitedNodes.size > 0 && (
                  <>
                    <div className={`topological-sort-status ${!isDirected || timedDfsAnimationState.hasBackEdge ? 'invalid' : 'valid'}`}>
                      {!isDirected ? (
                        "Topological Sort: Not Applicable (Undirected Graph)"
                      ) : timedDfsAnimationState.hasBackEdge ? (
                        "Topological Sort: Invalid (Cycle Detected)"
                      ) : (
                        "Topological Sort: Valid (No Cycles)"
                      )}
                    </div>

                    {isDirected && !timedDfsAnimationState.hasBackEdge && (
                      <div className="topological-sort-result">
                        <strong>Topological Sort:</strong>
                        <div className="sort-visualization">
                          {getTopologicalSort(timedDfsAnimationState.finishTimes).map((nodeId, index) => (
                            <div key={index} className="sort-item">
                              {nodeId}
                              {index < nodes.length - 1 && " → "}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {(bellmanFordAnimationState.isRunning || bellmanFordAnimationState.visitedNodes.size > 0) && (
            <div className="bellman-ford-status-container">
              <h3>Bellman-Ford Status</h3>
              <div className="bellman-ford-status">
                <div className="current-state">
                  <strong>Iterations completed:</strong> {bellmanFordAnimationState.iterationCount || 0}
                </div>
                
                <div className="edge-sequence-section">
                  <strong>Edge Processing Order:</strong>
                  <div className="edge-sequence-visualization">
                    {edges.map((edge, index) => (
                      <div 
                        key={index} 
                        className={`edge-item ${edge.id === bellmanFordAnimationState.currentEdge ? 'current' : ''}`}
                      >
                        (v{nodes.find(n => n.uniqueId === edge.source)?.id}, 
                         v{nodes.find(n => n.uniqueId === edge.target)?.id})
                        {index < edges.length - 1 && ', '}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="distances-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Node</th>
                        <th>Distance</th>
                        <th>Predecessor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.sort((a, b) => a.id - b.id).map(node => (
                        <tr key={node.id}>
                          <td>v{node.id}</td>
                          <td>
                            {bellmanFordAnimationState.distances[node.uniqueId] === Infinity 
                              ? '∞' 
                              : bellmanFordAnimationState.distances[node.uniqueId]}
                          </td>
                          <td>
                            {bellmanFordAnimationState.predecessors[node.uniqueId] 
                              ? nodes.find(n => n.uniqueId === bellmanFordAnimationState.predecessors[node.uniqueId])?.id 
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!bellmanFordAnimationState.isRunning && bellmanFordAnimationState.visitedNodes.size > 0 && (
                  <div className={`algorithm-result ${bellmanFordAnimationState.hasNegativeCycle ? 'invalid' : 'valid'}`}>
                    {bellmanFordAnimationState.hasNegativeCycle 
                      ? "Negative Cycle Detected!"
                      : "Shortest paths found successfully"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Dijkstra's algorithm status display */}
          {(dijkstraAnimationState.isRunning || dijkstraAnimationState.visitedNodes.size > 0) && (
            <div className="dijkstra-status-container">
              <h3>Dijkstra's Algorithm Status</h3>
              <div className="dijkstra-status">
                <div className="current-state">
                  <strong>Nodes processed:</strong> {dijkstraAnimationState.processedNodes.size}
                </div>
                
                <div className="priority-queue-section">
                  <strong>Priority Queue:</strong>
                  <div className="priority-queue-visualization">
                    {dijkstraAnimationState.priorityQueue.map(([nodeId, distance], index) => (
                      <div key={index} className="queue-item">
                        v{nodes.find(n => n.uniqueId === nodeId)?.id} (dist: {distance})
                      </div>
                    ))}
                  </div>
                </div>

                <div className="distances-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Node</th>
                        <th>Distance</th>
                        <th>Predecessor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.sort((a, b) => a.id - b.id).map(node => (
                        <tr 
                          key={node.id}
                          className={
                            node.uniqueId === dijkstraAnimationState.currentNode ? 'current' :
                            dijkstraAnimationState.processedNodes.has(node.uniqueId) ? 'processed' :
                            dijkstraAnimationState.visitedNodes.has(node.uniqueId) ? 'visited' : ''
                          }
                        >
                          <td>v{node.id}</td>
                          <td>
                            {dijkstraAnimationState.distances[node.uniqueId] === Infinity 
                              ? '∞' 
                              : dijkstraAnimationState.distances[node.uniqueId]}
                          </td>
                          <td>
                            {dijkstraAnimationState.predecessors[node.uniqueId] 
                              ? nodes.find(n => n.uniqueId === dijkstraAnimationState.predecessors[node.uniqueId])?.id 
                              : '-'}
                          </td>
                          <td>
                            {node.uniqueId === dijkstraAnimationState.currentNode ? 'Current' :
                             dijkstraAnimationState.processedNodes.has(node.uniqueId) ? 'Processed' :
                             dijkstraAnimationState.visitedNodes.has(node.uniqueId) ? 'In Queue' : 'Unvisited'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!dijkstraAnimationState.isRunning && dijkstraAnimationState.visitedNodes.size > 0 && (
                  <div className="algorithm-result valid">
                    Shortest paths found successfully
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Prim's algorithm status display */}
          {(primAnimationState.isRunning || primAnimationState.visitedNodes.size > 0) && (
            <div className="prim-status-container">
              <h3>Prim's Algorithm Status</h3>
              <div className="prim-status">
                <div className="current-state">
                  <strong>Iterations completed:</strong> {primAnimationState.iterationCount || 0}
                </div>
                
                <div className="mst-edges-section">
                  <strong>MST Edges:</strong>
                  <div className="mst-edges-visualization">
                    {Array.from(primAnimationState.mstEdges).map((edgeId, index) => {
                      const edge = edges.find(e => e.id === edgeId);
                      if (!edge) return null;
                      const sourceNode = nodes.find(n => n.uniqueId === edge.source);
                      const targetNode = nodes.find(n => n.uniqueId === edge.target);
                      if (!sourceNode || !targetNode) return null;
                      return (
                        <div key={index} className="edge-item">
                          ({sourceNode.id} → {targetNode.id})
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="total-weight-section">
                  <strong>Total Weight:</strong> {primAnimationState.totalWeight || 0}
                </div>

                {!primAnimationState.isRunning && primAnimationState.visitedNodes.size > 0 && (
                  <div className={`algorithm-result ${primAnimationState.error ? 'invalid' : 'valid'}`}>
                    {primAnimationState.error ? "Graph is disconnected. Cannot construct complete MST." : "MST found successfully"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Kruskal's algorithm status display */}
          {(kruskalAnimationState.isRunning || kruskalAnimationState.isComplete) && (
            <div className="kruskal-status-container">
              <h3>Kruskal's Algorithm Status</h3>
              <div className="kruskal-status">
                <div className="current-state">
                  <strong>Edges Processed:</strong> {kruskalAnimationState.edgesProcessed} / {edges.length}
                </div>
                
                <div className="mst-edges-section">
                  <strong>MST Edges:</strong>
                  <div className="mst-edges-visualization">
                    {Array.from(kruskalAnimationState.mstEdges).map((edgeId, index) => {
                      const edge = edges.find(e => e.id === edgeId);
                      if (!edge) return null;
                      const sourceNode = nodes.find(n => n.uniqueId === edge.source);
                      const targetNode = nodes.find(n => n.uniqueId === edge.target);
                      if (!sourceNode || !targetNode) return null;
                      return (
                        <div key={index} className="edge-item">
                          ({sourceNode.id} → {targetNode.id}, weight: {edge.weight})
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="total-weight-section">
                  <strong>Total MST Weight:</strong> {kruskalAnimationState.totalWeight}
                </div>

                <div className="components-section">
                  <strong>Connected Components:</strong> {kruskalAnimationState.numComponents}
                </div>

                {!kruskalAnimationState.isRunning && kruskalAnimationState.isComplete && (
                  <div className={`algorithm-result ${kruskalAnimationState.error ? 'invalid' : 'valid'}`}>
                    {kruskalAnimationState.error || "MST found successfully"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="algorithm-container">
          <h2>Algorithms</h2>
          
          <div className="algorithm-section">
            <h3>Breadth-First Search</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setMode('bfs');
                  alert('Click a node to start BFS');
                }}
                disabled={bfsAnimationState.isRunning}
              >
                Start BFS
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseBFS}
                disabled={!bfsAnimationState.isRunning}
              >
                {bfsAnimationState.isPaused ? 'Resume' : 'Pause'} BFS
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetBFS}
                disabled={!bfsAnimationState.isRunning && !bfsAnimationState.visitedNodes.size}
              >
                Reset BFS
              </button>
            </div>
          </div>

          <div className="algorithm-section">
            <h3>Depth-First Search</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setMode('dfs');
                  alert('Click a node to start DFS');
                }}
                disabled={dfsAnimationState.isRunning}
              >
                Start DFS
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseDFS}
                disabled={!dfsAnimationState.isRunning}
              >
                {dfsAnimationState.isPaused ? 'Resume' : 'Pause'} DFS
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetDFS}
                disabled={!dfsAnimationState.isRunning && !dfsAnimationState.visitedNodes.size}
              >
                Reset DFS
              </button>
            </div>
          </div>

          <div className="algorithm-section">
            <h3>Topological Sort (DFS)</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setMode('timed_dfs');
                  alert('Click a node to start Topological Sort');
                }}
                disabled={timedDfsAnimationState.isRunning}
              >
                Start Topological Sort (DFS)
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseTimedDFS}
                disabled={!timedDfsAnimationState.isRunning}
              >
                {timedDfsAnimationState.isPaused ? 'Resume' : 'Pause'} Topological Sort (DFS)
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetTimedDFS}
                disabled={!timedDfsAnimationState.isRunning && !timedDfsAnimationState.visitedNodes.size}
              >
                Reset Topological Sort (DFS)
              </button>
            </div>
          </div>

          <div className="algorithm-section">
            <h3>Bellman Ford</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={startBellmanFord}
                disabled={bellmanFordAnimationState.isRunning || nodes.length === 0}
              >
                Start Bellman Ford
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseBellmanFord}
                disabled={!bellmanFordAnimationState.isRunning}
              >
                {bellmanFordAnimationState.isPaused ? 'Resume' : 'Pause'} Bellman Ford
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetBellmanFord}
                disabled={!bellmanFordAnimationState.isRunning && !bellmanFordAnimationState.visitedNodes.size}
              >
                Reset Bellman Ford
              </button>
            </div>
          </div>                

          <div className="algorithm-section">
            <h3>Dijkstra's Algorithm</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={startDijkstra}
                disabled={dijkstraAnimationState.isRunning || nodes.length === 0}
                title={!isDirected ? "Dijkstra's algorithm requires a directed graph" : ""}
              >
                Start Dijkstra's Algorithm
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseDijkstra}
                disabled={!dijkstraAnimationState.isRunning}
              >
                {dijkstraAnimationState.isPaused ? 'Resume' : 'Pause'} Dijkstra's Algorithm
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetDijkstra}
                disabled={!dijkstraAnimationState.isRunning && !dijkstraAnimationState.visitedNodes.size}
              >
                Reset Dijkstra's Algorithm
              </button>
            </div>
          </div>

          <div className="algorithm-section">
            <h3>Prim's Algorithm</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={startPrim}
                disabled={primAnimationState.isRunning || !isWeighted}
                title={!isWeighted ? "Prim's algorithm requires a weighted graph" : ""}
              >
                Start Prim's Algorithm
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePausePrim}
                disabled={!primAnimationState.isRunning}
              >
                {primAnimationState.isPaused ? 'Resume' : 'Pause'} Prim's Algorithm
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetPrim}
                disabled={!primAnimationState.isRunning && !primAnimationState.visitedNodes.size}
              >
                Reset Prim's Algorithm
              </button>
            </div>
          </div>

          <div className="algorithm-section">
            <h3>Kruskal's Algorithm</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={startKruskal}
                disabled={kruskalAnimationState.isRunning || !isWeighted}
                title={!isWeighted ? "Kruskal's algorithm requires a weighted graph" : "Click to start Kruskal's algorithm"}
              >
                Start Kruskal's Algorithm
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseKruskal}
                disabled={!kruskalAnimationState.isRunning}
              >
                {kruskalAnimationState.isPaused ? 'Resume' : 'Pause'} Kruskal's Algorithm
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetKruskal}
                disabled={!kruskalAnimationState.isRunning && !kruskalAnimationState.isComplete}
              >
                Reset Kruskal's Algorithm
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
