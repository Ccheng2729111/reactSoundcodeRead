/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import invariant from 'shared/invariant';
import lowPriorityWarning from 'shared/lowPriorityWarning';

import ReactNoopUpdateQueue from './ReactNoopUpdateQueue';

const emptyObject = {};
if (__DEV__) {
  Object.freeze(emptyObject);
}

/**
 * Base class helpers for the updating state of a component.
 */

//这里就是一个构造函数类 声明了属性props context 和调度更新的updater
function Component(props, context, updater) {
  //props context 是我们在自组件可以直接使用的
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.

  //先给refs赋值空对象
  this.refs = emptyObject;
  // We initialize the default updater but the real one gets injected by the
  // renderer.

  //这个updater其实是用来根据不同的平台来进行state更新的机制，可以是react也可以是react-native
  this.updater = updater || ReactNoopUpdateQueue;
}


Component.prototype.isReactComponent = {};

/**
 * Sets a subset of the state. Always use this to mutate
 * state. You should treat `this.state` as immutable.
 *
 * There is no guarantee that `this.state` will be immediately updated, so
 * accessing `this.state` after calling this method may return the old value.
 *
 * There is no guarantee that calls to `setState` will run synchronously,
 * as they may eventually be batched together.  You can provide an optional
 * callback that will be executed when the call to setState is actually
 * completed.
 *
 * When a function is provided to setState, it will be called at some point in
 * the future (not synchronously). It will be called with the up to date
 * component arguments (state, props, context). These values can be different
 * from this.* because your function may be called after receiveProps but before
 * shouldComponentUpdate, and this new state, props, and context will not yet be
 * assigned to this.
 *
 * @param {object|function} partialState Next partial state or function to
 *        produce next partial state to be merged with current state.
 * @param {?function} callback Called after state is updated.
 * @final
 * @protected
 */
//最常用的Componet.setState方法 接受两个参数 一个是变化的state 一个是callback
Component.prototype.setState = function (partialState, callback) {
  //partialState可以是一个object {value:1}也可以是一个function 通过返回值来获取
  invariant(
    typeof partialState === 'object' ||
    typeof partialState === 'function' ||
    partialState == null,
    'setState(...): takes an object of state variables to update or a ' +
    'function which returns an object of state variables.',
  );
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};

/**
 * Forces an update. This should only be invoked when it is known with
 * certainty that we are **not** in a DOM transaction.
 *
 * You may want to call this when you know that some deeper aspect of the
 * component's state has changed but `setState` was not called.
 *
 * This will not invoke `shouldComponentUpdate`, but it will invoke
 * `componentWillUpdate` and `componentDidUpdate`.
 *
 * @param {?function} callback Called after update is complete.
 * @final
 * @protected
 */

//forceUpdate可以用来强制更新这个Component 哪怕state没有发生变化
Component.prototype.forceUpdate = function (callback) {
  this.updater.enqueueForceUpdate(this, callback, 'forceUpdate');
};

/**
 * Deprecated APIs. These APIs used to exist on classic React classes but since
 * we would like to deprecate them, we're not going to move them over to this
 * modern base class. Instead, we define a getter that warns if it's accessed.
 */
if (__DEV__) {
  const deprecatedAPIs = {
    isMounted: [
      'isMounted',
      'Instead, make sure to clean up subscriptions and pending requests in ' +
      'componentWillUnmount to prevent memory leaks.',
    ],
    replaceState: [
      'replaceState',
      'Refactor your code to use setState instead (see ' +
      'https://github.com/facebook/react/issues/3236).',
    ],
  };
  const defineDeprecationWarning = function (methodName, info) {
    Object.defineProperty(Component.prototype, methodName, {
      get: function () {
        lowPriorityWarning(
          false,
          '%s(...) is deprecated in plain JavaScript React classes. %s',
          info[0],
          info[1],
        );
        return undefined;
      },
    });
  };
  for (const fnName in deprecatedAPIs) {
    if (deprecatedAPIs.hasOwnProperty(fnName)) {
      defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
    }
  }
}

function ComponentDummy() { }
//创建一个新的方法 并且内部的prototype指向的是Component
ComponentDummy.prototype = Component.prototype;

/**
 * Convenience component with default shallow equality check for sCU.
 */
function PureComponent(props, context, updater) {
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}

//这里其实就是一个继承了Component。只不过通过了一个中介ComponentDummy
const pureComponentPrototype = (PureComponent.prototype = new ComponentDummy());
//继承之后 子类的原型对象中的构造器指向自己
pureComponentPrototype.constructor = PureComponent;
// Avoid an extra prototype jump for these methods.
//进行一层浅拷贝
Object.assign(pureComponentPrototype, Component.prototype);
//然后只需要在pureComponent的prototype中增加一个标识符 表明是pureComponent就行
pureComponentPrototype.isPureReactComponent = true;

export { Component, PureComponent };
