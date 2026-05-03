export interface PropagatedAbort {
  signal: AbortSignal;
  dispose: () => void;
}

export function propagateAbort(parentSignal?: AbortSignal): PropagatedAbort {
  const controller = new AbortController();

  if (!parentSignal) {
    return { signal: controller.signal, dispose: () => undefined };
  }

  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
    return { signal: controller.signal, dispose: () => undefined };
  }

  const onAbort = () => {
    controller.abort(parentSignal.reason);
  };

  parentSignal.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      parentSignal.removeEventListener('abort', onAbort);
    },
  };
}
