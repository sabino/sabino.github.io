/** Optional operator-configured public-replica sink; never forwards the private room backup. */
export function createPearCheckpointPublisher({
  url = process.env.VERSO_PEAR_BRIDGE_URL,
  token = process.env.VERSO_PEAR_BRIDGE_TOKEN,
  onError = () => {},
} = {}) {
  if (!url) return async () => {};
  const endpoint = new URL('/api/checkpoints', url);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password)
    throw Error('Invalid Pear checkpoint bridge URL.');
  if (!token || typeof token !== 'string' || token.length < 32)
    throw Error('Pear checkpoint bridge needs an operator bearer token of at least32 characters.');
  return async (checkpoint) => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(checkpoint),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw Error(`Replica bridge returned HTTP ${response.status}.`);
    } catch (error) {
      // Local durability has already committed. A replica outage must not roll back its revision.
      onError(error);
    }
  };
}
