/**
 * Production Deployment Configuration
 * HIPAA-compliant deployment settings and validation
 */

// Security headers configuration for HIPAA compliance
export const securityHeaders = {
  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  },
  
  // Prevent MIME type sniffing
  contentTypeOptions: 'nosniff',
  
  // Prevent clickjacking
  frameOptions: 'DENY',
  
  // XSS Protection
  xssProtection: '1; mode=block',
  
  // Referrer Policy
  referrerPolicy: 'strict-origin-when-cross-origin',
  
  // Permissions Policy
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: []
  },
  
  // Content Security Policy
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://*.openai.azure.com', 'https://*.supabase.co'],
    frameAncestors: ["'none'"]
  }
};

// HIPAA compliance requirements
export const hipaaRequirements = {
  // Access Control
  accessControl: {
    mfaRequired: true,
    sessionTimeout: 1800000, // 30 minutes
    maxLoginAttempts: 5,
    passwordMinLength: 12,
    passwordComplexity: true
  },
  
  // Audit Logging
  auditLogging: {
    enabled: true,
    retention: 2190, // 6 years in days
    events: [
      'user.login',
      'user.logout',
      'user.session_expired',
      'phi.access',
      'phi.disclosure',
      'document.view',
      'document.download',
      'document.upload',
      'document.delete',
      'chat.query',
      'chat.response',
      'admin.action',
      'security.event',
      'emergency.access'
    ]
  },
  
  // Data Protection
  dataProtection: {
    encryptionAtRest: true,
    encryptionInTransit: true,
    dataRetention: 2190, // 6 years
    backupRetention: 2555, // 7 years
    backupFrequency: 'daily'
  },
  
  // Transmission Security
  transmissionSecurity: {
    tlsMinVersion: '1.3',
    tlsCipherSuites: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256'
    ],
    hstsEnabled: true,
    hstsMaxAge: 31536000
  }
};

// Production environment validation
export const productionEnvVars = {
  required: [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'ENCRYPTION_KEY'
  ],
  
  optional: [
    'VERCEL_ORG_ID',
    'VERCEL_PROJECT_ID',
    'SENTRY_DSN',
    'DATADOG_API_KEY'
  ],
  
  secrets: [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'ENCRYPTION_KEY'
  ]
};

// Rate limiting configuration for production
export const rateLimitConfig = {
  organization: {
    requestsPerMinute: 1000,
    requestsPerHour: 10000
  },
  user: {
    requestsPerMinute: 60,
    requestsPerHour: 500
  },
  session: {
    concurrentRequests: 10
  },
  api: {
    requestsPerMinute: 120,
    burstLimit: 20
  }
};

// Deployment regions for HIPAA compliance
export const deploymentRegions = {
  primary: 'iad1', // Washington, DC - US East
  secondary: 'sfo1', // San Francisco - US West
  disasterRecovery: 'ord1' // Chicago - US Central
};

// Production deployment configuration
export const deploymentConfig = {
  environment: 'production',
  
  regions: ['iad1', 'sfo1'],
  
  concurrency: 50,
  
  timeout: 30, // seconds
  
  memory: 1024, // MB
  
  maxInstances: 100,
  
  minInstances: 2,
  
  preconditions: {
    databaseMigrated: true,
    secretsConfigured: true,
    sslEnabled: true,
    wafEnabled: true,
    auditLoggingEnabled: true
  }
};

// Export functions for runtime validation
export function verifyProductionConfig() {
  const missing = productionEnvVars.required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    return {
      valid: false,
      errors: [`Missing required environment variables: ${missing.join(', ')}`]
    };
  }
  
  return {
    valid: true,
    errors: [],
    timestamp: new Date().toISOString()
  };
}

export function getSecurityHeaders() {
  return {
    'Strict-Transport-Security': `max-age=${securityHeaders.hsts.maxAge}; includeSubDomains${securityHeaders.hsts.preload ? '; preload' : ''}`,
    'X-Content-Type-Options': securityHeaders.contentTypeOptions,
    'X-Frame-Options': securityHeaders.frameOptions,
    'X-XSS-Protection': securityHeaders.xssProtection,
    'Referrer-Policy': securityHeaders.referrerPolicy,
    'Permissions-Policy': Object.entries(securityHeaders.permissionsPolicy)
      .map(([key, values]) => `${key}=(${values.join(', ')})`)
      .join('; ')
  };
}

export function isHIPAACompliant() {
  const configStatus = verifyProductionConfig();
  
  if (!configStatus.valid) {
    return {
      compliant: false,
      reason: 'Missing required environment variables',
      details: configStatus.errors
    };
  }
  
  // Check if essential HIPAA features are enabled
  const checks = {
    hstsEnabled: securityHeaders.hsts.enabled,
    auditLoggingEnabled: hipaaRequirements.auditLogging.enabled,
    encryptionEnabled: hipaaRequirements.dataProtection.encryptionAtRest,
    mfaRequired: hipaaRequirements.accessControl.mfaRequired
  };
  
  const allCompliant = Object.values(checks).every(v => v);
  
  return {
    compliant: allCompliant,
    checks,
    timestamp: new Date().toISOString()
  };
}

export default {
  securityHeaders,
  hipaaRequirements,
  productionEnvVars,
  rateLimitConfig,
  deploymentRegions,
  deploymentConfig,
  verifyProductionConfig,
  getSecurityHeaders,
  isHIPAACompliant
};
