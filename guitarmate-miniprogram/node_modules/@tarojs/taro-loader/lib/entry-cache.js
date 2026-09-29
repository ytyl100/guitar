"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entryCache = void 0;
exports.entryCache = new Map();
function default_1() {
    const callback = this.async();
    const { name } = this.getOptions();
    if (name && exports.entryCache.has(name)) {
        const content = exports.entryCache.get(name);
        // just in case, delete cache in next tick
        setImmediate(() => exports.entryCache.delete(name));
        callback(null, content.source, content.map);
    }
    else {
        // 当 webpack 持久化缓存命中时，entryCache 为空，需要兜底返回空字符串
        callback(null, '');
    }
}
exports.default = default_1;
//# sourceMappingURL=entry-cache.js.map