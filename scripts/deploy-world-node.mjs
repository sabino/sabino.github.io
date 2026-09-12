import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const APP = 'verso-world';
const OWNER_DESCRIPTION = 'Verso always-on multiplayer world authority';
const DEFAULT_NODE = 'vmb4ky49reg899ibcp5ce74yj';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function safeTransportCode(error) {
  const code = error?.cause?.code || error?.code;
  if (
    new Set([
      'UND_ERR_SOCKET',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'CERT_HAS_EXPIRED',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ]).has(code)
  )
    return code;
  return error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR';
}

export function deploymentPlan(options = {}) {
  const captain = new URL(options.captainUrl || 'https://captain.host.sabino.pro');
  if (
    captain.protocol !== 'https:' ||
    captain.username ||
    captain.password ||
    captain.pathname !== '/' ||
    captain.search ||
    captain.hash
  )
    throw Error('Captain URL must be a credential-free HTTPS origin.');
  const memoryMiB = Number(options.memoryMiB || 512);
  const heapMiB = Number(options.heapMiB || 384);
  if (
    ![512, 768, 1024].includes(memoryMiB) ||
    !Number.isInteger(heapMiB) ||
    heapMiB < 256 ||
    heapMiB > memoryMiB - 128
  )
    throw Error('Use 512/768/1024 MiB memory with a heap at least 128 MiB smaller.');
  const image = options.image || '';
  if (!/^[a-z0-9][a-z0-9._/-]*:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(image))
    throw Error(
      'Provide the exact tagged image already loaded into the CapRover host Docker daemon.',
    );
  const nodeId = options.nodeId || DEFAULT_NODE;
  if (!/^[a-z0-9]{25}$/.test(nodeId)) throw Error('Provide a valid Docker Swarm node ID.');
  const hostPath = options.hostPath;
  if (
    hostPath &&
    (!(
      hostPath === '/captain/data/verso-world' || hostPath.startsWith('/captain/data/verso-world/')
    ) ||
      hostPath.includes('..'))
  )
    throw Error('A host bind mount must live under /captain/data/verso-world.');
  return {
    captainUrl: captain.origin,
    appName: APP,
    nodeId,
    memoryMiB,
    heapMiB,
    image,
    volume: hostPath
      ? { containerPath: '/data', hostPath }
      : { containerPath: '/data', volumeName: 'verso-world-data' },
    captainDefinition: { schemaVersion: 2, dockerfileLines: [`FROM ${image}`] },
  };
}

export function appUpdate(existing, plan, forceSsl = !!existing.hasDefaultSubDomainSsl) {
  if (existing.appName !== APP || !existing.hasPersistentData)
    throw Error('Refusing to change an app other than the persistent verso-world app.');
  if (existing.httpAuth?.user)
    throw Error(
      'Existing verso-world HTTP authentication needs an operator review before deployment.',
    );
  const dataVolume = (existing.volumes || []).find((volume) => volume.containerPath === '/data');
  if (
    dataVolume &&
    (dataVolume.volumeName !== plan.volume.volumeName ||
      dataVolume.hostPath !== plan.volume.hostPath)
  )
    throw Error(
      'The existing /data mount differs from this plan; refusing to replace persisted worlds.',
    );
  const env = new Map((existing.envVars || []).map(({ key, value }) => [key, value]));
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production',
    PORT: '4175',
    HOST: '0.0.0.0',
    VERSO_PUBLIC_ORIGIN: 'https://sabino.pro',
    VERSO_WORLD_STORAGE: '/data/worlds',
    VERSO_PAYMENT_STORAGE: '/data/payments',
    VERSO_TRUST_PROXY_HOPS: '1',
    VERSO_PAYMENTS_ENABLED: 'false',
    NODE_OPTIONS: `--max-old-space-size=${plan.heapMiB}`,
  }))
    env.set(key, value);
  return {
    ...existing,
    appName: APP,
    description: OWNER_DESCRIPTION,
    instanceCount: 1,
    nodeId: plan.nodeId,
    captainDefinitionRelativeFilePath: './captain-definition',
    notExposeAsWebApp: false,
    containerHttpPort: 4175,
    forceSsl,
    websocketSupport: true,
    envVars: [...env].map(([key, value]) => ({ key, value })),
    volumes: [
      ...(existing.volumes || []).filter((volume) => volume.containerPath !== '/data'),
      plan.volume,
    ],
    ports: [],
    serviceUpdateOverride: JSON.stringify({
      TaskTemplate: {
        ContainerSpec: { StopGracePeriod: 30_000_000_000 },
        Resources: {
          Limits: { MemoryBytes: plan.memoryMiB * 1024 * 1024, NanoCPUs: 1_000_000_000 },
        },
        RestartPolicy: { Condition: 'any', Delay: 5_000_000_000, MaxAttempts: 0 },
      },
      UpdateConfig: { Order: 'stop-first', Parallelism: 1 },
      RollbackConfig: { Order: 'stop-first', Parallelism: 1 },
    }),
  };
}

export function summarizeApp(app, rootDomain) {
  if (!app) return { appName: APP, exists: false, rootDomain };
  return {
    appName: app.appName,
    exists: true,
    rootDomain,
    endpoint: `wss://${APP}.${rootDomain}/ws`,
    persistent: app.hasPersistentData,
    instanceCount: app.instanceCount,
    nodeId: app.nodeId,
    containerHttpPort: app.containerHttpPort,
    websocketSupport: app.websocketSupport,
    https: app.hasDefaultSubDomainSsl,
    forceSsl: app.forceSsl,
    volumes: app.volumes,
    publishedPorts: app.ports,
    isAppBuilding: app.isAppBuilding,
    deployedVersion: app.deployedVersion,
  };
}

export async function deployWorldNode(api, plan, { log = console.log, waitForBuild } = {}) {
  let definitions = await api('GET', '/user/apps/appDefinitions');
  let app = definitions.appDefinitions.find((candidate) => candidate.appName === APP);
  if (!app) {
    log('Creating the persistent verso-world app.');
    await api('POST', '/user/apps/appDefinitions/register', {
      appName: APP,
      hasPersistentData: true,
    });
    definitions = await api('GET', '/user/apps/appDefinitions');
    app = definitions.appDefinitions.find((candidate) => candidate.appName === APP);
    if (!app) throw Error('CapRover did not return the newly created app.');
  }
  if (app.isAppBuilding) throw Error('verso-world already has a build in progress.');
  log('Configuring one persistent instance, bounded memory and WebSocket proxying.');
  await api('POST', '/user/apps/appDefinitions/update', appUpdate(app, plan));
  if (!app.hasDefaultSubDomainSsl) {
    log('Requesting TLS for the app domain.');
    await api('POST', '/user/apps/appDefinitions/enablebasedomainssl', { appName: APP });
  }
  // Fetch again to preserve state CapRover assigned during TLS provisioning.
  definitions = await api('GET', '/user/apps/appDefinitions');
  app = definitions.appDefinitions.find((candidate) => candidate.appName === APP);
  if (!app?.hasDefaultSubDomainSsl)
    throw Error('The app certificate is not enabled; refusing an insecure deployment.');
  await api('POST', '/user/apps/appDefinitions/update', appUpdate(app, plan, true));
  const baselineVersion = Math.max(
    Number(app.deployedVersion) || 0,
    ...(app.versions || []).map(({ version }) => Number(version) || 0),
  );
  log('Deploying the preloaded image through the authenticated CapRover build API.');
  await api('POST', `/user/apps/appData/${APP}?detached=1`, {
    captainDefinitionContent: JSON.stringify(plan.captainDefinition),
  });
  if (waitForBuild) await waitForBuild({ baselineVersion });
  definitions = await api('GET', '/user/apps/appDefinitions');
  app = definitions.appDefinitions.find((candidate) => candidate.appName === APP);
  return summarizeApp(app, definitions.rootDomain);
}

async function readCredential() {
  if (process.env.CAPROVER_PASSWORD)
    return { password: process.env.CAPROVER_PASSWORD, otpToken: process.env.CAPROVER_OTP || '' };
  if (process.stdin.isTTY)
    throw Error(
      'Provide the administrator credential on stdin or CAPROVER_PASSWORD; never as a command argument.',
    );
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw Error('Credential input is too large.');
  }
  let credential;
  try {
    credential = input.trim().startsWith('{')
      ? JSON.parse(input)
      : { password: input.replace(/\r?\n$/, '') };
  } catch {
    throw Error('Credential input contains invalid JSON.');
  }
  if (typeof credential.password !== 'string' || !credential.password)
    throw Error('Missing administrator password.');
  return { password: credential.password, otpToken: credential.otpToken || '' };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'captain-url': { type: 'string' },
      image: { type: 'string' },
      'node-id': { type: 'string' },
      'memory-mib': { type: 'string' },
      'heap-mib': { type: 'string' },
      'host-path': { type: 'string' },
    },
  });
  const mode = positionals[0] || 'plan';
  if (!['plan', 'inspect', 'deploy'].includes(mode)) throw Error('Use plan, inspect or deploy.');
  const plan = deploymentPlan({
    captainUrl: values['captain-url'],
    image: values.image,
    nodeId: values['node-id'],
    memoryMiB: values['memory-mib'],
    heapMiB: values['heap-mib'],
    hostPath: values['host-path'],
  });
  if (mode === 'plan') {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  let token;
  async function api(method, path, body) {
    let response;
    try {
      response = await fetch(`${plan.captainUrl}/api/v2${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-namespace': 'captain',
          // CapRover reloads nginx after configuration mutations. Do not reuse a
          // pooled socket that the reload may have closed between API operations.
          Connection: 'close',
          ...(token ? { 'X-Captain-Auth': token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw Error(`CapRover request failed: ${method} ${path} (${safeTransportCode(error)}).`);
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error(`CapRover returned non-JSON HTTP ${response.status}.`);
    }
    if (!response.ok || ![100, 101, 102].includes(result.status)) {
      // Do not print arbitrary server descriptions, response bodies, headers or env arrays.
      throw Error(
        `CapRover rejected ${method} ${path}: HTTP ${response.status}, API status ${Number(result.status) || 'unknown'}.`,
      );
    }
    return result.data;
  }
  const login = await api('POST', '/login', await readCredential());
  if (typeof login?.token !== 'string' || !login.token)
    throw Error('Login returned no session token.');
  token = login.token;
  if (mode === 'inspect') {
    const data = await api('GET', '/user/apps/appDefinitions');
    console.log(
      JSON.stringify(
        summarizeApp(
          data.appDefinitions.find((app) => app.appName === APP),
          data.rootDomain,
        ),
        null,
        2,
      ),
    );
    return;
  }
  const result = await deployWorldNode(api, plan, {
    async waitForBuild({ baselineVersion }) {
      const deadline = Date.now() + 15 * 60_000;
      let observedBuild = false;
      while (Date.now() < deadline) {
        const status = await api('GET', `/user/apps/appData/${APP}`);
        const definitions = await api('GET', '/user/apps/appDefinitions');
        const app = definitions.appDefinitions.find((candidate) => candidate.appName === APP);
        const versions = app?.versions || [];
        observedBuild ||=
          status.isAppBuilding || versions.some(({ version }) => version > baselineVersion);
        if (observedBuild && !status.isAppBuilding && status.isBuildFailed)
          throw Error('CapRover build failed; inspect the app build logs privately.');
        // Detached work can be queued while isAppBuilding is still false. Only a newly
        // completed version with its actual image proves this deployment finished.
        if (
          !status.isAppBuilding &&
          app?.deployedVersion > baselineVersion &&
          versions.some(
            ({ version, deployedImageName }) =>
              version === app.deployedVersion && deployedImageName,
          )
        )
          return;
        await pause(2000);
      }
      throw Error('CapRover build has not completed within 15 minutes.');
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
