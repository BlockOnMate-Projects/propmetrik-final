
import os
from PIL import Image, ImageDraw, ImageFont

# Define icon sizes
sizes = [72, 96, 128, 144, 152, 192, 384, 512]
icons_dir = "/Users/kobby/github/Cedyn Group/propmetrik/frontend/public/icons"

# Ensure directory exists
os.makedirs(icons_dir, exist_ok=True)

# Colors
bg_color = "#f59e0b" # Amber-500
text_color = "#000000"

for size in sizes:
    # Create image
    img = Image.new('RGB', (size, size), color=bg_color)
    d = ImageDraw.Draw(img)
    
    # Draw text (just the first letter 'P')
    # Use default font since we might not have a specific ttf handy
    # Ideally we'd center the text but default font is fixed size. 
    # For a placeholder, a simple colored square is often enough, 
    # but let's try to draw a circle or something.
    
    # Draw a circle
    margin = size // 10
    d.ellipse([margin, margin, size - margin, size - margin], outline=text_color, width=max(1, size // 20))
    
    # Save
    filename = f"icon-{size}x{size}.png"
    filepath = os.path.join(icons_dir, filename)
    img.save(filepath)
    print(f"Generated {filepath}")

# Also generate shortcuts
shortcuts = ["valuation", "deal", "calendar"]
for sc in shortcuts:
    img = Image.new('RGB', (96, 96), color="#1f2937") # Gray-800
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, 86, 86], outline="#f59e0b", width=3)
    
    filename = f"shortcut-{sc}.png"
    filepath = os.path.join(icons_dir, filename)
    img.save(filepath)
    print(f"Generated {filepath}")
