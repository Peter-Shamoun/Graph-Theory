# Graph Theory Visualization Tool

An interactive web application for visualizing and experimenting with graph theory algorithms. Built with React and D3.js.

Live demo: [Graph Theory Visualization](https://peter-shamoun.github.io/Graph-Theory/)

## Features

### Graph Operations
- Create nodes by clicking on the canvas
- Add weighted/unweighted edges between nodes
- Delete nodes and edges
- Drag nodes to rearrange the graph
- Toggle between directed and undirected graphs
- Reset graph or delete all elements

### Implemented Algorithms

1. **Traversal Algorithms**
   - Breadth-First Search (BFS)
   - Depth-First Search (DFS)
   - Topological Sort (using DFS)

2. **Shortest Path Algorithms**
   - Dijkstra's Algorithm
   - Bellman-Ford Algorithm

3. **Minimum Spanning Tree Algorithms**
   - Prim's Algorithm
   - Kruskal's Algorithm


## Usage

### Basic Graph Creation
1. Click "Add Node" and click on the canvas to create nodes
2. Click "Add Edge" and select two nodes to connect them
3. When prompted, enter the weight for the edge (if in weighted mode)

### Running Algorithms
1. Select an algorithm from the right panel
2. Click the start button
3. For traversal algorithms, select a starting node
4. Use the pause/resume button to control the animation
5. Reset the algorithm to try different starting points

### Graph Settings
- Toggle "Weighted" to switch between weighted and unweighted graphs
- Toggle "Directed" to switch between directed and undirected graphs
- Use "Delete" mode to remove nodes or edges
- Click "Delete All" to clear the entire graph

## Technical Details

Built using:
- React 19.0.0
- D3.js 7.9.0
- CSS

## Limitation Notes

### Bellman-Ford Algorithm:
- Can only run on directed graphs

### Dijkstra's Algorithm:
- Can only run on directed graphs
- Cannot handle negative edge weights

### Topological Sort:
- Only works on directed graphs
- Graph must be a DAG (Directed Acyclic Graph)

### Prim's Algorithm:
- Only works on weighted graphs

### Kruskal's Algorithm:
- Only works on weighted graphs

### Graph Direction Type:
- Cannot switch between directed and undirected mode once nodes are present in the graph
- Must start with an empty graph to change direction type


## Development

```bash
npm install
npm start
```

To deploy:
```bash
npm run deploy
```