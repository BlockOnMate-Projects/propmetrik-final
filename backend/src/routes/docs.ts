/**
 * API Documentation Routes
 * 
 * Serves OpenAPI/Swagger documentation for the PROPMETRIK API
 */

import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openAPIDocument } from '../docs/pmOpenAPI';

const router = Router();

// Swagger UI options
const swaggerOptions: swaggerUi.SwaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { font-size: 2rem; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .scheme-container { padding: 15px 0; background: #fafafa; }
  `,
  customSiteTitle: 'PROPMETRIK API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
};

/**
 * @route GET /api/docs
 * @desc Swagger UI - Interactive API documentation
 */
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(openAPIDocument, swaggerOptions));

/**
 * @route GET /api/docs/json
 * @desc OpenAPI JSON specification
 */
router.get('/json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(openAPIDocument);
});

/**
 * @route GET /api/docs/yaml
 * @desc OpenAPI YAML specification
 */
router.get('/yaml', (_req: Request, res: Response) => {
  // Convert to YAML format
  const yaml = convertToYAML(openAPIDocument);
  res.setHeader('Content-Type', 'text/yaml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(yaml);
});

/**
 * Simple JSON to YAML converter for OpenAPI spec
 */
function convertToYAML(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return '[]';
    }
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        result += `\n${spaces}- ` + convertToYAML(item, indent + 1).trimStart();
      } else {
        result += `\n${spaces}- ${formatValue(item)}`;
      }
    }
    return result;
  }

  if (typeof obj === 'object' && obj !== null) {
    const entries = Object.entries(obj);
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      const needsQuotes = /[:\[\]{}|>*&!%#@`]/.test(key);
      const formattedKey = needsQuotes ? `"${key}"` : key;

      if (value === null || value === undefined) {
        result += `${indent === 0 && i > 0 ? '' : ''}${spaces}${formattedKey}: null\n`;
      } else if (typeof value === 'object') {
        const nested = convertToYAML(value, indent + 1);
        if (nested.startsWith('\n')) {
          result += `${spaces}${formattedKey}:${nested}\n`;
        } else {
          result += `${spaces}${formattedKey}: ${nested}\n`;
        }
      } else {
        result += `${spaces}${formattedKey}: ${formatValue(value)}\n`;
      }
    }
    return result.trimEnd();
  }

  return formatValue(obj);
}

function formatValue(value: any): string {
  if (typeof value === 'string') {
    // Multi-line strings
    if (value.includes('\n')) {
      return `|\n${value.split('\n').map(line => '    ' + line).join('\n')}`;
    }
    // Strings that need quoting
    if (/[:\[\]{}|>*&!%#@`"'\n]/.test(value) || value === '' || !isNaN(Number(value))) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

export default router;
