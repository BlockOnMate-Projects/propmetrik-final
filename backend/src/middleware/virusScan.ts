/**
 * File Virus Scanning Middleware
 *
 * Two-layer defence:
 *  1. Magic-byte verification – ensures the file extension matches its
 *     actual content type (prevents disguised executables).
 *  2. ClamAV daemon scan (optional) – when a ClamAV daemon is reachable
 *     at CLAMAV_HOST:CLAMAV_PORT (default 127.0.0.1:3310), every upload
 *     is streamed to the daemon for signature-based virus detection.
 *     If the daemon is unreachable the scan is skipped with a warning.
 *
 * Usage:
 *   import { scanUploadedFile } from '../middleware/virusScan';
 *   router.post('/upload', upload.single('file'), scanUploadedFile, handler);
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import net from 'net';
import { logger } from '../utils/logger';

// ── Configuration ───────────────────────────────────────────────────────────
const CLAMAV_HOST = process.env.CLAMAV_HOST || '127.0.0.1';
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT || '3310', 10);
const CLAMAV_TIMEOUT = parseInt(process.env.CLAMAV_TIMEOUT || '30000', 10); // 30s
const SKIP_SCAN_IN_DEV = process.env.NODE_ENV !== 'production'; // optional lenient mode

// ── Magic Byte Signatures ───────────────────────────────────────────────────
//
// Maps common extensions to expected magic-byte prefixes (hex).
// If the first N bytes don't match, the file is rejected as potentially
// disguised malware.
const MAGIC_BYTES: Record<string, Buffer[]> = {
  '.pdf':  [Buffer.from([0x25, 0x50, 0x44, 0x46])],                       // %PDF
  '.png':  [Buffer.from([0x89, 0x50, 0x4E, 0x47])],                       // .PNG
  '.jpg':  [Buffer.from([0xFF, 0xD8, 0xFF])],                              // JFIF / EXIF
  '.jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  '.gif':  [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  '.zip':  [Buffer.from([0x50, 0x4B, 0x03, 0x04])],                       // PK..
  '.xlsx': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],                       // OOXML (zip-based)
  '.docx': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
  '.pptx': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
  '.xls':  [Buffer.from([0xD0, 0xCF, 0x11, 0xE0])],                       // OLE2
  '.doc':  [Buffer.from([0xD0, 0xCF, 0x11, 0xE0])],
  '.csv':  [],                                                              // plain text — no fixed header
  '.txt':  [],
  '.svg':  [],
  '.webp': [Buffer.from('RIFF')],                                          // RIFF....WEBP
};

// Dangerous executable signatures to reject regardless of extension
const DANGEROUS_SIGNATURES: { name: string; sig: Buffer }[] = [
  { name: 'Windows EXE / DLL',   sig: Buffer.from([0x4D, 0x5A]) },        // MZ
  { name: 'ELF binary',          sig: Buffer.from([0x7F, 0x45, 0x4C, 0x46]) }, // .ELF
  { name: 'Java class',          sig: Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]) },
  { name: 'Mach-O binary',       sig: Buffer.from([0xFE, 0xED, 0xFA, 0xCE]) },
  { name: 'Mach-O 64-bit',       sig: Buffer.from([0xFE, 0xED, 0xFA, 0xCF]) },
  { name: 'Shell script',        sig: Buffer.from('#!') },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function readFileHead(filePath: string, bytes: number = 8): Buffer {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(bytes);
  fs.readSync(fd, buf, 0, bytes, 0);
  fs.closeSync(fd);
  return buf;
}

/**
 * Verify that the file's magic bytes match its declared extension.
 * Returns null if OK, or an error message string.
 */
function verifyMagicBytes(filePath: string, ext: string): string | null {
  const head = readFileHead(filePath, 16);

  // 1. Always reject dangerous executables
  for (const { name, sig } of DANGEROUS_SIGNATURES) {
    if (head.subarray(0, sig.length).equals(sig)) {
      return `File appears to be a ${name} — upload rejected`;
    }
  }

  // 2. Verify known extensions against expected signatures
  const expected = MAGIC_BYTES[ext.toLowerCase()];
  if (!expected || expected.length === 0) {
    // No specific magic bytes for this extension (e.g. .csv, .txt) → pass
    return null;
  }

  const matches = expected.some(sig =>
    head.subarray(0, sig.length).equals(sig),
  );

  if (!matches) {
    return `File content does not match extension ${ext} — possible disguised file`;
  }

  return null;
}

/**
 * Scan a file via ClamAV daemon using the INSTREAM protocol.
 * Returns: { clean: true } | { clean: false, virus: string } | { skipped: true, reason: string }
 */
async function clamavScan(
  filePath: string,
): Promise<{ clean: boolean; virus?: string; skipped?: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let response = '';

    socket.setTimeout(CLAMAV_TIMEOUT);

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ clean: true, skipped: true, reason: `ClamAV unreachable: ${err.message}` });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ clean: true, skipped: true, reason: 'ClamAV scan timed out' });
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('end', () => {
      // ClamAV INSTREAM response format: "stream: OK" or "stream: <virus> FOUND"
      const trimmed = response.trim();
      if (trimmed.endsWith('OK')) {
        resolve({ clean: true });
      } else {
        const virusMatch = trimmed.match(/stream:\s*(.+)\s+FOUND/);
        resolve({
          clean: false,
          virus: virusMatch ? virusMatch[1] : 'Unknown threat',
        });
      }
    });

    socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
      // Send INSTREAM command
      socket.write('zINSTREAM\0');

      // Stream the file in 2 KB chunks (ClamAV protocol)
      const fileStream = fs.createReadStream(filePath, { highWaterMark: 2048 });
      fileStream.on('data', (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const sizeHeader = Buffer.alloc(4);
        sizeHeader.writeUInt32BE(buf.length, 0);
        socket.write(sizeHeader);
        socket.write(buf);
      });

      fileStream.on('end', () => {
        // Zero-length chunk signals end of stream
        const endChunk = Buffer.alloc(4);
        endChunk.writeUInt32BE(0, 0);
        socket.write(endChunk);
      });

      fileStream.on('error', (err) => {
        socket.destroy();
        resolve({ clean: true, skipped: true, reason: `File read error: ${err.message}` });
      });
    });
  });
}

// ── Express Middleware ──────────────────────────────────────────────────────

/**
 * Middleware: scan an uploaded file for viruses / disguised executables.
 *
 * Place AFTER multer middleware so `req.file` is populated.
 * On failure the file is deleted and a 400/422 is returned.
 */
export async function scanUploadedFile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    // No file in this request — pass through
    return next();
  }

  const ext = require('path').extname(file.originalname).toLowerCase();

  // 1. Magic-byte verification (always runs)
  const magicError = verifyMagicBytes(file.path, ext);
  if (magicError) {
    logger.warn('File rejected by magic-byte check', {
      file: file.originalname,
      reason: magicError,
    });
    // Clean up the uploaded file
    try { fs.unlinkSync(file.path); } catch {}
    res.status(422).json({
      success: false,
      error: 'FILE_REJECTED',
      message: magicError,
    });
    return;
  }

  // 2. ClamAV scan (production — or when daemon is available)
  const scanResult = await clamavScan(file.path);

  if (scanResult.skipped) {
    // Daemon not available
    if (SKIP_SCAN_IN_DEV) {
      logger.debug('ClamAV scan skipped (dev mode)', { reason: scanResult.reason });
    } else {
      logger.warn('ClamAV scan skipped — daemon unavailable', {
        reason: scanResult.reason,
        file: file.originalname,
      });
    }
    return next();
  }

  if (!scanResult.clean) {
    logger.error('VIRUS DETECTED in uploaded file', {
      file: file.originalname,
      virus: scanResult.virus,
    });
    // Delete the infected file
    try { fs.unlinkSync(file.path); } catch {}
    res.status(422).json({
      success: false,
      error: 'VIRUS_DETECTED',
      message: `Uploaded file is infected: ${scanResult.virus}`,
    });
    return;
  }

  logger.info('File passed virus scan', { file: file.originalname });
  next();
}

/**
 * Middleware for scanning multiple uploaded files (req.files array).
 * Place AFTER multer's .array() or .fields() middleware.
 */
export async function scanUploadedFiles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return next();
  }

  const path = require('path');

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();

    const magicError = verifyMagicBytes(file.path, ext);
    if (magicError) {
      logger.warn('File rejected by magic-byte check', {
        file: file.originalname,
        reason: magicError,
      });
      // Clean up ALL files in the batch
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      res.status(422).json({
        success: false,
        error: 'FILE_REJECTED',
        message: `${file.originalname}: ${magicError}`,
      });
      return;
    }

    const scanResult = await clamavScan(file.path);
    if (!scanResult.clean && !scanResult.skipped) {
      logger.error('VIRUS DETECTED in uploaded file', {
        file: file.originalname,
        virus: scanResult.virus,
      });
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch {}
      }
      res.status(422).json({
        success: false,
        error: 'VIRUS_DETECTED',
        message: `${file.originalname} is infected: ${scanResult.virus}`,
      });
      return;
    }
  }

  next();
}
