import { FastifyInstance } from 'fastify';
import { API_VERSIONS } from '../../middleware/versioning';

export async function docsRoutes(fastify: FastifyInstance) {
  // API documentation root
  fastify.get('/docs', async (request, reply) => {
    return {
      name: 'Trading Exchange API Documentation',
      description: 'Comprehensive API documentation for the trading exchange platform',
      versions: API_VERSIONS,
      endpoints: {
        '/docs/versions': 'API version information and migration guides',
        '/docs/changelog': 'API changelog and breaking changes',
        '/docs/migration': 'Migration guides between versions',
        '/docs/compatibility': 'Backward compatibility information',
      },
      externalDocs: {
        openapi: '/docs/openapi.json',
        graphql: '/graphql',
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Version information
  fastify.get('/docs/versions', async (request, reply) => {
    const versions = Object.entries(API_VERSIONS).map(([key, info]) => ({
      version: key,
      ...info,
      status: info.deprecated ? 'deprecated' : 'active',
      ...(info.sunsetDate && { 
        daysUntilSunset: Math.ceil((info.sunsetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      }),
    }));

    return {
      versions,
      current: 'v1',
      latest: 'v1',
      deprecated: versions.filter(v => v.status === 'deprecated'),
      timestamp: new Date().toISOString(),
    };
  });

  // API changelog
  fastify.get('/docs/changelog', async (request, reply) => {
    return {
      changelog: [
        {
          version: 'v1.0.0',
          date: '2024-01-01',
          type: 'major',
          changes: [
            {
              type: 'added',
              description: 'Initial API release with authentication, trading, and market data endpoints',
            },
            {
              type: 'added',
              description: 'GraphQL API support',
            },
            {
              type: 'added',
              description: 'WebSocket real-time updates',
            },
          ],
        },
        {
          version: 'v0.9.0',
          date: '2023-12-01',
          type: 'minor',
          deprecated: true,
          changes: [
            {
              type: 'deprecated',
              description: 'Legacy API format - will be sunset on 2024-06-01',
            },
          ],
        },
      ],
      timestamp: new Date().toISOString(),
    };
  });

  // Migration guides
  fastify.get('/docs/migration', async (request, reply) => {
    return {
      migrations: [
        {
          from: 'v0',
          to: 'v1',
          title: 'Migrating from v0 to v1',
          description: 'Guide for upgrading from legacy API to current version',
          breakingChanges: [
            {
              change: 'Response format standardization',
              description: 'All responses now use consistent success/error format',
              before: '{ "items": [...], "created_at": "..." }',
              after: '{ "success": true, "data": [...], "timestamp": "..." }',
            },
            {
              change: 'Authentication header format',
              description: 'Bearer token format is now required',
              before: 'Authorization: token123',
              after: 'Authorization: Bearer token123',
            },
            {
              change: 'Error response format',
              description: 'Errors now include structured error codes',
              before: '{ "error": "Invalid request" }',
              after: '{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request" } }',
            },
          ],
          steps: [
            'Update authentication headers to use Bearer format',
            'Update response parsing to handle new success/error format',
            'Update error handling to use structured error codes',
            'Test all endpoints with new format',
            'Update API version in requests to v1',
          ],
        },
      ],
      timestamp: new Date().toISOString(),
    };
  });

  // Compatibility information
  fastify.get('/docs/compatibility', async (request, reply) => {
    return {
      compatibility: {
        description: 'Backward compatibility support and limitations',
        supportPolicy: 'We maintain backward compatibility for at least 6 months after deprecation',
        currentSupport: [
          {
            version: 'v1',
            status: 'fully-supported',
            description: 'Current stable version with full feature support',
          },
          {
            version: 'v0',
            status: 'deprecated',
            description: 'Legacy version with limited support until sunset date',
            limitations: [
              'No new features will be added',
              'Only critical security fixes will be applied',
              'Response transformation may have performance impact',
            ],
            sunsetDate: '2024-06-01',
          },
        ],
        transformations: {
          description: 'Automatic transformations applied for backward compatibility',
          v0: {
            request: [
              'created_at → timestamp',
              'Legacy field names are automatically mapped',
            ],
            response: [
              'timestamp → created_at',
              'data → items (for arrays)',
              'Structured errors are flattened',
            ],
          },
        },
        recommendations: [
          'Migrate to the latest API version as soon as possible',
          'Use API versioning headers or URL paths to specify version',
          'Monitor deprecation warnings in response headers',
          'Subscribe to API announcements for breaking changes',
        ],
      },
      timestamp: new Date().toISOString(),
    };
  });

  // OpenAPI specification
  fastify.get('/docs/openapi.json', async (request, reply) => {
    // This would typically be generated from your route definitions
    // For now, return a basic structure
    return {
      openapi: '3.0.0',
      info: {
        title: 'Trading Exchange API',
        version: '1.0.0',
        description: 'Modern TypeScript trading exchange platform API',
        contact: {
          name: 'API Support',
          email: 'api-support@tradingexchange.com',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: '/api/v1',
          description: 'Production API v1',
        },
      ],
      paths: {
        '/auth/login': {
          post: {
            summary: 'User login',
            tags: ['Authentication'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      email: { type: 'string', format: 'email' },
                      password: { type: 'string', minLength: 8 },
                    },
                    required: ['email', 'password'],
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Login successful',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'object',
                          properties: {
                            token: { type: 'string' },
                            user: { $ref: '#/components/schemas/User' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // Add more endpoints as needed
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
            },
          },
          Error: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      security: [
        { BearerAuth: [] },
        { ApiKeyAuth: [] },
      ],
    };
  });
}