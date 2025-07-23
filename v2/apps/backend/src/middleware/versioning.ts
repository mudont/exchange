import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export interface ApiVersion {
  version: string;
  deprecated?: boolean;
  deprecationDate?: Date;
  sunsetDate?: Date;
  supportedUntil?: Date;
}

export const API_VERSIONS: Record<string, ApiVersion> = {
  'v1': {
    version: '1.0.0',
    deprecated: false,
  },
  'v2': {
    version: '2.0.0',
    deprecated: false,
  },
  // Example of deprecated version
  'v0': {
    version: '0.9.0',
    deprecated: true,
    deprecationDate: new Date('2024-01-01'),
    sunsetDate: new Date('2024-06-01'),
    supportedUntil: new Date('2024-06-01'),
  },
};

export function extractApiVersion(request: FastifyRequest): string {
  // Check URL path first (/api/v1/...)
  const pathMatch = request.url.match(/^\/api\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  // Check Accept header (application/vnd.api+json;version=1)
  const acceptHeader = request.headers.accept;
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/version=(\d+)/);
    if (versionMatch) {
      return `v${versionMatch[1]}`;
    }
  }
  
  // Check custom header
  const versionHeader = request.headers['api-version'] as string;
  if (versionHeader) {
    return versionHeader.startsWith('v') ? versionHeader : `v${versionHeader}`;
  }
  
  // Default to v1
  return 'v1';
}

export async function versioningMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const requestedVersion = extractApiVersion(request);
  const versionInfo = API_VERSIONS[requestedVersion];
  
  if (!versionInfo) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'UNSUPPORTED_API_VERSION',
        message: `API version '${requestedVersion}' is not supported`,
        supportedVersions: Object.keys(API_VERSIONS),
      },
    });
  }
  
  // Add version info to request
  (request as any).apiVersion = requestedVersion;
  (request as any).versionInfo = versionInfo;
  
  // Add version headers to response
  reply.header('API-Version', versionInfo.version);
  reply.header('API-Supported-Versions', Object.keys(API_VERSIONS).join(', '));
  
  // Handle deprecated versions
  if (versionInfo.deprecated) {
    const deprecationWarning = `API version ${requestedVersion} is deprecated`;
    let warningMessage = deprecationWarning;
    
    if (versionInfo.sunsetDate) {
      warningMessage += `. It will be sunset on ${versionInfo.sunsetDate.toISOString().split('T')[0]}`;
    }
    
    reply.header('Deprecation', 'true');
    reply.header('Sunset', versionInfo.sunsetDate?.toISOString() || '');
    reply.header('Warning', `299 - "${warningMessage}"`);
    
    // Log deprecated API usage
    logger.warn('Deprecated API version used', {
      version: requestedVersion,
      path: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
  }
  
  // Check if version is past sunset date
  if (versionInfo.sunsetDate && new Date() > versionInfo.sunsetDate) {
    return reply.status(410).send({
      success: false,
      error: {
        code: 'API_VERSION_SUNSET',
        message: `API version '${requestedVersion}' has been sunset and is no longer available`,
        sunsetDate: versionInfo.sunsetDate.toISOString(),
        supportedVersions: Object.keys(API_VERSIONS).filter(v => !API_VERSIONS[v].deprecated),
      },
    });
  }
}

// Response transformation for backward compatibility
export function transformResponse(data: any, version: string): any {
  switch (version) {
    case 'v0':
      return transformToV0(data);
    case 'v1':
      return data; // Current format
    case 'v2':
      return transformToV2(data);
    default:
      return data;
  }
}

// Transform response to v0 format (example)
function transformToV0(data: any): any {
  if (data.timestamp) {
    // v0 used 'created_at' instead of 'timestamp'
    data.created_at = data.timestamp;
    delete data.timestamp;
  }
  
  if (data.data && Array.isArray(data.data)) {
    // v0 used 'items' instead of 'data' for arrays
    data.items = data.data;
    delete data.data;
  }
  
  return data;
}

// Transform response to v2 format (example)
function transformToV2(data: any): any {
  // v2 might have additional metadata
  if (data.success !== undefined) {
    return {
      meta: {
        success: data.success,
        timestamp: data.timestamp,
        version: '2.0.0',
      },
      data: data.data,
      ...(data.error && { error: data.error }),
    };
  }
  
  return data;
}

// Request transformation for backward compatibility
export function transformRequest(body: any, version: string): any {
  switch (version) {
    case 'v0':
      return transformFromV0(body);
    case 'v1':
      return body; // Current format
    case 'v2':
      return transformFromV2(body);
    default:
      return body;
  }
}

function transformFromV0(body: any): any {
  // Transform v0 request format to current format
  if (body.created_at) {
    body.timestamp = body.created_at;
    delete body.created_at;
  }
  
  return body;
}

function transformFromV2(body: any): any {
  // Transform v2 request format to current format
  return body;
}

// Middleware to apply transformations
export async function transformationMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const version = (request as any).apiVersion || 'v1';
  
  // Transform request body if needed
  if (request.body) {
    request.body = transformRequest(request.body, version);
  }
  
  // Hook into response to transform it
  reply.addHook('onSend', async (request, reply, payload) => {
    if (typeof payload === 'string') {
      try {
        const data = JSON.parse(payload);
        const transformed = transformResponse(data, version);
        return JSON.stringify(transformed);
      } catch {
        return payload;
      }
    }
    return payload;
  });
}