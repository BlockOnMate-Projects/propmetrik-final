"""
Email Service for Signature Request Notifications
Sends emails via SMTP (MailHog in development)
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
from config import settings


def send_signature_request_email(
    signer_email: str,
    signer_name: str,
    document_title: str,
    creator_name: str,
    signing_url: str,
    expires_at: str = None
) -> bool:
    """
    Send signature request email to a signer
    
    Args:
        signer_email: Email address of the signer
        signer_name: Full name of the signer
        document_title: Title of the document to sign
        creator_name: Name of person who created the request
        signing_url: URL for the signer to access and sign the document
        expires_at: Optional expiration date string
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        # Create message
        message = MIMEMultipart("alternative")
        message["From"] = f"Cedyn E-Signature <noreply@cedynhq.com>"
        message["To"] = signer_email
        message["Subject"] = f"Signature Request: {document_title}"
        
        # Create plain text version
        text_content = f"""
Hello {signer_name},

{creator_name} has requested your signature on the document: "{document_title}"

Please click the link below to review and sign the document:
{signing_url}

{f"This request expires on: {expires_at}" if expires_at else ""}

If you have any questions, please contact {creator_name}.

Thank you,
Cedyn E-Signature Platform
"""
        
        # Create HTML version
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .button {{ display: inline-block; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 20px; font-size: 12px; color: #666; }}
        .document-title {{ font-size: 18px; font-weight: bold; color: #667eea; margin: 15px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🖊️ Signature Request</h1>
        </div>
        <div class="content">
            <p>Hello <strong>{signer_name}</strong>,</p>
            
            <p><strong>{creator_name}</strong> has requested your signature on the following document:</p>
            
            <div class="document-title">📄 {document_title}</div>
            
            <p>Please review and sign the document by clicking the button below:</p>
            
            <center>
                <a href="{signing_url}" class="button">Review & Sign Document</a>
            </center>
            
            {f'<p style="color: #e74c3c;"><strong>⏰ Expires:</strong> {expires_at}</p>' if expires_at else ''}
            
            <p>If you have any questions about this document, please contact {creator_name}.</p>
            
            <p>Thank you for using Cedyn E-Signature Platform!</p>
        </div>
        <div class="footer">
            <p>This is an automated message from Cedyn E-Signature Platform</p>
            <p>© 2025 Cedyn Group. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
"""
        
        # Attach both versions
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        message.attach(part1)
        message.attach(part2)
        
        # Send email
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            
            server.send_message(message)
        
        print(f"✅ Signature request email sent to {signer_email}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send email to {signer_email}: {e}")
        return False


def send_signature_completed_email(
    creator_email: str,
    creator_name: str,
    document_title: str,
    signer_name: str,
    completed_count: int,
    total_count: int
) -> bool:
    """
    Notify document creator when a signer completes their signature
    
    Args:
        creator_email: Email of the request creator
        creator_name: Name of the creator
        document_title: Document title
        signer_name: Name of person who just signed
        completed_count: Number of signers who have completed
        total_count: Total number of signers
    
    Returns:
        bool: True if email sent successfully
    """
    try:
        is_fully_signed = completed_count == total_count
        subject = f"{'✅ All Signatures Completed' if is_fully_signed else '✍️ Signature Received'}: {document_title}"
        
        message = MIMEMultipart("alternative")
        message["From"] = f"Cedyn E-Signature <noreply@cedynhq.com>"
        message["To"] = creator_email
        message["Subject"] = subject
        
        text_content = f"""
Hello {creator_name},

{signer_name} has signed the document: "{document_title}"

Progress: {completed_count} of {total_count} signatures completed

{"🎉 All signatures have been collected! The document is now fully executed." if is_fully_signed else f"Waiting for {total_count - completed_count} more signature(s)."}

Thank you for using Cedyn E-Signature Platform!
"""
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: {"#27ae60" if is_fully_signed else "#3498db"}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .progress {{ background: #e0e0e0; height: 20px; border-radius: 10px; margin: 20px 0; }}
        .progress-bar {{ background: {"#27ae60" if is_fully_signed else "#3498db"}; height: 100%; border-radius: 10px; width: {(completed_count/total_count)*100}%; }}
        .footer {{ text-align: center; margin-top: 20px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{"🎉 All Signatures Completed!" if is_fully_signed else "✍️ Signature Received"}</h1>
        </div>
        <div class="content">
            <p>Hello <strong>{creator_name}</strong>,</p>
            
            <p><strong>{signer_name}</strong> has successfully signed:</p>
            <p style="font-size: 18px; font-weight: bold; color: #667eea;">📄 {document_title}</p>
            
            <p><strong>Progress:</strong></p>
            <div class="progress">
                <div class="progress-bar"></div>
            </div>
            <p style="text-align: center;"><strong>{completed_count} of {total_count}</strong> signatures completed</p>
            
            {f'<p style="color: #27ae60; font-size: 18px; text-align: center;">🎉 <strong>All signatures collected!</strong><br>The document is now fully executed.</p>' if is_fully_signed else f'<p>Waiting for <strong>{total_count - completed_count}</strong> more signature(s).</p>'}
            
            <p>Thank you for using Cedyn E-Signature Platform!</p>
        </div>
        <div class="footer">
            <p>© 2025 Cedyn Group. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
"""
        
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        message.attach(part1)
        message.attach(part2)
        
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            
            server.send_message(message)
        
        print(f"✅ Completion notification sent to {creator_email}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send completion email: {e}")
        return False
