/** 主进程侧：Vite `?raw` 导入的类型声明（schema.sql 内联） */
declare module '*?raw' {
  const content: string
  export default content
}
