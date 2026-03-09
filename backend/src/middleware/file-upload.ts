/**
 * File Upload Middleware
 * Multer configuration for handling file uploads with validation
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { logger } from '../utils/logger';

// Re-export virus scan middleware for convenience
export { scanUploadedFile, scanUploadedFiles } from './virusScan';

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // CSV
  'text/csv',
  'application/csv',
  'text/plain',
  // Excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  // PDF
  'application/pdf',
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.ods', '.pdf'];

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Storage configuration
 */
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedBasename}${ext}`);
  },
});

/**
 * File filter for validation
 */
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    logger.warn('File upload rejected: invalid MIME type', {
      mimetype: file.mimetype,
      filename: file.originalname,
    });
    return cb(
      new Error(
        `Invalid file type. Allowed types: CSV, Excel (.xlsx, .xls), PDF`
      )
    );
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    logger.warn('File upload rejected: invalid extension', {
      extension: ext,
      filename: file.originalname,
    });
    return cb(
      new Error(
        `Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`
      )
    );
  }

  cb(null, true);
};

/**
 * Multer upload middleware
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Single file upload
  },
});

/**
 * Error handler for multer errors
 */
export const handleMulterError = (err: any, req: Request, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        message: `Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Only one file can be uploaded at a time',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected field',
        message: 'File must be uploaded in the "file" field',
      });
    }
  }

  if (err.message) {
    return res.status(400).json({
      success: false,
      error: 'File upload failed',
      message: err.message,
    });
  }

  next(err);
};

/**
 * Clean up uploaded file
 */
export const cleanupFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('Cleaned up uploaded file', { filePath });
    }
  } catch (error) {
    logger.error('Failed to cleanup file', { filePath, error });
  }
};

/**
 * Clean up old temp files (older than 24 hours)
 */
export const cleanupOldFiles = (): void => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    files.forEach((file) => {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        logger.info('Cleaned up old temp file', { file, age: Math.round(age / 1000 / 60) + ' minutes' });
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup old files', { error });
  }
};

// Schedule cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);
