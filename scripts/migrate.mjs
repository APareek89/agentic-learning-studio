// Retired migration entry: never rerun the historical schema over a restored database.
console.error("Legacy migration command retired. Apply reviewed migrations/20260930_data_ownership.sql only after the verified one-time restore. See docs/auth-and-launch.md. No database connection was made.");
process.exitCode = 1;
