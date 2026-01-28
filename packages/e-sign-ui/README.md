# @propmetrik/e-sign-ui

Centralized E-Sign UI components for all PropMetrik applications.

## Overview

This package provides DocuSign-style signature capture components that can be used by:
- Main Dashboard (`frontend/`)
- Tenant Portal (`tenant-portal/`)
- Any other service requiring electronic signature functionality

## Installation

Add to your package.json:

```json
{
  "dependencies": {
    "@propmetrik/e-sign-ui": "file:../packages/e-sign-ui"
  }
}
```

## Usage

### SignatureCapture Component

The main signature modal with draw, type, and upload capabilities.

```tsx
import { SignatureCapture } from '@propmetrik/e-sign-ui';

function MySigningPage() {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleCapture = (data) => {
    console.log('Signature type:', data.type); // 'drawn' | 'typed' | 'uploaded'
    console.log('Signature image:', data.data); // Base64 PNG
  };
  
  return (
    <SignatureCapture
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onCapture={handleCapture}
      signerName="John Doe"
      theme="light" // 'light' for external portals, 'dark' for internal dashboard
    />
  );
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | - | Controls modal visibility |
| `onClose` | `() => void` | - | Called when modal is closed |
| `onCapture` | `(data: SignatureData) => void` | - | Called with signature data |
| `isInitials` | `boolean` | `false` | Show initials mode instead of signature |
| `signerName` | `string` | `''` | Pre-fill the typed signature field |
| `theme` | `'dark' \| 'light'` | `'light'` | Visual theme |

### SignatureCanvas Component

A standalone canvas for signature drawing.

```tsx
import { SignatureCanvas, SignatureCanvasHandle } from '@propmetrik/e-sign-ui';

function MyDrawingArea() {
  const canvasRef = useRef<SignatureCanvasHandle>(null);
  
  const handleSave = () => {
    const dataUrl = canvasRef.current?.toDataURL();
    if (dataUrl) {
      // Save signature...
    }
  };
  
  return (
    <>
      <SignatureCanvas ref={canvasRef} width={600} height={200} />
      <button onClick={() => canvasRef.current?.clear()}>Clear</button>
      <button onClick={handleSave}>Save</button>
    </>
  );
}
```

### Utilities

```tsx
import { 
  SIGNATURE_FONTS,
  loadSignatureFonts,
  generateTypedSignatureImage,
  formatSignatureDate 
} from '@propmetrik/e-sign-ui';

// Load all signature fonts from Google Fonts
await loadSignatureFonts();

// Generate a typed signature image
const imageData = generateTypedSignatureImage('John Doe', 'Dancing Script');

// Format date for display
const formatted = formatSignatureDate(new Date()); // "Jan 15, 2025, 2:30 PM"
```

## Available Fonts

The package includes 10 curated signature-style fonts:

1. **Dancing Script** - Elegant cursive
2. **Great Vibes** - Formal script
3. **Satisfy** - Smooth flow
4. **Pacifico** - Casual signature
5. **Sacramento** - Light script
6. **Allura** - Classic calligraphy
7. **Alex Brush** - Brush style
8. **Cookie** - Friendly script
9. **Qwigley** - Artistic flair
10. **Whisper** - Delicate hand

## Theme Variants

### Dark Theme (for internal dashboard)
- Black/zinc background
- Amber accent color
- Monospace fonts

### Light Theme (for external portals)
- White/slate background
- Blue accent color
- Standard fonts

## Dependencies

This package requires the following peer dependencies:
- `react` ^18.2.0
- `react-dom` ^18.2.0
- `tailwindcss` (for styling)
