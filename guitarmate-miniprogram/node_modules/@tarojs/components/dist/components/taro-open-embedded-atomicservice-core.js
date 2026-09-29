import { proxyCustomElement, HTMLElement, h, Host } from '@stencil/core/internal/client';
import { n as notSupport } from './helper.js';

const OpenEmbeddedAtomicservice = /*@__PURE__*/ proxyCustomElement(class extends HTMLElement {
  constructor() {
    super();
    this.__registerHost();
  }
  componentDidLoad() {
    notSupport('OpenEmbeddedAtomicservice', this);
  }
  render() {
    return (h(Host, null));
  }
}, [0, "taro-open-embedded-atomicservice-core"]);
function defineCustomElement$1() {
  if (typeof customElements === "undefined") {
    return;
  }
  const components = ["taro-open-embedded-atomicservice-core"];
  components.forEach(tagName => { switch (tagName) {
    case "taro-open-embedded-atomicservice-core":
      if (!customElements.get(tagName)) {
        customElements.define(tagName, OpenEmbeddedAtomicservice);
      }
      break;
  } });
}

const TaroOpenEmbeddedAtomicserviceCore = OpenEmbeddedAtomicservice;
const defineCustomElement = defineCustomElement$1;

export { OpenEmbeddedAtomicservice as O, TaroOpenEmbeddedAtomicserviceCore, defineCustomElement };
