import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deploymentPlan,
  appUpdate,
  deployWorldNode,
  summarizeApp,
} from '../scripts/deploy-world-node.mjs';

const plan = deploymentPlan({ image: 'verso-world:aa36cee' });
const existing = () => ({
  appName: 'verso-world',
  hasPersistentData: true,
  hasDefaultSubDomainSsl: false,
  envVars: [{ key: 'VERSO_PEAR_BRIDGE_TOKEN', value: 'private-test-secret' }],
  volumes: [],
  ports: [],
  isAppBuilding: false,
  instanceCount: 1,
});

test('deployment plan wraps a loaded image without requesting a registry pull and bounds memory', () => {
  assert.deepEqual(plan.captainDefinition, {
    schemaVersion: 2,
    dockerfileLines: ['FROM verso-world:aa36cee'],
  });
  assert.throws(() => deploymentPlan({ image: 'verso-world:latest\nRUN echo unsafe' }));
  assert.throws(() =>
    deploymentPlan({ image: 'verso-world:a', captainUrl: 'http://captain.host.sabino.pro' }),
  );
  assert.throws(() => deploymentPlan({ image: 'verso-world:a', memoryMiB: 512, heapMiB: 512 }));
  assert.throws(() =>
    deploymentPlan({ image: 'verso-world:a', hostPath: '/captain/data/other-app' }),
  );
  assert.throws(() =>
    deploymentPlan({ image: 'verso-world:a', hostPath: '/captain/data/verso-world-other' }),
  );
});

test('app update preserves private configuration but never replaces a different /data mount', () => {
  const config = appUpdate(existing(), plan);
  assert.equal(config.containerHttpPort, 4175);
  assert.equal(config.forceSsl, false, 'HTTPS is forced only after certificate provisioning');
  assert.equal(
    config.envVars.find(({ key }: any) => key === 'VERSO_PEAR_BRIDGE_TOKEN').value,
    'private-test-secret',
  );
  assert.equal(
    config.envVars.find(({ key }: any) => key === 'NODE_OPTIONS').value,
    '--max-old-space-size=384',
  );
  assert.equal(
    JSON.parse(config.serviceUpdateOverride).TaskTemplate.ContainerSpec.StopGracePeriod,
    30_000_000_000,
  );
  assert.equal(
    JSON.parse(config.serviceUpdateOverride).TaskTemplate.Resources.Limits.MemoryBytes,
    512 * 1024 * 1024,
  );
  assert.equal(JSON.parse(config.serviceUpdateOverride).UpdateConfig.Order, 'stop-first');
  assert.deepEqual(config.ports, []);
  assert.throws(() => appUpdate({ ...existing(), appName: 'other-app' }, plan), /Refusing/);
  assert.throws(
    () =>
      appUpdate(
        { ...existing(), volumes: [{ containerPath: '/data', volumeName: 'existing-worlds' }] },
        plan,
      ),
    /refusing to replace/,
  );
  assert.equal(
    JSON.stringify(summarizeApp(config, 'host.sabino.pro')).includes('private-test-secret'),
    false,
  );
});

test('new app workflow creates persistence, configures, enables TLS, forces HTTPS and deploys through app API', async () => {
  let app: any;
  const calls: any[] = [];
  const api = async (method: string, path: string, body: any) => {
    calls.push({ method, path, body });
    if (method === 'GET')
      return { appDefinitions: app ? [app] : [], rootDomain: 'host.sabino.pro' };
    if (path.endsWith('/register')) app = existing();
    else if (path.endsWith('/update')) app = { ...app, ...body };
    else if (path.endsWith('/enablebasedomainssl')) app.hasDefaultSubDomainSsl = true;
    return undefined;
  };
  const result = await deployWorldNode(api, plan, { log: () => {} });
  const writes = calls.filter(({ method }) => method === 'POST');
  assert.deepEqual(
    writes.map(({ path }) => path),
    [
      '/user/apps/appDefinitions/register',
      '/user/apps/appDefinitions/update',
      '/user/apps/appDefinitions/enablebasedomainssl',
      '/user/apps/appDefinitions/update',
      '/user/apps/appData/verso-world?detached=1',
    ],
  );
  assert.equal(writes[0].body.hasPersistentData, true);
  assert.equal(writes[1].body.forceSsl, false);
  assert.equal(writes[3].body.forceSsl, true);
  assert.deepEqual(JSON.parse(writes[4].body.captainDefinitionContent), plan.captainDefinition);
  assert.equal(result.endpoint, 'wss://verso-world.host.sabino.pro/ws');
  assert.equal(result.https, true);
});

test('failed TLS setup never deploys or forces HTTPS and active builds are left alone', async () => {
  const app = existing();
  const writes: string[] = [];
  const api = async (method: string, path: string) => {
    if (method === 'GET') return { appDefinitions: [app], rootDomain: 'host.sabino.pro' };
    writes.push(path);
    if (path.endsWith('/enablebasedomainssl')) throw Error('Certificate unavailable');
  };
  await assert.rejects(deployWorldNode(api, plan, { log: () => {} }), /Certificate/);
  assert.equal(
    writes.some((path) => path.includes('/appData/')),
    false,
  );
  app.isAppBuilding = true;
  writes.length = 0;
  await assert.rejects(deployWorldNode(api, plan, { log: () => {} }), /in progress/);
  assert.equal(writes.length, 0);
});

test('deployment waiting receives the latest attempt baseline, including previous failed builds', async () => {
  let app: any = {
    ...existing(),
    hasDefaultSubDomainSsl: true,
    deployedVersion: 2,
    versions: [{ version: 2, deployedImageName: 'old:2' }, { version: 3 }],
  };
  let baseline: any;
  const api = async (method: string, path: string, body: any) => {
    if (method === 'GET') return { appDefinitions: [app], rootDomain: 'host.sabino.pro' };
    if (path.endsWith('/update')) app = { ...app, ...body };
  };
  await deployWorldNode(api, plan, {
    log: () => {},
    waitForBuild: async (value: any) => {
      baseline = value;
    },
  });
  assert.equal(baseline.baselineVersion, 3);
});
