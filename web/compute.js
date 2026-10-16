export async function openEngine(investigation, onProgress = () => {}) {
  const model = {
    identity: investigation.identity,
    source: investigation.source,
    stations: investigation.stations.map(({id, code, position, observedPick}) => ({id, code, position, observedPick})),
    challenge: investigation.challenge,
  };
  let worker;
  let disposed = false;
  let ready = false;
  let nextId = 0;
  let completed = 0;
  let cancelled = 0;
  let boot;
  const pending = new Map();
  const abortError = () => new DOMException('Calculation cancelled.', 'AbortError');
  function rejectAll(error) {
    ready = false;
    for (const item of pending.values()) {
      clearTimeout(item.timeout);
      item.cleanup();
      item.reject(error);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
    boot = null;
  }
  function send(type, payload, {signal, onProgress: progress = () => {}} = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const cancel = () => {
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id);
        cancelled++;
        clearTimeout(item.timeout);
        item.cleanup();
        worker?.postMessage({type: 'cancel', id});
        reject(abortError());
      };
      signal?.addEventListener('abort', cancel, {once: true});
      const timeout = setTimeout(() => rejectAll(new Error('Calculation timed out. Retry to start a fresh worker.')), 45000);
      pending.set(id, {resolve, reject, progress, timeout, cleanup: () => signal?.removeEventListener('abort', cancel)});
      worker.postMessage({id, type, payload});
    });
  }
  async function start() {
    if (disposed) throw new Error('Calculation engine has been disposed.');
    if (ready) return;
    if (!boot) {
      worker = new Worker(new URL('./compute-worker.js', import.meta.url), {type: 'module', name: 'taup-numerics'});
      worker.onmessage = ({data}) => {
        const item = pending.get(data.id);
        if (!item) return;
        if (data.type === 'progress') {
          item.progress(data.progress);
          return;
        }
        pending.delete(data.id);
        clearTimeout(item.timeout);
        item.cleanup();
        if (data.type === 'error') {
          const error = new Error(data.error.message);
          error.name = data.error.name;
          item.reject(error);
        } else {
          completed++;
          item.resolve(data.result);
        }
      };
      worker.onerror = event => { event.preventDefault(); rejectAll(new Error(event.message || 'Numerical worker failed. Retry to restart.')); };
      worker.onmessageerror = () => rejectAll(new Error('Numerical worker returned an unreadable result. Retry to restart.'));
      boot = send('initialize', model, {onProgress}).then(() => { ready = true; }).catch(error => { rejectAll(error); throw error; });
    }
    await boot;
  }
  await start();
  return Object.freeze({
    async evaluate(request, options = {}) {
      await start();
      return send('evaluate', request, options);
    },
    async locate(stationIds, options = {}) {
      await start();
      return send('locate', stationIds, options);
    },
    async wavefronts(depthKm, options = {}) {
      await start();
      return send('wavefronts', depthKm, options);
    },
    async travelTimes(depthKm, options = {}) {
      await start();
      return send('travelTimes', depthKm, options);
    },
    get stats() { return Object.freeze({ready, pending: pending.size, completed, cancelled}); },
    dispose() {
      disposed = true;
      rejectAll(new Error('Calculation engine disposed.'));
    },
  });
}
