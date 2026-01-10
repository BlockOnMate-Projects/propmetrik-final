// Enhanced Floor Plan Builder with AutoCAD-style functionality
// Key improvements needed for professional CAD experience

## IMMEDIATE FIXES NEEDED:

### 1. ADD DEDICATED DRAWING MODES
- Rectangle Tool: Click-and-drag to create rectangles
- Circle Tool: Center-radius or diameter drawing
- Line Tool: Point-to-point straight lines  
- Polygon Tool: Current multi-point system (improved)
- Freehand Tool: For irregular shapes

### 2. IMPLEMENT AUTOCAD-STYLE DRAWING PATTERNS

**Rectangle Drawing (like AutoCAD):**
```typescript
// Mouse down: Set start corner
// Mouse move: Show preview rectangle  
// Mouse up: Complete rectangle
// ESC key: Cancel current operation

const handleRectangleStart = (point: Point) => {
  setDrawingMode('rectangle');
  setStartPoint(point);
  setIsDrawing(true);
};

const handleRectangleMove = (currentPoint: Point) => {
  // Show live preview rectangle
  updatePreviewRectangle(startPoint, currentPoint);
};

const handleRectangleComplete = (endPoint: Point) => {
  // Create final rectangle
  createRectangleRoom(startPoint, endPoint);
  resetDrawingState();
};
```

### 3. PROFESSIONAL CAD FEATURES TO ADD

**Object Snapping (like AutoCAD):**
- Endpoint snap: Snap to corners of existing shapes
- Midpoint snap: Snap to middle of lines  
- Center snap: Snap to centers of circles/rectangles
- Grid snap: Current implementation (good)
- Intersection snap: Snap to line intersections

**Precision Input:**
- Coordinate input field (X,Y entry)
- Distance/angle input for precise drawing
- Dimension constraints (width/height input)

**Professional Tools:**
- Copy/paste objects
- Mirror objects
- Rotate objects  
- Array/pattern duplication
- Layers for organization
- Object properties panel

### 4. IMPROVED USER EXPERIENCE

**Tool Palette (like AutoCAD):**
- Clear visual tool selection
- Tool-specific cursors
- Keyboard shortcuts (R for rectangle, C for circle, L for line)
- Right-click context menus

**Status Bar:**
- Current coordinates display
- Active tool indicator  
- Drawing instructions/prompts
- Measurement feedback

**Command Line Interface:**
- Type commands like "RECTANGLE", "CIRCLE"
- Numeric input for precise dimensions
- Command history

### 5. ENHANCED VISUAL FEEDBACK

**Professional Drawing Aids:**
- Crosshair cursor
- Object highlighting on hover
- Selection handles (existing)  
- Dimension lines with measurements
- Angle indicators
- Real-time coordinate display

## IMPLEMENTATION PRIORITY:

1. **HIGH PRIORITY - Fix Rectangle Drawing:**
   - Add dedicated rectangle tool
   - Implement click-and-drag rectangle creation
   - Add preview during drawing

2. **MEDIUM PRIORITY - Professional Tools:**
   - Object snapping system
   - Keyboard shortcuts  
   - Precision input fields

3. **LOW PRIORITY - Advanced Features:**
   - Layers and organization
   - Command line interface
   - Complex transformations

## CODE STRUCTURE IMPROVEMENTS:

```typescript
// Tool-based architecture instead of single draw mode
type DrawingTool = 'select' | 'rectangle' | 'circle' | 'line' | 'polygon' | 'freehand';

// Enhanced state management
interface DrawingState {
  currentTool: DrawingTool;
  isDrawing: boolean;
  startPoint?: Point;
  previewObject?: fabric.Object;
  snapMode: 'grid' | 'object' | 'none';
}

// Tool-specific handlers
const tools = {
  rectangle: new RectangleTool(),
  circle: new CircleTool(), 
  line: new LineTool(),
  polygon: new PolygonTool()
};
```

This professional approach will make your floor plan builder competitive with industry-standard CAD software.