/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type { Fiber } from './ReactFiber';
import type { FiberRoot } from './ReactFiberRoot';
import type {
  Instance,
    TextInstance,
    Container,
    PublicInstance,
} from './ReactFiberHostConfig';
import type { ReactNodeList } from 'shared/ReactTypes';
import type { ExpirationTime } from './ReactFiberExpirationTime';

import {
  findCurrentHostFiber,
  findCurrentHostFiberWithNoPortals,
} from 'react-reconciler/reflection';
import { get as getInstance } from 'shared/ReactInstanceMap';
import { HostComponent, ClassComponent } from 'shared/ReactWorkTags';
import getComponentName from 'shared/getComponentName';
import invariant from 'shared/invariant';
import warningWithoutStack from 'shared/warningWithoutStack';
import ReactSharedInternals from 'shared/ReactSharedInternals';

import { getPublicInstance } from './ReactFiberHostConfig';
import {
  findCurrentUnmaskedContext,
  processChildContext,
  emptyContextObject,
  isContextProvider as isLegacyContextProvider,
} from './ReactFiberContext';
import { createFiberRoot } from './ReactFiberRoot';
import { injectInternals } from './ReactFiberDevToolsHook';
import {
  computeUniqueAsyncExpiration,
  requestCurrentTime,
  computeExpirationForFiber,
  scheduleWork,
  requestWork,
  flushRoot,
  batchedUpdates,
  unbatchedUpdates,
  flushSync,
  flushControlled,
  deferredUpdates,
  syncUpdates,
  interactiveUpdates,
  flushInteractiveUpdates,
  flushPassiveEffects,
} from './ReactFiberScheduler';
import { createUpdate, enqueueUpdate } from './ReactUpdateQueue';
import ReactFiberInstrumentation from './ReactFiberInstrumentation';
import {
  getStackByFiberInDevAndProd,
  phase as ReactCurrentFiberPhase,
  current as ReactCurrentFiberCurrent,
} from './ReactCurrentFiber';
import { StrictMode } from './ReactTypeOfMode';
import { Sync } from './ReactFiberExpirationTime';

type OpaqueRoot = FiberRoot;

// 0 is PROD, 1 is DEV.
// Might add PROFILE later.
type BundleType = 0 | 1;

type DevToolsConfig = {|
  bundleType: BundleType,
    version: string,
      rendererPackageName: string,
        // Note: this actually *does* depend on Fiber internal fields.
        // Used by "inspect clicked DOM element" in React DevTools.
        findFiberByHostInstance ?: (instance: Instance | TextInstance) => Fiber,
        // Used by RN in-app inspector.
        // This API is unfortunately RN-specific.
        // TODO: Change it to accept Fiber instead and type it properly.
        getInspectorDataForViewTag ?: (tag: number) => Object,
|};

let didWarnAboutNestedUpdates;
let didWarnAboutFindNodeInStrictMode;

if (__DEV__) {
  didWarnAboutNestedUpdates = false;
  didWarnAboutFindNodeInStrictMode = {};
}

function getContextForSubtree(
  parentComponent: ?React$Component<any, any>,
): Object {
  if (!parentComponent) {
    return emptyContextObject;
  }

  const fiber = getInstance(parentComponent);
  const parentContext = findCurrentUnmaskedContext(fiber);

  if (fiber.tag === ClassComponent) {
    const Component = fiber.type;
    if (isLegacyContextProvider(Component)) {
      return processChildContext(fiber, Component, parentContext);
    }
  }

  return parentContext;
}

function scheduleRootUpdate(
  current: Fiber,
  element: ReactNodeList,
  expirationTime: ExpirationTime,
  callback: ?Function,
) {
  if (__DEV__) {
    if (
      ReactCurrentFiberPhase === 'render' &&
      ReactCurrentFiberCurrent !== null &&
      !didWarnAboutNestedUpdates
    ) {
      didWarnAboutNestedUpdates = true;
      warningWithoutStack(
        false,
        'Render methods should be a pure function of props and state; ' +
        'triggering nested component updates from render is not allowed. ' +
        'If necessary, trigger nested updates in componentDidUpdate.\n\n' +
        'Check the render method of %s.',
        getComponentName(ReactCurrentFiberCurrent.type) || 'Unknown',
      );
    }
  }
  //update 调度的地方
  const update = createUpdate(expirationTime);
  // Caution: React DevTools currently depends on this property
  // being called "element".

  //获取render传入的node节点 || setState传入的第一个参数 一个对象或者是一个function
  update.payload = { element };

  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    warningWithoutStack(
      typeof callback === 'function',
      'render(...): Expected the last optional `callback` argument to be a ' +
      'function. Instead received: %s.',
      callback,
    );
    update.callback = callback;
  }

  flushPassiveEffects();

  //利用队列进行更新，一个节点可能有多次更新
  //current当前的fiber
  //update创建的update对象
  enqueueUpdate(current, update);

  //通知react进行调度 新的调度机制 有多个不同级的优先级的任务，需要通知哪些先调用 哪些后调用
  scheduleWork(current, expirationTime);

  return expirationTime;
}

export function updateContainerAtExpirationTime(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,  //null
  expirationTime: ExpirationTime,
  callback: ?Function,
) {
  // TODO: If this is a nested container, this won't be the root.
  const current = container.current;

  if (__DEV__) {
    if (ReactFiberInstrumentation.debugTool) {
      if (current.alternate === null) {
        ReactFiberInstrumentation.debugTool.onMountContainer(container);
      } else if (element === null) {
        ReactFiberInstrumentation.debugTool.onUnmountContainer(container);
      } else {
        ReactFiberInstrumentation.debugTool.onUpdateContainer(container);
      }
    }
  }

  const context = getContextForSubtree(parentComponent);
  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

  return scheduleRootUpdate(current, element, expirationTime, callback);
}

function findHostInstance(component: Object): PublicInstance | null {
  const fiber = getInstance(component);
  if (fiber === undefined) {
    if (typeof component.render === 'function') {
      invariant(false, 'Unable to find node on an unmounted component.');
    } else {
      invariant(
        false,
        'Argument appears to not be a ReactComponent. Keys: %s',
        Object.keys(component),
      );
    }
  }
  const hostFiber = findCurrentHostFiber(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

function findHostInstanceWithWarning(
  component: Object,
  methodName: string,
): PublicInstance | null {
  if (__DEV__) {
    const fiber = getInstance(component);
    if (fiber === undefined) {
      if (typeof component.render === 'function') {
        invariant(false, 'Unable to find node on an unmounted component.');
      } else {
        invariant(
          false,
          'Argument appears to not be a ReactComponent. Keys: %s',
          Object.keys(component),
        );
      }
    }
    const hostFiber = findCurrentHostFiber(fiber);
    if (hostFiber === null) {
      return null;
    }
    if (hostFiber.mode & StrictMode) {
      const componentName = getComponentName(fiber.type) || 'Component';
      if (!didWarnAboutFindNodeInStrictMode[componentName]) {
        didWarnAboutFindNodeInStrictMode[componentName] = true;
        if (fiber.mode & StrictMode) {
          warningWithoutStack(
            false,
            '%s is deprecated in StrictMode. ' +
            '%s was passed an instance of %s which is inside StrictMode. ' +
            'Instead, add a ref directly to the element you want to reference.' +
            '\n%s' +
            '\n\nLearn more about using refs safely here:' +
            '\nhttps://fb.me/react-strict-mode-find-node',
            methodName,
            methodName,
            componentName,
            getStackByFiberInDevAndProd(hostFiber),
          );
        } else {
          warningWithoutStack(
            false,
            '%s is deprecated in StrictMode. ' +
            '%s was passed an instance of %s which renders StrictMode children. ' +
            'Instead, add a ref directly to the element you want to reference.' +
            '\n%s' +
            '\n\nLearn more about using refs safely here:' +
            '\nhttps://fb.me/react-strict-mode-find-node',
            methodName,
            methodName,
            componentName,
            getStackByFiberInDevAndProd(hostFiber),
          );
        }
      }
    }
    return hostFiber.stateNode;
  }
  return findHostInstance(component);
}

export function createContainer(
  containerInfo: Container,   //ReactRoot内部传过来的是操作过后的element节点
  isConcurrent: boolean,      //false
  hydrate: boolean,           //false
): OpaqueRoot {
  return createFiberRoot(containerInfo, isConcurrent, hydrate);
}

export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): ExpirationTime {
  //container.current就是我们的当前的这个fiber对象
  const current = container.current;
  const currentTime = requestCurrentTime();

  //利用新的fiber的调度机制计算出单个调度时间
  //conca
  const expirationTime = computeExpirationForFiber(currentTime, current);
  return updateContainerAtExpirationTime(
    element,
    container,
    parentComponent,  //null
    expirationTime,
    callback,
  );
}

export {
  flushRoot,
  requestWork,
  computeUniqueAsyncExpiration,
  batchedUpdates,
  unbatchedUpdates,
  deferredUpdates,
  syncUpdates,
  interactiveUpdates,
  flushInteractiveUpdates,
  flushControlled,
  flushSync,
};

export function getPublicRootInstance(
  container: OpaqueRoot,
): React$Component<any, any> | PublicInstance | null {
  const containerFiber = container.current;
  if (!containerFiber.child) {
    return null;
  }
  switch (containerFiber.child.tag) {
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);
    default:
      return containerFiber.child.stateNode;
  }
}

export { findHostInstance };

export { findHostInstanceWithWarning };

export function findHostInstanceWithNoPortals(
  fiber: Fiber,
): PublicInstance | null {
  const hostFiber = findCurrentHostFiberWithNoPortals(fiber);
  if (hostFiber === null) {
    return null;
  }
  return hostFiber.stateNode;
}

let overrideProps = null;

if (__DEV__) {
  const copyWithSetImpl = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    idx: number,
    value: any,
  ) => {
    if (idx >= path.length) {
      return value;
    }
    const key = path[idx];
    const updated = Array.isArray(obj) ? obj.slice() : { ...obj };
    // $FlowFixMe number or string is fine here
    updated[key] = copyWithSetImpl(obj[key], path, idx + 1, value);
    return updated;
  };

  const copyWithSet = (
    obj: Object | Array<any>,
    path: Array<string | number>,
    value: any,
  ): Object | Array<any> => {
    return copyWithSetImpl(obj, path, 0, value);
  };

  // Support DevTools props for function components, forwardRef, memo, host components, etc.
  overrideProps = (fiber: Fiber, path: Array<string | number>, value: any) => {
    flushPassiveEffects();
    fiber.pendingProps = copyWithSet(fiber.memoizedProps, path, value);
    if (fiber.alternate) {
      fiber.alternate.pendingProps = fiber.pendingProps;
    }
    scheduleWork(fiber, Sync);
  };
}

export function injectIntoDevTools(devToolsConfig: DevToolsConfig): boolean {
  const { findFiberByHostInstance } = devToolsConfig;
  const { ReactCurrentDispatcher } = ReactSharedInternals;

  return injectInternals({
    ...devToolsConfig,
    overrideProps,
    currentDispatcherRef: ReactCurrentDispatcher,
    findHostInstanceByFiber(fiber: Fiber): Instance | TextInstance | null {
      const hostFiber = findCurrentHostFiber(fiber);
      if (hostFiber === null) {
        return null;
      }
      return hostFiber.stateNode;
    },
    findFiberByHostInstance(instance: Instance | TextInstance): Fiber | null {
      if (!findFiberByHostInstance) {
        // Might not be implemented by the renderer.
        return null;
      }
      return findFiberByHostInstance(instance);
    },
  });
}
