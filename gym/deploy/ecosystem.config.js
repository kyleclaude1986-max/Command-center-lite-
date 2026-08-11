// pm2 process definition. From the app directory:
//
//   pm2 start deploy/ecosystem.config.js
//   pm2 save
//   pm2 startup        # prints a command to run once, so pm2 survives a reboot
//
// One instance, deliberately. SQLite with better-sqlite3 is a single-writer
// file, and a second worker would fight the first for the write lock. This is
// one person's gym log; one process is more than enough.

module.exports = {
  apps: [
    {
      name: "gym",
      cwd: __dirname.replace(/\/deploy$/, ""),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3001",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      // The scheduler and the SQLite handle live in the process, so a restart
      // loop is worth noticing rather than papering over.
      min_uptime: "30s",
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
      error_file: "./logs/gym-error.log",
      out_file: "./logs/gym-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
