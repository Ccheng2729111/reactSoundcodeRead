/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { LazyComponent, Thenable } from 'shared/ReactLazyComponent';

import { REACT_LAZY_TYPE } from 'shared/ReactSymbols';
import warning from 'shared/warning';

//const lazyCom = React.lazy(()=><p>lazy Component</p>)
//lazy接受一个function component
export function lazy<T, R>(ctor: () => Thenable<T, R>): LazyComponent<T> {
  //这里定义一个lazyType 并且内部定义一个$$typeof 标识符
  //同时定义状态和结果 有点像promise
  //ctor是我们传入的这个参数
  //初始状态status = -1 代表pedding状态
  //result 在status是resolve状态的时候 赋值 将传入的组件直接给result
  let lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _ctor: ctor,
    // React uses these fields to store the result.
    _status: -1,
    _result: null,
  };

  if (__DEV__) {
    // In production, this would just set it on the object.
    let defaultProps;
    let propTypes;
    //用defineProperties进行一个数据拦截
    Object.defineProperties(lazyType, {
      defaultProps: {
        //可以配置
        configurable: true,
        get() {
          return defaultProps;
        },
        set(newDefaultProps) {
          warning(
            false,
            'React.lazy(...): It is not supported to assign `defaultProps` to ' +
            'a lazy component import. Either specify them where the component ' +
            'is defined, or create a wrapping component around it.',
          );
          defaultProps = newDefaultProps;
          // Match production behavior more closely:
          Object.defineProperty(lazyType, 'defaultProps', {
            //可枚举
            enumerable: true,
          });
        },
      },
      propTypes: {
        configurable: true,
        get() {
          return propTypes;
        },
        set(newPropTypes) {
          warning(
            false,
            'React.lazy(...): It is not supported to assign `propTypes` to ' +
            'a lazy component import. Either specify them where the component ' +
            'is defined, or create a wrapping component around it.',
          );
          propTypes = newPropTypes;
          // Match production behavior more closely:
          Object.defineProperty(lazyType, 'propTypes', {
            enumerable: true,
          });
        },
      },
    });
  }

  return lazyType;
}
