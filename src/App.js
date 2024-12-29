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
    time: 0
  });

  // A ref to keep track of the next node id
  const nextNodeId = useRef(0);
  // Add a ref for unique edge IDs
  const nextEdgeId = useRef(0);

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
  const getMidpoint = (x1, y1, x2, y2) => {
    return [(x1 + x2) / 2, (y1 + y2) / 2];
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
    
    // Reset BFS state
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

    // Reset DFS state
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

  // Add these helper functions to GraphEditor component
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

  // // Example usage for algorithms
  // const runDijkstra = (startNodeId) => {
  //   const graph = getAdjacencyList();
  //   // Now you can run Dijkstra's algorithm using this format
  //   // ...
  // };

  // Add new mode setter
  const setModeDrag = () => {
    setMode('drag');
    setEdgeStart(null);
  };

  // Add this function to format the adjacency list for display
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

  // Add this function to generate the adjacency matrix
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

  // Add this function to render the matrix
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

  // Add these new functions to handle BFS
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
    return 2400 - (animationSpeed * 15);
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
        .map(({node}) => nodes.find(n => n.id === node)?.uniqueId)
        .filter(nodeId => nodeId && !prev.visitedNodes.has(nodeId));

      // Update predecessors and distances for newly discovered nodes
      const newPredecessors = { ...prev.predecessors };
      const newDistances = { ...prev.distances };
      neighbors.forEach(neighborId => {
        newPredecessors[neighborId] = currentNode;
        newDistances[neighborId] = prev.distances[currentNode] + 1;
      });

      // Add edges to visited edges
      const newVisitedEdges = new Set(prev.visitedEdges);
      neighbors.forEach(neighborId => {
        const edge = edges.find(e => 
          (e.source === currentNode && e.target === neighborId) ||
          (!isDirected && e.target === currentNode && e.source === neighborId)
        );
        if (edge) newVisitedEdges.add(edge.id);
      });

      return {
        ...prev,
        queue: [...newQueue, ...neighbors],
        visitedNodes: new Set([...prev.visitedNodes, ...neighbors]),
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
        .map(({node}) => nodes.find(n => n.id === node)?.uniqueId)
        .filter(nodeId => nodeId && !prev.visitedNodes.has(nodeId));

      if (neighbors.length > 0) {
        // If there are unvisited neighbors, visit the first one
        const nextNode = neighbors[0];
        
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

  // Add this helper function inside the GraphEditor component
  const getCurrentStateText = () => {
    if (bfsAnimationState.isRunning) return 'Running BFS';
    if (dfsAnimationState.isRunning) return 'Running DFS';
    if (timedDfsAnimationState.isRunning) return 'Running Timed DFS';
    
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
        return 'Select Node for Timed DFS';
      default:
        return mode;
    }
  };

  // Add these new functions for Timed DFS
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
      time: 1
    }));

    runTimedDFSStep();
  };

  const runTimedDFSStep = async () => {
    setTimedDfsAnimationState(prev => {
      if (prev.stack.length === 0 || prev.isPaused) {
        return prev;
      }

      const currentNode = prev.stack[prev.stack.length - 1];
      const currentNodeId = nodes.find(n => n.uniqueId === currentNode).id;
      const adjList = getAdjacencyList();
      
      // Get unvisited neighbors
      const neighbors = adjList[currentNodeId]
        .map(({node}) => nodes.find(n => n.id === node)?.uniqueId)
        .filter(nodeId => nodeId && !prev.visitedNodes.has(nodeId));

      if (neighbors.length > 0) {
        // Visit the first unvisited neighbor
        const nextNode = neighbors[0];
        const newTime = prev.time + 1;
        
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
          startTimes: { ...prev.startTimes, [nextNode]: newTime },
          time: newTime
        };
      } else {
        // No unvisited neighbors, finish current node
        const newStack = prev.stack.slice(0, -1);
        const newTime = prev.time + 1;
        
        return {
          ...prev,
          stack: newStack,
          currentNode: newStack[newStack.length - 1] || null,
          finishTimes: { ...prev.finishTimes, [currentNode]: newTime },
          time: newTime
        };
      }
    });

    setTimeout(() => {
      setTimedDfsAnimationState(prev => {
        if (prev.stack.length > 0 && !prev.isPaused) {
          runTimedDFSStep();
        } else if (prev.stack.length === 0) {
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
      time: 0
    });
  };

  return (
    <div className="graph-editor">
      <header className="graph-editor__header">
        <h1 className="graph-editor__title">Graph Editor</h1>
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
                onChange={(e) => setAnimationSpeed(parseInt(e.target.value))}
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
            width="1000"
            height="600"
            onClick={handleSvgClick}
          >
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="21"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="black"/>
              </marker>
            </defs>

            {edges.map((edge) => {
              const sourceNode = nodes.find((n) => n.uniqueId === edge.source);
              const targetNode = nodes.find((n) => n.uniqueId === edge.target);
              if (!sourceNode || !targetNode) return null;

              const [mx, my] = getMidpoint(
                sourceNode.x,
                sourceNode.y,
                targetNode.x,
                targetNode.y
              );

              return (
                <g key={edge.id} className="edge" onClick={(e) => handleEdgeClick(edge, e)}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={bfsAnimationState.visitedEdges.has(edge.id) ? "#90EE90" : "black"}
                    strokeWidth={bfsAnimationState.visitedEdges.has(edge.id) ? "3" : "2"}
                    style={{
                      markerEnd: isDirected ? 'url(#arrowhead)' : 'none',
                    }}
                  />
                  {isWeighted && (
                    <text
                      x={mx}
                      y={my}
                      dy="-5"
                      textAnchor="middle"
                      style={{ fontSize: '12px', fill: 'red' }}
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
                  } else if (!bfsAnimationState.isRunning && !dfsAnimationState.isRunning) {
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
              <h2>Adjacency Matrix</h2>
              {renderAdjacencyMatrix()}
            </div>

            <div className="adjacency-list">
              <h2>Adjacency List</h2>
              <pre>{getFormattedAdjacencyList()}</pre>
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
              <h3>Timed DFS Status</h3>
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
            <h3>Timed Depth-First Search</h3>
            <div className="algorithm-controls">
              <button 
                className="btn btn-primary"
                onClick={() => {
                  setMode('timed_dfs');
                  alert('Click a node to start Timed DFS');
                }}
                disabled={timedDfsAnimationState.isRunning}
              >
                Start Timed DFS
              </button>
              <button
                className="btn btn-secondary"
                onClick={togglePauseTimedDFS}
                disabled={!timedDfsAnimationState.isRunning}
              >
                {timedDfsAnimationState.isPaused ? 'Resume' : 'Pause'} Timed DFS
              </button>
              <button
                className="btn btn-secondary"
                onClick={resetTimedDFS}
                disabled={!timedDfsAnimationState.isRunning && !timedDfsAnimationState.visitedNodes.size}
              >
                Reset Timed DFS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
