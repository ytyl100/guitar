import { h, Host } from '@stencil/core';
import { notSupport } from '../../utils';
export class OpenEmbeddedAtomicservice {
  componentDidLoad() {
    notSupport('OpenEmbeddedAtomicservice', this);
  }
  render() {
    return (h(Host, null));
  }
  static get is() { return "taro-open-embedded-atomicservice-core"; }
}
