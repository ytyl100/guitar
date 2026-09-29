/**
 * 静态资源模块声明
 * -----------------
 * 小程序端会 `import img from '../../assets/xxx.jpg'` 并把结果交给 `<Image src>`，
 * webpack 的 asset 处理会把它变成资源路径；这里补上 TS 的模块声明，
 * 否则 `tsc --noEmit` 会报 "Cannot find module '...jpg'"。
 */
declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
