import { isEnableTTDom } from '@tarojs/shared';
import { options } from '../../options.js';
import { parser } from './parser.js';

options.html = {
    skipElements: new Set(['style', 'script']),
    voidElements: new Set([
        '!doctype', 'area', 'base', 'br', 'col', 'command',
        'embed', 'hr', 'img', 'input', 'keygen', 'link',
        'meta', 'param', 'source', 'track', 'wbr'
    ]),
    closingElements: new Set([
        'html', 'head', 'body', 'p', 'dt', 'dd', 'li', 'option',
        'thead', 'th', 'tbody', 'tr', 'td', 'tfoot', 'colgroup'
    ]),
    renderHTMLTag: false
};
function setInnerHTML(element, html) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
    let { ownerDocument } = element;
    if (process.env.TARO_ENV === 'tt' && isEnableTTDom()) {
        if ('appDocument' in tt) {
            ownerDocument = tt.appDocument;
        }
    }
    const children = parser(html, ownerDocument);
    for (let i = 0; i < children.length; i++) {
        element.appendChild(children[i]);
    }
}

export { setInnerHTML };
//# sourceMappingURL=html.js.map
