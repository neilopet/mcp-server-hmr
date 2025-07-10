# Configuration Guide

> **Quick Links:** [← CLI Guide](cli.md) | [← README](../README.md) | [Examples →](examples.md) | [API →](api.md)

## Overview

mcpmon provides multiple configuration methods to customize behavior for your specific development workflow. While the [CLI documentation](cli.md) covers command-line options and basic environment variables, this guide focuses on advanced configuration concepts, file-based configuration, and multi-environment setups.

Configuration can be applied through multiple methods with a clear precedence order, allowing you to create flexible, maintainable setups that work across different environments and team workflows.

## Configuration Methods

mcpmon supports four primary configuration methods:

1. **Command-line options** - Immediate overrides for testing and one-off usage
2. **Environment variables** - Runtime configuration and CI/CD integration  
3. **Configuration files** - Project-specific persistent settings
4. **Programmatic API** - Library usage and advanced integration

## Environment Variables

> **Note**: For basic environment variables and CLI usage, see the [CLI Documentation](cli.md). This section covers advanced environment variable concepts.

### Environment-Specific Configuration

Configure different behaviors based on your environment:

```bash
# Development environment
NODE_ENV=development \
MCPMON_WATCH="src/,config/dev.json" \
MCPMON_DELAY=500 \
MCPMON_VERBOSE=true \
mcpmon node server.js

# Staging environment  
NODE_ENV=staging \
MCPMON_WATCH="src/,config/staging.json" \
MCPMON_LOG_FILE="/var/log/mcpmon/staging.log" \
MCPMON_EXTENSIONS_ENABLED="metrics" \
mcpmon node server.js

# Production environment
NODE_ENV=production \
MCPMON_WATCH="src/,config/production.json" \
MCPMON_LOG_FILE="/var/log/mcpmon/production.log" \
MCPMON_EXTENSIONS_DIR="/var/lib/mcpmon" \
MCPMON_EXTENSIONS_ENABLED="metrics,large-response-handler" \
mcpmon node server.js
```

### Advanced Environment Patterns

```bash
# Auto-detection with manual additions
MCPMON_WATCH="auto,custom-dir/,settings.yaml" mcpmon python server.py

# Mixed patterns with exclusions
MCPMON_WATCH="src/,config/" MCPMON_IGNORE="*.test.js,node_modules/" mcpmon node server.js

# High-performance production setup
MCPMON_LOG_FILE="/var/log/mcpmon/server.log" \
MCPMON_BUFFER_SIZE=4194304 \
MCPMON_MAX_RETRIES=5 \
MCPMON_GRACEFUL_SHUTDOWN=15000 \
MAX_MCP_OUTPUT_TOKENS=25000 \
mcpmon --enable-extension metrics \
       --enable-extension large-response-handler \
       node --max-old-space-size=4096 server.js
```

## watchTargets Array Configuration

The `watchTargets` array system provides flexible file monitoring beyond simple file paths. You can configure watch targets through multiple methods with support for patterns, exclusions, and advanced configurations.

### Environment Variable Usage

```bash
# Basic file and directory watching
MCPMON_WATCH="server.js,config.json,src/"

# Pattern-based watching
MCPMON_WATCH="*.py,requirements.txt,config/"

# Mixed patterns with exclusions
MCPMON_WATCH="src/,config/" MCPMON_IGNORE="*.test.js,node_modules/"

# Auto-detection with manual additions
MCPMON_WATCH="auto,custom-dir/,settings.yaml"
```

### Command-Line Override

```bash
# Override auto-detected watch targets
mcpmon --watch "src/,config/" node server.js
mcpmon -w "*.py,*.json" python server.py

# Combine with ignore patterns
mcpmon --watch "src/" --ignore "*.test.*,dist/" node server.js
```

### Programmatic Configuration

```typescript
import { createMCPProxy } from 'mcpmon';

const proxy = await createMCPProxy({
  command: 'node',
  args: ['server.js'],
  watchTargets: [
    'server.js',           // Direct file
    'config/',             // Directory
    '*.json',              // Pattern
    { pattern: 'src/**/*.ts', ignore: ['*.test.ts'] }  // Advanced pattern
  ]
});
```

## Configuration Files

mcpmon supports configuration files for persistent, project-specific settings. Configuration files enable complex setups, environment-specific overrides, and team collaboration.

### mcpmon.config.js

The primary configuration file format provides full JavaScript flexibility:

```javascript
// mcpmon.config.js
module.exports = {
  // Core configuration
  restartDelay: 1000,
  verbose: process.env.NODE_ENV === 'development',
  
  // Watch configuration
  watchTargets: [
    'src/',
    'config/',
    '*.json',
    { pattern: '**/*.py', ignore: ['**/__pycache__/**'] }
  ],
  
  // Extension configuration
  extensions: {
    enabled: ['large-response-handler', 'request-logger'],
    dataDir: './mcpmon-data',
    config: {
      threshold: 25000,
      logLevel: 'info'
    }
  },
  
  // Environment-specific overrides
  environments: {
    development: {
      verbose: true,
      restartDelay: 500
    },
    production: {
      logFile: '/var/log/mcpmon/server.log',
      extensions: {
        enabled: ['metrics', 'large-response-handler']
      }
    }
  }
};
```

#### Advanced mcpmon.config.js Examples

**Framework-specific configuration:**

```javascript
// mcpmon.config.js for Next.js project
module.exports = {
  watchTargets: [
    'pages/api/mcp/',
    'lib/mcp/',
    'next.config.js',
    'package.json'
  ],
  
  extensions: {
    enabled: ['large-response-handler'],
    config: {
      threshold: 30000, // Larger threshold for Next.js
      enableDuckDB: true
    }
  },
  
  environments: {
    development: {
      verbose: true,
      restartDelay: 200
    }
  }
};
```

**Multi-service configuration:**

```javascript
// mcpmon.config.js for microservices
module.exports = {
  watchTargets: [
    'services/',
    'shared/',
    'docker-compose.yml',
    'docker-compose.*.yml'
  ],
  
  restartDelay: 2000, // Longer delay for service coordination
  
  extensions: {
    enabled: ['metrics', 'request-logger'],
    dataDir: './shared-data',
    config: {
      logLevel: 'info',
      metricsPort: 9090
    }
  }
};
```

### package.json Configuration

Integrate mcpmon configuration directly into your project's package.json:

```json
{
  "name": "my-mcp-server",
  "mcpmon": {
    "watchTargets": ["src/", "config.json"],
    "restartDelay": 1000,
    "extensions": {
      "enabled": ["large-response-handler"],
      "config": {
        "threshold": 20000
      }
    }
  }
}
```

#### Enhanced package.json Examples

**Python project configuration:**

```json
{
  "name": "python-mcp-server",
  "mcpmon": {
    "watchTargets": [
      "app/",
      "requirements.txt",
      "pyproject.toml",
      "config/"
    ],
    "extensions": {
      "enabled": ["request-logger", "large-response-handler"],
      "dataDir": "./python-data",
      "config": {
        "threshold": 15000,
        "logLevel": "debug"
      }
    }
  }
}
```

**Monorepo configuration:**

```json
{
  "name": "mcp-monorepo",
  "mcpmon": {
    "watchTargets": [
      "packages/*/src/",
      "packages/*/config/",
      "shared/",
      "lerna.json",
      "package.json"
    ],
    "restartDelay": 1500,
    "extensions": {
      "enabled": ["metrics", "large-response-handler"],
      "config": {
        "threshold": 50000,
        "metricsPort": 9090
      }
    }
  }
}
```

### Environment-Specific Overrides

Configure different behaviors for development, staging, and production environments:

#### Development Environment Configuration

```javascript
// mcpmon.config.js
module.exports = {
  // Base configuration
  watchTargets: ['src/', 'config/'],
  restartDelay: 1000,
  
  environments: {
    development: {
      verbose: true,
      restartDelay: 500,
      extensions: {
        enabled: ['request-logger', 'large-response-handler'],
        config: {
          logLevel: 'debug',
          threshold: 10000  // Lower threshold for dev
        }
      }
    }
  }
};
```

#### Production Environment Configuration

```javascript
// mcpmon.config.js
module.exports = {
  // Base configuration
  watchTargets: ['src/', 'config/production.json'],
  
  environments: {
    production: {
      logFile: '/var/log/mcpmon/production.log',
      extensions: {
        enabled: ['metrics', 'large-response-handler'],
        dataDir: '/var/lib/mcpmon',
        config: {
          threshold: 100000,  // Higher threshold for production
          metricsPort: 9090,
          persistence: true
        }
      }
    }
  }
};
```

#### Multi-Environment Setup

```javascript
// mcpmon.config.js
module.exports = {
  // Base configuration applies to all environments
  watchTargets: ['src/'],
  restartDelay: 1000,
  
  environments: {
    development: {
      verbose: true,
      restartDelay: 500,
      watchTargets: ['src/', 'config/dev.json'],
      extensions: {
        enabled: ['request-logger'],
        config: { logLevel: 'debug' }
      }
    },
    
    staging: {
      logFile: './staging.log',
      watchTargets: ['src/', 'config/staging.json'],
      extensions: {
        enabled: ['metrics', 'request-logger'],
        config: { 
          threshold: 40000,
          logLevel: 'info'
        }
      }
    },
    
    production: {
      logFile: '/var/log/mcpmon/server.log',
      watchTargets: ['src/', 'config/production.json'],
      extensions: {
        enabled: ['metrics', 'large-response-handler'],
        dataDir: '/var/lib/mcpmon',
        config: {
          threshold: 100000,
          metricsPort: 9090,
          alerting: {
            webhookUrl: 'https://alerts.company.com/webhook'
          }
        }
      }
    }
  }
};
```

## Configuration Precedence

mcpmon follows a clear configuration precedence order (highest to lowest priority):

1. **Command-line arguments** - `--watch`, `--delay`, `--verbose`, etc.
2. **Environment variables** - `MCPMON_WATCH`, `MCPMON_DELAY`, etc.  
3. **Configuration files** - `mcpmon.config.js` or `package.json` mcpmon section
4. **Auto-detection** - Intelligent defaults based on project structure
5. **Built-in defaults** - Fallback values when no configuration is provided

### Precedence Examples

```bash
# Command-line overrides everything
MCPMON_WATCH="src/" mcpmon --watch "config/" node server.js
# Result: watches "config/" (command-line wins)

# Environment variables override config files
# mcpmon.config.js: watchTargets: ['src/']
MCPMON_WATCH="config/" mcpmon node server.js  
# Result: watches "config/" (environment variable wins)

# Config file overrides auto-detection
# mcpmon.config.js: watchTargets: ['custom/']
mcpmon node server.js
# Result: watches "custom/" (config file wins over auto-detected "server.js")
```

### Merging Behavior

Most configuration options use **override** behavior, but some use **merge** behavior:

**Override behavior** (last value wins):
- `restartDelay`
- `verbose` 
- `logFile`

**Merge behavior** (values combined):
- `watchTargets` (when using "auto" prefix)
- `extensions.config` (object properties merged)

```bash
# Merge example with watchTargets
# Config file: watchTargets: ['src/']  
MCPMON_WATCH="auto,config.json" mcpmon node server.js
# Result: watches ['src/', 'config.json', 'server.js'] (merged + auto-detected)
```

## Best Practices

### Project Configuration

1. **Use configuration files for persistent settings**:
   ```javascript
   // Commit mcpmon.config.js to version control
   module.exports = {
     watchTargets: ['src/', 'config/'],
     extensions: { enabled: ['large-response-handler'] }
   };
   ```

2. **Use environment variables for runtime overrides**:
   ```bash
   # Override for specific runs without changing config
   MCPMON_VERBOSE=true mcpmon node server.js
   ```

3. **Leverage environment-specific overrides**:
   ```javascript
   environments: {
     development: { verbose: true },
     production: { logFile: '/var/log/mcpmon.log' }
   }
   ```

### Team Collaboration

1. **Commit configuration files** to share team settings
2. **Document environment variables** in README or .env.example
3. **Use .env files** for local development overrides (not committed)
4. **Provide sensible defaults** that work for most team members

### Performance Optimization

1. **Tune restart delays** based on server startup time:
   ```javascript
   restartDelay: 2000  // For slow-starting servers
   ```

2. **Optimize watch targets** to avoid unnecessary monitoring:
   ```javascript
   watchTargets: [
     'src/',
     { pattern: '**/*.py', ignore: ['**/__pycache__/**', '**/.pytest_cache/**'] }
   ]
   ```

3. **Configure appropriate thresholds** for large response handling:
   ```javascript
   extensions: {
     config: {
       threshold: 50000  // Adjust based on typical response sizes
     }
   }
   ```

### Production Deployment

1. **Use absolute paths** for production logging:
   ```javascript
   environments: {
     production: {
       logFile: '/var/log/mcpmon/server.log',
       extensions: { dataDir: '/var/lib/mcpmon' }
     }
   }
   ```

2. **Enable appropriate extensions** for monitoring:
   ```javascript
   extensions: {
     enabled: ['metrics', 'large-response-handler'],
     config: { metricsPort: 9090 }
   }
   ```

3. **Configure proper timeouts** for production reliability:
   ```bash
   MCPMON_GRACEFUL_SHUTDOWN=15000
   MCPMON_MAX_RETRIES=5
   ```

For additional configuration details, see:
- [CLI Documentation](cli.md) - Command-line options and basic environment variables
- [API Documentation](api.md) - Programmatic configuration and library usage
- [Extension Development Guide](extension-development.md) - Extension configuration and development