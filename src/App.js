import React, { useState, useRef } from 'react';
import * as d3 from 'd3';
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

  // A ref to keep track of the next node id
  const nextNodeId = useRef(0);
  // Add a ref for unique edge IDs
  const nextEdgeId = useRef(0);

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
  const handleNodeClick = (nodeId, uniqueId) => {
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

  return (
    <div className="graph-editor">
      <header className="graph-editor__header">
        <h1 className="graph-editor__title">Graph Editor</h1>
      </header>

      <div className="graph-editor__controls">
        {/* Graph Type Selection */}
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

        {/* Toolbar */}
        <div className="button-group">
          <button className="btn btn-primary" onClick={setModeAddNode}>Add Node</button>
          <button className="btn btn-primary" onClick={setModeAddEdge}>Add Edge</button>
          <button className="btn btn-secondary" onClick={setModeDelete}>Delete</button>
          <button className="btn btn-secondary" onClick={setModeRenameEdge}>Change Edge Weight</button>
          <button className="btn btn-secondary" onClick={resetNodeCounter}>Reset Counter</button>
          <button className="btn btn-danger" onClick={deleteAll}>Delete All</button>
          <span style={{ marginLeft: '1rem', alignSelf: 'center' }}>
            Current Mode: <strong>{mode}</strong>
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        className="graph-canvas"
        width="1000"
        height="1000"
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
                stroke="black"
                strokeWidth="2"
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
              handleNodeClick(node.id, node.uniqueId);
            }}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={20}
              fill="lightblue"
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
    </div>
  );
}
