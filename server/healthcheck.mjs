try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 4175}/health`, {
    signal: AbortSignal.timeout(4000),
  });
  const status = await response.json();
  process.exit(response.ok && status.ok && status.durable && status.storageHealthy ? 0 : 1);
} catch {
  process.exit(1);
}
