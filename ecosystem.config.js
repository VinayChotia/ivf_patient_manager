module.exports = {
  apps: [
    {
      name: 'ivf-api',
      script: './dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      max_memory_restart: '512M'
    }
  ],
  deploy: {
    production: {
      user: 'deploy',
      host: 'your_vps_ip',
      ref: 'origin/main',
      repo: 'your_repo_url',
      path: '/var/www/ivf-api',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};
