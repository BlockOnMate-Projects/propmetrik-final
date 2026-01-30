"""
Certificate of Completion + Security Hash utilities
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
from typing import List, Dict, Any, Tuple

from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
import qrcode


def _decode_signature_data(data_url: str) -> bytes:
    """Decode base64 image data URL to bytes."""
    if not data_url:
        return b""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)


def _resolve_box(page_width: float, page_height: float, x: float, y: float, width: float, height: float) -> Tuple[float, float, float, float]:
    """Resolve coordinates: treat values <=1 as percentage of page size."""
    if 0 <= x <= 1 and 0 <= y <= 1:
        x = x * page_width
        y = y * page_height
    if 0 < width <= 1:
        width = width * page_width
    if 0 < height <= 1:
        height = height * page_height
    return x, y, width, height


def embed_signatures_into_pdf(pdf_bytes: bytes, signature_events: List[Dict[str, Any]]) -> bytes:
    """Overlay signatures onto PDF pages using signature events."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()

    # Group events by page
    events_by_page: Dict[int, List[Dict[str, Any]]] = {}
    for event in signature_events:
        events_by_page.setdefault(event["page"], []).append(event)

    for page_index, page in enumerate(reader.pages):
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)

        overlay_stream = io.BytesIO()
        c = canvas.Canvas(overlay_stream, pagesize=(page_width, page_height))

        for event in events_by_page.get(page_index + 1, []):
            image_bytes = _decode_signature_data(event.get("signature_data", ""))
            if not image_bytes:
                continue
            image = ImageReader(io.BytesIO(image_bytes))
            x, y, w, h = _resolve_box(page_width, page_height, event["x"], event["y"], event["width"], event["height"])
            c.drawImage(image, x, y, width=w, height=h, mask='auto')

        c.save()
        overlay_stream.seek(0)
        overlay_pdf = PdfReader(overlay_stream)
        page.merge_page(overlay_pdf.pages[0])
        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def generate_certificate_pdf(
    document_id: str,
    document_title: str,
    completion_timestamp_utc: str,
    signers: List[Dict[str, Any]],
    security_hash: str,
    verify_url: str = "https://propmetrik.com",
    page_size=letter,
) -> bytes:
    """Generate a Certificate of Completion PDF with QR code."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=page_size)
    width, height = page_size

    # Title
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2, height - 60, "Certificate of Completion")
    
    # Horizontal line under title
    c.setStrokeColorRGB(0.2, 0.2, 0.2)
    c.setLineWidth(1)
    c.line(50, height - 75, width - 50, height - 75)

    # Document info section
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, height - 105, "Document Information")
    c.setFont("Helvetica", 10)
    c.drawString(60, height - 125, f"Document ID: {document_id}")
    c.drawString(60, height - 140, f"Document Title: {document_title}")
    c.drawString(60, height - 155, f"Completion Timestamp (UTC): {completion_timestamp_utc}")

    # Signers section
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, height - 185, "Signers")
    c.setFont("Helvetica", 10)

    y = height - 205
    for signer in signers:
        # Highlight the PMT ID
        c.setFillColorRGB(0.9, 0.95, 1.0)  # Light blue background
        c.rect(55, y - 3, 250, 14, fill=True, stroke=False)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(60, y, f"Permanent Signer ID: {signer['signer_id']}")
        c.setFont("Helvetica", 10)
        y -= 16
        c.drawString(60, y, f"Signed At (UTC): {signer['signed_at']}")
        y -= 22

    # Security Hash section
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y - 10, "Document Security Hash")
    c.setFont("Courier", 9)  # Monospace for hash
    c.drawString(60, y - 28, security_hash)
    c.setFont("Helvetica", 10)
    c.drawString(60, y - 44, "Hash Algorithm: SHA-256")

    # QR Code section - positioned higher and more prominently
    qr_y = y - 170  # Position QR code below hash section
    if qr_y < 100:
        qr_y = 100  # Minimum position from bottom
    
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2
        )
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_buffer = io.BytesIO()
        qr_img.save(qr_buffer, format="PNG")
        qr_buffer.seek(0)

        # Draw QR code with label
        c.setFont("Helvetica-Bold", 10)
        c.drawString(50, qr_y + 95, "Verify Document")
        c.setFont("Helvetica", 9)
        c.drawString(50, qr_y + 82, "Scan to verify at PropMetrik")
        c.drawImage(ImageReader(qr_buffer), 50, qr_y, width=75, height=75)
        c.setFont("Helvetica", 8)
        c.drawString(50, qr_y - 12, verify_url)
    except Exception as qr_error:
        print(f"QR code generation error: {qr_error}")
        c.setFont("Helvetica", 9)
        c.drawString(50, qr_y, f"Verify at: {verify_url}")

    # Footer
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(width / 2, 30, "This certificate was generated by PropMetrik E-Signature Platform")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()


def compute_security_hash(
    pdf_bytes: bytes,
    document_id: str,
    signature_events: List[Dict[str, Any]],
    completion_timestamp_utc: str,
) -> str:
    """Compute SHA-256 hash over canonical payload."""
    canonical_events = sorted(
        [
            {
                "page": e["page"],
                "x": e["x"],
                "y": e["y"],
                "width": e["width"],
                "height": e["height"],
                "signed_at": e["signed_at"],
                "signer_id": e["signer_id"],
            }
            for e in signature_events
        ],
        key=lambda e: (e["signed_at"], e["signer_id"])
    )

    payload = {
        "document_id": document_id,
        "signature_events": canonical_events,
        "completion_timestamp_utc": completion_timestamp_utc,
    }

    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    hasher = hashlib.sha256()
    hasher.update(pdf_bytes)
    hasher.update(canonical_json)
    return hasher.hexdigest()


def append_certificate_to_pdf(signed_pdf_bytes: bytes, certificate_bytes: bytes) -> bytes:
    reader = PdfReader(io.BytesIO(signed_pdf_bytes))
    cert_reader = PdfReader(io.BytesIO(certificate_bytes))
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)
    for page in cert_reader.pages:
        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def persist_pdf(path: str, pdf_bytes: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(pdf_bytes)
