export function compareAxiomRecord(record, launch) {
  if (!record || record.tokenAddress !== launch.mint) throw new Error('Axiom tokenAddress does not match this test mint.');
  const check = (expected, reported) => ({ expected, reported: typeof reported === 'string' ? reported : null, comparison: typeof reported !== 'string' ? 'unavailable' : reported === expected ? 'matches' : 'differs' });
  return {
    source: 'User-pasted Axiom response; this app has not authenticated or fetched it from Axiom.',
    mint: launch.mint,
    deployerAddress: check(launch.launcher, record.deployerAddress),
    protocolCreator: check(launch.creator, record.protocolDetails?.creator),
    originalPumpDeployer: check(launch.launcher, record.extra?.pumpDeployerAddress),
    note: 'This compares the new launch identities only. It does not establish Axiom developer-history counts, migration attribution, or private backend rules.'
  };
}
